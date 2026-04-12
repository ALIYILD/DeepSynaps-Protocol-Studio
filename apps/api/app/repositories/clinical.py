from __future__ import annotations

from collections.abc import Iterable

from sqlalchemy import select, tuple_
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
    records_list = list(records)  # materialise once — records may be a generator

    # Bulk-fetch all existing records whose (dataset_name, record_key) matches any
    # incoming record, replacing the previous per-record SELECT (N+1 pattern).
    keys = [(r["dataset_name"], r["record_key"]) for r in records_list]
    existing_rows = session.scalars(
        select(ClinicalSeedRecord).where(
            tuple_(ClinicalSeedRecord.dataset_name, ClinicalSeedRecord.record_key).in_(keys)
        )
    ).all()
    existing = {(row.dataset_name, row.record_key): row for row in existing_rows}

    for record in records_list:
        key = (record["dataset_name"], record["record_key"])
        row = existing.get(key)
        if row is None:
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
        else:
            row.snapshot_id = snapshot_id
            row.source_file = record["source_file"]
            row.payload_json = record["payload_json"]
            row.content_hash = record["content_hash"]
    session.flush()


def count_seed_records(session: Session) -> int:
    return len(session.scalars(select(ClinicalSeedRecord.id)).all())
