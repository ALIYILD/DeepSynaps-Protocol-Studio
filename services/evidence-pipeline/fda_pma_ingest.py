#!/usr/bin/env python3
"""fda_pma_ingest.py — Idempotent PMA ingest for major neuromodulation modalities.

Fetches PMA records from openFDA for DBS, VNS, SCS, HNS, RNS, DRG, SNM,
MRgFUS, and VNS-stroke (each with its verified product code) and upserts
them into the `devices` table, then links each device to every indication
it is FDA-approved for via `device_indications`.

Usage:
    python3 fda_pma_ingest.py [--db PATH] [--max N] [--dry-run] [--modality SLUG]

    --db        Path to the SQLite DB (default: db.DB_PATH).
    --max       Max records per (applicant, product-code) pair per endpoint (default: 20).
    --dry-run   Fetch and print; write nothing.
    --modality  Restrict run to one modality key (e.g. DBS, VNS, SCS, HNS,
                RNS, DRG, SNM, MRgFUS, VNS-stroke).

Idempotency:
    devices has UNIQUE(kind, number, decision_date); re-runs are safe no-ops.
    device_indications uses INSERT OR IGNORE on its composite PK.

Rate-limit policy:
    0.30 s inter-request sleep; exponential back-off on HTTP 429.

Product-code rationale (all verified against openFDA classification + PMA endpoints):
    MHY  — Stimulator, Electrical, Implanted, For Parkinsonian Tremor (Class III, PMA).
           Used for DBS (PD, ET, OCD HDE, epilepsy ANT).
    LYJ  — Stimulator, Autonomic Nerve, Implanted For Epilepsy (Class III, PMA).
           Used for VNS epilepsy and VNS depression.
    LGW  — Stimulator, Spinal-Cord, Totally Implanted For Pain Relief (Class III, PMA).
           Used for SCS (FBSS and PDN).
    MNQ  — Stimulator, Hypoglossal Nerve, Implanted, Apnea (Class III, PMA).
           Used for HNS (OSA).
    PFN  — Implanted Brain Stimulator For Epilepsy (NeuroPace RNS, P100026; Class III).
    PMP  — Dorsal Root Ganglion Stimulator For Pain Relief (Abbott Proclaim DRG, P150004; Class III).
    EZW  — Stimulator, Electrical, Implantable, For Incontinence
           (Medtronic InterStim P970004 + Axonics R20/R15 P190006; Class III).
    POH  — MR-Guided Focused Ultrasound System (Insightec Exablate Neuro, P150038; Class III).
    QPY  — Stimulator, Autonomic Nerve, Implanted For Stroke Rehabilitation
           (MicroTransponder Vivistim Paired VNS, P210007; Class III).

Historical false leads (verified wrong against openFDA, do NOT re-add):
    NCJ (telescope implant), QPH / MXO / LYW / GXN (do not exist),
    QAB (cardiac pacing analyzer, not DRG),
    OYJ (saliva DNA kit, not MRgFUS), QBV (PRP centrifuge, not MRgFUS).
    All audited 2026-05-09; see docs/fda-product-codes.md.
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
import db as _db  # noqa: E402

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

OPENFDA_BASE = "https://api.fda.gov"
_INTER_REQUEST_SLEEP = 0.30  # 240 req/min unauth -> ~0.25s minimum; use 0.30 to be safe
_BACKOFF_SEQUENCE = [5, 15, 45, 120]

CURATION_REASON = "openFDA PMA ingest 2026-05-09"

# ---------------------------------------------------------------------------
# Modality table: product codes + applicants + indication slugs each device maps to.
#
# Each entry:
#   product_codes  — verified openFDA product code(s) for the modality.
#   applicants     — applicant names to AND with the product-code filter.
#                    MUST be combined: Medtronic makes DBS *and* cardiac
#                    devices, so applicant alone would pull in garbage.
#   slugs          — indication slugs every device with this product_code maps
#                    to.  A single DBS device (MHY) is approved for all four
#                    indications simultaneously, so all four are listed here.
# ---------------------------------------------------------------------------

MODALITY_TABLE: list[dict] = [
    {
        "modality": "DBS",
        "product_codes": ["MHY"],
        "applicants": ["Medtronic", "Boston Scientific", "Abbott"],
        # MHY is the DBS implanted stimulator; all four indication slugs share
        # the same cleared device family (Medtronic Activa / St. Jude Infinity /
        # BS Vercise are all approved across PD, ET, OCD HDE, and ANT epilepsy).
        "slugs": [
            "dbs_parkinson",
            "dbs_essential_tremor",
            "dbs_ocd",
            "dbs_epilepsy_ant",
        ],
    },
    {
        "modality": "VNS",
        "product_codes": ["LYJ"],
        "applicants": ["LivaNova", "Cyberonics"],
        # LYJ covers the implanted VNS generator (Pulse, AspireHC, SenTiva).
        # LivaNova changed its name from Cyberonics; both names appear in FDA
        # records.  Epilepsy (1997) and depression (2005) are both covered.
        "slugs": [
            "vns_epilepsy",
            "vns_depression",
        ],
    },
    {
        "modality": "SCS",
        "product_codes": ["LGW"],
        "applicants": ["Medtronic", "Abbott", "Boston Scientific", "Nevro"],
        # LGW = totally-implanted SCS for pain relief.  FBSS and PDN
        # (10 kHz) share the same device family; the PDN indication is
        # specifically approved for Nevro HFX (P050004/S050 series).
        "slugs": [
            "scs_fbss",
            "scs_pdn",
        ],
    },
    {
        "modality": "HNS",
        "product_codes": ["MNQ"],
        "applicants": ["Inspire Medical"],
        # MNQ = hypoglossal-nerve implanted stimulator for apnea.
        # Inspire is the sole PMA holder as of 2026.
        "slugs": [
            "hns_osa",
        ],
    },
    {
        "modality": "RNS",
        "product_codes": ["PFN"],
        "applicants": ["NeuroPace"],
        # PFN = "Implanted Brain Stimulator For Epilepsy" (NeuroPace RNS
        # System, P100026 + supplements). Sole PMA holder; Class III.
        "slugs": [
            "rns_epilepsy",
        ],
    },
    {
        "modality": "DRG",
        "product_codes": ["PMP"],
        "applicants": ["Abbott", "St. Jude Medical"],
        # PMP = "Dorsal Root Ganglion Stimulator For Pain Relief" (Abbott
        # Proclaim DRG, P150004). St. Jude was the original applicant before
        # the Abbott acquisition; both names appear in older records.
        "slugs": [
            "drg_crps",
        ],
    },
    {
        "modality": "SNM",
        "product_codes": ["EZW"],
        "applicants": ["Medtronic", "Axonics"],
        # EZW = "Stimulator, Electrical, Implantable, For Incontinence"
        # (Medtronic InterStim, P970004; Axonics R20/R15, P190006). Both
        # applicants share this product code for sacral neuromodulation.
        "slugs": [
            "snm_bladder_bowel",
        ],
    },
    {
        "modality": "MRgFUS",
        "product_codes": ["POH"],
        "applicants": ["Insightec"],
        # POH = "MR-Guided Focused Ultrasound System" (Insightec Exablate
        # Neuro 4000, P150038 + supplements). Earlier OYJ/QBV mapping was
        # wrong (saliva DNA / PRP centrifuge) — see fda_curation_log_2026-05-09.md.
        "slugs": [
            "mrgfus_essential_tremor",
        ],
    },
    {
        "modality": "VNS-stroke",
        "product_codes": ["QPY"],
        "applicants": ["MicroTransponder", "Mobia Medical"],
        # QPY = "Stimulator, Autonomic Nerve, Implanted For Stroke
        # Rehabilitation" (Vivistim Paired VNS System, P210007). Separate
        # product code from LYJ (epilepsy/depression VNS) since the Vivistim
        # device family is distinct.
        "slugs": [
            "vns_stroke_rehab",
        ],
    },
]


# ---------------------------------------------------------------------------
# openFDA helpers
# ---------------------------------------------------------------------------

def _call(path: str, search_expr: str, limit: int = 20, skip: int = 0) -> Optional[dict]:
    """Single openFDA request.  Returns None on unrecoverable error."""
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
                return {"results": [], "meta": {"results": {"total": 0}}}
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


def _paginate(path: str, expr: str, max_records: int) -> tuple[list[dict], int]:
    """Paginate through openFDA results.  Returns (records, total_available)."""
    out: list[dict] = []
    skip = 0
    total_avail = 0
    while len(out) < max_records:
        data = _call(path, expr, limit=min(max_records - len(out), 100), skip=skip)
        if data is None:
            break
        if total_avail == 0:
            total_avail = data.get("meta", {}).get("results", {}).get("total", 0)
        results = data.get("results") or []
        out.extend(results)
        if len(results) < min(max_records - len(out) + len(results), 100):
            break
        skip += 100
        time.sleep(_INTER_REQUEST_SLEEP)
    return out, total_avail


def _build_pma_search(applicant: str, product_code: str) -> str:
    """Build a PMA search expression: applicant AND product_code."""
    return f'applicant:"{applicant}"+AND+product_code:"{product_code}"'


# ---------------------------------------------------------------------------
# DB writers
# ---------------------------------------------------------------------------

def _upsert_device(
    conn,
    kind: str,
    number: str,
    rec: dict,
    indication_ids: list[int],
    dry_run: bool,
) -> tuple[bool, int]:
    """Upsert one device row and link to all indication_ids.

    Returns (is_new, device_id).  device_id is -1 when dry_run=True and row
    would have been inserted.
    """
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
            # Backfill curation fields if they were NULL.
            if not existing["curation_status"]:
                conn.execute(
                    "UPDATE devices SET curation_status='accept', curation_reason=? WHERE id=?",
                    (CURATION_REASON, device_id),
                )
            for ind_id in indication_ids:
                conn.execute(
                    "INSERT OR IGNORE INTO device_indications(device_id, indication_id) VALUES (?,?)",
                    (device_id, ind_id),
                )
    else:
        tname = rec.get("trade_name") or rec.get("device_name", "")
        if dry_run:
            print(f"    [dry-run] would insert {kind} {number} | {tname}", flush=True)
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
                tname,
                rec.get("generic_name"),
                rec.get("product_code"),
                decision_date,
                rec.get("advisory_committee_description"),
                json.dumps(rec, ensure_ascii=False),
                "accept",
                CURATION_REASON,
            ),
        )
        device_id = cur.lastrowid
        is_new = True
        for ind_id in indication_ids:
            conn.execute(
                "INSERT OR IGNORE INTO device_indications(device_id, indication_id) VALUES (?,?)",
                (device_id, ind_id),
            )

    return is_new, device_id


def _resolve_indication_ids(conn, slugs: list[str]) -> dict[str, int]:
    """Return {slug: id} for slugs that exist in indications.  Log missing ones."""
    result: dict[str, int] = {}
    for slug in slugs:
        row = conn.execute(
            "SELECT id FROM indications WHERE slug=?", (slug,)
        ).fetchone()
        if row:
            result[slug] = row["id"]
        else:
            print(
                f"    [warn] indication slug '{slug}' not in DB — skipping mapping for this slug",
                flush=True,
            )
    return result


# ---------------------------------------------------------------------------
# Core runner
# ---------------------------------------------------------------------------

def run(
    db_path: str | None = None,
    max_per_pair: int = 20,
    dry_run: bool = False,
    modality_filter: str | None = None,
) -> dict:
    """Execute the PMA ingest for all modalities (or one if modality_filter set).

    Returns a summary dict with per-modality counts.
    """
    conn = _db.connect(db_path)
    summary: dict = {"modalities": {}, "total_new_devices": 0, "total_di_rows": 0}

    modalities = MODALITY_TABLE
    if modality_filter:
        # Case-insensitive match — table keys are mixed-case (e.g. "MRgFUS",
        # "VNS-stroke") so a hard .upper() would never match.
        wanted = modality_filter.casefold()
        modalities = [m for m in MODALITY_TABLE if m["modality"].casefold() == wanted]
        if not modalities:
            print(
                f"[fda_pma_ingest] unknown modality filter '{modality_filter}'; "
                f"valid: {[m['modality'] for m in MODALITY_TABLE]}",
                file=sys.stderr,
            )
            return summary

    for entry in modalities:
        modality = entry["modality"]
        codes = entry["product_codes"]
        applicants = entry["applicants"]
        slugs = entry["slugs"]

        print(
            f"\n[{modality}]  product_codes={codes}  "
            f"applicants={applicants}  indication_slugs={slugs}",
            flush=True,
        )

        # Resolve indication IDs once per modality.
        ind_ids = _resolve_indication_ids(conn, slugs)
        if not ind_ids:
            print(f"  [warn] no indication IDs resolved for {modality} — skipping DB writes", flush=True)
            ind_id_list: list[int] = []
        else:
            ind_id_list = list(ind_ids.values())

        mod_summary: dict = {
            "pma_fetched": 0,
            "pma_total_available": 0,
            "new_devices": 0,
            "existing_devices": 0,
            "new_di_rows": 0,
            "per_applicant": {},
        }

        for applicant in applicants:
            for code in codes:
                expr = _build_pma_search(applicant, code)
                print(f"  search: {expr[:80]}", flush=True)
                records, total_avail = _paginate("/device/pma.json", expr, max_per_pair)
                time.sleep(_INTER_REQUEST_SLEEP)

                mod_summary["pma_fetched"] += len(records)
                mod_summary["pma_total_available"] = max(
                    mod_summary["pma_total_available"], total_avail
                )

                key = f"{applicant}/{code}"
                mod_summary["per_applicant"][key] = {
                    "fetched": len(records),
                    "total_available": total_avail,
                }

                print(
                    f"    => {len(records)} records fetched  "
                    f"(total_available={total_avail})",
                    flush=True,
                )

                for rec in records:
                    is_new, device_id = _upsert_device(
                        conn,
                        kind="pma",
                        number=rec.get("pma_number", ""),
                        rec=rec,
                        indication_ids=ind_id_list if not dry_run else [],
                        dry_run=dry_run,
                    )
                    if is_new:
                        mod_summary["new_devices"] += 1
                        mod_summary["new_di_rows"] += len(ind_id_list)
                    else:
                        mod_summary["existing_devices"] += 1

        summary["modalities"][modality] = mod_summary
        summary["total_new_devices"] += mod_summary["new_devices"]
        summary["total_di_rows"] += mod_summary["new_di_rows"]

        print(
            f"  [{modality}] done:  "
            f"fetched={mod_summary['pma_fetched']}  "
            f"new={mod_summary['new_devices']}  "
            f"existing={mod_summary['existing_devices']}  "
            f"new_di_rows={mod_summary['new_di_rows']}",
            flush=True,
        )

    print(
        f"\n[fda_pma_ingest] COMPLETE  "
        f"total_new_devices={summary['total_new_devices']}  "
        f"total_di_rows={summary['total_di_rows']}  "
        f"dry_run={dry_run}",
        flush=True,
    )
    return summary


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    ap = argparse.ArgumentParser(
        description=(
            "Ingest PMA records for major neuromodulation modalities from openFDA "
            "and link them to indication slugs in device_indications."
        )
    )
    ap.add_argument(
        "--db", default=None,
        help="SQLite DB path (default: pipeline canonical DB via db.DB_PATH).",
    )
    ap.add_argument(
        "--max", type=int, default=20,
        help="Max PMA records per (applicant, product_code) pair (default: 20).",
    )
    ap.add_argument(
        "--dry-run", action="store_true",
        help="Fetch and print without writing to the DB.",
    )
    ap.add_argument(
        "--modality", default=None,
        help="Restrict to one modality key: DBS, VNS, SCS, or HNS.",
    )
    args = ap.parse_args()

    result = run(
        db_path=args.db,
        max_per_pair=args.max,
        dry_run=args.dry_run,
        modality_filter=args.modality,
    )
    print("\nFull summary (JSON):")
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
