"""Query the DeepSynaps evidence DB. Returns papers + trials + FDA records
ranked by an informed evidence tier (publication type + recency + OA + citations).

Usage:
    python3 query.py "rTMS depression" --limit 20
    python3 query.py --slug rtms_mdd --grade A
    python3 query.py "sacral neuromodulation" --trials-only
    python3 query.py --slug rtms_mdd --oa-only
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import db


PUB_TYPE_TIER = {
    "Meta-Analysis": 5, "Systematic Review": 5, "Practice Guideline": 5, "Guideline": 5,
    "Randomized Controlled Trial": 4, "Controlled Clinical Trial": 4,
    "Clinical Trial": 3,
    "Review": 2,
    "Case Reports": 1,
}


def _evidence_score(row) -> float:
    pub_types = json.loads(row["pub_types_json"] or "[]")
    t = max((PUB_TYPE_TIER.get(pt, 0) for pt in pub_types), default=0)
    cites = row["cited_by_count"] or 0
    year = row["year"] or 0
    # Log-compress citations so a 10k-cite anchor doesn't crush everything else.
    import math
    return t * 10 + math.log1p(cites) + (year - 2000) * 0.1 + (2 if row["is_oa"] else 0)


def search_papers(conn, text=None, slug=None, grade=None, oa_only=False, limit=20):
    where = []
    params = []
    join = ""
    if slug:
        join = (
            "JOIN paper_indications pi ON pi.paper_id = p.id "
            "JOIN indications i ON i.id = pi.indication_id "
        )
        where.append("i.slug = ?")
        params.append(slug)
        if grade:
            where.append("i.evidence_grade = ?")
            params.append(grade)
    if oa_only:
        where.append("p.is_oa = 1")
    if text:
        # Use FTS
        join += "JOIN papers_fts f ON f.rowid = p.id "
        where.append("papers_fts MATCH ?")
        params.append(text)

    sql = (
        "SELECT p.id, p.pmid, p.doi, p.title, p.year, p.journal, p.cited_by_count, "
        "p.is_oa, p.oa_url, p.pub_types_json, p.authors_json "
        "FROM papers p " + join
        + (" WHERE " + " AND ".join(where) if where else "")
        + " LIMIT ?"
    )
    params.append(limit * 4)
    rows = conn.execute(sql, params).fetchall()
    scored = sorted(rows, key=_evidence_score, reverse=True)[:limit]
    return scored


def search_trials(conn, text=None, slug=None, status=None, limit=20):
    join = ""
    where = []
    params = []
    if slug:
        join = (
            "JOIN trial_indications ti ON ti.trial_id = t.id "
            "JOIN indications i ON i.id = ti.indication_id "
        )
        where.append("i.slug = ?")
        params.append(slug)
    if status:
        where.append("t.status = ?")
        params.append(status)
    if text:
        join += "JOIN trials_fts tf ON tf.rowid = t.id "
        where.append("trials_fts MATCH ?")
        params.append(text)

    sql = (
        "SELECT t.nct_id, t.title, t.phase, t.status, t.enrollment, t.sponsor, "
        "t.interventions_json "
        "FROM trials t " + join
        + (" WHERE " + " AND ".join(where) if where else "")
        + " ORDER BY t.last_update DESC LIMIT ?"
    )
    params.append(limit)
    return conn.execute(sql, params).fetchall()


def search_devices(conn, slug=None, applicant=None, limit=20):
    join = ""
    where = []
    params = []
    if slug:
        join = (
            "JOIN device_indications di ON di.device_id = d.id "
            "JOIN indications i ON i.id = di.indication_id "
        )
        where.append("i.slug = ?")
        params.append(slug)
    if applicant:
        where.append("d.applicant LIKE ?")
        params.append(f"%{applicant}%")
    sql = (
        "SELECT d.kind, d.number, d.applicant, d.trade_name, d.decision_date, d.product_code "
        "FROM devices d " + join
        + (" WHERE " + " AND ".join(where) if where else "")
        + " ORDER BY d.decision_date DESC LIMIT ?"
    )
    params.append(limit)
    return conn.execute(sql, params).fetchall()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("text", nargs="?")
    ap.add_argument("--slug")
    ap.add_argument("--grade")
    ap.add_argument("--oa-only", action="store_true")
    ap.add_argument("--trials-only", action="store_true")
    ap.add_argument("--devices-only", action="store_true")
    ap.add_argument("--limit", type=int, default=15)
    args = ap.parse_args()

    conn = db.connect()

    if not args.trials_only and not args.devices_only:
        rows = search_papers(conn, args.text, args.slug, args.grade, args.oa_only, args.limit)
        print(f"\n== Papers ({len(rows)}) ==")
        for r in rows:
            authors = json.loads(r["authors_json"] or "[]")
            first = authors[0] if authors else ""
            print(f"  [{r['year'] or '?'}] {r['title']}")
            print(f"      {first + ' et al.' if len(authors) > 1 else first}   {r['journal'] or ''}")
            print(f"      cites={r['cited_by_count'] or 0}  OA={'Y' if r['is_oa'] else 'N'}  pmid={r['pmid']}  doi={r['doi']}")
            if r["is_oa"] and r["oa_url"]:
                print(f"      {r['oa_url']}")

    if not args.devices_only:
        trials = search_trials(conn, args.text, args.slug, limit=args.limit)
        if trials:
            print(f"\n== Trials ({len(trials)}) ==")
            for t in trials:
                print(f"  {t['nct_id']}  {t['status']}  {t['phase'] or ''}  n={t['enrollment'] or '?'}")
                print(f"    {t['title']}")

    if not args.trials_only:
        devices = search_devices(conn, args.slug, limit=args.limit)
        if devices:
            print(f"\n== FDA device records ({len(devices)}) ==")
            for d in devices:
                print(f"  {d['kind'].upper()} {d['number']}  {d['decision_date'] or ''}  {d['applicant'] or ''}  {d['trade_name'] or ''}")


if __name__ == "__main__":
    main()
