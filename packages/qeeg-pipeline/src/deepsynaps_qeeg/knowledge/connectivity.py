"""Connectivity and network measure context from qEEG literature.

Provides clinical interpretation guidance for phase shift, phase lock,
coherence, and network efficiency measures — particularly the JTFA-based
normative databases developed by Thatcher and colleagues. All functions
are deterministic, import-safe, and PHI-free.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ConnectivityMeasure:
    """Clinical context for a single connectivity/network measure."""

    name: str
    definition: str
    normal_adult_range: str
    clinical_interpretation: str
    disorders_associated: tuple[str, ...]
    distance_effect: str  # how measure changes with electrode separation


_CONNECTIVITY_ATLAS: tuple[ConnectivityMeasure, ...] = (
    ConnectivityMeasure(
        name="Phase shift duration (alpha-1, 8–10 Hz)",
        definition=(
            "JTFA measure of the time for two regions to transition between "
            "phase relationships. Short shifts = rapid network reconfiguration."
        ),
        normal_adult_range="Short-distance (~6 cm): 30–80 msec; Long-distance (~24 cm): 80–150 msec",
        clinical_interpretation=(
            "Excessively short phase shifts indicate network instability. "
            "Excessively long shifts indicate poor network reconfiguration."
        ),
        disorders_associated=(
            "TBI",
            "autism",
            "ADHD",
            "depression",
            "dementia",
        ),
        distance_effect="Short-distance connections shift faster than long-distance connections",
    ),
    ConnectivityMeasure(
        name="Phase lock duration (alpha-2, 10–12 Hz)",
        definition=(
            "JTFA measure of how long two regions maintain stable phase coupling. "
            "Long locks = sustained engagement; very long = reduced flexibility."
        ),
        normal_adult_range="Short-distance: 50–120 msec; Long-distance: 100–200 msec",
        clinical_interpretation=(
            "Autism shows excessively long phase locks (hyperconnectivity). "
            "TBI and aging show excessively short locks (hypoconnectivity). "
            "Optimal lock duration correlates with cognitive performance."
        ),
        disorders_associated=(
            "autism",
            "TBI",
            "ADHD",
            "depression",
            "schizophrenia",
            "aging",
        ),
        distance_effect="Long-distance locks are more vulnerable to pathology",
    ),
    ConnectivityMeasure(
        name="EEG coherence (interhemispheric)",
        definition=(
            "Spectral correlation between homologous regions (e.g., F3–F4, C3–C4). "
            "Reflects corpus callosum-mediated information transfer."
        ),
        normal_adult_range="0.40–0.70 (alpha band, eyes-closed); higher in children",
        clinical_interpretation=(
            "Reduced interhemispheric coherence suggests callosal dysfunction, "
            "seen in TBI, stroke, and severe neurodegeneration. Excess coherence "
            "may indicate reduced network efficiency (small-world disruption)."
        ),
        disorders_associated=(
            "TBI",
            "stroke",
            "dementia",
            "ADHD",
            "autism",
        ),
        distance_effect="Coherence declines with inter-electrode distance",
    ),
    ConnectivityMeasure(
        name="Network efficiency (small-world index)",
        definition=(
            "Ratio of local clustering to characteristic path length. High efficiency "
            "= strong local clusters + sparse long-distance connections (small-world)."
        ),
        normal_adult_range="σ ≈ 2–4 (small-world index); λ ≈ 1.5–2.5 (normalized path length)",
        clinical_interpretation=(
            "Brain networks optimize communication via small-world topology. "
            "Loss of long-distance connections (reduced efficiency) is seen in aging, "
            "TBI, and schizophrenia. Excessive local clustering (reduced integration) "
            "is seen in autism and some epilepsies."
        ),
        disorders_associated=(
            "TBI",
            "schizophrenia",
            "autism",
            "dementia",
            "aging",
        ),
        distance_effect="Long-distance connections are most vulnerable to disruption",
    ),
)


# Build indexes
_BY_NAME: dict[str, ConnectivityMeasure] = {
    entry.name.lower().replace(" ", "_"): entry for entry in _CONNECTIVITY_ATLAS
}
_BY_DISORDER: dict[str, list[ConnectivityMeasure]] = {}
for entry in _CONNECTIVITY_ATLAS:
    for disorder in entry.disorders_associated:
        _BY_DISORDER.setdefault(disorder.lower(), []).append(entry)


class ConnectivityAtlas:
    """Read-only accessor for connectivity measure clinical context."""

    @staticmethod
    def lookup(name: str) -> ConnectivityMeasure | None:
        """Return measure by slug (e.g. 'phase_shift_duration_alpha_1')."""
        key = name.lower().replace(" ", "_").replace("(", "").replace(")", "")
        # Try exact match first
        if key in _BY_NAME:
            return _BY_NAME[key]
        # Try partial match
        for k, v in _BY_NAME.items():
            if key in k or k in key:
                return v
        return None

    @staticmethod
    def for_disorder(disorder: str) -> list[ConnectivityMeasure]:
        """Return all measures associated with a disorder."""
        return list(_BY_DISORDER.get(disorder.lower(), []))

    @staticmethod
    def all_measures() -> tuple[ConnectivityMeasure, ...]:
        """Return the full atlas."""
        return _CONNECTIVITY_ATLAS


def interpret_connectivity_finding(
    measure_name: str,
    value: float | None,
    electrode_distance_cm: float | None = None,
    age_years: int | None = None,
) -> dict[str, str]:
    """Generate clinical interpretation for a connectivity measure value.

    Parameters
    ----------
    measure_name : str
        Name or slug of the connectivity measure.
    value : float | None
        The measured value (e.g., phase lock duration in msec).
    electrode_distance_cm : float | None
        Distance between electrode pairs, if applicable.
    age_years : int | None
        Patient age for developmental context.

    Returns
    -------
    dict with keys: measure, interpretation, caveat
    """
    measure = ConnectivityAtlas.lookup(measure_name)
    if measure is None:
        return {
            "measure": measure_name,
            "interpretation": "Unknown connectivity measure.",
            "caveat": "No clinical guidance available.",
        }

    parts: list[str] = [measure.clinical_interpretation]

    if electrode_distance_cm is not None:
        parts.append(f"Distance effect: {measure.distance_effect}.")

    if age_years is not None:
        if age_years < 18:
            parts.append(
                "Pediatric norms differ from adults; developmental trajectory must be considered."
            )
        elif age_years > 60:
            parts.append(
                "Age-related decline in long-distance connectivity is expected after 60."
            )

    return {
        "measure": measure.name,
        "interpretation": " ".join(parts),
        "caveat": (
            "Connectivity measures are adjunctive — interpret alongside "
            "power spectral analysis and clinical history. Single values are "
            "rarely diagnostic."
        ),
    }
