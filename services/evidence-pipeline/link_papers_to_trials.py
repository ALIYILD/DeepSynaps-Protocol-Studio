"""link_papers_to_trials.py — bridge papers ↔ trials via NCT IDs in abstracts.

ClinicalTrials.gov registry IDs follow the form `NCT` + 8 digits (e.g.
`NCT01234567`). Papers that report on a registered trial almost always
mention the NCT ID in the abstract or methods text. After abstract
enrichment lands, scanning each abstract for `NCT\\d{8}` patterns yields
a (paper, trial) edge — the missing link between the 184k papers corpus
and the 1,279 trials corpus.

Output: rows in `paper_trial_links` (see 009_paper_trial_links.sql).
- paper_id, nct_id are required (PRIMARY KEY).
- trial_id is FK-resolved when the matching trial exists; if the paper
  cites an NCT we don't have yet, trial_id stays NULL but the paper→NCT
  edge is still preserved.

Idempotent. INSERT OR IGNORE on (paper_id, nct_id) makes re-runs cheap.

Usage:
    python3 services/evidence-pipeline/link_papers_to_trials.py [--dry] [--limit N]
"""
from __future__ import annotations

import argparse
import logging
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import db as _db  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("link_papers_to_trials")

# ClinicalTrials.gov format: NCT followed by exactly 8 digits.
# Tolerant: allow surrounding punctuation but require word boundaries so we
# don't accidentally match longer alphanumeric strings.
_NCT_RE = re.compile(r"\bNCT0\d{7}\b", re.IGNORECASE)


def find_nct_ids(text: str) -> set[str]:
    """Return the set of unique NCT IDs (uppercased) in `text`."""
    if not text:
        return set()
    return {m.group(0).upper() for m in _NCT_RE.finditer(text)}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=None)
    ap.add_argument("--dry", action="store_true",
                    help="Scan + report; don't INSERT.")
    ap.add_argument("--limit", type=int, default=None,
                    help="Cap papers scanned (default: all enriched papers).")
    args = ap.parse_args()

    db_path = _db.resolve_db_path(args.db)
    log.info("DB: %s", db_path)

    conn = _db.connect(db_path)

    # Build a lookup of NCT → trial_id once.
    nct_to_trial_id: dict[str, int] = {
        str(row["nct_id"]).upper(): row["id"]
        for row in conn.execute(
            "SELECT id, nct_id FROM trials WHERE nct_id IS NOT NULL"
        ).fetchall()
    }
    log.info("trials with NCT id: %d", len(nct_to_trial_id))

    sql = (
        "SELECT id, pmid, abstract FROM papers "
        "WHERE abstract IS NOT NULL AND length(abstract) > 0"
        + (f" LIMIT {args.limit}" if args.limit else "")
    )
    rows = conn.execute(sql).fetchall()
    log.info("scanning %d enriched papers for NCT mentions", len(rows))

    n_papers_with_nct = 0
    n_links_inserted = 0
    n_links_resolved = 0
    n_unresolved_ncts: set[str] = set()

    for r in rows:
        ncts = find_nct_ids(r["abstract"])
        if not ncts:
            continue
        n_papers_with_nct += 1
        for nct in ncts:
            trial_id = nct_to_trial_id.get(nct)
            if trial_id is None:
                n_unresolved_ncts.add(nct)
            else:
                n_links_resolved += 1

            if args.dry:
                continue

            cur = conn.execute(
                "INSERT OR IGNORE INTO paper_trial_links "
                "(paper_id, trial_id, nct_id) VALUES (?, ?, ?)",
                (r["id"], trial_id, nct),
            )
            if cur.rowcount:
                n_links_inserted += 1

    log.info("papers with at least one NCT id: %d", n_papers_with_nct)
    log.info("paper→trial links resolved (FK populated): %d", n_links_resolved)
    log.info("paper→NCT edges inserted (incl. unresolved): %d",
             n_links_inserted if not args.dry else 0)
    log.info("unique unresolved NCT ids (papers cite trials we don't have): %d",
             len(n_unresolved_ncts))


if __name__ == "__main__":
    main()
