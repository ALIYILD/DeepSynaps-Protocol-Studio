"""ingest_missing_trials.py — pull individual ClinicalTrials.gov studies that
papers reference but our trials table doesn't have yet.

Self-healing companion to link_papers_to_trials.py:

    paper abstract → NCT id  (link_papers_to_trials.py)
    NCT id → trial row       (this script)
    trial row + paper edge → resolved paper_trial_link  (this script)

Source of work: SELECT DISTINCT nct_id FROM paper_trial_links
                WHERE trial_id IS NULL.

For each missing NCT:
  GET https://clinicaltrials.gov/api/v2/studies/{nct_id}
  ctgov.upsert_trials([study])   # reuses the existing v2 → trials adapter
  UPDATE paper_trial_links SET trial_id = <lookup> WHERE nct_id = ?

Idempotent. UNIQUE (nct_id) on trials + INSERT OR IGNORE on link rows.
Polite ~1 req/sec to CTGOV. Caps each run via --limit so a long-running
cron tick won't gobble all 568 missing NCTs in one go.

Usage:
    python3 services/evidence-pipeline/ingest_missing_trials.py [--dry] [--limit N]
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

_HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(_HERE))
import db as _db  # noqa: E402

# `sources` is a sibling package on sys.path once we add the pipeline dir.
from sources import ctgov  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("ingest_missing_trials")

CTGOV_STUDY_URL = "https://clinicaltrials.gov/api/v2/studies/"
REQUEST_TIMEOUT = 40
SLEEP_BETWEEN_REQUESTS = 1.0  # CTGOV's stated rate limit is ~1 req/sec
DEFAULT_LIMIT = 100           # cap per run so a 2h cron tick stays bounded


def _fetch_one(nct_id: str) -> dict[str, Any] | None:
    """GET one CTGOV v2 study record. Returns the raw JSON or None on miss."""
    url = CTGOV_STUDY_URL + urllib.parse.quote(nct_id, safe="")
    try:
        with urllib.request.urlopen(url, timeout=REQUEST_TIMEOUT) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return None  # NCT was withdrawn / merged / never registered properly
        log.warning("HTTP %d for %s: %s", exc.code, nct_id, exc)
        return None
    except (urllib.error.URLError, json.JSONDecodeError) as exc:
        log.warning("Network error for %s: %s", nct_id, exc)
        return None


def _select_unresolved_ncts(conn, limit: int) -> list[str]:
    """Distinct NCT ids from paper_trial_links that we haven't ingested yet."""
    rows = conn.execute(
        """
        SELECT nct_id, COUNT(*) AS paper_count
        FROM   paper_trial_links
        WHERE  trial_id IS NULL
          AND  nct_id LIKE 'NCT%'
        GROUP  BY nct_id
        ORDER  BY paper_count DESC, nct_id ASC
        LIMIT  ?
        """,
        (limit,),
    ).fetchall()
    return [r["nct_id"] for r in rows]


def _resolve_links(conn, ingested_ncts: list[str]) -> int:
    """For each newly-ingested NCT, set trial_id on the matching link rows."""
    n = 0
    for nct in ingested_ncts:
        cur = conn.execute(
            "UPDATE paper_trial_links "
            "SET trial_id = (SELECT id FROM trials WHERE nct_id = ?) "
            "WHERE trial_id IS NULL AND nct_id = ?",
            (nct, nct),
        )
        n += cur.rowcount or 0
    return n


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=None)
    ap.add_argument("--dry", action="store_true",
                    help="Print what would be fetched; don't HTTP and don't write.")
    ap.add_argument("--limit", type=int, default=DEFAULT_LIMIT,
                    help=f"Cap per-run NCT count (default: {DEFAULT_LIMIT}).")
    args = ap.parse_args()

    db_path = _db.resolve_db_path(args.db)
    log.info("DB: %s", db_path)

    conn = _db.connect(db_path)

    candidates = _select_unresolved_ncts(conn, args.limit)
    log.info("unresolved NCTs to fetch: %d (cap=%d)", len(candidates), args.limit)

    if args.dry:
        for nct in candidates[:20]:
            print(f"  would fetch: {nct}")
        if len(candidates) > 20:
            print(f"  ... and {len(candidates) - 20} more")
        conn.close()
        return

    ingested_ncts: list[str] = []
    not_found: list[str] = []
    n_inserted = 0

    for i, nct in enumerate(candidates, 1):
        rec = _fetch_one(nct)
        if not rec:
            not_found.append(nct)
            time.sleep(SLEEP_BETWEEN_REQUESTS)
            continue
        # ctgov.upsert_trials expects a list of "studies" (each is the per-record payload).
        added = ctgov.upsert_trials(conn, [rec])
        if added:
            n_inserted += added
        ingested_ncts.append(nct)
        if i % 25 == 0:
            log.info("  progress: %d / %d", i, len(candidates))
        time.sleep(SLEEP_BETWEEN_REQUESTS)

    n_resolved = _resolve_links(conn, ingested_ncts)

    log.info("ingest complete:")
    log.info("  candidates considered : %d", len(candidates))
    log.info("  trials newly inserted : %d", n_inserted)
    log.info("  CTGOV not-found / 4xx : %d", len(not_found))
    log.info("  paper_trial_links resolved by ingest : %d", n_resolved)


if __name__ == "__main__":
    main()
