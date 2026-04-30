"""Artifact detection atlas derived from structured clinical EEG education.

Maps common physiological and technical artifacts to the channels where they
are most likely to appear. Used to flag potential confounds on qEEG findings
*before* they reach the narrative stage. This is **advisory only** — findings
are annotated, not suppressed, so clinicians retain full visibility.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable


@dataclass(frozen=True)
class ArtifactProfile:
    """A single artifact type with channel priors and reasoning text."""

    artifact_type: str
    primary_channels: tuple[str, ...]
    secondary_channels: tuple[str, ...]
    typical_bands: tuple[str, ...]
    signature: str
    differentiation_tip: str


# ── Atlas entries (deterministic, evidence-based) ──────────────────────────

_ATLAS: tuple[ArtifactProfile, ...] = (
    ArtifactProfile(
        artifact_type="eye_blink",
        primary_channels=("Fp1", "Fp2", "Fz"),
        secondary_channels=("F3", "F4"),
        typical_bands=("delta", "theta"),
        signature="Very high amplitude (>200 µV) frontal positive deflection, no posterior field",
        differentiation_tip="Eye blinks lack a preceding spike and do not disrupt the background posteriorly. They are time-locked to video if available.",
    ),
    ArtifactProfile(
        artifact_type="lateral_eye_movement",
        primary_channels=("F7", "F8"),
        secondary_channels=(),
        typical_bands=("delta", "theta"),
        signature="Opposing polarities in F7 and F8 — positive on side of gaze, negative contralateral",
        differentiation_tip="Cornea is positively charged; look to the positive side. Distinguish from frontal spikes by lack of aftergoing slow wave and field.",
    ),
    ArtifactProfile(
        artifact_type="myogenic_frontal",
        primary_channels=("Fp1", "Fp2", "F3", "F4", "Fz", "F7", "F8"),
        secondary_channels=("T7", "T8"),
        typical_bands=("beta", "gamma"),
        signature="High frequency (>30 Hz), low amplitude (<50 µV) activity overlying normal rhythms",
        differentiation_tip="Muscle artifact is faster than any physiologic cerebral activity on scalp EEG. Minimal at vertex (Cz) — fast activity at Cz warrants suspicion.",
    ),
    ArtifactProfile(
        artifact_type="myogenic_temporal",
        primary_channels=("T7", "T8"),
        secondary_channels=("F7", "F8"),
        typical_bands=("beta", "gamma"),
        signature="Burst of very fast activity from temporalis muscle contraction",
        differentiation_tip="Often co-occurs with chewing. Video correlation is definitive.",
    ),
    ArtifactProfile(
        artifact_type="chewing",
        primary_channels=("T7", "T8", "F7", "F8"),
        secondary_channels=("Fp1", "Fp2"),
        typical_bands=("beta", "gamma"),
        signature="Sudden onset intermittent bursts of generalized very fast activity",
        differentiation_tip="Not rhythmic like periodic fast activity; correlate with video. Often accompanied by hypoglossal (tongue) artifact.",
    ),
    ArtifactProfile(
        artifact_type="hypoglossal_tongue",
        primary_channels=("Fp1", "Fp2", "Fz", "F3", "F4", "F7", "F8", "T7", "T8"),
        secondary_channels=(),
        typical_bands=("delta",),
        signature="Diffuse slow synchronized delta activity, very organized across channels",
        differentiation_tip="Ask patient to say 'la la la' or push tongue into cheek. Seizures would show evolution and spike-wave morphology.",
    ),
    ArtifactProfile(
        artifact_type="ecg",
        primary_channels=("T7", "T8", "F7", "F8"),
        secondary_channels=("C3", "C4", "P3", "P4"),
        typical_bands=("delta", "theta"),
        signature="Waveforms time-locked to QRS complex; more prominent on left side",
        differentiation_tip="If not time-locked to QRS, consider posterior discharges or POSTS. ECG artifact tends to be relatively low amplitude.",
    ),
    ArtifactProfile(
        artifact_type="electrode_pop",
        primary_channels=(),
        secondary_channels=(),
        typical_bands=("delta", "theta", "alpha", "beta"),
        signature="Single electrode sudden steep upslope with slower downslope, absolutely no field",
        differentiation_tip="Confined to one electrode. If persistent, inspect the electrode for looseness or dried gel.",
    ),
    ArtifactProfile(
        artifact_type="electrical_interference",
        primary_channels=(),
        secondary_channels=(),
        typical_bands=("gamma",),
        signature="Very fast (~50/60 Hz), very monotonous activity across all channels",
        differentiation_tip="Use notch filter. Check for ungrounded equipment or cell phone charging nearby.",
    ),
    ArtifactProfile(
        artifact_type="excess_beta_medication",
        primary_channels=(),
        secondary_channels=(),
        typical_bands=("beta",),
        signature="Diffuse low amplitude beta overriding normal activity throughout tracing",
        differentiation_tip="Most commonly benzodiazepine or barbiturate effect. Also seen with anxiety and drowsiness. Slower than myogenic artifact.",
    ),
)


# Build fast lookup indexes at import time (deterministic, cheap).
_PRIMARY_INDEX: dict[str, list[ArtifactProfile]] = {}
for _entry in _ATLAS:
    for _ch in _entry.primary_channels:
        _PRIMARY_INDEX.setdefault(_ch, []).append(_entry)


class ArtifactAtlas:
    """Read-only accessor for the artifact atlas."""

    @staticmethod
    def lookup(channel: str) -> list[ArtifactProfile]:
        """Return all artifact profiles where *channel* is a primary site."""
        return list(_PRIMARY_INDEX.get(channel, []))

    @staticmethod
    def all_profiles() -> tuple[ArtifactProfile, ...]:
        """Return the full atlas."""
        return _ATLAS


def flag_artifact_confounds(
    region: str,
    band: str,
    metric: str,
) -> list[dict[str, str]]:
    """Return advisory artifact flags for a given finding.

    Parameters
    ----------
    region : str
        Channel or region label (e.g. ``"Fp1"``, ``"F3"``).
    band : str
        Frequency band (e.g. ``"delta"``, ``"beta"``).
    metric : str
        Full metric path (e.g. ``"spectral.bands.beta.absolute_uv2"``).

    Returns
    -------
    list of dict
        Each dict has keys ``artifact_type``, ``confidence`` (``"high"`` |
        ``"medium"`` | ``"low"``), and ``reasoning``.
    """
    flags: list[dict[str, str]] = []
    for profile in ArtifactAtlas.lookup(region):
        # Confidence scoring: primary channel + band match = high;
        # primary channel only = medium; anything else = low.
        band_match = band.lower() in profile.typical_bands
        if band_match:
            confidence = "high"
        else:
            confidence = "medium"

        flags.append(
            {
                "artifact_type": profile.artifact_type,
                "confidence": confidence,
                "reasoning": (
                    f"{profile.signature}. "
                    f"Differentiation: {profile.differentiation_tip}"
                ),
            }
        )
    return flags
