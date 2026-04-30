"""Standard EEG montage definitions and transformation guidance.

Derived from WinEEG 3.11.24 manual (Mitsar/Neurosoft) and ACNS guidelines.
Provides deterministic montage specifications for raw EEG display and
reformatting in qEEG analysis pipelines.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable


@dataclass(frozen=True)
class MontageChannel:
    """A single derived channel in a montage."""

    label: str
    positive_input: str
    negative_input: str | None
    description: str


@dataclass(frozen=True)
class MontageDefinition:
    """A complete montage with all derived channels."""

    montage_name: str
    montage_type: str  # "referential", "bipolar", "laplacian", "average"
    channels: tuple[MontageChannel, ...]
    reference_note: str
    clinical_use: str


# ── Standard 10-20 Referential (Linked Ears) ────────────────────────────────

_LINKED_EARS_CHANNELS: tuple[MontageChannel, ...] = tuple(
    MontageChannel(
        label=ch,
        positive_input=ch,
        negative_input="A1+A2",
        description=f"{ch} referenced to linked ears (A1+A2)",
    )
    for ch in (
        "Fp1", "Fp2", "F7", "F3", "Fz", "F4", "F8",
        "T3", "C3", "Cz", "C4", "T4",
        "T5", "P3", "Pz", "P4", "T6",
        "O1", "O2",
    )
)

# ── Standard 10-20 Bipolar (Double Banana / Longitudinal) ───────────────────

_DOUBLE_BANANA_CHANNELS: tuple[MontageChannel, ...] = (
    MontageChannel("Fp1-F3", "Fp1", "F3", "Frontal bipolar chain"),
    MontageChannel("F3-C3", "F3", "C3", "Frontal-central bipolar chain"),
    MontageChannel("C3-P3", "C3", "P3", "Central-parietal bipolar chain"),
    MontageChannel("P3-O1", "P3", "O1", "Parietal-occipital bipolar chain"),
    MontageChannel("Fp2-F4", "Fp2", "F4", "Frontal bipolar chain (right)"),
    MontageChannel("F4-C4", "F4", "C4", "Frontal-central bipolar chain (right)"),
    MontageChannel("C4-P4", "C4", "P4", "Central-parietal bipolar chain (right)"),
    MontageChannel("P4-O2", "P4", "O2", "Parietal-occipital bipolar chain (right)"),
    MontageChannel("F7-T3", "F7", "T3", "Temporal anterior bipolar chain"),
    MontageChannel("T3-T5", "T3", "T5", "Temporal posterior bipolar chain"),
    MontageChannel("T5-O1", "T5", "O1", "Temporal-occipital bipolar chain"),
    MontageChannel("F8-T4", "F8", "T4", "Temporal anterior bipolar chain (right)"),
    MontageChannel("T4-T6", "T4", "T6", "Temporal posterior bipolar chain (right)"),
    MontageChannel("T6-O2", "T6", "O2", "Temporal-occipital bipolar chain (right)"),
    MontageChannel("Fz-Cz", "Fz", "Cz", "Midline frontal-central"),
    MontageChannel("Cz-Pz", "Cz", "Pz", "Midline central-parietal"),
)

# ── Common Average Reference ────────────────────────────────────────────────

_AVERAGE_REFERENCE_CHANNELS: tuple[MontageChannel, ...] = tuple(
    MontageChannel(
        label=ch,
        positive_input=ch,
        negative_input="AVG(19)",
        description=f"{ch} referenced to common average of all 19 channels",
    )
    for ch in (
        "Fp1", "Fp2", "F7", "F3", "Fz", "F4", "F8",
        "T3", "C3", "Cz", "C4", "T4",
        "T5", "P3", "Pz", "P4", "T6",
        "O1", "O2",
    )
)

# ── Laplacian (Local Average) ───────────────────────────────────────────────

_LAPLACIAN_NEIGHBORS: dict[str, tuple[str, ...]] = {
    "Fp1": ("F7", "F3", "Fp2"),
    "Fp2": ("F4", "F8", "Fp1"),
    "F7": ("Fp1", "F3", "T3"),
    "F3": ("Fp1", "F7", "C3", "Fz"),
    "Fz": ("Fp1", "Fp2", "F3", "F4", "Cz"),
    "F4": ("Fp2", "F8", "C4", "F3"),
    "F8": ("Fp2", "F4", "T4"),
    "T3": ("F7", "C3", "T5"),
    "C3": ("F3", "T3", "P3", "Cz"),
    "Cz": ("Fz", "C3", "C4", "Pz"),
    "C4": ("F4", "T4", "P4", "Cz"),
    "T4": ("F8", "C4", "T6"),
    "T5": ("T3", "P3", "O1"),
    "P3": ("C3", "T5", "O1", "Pz"),
    "Pz": ("Cz", "P3", "P4", "O1", "O2"),
    "P4": ("C4", "T6", "O2", "Pz"),
    "T6": ("T4", "P4", "O2"),
    "O1": ("T5", "P3", "Pz", "O2"),
    "O2": ("T6", "P4", "Pz", "O1"),
}

_LAPLACIAN_CHANNELS: tuple[MontageChannel, ...] = tuple(
    MontageChannel(
        label=f"{ch}-LAP",
        positive_input=ch,
        negative_input=f"AVG({','.join(neigh)})",
        description=f"{ch} referenced to local average of {len(neigh)} neighbors",
    )
    for ch, neigh in _LAPLACIAN_NEIGHBORS.items()
)

# ── Atlas ───────────────────────────────────────────────────────────────────

_MONTAGE_ATLAS: tuple[MontageDefinition, ...] = (
    MontageDefinition(
        montage_name="linked_ears",
        montage_type="referential",
        channels=_LINKED_EARS_CHANNELS,
        reference_note=(
            "Classic clinical referential montage. A1+A2 linked ear reference. "
            "Good for assessing absolute amplitudes and symmetry. "
            "Caution: ear reference may be contaminated by temporal activity (T3/T4)."
        ),
        clinical_use="General screening, amplitude asymmetry assessment, most common clinical default.",
    ),
    MontageDefinition(
        montage_name="double_banana",
        montage_type="bipolar",
        channels=_DOUBLE_BANANA_CHANNELS,
        reference_note=(
            "Longitudinal bipolar chain (frontal→occipital, temporal→occipital). "
            "Phase reversals indicate localized maxima. "
            "Best for identifying epileptiform discharges and focal slowing."
        ),
        clinical_use="Epilepsy monitoring, focal abnormality detection, phase reversal analysis.",
    ),
    MontageDefinition(
        montage_name="average_reference",
        montage_type="referential",
        channels=_AVERAGE_REFERENCE_CHANNELS,
        reference_note=(
            "Common average reference (mean of all 19 channels). "
            "Approximates reference-free recording. "
            "Caution: if one channel has large artifact, it contaminates all channels."
        ),
        clinical_use="Quantitative analysis, source localization preparation, connectivity analysis.",
    ),
    MontageDefinition(
        montage_name="laplacian",
        montage_type="laplacian",
        channels=_LAPLACIAN_CHANNELS,
        reference_note=(
            "Local average reference (nearest-neighbor Laplacian). "
            "Highlights local activity and suppresses widespread fields. "
            "Useful for topographic mapping and neurofeedback target identification."
        ),
        clinical_use="Topographic mapping, neurofeedback targeting, local source approximation.",
    ),
)

_NAME_INDEX: dict[str, MontageDefinition] = {}
for _m in _MONTAGE_ATLAS:
    _NAME_INDEX[_m.montage_name.lower()] = _m


class MontageAtlas:
    """Read-only accessor for standard EEG montage definitions."""

    @staticmethod
    def lookup(name: str) -> MontageDefinition | None:
        return _NAME_INDEX.get(name.lower())

    @staticmethod
    def all_montages() -> tuple[MontageDefinition, ...]:
        return _MONTAGE_ATLAS

    @staticmethod
    def by_type(montage_type: str) -> list[MontageDefinition]:
        return [m for m in _MONTAGE_ATLAS if m.montage_type == montage_type]

    @staticmethod
    def channel_labels(montage_name: str) -> list[str]:
        m = MontageAtlas.lookup(montage_name)
        return [c.label for c in m.channels] if m else []


def explain_montage(montage_name: str) -> dict[str, str] | None:
    """Return a plain-dict description of *montage_name*, or None."""
    m = MontageAtlas.lookup(montage_name)
    if m is None:
        return None
    return {
        "name": m.montage_name,
        "type": m.montage_type,
        "channels": ", ".join(c.label for c in m.channels),
        "reference_note": m.reference_note,
        "clinical_use": m.clinical_use,
    }


def recommend_montage(clinical_goal: str) -> list[dict[str, str]]:
    """Advisory montage recommendations based on clinical goal."""
    goal = clinical_goal.lower()
    recs: list[dict[str, str]] = []
    if any(k in goal for k in ("epilepsy", "seizure", "spike", "phase reversal", "focal")):
        recs.append({"montage": "double_banana", "reason": "Phase reversals localize discharges"})
    if any(k in goal for k in ("amplitude", "symmetry", "absolute", "screening")):
        recs.append({"montage": "linked_ears", "reason": "Stable reference for amplitude comparison"})
    if any(k in goal for k in ("source", "connectivity", "coherence", "network")):
        recs.append({"montage": "average_reference", "reason": "Approximates reference-free recording"})
    if any(k in goal for k in ("topography", "map", "neurofeedback", "local")):
        recs.append({"montage": "laplacian", "reason": "Local reference highlights focal activity"})
    return recs
