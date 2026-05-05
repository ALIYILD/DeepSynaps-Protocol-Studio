"""Studio spike detection / averaging / dipole-at-peak (M11)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.database import get_db_session
from app.routers.qeeg_raw_router import _load_analysis, _require_mne
from app.services.eeg_signal_service import load_raw_for_analysis
from app.spikes.averaging import spike_triggered_average
from app.spikes.detect_ai import augment_spikes_with_ai
from app.spikes.detect_classical import detect_spikes_classical
from app.spikes.dipole_spike import dipole_at_spike_peak

router = APIRouter(prefix="/api/v1/studio/eeg", tags=["studio-spikes"])

# core-schema-exempt: spike detection params — studio spikes router-local


class SpikeDetectIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    from_sec: float = Field(..., alias="fromSec")
    to_sec: float = Field(..., alias="toSec")
    channels: list[str] | None = None
    amp_uv_min: float = Field(70.0, alias="ampUvMin")
    dur_ms_min: float = Field(20.0, alias="durMsMin")
    dur_ms_max: float = Field(70.0, alias="durMsMax")
    deriv_z_min: float = Field(3.5, alias="derivZMin")
    use_ai: bool = Field(True, alias="useAi")
    ai_confidence_min: float = Field(0.0, alias="aiConfidenceMin")

# core-schema-exempt: spike average — studio spikes router-local


class SpikeAverageIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    peaks: list[dict[str, Any]]
    pre_ms: float = Field(300.0, alias="preMs")
    post_ms: float = Field(300.0, alias="postMs")

# core-schema-exempt: spike dipole — studio spikes router-local


class SpikeDipoleIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    peak_sec: float = Field(..., alias="peakSec")
    pre_ms: float = Field(50.0, alias="preMs")
    post_ms: float = Field(50.0, alias="postMs")


@router.get("/{analysis_id}/spikes/capabilities")
def spikes_capabilities(
    analysis_id: str,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    require_minimum_role(actor, "clinician")
    _load_analysis(analysis_id, db, actor)
    return {
        "analysisId": analysis_id,
        "defaults": {
            "ampUvMin": 70,
            "durMsMin": 20,
            "durMsMax": 70,
            "averagePreMs": 300,
            "averagePostMs": 300,
            "dipolePreMs": 50,
            "dipolePostMs": 50,
        },
        "ai": {"optionalOnnx": "app/spikes/models/spike_cnn.onnx", "fallback": "heuristic"},
    }


@router.post("/{analysis_id}/spikes/detect")
def spikes_detect(
    analysis_id: str,
    body: SpikeDetectIn,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    require_minimum_role(actor, "clinician")
    _load_analysis(analysis_id, db, actor)
    try:
        _require_mne()
        raw = load_raw_for_analysis(analysis_id, db)
        classical = detect_spikes_classical(
            raw,
            from_sec=body.from_sec,
            to_sec=body.to_sec,
            channel_names=body.channels,
            amp_uv_min=body.amp_uv_min,
            dur_ms_min=body.dur_ms_min,
            dur_ms_max=body.dur_ms_max,
            deriv_z_min=body.deriv_z_min,
        )
        spikes = classical
        if body.use_ai:
            spikes = augment_spikes_with_ai(raw, classical)
        if body.ai_confidence_min > 0:
            spikes = [s for s in spikes if float(s.get("aiConfidence") or 0) >= body.ai_confidence_min]
        return {
            "ok": True,
            "analysisId": analysis_id,
            "spikes": spikes,
            "count": len(spikes),
        }
    except Exception as e:
        return {"ok": False, "analysisId": analysis_id, "error": str(e)[:800], "spikes": []}


@router.post("/{analysis_id}/spikes/average")
def spikes_average(
    analysis_id: str,
    body: SpikeAverageIn,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    require_minimum_role(actor, "clinician")
    _load_analysis(analysis_id, db, actor)
    try:
        _require_mne()
        raw = load_raw_for_analysis(analysis_id, db)
        out = spike_triggered_average(raw, body.peaks, pre_ms=body.pre_ms, post_ms=body.post_ms)
        out["analysisId"] = analysis_id
        return out
    except Exception as e:
        return {"ok": False, "analysisId": analysis_id, "error": str(e)[:800]}


@router.post("/{analysis_id}/spikes/dipole-at-peak")
def spikes_dipole_at_peak(
    analysis_id: str,
    body: SpikeDipoleIn,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    require_minimum_role(actor, "clinician")
    _load_analysis(analysis_id, db, actor)
    try:
        _require_mne()
        raw = load_raw_for_analysis(analysis_id, db)
        out = dipole_at_spike_peak(raw, body.peak_sec, pre_ms=body.pre_ms, post_ms=body.post_ms)
        out["analysisId"] = analysis_id
        return out
    except Exception as e:
        return {"ok": False, "analysisId": analysis_id, "error": str(e)[:800]}
