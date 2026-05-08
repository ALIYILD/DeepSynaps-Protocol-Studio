"""evidence-health.py -- quick row-count health check for the evidence pipeline DB.

Usage:
    python3 services/evidence-pipeline/scripts/evidence-health.py
    python3 services/evidence-pipeline/scripts/evidence-health.py --db /path/to/db

Prints one line per table so ingest state can be diagnosed at a glance.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

HERE = Path(__file__).resolve()
PIPELINE = HERE.parents[1]
sys.path.insert(0, str(PIPELINE))

import db  # noqa: E402


TABLES = ["indications", "papers", "trials", "devices", "adverse_events"]


def health(db_path: str | None = None) -> dict:
    conn = db.connect(db_path)
    counts: dict = {}
    for table in TABLES:
        try:
            counts[table] = conn.execute(f"SELECT count(*) FROM {table}").fetchone()[0]
        except Exception as exc:
            counts[table] = f"ERROR: {exc}"
    counts["db_path"] = db.resolve_db_path(db_path)
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description="Evidence DB health check")
    parser.add_argument("--db", default=None, help="Path to DB file (overrides env/default)")
    args = parser.parse_args()

    result = health(args.db)
    db_path = result.pop("db_path")
    print(f"DB : {db_path}")
    print("-" * 54)
    max_name = max(len(k) for k in result)
    for table, count in result.items():
        label = table.ljust(max_name)
        if isinstance(count, int):
            status = "" if count > 0 else "  <-- EMPTY"
            print(f"  {label}  {count:>10,}{status}")
        else:
            print(f"  {label}  {count}")
    total_content = sum(v for v in result.values() if isinstance(v, int))
    print("-" * 54)
    print(f"  {'total'.ljust(max_name)}  {total_content:>10,}")


if __name__ == "__main__":
    main()
