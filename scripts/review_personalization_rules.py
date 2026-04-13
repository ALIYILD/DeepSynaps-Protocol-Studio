#!/usr/bin/env python3
"""Print a deterministic human-readable review of personalization_rules.csv.

Usage (from repo root):
  python scripts/review_personalization_rules.py

Optional JSON snapshot to stdout (second line) is not emitted; use tests or import
`build_personalization_rule_review_snapshot` for machine-readable output.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "apps" / "api"))

from app.services.clinical_data import load_clinical_dataset  # noqa: E402
from app.services.personalization_governance import (  # noqa: E402
    build_personalization_rule_review_snapshot,
    format_personalization_rule_review_report,
)


def main() -> int:
    bundle = load_clinical_dataset()
    rules = bundle.tables["personalization_rules"]
    print(format_personalization_rule_review_report(rules))
    snap = build_personalization_rule_review_snapshot(rules)
    print("--- JSON snapshot (deterministic keys) ---")
    print(json.dumps(snap, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
