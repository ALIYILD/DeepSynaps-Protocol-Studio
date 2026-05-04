"""EEG Studio database browser — patient card (WinEEG parity) + recordings."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.database import get_db_session
from app.eeg_database.exporters.csv_export import edf_to_csv_bytes
from app.eeg_database.exporters.edf_plus import export_raw_edf_bytes
from app.eeg_database.exporters.json_export import recording_meta_bundle
from app.eeg_database.icd10_core import suggest_icd10
from app.eeg_database.importers.edf_plus import inspect_edf_bytes
from app.eeg_database.io_media import read_media_bytes, write_media_bytes
from app.eeg_database.patients import (
    get_merged_card,
    list_patients_rows,
    list_revisions,
    patch_profile,
)
from app.eeg_database.recordings import (
    derivative_to_api,
    list_derivatives_for_recording,
    list_for_patient,
    recording_to_api,
    seed_placeholder_derivatives,
)
from app.persistence.models import EegStudioRecording, Patient
from app.repositories.patients import get_patient

router = APIRouter(prefix="/api/v1/studio/eeg-database", tags=["studio-eeg-database"])


class ProfilePatchIn(BaseModel):
    patch: dict[str, Any] = Field(default_factory=dict)


class MergePatientsIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    primary_patient_id: str = Field(validation_alias="primaryPatientId")
    duplicate_patient_id: str = Field(validation_alias="duplicatePatientId")


class ExportRecordingsIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    recording_ids: list[str] = Field(validation_alias="recordingIds")
    format: Literal["edf", "csv", "json"]


def _require_owner_patient(
    db: Session, actor_id: str, patient_id: str
) -> Patient:
    p = get_patient(db, patient_id, actor_id)
    if p is None:
        raise HTTPException(status_code=404, detail="patient_not_found")
    return p


def _get_recording_owned(
    db: Session, actor_id: str, recording_id: str
) -> tuple[EegStudioRecording, Patient]:
    row = db.get(EegStudioRecording, recording_id)
    if row is None or row.deleted_at is not None:
        raise HTTPException(status_code=404, detail="recording_not_found")
    p = _require_owner_patient(db, actor_id, row.patient_id)
    return row, p


@router.get("/icd/suggestions")
def icd_suggestions(
    q: str = "",
    limit: int = 20,
    _: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    require_minimum_role(_, "clinician")
    return {"items": suggest_icd10(q, limit=min(limit, 50))}


@router.get("/patients")
def list_patients_api(
    q: str | None = None,
    smart: str | None = Query(None, description='e.g. "last_7_days", "pediatric"'),
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    require_minimum_role(actor, "clinician")
    rows = list_patients_rows(db, actor.actor_id, q, smart, limit, offset)
    ids = [p.id for p, _ in rows]
    counts: dict[str, int] = {}
    if ids:
        stmt = (
            select(EegStudioRecording.patient_id, func.count())
            .where(
                EegStudioRecording.patient_id.in_(ids),
                EegStudioRecording.deleted_at.is_(None),
            )
            .group_by(EegStudioRecording.patient_id)
        )
        for pid, c in db.execute(stmt).all():
            counts[str(pid)] = int(c)

    items = []
    for p, lr in rows:
        prof: dict[str, Any] = {}
        if p.eeg_studio_profile_json:
            try:
                loaded = json.loads(p.eeg_studio_profile_json)
                if isinstance(loaded, dict):
                    prof = loaded
            except json.JSONDecodeError:
                prof = {}
        clinical = prof.get("clinical") if isinstance(prof, dict) else {}
        diag = ""
        if isinstance(clinical, dict):
            diag = clinical.get("diagnosisLabel") or clinical.get("diagnosisIcdCode") or ""
        items.append(
            {
                "id": p.id,
                "firstName": p.first_name,
                "lastName": p.last_name,
                "dob": p.dob,
                "externalId": (prof.get("identification") or {}).get("externalPatientId")
                if isinstance(prof, dict)
                else None,
                "diagnosis": diag or p.primary_condition,
                "lastRecordingAt": lr.isoformat() if lr else None,
                "recordingCount": counts.get(p.id, 0),
                "status": p.status,
            }
        )
    return {"items": items, "limit": limit, "offset": offset}


@router.get("/patients/{patient_id}/card")
def get_card(
    patient_id: str,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    require_minimum_role(actor, "clinician")
    p = _require_owner_patient(db, actor.actor_id, patient_id)
    return get_merged_card(db, p)


@router.patch("/patients/{patient_id}/profile")
def patch_card_profile(
    patient_id: str,
    body: ProfilePatchIn,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    require_minimum_role(actor, "clinician")
    p = _require_owner_patient(db, actor.actor_id, patient_id)
    merged = patch_profile(db, p, body.patch, actor.actor_id)
    db.commit()
    return {"profile": merged}


@router.get("/patients/{patient_id}/profile/history")
def profile_history(
    patient_id: str,
    limit: int = 40,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    require_minimum_role(actor, "clinician")
    _require_owner_patient(db, actor.actor_id, patient_id)
    revs = list_revisions(db, patient_id, limit=limit)
    return {
        "items": [
            {
                "id": r.id,
                "editorId": r.editor_id,
                "createdAt": r.created_at.isoformat() if r.created_at else None,
                "snapshotJson": r.snapshot_json[:2000],
            }
            for r in revs
        ]
    }


@router.get("/patients/{patient_id}/recordings")
def recordings_for_patient(
    patient_id: str,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    require_minimum_role(actor, "clinician")
    _require_owner_patient(db, actor.actor_id, patient_id)
    recs = list_for_patient(db, patient_id)
    out = []
    for r in recs:
        dlist = list_derivatives_for_recording(db, r.id)
        entry = recording_to_api(r)
        entry["derivatives"] = [derivative_to_api(d) for d in dlist]
        out.append(entry)
    return {"recordings": out}


@router.post("/patients/{patient_id}/recordings/import-edf")
async def import_edf(
    patient_id: str,
    file: UploadFile = File(...),
    operator_name: str | None = None,
    equipment: str | None = None,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    require_minimum_role(actor, "clinician")
    _require_owner_patient(db, actor.actor_id, patient_id)
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="empty_file")
    info = inspect_edf_bytes(data)
    rid = str(uuid.uuid4())
    file_ref = f"{patient_id}/eeg_studio/{rid}.edf"
    write_media_bytes(file_ref, data)
    now = datetime.now(timezone.utc)
    row = EegStudioRecording(
        id=rid,
        patient_id=patient_id,
        clinician_id=actor.actor_id,
        recorded_at=now,
        operator_name=operator_name,
        equipment=equipment,
        sample_rate_hz=info.get("sampleRateHz"),
        calibration_file_ref=None,
        cap_model=None,
        impedance_log_json=None,
        raw_storage_key=file_ref,
        duration_sec=float(info.get("durationSec") or 0),
        metadata_json=json.dumps(
            {
                "channelNames": info.get("channelNames"),
                "channelCount": info.get("channelCount"),
                "originalFilename": file.filename,
            }
        ),
        search_blob=(file.filename or "") + " edf",
        deleted_at=None,
        created_at=now,
    )
    db.add(row)
    seed_placeholder_derivatives(db, rid)
    db.commit()
    db.refresh(row)
    return {"recording": recording_to_api(row)}


@router.delete("/recordings/{recording_id}")
def soft_delete_recording(
    recording_id: str,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, str]:
    require_minimum_role(actor, "clinician")
    row, _ = _get_recording_owned(db, actor.actor_id, recording_id)
    row.deleted_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": "true"}


@router.post("/export/recordings")
def export_recordings(
    body: ExportRecordingsIn,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> Response:
    require_minimum_role(actor, "clinician")
    if len(body.recording_ids) != 1:
        raise HTTPException(
            status_code=400,
            detail="export_currently_supports_single_recording",
        )
    rid = body.recording_ids[0]
    row, patient = _get_recording_owned(db, actor.actor_id, rid)
    card = get_merged_card(db, patient)

    if body.format == "edf":
        blob = export_raw_edf_bytes(row.raw_storage_key)
        return Response(
            content=blob,
            media_type="application/octet-stream",
            headers={
                "Content-Disposition": f'attachment; filename="recording-{rid}.edf"'
            },
        )
    if body.format == "csv":
        blob = edf_to_csv_bytes(row.raw_storage_key, read_media_bytes)
        return Response(
            content=blob,
            media_type="text/csv",
            headers={
                "Content-Disposition": f'attachment; filename="recording-{rid}.csv"'
            },
        )
    blob = recording_meta_bundle(recording_to_api(row), card)
    return Response(
        content=blob,
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="recording-{rid}-meta.json"'
        },
    )


@router.post("/patients/merge")
def merge_patients(
    body: MergePatientsIn,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    require_minimum_role(actor, "clinician")
    primary = _require_owner_patient(db, actor.actor_id, body.primary_patient_id)
    dup = _require_owner_patient(db, actor.actor_id, body.duplicate_patient_id)
    if primary.id == dup.id:
        raise HTTPException(status_code=400, detail="same_patient")

    for rec in db.scalars(
        select(EegStudioRecording).where(EegStudioRecording.patient_id == dup.id)
    ).all():
        rec.patient_id = primary.id

    dup.status = "merged_away"
    if dup.notes:
        dup.notes = (dup.notes + "\n[Merged into " + primary.id + "]")
    else:
        dup.notes = "[Merged into " + primary.id + "]"
    db.commit()
    return {"ok": True, "primaryPatientId": primary.id}
