from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "apps" / "api"))

from app.database import SessionLocal, init_database  # noqa: E402
from app.repositories.clinical import get_latest_snapshot  # noqa: E402
from app.services.clinical_data import load_clinical_dataset, seed_clinical_dataset  # noqa: E402
from app.settings import get_settings  # noqa: E402


def main() -> int:
    settings = get_settings()
    init_database()
    session = SessionLocal()
    try:
        seeded_snapshot = seed_clinical_dataset(session)
        bundle = load_clinical_dataset()
        persisted_snapshot = get_latest_snapshot(session)
    finally:
        session.close()

    payload = {
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "snapshot_id": seeded_snapshot.snapshot_id,
        "source_hash": seeded_snapshot.source_hash,
        "source_root": seeded_snapshot.source_root,
        "total_records": seeded_snapshot.total_records,
        "counts": json.loads(seeded_snapshot.counts_json),
        "persisted_snapshot_id": persisted_snapshot.snapshot_id if persisted_snapshot is not None else None,
        "environment": settings.app_env,
        "datasets": sorted(bundle.tables.keys()),
    }

    settings.clinical_snapshot_root.mkdir(parents=True, exist_ok=True)
    output_path = settings.clinical_snapshot_root / "runtime-readiness.json"
    output_path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    print(output_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
