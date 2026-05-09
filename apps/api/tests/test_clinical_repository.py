"""Tests for app.repositories.clinical — snapshot and seed CRUD contracts (PR 83/N).

Covers:
- upsert_snapshot creates new snapshot
- upsert_snapshot updates existing snapshot fields
- get_snapshot_by_hash returns snapshot
- get_snapshot_by_id returns snapshot
- get_latest_snapshot returns most recent snapshot
- get_snapshot_by_hash returns None for unknown hash
- get_snapshot_by_id returns None for unknown id
- upsert_seed_records inserts new records
- upsert_seed_records updates existing records on re-run
- count_seed_records reflects inserted count
"""
from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone


def _ts() -> str:
    return datetime.now(timezone.utc).isoformat()


def _snap_id() -> str:
    return f"snap-{uuid.uuid4().hex[:8]}"


def _hash(data: str) -> str:
    return hashlib.sha256(data.encode()).hexdigest()[:16]


def _make_snapshot(db, snapshot_id: str | None = None, source_hash: str | None = None):
    from app.repositories.clinical import upsert_snapshot

    sid = snapshot_id or _snap_id()
    shash = source_hash or _hash(sid)
    return upsert_snapshot(
        db,
        snapshot_id=sid,
        source_hash=shash,
        source_root="/data/clinical",
        total_records=100,
        counts_json=json.dumps({"brain_regions": 50, "biomarkers": 50}),
        created_at=_ts(),
    )


def test_upsert_snapshot_creates_new_record():
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        sid = _snap_id()
        snap = _make_snapshot(db, snapshot_id=sid)
        db.commit()
        assert snap.snapshot_id == sid
        assert snap.total_records == 100
        assert snap.source_root == "/data/clinical"
    finally:
        db.close()


def test_upsert_snapshot_updates_existing():
    from app.database import SessionLocal
    from app.repositories.clinical import upsert_snapshot

    db = SessionLocal()
    try:
        sid = _snap_id()
        shash = _hash(sid)
        upsert_snapshot(
            db,
            snapshot_id=sid,
            source_hash=shash,
            source_root="/data/v1",
            total_records=50,
            counts_json="{}",
            created_at=_ts(),
        )
        db.commit()
        # Update same snapshot_id
        updated = upsert_snapshot(
            db,
            snapshot_id=sid,
            source_hash=_hash(sid + "v2"),
            source_root="/data/v2",
            total_records=200,
            counts_json=json.dumps({"total": 200}),
            created_at=_ts(),
        )
        db.commit()
        assert updated.total_records == 200
        assert updated.source_root == "/data/v2"
    finally:
        db.close()


def test_get_snapshot_by_hash_returns_snapshot():
    from app.database import SessionLocal
    from app.repositories.clinical import get_snapshot_by_hash

    db = SessionLocal()
    try:
        sid = _snap_id()
        unique_hash = _hash(sid + "get_by_hash")
        _make_snapshot(db, snapshot_id=sid, source_hash=unique_hash)
        db.commit()
        found = get_snapshot_by_hash(db, unique_hash)
        assert found is not None
        assert found.snapshot_id == sid
    finally:
        db.close()


def test_get_snapshot_by_hash_returns_none_for_unknown():
    from app.database import SessionLocal
    from app.repositories.clinical import get_snapshot_by_hash

    db = SessionLocal()
    try:
        result = get_snapshot_by_hash(db, "deadbeef00000000")
        assert result is None
    finally:
        db.close()


def test_get_snapshot_by_id_returns_snapshot():
    from app.database import SessionLocal
    from app.repositories.clinical import get_snapshot_by_id

    db = SessionLocal()
    try:
        sid = _snap_id()
        _make_snapshot(db, snapshot_id=sid)
        db.commit()
        found = get_snapshot_by_id(db, sid)
        assert found is not None
        assert found.snapshot_id == sid
    finally:
        db.close()


def test_get_snapshot_by_id_returns_none_for_unknown():
    from app.database import SessionLocal
    from app.repositories.clinical import get_snapshot_by_id

    db = SessionLocal()
    try:
        result = get_snapshot_by_id(db, "snap-does-not-exist")
        assert result is None
    finally:
        db.close()


def test_get_latest_snapshot_returns_most_recent():
    from app.database import SessionLocal
    from app.repositories.clinical import get_latest_snapshot

    db = SessionLocal()
    try:
        sid1 = _snap_id()
        sid2 = _snap_id()
        _make_snapshot(db, snapshot_id=sid1)
        db.commit()
        snap2 = _make_snapshot(db, snapshot_id=sid2)
        db.commit()
        latest = get_latest_snapshot(db)
        assert latest is not None
        # The latest inserted should have highest id
        assert latest.snapshot_id == sid2
    finally:
        db.close()


def test_upsert_seed_records_inserts_new_records():
    from app.database import SessionLocal
    from app.repositories.clinical import count_seed_records, upsert_seed_records

    db = SessionLocal()
    try:
        before = count_seed_records(db)
        sid = _snap_id()
        records = [
            {
                "dataset_name": "brain_regions",
                "record_key": f"BR-{uuid.uuid4().hex[:6]}",
                "snapshot_id": sid,
                "source_file": "brain_regions.csv",
                "payload_json": json.dumps({"name": "PFC"}),
                "content_hash": _hash(f"br-{uuid.uuid4().hex}"),
            }
            for _ in range(3)
        ]
        upsert_seed_records(db, snapshot_id=sid, records=records)
        db.commit()
        after = count_seed_records(db)
        assert after == before + 3
    finally:
        db.close()


def test_upsert_seed_records_updates_existing_on_rerun():
    from app.database import SessionLocal
    from app.repositories.clinical import count_seed_records, upsert_seed_records

    db = SessionLocal()
    try:
        sid = _snap_id()
        record_key = f"BR-{uuid.uuid4().hex[:6]}"
        records_v1 = [
            {
                "dataset_name": "brain_regions",
                "record_key": record_key,
                "snapshot_id": sid,
                "source_file": "brain_regions.csv",
                "payload_json": json.dumps({"name": "PFC_v1"}),
                "content_hash": _hash("v1"),
            }
        ]
        upsert_seed_records(db, snapshot_id=sid, records=records_v1)
        db.commit()

        count_after_insert = count_seed_records(db)

        records_v2 = [
            {
                "dataset_name": "brain_regions",
                "record_key": record_key,
                "snapshot_id": sid,
                "source_file": "brain_regions.csv",
                "payload_json": json.dumps({"name": "PFC_v2"}),
                "content_hash": _hash("v2"),
            }
        ]
        upsert_seed_records(db, snapshot_id=sid, records=records_v2)
        db.commit()

        count_after_upsert = count_seed_records(db)
        # No new rows should have been added — same key
        assert count_after_upsert == count_after_insert
    finally:
        db.close()
