"""Abnormal EEG pattern catalog from structured clinical education.

Catalogs rhythmic, periodic, and epileptiform patterns with their clinical
significance, typical etiologies, localization, and prognostic implications.
Used to enrich qEEG findings and copilot responses with pathological context.

All entries are deterministic, import-safe, and PHI-free.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class AbnormalPattern:
    """A single abnormal EEG pattern with clinical context."""

    name: str
    aliases: tuple[str, ...]
    category: str  # "periodic", "rhythmic_delta", "epileptiform", "seizure", "continuity"
    localization: str
    frequency: str
    morphology: str
    typical_etiologies: tuple[str, ...]
    clinical_significance: str
    seizure_association: str | None  # e.g. "70%", "common", "rare"
    differentiation: str
    pediatric_note: str | None
    urgency: str  # "critical", "urgent", "routine"


_PATTERNS: tuple[AbnormalPattern, ...] = (
    # ── Periodic epileptiform discharges ─────────────────────────────────────
    AbnormalPattern(
        name="lpd",
        aliases=("pled", "lateralized_periodic_discharge", "periodic_lateralized_epileptiform_discharge"),
        category="periodic",
        localization="Unilateral (focal, e.g. F4-C4, T4-O2)",
        frequency="0.5–1 per second (every 1–2 sec)",
        morphology="Spiky discharges with superimposed low-amplitude fast activity",
        typical_etiologies=(
            "Acute stroke (most common, ~30%)",
            "Acute neurologic injury",
            "Cerebral hypoxia/ischemia",
        ),
        clinical_significance=(
            "Marker of acute focal brain injury. Associated with subtle motor signs, "
            "altered mental status, and epilepsia partialis continua."
        ),
        seizure_association="70%",
        differentiation=(
            "Distinguish from rhythmic seizure activity: PLEDs are periodic and do not "
            "evolve in frequency/amplitude. Video correlation essential."
        ),
        pediatric_note=None,
        urgency="critical",
    ),
    AbnormalPattern(
        name="bipled",
        aliases=("bipd", "bilateral_independent_periodic_lateralized_epileptiform_discharge"),
        category="periodic",
        localization="Bilateral but independent (e.g. FP1-F3 left, FP2-F4 right)",
        frequency="0.5–1 per second, asynchronous between hemispheres",
        morphology="Independent spiky discharges on both sides",
        typical_etiologies=(
            "Bilateral acute injuries",
            "Severe diffuse encephalopathy",
            "Cerebral hypoxia",
        ),
        clinical_significance=(
            "More severe than unilateral PLEDs. Indicates widespread or multifocal "
            "cerebral dysfunction."
        ),
        seizure_association="43%",
        differentiation=(
            "Asynchronous bilateral discharges (unlike synchronous GPEDs). "
            "Each hemisphere shows independent periodicity."
        ),
        pediatric_note=None,
        urgency="critical",
    ),
    AbnormalPattern(
        name="gpd",
        aliases=("gped", "generalized_periodic_discharge", "generalized_periodic_epileptiform_discharge"),
        category="periodic",
        localization="Generalized, synchronous across all regions",
        frequency="0.5–2 per second",
        morphology="Synchronous sharp-wave or spike-wave complexes",
        typical_etiologies=(
            "Metabolic encephalopathy (most common)",
            "Cerebral hypoxia/ischemia",
            "Anoxic brain injury",
            "Severe sepsis",
        ),
        clinical_significance=(
            "Indicates severe diffuse cerebral dysfunction, often toxic-metabolic or "
            "hypoxic in origin. Associated with selective synaptic failure or neuronal "
            "damage of inhibitory interneurons leading to disinhibition of excitatory "
            "pyramidal cells."
        ),
        seizure_association="29%",
        differentiation=(
            "Synchronous bilateral (unlike independent BIPLEDs). Typically slower and "
            "more regular than seizure activity."
        ),
        pediatric_note=None,
        urgency="critical",
    ),
    AbnormalPattern(
        name="sirpid",
        aliases=("stimulus_induced_rhythmic_periodical_or_ictal_discharge",),
        category="periodic",
        localization="Variable — can be focal, multifocal, or generalized",
        frequency="Variable, triggered by external stimulation",
        morphology="Rhythmic or periodic discharges induced by stimulus",
        typical_etiologies=(
            "Hypoxic-ischemic encephalopathy",
            "Traumatic brain injury",
            "Intracranial hemorrhage",
            "Toxic-metabolic disturbances",
        ),
        clinical_significance=(
            "Occurs in critically ill patients in response to stimulation (suctioning, "
            "turning, loud sounds). May represent ictal or pre-ictal activity."
        ),
        seizure_association="Common in severe encephalopathy",
        differentiation=(
            "Time-locked to external stimulus (unlike spontaneous discharges). "
            "May evolve into frank seizure if stimulation continues."
        ),
        pediatric_note=None,
        urgency="critical",
    ),
    # ── Rhythmic delta activity ──────────────────────────────────────────────
    AbnormalPattern(
        name="firda",
        aliases=("grda", "frontal_intermittent_rhythmic_delta_activity", "generalized_rhythmic_delta_activity"),
        category="rhythmic_delta",
        localization="Generalized, frontally predominant (FP1, FP2, F3, F4, Fz)",
        frequency="Delta (0.5–3 Hz), rhythmic and monomorphic",
        morphology="Repetitive, monomorphic delta waveforms",
        typical_etiologies=(
            "Focal or diffuse structural lesions",
            "Increased intracranial pressure",
            "Toxic-metabolic encephalopathy",
            "Subcortical white matter lesions",
        ),
        clinical_significance=(
            "Typically seen in adults. FIRDA is non-specific but often indicates "
            "subcortical dysfunction, hydrocephalus, or deep midline lesions."
        ),
        seizure_association="Rare — not typically epileptogenic",
        differentiation=(
            "Distinguish from eye-blink artifact: FIRDA is generalized and posterior "
            "as well as frontal; blink artifact is confined to frontal leads only."
        ),
        pediatric_note="Rare in children; if seen, investigate structural cause.",
        urgency="urgent",
    ),
    AbnormalPattern(
        name="oirda",
        aliases=("occipital_intermittent_rhythmic_delta_activity",),
        category="rhythmic_delta",
        localization="Generalized, occipitally predominant (O1, O2, Pz)",
        frequency="Delta (0.5–3 Hz), rhythmic",
        morphology="Repetitive delta waveforms maximal posteriorly",
        typical_etiologies=(
            "Childhood absence epilepsy",
            "Occipital lobe lesions",
        ),
        clinical_significance=(
            "Typically seen in children with absence epilepsy. In adults, suggests "
            "posterior structural lesion."
        ),
        seizure_association="Associated with absence epilepsy in children",
        differentiation=(
            "Distinguish from normal posterior slowing of youth: OIRDA is more rhythmic "
            "and persistent; posterior slow waves of youth are superimposed on normal alpha."
        ),
        pediatric_note="Common in childhood absence epilepsy (ages 4–10).",
        urgency="urgent",
    ),
    AbnormalPattern(
        name="lrda",
        aliases=("lateralized_rhythmic_delta_activity",),
        category="rhythmic_delta",
        localization="Unilateral (any lobe)",
        frequency="Delta (0.5–3 Hz), rhythmic",
        morphology="Repetitive monomorphic delta on one side",
        typical_etiologies=(
            "Gray matter lesion (tumor, stroke, contusion)",
            "Focal cerebral hyperexcitability",
        ),
        clinical_significance=(
            "Lateralized rhythmic delta indicates focal structural or functional "
            "abnormality. More specific than GRDA for localization."
        ),
        seizure_association="May evolve into focal seizure",
        differentiation=(
            "Distinguish from polymorphic focal slowing: LRDA is rhythmic and monomorphic; "
            "polymorphic slowing varies in morphology."
        ),
        pediatric_note=None,
        urgency="urgent",
    ),
    # ── Continuity abnormalities ─────────────────────────────────────────────
    AbnormalPattern(
        name="burst_suppression",
        aliases=("bs", "burst_suppression_pattern", "bsp"),
        category="continuity",
        localization="Generalized",
        frequency="Bursts of mixed frequencies alternating with suppression",
        morphology="High-amplitude irregular bursts followed by >50% amplitude suppression",
        typical_etiologies=(
            "Severe anoxic brain injury post-cardiac arrest",
            "Deep sedation / anesthesia",
            "Severe hypothermia",
            "Neonatal encephalopathy",
        ),
        clinical_significance=(
            "Indicates profound cerebral dysfunction. After hypoxic coma, carries poor "
            "prognosis unless due to reversible cause (sedation, hypothermia)."
        ),
        seizure_association="Bursts may contain epileptiform activity",
        differentiation=(
            "Distinguish from sleep trace alternans: burst-suppression has more profound "
            "suppression and is seen in comatose patients, not sleep."
        ),
        pediatric_note="In neonates, may be seen with severe encephalopathy.",
        urgency="critical",
    ),
    # ── Epileptiform discharges ──────────────────────────────────────────────
    AbnormalPattern(
        name="slow_spike_wave",
        aliases=("slow_wave_spike", "generalized_slow_spike_wave_complex"),
        category="epileptiform",
        localization="Generalized, synchronous",
        frequency="~2 Hz (slow spike-wave)",
        morphology="Bilaterally synchronous sharp wave paired with slow wave",
        typical_etiologies=(
            "Lennox-Gastaut syndrome",
            "Severe epileptic encephalopathy",
        ),
        clinical_significance=(
            "Hallmark of Lennox-Gastaut syndrome (onset age 1–8, peak 3–5 years). "
            "Associated with multiple seizure types, intellectual disability, and poor prognosis."
        ),
        seizure_association="Inherent — defines the syndrome",
        differentiation=(
            "Distinguish from 3Hz absence spike-wave: slow spike-wave is ~2 Hz and "
            "associated with more severe encephalopathy; 3Hz spike-wave is faster and "
            "associated with typical absence."
        ),
        pediatric_note="Almost exclusively pediatric (ages 1–8).",
        urgency="urgent",
    ),
    AbnormalPattern(
        name="three_hz_spike_wave",
        aliases=("absence_spike_wave", "petit_mal", "generalized_3hz_spike_wave"),
        category="epileptiform",
        localization="Generalized, synchronous",
        frequency="3 Hz (regular and symmetric)",
        morphology="Regular generalized spike-and-slow-wave complexes",
        typical_etiologies=(
            "Childhood absence epilepsy",
            "Juvenile absence epilepsy",
        ),
        clinical_significance=(
            "Hallmark of absence (petit mal) seizures. Brief loss of awareness with "
            "minimal motor manifestation. Typically begins age 4–10."
        ),
        seizure_association="100% — defines absence seizure",
        differentiation=(
            "Distinguish from slow spike-wave (Lennox-Gastaut): 3Hz is faster, more regular, "
            "and associated with less severe cognitive impairment."
        ),
        pediatric_note="Typical onset 4–10 years; may persist into adolescence.",
        urgency="urgent",
    ),
    AbnormalPattern(
        name="polyspike_wave",
        aliases=("rapid_spikes", "generalized_polyspike_and_wave"),
        category="epileptiform",
        localization="Generalized, synchronous",
        frequency="Fast (>10 Hz) polyspikes followed by slow wave",
        morphology="Diffuse polyspikes increasing in amplitude and frequency",
        typical_etiologies=(
            "Lennox-Gastaut syndrome",
            "Tonic seizures",
            "Myoclonic seizures",
        ),
        clinical_significance=(
            "Associated with tonic seizures in Lennox-Gastaut syndrome. Polyspikes may "
            "be accompanied by mild bilateral muscular contraction on EMG."
        ),
        seizure_association="Common in tonic and myoclonic seizures",
        differentiation=(
            "Distinguish from normal muscle artifact: polyspike-wave is time-locked to "
            "clinical seizure and has typical EEG morphology; muscle artifact is faster "
            "and more irregular."
        ),
        pediatric_note="Common in Lennox-Gastaut (ages 1–8).",
        urgency="urgent",
    ),
    # ── Seizure patterns ─────────────────────────────────────────────────────
    AbnormalPattern(
        name="generalized_tonic_clonic_seizure",
        aliases=("gtcs", "grand_mal"),
        category="seizure",
        localization="Generalized",
        frequency="Tonic: >10 Hz fast activity; Clonic: slow waves with spikes",
        morphology="Tonic phase: fast activity increasing in amplitude, decreasing frequency; "
                  "Clonic phase: slow waves with moderately high amplitude",
        typical_etiologies=(
            "Genetic generalized epilepsy",
            "Structural epilepsy (if focal onset secondarily generalized)",
            "Metabolic derangement",
            "Withdrawal from AEDs",
        ),
        clinical_significance=(
            "Tonic phase: loss of consciousness, full body stiffening, possible loud cry. "
            "Clonic phase: active rhythmic jerking. Post-ictal confusion common."
        ),
        seizure_association="100% — this IS the seizure",
        differentiation=(
            "Distinguish from psychogenic non-epileptic seizure (PNES): GTCS has typical "
            "EEG evolution (fast tonic → slow clonic); PNES lacks this pattern and often "
            "has asynchronous movements."
        ),
        pediatric_note=None,
        urgency="critical",
    ),
    AbnormalPattern(
        name="focal_seizure",
        aliases=("partial_seizure", "focal_onset_seizure"),
        category="seizure",
        localization="Focal (originates from one brain region)",
        frequency="Variable — rhythmic activity at seizure frequency",
        morphology="Rhythmic activity evolving in morphology, amplitude, and frequency",
        typical_etiologies=(
            "Focal cortical dysplasia",
            "Hippocampal sclerosis",
            "Tumor",
            "Stroke",
            "Trauma",
        ),
        clinical_significance=(
            "Manifestation depends on brain region: motor (jacksonian march), sensory "
            "(paresthesia), autonomic (palpitations), psychic (déjà vu, fear), or impaired "
            "awareness. Cloudy awareness may occur."
        ),
        seizure_association="100% — this IS the seizure",
        differentiation=(
            "Distinguish from normal variant (e.g., mu rhythm, RMTD): seizure shows evolution "
            "in frequency/amplitude and has clinical correlate; normal variants are stable."
        ),
        pediatric_note=None,
        urgency="critical",
    ),
    AbnormalPattern(
        name="infantile_spa_sm",
        aliases=("west_syndrome", "epileptic_spa_sm", "hypsarrhythmia"),
        category="seizure",
        localization="Generalized (hypsarrhythmic background)",
        frequency="Chaotic high-voltage background with spasms",
        morphology="High-voltage chaotic pattern (hypsarrhythmia) with brief spasms of "
                  "massive symmetric contractions followed by amplitude reduction",
        typical_etiologies=(
            "Tuberous sclerosis",
            "Brain malformations",
            "Hypoxic-ischemic encephalopathy",
            "Genetic disorders (e.g., Down syndrome)",
        ),
        clinical_significance=(
            "West syndrome: onset typically before age 1. Brief spasms of massive symmetric "
            "contractions. High-voltage chaotic background (hypsarrhythmia) between spasms. "
            "Medical emergency requiring urgent treatment to prevent developmental regression."
        ),
        seizure_association="100% — this IS the seizure",
        differentiation=(
            "Distinguish from startle reflex: spasms are more sustained and rhythmic; "
            "startle is brief and non-rhythmic. Hypsarrhythmia is pathognomonic."
        ),
        pediatric_note="Exclusively pediatric (< 1 year). Medical emergency.",
        urgency="critical",
    ),
    AbnormalPattern(
        name="hihars",
        aliases=("hyperventilation_induced_high_amplitude_rhythmic_slowing",),
        category="rhythmic_delta",
        localization="Generalized, bilateral, synchronous",
        frequency="Delta-theta (3–5 Hz), rhythmic",
        morphology="Bilateral, rhythmic, in-phase, low-frequency high-amplitude activity",
        typical_etiologies=(
            "Induced by hyperventilation (normal physiological response in children)",
            "Absence epilepsy (if accompanied by 3Hz spike-wave)",
        ),
        clinical_significance=(
            "In children, HIHARS is a normal response to hyperventilation. In adults or if "
            "accompanied by spike-wave, suggests absence epilepsy. May present with altered "
            "awareness (unresponsiveness, yawning, fidgeting, lip smacking)."
        ),
        seizure_association="If accompanied by 3Hz spike-wave, indicates absence seizure",
        differentiation=(
            "Distinguish from pathological slowing: HIHARS is provoked by hyperventilation "
            "and resolves within 30 seconds of cessation; pathological slowing persists."
        ),
        pediatric_note="Normal in children during hyperventilation; abnormal in adults.",
        urgency="routine",
    ),
)


# Build indexes
_BY_NAME: dict[str, AbnormalPattern] = {}
_BY_ALIAS: dict[str, AbnormalPattern] = {}
_BY_CATEGORY: dict[str, list[AbnormalPattern]] = {}
_BY_URGENCY: dict[str, list[AbnormalPattern]] = {}

for _entry in _PATTERNS:
    _BY_NAME[_entry.name] = _entry
    for _alias in _entry.aliases:
        _BY_ALIAS[_alias] = _entry
    _BY_CATEGORY.setdefault(_entry.category, []).append(_entry)
    _BY_URGENCY.setdefault(_entry.urgency, []).append(_entry)


class AbnormalPatternAtlas:
    """Read-only accessor for the abnormal pattern atlas."""

    @staticmethod
    def lookup(name: str) -> AbnormalPattern | None:
        """Return pattern by name or alias."""
        key = name.lower().replace(" ", "_").replace("-", "_")
        return _BY_NAME.get(key) or _BY_ALIAS.get(key)

    @staticmethod
    def by_category(category: str) -> list[AbnormalPattern]:
        """Return all patterns in a category.

        Categories: periodic, rhythmic_delta, epileptiform, seizure, continuity.
        """
        return list(_BY_CATEGORY.get(category.lower(), []))

    @staticmethod
    def by_urgency(urgency: str) -> list[AbnormalPattern]:
        """Return all patterns with given urgency (critical, urgent, routine)."""
        return list(_BY_URGENCY.get(urgency.lower(), []))

    @staticmethod
    def all_patterns() -> tuple[AbnormalPattern, ...]:
        """Return the full atlas."""
        return _PATTERNS


def flag_potential_abnormal_pattern(
    region: str,
    band: str,
    morphology_hint: str = "",
) -> list[dict[str, str]]:
    """Return advisory flags for abnormal patterns that might match a finding.

    Parameters
    ----------
    region : str
        Channel or region label (e.g. ``"Fp1"``, ``"F3"``).
    band : str
        Frequency band (e.g. ``"delta"``, ``"beta"``).
    morphology_hint : str
        Optional description of waveform morphology.

    Returns
    -------
    list of dict
        Each dict has keys ``pattern``, ``confidence``, ``note``, ``urgency``.
    """
    flags: list[dict[str, str]] = []
    region_lower = region.lower()
    band_lower = band.lower()

    for pattern in _PATTERNS:
        confidence = "low"

        # Region match
        loc = pattern.localization.lower()
        if "generalized" in loc and any(
            x in region_lower for x in ("fp", "f", "c", "t", "p", "o")
        ):
            confidence = "medium"
        elif "unilateral" in loc or "focal" in loc:
            if any(x in region_lower for x in ("f4", "c4", "t4", "p4", "o2", "right")):
                confidence = "medium"
            elif any(x in region_lower for x in ("f3", "c3", "t3", "p3", "o1", "left")):
                confidence = "medium"
        elif "frontal" in loc and any(x in region_lower for x in ("fp", "f")):
            confidence = "medium"
        elif "occipital" in loc and any(x in region_lower for x in ("o", "p")):
            confidence = "medium"

        # Band match
        if band_lower in pattern.frequency.lower():
            confidence = "high" if confidence == "medium" else "medium"

        # Morphology hint match
        if morphology_hint and morphology_hint.lower() in pattern.morphology.lower():
            confidence = "high"

        if confidence in ("medium", "high"):
            flags.append(
                {
                    "pattern": pattern.name,
                    "confidence": confidence,
                    "note": pattern.clinical_significance[:200] + "...",
                    "urgency": pattern.urgency,
                    "seizure_risk": pattern.seizure_association or "unknown",
                }
            )

    return flags
