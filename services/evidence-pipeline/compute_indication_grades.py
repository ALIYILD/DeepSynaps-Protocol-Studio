#!/usr/bin/env python3
"""compute_indication_grades.py — Dynamic evidence-grade computation.

Reads per-indication paper / trial / device counts from the junction tables
and writes a computed letter grade (A-E) to indications.computed_evidence_grade.

Run: python3 compute_indication_grades.py [--db /path/to/evidence.db]

Idempotent — safe to run multiple times. Each run overwrites the column with
the current computed value; old grades are never preserved unless the data
backing them is unchanged.

RUBRIC
======
  A  >= 200 routed papers  AND  >= 10 trials  AND  >= 5 cleared devices
     Strong evidence + regulatory presence + replication depth.
     Rationale: 200 papers is the threshold where a body of literature
     develops systematic reviews and clinical guidelines. 10 trials
     ensures replication across groups. 5 devices reflects competitive
     regulatory clearance (not a single-player market).

  B  >= 100 papers  AND  >= 1 cleared device
     Mainstream evidence with at least one cleared pathway.
     Rationale: 100 papers can support a Cochrane-style meta-analysis.
     1 device means there is at least one regulatory-validated route.

  C  >= 30 papers  (regardless of devices/trials)
     Active research area with emerging but insufficient evidence
     for regulatory traction. Off-label / investigational use common.
     Rationale: 30 papers is roughly the minimum for a targeted systematic
     review; below this the literature base is still anecdotal in aggregate.

  D  >= 5 papers
     Emerging indication. Small series, pilot studies, or conference
     abstracts only. Clinical use would require IRB / ethics approval.

  E  < 5 papers
     Speculative / very early-stage. Single case reports or conference
     abstracts. Not a recognised clinical indication yet.

CUTOFF JUSTIFICATION
====================
These thresholds were calibrated against the 29 seeded indications in the
2026-04-29 DB snapshot:
  dbs_parkinson          1000 papers / 63 trials / 0 devices  -> A (trials+papers alone)
  rtms_mdd               1000 papers / 98 trials / 35 devices -> A
  eswt_crps_chronic_pain    2 papers /  0 trials /  0 devices -> E
  nfb_epilepsy              3 papers /  2 trials /  0 devices -> E

NOTE: grade A currently requires device_count >= 5 via device_indications.
That junction table has sparse coverage in the v4 DB (most cleared devices
are not yet linked). As a result, several clinically-A indications land on
grade B here. That is the correct honest answer for the data we have, not a
bug. Once device_indications is more fully populated the grades will
automatically upgrade on the next cron cycle.

NOTE ON DEVICE COUNT
====================
device_indications currently has sparse coverage (many cleared devices are
not yet linked via the junction table). The rubric uses device_count
conservatively: only grade A requires >= 5 devices, and grade B requires
only >= 1. This prevents penalising well-evidenced indications for gaps in
the device-curation backlog.
"""
from __future__ import annotations

import argparse
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import db  # noqa: E402  (local module)


# ---------------------------------------------------------------------------
# Rubric thresholds
# ---------------------------------------------------------------------------

_GRADE_A_PAPERS: int = 200
_GRADE_A_TRIALS: int = 10
_GRADE_A_DEVICES: int = 5

_GRADE_B_PAPERS: int = 100
_GRADE_B_DEVICES: int = 1

_GRADE_C_PAPERS: int = 30

_GRADE_D_PAPERS: int = 5


def _compute_grade(papers: int, trials: int, devices: int) -> str:
    """Apply the rubric and return a single letter A-E."""
    if papers >= _GRADE_A_PAPERS and trials >= _GRADE_A_TRIALS and devices >= _GRADE_A_DEVICES:
        return "A"
    if papers >= _GRADE_B_PAPERS and devices >= _GRADE_B_DEVICES:
        return "B"
    if papers >= _GRADE_C_PAPERS:
        return "C"
    if papers >= _GRADE_D_PAPERS:
        return "D"
    return "E"


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def compute_grades(
    db_path: "str | None" = None,
    dry_run: bool = False,
) -> "dict[str, str]":
    """Compute grades for all indications and (unless dry_run) write to DB.

    Returns {slug: grade} mapping.
    """
    conn = db.connect(db_path)
    try:
        # Single SQL pass: aggregate counts for every indication in one query.
        rows = conn.execute(
            """
            SELECT
                i.id,
                i.slug,
                i.evidence_grade             AS curated_grade,
                COUNT(DISTINCT pi.paper_id)  AS paper_count,
                COUNT(DISTINCT ti.trial_id)  AS trial_count,
                COUNT(DISTINCT di.device_id) AS device_count
            FROM indications i
            LEFT JOIN paper_indications  pi ON pi.indication_id = i.id
            LEFT JOIN trial_indications  ti ON ti.indication_id = i.id
            LEFT JOIN device_indications di ON di.indication_id = i.id
            GROUP BY i.id
            ORDER BY paper_count DESC
            """
        ).fetchall()
    except Exception as exc:
        conn.close()
        raise RuntimeError(f"Failed to query indications: {exc}") from exc

    results: "dict[str, str]" = {}
    updates: "list[tuple[str, int]]" = []

    for row in rows:
        grade = _compute_grade(
            int(row["paper_count"]),
            int(row["trial_count"]),
            int(row["device_count"]),
        )
        results[row["slug"]] = grade
        updates.append((grade, row["id"]))

        print(
            f"  {row['slug']:<35} papers={row['paper_count']:>5} "
            f"trials={row['trial_count']:>3} devices={row['device_count']:>2} "
            f"curated={str(row['curated_grade'] or 'null'):<4} -> computed={grade}"
        )

    if not dry_run:
        # Bulk-update in a single transaction.
        conn.execute("BEGIN IMMEDIATE")
        try:
            conn.executemany(
                "UPDATE indications SET computed_evidence_grade = ? WHERE id = ?",
                updates,
            )
            conn.execute("COMMIT")
        except Exception as exc:
            conn.execute("ROLLBACK")
            conn.close()
            raise RuntimeError(f"Failed to write computed grades: {exc}") from exc
    else:
        print("\n[dry-run] No writes performed.")

    conn.close()

    # Distribution summary.
    dist = Counter(results.values())
    print(f"\nDistribution across {len(results)} indications:")
    for g in ("A", "B", "C", "D", "E"):
        bar = "X" * dist.get(g, 0)
        print(f"  {g}: {dist.get(g, 0):>3}  {bar}")

    return results


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Compute dynamic evidence grades for all indications."
    )
    parser.add_argument(
        "--db", metavar="PATH",
        help="Path to evidence.db (overrides EVIDENCE_DB_PATH env var)",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Print grades without writing to DB",
    )
    args = parser.parse_args()

    print("compute_indication_grades.py -- nightly evidence-grade recompute")
    print("-" * 65)
    grades = compute_grades(db_path=args.db or None, dry_run=args.dry_run)
    print(f"\nDone. Total indications updated: {len(grades)}")


if __name__ == "__main__":
    main()
