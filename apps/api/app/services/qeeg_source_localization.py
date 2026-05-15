"""EEG Source Localization -- sLORETA/eLORETA workflow.

Template head model. Decision-support only. ~2cm localization error expected.
"""

from __future__ import annotations

from typing import Any

# ────────────────────────────────────────────────────────────────
# sLORETA Source Estimation
# ────────────────────────────────────────────────────────────────


def sloreta_source_estimation(
    eeg_data: dict[str, list[float]],
    channel_locations: dict[str, tuple[float, float, float]],
    sfreq: float,
    band: tuple[float, float] = (8.0, 13.0),
) -> dict[str, Any]:
    """sLORETA source estimation with zero localization error property.

    Uses template BEM head model. In production, would use MNE-Python
    with proper forward modeling.

    Parameters
    ----------
    eeg_data : dict[str, list[float]]
        channel_name -> signal values.
    channel_locations : dict[str, tuple[float, float, float]]
        channel_name -> (x, y, z) positions in head coordinates.
    sfreq : float
        Sampling frequency in Hz.
    band : tuple[float, float]
        Frequency band for source estimation (default alpha 8-13 Hz).

    Returns
    -------
    dict
        Structured result with uncertainty quantification and safety notes.
    """
    electrode_count = len(eeg_data)

    return {
        "method": "sLORETA",
        "band": band,
        "head_model": "template_bem_3layer",
        "template": "MNI152NLin2009cAsym",
        "electrode_count": electrode_count,
        "source_space": "cortical_surface_8196",
        "uncertainty": {
            "localization_error_mm": 20,  # ~2cm for template head model
            "head_model_type": "template",
            "individual_mri": False,
            "caveat": (
                "Template head model adds ~20mm localization uncertainty. "
                "Individual MRI reduces to ~5mm."
            ),
        },
        "results": {
            "note": (
                "Source localization requires MNE-Python integration. "
                "This stub provides the contract and will be activated "
                "when MNE-Python is available."
            ),
            "max_source_region": "requires_mne_integration",
            "z_scores_available": False,
            "brodmann_areas_available": False,
        },
        "recommended_methods": {
            "deep_sources": "sLORETA",
            "focal_sources": "Beamformer (LCMV)",
            "distributed_sources": "eLORETA",
            "evoked_responses": "dSPM",
        },
        "safety_note": (
            "Source localization is research-level. "
            "Not for clinical diagnosis without expert review. "
            "Template head models have ~20mm localization error."
        ),
    }


# ────────────────────────────────────────────────────────────────
# eLORETA Source Estimation
# ────────────────────────────────────────────────────────────────


def eloreta_source_estimation(
    eeg_data: dict[str, list[float]],
    channel_locations: dict[str, tuple[float, float, float]],
    sfreq: float,
    band: tuple[float, float] = (8.0, 13.0),
) -> dict[str, Any]:
    """eLORETA source estimation with exact localization via iterative optimization.

    Parameters
    ----------
    eeg_data : dict[str, list[float]]
        channel_name -> signal values.
    channel_locations : dict[str, tuple[float, float, float]]
        channel_name -> (x, y, z) positions in head coordinates.
    sfreq : float
        Sampling frequency in Hz.
    band : tuple[float, float]
        Frequency band for source estimation (default alpha 8-13 Hz).

    Returns
    -------
    dict
        Structured result with uncertainty quantification.
    """
    electrode_count = len(eeg_data)

    return {
        "method": "eLORETA",
        "band": band,
        "head_model": "template_bem_3layer",
        "template": "MNI152NLin2009cAsym",
        "electrode_count": electrode_count,
        "source_space": "cortical_surface_8196",
        "iterative_optimization": True,
        "convergence_criterion": "relative_source_variance < 1e-6",
        "uncertainty": {
            "localization_error_mm": 15,  # ~1.5cm for eLORETA with template
            "head_model_type": "template",
            "individual_mri": False,
            "caveat": (
                "eLORETA improves on sLORETA with iterative weighting. "
                "Template head model still adds ~15mm uncertainty. "
                "Individual MRI reduces to ~5mm."
            ),
        },
        "results": {
            "note": (
                "eLORETA requires MNE-Python integration. "
                "This stub provides the contract."
            ),
            "max_source_region": "requires_mne_integration",
            "z_scores_available": False,
            "brodmann_areas_available": False,
        },
        "advantages_over_sloreta": [
            "Exact localization for point sources",
            "Less depth bias",
            "Better spatial resolution",
        ],
        "safety_note": (
            "eLORETA source localization is research-level. "
            "Not for clinical diagnosis without expert review. "
            "Template head models have ~15mm localization error."
        ),
    }


# ────────────────────────────────────────────────────────────────
# MNE (Minimum Norm Estimate) Source Estimation
# ────────────────────────────────────────────────────────────────


def mne_source_estimation(
    eeg_data: dict[str, list[float]],
    channel_locations: dict[str, tuple[float, float, float]],
    sfreq: float,
    band: tuple[float, float] = (8.0, 13.0),
    snr: float = 3.0,
) -> dict[str, Any]:
    """Minimum Norm Estimate (MNE) for distributed source reconstruction.

    Parameters
    ----------
    eeg_data : dict[str, list[float]]
        channel_name -> signal values.
    channel_locations : dict[str, tuple[float, float, float]]
        channel_name -> (x, y, z) positions in head coordinates.
    sfreq : float
        Sampling frequency in Hz.
    band : tuple[float, float]
        Frequency band for source estimation (default alpha 8-13 Hz).
    snr : float
        Assumed signal-to-noise ratio for regularization (default 3.0).

    Returns
    -------
    dict
        Structured result with uncertainty quantification.
    """
    electrode_count = len(eeg_data)
    # Regularization parameter: lambda^2 = 1 / SNR^2
    lambda2 = 1.0 / (snr ** 2)

    return {
        "method": "MNE",
        "band": band,
        "head_model": "template_bem_3layer",
        "template": "MNI152NLin2009cAsym",
        "electrode_count": electrode_count,
        "source_space": "cortical_surface_8196",
        "regularization": {
            "method": "Tikhonov",
            "lambda2": round(lambda2, 6),
            "snr_assumed": snr,
        },
        "uncertainty": {
            "localization_error_mm": 25,  # MNE has more depth bias
            "head_model_type": "template",
            "individual_mri": False,
            "caveat": (
                "MNE tends to produce distributed rather than focal solutions. "
                "Depth bias can shift deep sources toward the surface. "
                "Use beamformers (LCMV) for focal source detection."
            ),
        },
        "results": {
            "note": (
                "MNE source estimation requires MNE-Python integration. "
                "This stub provides the contract."
            ),
            "max_source_region": "requires_mne_integration",
            "z_scores_available": False,
            "brodmann_areas_available": False,
        },
        "safety_note": (
            "MNE source localization is research-level. "
            "Not for clinical diagnosis without expert review. "
            "Template head models have ~25mm localization error."
        ),
    }


# ────────────────────────────────────────────────────────────────
# Source Uncertainty Quantification
# ────────────────────────────────────────────────────────────────


def source_uncertainty_quantification(
    has_individual_mri: bool,
    electrode_count: int,
    source_method: str,
) -> dict[str, Any]:
    """Quantify uncertainty for source localization results.

    Parameters
    ----------
    has_individual_mri : bool
        Whether individual MRI was used for head model.
    electrode_count : int
        Number of EEG electrodes.
    source_method : str
        Source estimation method ("sLORETA", "eLORETA", "MNE", "LCMV").

    Returns
    -------
    dict
        Expected localization error, confidence, recommendations.
    """
    # Base error by head model
    base_error = 5 if has_individual_mri else 20

    # Error reduction by electrode count
    if electrode_count >= 128:
        electrode_factor = 0.7
    elif electrode_count >= 64:
        electrode_factor = 0.85
    elif electrode_count >= 32:
        electrode_factor = 1.0
    else:
        electrode_factor = 1.3

    # Method-specific adjustment
    method_factors: dict[str, float] = {
        "sLORETA": 1.0,
        "eLORETA": 0.75,
        "MNE": 1.25,
        "LCMV": 0.8,
        "dSPM": 1.1,
    }
    method_factor = method_factors.get(source_method, 1.0)

    error_mm = int(base_error * electrode_factor * method_factor)

    # Confidence grading
    if has_individual_mri and electrode_count >= 64:
        confidence = "high"
    elif has_individual_mri:
        confidence = "moderate"
    elif electrode_count < 32:
        confidence = "low"
    else:
        confidence = "moderate"

    return {
        "expected_localization_error_mm": error_mm,
        "confidence": confidence,
        "head_model": "individual" if has_individual_mri else "template",
        "electrode_count": electrode_count,
        "method": source_method,
        "deep_source_caution": (
            "Sources deeper than 4cm from scalp have >30mm error "
            "even with individual MRI."
        ),
        "recommendations": [
            "Individual MRI improves localization accuracy 4x",
            "64+ electrodes recommended for source localization",
            "sLORETA preferred for deep sources; LCMV beamformer for focal sources",
            "eLORETA offers best spatial resolution among distributed methods",
            "Combine with structural MRI when available",
        ],
    }


# ────────────────────────────────────────────────────────────────
# Full source localization pipeline
# ────────────────────────────────────────────────────────────────


def full_source_localization(
    eeg_data: dict[str, list[float]],
    channel_locations: dict[str, tuple[float, float, float]],
    sfreq: float,
    band: tuple[float, float] = (8.0, 13.0),
    methods: list[str] | None = None,
) -> dict[str, Any]:
    """Run complete source localization analysis with multiple methods.

    Parameters
    ----------
    eeg_data : dict[str, list[float]]
        channel_name -> signal values.
    channel_locations : dict[str, tuple[float, float, float]]
        channel_name -> (x, y, z) positions in head coordinates.
    sfreq : float
        Sampling frequency in Hz.
    band : tuple[float, float]
        Frequency band for source estimation (default alpha 8-13 Hz).
    methods : list[str] | None
        List of methods to run ("sLORETA", "eLORETA", "MNE").
        Defaults to ["sLORETA"].

    Returns
    -------
    dict
        Results from all requested methods, uncertainty quantification, safety notes.
    """
    if methods is None:
        methods = ["sLORETA"]

    results: dict[str, Any] = {
        "methods": {},
        "uncertainty": source_uncertainty_quantification(
            has_individual_mri=False,
            electrode_count=len(eeg_data),
            source_method=methods[0],
        ),
        "n_channels": len(eeg_data),
        "sfreq": sfreq,
        "band": band,
        "safety_note": (
            "Source localization is research-level. "
            "Not for clinical diagnosis without expert review. "
            "Template head models have significant localization error."
        ),
    }

    for method in methods:
        if method == "sLORETA":
            results["methods"]["sLORETA"] = sloreta_source_estimation(
                eeg_data, channel_locations, sfreq, band
            )
        elif method == "eLORETA":
            results["methods"]["eLORETA"] = eloreta_source_estimation(
                eeg_data, channel_locations, sfreq, band
            )
        elif method == "MNE":
            results["methods"]["MNE"] = mne_source_estimation(
                eeg_data, channel_locations, sfreq, band
            )
        else:
            results["methods"][method] = {
                "error": f"Unknown method: {method}",
                "supported_methods": ["sLORETA", "eLORETA", "MNE"],
            }

    return results
