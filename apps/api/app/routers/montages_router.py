"""Montage catalog + recording preference (Studio)."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.database import get_db_session
from app.eeg.montage import list_builtin_metadata

router = APIRouter(prefix="/api/v1", tags=["montages"])

# Ephemeral user montages (replace with DB in production).
_USER_MONTAGES: dict[str, dict[str, Any]] = {}

# analysis_id / recording_id → preferred montage id
_RECORDING_MONTAGE_PREF: dict[str, str] = {}

# core-schema-exempt: montage upsert payload — studio router-local


class MontageUpsert(BaseModel):
    id: str | None = None
    name: str = Field(..., min_length=1, max_length=200)
    family: str = "custom"
    spec: dict[str, Any]

# core-schema-exempt: recording montage body — studio router-local


class RecordingMontageBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    montage_id: str = Field(..., alias="montageId")


@router.get("/montages")
def list_montages(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    require_minimum_role(actor, "clinician")
    return {
        "builtins": list_builtin_metadata(),
        "custom": [
            {
                "id": k,
                "name": v.get("name", k),
                "family": v.get("family", "custom"),
            }
            for k, v in _USER_MONTAGES.items()
        ],
    }


@router.post("/montages")
def upsert_montage(
    body: MontageUpsert,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    require_minimum_role(actor, "clinician")
    mid = body.id or str(uuid.uuid4())
    entry = {
        "id": mid,
        "name": body.name,
        "family": body.family,
        "spec": body.spec,
    }
    _USER_MONTAGES[mid] = entry
    return {"ok": True, "montage": entry}


@router.post("/recordings/{recording_id}/montage")
def set_recording_montage(
    recording_id: str,
    body: RecordingMontageBody,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Persist preferred montage for a recording / analysis id (studio convention)."""
    require_minimum_role(actor, "clinician")
    _ = db  # hook for future persistence
    _RECORDING_MONTAGE_PREF[recording_id] = body.montage_id
    return {"ok": True, "recordingId": recording_id, "montageId": body.montage_id}


def get_recording_montage_pref(recording_id: str) -> str | None:
    return _RECORDING_MONTAGE_PREF.get(recording_id)


def get_user_montage(montage_id: str) -> dict[str, Any] | None:
    entry = _USER_MONTAGES.get(montage_id)
    if entry is None:
        return None
    return entry.get("spec")
