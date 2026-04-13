#!/usr/bin/env python3
"""Write data/snapshots/clinical-database/clinical-<hash>.json from current imported CSVs.

Run from repo root: python scripts/refresh_clinical_snapshot_manifest.py
Or: cd apps/api && python ../../scripts/refresh_clinical_snapshot_manifest.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
API_ROOT = REPO_ROOT / "apps" / "api"
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from app.services.clinical_data import load_clinical_dataset  # noqa: E402
from app.settings import CLINICAL_SNAPSHOT_ROOT  # noqa: E402


def main() -> None:
    bundle = load_clinical_dataset()
    snap = bundle.snapshot
    out = CLINICAL_SNAPSHOT_ROOT / f"{snap.snapshot_id}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "snapshot_id": snap.snapshot_id,
        "source_hash": snap.source_hash,
        "source_root": snap.source_root,
        "total_records": snap.total_records,
        "counts": json.loads(snap.counts_json),
        "created_at": snap.created_at,
    }
    out.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
