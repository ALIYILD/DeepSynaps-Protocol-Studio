"""ingest_maude.py — Pull FDA MAUDE adverse events for every accepted device.

RUN ME WHEN API IS UP — this script hits the openFDA /device/event endpoint.
If the API is unreachable (connection error or HTTP 429 exhausted), the
script writes 0 rows and exits with a clear diagnostic; it does NOT raise.

Usage (from the evidence-pipeline directory):
    python3 ingest_maude.py [--db PATH] [--cap 500] [--dry-run]

    --db      Path to the SQLite DB (default: db.DB_PATH, i.e.
              neuromodulation_evidence_2026-04-29_v4.db).
    --cap     Max MAUDE reports per accepted device (default: 500).
    --dry-run Print device list without fetching or writing.

Idempotency:
    adverse_events has UNIQUE(mdr_report_key); re-runs are safe no-ops.
    device_adverse_events uses INSERT OR IGNORE on its composite PK.

Rate-limit policy:
    openFDA unauthenticated: ~240 req/min.  We sleep 0.25 s between pages
    and apply exponential back-off on HTTP 429 (5 → 15 → 45 → 120 s).

Schema note:
    The adverse_events table already exists in schema.sql (device-agnostic).
    Migration 007_device_adverse_events.sql adds the many-to-many join table
    device_adverse_events(device_id, adverse_event_id, match_method).
    This script creates the join table idempotently (CREATE TABLE IF NOT EXISTS)
    so it works even if the migration has not been applied yet.

Post-ingest output:
    Per-device breakdown: total fetched, newly linked, % with patient_outcome.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Optional

# Path bootstrap: allow running from any working directory.
sys.path.insert(0, str(Path(__file__).parent))
import db as _db

OPENFDA_BASE = "https://api.fda.gov"
DEFAULT_CAP = 500
_INTER_PAGE_SLEEP = 0.25           # seconds between pages; keeps us < 240 req/min
_BACKOFF_SEQUENCE = [5, 15, 45, 120]   # seconds; give up after last entry exhausted


# ---------------------------------------------------------------------------
# openFDA page fetcher
# ---------------------------------------------------------------------------

def _call_events(search_expr: str, limit: int = 100, skip: int = 0) -> Optional[dict]:
    """Single openFDA /device/event call.  Returns None on unrecoverable error."""
    encoded = urllib.parse.quote(search_expr, safe='+:()"')
    url = (
        f"{OPENFDA_BASE}/device/event.json"
        f"?search={encoded}&limit={limit}&skip={skip}"
    )
    attempt = 0
    while True:
        try:
            with urllib.request.urlopen(url, timeout=40) as r:
                return json.loads(r.read().decode())
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                # openFDA returns 404 when the search yields zero results.
                return {"results": []}
            if exc.code == 429 and attempt < len(_BACKOFF_SEQUENCE):
                wait = _BACKOFF_SEQUENCE[attempt]
                print(f"    [429 rate-limit] back-off {wait}s ...", flush=True)
                time.sleep(wait)
                attempt += 1
                continue
            print(f"    [HTTP {exc.code}] giving up for this search", flush=True)
            return None
        except Exception as exc:
            print(f"    [network error] {exc}", flush=True)
            return None


def _fetch_for_term(expr: str, cap: int) -> list[dict]:
    """Page through openFDA results for one search expression, up to `cap` rows."""
    out: list[dict] = []
    skip = 0
    while len(out) < cap:
        page_limit = min(100, cap - len(out))
        data = _call_events(expr, limit=page_limit, skip=skip)
        if data is None:
            break
        results = data.get("results") or []
        out.extend(results)
        if len(results) < page_limit:
            break   # last page
        skip += page_limit
        time.sleep(_INTER_PAGE_SLEEP)
    return out


def fetch_maude(brand: str, generic: str, cap: int) -> tuple[list[dict], str]:
    """Fetch up to `cap` MAUDE reports for one device.

    Search strategy:
      1. Primary:  device.brand_name  (exact phrase, case-insensitive).
      2. Fall-back: device.generic_name  (only if brand search is empty AND
         generic differs from brand).
    Returns (events, match_method).
    """
    term = (brand or "").strip()
    if not term:
        term = (generic or "").strip()
    if not term:
        return [], "none"

    results = _fetch_for_term(f'device.brand_name:"{term}"', cap)
    if results:
        return results, "brand_name"

    gen = (generic or "").strip()
    if gen and gen != term:
        results = _fetch_for_term(f'device.generic_name:"{gen}"', cap)
        if results:
            return results, "generic_name"

    return [], "brand_name"


# ---------------------------------------------------------------------------
# DB writers
# ---------------------------------------------------------------------------

def _ensure_dae_table(conn) -> None:
    """Idempotently create device_adverse_events (defensive; migration 007 covers this)."""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS device_adverse_events (
          device_id        INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
          adverse_event_id INTEGER NOT NULL REFERENCES adverse_events(id) ON DELETE CASCADE,
          match_method     TEXT,
          PRIMARY KEY (device_id, adverse_event_id)
        )
    """)
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_dae_device ON device_adverse_events (device_id)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_dae_event  ON device_adverse_events (adverse_event_id)"
    )


def _upsert_event(conn, ev: dict) -> Optional[int]:
    """Upsert one MAUDE event; return its adverse_events.id (new or existing)."""
    key = ev.get("mdr_report_key")
    if not key:
        return None

    device_list = ev.get("device") or []
    dev_rec: dict = (
        device_list[0]
        if isinstance(device_list, list) and device_list
        else device_list
        if isinstance(device_list, dict)
        else {}
    )
    brand_str = dev_rec.get("brand_name") or ""
    gen_str = dev_rec.get("generic_name") or ""
    event_type = ev.get("event_type") or ""
    date_recv = ev.get("date_received") or ""
    patient_json = json.dumps(ev.get("patient") or [], ensure_ascii=False)
    raw_json = json.dumps(ev, ensure_ascii=False)

    # Fast path: row already exists.
    row = conn.execute(
        "SELECT id FROM adverse_events WHERE mdr_report_key=?", (key,)
    ).fetchone()
    if row:
        return row["id"]

    cur = conn.execute(
        "INSERT OR IGNORE INTO adverse_events "
        "(mdr_report_key, device_brand, device_generic, event_type, "
        "date_received, patient_outcome_json, raw_json) "
        "VALUES (?,?,?,?,?,?,?)",
        (key, brand_str, gen_str, event_type, date_recv, patient_json, raw_json),
    )
    if cur.lastrowid:
        return cur.lastrowid
    # Race between concurrent runs; re-fetch.
    row = conn.execute(
        "SELECT id FROM adverse_events WHERE mdr_report_key=?", (key,)
    ).fetchone()
    return row["id"] if row else None


def _link(conn, device_id: int, event_id: int, method: str) -> bool:
    """Create device -> adverse_event link.  Returns True if new row inserted."""
    existing = conn.execute(
        "SELECT 1 FROM device_adverse_events "
        "WHERE device_id=? AND adverse_event_id=?",
        (device_id, event_id),
    ).fetchone()
    if existing:
        return False
    conn.execute(
        "INSERT OR IGNORE INTO device_adverse_events "
        "(device_id, adverse_event_id, match_method) VALUES (?,?,?)",
        (device_id, event_id, method),
    )
    return True


# ---------------------------------------------------------------------------
# Core runner
# ---------------------------------------------------------------------------

def run(
    db_path: str | None = None,
    cap: int = DEFAULT_CAP,
    dry_run: bool = False,
) -> dict:
    """Run the full MAUDE ingest.  Returns a summary dict."""
    conn = _db.connect(db_path)
    _ensure_dae_table(conn)

    devices = conn.execute(
        "SELECT id, trade_name, generic_name "
        "FROM devices WHERE curation_status='accept'"
    ).fetchall()

    if not devices:
        print("[ingest_maude] No accepted devices in DB — nothing to do.", flush=True)
        return {}

    print(
        f"[ingest_maude] {len(devices)} accepted devices  "
        f"cap={cap}  dry_run={dry_run}",
        flush=True,
    )

    per_device: dict[str, dict] = {}
    grand_new_links = 0
    grand_with_outcome = 0

    for dev in devices:
        dev_id: int = dev["id"]
        brand: str = (dev["trade_name"] or "").strip()
        generic: str = (dev["generic_name"] or "").strip()
        label = (brand or generic or f"device_id={dev_id}")[:70]

        print(f"  [{dev_id:>3}] {label}", flush=True)

        if dry_run:
            per_device[label] = {
                "device_id": dev_id, "fetched": 0, "new_links": 0,
                "with_outcome": 0, "pct_outcome": 0.0,
            }
            continue

        events, method = fetch_maude(brand, generic, cap)

        new_links = 0
        with_outcome = 0

        for ev in events:
            ev_id = _upsert_event(conn, ev)
            if ev_id is None:
                continue
            if _link(conn, dev_id, ev_id, method):
                new_links += 1
            # Count reports that carry at least one non-empty patient entry.
            pat = ev.get("patient") or []
            if (isinstance(pat, list) and pat) or (isinstance(pat, dict) and pat):
                with_outcome += 1

        total_fetched = len(events)
        pct = round(100 * with_outcome / total_fetched, 1) if total_fetched else 0.0
        print(
            f"       fetched={total_fetched}  new_links={new_links}  "
            f"with_outcome={with_outcome} ({pct}%)  method={method}",
            flush=True,
        )
        per_device[label] = {
            "device_id": dev_id,
            "fetched": total_fetched,
            "new_links": new_links,
            "with_outcome": with_outcome,
            "pct_outcome": pct,
            "match_method": method,
        }
        grand_new_links += new_links
        grand_with_outcome += with_outcome

    total_ae_rows = conn.execute(
        "SELECT count(*) FROM adverse_events"
    ).fetchone()[0]
    total_links = conn.execute(
        "SELECT count(*) FROM device_adverse_events"
    ).fetchone()[0]

    print(
        f"\n[ingest_maude] COMPLETE"
        f"  adverse_events.total={total_ae_rows}"
        f"  device_adverse_events.total={total_links}"
        f"  grand_new_links={grand_new_links}",
        flush=True,
    )
    return {
        "per_device": per_device,
        "grand_new_links": grand_new_links,
        "grand_with_outcome": grand_with_outcome,
        "adverse_events_table_total": total_ae_rows,
        "device_adverse_events_links": total_links,
    }


def main() -> None:
    ap = argparse.ArgumentParser(
        description=(
            "Ingest MAUDE adverse events for all accepted neuromodulation devices."
        )
    )
    ap.add_argument("--db", default=None,
                    help="SQLite DB path (default: pipeline canonical v4 DB).")
    ap.add_argument("--cap", type=int, default=DEFAULT_CAP,
                    help=f"Max MAUDE events per device (default: {DEFAULT_CAP}).")
    ap.add_argument("--dry-run", action="store_true",
                    help="List accepted devices without fetching or writing.")
    args = ap.parse_args()

    summary = run(db_path=args.db, cap=args.cap, dry_run=args.dry_run)
    print("\nFull summary (JSON):")
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
