"""Medication → EEG effect ontology for confound detection and interpretation.

Maps common psychotropic, neurologic, and anesthetic medications to their
expected scalp EEG signatures. Used to flag potential confounds in qEEG
findings and to enrich copilot responses with medication-aware reasoning.

All entries are deterministic, evidence-based summaries from clinical
EEG literature (Gunkelman 2009; Thompson & Thompson 2015; Soutar & Longo 2011;
Salinsky et al. 2002; Shaffer 2020). No dosing information — only EEG-relevant
effects.
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
# Sources: Gunkelman (2009), Thompson & Thompson (2015), Soutar & Longo (2011),
#          Salinsky et al. (2002), Shaffer (2020), Cannon et al. (2008).

_MEDICATION_ATLAS: tuple[MedicationProfile, ...] = (
    # ── Anxiolytics / Sedatives ───────────────────────────────────────────
    MedicationProfile(
        name="Benzodiazepines (e.g., lorazepam, diazepam, clonazepam)",
        drug_class="GABA-A positive allosteric modulator / anxiolytic-sedative",
        eeg_effects=(
            "Diffuse excess beta (13–30 Hz, especially 20–30 Hz)",
            "Reduced alpha amplitude",
            "Spindling beta activity may appear",
            "Generalized slowing at high doses",
        ),
        affected_bands=("beta", "alpha"),
        typical_channels=(),
        onset_hours="0.5–2",
        washout_days="2–7 (longer for long-acting agents)",
        clinical_note=(
            "Beta excess is the hallmark EEG effect and can obscure underlying pathology. "
            "Do not mistake diffuse beta for cortical hyperexcitability. "
            "Elderly patients are at increased risk of sedation and psychomotor impairment."
        ),
    ),
    MedicationProfile(
        name="Barbiturates (e.g., phenobarbital)",
        drug_class="GABA-A agonist / antiepileptic-sedative",
        eeg_effects=(
            "Initial diffuse excess beta (18–26 Hz), often frontal",
            "Increased dosage → theta increases, beta decreases",
            "Sleep spindles increased",
            "Burst suppression or isoelectric coma at high doses",
        ),
        affected_bands=("beta", "alpha", "delta", "theta"),
        typical_channels=(),
        onset_hours="1–4",
        washout_days="14–21",
        clinical_note=(
            "Similar to benzodiazepines but with more pronounced slowing. "
            "Burst suppression may be seen in ICU settings with high-dose barbiturate coma. "
            "Frontal beta may spread to entire cortex with dose escalation."
        ),
    ),
    MedicationProfile(
        name="Meprobamate",
        drug_class="Carbamate anxiolytic",
        eeg_effects=(
            "Decreased alpha amplitude",
            "Increased beta over 20 Hz",
            "Slight increase in theta",
        ),
        affected_bands=("alpha", "beta", "theta"),
        typical_channels=(),
        onset_hours="0.5–1",
        washout_days="2–5",
        clinical_note="Does not increase epileptiform activity or paroxysms. Less commonly prescribed today.",
    ),
    # ── Antidepressants ───────────────────────────────────────────────────
    MedicationProfile(
        name="SSRIs (e.g., sertraline, fluoxetine, escitalopram)",
        drug_class="Selective serotonin reuptake inhibitor",
        eeg_effects=(
            "Mild increase in theta",
            "Subtle alpha slowing in some patients",
            "Occasional increased beta (fronto-central 18–25 Hz)",
        ),
        affected_bands=("theta", "alpha", "beta"),
        typical_channels=(),
        onset_hours="Days to weeks (chronic effect)",
        washout_days="7–21 (varies by half-life)",
        clinical_note="EEG effects are generally mild and nonspecific. Theta increase may be mistaken for encephalopathy if not correlated with medication history.",
    ),
    MedicationProfile(
        name="Tricyclic antidepressants (e.g., amitriptyline, nortriptyline)",
        drug_class="Serotonin-norepinephrine reuptake inhibitor",
        eeg_effects=(
            "Diffuse theta slowing",
            "Increased beta",
            "Alpha attenuation",
        ),
        affected_bands=("theta", "beta", "alpha"),
        typical_channels=(),
        onset_hours="Days",
        washout_days="3–7",
        clinical_note="More pronounced EEG slowing than SSRIs. Anticholinergic properties contribute to the slowing effect.",
    ),
    MedicationProfile(
        name="MAOIs (e.g., phenelzine, tranylcypromine)",
        drug_class="Monoamine oxidase inhibitor",
        eeg_effects=(
            "Initially increase alpha amplitude",
            "Prolonged use → decrease alpha, increase theta",
            "Increase in 20–30 Hz beta with chronic exposure",
        ),
        affected_bands=("alpha", "theta", "beta"),
        typical_channels=(),
        onset_hours="Days to weeks",
        washout_days="14–21",
        clinical_note="Time-dependent profile: early alpha enhancement gives way to theta-dominant slowing with chronic use. Dietary restrictions required.",
    ),
    MedicationProfile(
        name="SNRIs (e.g., venlafaxine, duloxetine)",
        drug_class="Serotonin-norepinephrine reuptake inhibitor",
        eeg_effects=(
            "Increased alpha amplitude",
            "Increased beta activity",
        ),
        affected_bands=("alpha", "beta"),
        typical_channels=(),
        onset_hours="Days to weeks",
        washout_days="7–14",
        clinical_note="Dual reuptake inhibition produces a more activating EEG profile than SSRIs, with increases in both alpha and beta.",
    ),
    # ── Stimulants ────────────────────────────────────────────────────────
    MedicationProfile(
        name="Stimulants (e.g., methylphenidate, amphetamine)",
        drug_class="Dopamine-norepinephrine reuptake inhibitor",
        eeg_effects=(
            "Decreased theta",
            "Increased beta (12–26 Hz)",
            "Decreased alpha in normally-aroused individuals",
            "Faster PAF",
            "Reduced slow-wave sleep",
        ),
        affected_bands=("theta", "beta", "alpha"),
        typical_channels=(),
        onset_hours="0.5–1",
        washout_days="1–2",
        clinical_note=(
            "Expected to lower theta/beta ratio. Acute withdrawal may transiently increase theta and slow alpha. "
            "Baseline arousal modulates alpha response: under-aroused → alpha may increase; anxious → no alpha change."
        ),
    ),
    MedicationProfile(
        name="Methylphenidate / Ritalin / Concerta",
        drug_class="Dopamine-norepinephrine reuptake inhibitor",
        eeg_effects=(
            "Can increase posterior alpha in ADHD",
            "Decreased theta",
            "Increased beta",
        ),
        affected_bands=("alpha", "theta", "beta"),
        typical_channels=("O1", "O2", "Pz"),
        onset_hours="0.5–1",
        washout_days="1–2",
        clinical_note="Posterior alpha increase is a paradoxical normalization marker in ADHD. Same-day washout preferred for assessment.",
    ),
    MedicationProfile(
        name="Cocaine",
        drug_class="Dopamine-norepinephrine reuptake inhibitor / illicit stimulant",
        eeg_effects=(
            "Low–moderate doses: increased alpha and beta",
            "High doses: EEG desynchronization with predominance of faster activities",
            "Acute use may reduce frontal alpha coherence",
        ),
        affected_bands=("alpha", "beta"),
        typical_channels=(),
        onset_hours="Minutes",
        washout_days="1–3",
        clinical_note="Dose-dependent biphasic effect. Chronic use is associated with frontal hypoactivation and attention deficits.",
    ),
    # ── Antiepileptics ────────────────────────────────────────────────────
    MedicationProfile(
        name="Antiepileptics — Sodium channel blockers (e.g., carbamazepine, phenytoin)",
        drug_class="Voltage-gated sodium channel blocker",
        eeg_effects=(
            "Diffuse beta increase",
            "Focal/global slowing at toxic levels",
            "Suppression of epileptiform activity",
        ),
        affected_bands=("beta", "delta", "theta"),
        typical_channels=(),
        onset_hours="Days (steady state)",
        washout_days="3–7",
        clinical_note="Therapeutic doses typically increase beta. Toxic levels cause slowing and may flatten the background.",
    ),
    MedicationProfile(
        name="Carbamazepine",
        drug_class="Voltage-gated sodium channel blocker / anticonvulsant",
        eeg_effects=(
            "EEG slowing with prolonged use",
            "Significant reduction of posterior alpha rhythm peak frequency",
            "Greater alpha peak reduction than gabapentin",
        ),
        affected_bands=("alpha", "theta"),
        typical_channels=("O1", "O2", "Pz"),
        onset_hours="Days (steady state)",
        washout_days="3–7",
        clinical_note="Used for bipolar disorder and seizures. Posterior alpha peak frequency reduction is a reliable chronic marker.",
    ),
    MedicationProfile(
        name="Antiepileptics — GABAergic (e.g., valproate, gabapentin)",
        drug_class="GABA enhancer / broad-spectrum antiepileptic",
        eeg_effects=(
            "Diffuse beta increase",
            "Mild slowing",
            "Reduced epileptiform discharges",
        ),
        affected_bands=("beta", "alpha"),
        typical_channels=(),
        onset_hours="Days (valproate); hours (gabapentin)",
        washout_days="3–7",
        clinical_note="Valproate produces prominent diffuse beta that can be mistaken for benzodiazepine effect.",
    ),
    MedicationProfile(
        name="Gabapentin",
        drug_class="GABA analogue / anticonvulsant",
        eeg_effects=(
            "EEG slowing with prolonged use",
            "Significant reduction of posterior alpha rhythm peak frequency",
            "Mild beta increase at therapeutic doses",
        ),
        affected_bands=("alpha", "theta", "beta"),
        typical_channels=("O1", "O2", "Pz"),
        onset_hours="Hours",
        washout_days="2–5",
        clinical_note="Less alpha peak reduction than carbamazepine. Cognitive slowing may accompany EEG changes.",
    ),
    MedicationProfile(
        name="Lamotrigine",
        drug_class="Sodium channel blocker + glutamate release inhibitor",
        eeg_effects=(
            "Minimal EEG changes at therapeutic doses",
            "Occasional mild beta increase",
            "Reduction in epileptiform activity",
        ),
        affected_bands=("beta",),
        typical_channels=(),
        onset_hours="Weeks (titration)",
        washout_days="7–14",
        clinical_note="One of the cleaner antiepileptics from an EEG perspective. Minimal confounding at standard doses.",
    ),
    MedicationProfile(
        name="Levetiracetam",
        drug_class="SV2A modulator / broad-spectrum antiepileptic",
        eeg_effects=(
            "Minimal background changes",
            "Reduction in epileptiform discharges",
            "Occasional mild slowing",
        ),
        affected_bands=(),
        typical_channels=(),
        onset_hours="Hours",
        washout_days="2–3",
        clinical_note="Generally EEG-neutral at therapeutic doses. Preferred when a clean EEG background is needed for interpretation.",
    ),
    # ── Mood stabilizers ──────────────────────────────────────────────────
    MedicationProfile(
        name="Lithium",
        drug_class="Mood stabilizer",
        eeg_effects=(
            "Increased theta amplitude",
            "Mild decrease in alpha frequency/amplitude",
            "Increases in faster activity (beta/gamma)",
            "Potentiation of epileptiform activity",
            "Generalized slowing at toxic levels",
        ),
        affected_bands=("theta", "alpha", "beta"),
        typical_channels=(),
        onset_hours="Days to weeks",
        washout_days="7–14",
        clinical_note=(
            "Mimics TCA profile but with more beta/gamma activation. "
            "Overhead decreases alpha. Toxic lithium levels can produce a marked encephalopathic pattern with diffuse slowing. "
            "Always correlate with serum levels."
        ),
    ),
    # ── Antipsychotics ────────────────────────────────────────────────────
    MedicationProfile(
        name="Antipsychotics — Typical (e.g., haloperidol)",
        drug_class="Dopamine D2 antagonist",
        eeg_effects=(
            "Diffuse theta-delta slowing",
            "Reduced alpha",
            "Increased delta in some patients",
            "Increased beta above 20 Hz (sedative effect)",
        ),
        affected_bands=("theta", "alpha", "delta", "beta"),
        typical_channels=(),
        onset_hours="Hours",
        washout_days="2–7",
        clinical_note="Slowing is dose-dependent. High doses or IV administration can produce marked generalized slowing.",
    ),
    MedicationProfile(
        name="Antipsychotics — Atypical (e.g., quetiapine, olanzapine, risperidone)",
        drug_class="Multi-receptor antagonist (5-HT2A, D2, H1, etc.)",
        eeg_effects=(
            "Diffuse theta-delta slowing",
            "Alpha attenuation",
            "Increased sleepiness-related theta",
            "Increased beta above 20 Hz (non-sedating agents may show more beta)",
        ),
        affected_bands=("theta", "delta", "alpha", "beta"),
        typical_channels=(),
        onset_hours="Hours",
        washout_days="2–7",
        clinical_note=(
            "Sedating atypicals (quetiapine, olanzapine) produce more slowing than non-sedating ones (aripiprazole). "
            "Both sedative and non-sedative neuroleptics decrease alpha; sedative types also increase delta/theta and beta >20 Hz."
        ),
    ),
    # ── Opioids ───────────────────────────────────────────────────────────
    MedicationProfile(
        name="Opioids (e.g., morphine, fentanyl)",
        drug_class="Mu-opioid receptor agonist",
        eeg_effects=(
            "Diffuse theta-delta slowing",
            "Reduced beta",
            "Alpha attenuation",
            "High-amplitude alpha ~8 Hz (morphine-specific, transient)",
        ),
        affected_bands=("theta", "delta", "beta", "alpha"),
        typical_channels=(),
        onset_hours="Minutes to hours",
        washout_days="1–3",
        clinical_note=(
            "Dose-dependent slowing. Fentanyl bursts can produce brief rhythmic delta activity that resembles seizures but lacks evolution. "
            "Morphine may transiently produce high-amplitude alpha before progression to slowing or isoelectric pattern."
        ),
    ),
    MedicationProfile(
        name="Heroin",
        drug_class="Mu-opioid receptor agonist / illicit opioid",
        eeg_effects=(
            "Reduction of alpha rhythm",
            "Increase in beta activity",
            "Low-amplitude delta and theta in central regions",
        ),
        affected_bands=("alpha", "beta", "delta", "theta"),
        typical_channels=("Cz", "C3", "C4"),
        onset_hours="Minutes",
        washout_days="3–7",
        clinical_note=(
            "Abstinent heroin addicts may show enhanced fast beta. "
            "REM sleep is increased during active use. Central-region delta/theta is a characteristic acute signature."
        ),
    ),
    # ── Anesthetics / Sedatives ───────────────────────────────────────────
    MedicationProfile(
        name="Propofol",
        drug_class="GABA-A agonist / IV anesthetic",
        eeg_effects=(
            "Initial beta increase",
            "Progressive slowing with dose",
            "Burst suppression at high doses",
        ),
        affected_bands=("beta", "alpha", "theta", "delta"),
        typical_channels=(),
        onset_hours="Minutes",
        washout_days="Hours",
        clinical_note="Very fast onset/offset. EEG changes track dose in real time. Burst suppression is intentionally targeted for refractory status epilepticus.",
    ),
    MedicationProfile(
        name="Ketamine",
        drug_class="NMDA receptor antagonist / dissociative anesthetic",
        eeg_effects=(
            "Theta-gamma coupling increase",
            "Frontal delta-theta rhythm",
            "Preserved or increased gamma",
        ),
        affected_bands=("theta", "gamma", "delta"),
        typical_channels=("Fp1", "Fp2", "Fz", "F3", "F4"),
        onset_hours="Minutes",
        washout_days="Hours to 1 day",
        clinical_note="Produces a unique EEG signature distinct from GABAergic agents. Frontal rhythmic slow activity is characteristic.",
    ),
    MedicationProfile(
        name="Dexmedetomidine",
        drug_class="Alpha-2 agonist / sedative",
        eeg_effects=(
            "Spindle-like activity",
            "Preserved background architecture",
            "Less suppression than propofol",
        ),
        affected_bands=("alpha", "sigma"),
        typical_channels=(),
        onset_hours="Minutes",
        washout_days="Hours",
        clinical_note="Produces natural sleep-like EEG patterns with spindles. Neurophysiologically distinct from GABAergic sedation.",
    ),
    # ── Sleep / Circadian ─────────────────────────────────────────────────
    MedicationProfile(
        name="Melatonin",
        drug_class="Hormone / sleep regulator",
        eeg_effects=(
            "Mild theta increase",
            "Earlier sleep-onset patterns",
            "Minimal waking EEG changes",
        ),
        affected_bands=("theta",),
        typical_channels=(),
        onset_hours="0.5–1",
        washout_days="Hours",
        clinical_note="Minimal confounding for waking qEEG. May shift circadian phase and thus affect recording time norms.",
    ),
    # ── Recreational / Social drugs ───────────────────────────────────────
    MedicationProfile(
        name="Caffeine",
        drug_class="Adenosine receptor antagonist / stimulant",
        eeg_effects=(
            "Decreased theta",
            "Increased beta",
            "Faster alpha frequency",
            "Reduced sleepiness markers",
        ),
        affected_bands=("theta", "beta", "alpha"),
        typical_channels=(),
        onset_hours="0.25–0.5",
        washout_days="Hours",
        clinical_note="Acute caffeine reduces theta/beta ratio. Withdrawal (>12–24h) can transiently increase theta and slow alpha.",
    ),
    MedicationProfile(
        name="Nicotine",
        drug_class="Nicotinic acetylcholine receptor agonist / stimulant",
        eeg_effects=(
            "Increased beta activity",
            "Decreased alpha amplitude",
            "Decreased theta amplitude",
        ),
        affected_bands=("beta", "alpha", "theta"),
        typical_channels=(),
        onset_hours="Minutes",
        washout_days="Hours",
        clinical_note="Similar EEG profile to caffeine. Withdrawal increases frontal alpha and theta. Smoking cessation may transiently shift theta/beta ratio.",
    ),
    MedicationProfile(
        name="Cannabis / THC / Marijuana",
        drug_class="Cannabinoid CB1 agonist / psychoactive",
        eeg_effects=(
            "Increased frontal alpha",
            "Decreased delta over frontal regions",
            "Decreased beta over frontal regions (acute)",
            "Chronic use: increased frontal interhemispheric hypercoherence and phase synchrony",
        ),
        affected_bands=("alpha", "delta", "beta"),
        typical_channels=("Fp1", "Fp2", "F3", "F4", "Fz"),
        onset_hours="0.25–1",
        washout_days="3–30 (chronic use may prolong washout)",
        clinical_note=(
            "Frontal alpha increase is the most consistent acute finding. "
            "Chronic users show frontal hypercoherence that may persist weeks after cessation. "
            "Baseline-dependent: anxious individuals may show minimal alpha change."
        ),
    ),
    MedicationProfile(
        name="LSD",
        drug_class="Serotonin 5-HT2A agonist / psychedelic",
        eeg_effects=(
            "Normal baseline → decreased alpha, increased beta",
            "Slow baseline (more theta/low alpha) → increased alpha and fast beta",
            "Low-voltage fast EEG → little change",
        ),
        affected_bands=("alpha", "beta", "theta"),
        typical_channels=(),
        onset_hours="0.5–1",
        washout_days="2–5",
        clinical_note="Effect is highly dependent on pre-drug baseline. No single signature; interpret relative to the individual's resting EEG.",
    ),
    MedicationProfile(
        name="PCP (Phencyclidine)",
        drug_class="NMDA receptor antagonist / dissociative",
        eeg_effects=(
            "Increased slow activity (delta/theta)",
            "Paroxysmal epileptiform-like activity",
            "Extreme voltages with increased dosage",
            "Convulsions possible at high doses",
        ),
        affected_bands=("delta", "theta", "beta"),
        typical_channels=(),
        onset_hours="Minutes",
        washout_days="3–7",
        clinical_note="One of the most EEG-disruptive recreational substances. Paroxysmal activity can mimic seizure disorders. Emergency monitoring warranted.",
    ),
    # ── Alcohol ───────────────────────────────────────────────────────────
    MedicationProfile(
        name="Alcohol — Acute intoxication",
        drug_class="GABA-A positive modulator / NMDA antagonist",
        eeg_effects=(
            "Increase in theta and low-frequency alpha",
            "Decreased beta above 20 Hz",
            "Mild alpha attenuation",
        ),
        affected_bands=("theta", "alpha", "beta"),
        typical_channels=(),
        onset_hours="0.25–1",
        washout_days="Hours",
        clinical_note=(
            "Immediately after drinking: theta and low-alpha increase with beta suppression above 20 Hz. "
            "Acute intoxication resembles benzodiazepine effect in some respects but with more theta. "
            "Chronic use or withdrawal produces marked slowing and irritability."
        ),
    ),
    MedicationProfile(
        name="Alcohol — Chronic alcoholism",
        drug_class="GABA/glutamate chronic dysregulation",
        eeg_effects=(
            "Increased beta activity",
            "Decreased high theta and alpha",
            "Lower synchronization in alcohol-dependent individuals",
            "PLEDS in severe chronic alcoholism",
        ),
        affected_bands=("beta", "theta", "alpha"),
        typical_channels=(),
        onset_hours="Chronic",
        washout_days="Weeks to months",
        clinical_note=(
            "Chronic alcoholism produces a dysregulated background with beta elevation and alpha/theta attenuation. "
            "Periodic lateralized epileptiform discharges (PLEDS) may appear in severe cases. "
            "Long-term abstinence may partially reverse these changes."
        ),
    ),
    MedicationProfile(
        name="Alcohol — Withdrawal",
        drug_class="GABA/glutamate rebound",
        eeg_effects=(
            "Diffuse theta-delta slowing",
            "Increased beta",
            "Focal or generalized epileptiform activity",
            "Triphasic waves in severe cases",
        ),
        affected_bands=("theta", "delta", "beta"),
        typical_channels=(),
        onset_hours="6–48",
        washout_days="Days to weeks",
        clinical_note=(
            "Withdrawal is one of the most EEG-toxic states. Marked slowing, triphasics, and seizure risk are common. "
            "Sudden withdrawal after long-term use may produce generalized spike-and-wave or temporal/frontal epileptiform activity."
        ),
    ),
    # ── Antihistamines ────────────────────────────────────────────────────
    MedicationProfile(
        name="Antihistamines (sedating and non-sedating)",
        drug_class="Histamine H1 receptor antagonist",
        eeg_effects=(
            "Increased theta amplitude",
            "Increased theta/beta ratio",
        ),
        affected_bands=("theta", "beta"),
        typical_channels=(),
        onset_hours="0.5–1",
        washout_days="1–3",
        clinical_note="Both sedating and non-sedating antihistamines increase theta and the theta/beta ratio. May confound ADHD qEEG markers.",
    ),
    # ── Antibiotics / Solvents ────────────────────────────────────────────
    MedicationProfile(
        name="Antibiotics (chronic use)",
        drug_class="Antimicrobial",
        eeg_effects=(
            "Increased theta amplitude after prolonged use",
        ),
        affected_bands=("theta",),
        typical_channels=(),
        onset_hours="Days to weeks",
        washout_days="1–7 (agent-dependent)",
        clinical_note="Theta elevation develops gradually with prolonged antibiotic courses. Correlation with duration of therapy is important.",
    ),
    MedicationProfile(
        name="Solvents / Inhalants",
        drug_class="Volatile hydrocarbon / CNS depressant",
        eeg_effects=(
            "Diffuse EEG slowing",
            "Increased delta and theta",
        ),
        affected_bands=("delta", "theta"),
        typical_channels=(),
        onset_hours="Minutes",
        washout_days="Hours to days",
        clinical_note="Etiology of slowing is uncertain but consistent. Chronic solvent abuse can produce persistent encephalopathic patterns.",
    ),
    # ── Withdrawal (general concept) ──────────────────────────────────────
    MedicationProfile(
        name="Medication withdrawal — general",
        drug_class="Neuroadaptation rebound",
        eeg_effects=(
            "Generalized epileptiform activity (spikes, spike-and-wave)",
            "Temporal or frontal focal spikes",
            "Diffuse slowing",
            "Paroxysmal activity",
        ),
        affected_bands=("delta", "theta", "beta"),
        typical_channels=(),
        onset_hours="Varies (hours to days)",
        washout_days="Days to weeks",
        clinical_note=(
            "Sudden withdrawal after long-term medication use can produce marked EEG abnormalities. "
            "Generalized epileptiform activity is common. Tapering is recommended to avoid withdrawal-related EEG changes."
        ),
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
    "clonazepam": "Benzodiazepines (e.g., lorazepam, diazepam, clonazepam)",
    "valium": "Benzodiazepines (e.g., lorazepam, diazepam, clonazepam)",
    "ativan": "Benzodiazepines (e.g., lorazepam, diazepam, clonazepam)",
    # Barbiturates
    "phenobarbital": "Barbiturates (e.g., phenobarbital)",
    # Anxiolytics
    "meprobamate": "Meprobamate",
    # SSRIs
    "sertraline": "SSRIs (e.g., sertraline, fluoxetine, escitalopram)",
    "fluoxetine": "SSRIs (e.g., sertraline, fluoxetine, escitalopram)",
    "escitalopram": "SSRIs (e.g., sertraline, fluoxetine, escitalopram)",
    "paroxetine": "SSRIs (e.g., sertraline, fluoxetine, escitalopram)",
    "citalopram": "SSRIs (e.g., sertraline, fluoxetine, escitalopram)",
    "prozac": "SSRIs (e.g., sertraline, fluoxetine, escitalopram)",
    "zoloft": "SSRIs (e.g., sertraline, fluoxetine, escitalopram)",
    "paxil": "SSRIs (e.g., sertraline, fluoxetine, escitalopram)",
    # TCAs
    "amitriptyline": "Tricyclic antidepressants (e.g., amitriptyline, nortriptyline)",
    "nortriptyline": "Tricyclic antidepressants (e.g., amitriptyline, nortriptyline)",
    # MAOIs
    "phenelzine": "MAOIs (e.g., phenelzine, tranylcypromine)",
    "tranylcypromine": "MAOIs (e.g., phenelzine, tranylcypromine)",
    # SNRIs
    "venlafaxine": "SNRIs (e.g., venlafaxine, duloxetine)",
    "duloxetine": "SNRIs (e.g., venlafaxine, duloxetine)",
    # Stimulants
    "methylphenidate": "Stimulants (e.g., methylphenidate, amphetamine)",
    "amphetamine": "Stimulants (e.g., methylphenidate, amphetamine)",
    "lisdexamfetamine": "Stimulants (e.g., methylphenidate, amphetamine)",
    "ritalin": "Methylphenidate / Ritalin / Concerta",
    "concerta": "Methylphenidate / Ritalin / Concerta",
    "cocaine": "Cocaine",
    # Antiepileptics
    "carbamazepine": "Carbamazepine",
    "phenytoin": "Antiepileptics — Sodium channel blockers (e.g., carbamazepine, phenytoin)",
    "valproate": "Antiepileptics — GABAergic (e.g., valproate, gabapentin)",
    "valproic acid": "Antiepileptics — GABAergic (e.g., valproate, gabapentin)",
    "gabapentin": "Gabapentin",
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
    "neuroleptic": "Antipsychotics — Typical (e.g., haloperidol)",
    # Opioids
    "morphine": "Opioids (e.g., morphine, fentanyl)",
    "fentanyl": "Opioids (e.g., morphine, fentanyl)",
    "heroin": "Heroin",
    # Anesthetics
    "propofol": "Propofol",
    "ketamine": "Ketamine",
    "dexmedetomidine": "Dexmedetomidine",
    # Others
    "melatonin": "Melatonin",
    "caffeine": "Caffeine",
    "nicotine": "Nicotine",
    "alcohol": "Alcohol — Acute intoxication",
    "cannabis": "Cannabis / THC / Marijuana",
    "marijuana": "Cannabis / THC / Marijuana",
    "thc": "Cannabis / THC / Marijuana",
    "hashish": "Cannabis / THC / Marijuana",
    "lsd": "LSD",
    "pcp": "PCP (Phencyclidine)",
    "phencyclidine": "PCP (Phencyclidine)",
    "antihistamine": "Antihistamines (sedating and non-sedating)",
    "antihistamines": "Antihistamines (sedating and non-sedating)",
    "antibiotic": "Antibiotics (chronic use)",
    "antibiotics": "Antibiotics (chronic use)",
    "solvent": "Solvents / Inhalants",
    "solvents": "Solvents / Inhalants",
    "inhalant": "Solvents / Inhalants",
    "inhalants": "Solvents / Inhalants",
    "withdrawal": "Medication withdrawal — general",
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
