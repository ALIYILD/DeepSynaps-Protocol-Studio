from __future__ import annotations

from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.persistence.models import ClinicalDatasetSnapshotRecord, ClinicalSeedRecord


def get_snapshot_by_hash(session: Session, source_hash: str) -> ClinicalDatasetSnapshotRecord | None:
    return session.scalar(
        select(ClinicalDatasetSnapshotRecord).where(ClinicalDatasetSnapshotRecord.source_hash == source_hash)
    )


def get_snapshot_by_id(session: Session, snapshot_id: str) -> ClinicalDatasetSnapshotRecord | None:
    return session.scalar(
        select(ClinicalDatasetSnapshotRecord).where(ClinicalDatasetSnapshotRecord.snapshot_id == snapshot_id)
    )


def get_latest_snapshot(session: Session) -> ClinicalDatasetSnapshotRecord | None:
    return session.scalar(
        select(ClinicalDatasetSnapshotRecord).order_by(ClinicalDatasetSnapshotRecord.id.desc()).limit(1)
    )


def upsert_snapshot(
    session: Session,
    *,
    snapshot_id: str,
    source_hash: str,
    source_root: str,
    total_records: int,
    counts_json: str,
    created_at: str,
) -> ClinicalDatasetSnapshotRecord:
    snapshot = get_snapshot_by_id(session, snapshot_id)
    if snapshot is None:
        snapshot = ClinicalDatasetSnapshotRecord(
            snapshot_id=snapshot_id,
            source_hash=source_hash,
            source_root=source_root,
            total_records=total_records,
            counts_json=counts_json,
            created_at=created_at,
        )
        session.add(snapshot)
        session.flush()
        return snapshot

    snapshot.source_hash = source_hash
    snapshot.source_root = source_root
    snapshot.total_records = total_records
    snapshot.counts_json = counts_json
    snapshot.created_at = created_at
    session.flush()
    return snapshot


def upsert_seed_records(
    session: Session,
    *,
    snapshot_id: str,
    records: Iterable[dict[str, str]],
) -> None:
    for record in records:
        existing = session.scalar(
            select(ClinicalSeedRecord).where(
                ClinicalSeedRecord.dataset_name == record["dataset_name"],
                ClinicalSeedRecord.record_key == record["record_key"],
            )
        )
        if existing is None:
            session.add(
                ClinicalSeedRecord(
                    dataset_name=record["dataset_name"],
                    record_key=record["record_key"],
                    snapshot_id=snapshot_id,
                    source_file=record["source_file"],
                    payload_json=record["payload_json"],
                    content_hash=record["content_hash"],
                )
            )
            continue

        existing.snapshot_id = snapshot_id
        existing.source_file = record["source_file"]
        existing.payload_json = record["payload_json"]
        existing.content_hash = record["content_hash"]
    session.flush()


def count_seed_records(session: Session) -> int:
    return len(session.scalars(select(ClinicalSeedRecord.id)).all())
