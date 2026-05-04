"""Studio EEG viewer — windowed traces + ephemeral markers (dev/in-memory)."""

from __future__ import annotations

import base64
import uuid
from collections import defaultdict
from typing import Any

import numpy as np
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.database import get_db_session
from app.eeg.montage import PRESET_SPECS, apply_montage_to_window
from app.routers.montages_router import get_recording_montage_pref, get_user_montage
from app.routers.qeeg_raw_router import _load_analysis, _require_mne

router = APIRouter(prefix="/api/v1/studio/eeg", tags=["studio-eeg"])

_STUDIO_MARKERS: dict[str, list[dict[str, Any]]] = defaultdict(list)


class MarkerIn(BaseModel):
    kind: str = Field(..., pattern="^(label|artifact|fragment)$")
    fromSec: float
    toSec: float | None = None
    text: str | None = None


def _encode_rows(rows: list[list[float]]) -> list[Any]:
    """Prefer compact base64 float32 blobs for large payloads."""
    out: list[Any] = []
    for row in rows:
        arr = np.asarray(row, dtype=np.float32)
        if arr.size > 2048:
            raw = arr.tobytes()
            out.append(base64.standard_b64encode(raw).decode("ascii"))
        else:
            out.append(row)
    return out


@router.get("/{analysis_id}/window")
def studio_eeg_window(
    analysis_id: str,
    fromSec: float = Query(..., alias="fromSec"),
    toSec: float = Query(..., alias="toSec"),
    maxPoints: int = Query(8000, alias="maxPoints", ge=64, le=50_000),
    channels: str | None = Query(None, description="Comma-separated channel names"),
    montageId: str | None = Query(None, alias="montageId"),
    badChannels: str | None = Query(None, alias="badChannels"),
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """Return a viewer-shaped signal window (µV, downsampled server-side)."""
    require_minimum_role(actor, "clinician")
    _load_analysis(analysis_id, db, actor)
    _require_mne()

    from app.services.eeg_signal_service import (
        extract_signal_window,
        extract_signal_window_rest,
        load_raw_for_analysis,
    )

    raw = load_raw_for_analysis(analysis_id, db)
    ch_list = [c.strip() for c in channels.split(",")] if channels else None

    effective_mid = montageId or get_recording_montage_pref(analysis_id) or "builtin:raw"
    bad_set = {b.strip() for b in badChannels.split(",") if b.strip()} if badChannels else set()

    montage_warns: list[str] = []

    if effective_mid == "builtin:rest":
        window, rw = extract_signal_window_rest(
            raw,
            t_start=fromSec,
            t_end=toSec,
            channels=ch_list,
            max_points_per_channel=maxPoints,
        )
        montage_warns.extend(rw)
        out_channels = list(window["channels"])
        rows = window["data"]
    else:
        window = extract_signal_window(
            raw,
            t_start=fromSec,
            t_end=toSec,
            window_sec=max(toSec - fromSec, 0.01),
            channels=ch_list,
            max_points_per_channel=maxPoints,
        )
        user_spec = (
            get_user_montage(effective_mid)
            if effective_mid not in PRESET_SPECS
            else None
        )
        out_channels, rows, mw, _meta = apply_montage_to_window(
            ch_names=list(window["channels"]),
            data_rows=window["data"],
            montage_id=effective_mid,
            bad_channels=bad_set,
            user_spec=user_spec,
        )
        montage_warns.extend(mw)

    encoded = _encode_rows(rows)

    sfreq = float(window["sfreq"])

    return {
        "sampleRateHz": sfreq,
        "channels": out_channels,
        "fromSec": float(window["t_start"]),
        "toSec": float(window["t_end"]),
        "data": encoded,
        "totalDurationSec": float(window["total_duration_sec"]),
        "fragments": [],
        "events": _STUDIO_MARKERS.get(analysis_id, []),
        "montageId": effective_mid,
        "montageWarnings": montage_warns,
    }


@router.post("/{analysis_id}/markers")
def post_marker(
    analysis_id: str,
    body: MarkerIn,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    require_minimum_role(actor, "clinician")
    _load_analysis(analysis_id, db, actor)
    mid = str(uuid.uuid4())
    entry = {
        "id": mid,
        "kind": body.kind,
        "fromSec": body.fromSec,
        "toSec": body.toSec,
        "text": body.text,
    }
    _STUDIO_MARKERS[analysis_id].append(entry)
    return {"ok": True, "marker": entry}


@router.delete("/{analysis_id}/markers/{marker_id}")
def delete_marker(
    analysis_id: str,
    marker_id: str,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    require_minimum_role(actor, "clinician")
    _load_analysis(analysis_id, db, actor)
    lst = _STUDIO_MARKERS.get(analysis_id, [])
    _STUDIO_MARKERS[analysis_id] = [m for m in lst if m.get("id") != marker_id]
    return {"ok": True}
