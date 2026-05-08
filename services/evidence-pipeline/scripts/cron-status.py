#!/usr/bin/env python3
"""cron-status.py — show the freshness and health of the enrichment cron.

Reads the `enrichment_runs` table populated by nightly-enrichment.sh.
Reports: last successful run age, last finished run, last 5 cycles with
deltas, and a "stale?" verdict (yes if no success in the last 4 hours).

Exit code is 0 unless the cron looks stale (1) or the table is missing (2).
Useful for piping into `osascript -e 'display notification ...'` from a
secondary LaunchAgent if you want push alerts on failure.

Usage:
    python3 services/evidence-pipeline/scripts/cron-status.py
    python3 services/evidence-pipeline/scripts/cron-status.py --json
"""
from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

_HERE = Path(__file__).resolve().parent
_PIPELINE_DIR = _HERE.parent
sys.path.insert(0, str(_PIPELINE_DIR))
import db as _db  # noqa: E402


STALE_AFTER_HOURS = 4


def _hours_since(iso_ts: str | None) -> float | None:
    if not iso_ts:
        return None
    try:
        dt = datetime.fromisoformat(iso_ts.replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    delta = datetime.now(tz=timezone.utc) - dt
    return delta.total_seconds() / 3600


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=None)
    ap.add_argument("--json", action="store_true",
                    help="Emit machine-readable JSON instead of human text.")
    args = ap.parse_args()

    db_path = _db.resolve_db_path(args.db)
    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
    except sqlite3.OperationalError as exc:
        print(f"cannot open DB at {db_path}: {exc}", file=sys.stderr)
        return 2

    try:
        last_success = conn.execute(
            "SELECT * FROM enrichment_runs WHERE status='success' "
            "ORDER BY finished_at DESC LIMIT 1"
        ).fetchone()
        last_finished = conn.execute(
            "SELECT * FROM enrichment_runs WHERE status IN ('success','failed') "
            "ORDER BY finished_at DESC LIMIT 1"
        ).fetchone()
        recent = conn.execute(
            "SELECT * FROM enrichment_runs ORDER BY started_at DESC LIMIT 5"
        ).fetchall()
    except sqlite3.OperationalError as exc:
        print(f"enrichment_runs table missing — apply migration "
              f"010_enrichment_runs.sql first ({exc})", file=sys.stderr)
        return 2

    last_success_age = _hours_since(last_success["finished_at"]) if last_success else None
    is_stale = (
        last_success_age is None
        or last_success_age > STALE_AFTER_HOURS
    )

    if args.json:
        out = {
            "stale": is_stale,
            "stale_after_hours": STALE_AFTER_HOURS,
            "last_success_at": last_success["finished_at"] if last_success else None,
            "last_success_age_hours": (
                round(last_success_age, 2) if last_success_age is not None else None
            ),
            "last_finished_status": (
                last_finished["status"] if last_finished else None
            ),
            "recent_runs": [
                {
                    k: r[k] for k in (
                        "id", "started_at", "finished_at", "status", "trigger",
                        "papers_w_abstract_start", "papers_w_abstract_end",
                        "paper_trial_links_start", "paper_trial_links_end",
                        "protocols_start", "protocols_end",
                    )
                }
                for r in recent
            ],
        }
        print(json.dumps(out, indent=2, default=str))
    else:
        print("=== DeepSynaps evidence cron status ===")
        if last_success:
            print(f"  last success     : {last_success['finished_at']}  "
                  f"({last_success_age:.1f} h ago)")
        else:
            print("  last success     : (none yet)")
        if last_finished:
            print(f"  last cycle ended : {last_finished['finished_at']}  "
                  f"status={last_finished['status']}")
        else:
            print("  last cycle ended : (none yet)")
        print(f"  STALE?           : {'YES' if is_stale else 'no'}  "
              f"(threshold: {STALE_AFTER_HOURS}h)")
        print()
        print("  recent cycles:")
        for r in recent:
            d_abs = (r["papers_w_abstract_end"] or 0) - (r["papers_w_abstract_start"] or 0)
            d_pl = (r["paper_trial_links_end"] or 0) - (r["paper_trial_links_start"] or 0)
            d_pr = (r["protocols_end"] or 0) - (r["protocols_start"] or 0)
            print(
                f"    {r['started_at']}  ({r['trigger']})  status={r['status']:<8}  "
                f"Δabs=+{d_abs:<5d}  Δpl=+{d_pl:<4d}  Δpr=+{d_pr:<4d}"
            )

    return 1 if is_stale else 0


if __name__ == "__main__":
    raise SystemExit(main())
