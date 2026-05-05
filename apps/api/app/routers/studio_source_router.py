"""Studio source localization — LORETA / spectra LORETA / dipole (M10)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.database import get_db_session
from app.erp.epoching import build_epochs, get_trials_for_analysis
from app.routers.qeeg_raw_router import _load_analysis, _require_mne
from app.services.eeg_signal_service import load_raw_for_analysis
from app.source.forward import describe_forward_capabilities
from app.source.pipelines import dipole_pipeline, loreta_erp_pipeline, loreta_spectra_pipeline

router = APIRouter(prefix="/api/v1/studio/eeg", tags=["studio-source"])

# core-schema-exempt: LORETA/dipole epoch base — studio source router-local


class SourceEpochIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    stimulus_classes: list[str] = Field(default_factory=list, alias="stimulusClasses")
    pre_stim_ms: float = Field(-200, alias="preStimMs")
    post_stim_ms: float = Field(1000, alias="postStimMs")
    baseline_from_ms: float = Field(-200, alias="baselineFromMs")
    baseline_to_ms: float = Field(0, alias="baselineToMs")
    reject_uv: dict[str, float] | None = Field(None, alias="rejectUv")
    flat_uv: dict[str, float] | None = Field(None, alias="flatUv")


class LoretaErpIn(SourceEpochIn):
    pick_time_ms: float | None = Field(None, alias="pickTimeMs")
    method: str = Field("sLORETA", alias="method")


class LoretaSpectraIn(SourceEpochIn):
    band_hz: tuple[float, float] = Field((8.0, 13.0), alias="bandHz")
    from_sec: float = Field(..., alias="fromSec")
    to_sec: float = Field(..., alias="toSec")


class DipoleIn(SourceEpochIn):
    step: int = Field(4, alias="step")


def _epochs(analysis_id: str, db: Session, body: SourceEpochIn):
    _require_mne()
    raw = load_raw_for_analysis(analysis_id, db)
    trials = get_trials_for_analysis(analysis_id)
    epochs, _trial_ids = build_epochs(
        raw,
        trials=trials,
        stimulus_classes=body.stimulus_classes,
        tmin_sec=body.pre_stim_ms / 1000.0,
        tmax_sec=body.post_stim_ms / 1000.0,
        baseline=(body.baseline_from_ms / 1000.0, body.baseline_to_ms / 1000.0),
        reject_uv=body.reject_uv,
        flat_uv=body.flat_uv,
    )
    return epochs


@router.get("/{analysis_id}/source/capabilities")
def source_capabilities(
    analysis_id: str,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    require_minimum_role(actor, "clinician")
    _load_analysis(analysis_id, db, actor)
    return describe_forward_capabilities()


@router.post("/{analysis_id}/source/loreta-erp")
def loreta_erp(
    analysis_id: str,
    body: LoretaErpIn,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    require_minimum_role(actor, "clinician")
    _load_analysis(analysis_id, db, actor)
    try:
        epochs = _epochs(analysis_id, db, body)
        method = body.method if body.method in ("sLORETA", "MNE", "dSPM") else "sLORETA"
        out = loreta_erp_pipeline(epochs, pick_time_ms=body.pick_time_ms, method=method)
        out["analysisId"] = analysis_id
        return out
    except Exception as e:
        return {"ok": False, "analysisId": analysis_id, "error": str(e)[:800]}


@router.post("/{analysis_id}/source/loreta-spectra")
def loreta_spectra(
    analysis_id: str,
    body: LoretaSpectraIn,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    require_minimum_role(actor, "clinician")
    _load_analysis(analysis_id, db, actor)
    try:
        _require_mne()
        raw = load_raw_for_analysis(analysis_id, db)
        raw.pick_types(eeg=True, meg=False, stim=False)
        out = loreta_spectra_pipeline(
            raw,
            band_hz=body.band_hz,
            from_sec=body.from_sec,
            to_sec=body.to_sec,
        )
        out["analysisId"] = analysis_id
        return out
    except Exception as e:
        return {"ok": False, "analysisId": analysis_id, "error": str(e)[:800]}


@router.post("/{analysis_id}/source/dipole")
def dipole_fit(
    analysis_id: str,
    body: DipoleIn,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    require_minimum_role(actor, "clinician")
    _load_analysis(analysis_id, db, actor)
    try:
        epochs = _epochs(analysis_id, db, body)
        out = dipole_pipeline(epochs, step=body.step)
        out["analysisId"] = analysis_id
        return out
    except Exception as e:
        return {"ok": False, "analysisId": analysis_id, "error": str(e)[:800]}
