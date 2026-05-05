"""Studio ERP / ERD / wavelet / ERCoh / ICA / PFA API (M9)."""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends
from pydantic import AliasChoices, BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.database import get_db_session
from app.erp.cluster_stats import cluster_test_between_epochs
from app.erp.coherence import ercoh_pair_timecourse
from app.erp.epoching import apply_linear_baseline_to_epochs, build_epochs, get_trials_for_analysis
from app.erp.averaging import evoked_by_condition, per_trial_erp_uv, reaverage_from_trials
from app.erp.erd import erd_percent_timecourse
from app.erp.ica_erp import fit_ica_on_epochs
from app.erp.paradigms import list_paradigms
from app.erp.pfa import pfa_on_epochs
from app.erp.wavelet import morlet_tfr_epochs, wavelet_pair_coherence_seed
from app.routers.qeeg_raw_router import _load_analysis, _require_mne
from app.services.eeg_signal_service import load_raw_for_analysis

router = APIRouter(prefix="/api/v1/studio/eeg", tags=["studio-erp"])


class ErpComputeIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    stimulus_classes: list[str] = Field(
        default_factory=list,
        validation_alias=AliasChoices("stimulusClasses", "stim_classes", "stimClasses"),
    )
    pre_stim_ms: float = Field(-200, alias="preStimMs")
    post_stim_ms: float = Field(1000, alias="postStimMs")
    baseline_from_ms: float = Field(-200, alias="baselineFromMs")
    baseline_to_ms: float = Field(0, alias="baselineToMs")
    baseline_correction: Literal["none", "mean", "linear"] = Field(
        "mean",
        validation_alias=AliasChoices("baselineCorrection", "baseline_correction"),
    )
    reject_uv: dict[str, float] | None = Field(None, alias="rejectUv")
    flat_uv: dict[str, float] | None = Field(None, alias="flatUv")
    return_trial_erps: bool = Field(False, alias="returnTrialErps")
    artifact_threshold_uv: float | None = Field(
        None,
        validation_alias=AliasChoices("artifactThresholdUv", "artifact_threshold_uv"),
    )


def _epochs_common(analysis_id: str, db: Session, body: ErpComputeIn) -> tuple[Any, list[str]]:
    _require_mne()
    raw = load_raw_for_analysis(analysis_id, db)
    trials = get_trials_for_analysis(analysis_id)
    tmin = body.pre_stim_ms / 1000.0
    tmax = body.post_stim_ms / 1000.0
    bl = (body.baseline_from_ms / 1000.0, body.baseline_to_ms / 1000.0)
    if body.baseline_correction == "none":
        baseline_mne: tuple[float, float] | None = None
    elif body.baseline_correction == "mean":
        baseline_mne = bl
    else:
        baseline_mne = None
    epochs, tids = build_epochs(
        raw,
        trials=trials,
        stimulus_classes=body.stimulus_classes,
        tmin_sec=tmin,
        tmax_sec=tmax,
        baseline=baseline_mne,
        reject_uv=body.reject_uv,
        flat_uv=body.flat_uv,
    )
    if body.baseline_correction == "linear":
        apply_linear_baseline_to_epochs(epochs, tmin_bl=bl[0], tmax_bl=bl[1])
    return epochs, tids


@router.get("/{analysis_id}/erp/trials")
def erp_trials_list(
    analysis_id: str,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """Trial rows for ERP UI (same backing store as recording trials)."""
    require_minimum_role(actor, "clinician")
    _load_analysis(analysis_id, db, actor)
    raw = get_trials_for_analysis(analysis_id)
    rows: list[dict[str, Any]] = []
    for i, tr in enumerate(raw):
        if not tr.get("included", True):
            continue
        rows.append(
            {
                "index": i,
                "class": str(tr.get("class", "Standard")).strip(),
                "trialId": str(tr.get("id", "")),
                "onsetSec": float(tr.get("onsetSec", tr.get("onset_sec", 0))),
                "included": True,
            }
        )
    return {"analysisId": analysis_id, "trials": rows}


@router.get("/{analysis_id}/erp/paradigms")
def erp_paradigms(
    analysis_id: str,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    require_minimum_role(actor, "clinician")
    _load_analysis(analysis_id, db, actor)
    return {"paradigms": list_paradigms()}


def _waveforms_from_evoked(evok: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for cls, pack in evok.items():
        out.append(
            {
                "class": cls,
                "meanUv": pack.get("meanUv"),
                "timesSec": pack.get("timesSec"),
                "nTrials": pack.get("nTrials"),
            }
        )
    return out


def _trials_client_shape(tri_list: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    if not tri_list:
        return []
    rows: list[dict[str, Any]] = []
    for row in tri_list:
        rows.append(
            {
                "index": row.get("epochIndex"),
                "class": row.get("class"),
                "included": row.get("included", True),
                "trialId": row.get("trialId", ""),
                "erpUv": row.get("erpUv"),
            }
        )
    return rows


@router.post("/{analysis_id}/erp/compute")
def erp_compute(
    analysis_id: str,
    body: ErpComputeIn,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    require_minimum_role(actor, "clinician")
    _load_analysis(analysis_id, db, actor)
    rej = dict(body.reject_uv) if body.reject_uv else {}
    if body.artifact_threshold_uv is not None:
        rej["eeg"] = float(body.artifact_threshold_uv)
    body_eff = body.model_copy(update={"return_trial_erps": True, "reject_uv": rej or None})
    epochs, trial_ids_ordered = _epochs_common(analysis_id, db, body_eff)
    evok = evoked_by_condition(epochs)
    tri_list = None
    if body_eff.return_trial_erps:
        tri_list = per_trial_erp_uv(epochs, trial_ids=trial_ids_ordered)
    counts = {k: len(epochs[k]) for k in epochs.event_id}
    warn_p300 = False
    for _k, n in counts.items():
        if n < 30:
            warn_p300 = True
    waveforms = _waveforms_from_evoked(evok)
    trials_out = _trials_client_shape(tri_list)
    return {
        "analysisId": analysis_id,
        "evokedByClass": evok,
        "trialCounts": counts,
        "warnLowTrialCount": warn_p300,
        "trialsDetail": tri_list,
        "trialIdsOrdered": trial_ids_ordered,
        "channelNames": epochs.ch_names,
        "eventId": dict(epochs.event_id),
        "waveforms": waveforms,
        "trials": trials_out,
    }


class ReaverageIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    times_sec: list[float] = Field(..., alias="timesSec")
    event_keys: list[str] = Field(..., alias="eventKeys")
    trials: list[dict[str, Any]]


@router.post("/{analysis_id}/erp/reaverage")
def erp_reaverage(
    analysis_id: str,
    body: ReaverageIn,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    require_minimum_role(actor, "clinician")
    _load_analysis(analysis_id, db, actor)
    out = reaverage_from_trials(body.trials, times_sec=body.times_sec, event_id_keys=body.event_keys)
    return {"analysisId": analysis_id, **out}


class ErdIn(ErpComputeIn):
    band_hz: tuple[float, float] = Field((8.0, 13.0), alias="bandHz")


@router.post("/{analysis_id}/erp/erd")
def erp_erd(
    analysis_id: str,
    body: ErdIn,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    require_minimum_role(actor, "clinician")
    _load_analysis(analysis_id, db, actor)
    epochs, _trial_ids = _epochs_common(analysis_id, db, body)
    out = erd_percent_timecourse(
        epochs,
        band_hz=body.band_hz,
        baseline_tmin=body.baseline_from_ms / 1000.0,
        baseline_tmax=body.baseline_to_ms / 1000.0,
    )
    return {"analysisId": analysis_id, **out}


class WaveletIn(ErpComputeIn):
    f_min: float = Field(1.0, alias="fMin")
    f_max: float = Field(80.0, alias="fMax")
    n_freqs: int = Field(60, alias="nFreqs")
    n_cycles: float = Field(7.0, alias="nCycles")


@router.post("/{analysis_id}/erp/wavelet")
def erp_wavelet(
    analysis_id: str,
    body: WaveletIn,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    require_minimum_role(actor, "clinician")
    _load_analysis(analysis_id, db, actor)
    epochs, _trial_ids = _epochs_common(analysis_id, db, body)
    out = morlet_tfr_epochs(
        epochs,
        fmin=body.f_min,
        fmax=body.f_max,
        n_freqs=body.n_freqs,
        n_cycles=body.n_cycles,
    )
    return {"analysisId": analysis_id, **out}


class WcohIn(WaveletIn):
    seed_channel_index: int = Field(0, alias="seedChannelIndex")


@router.post("/{analysis_id}/erp/wavelet-coherence")
def erp_wavelet_coherence(
    analysis_id: str,
    body: WcohIn,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    require_minimum_role(actor, "clinician")
    _load_analysis(analysis_id, db, actor)
    epochs, _trial_ids = _epochs_common(analysis_id, db, body)
    out = wavelet_pair_coherence_seed(
        epochs,
        seed_ch_idx=body.seed_channel_index,
        fmin=body.f_min,
        fmax=body.f_max,
        n_freqs=min(body.n_freqs, 32),
        n_cycles=body.n_cycles,
    )
    return {"analysisId": analysis_id, **out}


class ErcohIn(ErpComputeIn):
    channel_a_index: int = Field(0, alias="channelAIndex")
    channel_b_index: int = Field(1, alias="channelBIndex")
    band_hz: tuple[float, float] = Field((8.0, 13.0), alias="bandHz")
    win_ms: float = Field(250.0, alias="winMs")


@router.post("/{analysis_id}/erp/ercoh")
def erp_ercoh(
    analysis_id: str,
    body: ErcohIn,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    require_minimum_role(actor, "clinician")
    _load_analysis(analysis_id, db, actor)
    epochs, _trial_ids = _epochs_common(analysis_id, db, body)
    out = ercoh_pair_timecourse(
        epochs,
        ch_a=body.channel_a_index,
        ch_b=body.channel_b_index,
        band_hz=body.band_hz,
        win_ms=body.win_ms,
    )
    return {"analysisId": analysis_id, **out}


class IcaIn(ErpComputeIn):
    n_components: int = Field(15, alias="nComponents")


@router.post("/{analysis_id}/erp/ica")
def erp_ica(
    analysis_id: str,
    body: IcaIn,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    require_minimum_role(actor, "clinician")
    _load_analysis(analysis_id, db, actor)
    epochs, _trial_ids = _epochs_common(analysis_id, db, body)
    out = fit_ica_on_epochs(epochs, n_components=body.n_components)
    return {"analysisId": analysis_id, **out}


class PfaIn(ErpComputeIn):
    n_factors: int = Field(4, alias="nFactors")
    rotate: str | None = Field("promax", alias="rotate")


@router.post("/{analysis_id}/erp/pfa")
def erp_pfa(
    analysis_id: str,
    body: PfaIn,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    require_minimum_role(actor, "clinician")
    _load_analysis(analysis_id, db, actor)
    epochs, _trial_ids = _epochs_common(analysis_id, db, body)
    out = pfa_on_epochs(epochs, n_factors=body.n_factors, rotate=body.rotate)
    return {"analysisId": analysis_id, **out}


class ClusterIn(ErpComputeIn):
    condition_a: str = Field(..., alias="conditionA")
    condition_b: str = Field(..., alias="conditionB")
    n_permutations: int = Field(512, alias="nPermutations")


@router.post("/{analysis_id}/erp/cluster-test")
def erp_cluster(
    analysis_id: str,
    body: ClusterIn,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    require_minimum_role(actor, "clinician")
    _load_analysis(analysis_id, db, actor)
    epochs, _trial_ids = _epochs_common(analysis_id, db, body)
    out = cluster_test_between_epochs(
        epochs,
        cond_a=body.condition_a,
        cond_b=body.condition_b,
        n_permutations=body.n_permutations,
    )
    return {"analysisId": analysis_id, **out}
