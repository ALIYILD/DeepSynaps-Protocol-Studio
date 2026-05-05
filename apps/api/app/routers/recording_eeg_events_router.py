"""REST API for QEEG analysis timeline events + ERP trials (Studio M5).

Paths: ``/api/v1/recordings/eeg/{analysis_id}/…`` — ``analysis_id`` is
``QEEGAnalysis.id`` (same as ``/studio/?id=``), not ``SessionRecording.id``.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.database import get_db_session
from app.eeg.events import (
    RecordingEvent,
    RecordingEventCreate,
    RecordingEventPatch,
    fragments_from_events,
    merge_patch,
)
from app.eeg.trials import (
    apply_sync_ms,
    parse_trials_import,
    trials_to_viewer_rows,
)
from app.routers.qeeg_raw_router import _load_analysis

router = APIRouter(prefix="/api/v1/recordings/eeg", tags=["recording-eeg-events"])

_RECORDING_EVENTS: dict[str, list[dict[str, Any]]] = {}
_RECORDING_TRIALS: dict[str, list[dict[str, Any]]] = {}


def _events_list(analysis_id: str) -> list[dict[str, Any]]:
    return _RECORDING_EVENTS.setdefault(analysis_id, [])


def _trials_list(analysis_id: str) -> list[dict[str, Any]]:
    return _RECORDING_TRIALS.setdefault(analysis_id, [])


@router.get("/{analysis_id}/events")
def list_events(
    analysis_id: str,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    require_minimum_role(actor, "clinician")
    _load_analysis(analysis_id, db, actor)
    raw = list(_events_list(analysis_id))
    return {
        "analysisId": analysis_id,
        "events": raw,
        "fragments": fragments_from_events(raw),
    }


@router.post("/{analysis_id}/events", status_code=201)
def create_event(
    analysis_id: str,
    body: RecordingEventCreate,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    require_minimum_role(actor, "clinician")
    _load_analysis(analysis_id, db, actor)
    ev = RecordingEvent(
        type=body.type,
        from_sec=body.from_sec,
        to_sec=body.to_sec,
        text=body.text,
        color=body.color,
        channel_scope=body.channel_scope,
        channels=body.channels,
    )
    row = ev.model_dump(mode="json", by_alias=True)
    _events_list(analysis_id).append(row)
    return {"ok": True, "event": row}


def _row_to_recording_event(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row.get("id"),
        "type": row.get("type"),
        "fromSec": row.get("fromSec", row.get("from_sec")),
        "toSec": row.get("toSec", row.get("to_sec")),
        "text": row.get("text"),
        "color": row.get("color"),
        "channelScope": row.get("channelScope", row.get("channel_scope", "all")),
        "channels": row.get("channels"),
    }


@router.patch("/{analysis_id}/events/{event_id}")
def patch_event(
    analysis_id: str,
    event_id: str,
    body: RecordingEventPatch,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    require_minimum_role(actor, "clinician")
    _load_analysis(analysis_id, db, actor)
    lst = _events_list(analysis_id)
    for i, row in enumerate(lst):
        if str(row.get("id")) != event_id:
            continue
        cur = RecordingEvent.model_validate(_row_to_recording_event(row))
        merged = merge_patch(cur, body)
        out = merged.model_dump(mode="json", by_alias=True)
        lst[i] = out
        return {"ok": True, "event": out}
    return Response(status_code=404)


@router.delete("/{analysis_id}/events/{event_id}", status_code=204)
def delete_event(
    analysis_id: str,
    event_id: str,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> Response:
    require_minimum_role(actor, "clinician")
    _load_analysis(analysis_id, db, actor)
    lst = _events_list(analysis_id)
    new_list = [r for r in lst if str(r.get("id")) != event_id]
    if len(new_list) == len(lst):
        return Response(status_code=404)
    _RECORDING_EVENTS[analysis_id] = new_list
    return Response(status_code=204)


@router.get("/{analysis_id}/trials")
def list_trials(
    analysis_id: str,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    require_minimum_role(actor, "clinician")
    _load_analysis(analysis_id, db, actor)
    raw = list(_trials_list(analysis_id))
    return {
        "analysisId": analysis_id,
        "trials": trials_to_viewer_rows(raw),
        "raw": raw,
    }

# core-schema-exempt: trial patch — recording events router-local


class TrialPatchIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    included: bool | None = None
    class_: str | None = Field(None, alias="class")
    response_ms: float | None = Field(None, alias="responseMs")

# core-schema-exempt: trial sync — recording events router-local


class TrialSyncIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    delta_ms: float = Field(..., alias="deltaMs")
    classes: list[str] | None = None


@router.patch("/{analysis_id}/trials/{trial_id}")
def patch_trial(
    analysis_id: str,
    trial_id: str,
    body: TrialPatchIn,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    require_minimum_role(actor, "clinician")
    _load_analysis(analysis_id, db, actor)
    lst = _trials_list(analysis_id)
    for i, tr in enumerate(lst):
        if str(tr.get("id")) != trial_id:
            continue
        if body.included is not None:
            tr["included"] = body.included
        if body.class_ is not None:
            tr["class"] = body.class_
        if body.response_ms is not None:
            tr["responseMs"] = body.response_ms
        lst[i] = tr
        return {"ok": True, "trial": trials_to_viewer_rows([tr])[0]}
    return Response(status_code=404)


@router.post("/{analysis_id}/trials/sync")
def sync_trials(
    analysis_id: str,
    body: TrialSyncIn,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    require_minimum_role(actor, "clinician")
    _load_analysis(analysis_id, db, actor)
    lst = _trials_list(analysis_id)
    apply_sync_ms(lst, float(body.delta_ms), body.classes)
    return {"ok": True, "trials": trials_to_viewer_rows(lst)}


@router.post("/{analysis_id}/trials/import")
async def import_trials(
    analysis_id: str,
    request: Request,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    require_minimum_role(actor, "clinician")
    _load_analysis(analysis_id, db, actor)
    body_bytes = await request.body()
    text = body_bytes.decode("utf-8", errors="replace")
    ct = request.headers.get("content-type", "")
    parsed = parse_trials_import(text, ct)
    _RECORDING_TRIALS[analysis_id] = parsed
    return {
        "ok": True,
        "count": len(parsed),
        "trials": trials_to_viewer_rows(parsed),
    }
