"""EEG Studio acquisition rows."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.persistence.models import EegStudioDerivative, EegStudioRecording


def list_for_patient(db: Session, patient_id: str) -> list[EegStudioRecording]:
    stmt = (
        select(EegStudioRecording)
        .where(
            EegStudioRecording.patient_id == patient_id,
            EegStudioRecording.deleted_at.is_(None),
        )
        .order_by(EegStudioRecording.recorded_at.desc())
    )
    return list(db.scalars(stmt).all())


def list_derivatives_for_recording(db: Session, recording_id: str) -> list[EegStudioDerivative]:
    stmt = (
        select(EegStudioDerivative)
        .where(
            EegStudioDerivative.recording_id == recording_id,
            EegStudioDerivative.deleted_at.is_(None),
        )
        .order_by(EegStudioDerivative.created_at.desc())
    )
    return list(db.scalars(stmt).all())


def seed_placeholder_derivatives(db: Session, recording_id: str) -> None:
    """Create lightweight placeholder rows so the drawer is populated."""
    kinds = ["filtered", "ica_clean", "spectra", "indices", "erp", "report"]
    now = datetime.now(timezone.utc)
    for k in kinds:
        exists = db.scalar(
            select(EegStudioDerivative.id).where(
                EegStudioDerivative.recording_id == recording_id,
                EegStudioDerivative.kind == k,
            )
        )
        if exists:
            continue
        db.add(
            EegStudioDerivative(
                id=str(uuid.uuid4()),
                recording_id=recording_id,
                kind=k,
                storage_key=f"placeholder/{recording_id}/{k}",
                metadata_json=json.dumps({"status": "pending"}),
                deleted_at=None,
                created_at=now,
            )
        )


def recording_to_api(row: EegStudioRecording) -> dict[str, Any]:
    meta = {}
    try:
        meta = json.loads(row.metadata_json or "{}")
    except json.JSONDecodeError:
        pass
    return {
        "id": row.id,
        "patientId": row.patient_id,
        "recordedAt": row.recorded_at.isoformat() if row.recorded_at else None,
        "operatorName": row.operator_name,
        "equipment": row.equipment,
        "sampleRateHz": row.sample_rate_hz,
        "calibrationFileRef": row.calibration_file_ref,
        "capModel": row.cap_model,
        "durationSec": row.duration_sec,
        "rawStorageKey": row.raw_storage_key,
        "metadata": meta,
        "createdAt": row.created_at.isoformat() if row.created_at else None,
    }


def derivative_to_api(row: EegStudioDerivative) -> dict[str, Any]:
    meta = {}
    try:
        meta = json.loads(row.metadata_json or "{}")
    except json.JSONDecodeError:
        pass
    return {
        "id": row.id,
        "recordingId": row.recording_id,
        "kind": row.kind,
        "storageKey": row.storage_key,
        "metadata": meta,
        "createdAt": row.created_at.isoformat() if row.created_at else None,
    }
