"""Expanded EEG domain encyclopedia for copilot tool calls and narrative context.

Extends the hard-coded ``_FEATURE_ENCYCLOPEDIA`` in ``ai/copilot.py`` with
concepts that are not quantitative biomarkers per se but are essential for
clinical EEG reasoning: frequency bands, normal variants, montage effects,
artifact signatures, and developmental norms.

All entries follow the same dict schema so they can be consumed by the
copilot's ``tool_explain_feature`` without branching logic.
"""
from __future__ import annotations

from typing import Any


DOMAIN_ENCYCLOPEDIA: dict[str, dict[str, str]] = {
    # ── Frequency bands ─────────────────────────────────────────────────────
    "delta_band": {
        "name": "Delta activity (0–4 Hz)",
        "definition": (
            "The slowest frequency band visible on scalp EEG. Delta reflects "
            "high-amplitude synchronized neuronal activity."
        ),
        "clinical_relevance": (
            "In awake adults, delta is abnormal and indicates focal structural "
            "lesion (tumor, bleed, infarct) or diffuse encephalopathy. In sleep, "
            "diffuse delta is normal (slow wave sleep). In neonates and infants, "
            "delta is the dominant awake frequency."
        ),
        "normal_range": "0–4 Hz; should be absent in awake adults; dominant in Stage III–IV sleep",
    },
    "theta_band": {
        "name": "Theta activity (4–8 Hz)",
        "definition": (
            "Intermediate frequency band between delta and alpha. Theta is "
            "prominent in children and in drowsy adults."
        ),
        "clinical_relevance": (
            "Excess frontal theta in awake adults is associated with ADHD, TBI, "
            "depression, sleep deprivation, and medication effects. Temporal theta "
            "bursts of drowsiness (RMTD) are a normal variant. TIRDA (temporal "
            "intermittent rhythmic delta activity) is epileptogenic."
        ),
        "normal_range": "4–8 Hz; normal in drowsiness and childhood; abnormal if predominant in awake adult",
    },
    "alpha_band": {
        "name": "Alpha activity (8–13 Hz)",
        "definition": (
            "The hallmark frequency of the normal awake adult brain. The posterior "
            "dominant rhythm (PDR) is the classic alpha rhythm over occipital regions."
        ),
        "clinical_relevance": (
            "PDR slowing below 8.5 Hz in adults suggests mild generalized slowing. "
            "Asymmetry >1 Hz or >50% amplitude is abnormal. Alpha attenuates with "
            "eye opening and mental effort. Excess diffuse alpha can occur with "
            "some medications or during relaxation."
        ),
        "normal_range": "8.5–12 Hz (adult PDR, eyes-closed); 4–5 Hz by 6 months, 10 Hz by 10 years",
    },
    "beta_band": {
        "name": "Beta activity (13–30 Hz)",
        "definition": (
            "Fast low-amplitude activity. Frontal beta is common during active "
            "mental processing. Muscle (myogenic) artifact is faster than beta."
        ),
        "clinical_relevance": (
            "Diffuse excess beta is most commonly a benzodiazepine or barbiturate "
            "effect. Frontal beta is normal with alertness. Beta asymmetry may "
            "suggest focal cortical dysfunction."
        ),
        "normal_range": "13–30 Hz; low amplitude (<20 µV) frontocentrally in alert adults",
    },
    "posterior_dominant_rhythm": {
        "name": "Posterior Dominant Rhythm (PDR)",
        "definition": (
            "The resting alpha-frequency rhythm of the occipital cortex, best seen "
            "with eyes closed and the patient relaxed."
        ),
        "clinical_relevance": (
            "The PDR is the first thing to assess when reading an EEG. Its frequency, "
            "symmetry, and reactivity (attenuation with eye opening) reflect overall "
            "cortical health. Absent or slowed PDR indicates encephalopathy or "
            "degenerative change."
        ),
        "normal_range": "8.5–12 Hz symmetric; emerges with eye closure, recedes with eye opening",
    },
    # ── Normal variants ─────────────────────────────────────────────────────
    "mu_rhythm": {
        "name": "Mu rhythm",
        "definition": (
            "Arch-like alpha-frequency (7–11 Hz) activity over the sensorimotor "
            "cortex (C3/C4/Cz). The 'idling' rhythm of the motor cortex."
        ),
        "clinical_relevance": (
            "Mu is a normal variant and recedes with thoughts of movement or actual "
            "movement. It can be mistaken for epileptiform activity, especially when "
            "sharply contoured or high amplitude (e.g., over breach rhythm)."
        ),
        "normal_range": "7–11 Hz; attenuates with motor imagery or movement",
    },
    "wicket_waves": {
        "name": "Wicket waves",
        "definition": (
            "Sharply contoured arch-like alpha waves in the temporal chains, "
            "resembling cricket wickets."
        ),
        "clinical_relevance": (
            "A normal variant that can be mistaken for temporal spikes. Unlike "
            "epileptiform discharges, wickets have no aftergoing slow wave and do "
            "not disturb the background."
        ),
        "normal_range": "7–11 Hz; temporal regions; drowsy states; symmetric or unilateral",
    },
    "rmtd": {
        "name": "Rhythmic mid-temporal theta of drowsiness (RMTD)",
        "definition": (
            "Brief (~1 second) bursts of sharply contoured rhythmic theta in the "
            "mid-temporal regions during drowsiness."
        ),
        "clinical_relevance": (
            "A benign normal variant. Does not evolve and should not be confused "
            "with temporal seizures or BIRDs."
        ),
        "normal_range": "4–7 Hz; <10 seconds duration; temporal; drowsiness only",
    },
    "lambda_waves": {
        "name": "Lambda waves",
        "definition": (
            "Bilateral symmetric positive occipital sharp transients occurring "
            "during visual scanning (e.g., reading)."
        ),
        "clinical_relevance": (
            "Normal variant identical in morphology to POSTS but occurring in the "
            "awake state. Distinguish from occipital epileptiform discharges by "
            "positivity, wakefulness, and lack of aftergoing slow wave."
        ),
        "normal_range": "Positive occipital; awake with visual scanning",
    },
    "bets": {
        "name": "Benign epileptiform transients of sleep (BETS / SSS)",
        "definition": (
            "Very small (<50 µV), short-duration sharp transients seen in sleep, "
            "most often in temporal chains."
        ),
        "clinical_relevance": (
            "Can be difficult to distinguish from true epileptiform spikes. Rule of "
            "thumb: if very low amplitude, seen only once or twice, and only during "
            "sleep, they are likely benign."
        ),
        "normal_range": "<50 µV; sleep only; temporal predominance",
    },
    # ── Montage & technical ─────────────────────────────────────────────────
    "end_of_chain_effect": {
        "name": "End-of-chain effect (bipolar montages)",
        "definition": (
            "In bipolar montages, the first and last electrodes in each chain lack "
            "a comparison electrode on one side, so only half of a phase reversal is visible."
        ),
        "clinical_relevance": (
            "Fp1/Fp2 and O1/O2 are the most affected. A discharge maximal at Fp2 may "
            "not show a phase reversal on double banana. Similarly, occipital discharges "
            "may be missed. Use circumferential or referential montages to clarify."
        ),
        "normal_range": "N/A — technical montage property",
    },
    "phase_reversal": {
        "name": "Phase reversal",
        "definition": (
            "In bipolar montages, the point where surrounding leads 'point toward' "
            "(negative reversal) or 'point away from' (positive reversal) each other. "
            "The middle electrode of the reversal has the maximal voltage."
        ),
        "clinical_relevance": (
            "Negative phase reversals are typical of epileptiform activity. Positive "
            "phase reversals are more typical of artifacts. The end-of-chain effect "
            "limits phase reversals at Fp1/Fp2 and O1/O2."
        ),
        "normal_range": "N/A — interpretive technique",
    },
    # ── Artifact concepts ───────────────────────────────────────────────────
    "bell_phenomenon": {
        "name": "Bell's Phenomenon",
        "definition": (
            "Upon eye closure or blinking, the eyes roll upward. Because the cornea "
            "is positively charged and the retina negatively charged, this produces a "
            "positive deflection at frontal electrodes (Fp1/Fp2)."
        ),
        "clinical_relevance": (
            "Explains eye-blink artifact and the PDR emergence/recession pattern. "
            "Distinguishes eye blinks from frontal spike-and-wave discharges."
        ),
        "normal_range": "N/A — physiologic mechanism",
    },
    "anterior_posterior_gradient": {
        "name": "Anterior–posterior (AP) gradient",
        "definition": (
            "The normal spatial organization of the awake EEG: faster, lower-amplitude "
            "frequencies anteriorly; slower, higher-amplitude frequencies posteriorly."
        ),
        "clinical_relevance": (
            "Loss of the AP gradient is an early sign of mild generalized slowing / "
            "encephalopathy. It is assessed before reading specific waveforms."
        ),
        "normal_range": "Intact in all awake adults and children >3 years",
    },
    # ── Psychopharmacology & neurophysiology ────────────────────────────────
    "withdrawal": {
        "name": "Withdrawal EEG effects",
        "definition": (
            "Abrupt cessation of chronic psychotropic or substance use can produce "
            "rebound EEG changes reflecting neuroadaptation reversal."
        ),
        "clinical_relevance": (
            "Benzodiazepine or alcohol withdrawal produces low-voltage fast activity, "
            "theta excess, and eventually seizures. SSRI discontinuation may transiently "
            "increase beta. Opioid withdrawal shows diffuse beta and REM sleep disruption."
        ),
        "normal_range": "N/A — depends on substance and duration of use",
    },
    "medication_confound": {
        "name": "Medication confound",
        "definition": (
            "Systematic alteration of EEG spectral or temporal features by "
            "prescribed or over-the-counter psychotropic drugs."
        ),
        "clinical_relevance": (
            "Without medication history, drug-induced beta elevation may be misread "
            "as anxiety, or drug-induced alpha slowing as encephalopathy. The copilot "
            "flags affected bands when medication lists are provided."
        ),
        "normal_range": "N/A — interpretive confound rather than biomarker",
    },
    "benzodiazepine_effect": {
        "name": "Benzodiazepine EEG effect",
        "definition": (
            "Diffuse increase in beta (15–30 Hz) activity with a concurrent reduction "
            "in alpha amplitude and frequency, mediated by GABA-A receptor potentiation."
        ),
        "clinical_relevance": (
            "Lorazepam, diazepam, clonazepam, and alprazolam all produce this signature. "
            "It can mask underlying focal slowing and may be mistaken for hyperarousal. "
            "Chronic use leads to tolerance and withdrawal rebound."
        ),
        "normal_range": "N/A — pharmacologic effect",
    },
    "stimulant_effect": {
        "name": "Stimulant EEG effect",
        "definition": (
            "Decrease in theta and increase in beta activity following administration "
            "of psychostimulants such as methylphenidate or amphetamines."
        ),
        "clinical_relevance": (
            "Stimulants lower the theta/beta ratio (TBR), a commonly used ADHD marker. "
            "Acute caffeine produces a similar but milder pattern. Interpretation of "
            "TBR during stimulant treatment should account for medication timing."
        ),
        "normal_range": "N/A — pharmacologic effect",
    },
    "cannabis_effect": {
        "name": "Cannabis EEG effect",
        "definition": (
            "Acute THC increases frontal alpha amplitude and power; chronic use is "
            "associated with increased inter-hemispheric coherence (hypercoherence)."
        ),
        "clinical_relevance": (
            "Frontal alpha increase can be misinterpreted as relaxed wakefulness or "
            "meditative state. Chronic hypercoherence may obscure true focal pathology. "
            "CBD has less consistent EEG effects and may mildly increase beta."
        ),
        "normal_range": "N/A — substance effect",
    },
    "alcohol_chronic": {
        "name": "Chronic alcohol EEG effect",
        "definition": (
            "Long-term alcohol misuse produces beta elevation, alpha and theta "
            "attenuation, and increased epileptiform susceptibility including PLEDS."
        ),
        "clinical_relevance": (
            "Wernicke–Korsakoff syndrome shows diffuse theta-delta slowing. Alcohol "
            "withdrawal can precipitate seizures and triphasic waves. Chronic drinkers "
            "may have a persistently fast low-voltage background."
        ),
        "normal_range": "N/A — toxic/metabolic effect",
    },
    "theta_beta_ratio": {
        "name": "Theta/Beta Ratio (TBR)",
        "definition": (
            "The ratio of theta (4–8 Hz) to beta (13–21 Hz) power, most commonly "
            "measured at frontal or midline electrodes."
        ),
        "clinical_relevance": (
            "Elevated TBR is a well-replicated group-level marker of ADHD in children, "
            "though diagnostic utility at the individual level remains debated. TBR is "
            "lowered by stimulants and raised by antihistamines, sedatives, and sleep loss."
        ),
        "normal_range": "Highly labile; >1.5 in frontal leads is often used as ADHD cutoff in children",
    },
    "peak_alpha_frequency": {
        "name": "Peak Alpha Frequency (PAF)",
        "definition": (
            "The frequency within the alpha band (typically 7–13 Hz) at which power "
            "is maximal, often measured at O1/O2/Pz with eyes closed."
        ),
        "clinical_relevance": (
            "PAF declines with age and cognitive load. Carbamazepine and gabapentin "
            "can slow PAF by 0.5–1.5 Hz. A PAF <8 Hz in adults suggests mild generalized "
            "slowing or medication effect."
        ),
        "normal_range": "8.5–11 Hz in healthy adults; ~0.5 Hz/decade decline after age 60",
    },
    "sleep_spindles": {
        "name": "Sleep spindles",
        "definition": (
            "Brief bursts of 12–14 Hz (sigma band) activity generated in the thalamic "
            "reticular nucleus, maximal at central electrodes during Stage II NREM sleep."
        ),
        "clinical_relevance": (
            "Spindle density and duration correlate with sleep quality and memory "
            "consolidation. Benzodiazepines and barbiturates markedly enhance spindle "
            "amplitude and frequency. Absent spindles may indicate thalamic or "
            "metabolic dysfunction."
        ),
        "normal_range": "12–14 Hz; central-maximal; Stage II NREM",
    },
    "epileptiform_activity": {
        "name": "Epileptiform activity",
        "definition": (
            "Paroxysmal waveforms including spikes (<70 ms), sharp waves (70–200 ms), "
            "and spike-and-wave complexes that indicate neuronal hyperexcitability."
        ),
        "clinical_relevance": (
            "Certain medications lower seizure threshold and potentiate epileptiform "
            "activity on EEG: lithium, tramadol, bupropion, clozapine, and PCP. "
            "Conversely, AEDs suppress these discharges. Distinguish from benign "
            "variants (BETS, wicket waves) by aftergoing slow wave and background disruption."
        ),
        "normal_range": "Absent in awake and sleep EEG; any epileptiform discharge is abnormal",
    },
    "posterior_alpha": {
        "name": "Posterior alpha (PAF/PDR)",
        "definition": (
            "Alpha activity maximal over occipital and parietal regions with eyes "
            "closed, reflecting visual cortex idling."
        ),
        "clinical_relevance": (
            "In ADHD, methylphenidate can produce a paradoxical increase in posterior "
            "alpha power via improved cortical inhibition. PAF slowing is seen in "
            "encephalopathy, dementia, and with some anticonvulsants."
        ),
        "normal_range": "8.5–12 Hz symmetric; attenuates with eye opening",
    },
    "frontal_alpha_asymmetry": {
        "name": "Frontal alpha asymmetry (FAA)",
        "definition": (
            "Difference in alpha power between left and right frontal electrodes "
            "(typically F3/F4 or F7/F8). Reduced left alpha implies relatively greater "
            "left frontal activation."
        ),
        "clinical_relevance": (
            "FAA is linked to approach/avoidance motivation and affective style. "
            "Greater right-sided alpha (left hypoactivation) is associated with "
            "depression and withdrawal behavior. FAA is state-dependent and sensitive "
            "to eye-movement and muscle artifact."
        ),
        "normal_range": "Near-zero asymmetry at rest; >0.5 log-ratio may be clinically notable",
    },
}


def explain_domain_concept(concept_slug: str) -> dict[str, str] | None:
    """Return the encyclopedia entry for *concept_slug*, or None if unknown.

    Intended for use as a copilot tool (parallel interface to
    ``tool_explain_feature`` in ``ai/copilot.py``).
    """
    return DOMAIN_ENCYCLOPEDIA.get(concept_slug)
