"""
Stim-target engine.

Pure-function core: takes a list of ``TargetAtlasEntry`` (from
constants.py) + optional patient fMRI/structural info, returns
``list[StimTarget]`` in the output schema.

Personalisation hooks:
    * sgACC-anticorrelated DLPFC target for MDD  (Fox 2012, Cash 2021)
    * Lesion-aware fallback for stroke / tumour  (reserved, v0 no-op)
    * DMN-hub personalisation for AD TPS precuneus (reserved)

Every StimTarget carries:
    - MNI coord
    - clinical method label
    - reference DOIs
    - suggested device parameters (defaults pulled from constants.py)
    - confidence tier based on how personalised the target is
    - disclaimer (decision-support positioning, v1)
"""
from __future__ import annotations

import logging
from typing import Iterable

from .constants import (
    ALL_TARGETS,
    TargetAtlasEntry,
    TFUS_FDA_LIMITS,
)
from .schemas import StimParameters, StimTarget

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Default parameter presets
# ---------------------------------------------------------------------------
def _default_rtms_mdd_params() -> StimParameters:
    # FDA-cleared iTBS MDD (Blumberger et al., Lancet 2018; SAINT 2021)
    return StimParameters(
        protocol="iTBS",
        sessions=30,
        pulses_per_session=600,
        intensity_pct_rmt=120.0,
        frequency_hz=50.0,     # burst frequency (3 pulses)
    )


def _default_rtms_ocd_params() -> StimParameters:
    # Carmi et al. 2019 — dTMS, 20 Hz pre-SMA/dmPFC
    return StimParameters(
        protocol="20Hz_dTMS",
        sessions=29,
        pulses_per_session=2000,
        intensity_pct_rmt=100.0,
        frequency_hz=20.0,
    )


def _default_rtms_pain_params() -> StimParameters:
    return StimParameters(
        protocol="10Hz_rTMS",
        sessions=15,
        pulses_per_session=3000,
        intensity_pct_rmt=90.0,
        frequency_hz=10.0,
    )


def _default_tps_ad_params(roi_volume_cm3: float | None = None,
                           pulses_per_hemi: int = 800) -> StimParameters:
    return StimParameters(
        protocol="TPS",
        sessions=6,
        pulses_per_session=pulses_per_hemi * 2,
        pulses_per_hemisphere=pulses_per_hemi,
        roi_volume_cm3=roi_volume_cm3,
    )


def _default_tfus_params() -> StimParameters:
    return StimParameters(
        protocol="tFUS",
        sessions=1,
        pulses_per_session=0,
        duty_cycle_pct=5.0,
        derated_i_spta_mw_cm2=float(TFUS_FDA_LIMITS["i_spta_derated_mw_cm2"]),
        derated_i_sppa_w_cm2=float(TFUS_FDA_LIMITS["i_sppa_derated_w_cm2_max_clinical"]),
        mechanical_index=0.8,
    )


def _params_for(entry: TargetAtlasEntry) -> StimParameters:
    if entry.modality == "rtms":
        if entry.condition == "mdd":
            return _default_rtms_mdd_params()
        if entry.condition == "ocd":
            return _default_rtms_ocd_params()
        if entry.condition in ("chronic_pain", "tinnitus"):
            return _default_rtms_pain_params()
        return StimParameters(protocol="10Hz_rTMS", sessions=20, intensity_pct_rmt=100.0,
                              pulses_per_session=3000, frequency_hz=10.0)
    if entry.modality == "tps":
        return _default_tps_ad_params()
    if entry.modality == "tfus":
        return _default_tfus_params()
    return StimParameters()


# ---------------------------------------------------------------------------
# Atlas -> StimTarget
# ---------------------------------------------------------------------------
def atlas_entry_to_stim_target(
    entry: TargetAtlasEntry,
    *,
    confidence: str = "medium",
    patient_xyz: tuple[float, float, float] | None = None,
    extra_paper_ids: list[int] | None = None,
) -> StimTarget:
    """Convert a canonical atlas entry into a StimTarget schema object."""
    return StimTarget(
        target_id=entry.target_id,
        modality=entry.modality,    # type: ignore[arg-type]
        condition=entry.condition,
        region_name=entry.region_name,
        region_code=entry.region_code,
        mni_xyz=entry.mni_xyz,
        patient_xyz=patient_xyz,
        method=entry.method,
        method_reference_dois=list(entry.reference_dois),
        suggested_parameters=_params_for(entry),
        supporting_paper_ids_from_medrag=extra_paper_ids or [],
        confidence=confidence,   # type: ignore[arg-type]
    )


# ---------------------------------------------------------------------------
# Personalised DLPFC target for MDD
# ---------------------------------------------------------------------------
def build_personalised_dlpfc_target(
    mni_xyz: tuple[float, float, float],
    sgacc_fc_z: float,
    *,
    patient_xyz: tuple[float, float, float] | None = None,
) -> StimTarget:
    """Wrap the output of ``fmri.find_personalized_dlpfc_target`` into a StimTarget.

    Confidence is ``high`` if the chosen voxel has strong sgACC-negative
    FC (z < -0.3), ``medium`` otherwise.
    """
    confidence = "high" if sgacc_fc_z < -0.3 else "medium"
    return StimTarget(
        target_id="rTMS_MDD_personalised_sgACC",
        modality="rtms",
        condition="mdd",
        region_name="Left DLPFC — patient-specific sgACC anticorrelation",
        region_code="dlpfc_l",
        mni_xyz=mni_xyz,
        patient_xyz=patient_xyz,
        method="sgACC_anticorrelation_personalised",
        method_reference_dois=[
            "10.1016/j.biopsych.2012.04.028",      # Fox 2012
            "10.1176/appi.ajp.2021.20101429",      # Cash / SAINT 2021
        ],
        suggested_parameters=_default_rtms_mdd_params(),
        confidence=confidence,  # type: ignore[arg-type]
    )


# ---------------------------------------------------------------------------
# Condition -> candidate targets
# ---------------------------------------------------------------------------
def targets_for_condition(
    condition: str,
    *,
    modality_filter: Iterable[str] | None = None,
    atlas: list[TargetAtlasEntry] | None = None,
) -> list[TargetAtlasEntry]:
    """Return atlas entries whose ``condition`` matches (case-insensitive)."""
    src = atlas if atlas is not None else ALL_TARGETS
    cond = condition.lower()
    out = [e for e in src if e.condition.lower() == cond]
    if modality_filter is not None:
        mods = {m.lower() for m in modality_filter}
        out = [e for e in out if e.modality in mods]
    return out


# ---------------------------------------------------------------------------
# Top-level target engine
# ---------------------------------------------------------------------------
def build_stim_targets(
    condition: str,
    *,
    personalised_dlpfc: tuple[tuple[float, float, float], float] | None = None,
    include_modalities: tuple[str, ...] = ("rtms", "tps", "tfus"),
    max_targets_per_modality: int = 3,
) -> list[StimTarget]:
    """Main entry point: condition + optional personalised fMRI -> list[StimTarget].

    ``personalised_dlpfc`` = (mni_xyz, sgacc_fc_z) from
    ``fmri.find_personalized_dlpfc_target``. If provided and condition is
    MDD we prepend the personalised target and drop the Fox group target.

    Returns targets sorted as: personalised (if any) -> rTMS -> TPS -> tFUS,
    truncated to ``max_targets_per_modality`` per modality.
    """
    out: list[StimTarget] = []

    if personalised_dlpfc is not None and condition.lower() == "mdd":
        mni, z = personalised_dlpfc
        out.append(build_personalised_dlpfc_target(mni, z))

    for modality in include_modalities:
        cands = targets_for_condition(condition, modality_filter={modality})
        # Skip Fox group target if we've already added the personalised one
        if out and modality == "rtms":
            cands = [c for c in cands if c.target_id != "rTMS_MDD_Fox_sgACC"]
        for entry in cands[:max_targets_per_modality]:
            conf = "medium"
            if modality == "tfus":
                conf = "low"   # TFUS is largely investigational
            out.append(atlas_entry_to_stim_target(entry, confidence=conf))
    return out
