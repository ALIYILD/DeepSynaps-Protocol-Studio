import json
from pathlib import Path

from sqlalchemy import select

from app.database import SessionLocal
from app.persistence.models import ClinicalDatasetSnapshotRecord, ClinicalSeedRecord
from app.services.clinical_data import EXPECTED_COUNTS, load_clinical_dataset, seed_clinical_dataset


def test_clinical_dataset_loader_validates_all_expected_record_counts() -> None:
    bundle = load_clinical_dataset()

    assert bundle.snapshot.total_records == 201
    assert json.loads(bundle.snapshot.counts_json) == EXPECTED_COUNTS


def test_clinical_dataset_seeding_is_idempotent() -> None:
    session = SessionLocal()
    try:
        first_snapshot = seed_clinical_dataset(session)
        second_snapshot = seed_clinical_dataset(session)

        snapshots = session.scalars(select(ClinicalDatasetSnapshotRecord)).all()
        seeded_records = session.scalars(select(ClinicalSeedRecord)).all()

        assert first_snapshot.snapshot_id == second_snapshot.snapshot_id
        assert len(snapshots) == 1
        assert len(seeded_records) == 201
    finally:
        session.close()


def test_snapshot_manifest_is_written_for_loaded_dataset() -> None:
    session = SessionLocal()
    try:
        snapshot = seed_clinical_dataset(session)
        manifest_path = Path(load_clinical_dataset().snapshot.source_root).parents[1] / "snapshots" / "clinical-database" / f"{snapshot.snapshot_id}.json"
        assert manifest_path.exists()

        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        assert manifest["total_records"] == 201
        assert manifest["counts"] == EXPECTED_COUNTS
    finally:
        session.close()
