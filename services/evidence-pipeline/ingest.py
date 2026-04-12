from __future__ import annotations
"""Ingest one or all seed indications into the DeepSynaps evidence DB.

Usage:
    python3 ingest.py --all [--papers 200] [--trials 200] [--fda 200]
    python3 ingest.py --slug rtms_mdd --papers 300
    python3 ingest.py --init-only                         # create DB and exit
"""
import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import db
from sources import pubmed, openalex, ctgov, openfda, unpaywall
from indications_seed import SEED, MODALITY_PRODUCT_CODES


def ingest_indication(conn, entry: dict, n_papers: int, n_trials: int, n_fda: int, n_events: int) -> dict:
    ind_id = db.upsert_indication(
        conn, entry["slug"], entry["label"], entry["modality"], entry["condition"],
        grade=entry.get("grade"), regulatory=entry.get("regulatory"),
    )
    summary = {"slug": entry["slug"], "indication_id": ind_id}

    # Papers: PubMed (primary) + OpenAlex (supplement for citations)
    pmids = pubmed.esearch(entry["pubmed_q"], retmax=n_papers)
    records = pubmed.efetch(pmids) if pmids else []
    summary["pubmed_new"] = pubmed.upsert_papers(conn, records, ind_id)

    oa = openalex.search(entry["broad_q"], max_records=n_papers)
    summary["openalex_new"] = openalex.upsert_papers(conn, oa, ind_id)

    # Trials
    trials = ctgov.search(entry["trial_q"], max_records=n_trials)
    summary["trials_new"] = ctgov.upsert_trials(conn, trials, ind_id)

    # FDA device records, per applicant, narrowed by modality product codes.
    # Per-entry product_codes override the modality default.
    codes = entry.get("product_codes") or MODALITY_PRODUCT_CODES.get(entry["modality"]) or None
    dev_new = 0
    ev_new = 0
    for applicant in entry.get("fda_applicants") or []:
        pma = openfda.search_pma(applicant, max_records=n_fda, product_codes=codes)
        k = openfda.search_510k(applicant, max_records=n_fda, product_codes=codes)
        dev_new += openfda.upsert_devices(conn, pma, k, None, ind_id)
        ev = openfda.search_events(applicant, max_records=n_events)
        ev_new += openfda.upsert_events(conn, ev)
    summary["fda_devices_new"] = dev_new
    summary["fda_events_new"] = ev_new

    return summary


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--slug")
    ap.add_argument("--init-only", action="store_true")
    ap.add_argument("--papers", type=int, default=200)
    ap.add_argument("--trials", type=int, default=200)
    ap.add_argument("--fda", type=int, default=200)
    ap.add_argument("--events", type=int, default=200)
    ap.add_argument("--unpaywall", action="store_true",
                    help="After ingestion, resolve OA status for all papers with a DOI.")
    args = ap.parse_args()

    db.init()
    conn = db.connect()
    if args.init_only:
        print(f"db ready at {db.DB_PATH}")
        return

    if args.slug:
        entries = [e for e in SEED if e["slug"] == args.slug]
        if not entries:
            print(f"unknown slug: {args.slug}", file=sys.stderr); sys.exit(2)
    elif args.all:
        entries = SEED
    else:
        print("pass --all or --slug SLUG (or --init-only)", file=sys.stderr); sys.exit(2)

    t0 = time.time()
    for i, e in enumerate(entries, start=1):
        print(f"[{i}/{len(entries)}] {e['slug']} — {e['label']}", flush=True)
        try:
            s = ingest_indication(conn, e, args.papers, args.trials, args.fda, args.events)
            print(f"    {s}", flush=True)
        except Exception as ex:
            print(f"    ERROR: {ex}", file=sys.stderr)

    if args.unpaywall:
        n = unpaywall.backfill(conn, limit=10_000)
        print(f"unpaywall: resolved {n} DOIs")

    print(f"done in {time.time() - t0:.1f}s   db: {db.DB_PATH}")


if __name__ == "__main__":
    main()
