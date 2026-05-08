"""Indication routing — populate paper_indications and trial_indications M:N tables
by running each indication's curated FTS query against the local FTS5 indices.

Why this exists: the curated SEED in `indications_seed.py` carries a `pubmed_q`
expression (PubMed syntax) and a looser `broad_q` / `trial_q` per indication.
Until this script runs the M:N tables are empty, so `evidence_query_papers --slug
rtms_mdd` returns zero rows even though the corpus has 184k titles.

Conversion: PubMed `[Title/Abstract]` field tags are stripped (the local DB has
no abstracts for the bulk papers, just titles). The remaining boolean tree
(quotes, AND, OR, parens) maps directly onto FTS5 syntax.

Usage:
    python3 services/evidence-pipeline/route_indications.py [--dry] [--top N]

`--top N` caps each indication to the N best-ranked papers (BM25); default 1000.
Trials are not capped (only ~1.3k trials total).
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import db
from indications_seed import SEED


_TAG_RE = re.compile(r"\[Title/Abstract\]|\[Title\]|\[tiab\]", re.IGNORECASE)


def to_fts5(q: str) -> str:
    """Strip PubMed field tags. The remaining quotes/AND/OR/parens are valid FTS5."""
    if not q:
        return q
    s = _TAG_RE.sub("", q)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def route_papers(conn, indication_id: int, slug: str, fts_q: str, top: int) -> int:
    """Insert paper_indications rows for the BM25-top `top` matches."""
    try:
        rows = conn.execute(
            "SELECT papers_fts.rowid AS pid, bm25(papers_fts) AS score "
            "FROM papers_fts "
            "WHERE papers_fts MATCH ? "
            "ORDER BY score "
            "LIMIT ?",
            (fts_q, top),
        ).fetchall()
    except Exception as e:
        print(f"  papers FTS error for {slug}: {e}")
        return 0

    if not rows:
        return 0

    # BM25 in SQLite returns negative scores; closer to 0 is worse, more negative is better.
    # Normalise to 0-1 (1 = best).
    scores = [r["score"] for r in rows]
    s_min, s_max = min(scores), max(scores)
    span = (s_min - s_max) or 1.0  # min is most negative

    inserted = 0
    for r in rows:
        rel = round((r["score"] - s_max) / span, 4) if span else 1.0
        # rel is 1.0 for the top hit (score == s_min), 0.0 for the worst.
        rel = 1.0 - rel  # invert so top hit = 1.0
        cur = conn.execute(
            "INSERT OR IGNORE INTO paper_indications (paper_id, indication_id, relevance) "
            "VALUES (?, ?, ?)",
            (r["pid"], indication_id, rel),
        )
        if cur.rowcount:
            inserted += 1
    return inserted


def route_trials(conn, indication_id: int, slug: str, fts_q: str) -> int:
    try:
        rows = conn.execute(
            "SELECT rowid AS tid FROM trials_fts WHERE trials_fts MATCH ?",
            (fts_q,),
        ).fetchall()
    except Exception as e:
        print(f"  trials FTS error for {slug}: {e}")
        return 0

    inserted = 0
    for r in rows:
        cur = conn.execute(
            "INSERT OR IGNORE INTO trial_indications (trial_id, indication_id) VALUES (?, ?)",
            (r["tid"], indication_id),
        )
        if cur.rowcount:
            inserted += 1
    return inserted


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true", help="Print what would be inserted, don't write.")
    ap.add_argument("--top", type=int, default=1000, help="Cap papers per indication by BM25 rank.")
    args = ap.parse_args()

    conn = db.connect()
    indications = {
        slug: i_id
        for slug, i_id in conn.execute("SELECT slug, id FROM indications").fetchall()
    }

    if not indications:
        print("ERROR: indications table is empty. Run indications_seed.py first.")
        sys.exit(1)

    total_papers = 0
    total_trials = 0
    summary = []

    for entry in SEED:
        slug = entry["slug"]
        if slug not in indications:
            print(f"SKIP {slug} (not in indications table)")
            continue
        i_id = indications[slug]

        # Prefer the strict pubmed_q for papers (high precision), falling back
        # to broad_q. For trials we use trial_q (looser).
        paper_q = to_fts5(entry.get("pubmed_q") or entry.get("broad_q") or "")
        trial_q = to_fts5(entry.get("trial_q") or entry.get("broad_q") or "")

        if args.dry:
            print(f"DRY {slug}")
            print(f"  papers query: {paper_q}")
            print(f"  trials query: {trial_q}")
            continue

        n_papers = route_papers(conn, i_id, slug, paper_q, args.top) if paper_q else 0
        n_trials = route_trials(conn, i_id, slug, trial_q) if trial_q else 0
        total_papers += n_papers
        total_trials += n_trials
        summary.append((slug, n_papers, n_trials))
        print(f"  {slug:35s} papers={n_papers:5d} trials={n_trials:4d}")

    if not args.dry:
        print()
        print(f"Total: {total_papers} paper_indications + {total_trials} trial_indications rows")
        print()
        print("=== Per-indication coverage ===")
        for slug, np, nt in sorted(summary, key=lambda r: -r[1]):
            print(f"  {slug:35s} {np:5d} papers · {nt:4d} trials")


if __name__ == "__main__":
    main()
