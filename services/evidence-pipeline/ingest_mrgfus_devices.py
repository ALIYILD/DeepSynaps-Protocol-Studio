"""ingest_mrgfus_devices.py — Re-ingest FDA device records for MRgFUS product codes.

Fetches PMA and 510(k) records for product codes OYJ and QBV from openFDA,
inserts any new device rows into `devices`, links them to the
`mrgfus_essential_tremor` indication, and marks them accepted with a clear
curation reason.

Why a separate script:
    The main ingest.py drives FDA device ingest per-indication via the
    fda_applicants list in indications_seed.py.  That list for
    mrgfus_essential_tremor is ["Insightec", "Exablate"], but OYJ / QBV were
    only added to MODALITY_PRODUCT_CODES after the last full ingest (PR #582).
    This script does a product-code-only sweep (no applicant filter) so we
    also catch any future manufacturer that holds an OYJ / QBV clearance.

Usage:
    python3 ingest_mrgfus_devices.py [--db PATH] [--max 200] [--dry-run]

    --db      Path to the SQLite DB (default: db.DB_PATH).
    --max     Max records per product code per endpoint (default: 200).
    --dry-run Fetch and print but write nothing.

Idempotency:
    devices has UNIQUE(kind, number, decision_date); re-runs are safe no-ops.
    device_indications uses INSERT OR IGNORE on its composite PK.

Rate-limit policy:
    0.25 s inter-page sleep; exponential back-off on HTTP 429.
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

sys.path.insert(0, str(Path(__file__).parent))
import db as _db

OPENFDA_BASE = "https://api.fda.gov"
MRGFUS_PRODUCT_CODES = ["OYJ", "QBV"]
MRGFUS_INDICATION_SLUG = "mrgfus_essential_tremor"
CURATION_STATUS = "accept"
CURATION_REASON = "OYJ/QBV — Exablate Neuro stereotactic ablation (MRgFUS brain, thalamotomy)"

DEFAULT_MAX = 200
_INTER_PAGE_SLEEP = 0.25
_BACKOFF_SEQUENCE = [5, 15, 45, 120]


# ---------------------------------------------------------------------------
# openFDA helpers
# ---------------------------------------------------------------------------

def _call(path: str, search_expr: str, limit: int = 100, skip: int = 0) -> Optional[dict]:
    """One openFDA call.  Returns None on unrecoverable error."""
    encoded = urllib.parse.quote(search_expr, safe='+:()"')
    url = (
        f"{OPENFDA_BASE}{path}"
        f"?search={encoded}&limit={limit}&skip={skip}"
    )
    attempt = 0
    while True:
        try:
            with urllib.request.urlopen(url, timeout=40) as r:
                return json.loads(r.read().decode())
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                return {"results": []}
            if exc.code == 429 and attempt < len(_BACKOFF_SEQUENCE):
                wait = _BACKOFF_SEQUENCE[attempt]
                print(f"    [429] back-off {wait}s ...", flush=True)
                time.sleep(wait)
                attempt += 1
                continue
            print(f"    [HTTP {exc.code}] {path} giving up", flush=True)
            return None
        except Exception as exc:
            print(f"    [network error] {exc}", flush=True)
            return None


def _paginate(path: str, expr: str, max_records: int) -> list[dict]:
    out: list[dict] = []
    skip = 0
    while len(out) < max_records:
        data = _call(path, expr, limit=min(100, max_records - len(out)), skip=skip)
        if data is None:
            break
        results = data.get("results") or []
        out.extend(results)
        if len(results) < 100:
            break
        skip += 100
        time.sleep(_INTER_PAGE_SLEEP)
    return out


def fetch_by_product_code(code: str, max_records: int) -> dict[str, list[dict]]:
    """Return {'pma': [...], '510k': [...]} for one product code."""
    expr = f'product_code:"{code}"'
    return {
        "pma": _paginate("/device/pma.json", expr, max_records),
        "510k": _paginate("/device/510k.json", expr, max_records),
    }


# ---------------------------------------------------------------------------
# DB writers
# ---------------------------------------------------------------------------

def _upsert_device(
    conn,
    kind: str,
    number: str,
    rec: dict,
    indication_id: int,
    dry_run: bool,
) -> tuple[bool, int]:
    """Upsert one device row.  Returns (is_new, device_id)."""
    if not number:
        return False, -1

    decision_date = rec.get("decision_date") or rec.get("date_received")
    existing = conn.execute(
        "SELECT id, curation_status FROM devices "
        "WHERE kind=? AND number=? AND COALESCE(decision_date,'')=COALESCE(?,'')",
        (kind, number, decision_date),
    ).fetchone()

    if existing:
        device_id = existing["id"]
        is_new = False
        if not dry_run:
            # Backfill curation fields if they were NULL on older rows.
            if not existing["curation_status"]:
                conn.execute(
                    "UPDATE devices SET curation_status=?, curation_reason=? WHERE id=?",
                    (CURATION_STATUS, CURATION_REASON, device_id),
                )
            conn.execute(
                "INSERT OR IGNORE INTO device_indications(device_id, indication_id) "
                "VALUES (?,?)",
                (device_id, indication_id),
            )
    else:
        if dry_run:
            tname = rec.get("trade_name") or rec.get("device_name", "")
            print(
                f"    [dry-run] would insert {kind} {number} ({tname})",
                flush=True,
            )
            return True, -1

        cur = conn.execute(
            "INSERT INTO devices "
            "(kind, number, applicant, trade_name, generic_name, product_code, "
            "decision_date, advisory_committee, raw_json, curation_status, curation_reason) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (
                kind,
                number,
                rec.get("applicant"),
                rec.get("trade_name") or rec.get("device_name"),
                rec.get("generic_name"),
                rec.get("product_code"),
                decision_date,
                rec.get("advisory_committee_description"),
                json.dumps(rec, ensure_ascii=False),
                CURATION_STATUS,
                CURATION_REASON,
            ),
        )
        device_id = cur.lastrowid
        is_new = True
        conn.execute(
            "INSERT OR IGNORE INTO device_indications(device_id, indication_id) VALUES (?,?)",
            (device_id, indication_id),
        )

    return is_new, device_id


# ---------------------------------------------------------------------------
# Core runner
# ---------------------------------------------------------------------------

def run(
    db_path: str | None = None,
    max_records: int = DEFAULT_MAX,
    dry_run: bool = False,
) -> dict:
    """Execute the MRgFUS device re-ingest; return a summary dict."""
    conn = _db.connect(db_path)

    # Resolve or create the mrgfus_essential_tremor indication.
    row = conn.execute(
        "SELECT id FROM indications WHERE slug=?", (MRGFUS_INDICATION_SLUG,)
    ).fetchone()
    if row:
        indication_id = row["id"]
    else:
        indication_id = _db.upsert_indication(
            conn,
            slug=MRGFUS_INDICATION_SLUG,
            label="MRgFUS thalamotomy for essential tremor",
            modality="MRgFUS",
            condition="Essential tremor",
            grade="A",
            regulatory="FDA-approved 2016",
        )
        print(
            f"[ingest_mrgfus] created indication id={indication_id} "
            f"slug={MRGFUS_INDICATION_SLUG}",
            flush=True,
        )

    print(
        f"[ingest_mrgfus] indication id={indication_id}  "
        f"codes={MRGFUS_PRODUCT_CODES}  max={max_records}  dry_run={dry_run}",
        flush=True,
    )

    total_new = 0
    total_existing = 0
    per_code: dict[str, dict] = {}

    for code in MRGFUS_PRODUCT_CODES:
        print(f"  product_code={code}", flush=True)
        records = fetch_by_product_code(code, max_records)
        new_this_code = 0
        existing_this_code = 0

        for rec in records.get("pma", []):
            is_new, _ = _upsert_device(
                conn, "pma", rec.get("pma_number", ""), rec, indication_id, dry_run
            )
            if is_new:
                new_this_code += 1
            else:
                existing_this_code += 1

        for rec in records.get("510k", []):
            is_new, _ = _upsert_device(
                conn, "510k", rec.get("k_number", ""), rec, indication_id, dry_run
            )
            if is_new:
                new_this_code += 1
            else:
                existing_this_code += 1

        print(
            f"    pma={len(records['pma'])}  510k={len(records['510k'])}  "
            f"new={new_this_code}  already_in_db={existing_this_code}",
            flush=True,
        )
        per_code[code] = {
            "pma_fetched": len(records["pma"]),
            "510k_fetched": len(records["510k"]),
            "new": new_this_code,
            "existing": existing_this_code,
        }
        total_new += new_this_code
        total_existing += existing_this_code

    total_mrgfus_linked = conn.execute(
        "SELECT count(*) FROM devices d "
        "JOIN device_indications di ON di.device_id=d.id "
        "JOIN indications i ON i.id=di.indication_id "
        "WHERE i.slug=?",
        (MRGFUS_INDICATION_SLUG,),
    ).fetchone()[0]

    print(
        f"\n[ingest_mrgfus] COMPLETE"
        f"  new={total_new}"
        f"  already_in_db={total_existing}"
        f"  total_linked_to_mrgfus_et={total_mrgfus_linked}",
        flush=True,
    )
    return {
        "per_code": per_code,
        "total_new": total_new,
        "total_existing": total_existing,
        "total_mrgfus_devices_linked": total_mrgfus_linked,
        "indication_id": indication_id,
        "dry_run": dry_run,
    }


def main() -> None:
    ap = argparse.ArgumentParser(
        description=(
            "Re-ingest FDA devices for MRgFUS product codes OYJ + QBV "
            "and link them to mrgfus_essential_tremor."
        )
    )
    ap.add_argument("--db", default=None,
                    help="SQLite DB path (default: pipeline canonical v4 DB).")
    ap.add_argument("--max", type=int, default=DEFAULT_MAX,
                    help=f"Max records per product code (default: {DEFAULT_MAX}).")
    ap.add_argument("--dry-run", action="store_true",
                    help="Fetch and print without writing to the DB.")
    args = ap.parse_args()

    summary = run(db_path=args.db, max_records=args.max, dry_run=args.dry_run)
    print("\nFull summary (JSON):")
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
