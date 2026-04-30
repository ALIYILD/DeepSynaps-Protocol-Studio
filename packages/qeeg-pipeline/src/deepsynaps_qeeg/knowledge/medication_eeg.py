"""Medication → EEG effect ontology for confound detection and interpretation.

Maps common psychotropic, neurologic, and anesthetic medications to their
expected scalp EEG signatures. Used to flag potential confounds in qEEG
findings and to enrich copilot responses with medication-aware reasoning.

All entries are deterministic, evidence-based summaries from clinical
EEG literature. No dosing information — only EEG-relevant effects.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable


@dataclass(frozen=True)
class MedicationProfile:
    """A single medication and its expected EEG effects."""

    name: str
    drug_class: str
    eeg_effects: tuple[str, ...]
    affected_bands: tuple[str, ...]
    typical_channels: tuple[str, ...]
    onset_hours: str
    washout_days: str
    clinical_note: str


# ── Medication atlas (deterministic, evidence-based) ───────────────────────

_MEDICATION_ATLAS: tuple[MedicationProfile, ...] = (
    MedicationProfile(
        name="Benzodiazepines (e.g., lorazepam, diazepam, clonazepam)",
        drug_class="GABA-A positive allosteric modulator / anxiolytic-sedative",
        eeg_effects=("Diffuse excess beta (13–30 Hz)", "Reduced alpha amplitude", "Generalized slowing at high doses"),
        affected_bands=("beta", "alpha"),
        typical_channels=(),
        onset_hours="0.5–2",
        washout_days="2–7 (longer for long-acting agents)",
        clinical_note="Beta excess is the hallmark EEG effect and can obscure underlying pathology. Do not mistake diffuse beta for cortical hyperexcitability.",
    ),
    MedicationProfile(
        name="Barbiturates (e.g., phenobarbital)",
        drug_class="GABA-A agonist / antiepileptic-sedative",
        eeg_effects=("Diffuse excess beta", "Generalized slowing", "Burst suppression at high doses"),
        affected_bands=("beta", "alpha", "delta"),
        typical_channels=(),
        onset_hours="1–4",
        washout_days="14–21",
        clinical_note="Similar to benzodiazepines but with more pronounced slowing. Burst suppression may be seen in ICU settings with high-dose barbiturate coma.",
    ),
    MedicationProfile(
        name="SSRIs (e.g., sertraline, fluoxetine, escitalopram)",
        drug_class="Selective serotonin reuptake inhibitor",
        eeg_effects=("Mild increase in theta", "Subtle alpha slowing in some patients", "Occasional increased beta"),
        affected_bands=("theta", "alpha", "beta"),
        typical_channels=(),
        onset_hours="Days to weeks (chronic effect)",
        washout_days="7–21 (varies by half-life)",
        clinical_note="EEG effects are generally mild and nonspecific. Theta increase may be mistaken for encephalopathy if not correlated with medication history.",
    ),
    MedicationProfile(
        name="Tricyclic antidepressants (e.g., amitriptyline, nortriptyline)",
        drug_class="Serotonin-norepinephrine reuptake inhibitor",
        eeg_effects=("Diffuse theta slowing", "Increased beta", "Alpha attenuation"),
        affected_bands=("theta", "beta", "alpha"),
        typical_channels=(),
        onset_hours="Days",
        washout_days="3–7",
        clinical_note="More pronounced EEG slowing than SSRIs. Anticholinergic properties contribute to the slowing effect.",
    ),
    MedicationProfile(
        name="Stimulants (e.g., methylphenidate, amphetamine)",
        drug_class="Dopamine-norepinephrine reuptake inhibitor",
        eeg_effects=("Decreased theta", "Increased beta", "Faster PAF", "Reduced slow-wave sleep"),
        affected_bands=("theta", "beta", "alpha"),
        typical_channels=(),
        onset_hours="0.5–1",
        washout_days="1–2",
        clinical_note="Expected to lower theta/beta ratio. Acute withdrawal may transiently increase theta and slow alpha.",
    ),
    MedicationProfile(
        name="Antiepileptics — Sodium channel blockers (e.g., carbamazepine, phenytoin)",
        drug_class="Voltage-gated sodium channel blocker",
        eeg_effects=("Diffuse beta increase", "Focal/global slowing at toxic levels", "Suppression of epileptiform activity"),
        affected_bands=("beta", "delta", "theta"),
        typical_channels=(),
        onset_hours="Days (steady state)",
        washout_days="3–7",
        clinical_note="Therapeutic doses typically increase beta. Toxic levels cause slowing and may flatten the background.",
    ),
    MedicationProfile(
        name="Antiepileptics — GABAergic (e.g., valproate, gabapentin)",
        drug_class="GABA enhancer / broad-spectrum antiepileptic",
        eeg_effects=("Diffuse beta increase", "Mild slowing", "Reduced epileptiform discharges"),
        affected_bands=("beta", "alpha"),
        typical_channels=(),
        onset_hours="Days (valproate); hours (gabapentin)",
        washout_days="3–7",
        clinical_note="Valproate produces prominent diffuse beta that can be mistaken for benzodiazepine effect.",
    ),
    MedicationProfile(
        name="Lamotrigine",
        drug_class="Sodium channel blocker + glutamate release inhibitor",
        eeg_effects=("Minimal EEG changes at therapeutic doses", "Occasional mild beta increase", "Reduction in epileptiform activity"),
        affected_bands=("beta",),
        typical_channels=(),
        onset_hours="Weeks (titration)",
        washout_days="7–14",
        clinical_note="One of the cleaner antiepileptics from an EEG perspective. Minimal confounding at standard doses.",
    ),
    MedicationProfile(
        name="Levetiracetam",
        drug_class="SV2A modulator / broad-spectrum antiepileptic",
        eeg_effects=("Minimal background changes", "Reduction in epileptiform discharges", "Occasional mild slowing"),
        affected_bands=(),
        typical_channels=(),
        onset_hours="Hours",
        washout_days="2–3",
        clinical_note="Generally EEG-neutral at therapeutic doses. Preferred when a clean EEG background is needed for interpretation.",
    ),
    MedicationProfile(
        name="Lithium",
        drug_class="Mood stabilizer",
        eeg_effects=("Diffuse theta slowing", "Reduced alpha frequency", "Occasional generalized slowing at toxic levels"),
        affected_bands=("theta", "alpha"),
        typical_channels=(),
        onset_hours="Days to weeks",
        washout_days="7–14",
        clinical_note="Toxic lithium levels can produce a marked encephalopathic pattern with diffuse slowing. Always correlate with serum levels.",
    ),
    MedicationProfile(
        name="Antipsychotics — Typical (e.g., haloperidol)",
        drug_class="Dopamine D2 antagonist",
        eeg_effects=("Diffuse theta slowing", "Reduced alpha", "Increased delta in some patients"),
        affected_bands=("theta", "alpha", "delta"),
        typical_channels=(),
        onset_hours="Hours",
        washout_days="2–7",
        clinical_note="Slowing is dose-dependent. High doses or IV administration can produce marked generalized slowing.",
    ),
    MedicationProfile(
        name="Antipsychotics — Atypical (e.g., quetiapine, olanzapine, risperidone)",
        drug_class="Multi-receptor antagonist (5-HT2A, D2, H1, etc.)",
        eeg_effects=("Diffuse theta-delta slowing", "Alpha attenuation", "Increased sleepiness-related theta"),
        affected_bands=("theta", "delta", "alpha"),
        typical_channels=(),
        onset_hours="Hours",
        washout_days="2–7",
        clinical_note="Sedating atypicals (quetiapine, olanzapine) produce more slowing than non-sedating ones (aripiprazole).",
    ),
    MedicationProfile(
        name="Opioids (e.g., morphine, fentanyl)",
        drug_class="Mu-opioid receptor agonist",
        eeg_effects=("Diffuse theta-delta slowing", "Reduced beta", "Alpha attenuation"),
        affected_bands=("theta", "delta", "beta", "alpha"),
        typical_channels=(),
        onset_hours="Minutes to hours",
        washout_days="1–3",
        clinical_note="Dose-dependent slowing. Fentanyl bursts can produce brief rhythmic delta activity that resembles seizures but lacks evolution.",
    ),
    MedicationProfile(
        name="Propofol",
        drug_class="GABA-A agonist / IV anesthetic",
        eeg_effects=("Initial beta increase", "Progressive slowing with dose", "Burst suppression at high doses"),
        affected_bands=("beta", "alpha", "theta", "delta"),
        typical_channels=(),
        onset_hours="Minutes",
        washout_days="Hours",
        clinical_note="Very fast onset/offset. EEG changes track dose in real time. Burst suppression is intentionally targeted for refractory status epilepticus.",
    ),
    MedicationProfile(
        name="Ketamine",
        drug_class="NMDA receptor antagonist / dissociative anesthetic",
        eeg_effects=("Theta-gamma coupling increase", "Frontal delta-theta rhythm", "Preserved or increased gamma"),
        affected_bands=("theta", "gamma", "delta"),
        typical_channels=("Fp1", "Fp2", "Fz", "F3", "F4"),
        onset_hours="Minutes",
        washout_days="Hours to 1 day",
        clinical_note="Produces a unique EEG signature distinct from GABAergic agents. Frontal rhythmic slow activity is characteristic.",
    ),
    MedicationProfile(
        name="Dexmedetomidine",
        drug_class="Alpha-2 agonist / sedative",
        eeg_effects=("Spindle-like activity", "Preserved background architecture", "Less suppression than propofol"),
        affected_bands=("alpha", "sigma"),
        typical_channels=(),
        onset_hours="Minutes",
        washout_days="Hours",
        clinical_note="Produces natural sleep-like EEG patterns with spindles. Neurophysiologically distinct from GABAergic sedation.",
    ),
    MedicationProfile(
        name="Melatonin",
        drug_class="Hormone / sleep regulator",
        eeg_effects=("Mild theta increase", "Earlier sleep-onset patterns", "Minimal waking EEG changes"),
        affected_bands=("theta",),
        typical_channels=(),
        onset_hours="0.5–1",
        washout_days="Hours",
        clinical_note="Minimal confounding for waking qEEG. May shift circadian phase and thus affect recording time norms.",
    ),
    MedicationProfile(
        name="Caffeine",
        drug_class="Adenosine receptor antagonist / stimulant",
        eeg_effects=("Decreased theta", "Increased beta", "Faster alpha frequency", "Reduced sleepiness markers"),
        affected_bands=("theta", "beta", "alpha"),
        typical_channels=(),
        onset_hours="0.25–0.5",
        washout_days="Hours",
        clinical_note="Acute caffeine reduces theta/beta ratio. Withdrawal (>12–24h) can transiently increase theta and slow alpha.",
    ),
    MedicationProfile(
        name="Alcohol — Acute intoxication",
        drug_class="GABA-A positive modulator / NMDA antagonist",
        eeg_effects=("Diffuse beta increase", "Mild theta slowing", "Alpha attenuation"),
        affected_bands=("beta", "theta", "alpha"),
        typical_channels=(),
        onset_hours="0.25–1",
        washout_days="Hours",
        clinical_note="Acute intoxication resembles benzodiazepine effect. Chronic use or withdrawal produces marked slowing and irritability.",
    ),
    MedicationProfile(
        name="Alcohol — Withdrawal",
        drug_class="GABA/glutamate rebound",
        eeg_effects=("Diffuse theta-delta slowing", "Increased beta", "Focal or generalized epileptiform activity", "Triphasic waves in severe cases"),
        affected_bands=("theta", "delta", "beta"),
        typical_channels=(),
        onset_hours="6–48",
        washout_days="Days to weeks",
        clinical_note="Withdrawal is one of the most EEG-toxic states. Marked slowing, triphasics, and seizure risk are common.",
    ),
)

# Build indexes at import time.
_BY_NAME: dict[str, MedicationProfile] = {}
_BY_CLASS: dict[str, list[MedicationProfile]] = {}
_BY_BAND: dict[str, list[MedicationProfile]] = {}
_ALIASES: dict[str, str] = {
    # Benzodiazepines
    "lorazepam": "Benzodiazepines (e.g., lorazepam, diazepam, clonazepam)",
    "diazepam": "Benzodiazepines (e.g., lorazepam, diazepam, clonazepam)",
    "clonazepam": "Benzodiazepines (e.g., lorazepam, diazepam, clonazepam)",
    "alprazolam": "Benzodiazepines (e.g., lorazepam, diazepam, clonazepam)",
    "midazolam": "Benzodiazepines (e.g., lorazepam, diazepam, clonazepam)",
    "temazepam": "Benzodiazepines (e.g., lorazepam, diazepam, clonazepam)",
    # Barbiturates
    "phenobarbital": "Barbiturates (e.g., phenobarbital)",
    # SSRIs
    "sertraline": "SSRIs (e.g., sertraline, fluoxetine, escitalopram)",
    "fluoxetine": "SSRIs (e.g., sertraline, fluoxetine, escitalopram)",
    "escitalopram": "SSRIs (e.g., sertraline, fluoxetine, escitalopram)",
    "paroxetine": "SSRIs (e.g., sertraline, fluoxetine, escitalopram)",
    "citalopram": "SSRIs (e.g., sertraline, fluoxetine, escitalopram)",
    # TCAs
    "amitriptyline": "Tricyclic antidepressants (e.g., amitriptyline, nortriptyline)",
    "nortriptyline": "Tricyclic antidepressants (e.g., amitriptyline, nortriptyline)",
    # Stimulants
    "methylphenidate": "Stimulants (e.g., methylphenidate, amphetamine)",
    "amphetamine": "Stimulants (e.g., methylphenidate, amphetamine)",
    "lisdexamfetamine": "Stimulants (e.g., methylphenidate, amphetamine)",
    # Antiepileptics
    "carbamazepine": "Antiepileptics — Sodium channel blockers (e.g., carbamazepine, phenytoin)",
    "phenytoin": "Antiepileptics — Sodium channel blockers (e.g., carbamazepine, phenytoin)",
    "valproate": "Antiepileptics — GABAergic (e.g., valproate, gabapentin)",
    "gabapentin": "Antiepileptics — GABAergic (e.g., valproate, gabapentin)",
    "lamotrigine": "Lamotrigine",
    "levetiracetam": "Levetiracetam",
    # Lithium
    "lithium": "Lithium",
    # Antipsychotics
    "haloperidol": "Antipsychotics — Typical (e.g., haloperidol)",
    "quetiapine": "Antipsychotics — Atypical (e.g., quetiapine, olanzapine, risperidone)",
    "olanzapine": "Antipsychotics — Atypical (e.g., quetiapine, olanzapine, risperidone)",
    "risperidone": "Antipsychotics — Atypical (e.g., quetiapine, olanzapine, risperidone)",
    "aripiprazole": "Antipsychotics — Atypical (e.g., quetiapine, olanzapine, risperidone)",
    # Opioids
    "morphine": "Opioids (e.g., morphine, fentanyl)",
    "fentanyl": "Opioids (e.g., morphine, fentanyl)",
    # Anesthetics
    "propofol": "Propofol",
    "ketamine": "Ketamine",
    "dexmedetomidine": "Dexmedetomidine",
    # Others
    "melatonin": "Melatonin",
    "caffeine": "Caffeine",
    "alcohol": "Alcohol — Acute intoxication",
}
for _m in _MEDICATION_ATLAS:
    _BY_NAME[_m.name.lower()] = _m
    _BY_CLASS.setdefault(_m.drug_class.lower(), []).append(_m)
    for _b in _m.affected_bands:
        _BY_BAND.setdefault(_b.lower(), []).append(_m)


class MedicationEEGAtlas:
    """Read-only accessor for medication → EEG effect mappings."""

    @staticmethod
    def lookup(name: str) -> MedicationProfile | None:
        """Return the profile for *name* (case-insensitive). Supports aliases."""
        key = name.lower().strip()
        direct = _BY_NAME.get(key)
        if direct is not None:
            return direct
        # Try alias resolution.
        canonical = _ALIASES.get(key)
        if canonical:
            return _BY_NAME.get(canonical.lower())
        # Fallback: substring match on full names.
        for full_name, profile in _BY_NAME.items():
            if key in full_name:
                return profile
        return None

    @staticmethod
    def by_drug_class(drug_class: str) -> list[MedicationProfile]:
        """Return all medications in *drug_class* (case-insensitive)."""
        return list(_BY_CLASS.get(drug_class.lower(), []))

    @staticmethod
    def by_band(band: str) -> list[MedicationProfile]:
        """Return all medications known to affect *band*."""
        return list(_BY_BAND.get(band.lower(), []))

    @staticmethod
    def all_profiles() -> tuple[MedicationProfile, ...]:
        """Return the full atlas."""
        return _MEDICATION_ATLAS


def flag_medication_confounds(
    band: str,
    medications: Iterable[str],
) -> list[dict[str, str]]:
    """Return advisory medication confounds for a given band.

    Parameters
    ----------
    band : str
        Frequency band (e.g. ``"beta"``, ``"theta"``).
    medications : iterable of str
        List of medication names the patient is taking.

    Returns
    -------
    list of dict
        Each dict has keys ``medication``, ``effect``, and ``clinical_note``.
    """
    flags: list[dict[str, str]] = []
    band_lower = band.lower()
    for med_name in medications:
        profile = MedicationEEGAtlas.lookup(med_name)
        if profile is None:
            continue
        if band_lower in [b.lower() for b in profile.affected_bands]:
            flags.append(
                {
                    "medication": profile.name,
                    "effect": "; ".join(profile.eeg_effects),
                    "clinical_note": profile.clinical_note,
                }
            )
    return flags
