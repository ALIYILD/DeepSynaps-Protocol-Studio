"""qEEG topographic map interpretation guide derived from QEEG courseware.

Covers absolute power, relative power, amplitude asymmetry, coherence,
and phase maps — the five standard map families in NeuroGuide-style
qEEG reporting. All guidance is advisory and intended for clinician
decision support, not automated diagnosis.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable


@dataclass(frozen=True)
class MapTypeProfile:
    """A single map type with interpretation rules and clinical guidance."""

    map_type: str
    full_name: str
    description: str
    color_legend: str
    how_to_read: str
    clinical_significance: str
    common_pitfalls: str


_ATLAS: tuple[MapTypeProfile, ...] = (
    MapTypeProfile(
        map_type="absolute_power",
        full_name="Absolute Power (Z-Score)",
        description=(
            "A measure of the size of each frequency component (expressed in microvolts or µV²) "
            "and a reflection of how much of the frequency component is present within the brain. "
            "It is a statistical map of the client's data compared to a normative database."
        ),
        color_legend=(
            "Green = within normal range (0 SD). "
            "Red = too much activity (positive z-score, elevated). "
            "Blue = too little activity (negative z-score, reduced)."
        ),
        how_to_read=(
            "Step 1: Orient the map — nose is at the top (frontal lobe), bottom is occipital. "
            "Odd-numbered electrodes are on the left hemisphere; even on the right. "
            "Step 2: Review the color legend — it represents standard deviation from the normative population. "
            "Step 3: Locate non-green areas (increases or decreases). "
            "Step 4: Examine where these irregularities are located anatomically. "
            "Step 5: Consider the functional role of the deviated region and how it could relate to symptoms."
        ),
        clinical_significance=(
            "Absolute power tells you whether the amount of activity in a frequency band is statistically "
            "normal for the person's age. Elevated absolute power suggests hyperactivation; reduced suggests "
            "hypoactivation or suppression. Compare with relative power to distinguish true excess from "
            "energy transfer between bands."
        ),
        common_pitfalls=(
            "Do not interpret absolute power maps in isolation. A single band elevation may draw energy "
            "from other bands. Always compare absolute and relative power side by side. "
            "A 'normal brain' would appear all green — but minor deviations (~1.5 SD) may not be clinically significant."
        ),
    ),
    MapTypeProfile(
        map_type="relative_power",
        full_name="Relative Power",
        description=(
            "The size of a frequency component divided by the total power in the EEG. "
            "Shows how much of a particular frequency (e.g., beta) is present relative to all other bands."
        ),
        color_legend=(
            "Green = proportionate share of total power. "
            "Red = proportionally too much of this band. "
            "Blue = proportionally too little of this band."
        ),
        how_to_read=(
            "Step 1: Observe increases or decreases using the standard deviation legend. "
            "Step 2: Identify which region(s) show irregularities. "
            "Step 3: Postulate what these deviations mean — consider the functional role of the region. "
            "Step 4: Compare with absolute power maps. If absolute power is normal but relative is elevated, "
            "the band may be drawing energy from others rather than being truly excessive. "
            "Step 5: Remember the brain is a closed circuit — energy drawn into one frequency reduces others."
        ),
        clinical_significance=(
            "Relative power reveals proportional imbalances between frequency bands. "
            "High relative delta with low relative beta suggests the brain is spending disproportionate "
            "energy on slow-wave activity, potentially at the expense of faster cognitive processing. "
            "Relative power alone cannot tell you if the absolute amount is normal — always cross-reference."
        ),
        common_pitfalls=(
            "Never look at relative power maps on their own. You must compare absolute and relative power "
            "maps next to each other. A relative elevation without absolute elevation suggests compensation, "
            "not primary pathology."
        ),
    ),
    MapTypeProfile(
        map_type="amplitude_asymmetry",
        full_name="Amplitude Asymmetry",
        description=(
            "The size of a frequency component at one location divided by the size at another location. "
            "Reflects differential activation of different parts of the brain. Frequency = language of the brain; "
            "Amplitude = loudness of that language."
        ),
        color_legend=(
            "Blue = amplitude is too low (not firing enough) on that connection. "
            "Red = amplitude is too high (over-firing) on that connection. "
            "Line thickness indicates how far from the normative sample the asymmetry values are."
        ),
        how_to_read=(
            "Step 1: Look at the color of the connecting lines. "
            "Step 2: Assess line thickness — thicker lines mean greater deviation from normal. "
            "Step 3: Identify which electrode pairs show asymmetry. "
            "Step 4: Consider whether the asymmetry is inter-hemispheric (left vs right) or intra-hemispheric. "
            "Step 5: Amplitude asymmetry >30-50% (depending on study) is considered significant."
        ),
        clinical_significance=(
            "Amplitude asymmetry or suppression of normal rhythms is more likely in structural abnormalities "
            "(hematomas, fluid retention) that increase distance or interfere with conduction between cortex "
            "and scalp electrodes. Asymmetry usually indicates dysfunction on the side of depressed amplitude. "
            "Can be caused by medications, neurodegenerative disorders, brain injuries, strokes, or toxic encephalopathy."
        ),
        common_pitfalls=(
            "Different states of arousal significantly impact amplitude asymmetry. "
            "Always consider the recording condition (eyes open vs closed, drowsy vs alert) when interpreting. "
            "A single thick red line does not equal diagnosis — consider the full clinical picture."
        ),
    ),
    MapTypeProfile(
        map_type="coherence",
        full_name="Coherence (Functional Connectivity)",
        description=(
            "A display of functional connectivity between brain regions based on the similarity (synchrony) "
            "of EEG signals within a given frequency band. High coherence suggests high cooperation and "
            "synchronization between underlying brain regions."
        ),
        color_legend=(
            "Blue = coherence is too low (hypocoherence) — under-communication. "
            "Red = coherence is too high (hypercoherence) — over-communication. "
            "Line thickness indicates magnitude of deviation from normative sample."
        ),
        how_to_read=(
            "Step 1: Each head map represents a different frequency band (delta, theta, alpha, beta, high beta). "
            "Step 2: Blue lines mean regions are not communicating enough; red lines mean they are too dependent. "
            "Step 3: Hypercoherence = the brain is too dependent on those connections instead of processing independently. "
            "Step 4: Hypocoherence = little to no communication between connections. "
            "Step 5: The higher the Z-score, the more disorder within those areas."
        ),
        clinical_significance=(
            "Coherence measures large-scale cooperative activity between cortical areas. "
            "Increased coherence can indicate increased functional connectivity — or failure to specialize. "
            "After TBI, increased frontal-temporal coherence may reflect compensatory processing. "
            "In dyslexia, decreased prefrontal coherence has been associated with language deficits."
        ),
        common_pitfalls=(
            "Coherence is not a general map of all connectivity — it is frequency-specific. "
            "General connectivity consists of coherence, phase, and asymmetry combined. "
            "High coherence does not always mean healthy connectivity; it can reflect inefficient over-communication."
        ),
    ),
    MapTypeProfile(
        map_type="phase",
        full_name="Phase (Timing Relationship)",
        description=(
            "Refers to the relationship of timing of waveforms between two brain regions, measured in milliseconds. "
            "Phase is a measure of the lead or lag of shared rhythms between two regions. "
            "In a connected system such as the cerebral cortex, phase is a function of EEG frequency, "
            "distance between sites, and conduction velocity."
        ),
        color_legend=(
            "Blue = phase lag is too low (signals arriving faster than normal) — may indicate inefficiency. "
            "Red = phase lag is too high (signals not coming in fast enough) — information may be 'missed'. "
            "Line thickness indicates deviation from normative sample."
        ),
        how_to_read=(
            "Step 1: Blue = signals arrive too early; Red = signals arrive too late. "
            "Step 2: Whether phase is too early or too late, the brain is not operating at optimal efficiency. "
            "Step 3: Compare phase to coherence measures — timing of connectivity and how the brain sends/receives information. "
            "Step 4: Positive phase lag often reflects transmission time of neuronal activity from sender to receiver."
        ),
        clinical_significance=(
            "Phase synchronization is hypothesized to underlie cognitive binding, temporal coding, spatial attention, "
            "and other higher cognitive functions. It has been related to large-scale information integration, "
            "efficiency of information exchange, and both working and long-term memory. "
            "Slow phase between frontal and occipital regions may manifest as difficulty with memory, judgment, "
            "impulse restraint, visual processing, and procedural memory."
        ),
        common_pitfalls=(
            "Phase should always be compared to coherence measures because of their intrinsic relationship. "
            "A single phase deviation is less meaningful without knowing whether coherence is also abnormal. "
            "Phase is sensitive to recording artifacts and reference choice — verify data quality first."
        ),
    ),
)

_TYPE_INDEX: dict[str, MapTypeProfile] = {}
for _entry in _ATLAS:
    _TYPE_INDEX[_entry.map_type] = _entry


class TopographicMapAtlas:
    """Read-only accessor for topographic map interpretation guidance."""

    @staticmethod
    def lookup(map_type: str) -> MapTypeProfile | None:
        return _TYPE_INDEX.get(map_type)

    @staticmethod
    def all_profiles() -> tuple[MapTypeProfile, ...]:
        return _ATLAS


def explain_map_type(map_type: str) -> dict[str, str] | None:
    """Return a dict describing *map_type*, or None if unknown."""
    profile = TopographicMapAtlas.lookup(map_type)
    if profile is None:
        return None
    return {
        "map_type": profile.map_type,
        "full_name": profile.full_name,
        "description": profile.description,
        "color_legend": profile.color_legend,
        "how_to_read": profile.how_to_read,
        "clinical_significance": profile.clinical_significance,
        "common_pitfalls": profile.common_pitfalls,
    }


def interpret_deviation(
    map_type: str,
    region: str,
    band: str,
    direction: str,
    z_score: float,
) -> dict[str, str]:
    """Return a brief clinical interpretation advisory for a single deviation.

    Parameters
    ----------
    map_type : str
        One of ``absolute_power``, ``relative_power``, ``amplitude_asymmetry``,
        ``coherence``, ``phase``.
    region : str
        Affected region or electrode pair (e.g. ``"Fz"``, ``"F3-F4"``).
    band : str
        Frequency band (e.g. ``"alpha"``, ``"beta"``).
    direction : str
        ``"elevated"`` | ``"reduced"`` | ``"hypocoherent"`` | ``"hypercoherent"`` |
        ``"phase_lag_high"`` | ``"phase_lag_low"``.
    z_score : float
        Standard deviation from norm.

    Returns
    -------
    dict
        Keys ``severity``, ``interpretation``, ``suggested_followup``.
    """
    profile = TopographicMapAtlas.lookup(map_type)
    if profile is None:
        return {
            "severity": "unknown",
            "interpretation": f"Unknown map type '{map_type}'.",
            "suggested_followup": "Verify map type and re-query.",
        }

    if abs(z_score) < 1.5:
        severity = "mild"
    elif abs(z_score) < 2.0:
        severity = "moderate"
    else:
        severity = "significant"

    if map_type == "absolute_power":
        if direction == "elevated":
            interp = f"Elevated {band} absolute power at {region} suggests hyperactivation of that area."
            followup = "Compare to relative power map to rule out energy transfer from other bands."
        else:
            interp = f"Reduced {band} absolute power at {region} suggests hypoactivation or suppression."
            followup = "Consider structural abnormalities, medication effects, or state-dependent factors."
    elif map_type == "relative_power":
        if direction == "elevated":
            interp = f"Elevated relative {band} at {region} means this band consumes a disproportionate share of total energy."
            followup = "Cross-check absolute power. If absolute is normal, this is compensatory, not primary excess."
        else:
            interp = f"Reduced relative {band} at {region} means other bands are dominating the local power budget."
            followup = "Identify which bands are elevated in absolute power and assess energy transfer."
    elif map_type == "amplitude_asymmetry":
        if direction in ("elevated", "hypercoherent"):
            interp = f"Amplitude asymmetry at {region} in {band} indicates over-firing on one side."
            followup = "Assess for structural lesions, medication effects, or focal dysfunction on the depressed side."
        else:
            interp = f"Amplitude suppression at {region} in {band} indicates under-firing."
            followup = "Dysfunction is usually on the side of depressed amplitude. Review clinical history."
    elif map_type == "coherence":
        if direction in ("elevated", "hypercoherent"):
            interp = f"Hypercoherence in {band} between {region} indicates over-communication."
            followup = "May reflect compensatory processing or failure to specialize. Consider coherence training."
        else:
            interp = f"Hypocoherence in {band} between {region} indicates under-communication."
            followup = "May reflect disconnection or poor information integration. Consider connectivity training."
    elif map_type == "phase":
        if direction in ("phase_lag_high", "elevated"):
            interp = f"High phase lag in {band} between {region} — signals arriving too slowly."
            followup = "May manifest as slowed information processing. Compare to coherence for full picture."
        else:
            interp = f"Low phase lag in {band} between {region} — signals arriving too quickly."
            followup = "May indicate inefficiency or premature signal arrival. Compare to coherence."
    else:
        interp = "Unable to generate interpretation for this combination."
        followup = "Consult raw EEG and clinical context."

    return {
        "severity": severity,
        "interpretation": interp,
        "suggested_followup": followup,
    }
