"""literature_watch_cron.py — nightly worker for the Live Literature Watch.

Reads PROTOCOL_LIBRARY + CONDITIONS + DEVICES from apps/web/src/protocols-data.js,
runs a PubMed search per protocol (modality longname AND condition longname,
restricted to the last N days), and inserts any previously unseen (protocol_id,
pmid) rows into literature_watch with verdict='pending', source='pubmed'.

A one-shot `refresh_jobs` row is written per protocol with source='pubmed_cron'
and cost_usd=0 for observability.

After the sweep completes, `export_snapshot()` writes
apps/web/public/literature-watch.json so the static front-end can render
"N new papers" badges and the cross-protocol Needs-Review queue without a
backend service. Pass `--export-only` to run the snapshot in isolation.

Usage:
    python literature_watch_cron.py                 # full sweep + export
    python literature_watch_cron.py --dry-run       # fetch + dedupe, no inserts
    python literature_watch_cron.py --limit 5       # only first N protocols
    python literature_watch_cron.py --days 7        # override lookback window
    python literature_watch_cron.py --export-only   # just regenerate JSON

Env: PUBMED_API_KEY, PUBMED_EMAIL (or NCBI_API_KEY fallback).
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sqlite3
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
PROTOCOLS_JS = REPO / "apps" / "web" / "src" / "protocols-data.js"
SNAPSHOT_PATH = REPO / "apps" / "web" / "public" / "literature-watch.json"
DB_PATH = Path(
    os.environ.get("EVIDENCE_DB_PATH")
    or os.environ.get("DEEPSYNAPS_DB")
    or (HERE / "evidence.db")
)

# Ensure local imports work whether invoked via launchd (cwd=/) or CLI.
sys.path.insert(0, str(HERE))
from pubmed_client import PubMedClient  # noqa: E402


def setup_logging() -> logging.Logger:
    log = logging.getLogger("lit_watch_cron")
    if log.handlers:
        return log
    log.setLevel(logging.INFO)
    h = logging.StreamHandler(sys.stdout)
    h.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    log.addHandler(h)
    return log


def load_protocol_library(log: logging.Logger) -> dict:
    """Shell out to `node -e` to dump PROTOCOL_LIBRARY + CONDITIONS + DEVICES as JSON.

    Pure-Python parsing of the JS file is brittle (template strings, unicode icons,
    function exports). Node is already required to run the app, so depending on it
    here is cheap and robust.
    """
    if not PROTOCOLS_JS.exists():
        raise FileNotFoundError(f"protocols-data.js not found at {PROTOCOLS_JS}")
    script = (
        "const m = require(process.argv[1]);"
        "process.stdout.write(JSON.stringify({"
        "conditions:m.CONDITIONS,"
        "devices:m.DEVICES,"
        "protocols:m.PROTOCOL_LIBRARY"
        "}));"
    )
    try:
        out = subprocess.check_output(
            ["node", "-e", script, str(PROTOCOLS_JS)],
            stderr=subprocess.PIPE,
            timeout=30,
        )
    except subprocess.CalledProcessError as e:
        log.error("node extraction failed: %s", e.stderr.decode("utf-8", "replace"))
        raise
    return json.loads(out)


def _clean_label(raw: str) -> str:
    """Strip icon separators and parenthetical qualifiers from a label string."""
    return raw.split(" / ")[0].split(" – ")[0].strip()


# Anatomical regions worth including as a third AND term because they are
# specific enough to discriminate protocols. Generic phrases (e.g. "Bilateral
# earlobes") would over-constrain the query and kill recall.
_SPECIFIC_TARGETS = {
    "DLPFC", "mPFC", "dmPFC", "vmPFC", "OFC",
    "ACC", "dACC", "sgACC", "cingulate",
    "VMPFC", "SMA", "M1", "S1",
    "insula", "amygdala", "hippocampus",
    "OFC", "PFC", "premotor",
}


def _extract_target_keyword(target_str: str | None) -> str | None:
    """Return a short anatomical keyword suitable for a PubMed AND clause, or None.

    We tokenise the target string and return the first token that matches a
    known specific region abbreviation/name.  Parenthetical coil/electrode
    labels and side qualifiers (Left/Right/Bilateral) are stripped first.
    """
    if not target_str:
        return None
    import re
    # Drop parenthetical substrings e.g. "(F3)", "(H1 coil)"
    cleaned = re.sub(r"\(.*?\)", "", target_str)
    tokens = re.split(r"[\s/,–-]+", cleaned)
    for tok in tokens:
        tok = tok.strip().rstrip("s")  # crude plural strip
        if tok in _SPECIFIC_TARGETS:
            return tok
    return None


def _clean_subtype(subtype: str | None) -> str | None:
    """Return a clean PubMed search term from a protocol subtype string.

    Examples:
        "HF-rTMS (10Hz)"  -> "HF-rTMS"   (keep acronym, drop parenthetical)
        "iTBS"            -> "iTBS"
        "Deep TMS (H-coil)" -> "Deep TMS"
        "Anodal"          -> None          (too generic, not discriminating)
        "Alpha-Stim"      -> "Alpha-Stim"
    """
    if not subtype:
        return None
    import re
    # Drop parenthetical qualifiers.
    cleaned = re.sub(r"\s*\(.*?\)", "", subtype).strip()
    # Reject single generic words that don't help narrow PubMed results.
    _generic = {"anodal", "cathodal", "bilateral", "standard", "low", "high", "slow"}
    if cleaned.lower() in _generic:
        return None
    return cleaned or None


def build_query(protocol: dict, conditions_by_id: dict, devices_by_id: dict) -> str | None:
    """Return the PubMed query string for one protocol, or None if unmappable.

    Query shape (v1.1):
      "{subtype OR device_label}" AND "{condition_label}" [AND "{target}"]

    - If the protocol has a discriminating subtype (e.g. "iTBS", "HF-rTMS"),
      use it as the primary modality term instead of the coarse device label.
      This prevents all TMS protocols from sharing the same hits.
    - Append a specific anatomical target keyword when available (e.g. "DLPFC")
      to further separate protocols that share subtype but differ in target.
    - Fall back to the device label alone for protocols without a useful subtype.
    """
    cond = conditions_by_id.get(protocol.get("conditionId"))
    dev = devices_by_id.get(protocol.get("device"))
    if not cond or not dev:
        return None

    device_label = _clean_label(dev.get("label") or "")
    condition_label = _clean_label(cond.get("label") or "")
    if not device_label or not condition_label:
        return None

    subtype_term = _clean_subtype(protocol.get("subtype"))
    target_kw = _extract_target_keyword(protocol.get("target"))

    # Primary modality term: prefer subtype for precision, fall back to device.
    modality_term = subtype_term if subtype_term else device_label

    parts = [f'"{modality_term}"', f'"{condition_label}"']
    if target_kw:
        parts.append(f'"{target_kw}"')

    return " AND ".join(parts)


def already_seen_pmids(conn: sqlite3.Connection, protocol_id: str) -> set[str]:
    rows = conn.execute(
        "SELECT pmid FROM literature_watch WHERE protocol_id=? AND pmid IS NOT NULL",
        (protocol_id,),
    ).fetchall()
    return {r[0] for r in rows}


def insert_paper(conn: sqlite3.Connection, protocol_id: str, rec: dict) -> bool:
    """Insert one literature_watch row. Returns True if a new row was inserted."""
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    try:
        conn.execute(
            """
            INSERT INTO literature_watch
                (protocol_id, pmid, doi, title, authors, year, journal,
                 citation_count, source, first_seen_at, verdict)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'pubmed', ?, 'pending')
            """,
            (
                protocol_id,
                rec.get("pmid"),
                rec.get("doi"),
                rec.get("title"),
                json.dumps(rec.get("authors") or [], ensure_ascii=False),
                rec.get("year"),
                rec.get("journal"),
                now,
            ),
        )
        return True
    except sqlite3.IntegrityError:
        # UNIQUE(protocol_id, pmid) violation. Race-safe fallback.
        return False


def log_job(
    conn: sqlite3.Connection,
    protocol_id: str,
    requested_by: str,
    started_at: str,
    finished_at: str,
    new_papers_count: int,
    status: str,
) -> None:
    conn.execute(
        """
        INSERT INTO refresh_jobs
            (protocol_id, requested_by, source, started_at, finished_at,
             new_papers_count, cost_usd, status)
        VALUES (?, ?, 'pubmed_cron', ?, ?, ?, 0, ?)
        """,
        (protocol_id, requested_by, started_at, finished_at, new_papers_count, status),
    )


def _author_summary(authors_json: str | None) -> str:
    """Render the authors JSON column as a short string ("A, B, C et al")."""
    if not authors_json:
        return ""
    try:
        arr = json.loads(authors_json)
    except (TypeError, ValueError):
        return ""
    if not isinstance(arr, list):
        return ""
    arr = [str(a) for a in arr if a]
    if not arr:
        return ""
    if len(arr) <= 3:
        return ", ".join(arr)
    return ", ".join(arr[:3]) + " et al"


def export_snapshot(
    db_path: Path = DB_PATH,
    snapshot_path: Path = SNAPSHOT_PATH,
    log: logging.Logger | None = None,
    pending_cap: int = 200,
) -> dict:
    """Write the static literature-watch.json read by the front-end.

    Shape (see SPEC §6 + the front-end consumer in pages-clinical-hubs.js):
      {
        generated_at,
        by_protocol: { <protocol_id>: { new_count_30d, pending_count,
                                        last_seen, top_papers: [...up to 5] } },
        pending_queue: [ { pmid, title, authors, year, journal,
                           protocol_ids: [...], first_seen_at } ]   # dedup by PMID
      }

    Returns a small stats dict (counts) for caller logging / verification.
    """
    log = log or setup_logging()
    if not db_path.exists():
        raise FileNotFoundError(f"evidence db not found at {db_path}")

    snapshot_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path, timeout=30)
    conn.row_factory = sqlite3.Row
    try:
        # ── by_protocol ────────────────────────────────────────────────────
        # 30-day window is computed in SQL against first_seen_at to stay
        # consistent with the cron's own --days lookback.
        per_protocol_rows = conn.execute(
            """
            SELECT protocol_id,
                   COUNT(*) FILTER (WHERE verdict = 'pending')                                AS pending_count,
                   COUNT(*) FILTER (WHERE first_seen_at >= datetime('now','-30 days'))        AS new_count_30d,
                   MAX(date(first_seen_at))                                                    AS last_seen
              FROM literature_watch
             GROUP BY protocol_id
            """
        ).fetchall()

        by_protocol: dict = {}
        for r in per_protocol_rows:
            pid = r["protocol_id"]
            top = conn.execute(
                """
                SELECT pmid, title, journal, year, first_seen_at
                  FROM literature_watch
                 WHERE protocol_id = ?
                 ORDER BY first_seen_at DESC
                 LIMIT 5
                """,
                (pid,),
            ).fetchall()
            by_protocol[pid] = {
                "new_count_30d": int(r["new_count_30d"] or 0),
                "pending_count": int(r["pending_count"] or 0),
                "last_seen": r["last_seen"],
                "top_papers": [
                    {
                        "pmid": t["pmid"],
                        "title": t["title"],
                        "journal": t["journal"],
                        "year": t["year"],
                        "first_seen_at": t["first_seen_at"],
                    }
                    for t in top
                ],
            }

        # ── pending_queue (deduped by PMID across protocols) ───────────────
        # Spec §10 risk: Apify/Scholar can surface the same PMID under
        # multiple protocols. Collapse to one row, with `protocol_ids` as
        # an array, and sort by first_seen_at DESC.
        pending_rows = conn.execute(
            """
            SELECT pmid, title, authors, year, journal, protocol_id, first_seen_at
              FROM literature_watch
             WHERE verdict = 'pending' AND pmid IS NOT NULL
             ORDER BY first_seen_at DESC
            """
        ).fetchall()

        bucket: dict[str, dict] = {}
        order: list[str] = []
        for row in pending_rows:
            pmid = row["pmid"]
            if pmid in bucket:
                # Append protocol id, keep earliest sighting in `first_seen_at`
                # by virtue of the DESC sort: existing entry is newer, so use
                # its first_seen_at as-is.
                if row["protocol_id"] not in bucket[pmid]["protocol_ids"]:
                    bucket[pmid]["protocol_ids"].append(row["protocol_id"])
                continue
            bucket[pmid] = {
                "pmid": pmid,
                "title": row["title"],
                "authors": _author_summary(row["authors"]),
                "year": row["year"],
                "journal": row["journal"],
                "protocol_ids": [row["protocol_id"]],
                "first_seen_at": row["first_seen_at"],
            }
            order.append(pmid)

        pending_queue = [bucket[p] for p in order[:pending_cap]]

        snapshot = {
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "by_protocol": by_protocol,
            "pending_queue": pending_queue,
        }

        # Atomic write: temp file + replace, so a partial dump never poisons
        # a live front-end fetch.
        tmp = snapshot_path.with_suffix(snapshot_path.suffix + ".tmp")
        tmp.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(snapshot_path)

        size = snapshot_path.stat().st_size
        log.info(
            "snapshot exported path=%s size=%d protocols=%d pending_queue=%d",
            snapshot_path, size, len(by_protocol), len(pending_queue),
        )
        return {
            "path": str(snapshot_path),
            "size_bytes": size,
            "protocol_count": len(by_protocol),
            "pending_queue_length": len(pending_queue),
        }
    finally:
        conn.close()


def run(args: argparse.Namespace) -> int:
    log = setup_logging()
    log.info("literature_watch_cron start db=%s dry_run=%s days=%d limit=%s",
             DB_PATH, args.dry_run, args.days, args.limit)

    # Load protocol library
    try:
        lib = load_protocol_library(log)
    except Exception as e:  # noqa: BLE001
        log.error("failed to load protocol library: %s", e)
        return 1

    conditions_by_id = {c["id"]: c for c in lib["conditions"]}
    devices_by_id = {d["id"]: d for d in lib["devices"]}
    protocols = lib["protocols"]
    if args.limit:
        protocols = protocols[: args.limit]
    log.info("loaded %d protocols, %d conditions, %d devices",
             len(protocols), len(conditions_by_id), len(devices_by_id))

    # DB
    conn = sqlite3.connect(DB_PATH, isolation_level=None, timeout=30)
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")

    # Verify target tables exist (fail loud, don't silently insert nowhere).
    tables = {r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    for required in ("literature_watch", "refresh_jobs"):
        if required not in tables:
            log.error("missing table %s — did you run migrations?", required)
            return 1

    client = PubMedClient()
    log.info("pubmed client: api_key=%s email=%s min_interval=%.2fs",
             "set" if client.api_key else "unset",
             client.contact_email or "unset",
             client._min_interval)

    processed = 0
    total_new = 0
    total_seen = 0
    failed: list[tuple[str, str]] = []
    skipped_unmappable: list[str] = []

    for p in protocols:
        pid = p.get("id")
        q = build_query(p, conditions_by_id, devices_by_id)
        if not q:
            skipped_unmappable.append(pid)
            log.warning("skip %s — unmappable condition=%s device=%s",
                        pid, p.get("conditionId"), p.get("device"))
            continue
        started = datetime.now(timezone.utc).isoformat(timespec="seconds")
        try:
            records = client.search(q, days_back=args.days, max_results=args.max_results)
        except Exception as e:  # noqa: BLE001
            finished = datetime.now(timezone.utc).isoformat(timespec="seconds")
            failed.append((pid, str(e)))
            log.error("%s FAIL query=%s err=%s", pid, q, e)
            if not args.dry_run:
                log_job(conn, pid, "system", started, finished, 0, "failed")
            continue

        seen = already_seen_pmids(conn, pid)
        new = 0
        for rec in records:
            pmid = rec.get("pmid")
            if not pmid:
                continue
            if pmid in seen:
                total_seen += 1
                continue
            if args.dry_run:
                new += 1
            elif insert_paper(conn, pid, rec):
                new += 1
            seen.add(pmid)
        total_new += new
        processed += 1
        finished = datetime.now(timezone.utc).isoformat(timespec="seconds")
        if not args.dry_run:
            log_job(conn, pid, "system", started, finished, new, "succeeded")
        log.info("%s q=%r -> %d fetched, %d new (dry_run=%s)",
                 pid, q, len(records), new, args.dry_run)

    log.info(
        "SUMMARY processed=%d total_new=%d total_already_seen=%d "
        "failed=%d skipped_unmappable=%d rate_limit_sleeps=%d",
        processed, total_new, total_seen, len(failed),
        len(skipped_unmappable), client._sleep_count,
    )
    if failed:
        for pid, err in failed[:10]:
            log.warning("failed[%s]: %s", pid, err)
    conn.close()

    # Always refresh the static snapshot the front-end fetches, even on
    # dry-run (so a clinician can preview what the badge state would be).
    if not args.skip_export:
        try:
            export_snapshot(log=log)
        except Exception as e:  # noqa: BLE001
            log.warning("snapshot export failed: %s", e)

    # Exit 0 even with per-protocol failures — fatal conditions already returned 1
    # above. A single-protocol 429 should not poison the entire cron run.
    return 0


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description="Nightly PubMed -> literature_watch sweep.")
    ap.add_argument("--dry-run", action="store_true",
                    help="Fetch and dedupe but do not insert any rows.")
    ap.add_argument("--days", type=int, default=30,
                    help="Lookback window for esearch reldate (default: 30).")
    ap.add_argument("--max-results", type=int, default=25,
                    help="Max PMIDs per protocol per run (default: 25).")
    ap.add_argument("--limit", type=int, default=0,
                    help="Only process the first N protocols (for testing).")
    ap.add_argument("--export-only", action="store_true",
                    help="Skip the PubMed sweep; just regenerate the static "
                         "snapshot at apps/web/public/literature-watch.json.")
    ap.add_argument("--skip-export", action="store_true",
                    help="Run the PubMed sweep but do NOT regenerate the JSON "
                         "snapshot. Mostly useful for tests.")
    return ap.parse_args()


if __name__ == "__main__":
    try:
        _args = parse_args()
        if _args.export_only:
            stats = export_snapshot()
            print(
                f"[lit_watch_cron] snapshot ok path={stats['path']} "
                f"size={stats['size_bytes']}B "
                f"protocols={stats['protocol_count']} "
                f"queue={stats['pending_queue_length']}"
            )
            sys.exit(0)
        sys.exit(run(_args))
    except KeyboardInterrupt:
        print("[lit_watch_cron] interrupted", file=sys.stderr)
        sys.exit(130)
