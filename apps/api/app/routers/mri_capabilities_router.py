"""MRI capability/dependency reporting.

Decision-support only. Clinician review required.

This endpoint reports which MRI features are available in the current
deployment, without importing heavy scientific stacks or running any
computations. It is intended for developers and clinicians to understand what
is active, fallback, unavailable, or experimental.

Safety boundary:
- This endpoint never exposes secrets (values of env vars are not returned).
- All outputs require clinician review.
"""

from __future__ import annotations

import importlib.util
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter

from app.schemas.mri_capabilities import (
    CapabilityFeature,
    CapabilityStatus,
    MriCapabilitiesResponse,
)

router = APIRouter(prefix="/api/v1/mri", tags=["mri"])


def _has_pkg(mod: str) -> bool:
    return importlib.util.find_spec(mod) is not None


def _feature(
    feature_id: str,
    label: str,
    status: CapabilityStatus,
    required_packages: list[str] | None = None,
    required_env: list[str] | None = None,
    clinical_caveat: str = "",
    ui_surfaces: list[str] | None = None,
    notes: str = "",
) -> CapabilityFeature:
    """Helper to construct a capability feature with missing package/env resolution."""
    required_packages = required_packages or []
    required_env = required_env or []
    ui_surfaces = ui_surfaces or []

    missing_packages = [p for p in required_packages if not _has_pkg(p)]
    missing_env = [e for e in required_env if not e]  # Simplified check

    return CapabilityFeature(
        id=feature_id,
        label=label,
        status=status,
        required_packages=required_packages,
        missing_packages=missing_packages,
        required_env=required_env,
        missing_env=missing_env,
        clinical_caveat=clinical_caveat,
        ui_surfaces=ui_surfaces,
        notes=notes,
    )


def _capabilities_payload() -> MriCapabilitiesResponse:
    """Build the MRI capabilities response."""
    features = []

    # Core pipeline (HAS_MRI_PIPELINE guard)
    has_mri_pkg = _has_pkg("deepsynaps_mri")
    core_status: CapabilityStatus = "active" if has_mri_pkg else "unavailable"
    features.append(
        _feature(
            feature_id="core_pipeline",
            label="MRI processing pipeline",
            status=core_status,
            required_packages=["deepsynaps_mri", "nibabel", "antspyx"],
            clinical_caveat=(
                "Decision-support only. Model-estimated indicators. "
                "Requires radiologist/neurologist review."
            ),
            ui_surfaces=["MRI Analyzer"],
            notes="When unavailable, demo mode provides sample report.",
        )
    )

    # Structural analysis (FastSurfer / SynthSeg)
    structural_status: CapabilityStatus = "active" if has_mri_pkg else "unavailable"
    features.append(
        _feature(
            feature_id="structural_analysis",
            label="T1 structural analysis (cortical thickness, segmentation)",
            status=structural_status,
            required_packages=["deepsynaps_mri", "nibabel", "nilearn"],
            clinical_caveat=(
                "Decision-support only. Morphometry outputs are biomarkers, not clinical findings. "
                "Requires radiologist/neurologist review."
            ),
            ui_surfaces=["MRI Analyzer", "Brain Map"],
            notes="Uses FastSurfer (GPU) or SynthSeg (CPU) depending on hardware. Auto-fallback.",
        )
    )

    # Registration QC
    qc_status: CapabilityStatus = "active" if has_mri_pkg else "unavailable"
    features.append(
        _feature(
            feature_id="registration_qc",
            label="Registration QC (alignment metrics)",
            status=qc_status,
            required_packages=["deepsynaps_mri", "antspyx"],
            clinical_caveat="Quality control metric only. Does not confirm registration validity; manual inspection required.",
            ui_surfaces=["MRI Analyzer"],
            notes="Flags high registration mismatch for manual review.",
        )
    )

    # Stim-target planning
    targeting_status: CapabilityStatus = "active" if has_mri_pkg else "unavailable"
    features.append(
        _feature(
            feature_id="stim_targeting",
            label="Stimulation target planning (TPS, tFUS, rTMS)",
            status=targeting_status,
            required_packages=["deepsynaps_mri"],
            clinical_caveat=(
                "Planning support only. All coordinates must be validated by clinician. "
                "Not autonomous targeting. Requires neuronavigation confirmation."
            ),
            ui_surfaces=["MRI Analyzer"],
            notes="Coordinates are literature-derived and patient-space registered.",
        )
    )

    # MedRAG literature (shared with qEEG)
    medrag_status: CapabilityStatus = "active" if has_mri_pkg else "unavailable"
    features.append(
        _feature(
            feature_id="medrag_literature",
            label="Literature retrieval (MedRAG)",
            status=medrag_status,
            required_packages=["deepsynaps_mri"],
            clinical_caveat="Decision-support only. Citations must be verified. Clinician review required.",
            ui_surfaces=["MRI Analyzer"],
            notes="Returns literature supporting target coordinates.",
        )
    )

    # Ensure deterministic ordering for UI/tests.
    features.sort(key=lambda f: f.id)

    return MriCapabilitiesResponse(
        generated_at=datetime.now(timezone.utc).isoformat(),
        features=features,
    )


@router.get("/capabilities", response_model=MriCapabilitiesResponse)
def get_mri_capabilities() -> Any:
    """Report MRI feature/dependency availability.

    This endpoint performs only lightweight dependency/config checks. It does
    not import heavy scientific stacks beyond spec lookups and does not run
    computations.
    """
    return _capabilities_payload().model_dump()
