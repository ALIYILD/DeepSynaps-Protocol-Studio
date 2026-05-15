"""Clinical condition EEG signatures and neurofeedback protocol knowledge.

Sourced from QEEG course materials (Halter & Brand; Ingram) covering
ADHD, Autism Spectrum Disorder, Anxiety, Eating Disorders, and OCD.

This module provides deterministic, PHI-free advisory context for:
- qEEG pattern recognition (what EEG changes are associated with what conditions)
- Protocol suggestion scaffolding (electrode placements, frequencies, targets)
- Copilot explanations (condition overview + EEG findings + research-backed protocols)

IMPORTANT: All content is educational/research context. No finding is diagnostic.
Protocol suggestions are starting points for clinician judgment, not prescriptions.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable


@dataclass(frozen=True)
class EEGSignature:
    """A specific EEG biomarker pattern associated with a clinical condition."""

    description: str
    typical_locations: tuple[str, ...]
    frequency_band: str
    direction: str  # "excess", "reduced", "elevated_ratio", "hypercoherence", etc.
    magnitude: str  # "mild", "moderate", "severe", "variable"
    research_citation: str
    clinical_note: str


@dataclass(frozen=True)
class ProtocolSuggestion:
    """A neurofeedback protocol suggestion from the research literature."""

    name: str
    electrode_placement: str
    reward_band_hz: str
    inhibit_band_hz: str
    session_count: str
    session_duration_min: str
    expected_outcomes: tuple[str, ...]
    research_citation: str
    note: str


@dataclass(frozen=True)
class ClinicalCondition:
    """A clinical condition with its EEG signatures and protocol suggestions."""

    name: str
    aliases: tuple[str, ...]
    category: str  # "developmental", "anxiety", "mood", "eating", "obsessive_compulsive"
    dsm_criteria_summary: str
    eeg_signatures: tuple[EEGSignature, ...]
    protocol_suggestions: tuple[ProtocolSuggestion, ...]
    key_references: tuple[str, ...]
    copilot_summary: str


# ── Condition catalog ───────────────────────────────────────────────────────

_CONDITIONS: tuple[ClinicalCondition, ...] = (
    ClinicalCondition(
        name="ADHD",
        aliases=("attention_deficit_hyperactivity_disorder", "add"),
        category="developmental",
        dsm_criteria_summary=(
            "Characterized by inattention, hyperactivity, and impulsivity. "
            "Symptoms of hyperactivation are joined with increased gamma activity."
        ),
        eeg_signatures=(
            EEGSignature(
                description="Increased theta/beta ratio over frontocentral regions",
                typical_locations=("Fz", "Cz", "F3", "F4", "C3", "C4"),
                frequency_band="theta / beta",
                direction="elevated_ratio",
                magnitude="moderate",
                research_citation="Sherlin et al., 2010; Bazanova et al., 2018",
                clinical_note=(
                    "Theta/beta ratio > 2.5 at frontocentral sites is the most replicated "
                    "EEG finding in ADHD. FDA-cleared as adjunct biomarker in 2013."
                ),
            ),
            EEGSignature(
                description="Mild increase in gamma oscillations",
                typical_locations=("Frontal", "Central"),
                frequency_band="gamma",
                direction="excess",
                magnitude="mild",
                research_citation="Herrmann & Demiralp, 2005",
                clinical_note=(
                    "Very high gamma could lower seizure threshold — monitor if comorbid "
                    "epilepsy risk exists."
                ),
            ),
            EEGSignature(
                description="Reduced SMR (sensorimotor rhythm) over sensorimotor cortex",
                typical_locations=("C3", "C4", "Cz"),
                frequency_band="SMR (12-15 Hz)",
                direction="reduced",
                magnitude="moderate",
                research_citation="Sherlin et al., 2010",
                clinical_note=(
                    "SMR enhancement training is a primary ADHD protocol. "
                    "SMR is associated with calm, focused attention."
                ),
            ),
            EEGSignature(
                description="Similar EEG profile to developmental stuttering",
                typical_locations=("Temporal", "Central"),
                frequency_band="theta / alpha",
                direction="elevated_ratio",
                magnitude="moderate",
                research_citation="Ratcliff-Baird, 2002",
                clinical_note=(
                    "Stutterers show significantly more theta in temporal and central regions "
                    "during eyes open, and higher alpha during focused attention. "
                    "ADHD protocols may benefit stuttering as adjunct."
                ),
            ),
        ),
        protocol_suggestions=(
            ProtocolSuggestion(
                name="Theta/Beta ratio training",
                electrode_placement="Highest TBR location (typically Fz/Cz or frontocentral)",
                reward_band_hz="12-18 Hz (beta)",
                inhibit_band_hz="4-8 Hz (theta)",
                session_count="30-40",
                session_duration_min="20-30",
                expected_outcomes=(
                    "Improved attention and impulse control",
                    "Reduced hyperactivity",
                    "Sustained effects > 6 months",
                ),
                research_citation="Sherlin et al., 2010; Arns et al., 2020",
                note="Individualized placement based on highest TBR location per Bazanova et al., 2018.",
            ),
            ProtocolSuggestion(
                name="SMR enhancement",
                electrode_placement="C3, C4, or Cz (sensorimotor cortex)",
                reward_band_hz="12-15 Hz (SMR)",
                inhibit_band_hz="4-8 Hz (theta) + 22-30 Hz (high beta)",
                session_count="30-40",
                session_duration_min="20-30",
                expected_outcomes=(
                    "Calm, focused attention",
                    "Reduced impulsivity",
                    "Improved sleep onset",
                ),
                research_citation="Sherlin et al., 2010",
                note="Multifactorial treatment — SMR + TBR + SCP protocols may be combined.",
            ),
            ProtocolSuggestion(
                name="SCP (slow cortical potential) neurofeedback",
                electrode_placement="Cz or frontocentral",
                reward_band_hz="Negative SCP shifts (self-regulation)",
                inhibit_band_hz="Positive SCP shifts",
                session_count="30-40",
                session_duration_min="20-30",
                expected_outcomes=(
                    "Improved self-regulation",
                    "Sustained attention",
                ),
                research_citation="Sherlin et al., 2010; Arns et al., 2020",
                note="SCP training teaches cortical excitability self-regulation.",
            ),
        ),
        key_references=(
            "Sherlin, L., Arns, M., Lubar, J., & Sokhadze, E. (2010). A position paper on Neurofeedback for ADHD. Journal of Neurotherapy, 14(2), 66-78.",
            "Arns, M., Clark, C. R., Trullinger, M., deBeus, R., Mack, M., & Aniftos, M. (2020). Neurofeedback and ADHD in Children. Applied psychophysiology and biofeedback, 45(2), 39-48.",
            "Herrmann, C. S., & Demiralp, T. (2005). Human EEG gamma oscillations in neuropsychiatric disorders. Clinical neurophysiology, 116(12), 2719-2733.",
            "Ratcliff-Baird, B. (2002). ADHD and Stuttering: Similar EEG profiles. Journal of Neurotherapy, 5(4), 5-22.",
            "Bazanova, O. M., Auer, T., & Sapina, E. A. (2018). On the Efficiency of Individualized Theta/Beta Ratio Neurofeedback. Frontiers in human neuroscience, 12, 3.",
        ),
        copilot_summary=(
            "ADHD is associated with frontocentral theta excess, elevated theta/beta ratio, "
            "and reduced SMR. Gamma may be mildly increased. Neurofeedback protocols target "
            "TBR reduction, SMR enhancement, and SCP self-regulation. Effects may persist > 6 months."
        ),
    ),
    ClinicalCondition(
        name="Autism Spectrum Disorder",
        aliases=("autism", "asd", "aspergers", "asp"),
        category="developmental",
        dsm_criteria_summary=(
            "Impairment in reciprocal social communication and interaction; "
            "restricted, repetitive patterns of behavior; language deficits; "
            "sensory sensitivity. Orbitofrontal cortex dysfunction may contribute."
        ),
        eeg_signatures=(
            EEGSignature(
                description="Excessive power at delta, theta, beta, and gamma bands",
                typical_locations=("Diffuse", "Frontal", "Temporal"),
                frequency_band="delta, theta, beta, gamma",
                direction="excess",
                magnitude="moderate",
                research_citation="Wang et al., 2013",
                clinical_note=(
                    "ASD brains show excessive slow and fast power with reduced alpha — "
                    "the opposite of healthy brain activity. 20% show epileptiform discharges at rest."
                ),
            ),
            EEGSignature(
                description="Reduced alpha power",
                typical_locations=("Diffuse", "Parietal", "Occipital"),
                frequency_band="alpha",
                direction="reduced",
                magnitude="moderate",
                research_citation="Wang et al., 2013",
                clinical_note="Reduced alpha reflects lack of thalamic-cortical rhythm maturation.",
            ),
            EEGSignature(
                description="Hypercoherence (excessive connectivity)",
                typical_locations=("Interhemispheric", "Frontal-temporal"),
                frequency_band="beta",
                direction="hypercoherence",
                magnitude="severe",
                research_citation="Coben, 2007; Duffy et al., 2013",
                clinical_note=(
                    "Hypercoherence is a hallmark of ASD — cortical areas fail to specialize. "
                    "Connectivity-guided neurofeedback targets maximal hypercoherence regions."
                ),
            ),
            EEGSignature(
                description="Reduced left anterior-to-posterior frontal-temporal coherence (Asperger's vs ASD)",
                typical_locations=("F7-T7", "F3-C3", "F4-C4"),
                frequency_band="mixed",
                direction="hypocoherence",
                magnitude="moderate",
                research_citation="Duffy et al., 2013",
                clinical_note=(
                    "ASP group shows reduced coherence compared to ASD, falling within the "
                    "higher-functioning tail of ASD distribution."
                ),
            ),
        ),
        protocol_suggestions=(
            ProtocolSuggestion(
                name="Connectivity-guided neurofeedback",
                electrode_placement="Bipolar sequential (e.g., F7-F8) at regions of maximal hypercoherence",
                reward_band_hz="7-12 Hz",
                inhibit_band_hz="1-7 Hz + 20-30 Hz",
                session_count="20",
                session_duration_min="30",
                expected_outcomes=(
                    "40% reduction in autistic symptoms (ATEC)",
                    "76% decreased hyperconnectivity",
                    "Enhanced neuropsychological function",
                ),
                research_citation="Coben, 2007; Coben & Padolsky, 2007",
                note="Assessment-guided; reward bands based on individual QEEG hypercoherence patterns.",
            ),
            ProtocolSuggestion(
                name="Theta/Beta training for executive function",
                electrode_placement="Frontal (F3-F4 bipolar) or highest TBR site",
                reward_band_hz="Beta (13-21 Hz)",
                inhibit_band_hz="Theta (4-8 Hz)",
                session_count="20-30",
                session_duration_min="30",
                expected_outcomes=(
                    "Improved executive functioning",
                    "Reduced social and communicative deficits",
                    "Reduced repetitive behavior",
                ),
                research_citation="Kouijzer et al., 2009",
                note="Reducing theta in frontal lobe may regulate anterior cingulate cortex activity.",
            ),
            ProtocolSuggestion(
                name="Vocalization support protocol",
                electrode_placement="F7 with right ear reference",
                reward_band_hz="15-18 Hz",
                inhibit_band_hz="2-7 Hz + 22-30 Hz",
                session_count="20",
                session_duration_min="30",
                expected_outcomes=(
                    "Reduced overarousal",
                    "Improved vocalization",
                ),
                research_citation="Coben & Padolsky, 2007",
                note="For patients with specific vocalization difficulties.",
            ),
            ProtocolSuggestion(
                name="Socialization support protocol",
                electrode_placement="Bipolar F3-F4",
                reward_band_hz="7-10 Hz + 14.5-17.5 Hz",
                inhibit_band_hz="2-7 Hz + 22-30 Hz",
                session_count="20",
                session_duration_min="30",
                expected_outcomes=(
                    "Improved socialization",
                    "Reduced autistic behaviors",
                ),
                research_citation="Coben & Padolsky, 2007",
                note="Discontinue if giggling or unnecessary laughter occurs.",
            ),
        ),
        key_references=(
            "Wang, J., Barstein, J., Ethridge, L. E., et al. (2013). Resting state EEG abnormalities in autism. Journal of neurodevelopmental disorders, 5(1), 24.",
            "Coben, R. (2007). Connectivity-guided neurofeedback for autistic spectrum disorder. Biofeedback, 35(4), 131-135.",
            "Coben, R., & Padolsky, I. (2007). Assessment-guided Neurofeedback for autistic spectrum disorder. Journal of Neurotherapy, 11(1), 5-23.",
            "Duffy, F. H., Shankardass, A., McAnulty, G. B., & Als, H. (2013). The relationship of Asperger's syndrome to autism: A preliminary EEG coherence study. BMC Medicine, 11(1), 175.",
            "Kouijzer, M. E., de Moor, J. M., Gerrits, B. J., Congedo, M., & van Schie, H. T. (2009). Neurofeedback improves executive functioning in children with autism spectrum disorders. Research in Autism Spectrum Disorders, 3(1), 145-162.",
        ),
        copilot_summary=(
            "ASD is marked by excessive delta/theta/beta/gamma, reduced alpha, and hypercoherence. "
            "20% show epileptiform discharges at rest. Connectivity-guided neurofeedback targeting "
            "maximal hypercoherence regions has shown 40% symptom reduction. Theta/beta training "
            "improves executive function and social skills."
        ),
    ),
    ClinicalCondition(
        name="Anxiety",
        aliases=("generalized_anxiety", "panic_disorder", "test_anxiety", "ptsd"),
        category="anxiety",
        dsm_criteria_summary=(
            "Difficulty controlling worry, restlessness, fatigue, irritability, "
            "muscle tension, disturbed sleep. Clinically significant distress in "
            "social, occupational, or other important areas."
        ),
        eeg_signatures=(
            EEGSignature(
                description="Elevated beta2 (19-23 Hz) in central, frontal, and parietal regions",
                typical_locations=("Cz", "Fz", "Pz", "F3", "F4", "C3", "C4"),
                frequency_band="beta2 (19-23 Hz)",
                direction="excess",
                magnitude="moderate",
                research_citation="Thompson & Thompson, 2015; Moradi et al., 2011",
                clinical_note=(
                    "Beta2 may correlate with emotional intensity. High amplitude (>15 µV) "
                    "in central/frontal/parietal regions is a consistent anxiety indicator."
                ),
            ),
            EEGSignature(
                description="Reduced alpha activity (especially posterior)",
                typical_locations=("Pz", "O1", "O2", "P3", "P4"),
                frequency_band="alpha",
                direction="reduced",
                magnitude="mild_to_moderate",
                research_citation="Simpson et al., 2000; Hammond, 2005",
                clinical_note="Alpha reduction reflects hyperarousal and difficulty relaxing.",
            ),
            EEGSignature(
                description="Alpha asymmetry shifts during symptom provocation",
                typical_locations=("Posterior", "Parietal-occipital"),
                frequency_band="alpha",
                direction="reduced_posterior",
                magnitude="moderate",
                research_citation="Simpson et al., 2000",
                clinical_note=(
                    "Live exposure to feared stimuli produces greater alpha changes than "
                    "imagined exposure — useful for exposure-response treatment planning."
                ),
            ),
        ),
        protocol_suggestions=(
            ProtocolSuggestion(
                name="Alpha enhancement / Alpha-Theta training",
                electrode_placement="Pz (occipital-parietal) or O1-O2",
                reward_band_hz="8-12 Hz (alpha)",
                inhibit_band_hz="20-33 Hz (beta2)",
                session_count="30",
                session_duration_min="50",
                expected_outcomes=(
                    "33% more alpha post-treatment",
                    "Significant reduction in test anxiety",
                    "Sense of calmness",
                ),
                research_citation="Hammond, 2005; Moradi et al., 2011",
                note="Alpha/Theta training is especially effective for PTSD and deep anxiety.",
            ),
            ProtocolSuggestion(
                name="Dual-site anxiety protocol",
                electrode_placement="Pz (25 min) + Fz (25 min)",
                reward_band_hz="Alpha at Pz + Beta at Fz",
                inhibit_band_hz="Beta2 at Pz + Beta2 at Fz",
                session_count="30",
                session_duration_min="50",
                expected_outcomes=(
                    "Reduced anxiety and restlessness",
                    "Improved attention",
                    "Sustained calmness at 1-year follow-up",
                ),
                research_citation="Moradi et al., 2011",
                note="Simultaneous training: reinforce alpha/inhibit beta2 at Pz, reinforce beta/inhibit beta2 at Fz.",
            ),
            ProtocolSuggestion(
                name="Alpha-Theta PTSD protocol (Peniston protocol)",
                electrode_placement="Pz or O1-Oz",
                reward_band_hz="Alpha-Theta crossover (4-12 Hz)",
                inhibit_band_hz="20-30 Hz",
                session_count="30",
                session_duration_min="30",
                expected_outcomes=(
                    "80% remission of PTSD symptoms at 26-month follow-up",
                    "Reduced nightmares and flashbacks",
                    "Improved emotional regulation",
                ),
                research_citation="Peniston et al., 1993; Hammond, 2005",
                note="Deep states training. Originally developed for Vietnam Veterans with PTSD and alcohol abuse.",
            ),
        ),
        key_references=(
            "Hammond, D. C. (2005). Neurofeedback treatment of depression and anxiety. Journal of Adult Development, 12(2), 131-137.",
            "Moradi, A., Pouladi, F., Pishva, N., Rezaei, B., Torshabi, M., & Mehrjerdi, Z. A. (2011). Treatment of anxiety disorder with neurofeedback: case study. Procedia-Social and Behavioral Sciences, 30, 103-107.",
            "Simpson, H. B., Tenke, C. E., Towey, J. B., Liebowitz, M. R., & Bruder, G. E. (2000). Symptom provocation alters behavioral ratings and brain electrical activity in obsessive-compulsive disorder. Psychiatry research, 95(2), 149-155.",
            "Peniston, E. G., & Kulkosky, P. J. (1993). Alpha-theta brainwave neuro-feedback therapy for Vietnam veterans with combat-related post-traumatic stress disorder. Medical Psychotherapy, 6, 37-50.",
        ),
        copilot_summary=(
            "Anxiety is associated with elevated beta2 (19-23 Hz) in central, frontal, and parietal regions, "
            "and reduced alpha (especially posterior). Alpha enhancement and Alpha-Theta training are primary "
            "protocols. The Peniston protocol showed 80% PTSD remission at 26-month follow-up. Live exposure "
            "produces greater EEG changes than imagined exposure."
        ),
    ),
    ClinicalCondition(
        name="Eating Disorders",
        aliases=("anorexia_nervosa", "bulimia_nervosa", "binge_eating", "an", "bn", "bed"),
        category="eating",
        dsm_criteria_summary=(
            "Extreme restriction, bingeing, purging, intense fear of weight gain, "
            "social isolation, obsessional traits. Often comorbid with anxiety and ADHD."
        ),
        eeg_signatures=(
            EEGSignature(
                description="Frontal alpha asymmetry during resting EEG",
                typical_locations=("F3", "F4", "Fz"),
                frequency_band="alpha",
                direction="asymmetry",
                magnitude="moderate",
                research_citation="Bartholdy et al., 2013; Grunwald et al., 2004",
                clinical_note=(
                    "Asymmetry in cortical activation during resting EEG; partially persists "
                    "after weight gain. Reduced frontal alpha and increased frontal beta when underweight."
                ),
            ),
            EEGSignature(
                description="Reduced rolandic (sensorimotor) alpha synchronization",
                typical_locations=("C3", "C4", "Cz", "CP3", "CP4"),
                frequency_band="alpha1 / alpha2",
                direction="reduced_synchronization",
                magnitude="moderate",
                research_citation="Rodriguez et al., 2007",
                clinical_note=(
                    "Both AN and BN show reduced relative current density of alpha1 and alpha2 sources "
                    "in central, limbic, temporal, occipital, and parietal areas. Temporal alpha1 reduction "
                    "stronger in AN."
                ),
            ),
            EEGSignature(
                description="Increased frontal beta when underweight",
                typical_locations=("F3", "F4", "Fz", "Fp1", "Fp2"),
                frequency_band="beta",
                direction="excess",
                magnitude="mild_to_moderate",
                research_citation="Hatch et al., 2011; Bartholdy et al., 2013",
                clinical_note="Reflects hyperarousal and obsessional cognitive activity.",
            ),
            EEGSignature(
                description="Comorbid ADHD-like impulsivity patterns (BN/BED)",
                typical_locations=("Frontocentral"),
                frequency_band="theta / beta",
                direction="elevated_ratio",
                magnitude="variable",
                research_citation="Bartholdy et al., 2013; Waxman, 2009; Seitz et al., 2013",
                clinical_note=(
                    "Bulimic disorders commonly accompanied by increased impulsivity and inattention. "
                    "Behavioral overlap with ADHD may respond to similar NF protocols."
                ),
            ),
        ),
        protocol_suggestions=(
            ProtocolSuggestion(
                name="Theta/Beta training for BN/BED",
                electrode_placement="Frontocentral (highest TBR site)",
                reward_band_hz="Beta (13-21 Hz)",
                inhibit_band_hz="Theta (4-8 Hz)",
                session_count="30-40",
                session_duration_min="20-30",
                expected_outcomes=(
                    "Reduced impulsivity and inattention",
                    "Improved cognitive and behavioral functioning",
                    "Diminished binge episodes",
                ),
                research_citation="Bartholdy et al., 2013",
                note=(
                    "TBR may reflect CNS underarousal. Training toward optimal ranges may relieve "
                    "BN by encouraging proper arousal and enhancing cognitive control."
                ),
            ),
            ProtocolSuggestion(
                name="Alpha synchronization training (AN/BN)",
                electrode_placement="Central/rolandic (C3, C4, Cz, CP3, CP4)",
                reward_band_hz="Alpha1 (8-10 Hz) + Alpha2 (10-12 Hz)",
                inhibit_band_hz="Theta (4-8 Hz) + High beta (20-30 Hz)",
                session_count="30-40",
                session_duration_min="20-30",
                expected_outcomes=(
                    "Improved cortical neural synchronization",
                    "Reduced eating disorder symptoms",
                ),
                research_citation="Rodriguez et al., 2007",
                note="Target rolandic alpha rhythms to restore cortical synchronization mechanisms.",
            ),
            ProtocolSuggestion(
                name="Feedback-based craving reduction",
                electrode_placement="Insula/reward system regions (via fMRI or sLORETA-guided)",
                reward_band_hz="Individualized per assessment",
                inhibit_band_hz="Individualized per assessment",
                session_count="20-30",
                session_duration_min="30",
                expected_outcomes=(
                    "Reduced dysfunctional eating behaviors",
                    "Reduced cravings and rumination",
                    "Modulated sympathetic reactivity to food stimuli",
                ),
                research_citation="Imperatori et al., 2018",
                note="Feedback-based techniques modify brain activity in reward system regions (e.g., insula).",
            ),
        ),
        key_references=(
            "Bartholdy, S., Musiat, P., Campbell, I. C., & Schmidt, U. (2013). The potential of neurofeedback in the treatment of eating disorders. European Eating Disorders Review, 21(6), 456-463.",
            "Rodriguez, G., Babiloni, C., Brugnolo, A., et al. (2007). Cortical sources of awake scalp EEG in eating disorders. Clinical neurophysiology, 118(6), 1213-1222.",
            "Imperatori, C., Mancini, M., Della Marca, G., et al. (2018). Feedback-based treatments for eating disorders. (Preliminary findings)",
        ),
        copilot_summary=(
            "Eating disorders show frontal alpha asymmetry, reduced rolandic alpha synchronization, "
            "and increased frontal beta when underweight. BN/BED often comorbid with ADHD-like impulsivity. "
            "Theta/Beta training and alpha synchronization protocols are research-backed approaches. "
            "Feedback-based techniques target reward system modulation."
        ),
    ),
    ClinicalCondition(
        name="Obsessive-Compulsive Disorder",
        aliases=("ocd", "obsessive_compulsive_disorder"),
        category="obsessive_compulsive",
        dsm_criteria_summary=(
            "Recurrent and persistent thoughts, impulses, images (obsessions); "
            "repetitive behaviors (compulsions); intrusive, inappropriate, anxiety-driven mental acts. "
            "Associated with obsessive cleanliness, symmetry, forbidden thoughts, harm, difficulty discarding."
        ),
        eeg_signatures=(
            EEGSignature(
                description="Hypercoherence (brain being 'too connected')",
                typical_locations=("Frontal", "Temporal", "Parietal"),
                frequency_band="beta",
                direction="hypercoherence",
                magnitude="severe",
                research_citation="Sürmeli & Ertem, 2011",
                clinical_note=(
                    "Hypercoherence regarded as immaturity wherein cortical areas do not specialize "
                    "and appear overly similar — overconnectivity prevents functional differentiation."
                ),
            ),
            EEGSignature(
                description="Elevated beta over anterior cingulate gyrus",
                typical_locations=("Fz", "Cz", "FCz"),
                frequency_band="beta (19-25 Hz)",
                direction="excess",
                magnitude="moderate",
                research_citation="Hammond, 2003",
                clinical_note=(
                    "Mild excess of beta over anterior cingulate (Fz/Cz) correlates with obsession, "
                    "checking compulsions, and contamination fears."
                ),
            ),
            EEGSignature(
                description="Increased alpha in posterior regions during live exposure",
                typical_locations=("Pz", "P3", "P4", "O1", "O2"),
                frequency_band="alpha",
                direction="excess_posterior",
                magnitude="moderate",
                research_citation="Simpson et al., 2000",
                clinical_note=(
                    "Live exposure to feared stimuli produces greater alpha increase in posterior regions "
                    "than imagined exposure. Suggests posterior alpha as a treatment target."
                ),
            ),
            EEGSignature(
                description="Anterior-to-posterior scalp distribution shift in alpha power",
                typical_locations=("Frontal-to-posterior gradient"),
                frequency_band="alpha",
                direction="redistributed",
                magnitude="moderate",
                research_citation="Simpson et al., 2000",
                clinical_note="Alpha power redistribution during symptom provocation is a consistent OCD finding.",
            ),
        ),
        protocol_suggestions=(
            ProtocolSuggestion(
                name="QEEG-guided hypercoherence reduction",
                electrode_placement="F3, Fz, F4, C4-P4 (individualized per QEEG)",
                reward_band_hz="Individualized per qEEG assessment",
                inhibit_band_hz="Individualized per qEEG assessment",
                session_count="20-30",
                session_duration_min="30",
                expected_outcomes=(
                    "Average 21.53-point Y-BOCS improvement (vs 10.64 for drug treatment)",
                    "Normalization of MMPI Depression and Psychasthenia scales",
                    "Sustained improvement at 2-year follow-up",
                ),
                research_citation="Sürmeli & Ertem, 2011",
                note=(
                    "First decrease hypercoherence, then decrease individual abnormal brain activity. "
                    "Most common placements: F3, Fz, F4, C4-P4."
                ),
            ),
            ProtocolSuggestion(
                name="Beta inhibition over anterior cingulate",
                electrode_placement="Fz-Cz (15-20 min) then Cz-C4 (15-20 min)",
                reward_band_hz="12-15 Hz (SMR/alpha)",
                inhibit_band_hz="19-25 Hz (beta)",
                session_count="44",
                session_duration_min="30",
                expected_outcomes=(
                    "Absence of compulsions",
                    "Absence of fear and paranoia",
                    "More 'mellow' affect",
                ),
                research_citation="Hammond, 2003",
                note="For ADHD+OCD comorbid presentation. Inhibit 19-25 Hz beta while mildly reinforcing 12-15 Hz.",
            ),
            ProtocolSuggestion(
                name="Posterior alpha modulation (exposure-based)",
                electrode_placement="Pz, P3, P4, O1, O2",
                reward_band_hz="Individualized alpha (8-13 Hz)",
                inhibit_band_hz="Individualized per assessment",
                session_count="20-30",
                session_duration_min="30",
                expected_outcomes=(
                    "Reduced OCD symptoms with live exposure",
                    "Improved cortical activation balance",
                ),
                research_citation="Simpson et al., 2000",
                note="Live exposure more effective than imagined exposure. Consider only by licensed exposure therapists.",
            ),
        ),
        key_references=(
            "Sürmeli, T., & Ertem, A. (2011). Obsessive compulsive disorder and the efficacy of qEEG-guided neurofeedback treatment. Clinical EEG and Neuroscience, 42(3), 195-201.",
            "Hammond, D. C. (2003). QEEG-guided neurofeedback in the treatment of obsessive compulsive disorder. Journal of Neurotherapy, 7(2), 25-52.",
            "Simpson, H. B., Tenke, C. E., Towey, J. B., Liebowitz, M. R., & Bruder, G. E. (2000). Symptom provocation alters behavioral ratings and brain electrical activity in obsessive-compulsive disorder. Psychiatry research, 95(2), 149-155.",
            "Ackerman DL, Greenland S. Multivariate meta-analysis of controlled drug studies for obsessive-compulsive disorder. J Clinical Psychopharmacology 2002; 22: 309-317.",
        ),
        copilot_summary=(
            "OCD is characterized by hypercoherence (excessive connectivity), elevated beta over the "
            "anterior cingulate (Fz/Cz), and alpha redistribution during symptom provocation. "
            "qEEG-guided neurofeedback showed superior Y-BOCS improvement (21.53 pts) compared to "
            "drug treatment (10.64 pts), with sustained benefits at 2-year follow-up. Live exposure "
            "produces greater EEG changes than imagined exposure."
        ),
    ),
    ClinicalCondition(
        name="Schizophrenia",
        aliases=("schizophrenia", "psychosis", "sz"),
        category="psychotic",
        dsm_criteria_summary=(
            "Characterized by delusions, hallucinations, disorganized thinking and speech, "
            "grossly disorganized or abnormal motor behavior, and negative symptoms. "
            "Duration of symptoms > 6 months with significant functional impairment."
        ),
        eeg_signatures=(
            EEGSignature(
                description="Excess delta and theta power (slow-wave excess)",
                typical_locations=("Frontal", "Temporal", "Diffuse"),
                frequency_band="delta / theta",
                direction="excess",
                magnitude="moderate_to_severe",
                research_citation="Surmeli et al., 2012",
                clinical_note=(
                    "Excess slow-wave activity is one of the most consistent EEG findings in schizophrenia. "
                    "Reflects impaired cortical organization and reduced inhibitory tone."
                ),
            ),
            EEGSignature(
                description="Reduced alpha power",
                typical_locations=("Parietal", "Occipital", "Diffuse"),
                frequency_band="alpha",
                direction="reduced",
                magnitude="moderate",
                research_citation="Surmeli et al., 2012",
                clinical_note=(
                    "Reduced posterior alpha reflects thalamic dysregulation and diminished resting "
                    "cortical rhythm. Contributes to cognitive deficits and attentional impairment."
                ),
            ),
            EEGSignature(
                description="Altered coherence and hyperconnectivity",
                typical_locations=("Interhemispheric", "Frontal-temporal"),
                frequency_band="beta / gamma",
                direction="hypercoherence",
                magnitude="moderate",
                research_citation="Surmeli et al., 2012",
                clinical_note=(
                    "Altered functional connectivity patterns are seen in schizophrenia. "
                    "qEEG-guided neurofeedback can target individualized coherence abnormalities."
                ),
            ),
            EEGSignature(
                description="Lack of gamma organization",
                typical_locations=("Frontal", "Parietal"),
                frequency_band="gamma",
                direction="reduced_organization",
                magnitude="moderate",
                research_citation="Horrell et al., 2010",
                clinical_note=(
                    "Gamma bursts during problem-solving are disorganized in schizophrenia. "
                    "Caution: gamma training is sometimes linked to psychosis in the literature — "
                    "practitioners should tread carefully and use z-score training to balance gamma."
                ),
            ),
        ),
        protocol_suggestions=(
            ProtocolSuggestion(
                name="qEEG-guided individualized neurofeedback",
                electrode_placement="Individualized per QEEG assessment (typically frontal and temporal sites)",
                reward_band_hz="Individualized per qEEG (often alpha or SMR)",
                inhibit_band_hz="Individualized per qEEG (often delta/theta excess or high beta)",
                session_count="20-30",
                session_duration_min="30",
                expected_outcomes=(
                    "94% clinical improvement rate",
                    ">20% decrease in PANSS total score (comparable to antipsychotic trials)",
                    "Improved symptom management",
                ),
                research_citation="Surmeli et al., 2012",
                note=(
                    "In the key study, medications were discontinued during recording. "
                    "48 of 51 subjects showed clinical improvement; 47 of 48 responders achieved "
                    ">20% PANSS decrease. Caution advised regarding medication discontinuation."
                ),
            ),
        ),
        key_references=(
            "Surmeli, T., Ertem, A., Eralp, E., & Kos, I. H. (2012). Schizophrenia and the efficacy of qEEG-guided neurofeedback treatment: a clinical case series. Clinical EEG and Neuroscience, 43(2), 133-144.",
            "Horrell, T., El-Baz, A., Baruth, J., Tasman, A., Sokhadze, G., Stewart, C., & Sokhadze, E. (2010). Neurofeedback effects on evoked and induced EEG gamma band reactivity to drug-related cues in cocaine addiction. Journal of neurotherapy, 14(3), 195-216.",
        ),
        copilot_summary=(
            "Schizophrenia shows excess delta/theta, reduced alpha, altered coherence, and disorganized gamma. "
            "qEEG-guided neurofeedback is Level 3/Probably Efficacious. A clinical case series of 51 subjects "
            "showed 94% improvement with PANSS reductions comparable to antipsychotic trials. Caution is advised "
            "with gamma training due to literature links to psychosis."
        ),
    ),
)

# ── Indexes ─────────────────────────────────────────────────────────────────

_BY_NAME: dict[str, ClinicalCondition] = {}
_BY_ALIAS: dict[str, ClinicalCondition] = {}
_BY_CATEGORY: dict[str, list[ClinicalCondition]] = {}

for _cc in _CONDITIONS:
    _BY_NAME[_cc.name.lower()] = _cc
    _BY_ALIAS[_cc.name.lower()] = _cc
    for _alias in _cc.aliases:
        _BY_ALIAS[_alias.lower()] = _cc
    _BY_CATEGORY.setdefault(_cc.category, []).append(_cc)


class ClinicalConditionAtlas:
    """Read-only accessor for clinical condition → EEG signature / protocol mappings."""

    @staticmethod
    def lookup(name_or_alias: str) -> ClinicalCondition | None:
        """Return condition by name or alias (case-insensitive)."""
        key = name_or_alias.lower()
        return _BY_NAME.get(key) or _BY_ALIAS.get(key)

    @staticmethod
    def by_category(category: str) -> list[ClinicalCondition]:
        """Return all conditions in *category*."""
        return list(_BY_CATEGORY.get(category.lower(), []))

    @staticmethod
    def all_conditions() -> tuple[ClinicalCondition, ...]:
        """Return the full catalog."""
        return _CONDITIONS

    @staticmethod
    def match_signature(
        band: str,
        direction: str,
        region: str,
    ) -> list[tuple[ClinicalCondition, EEGSignature]]:
        """Return (condition, signature) tuples that loosely match a finding.

        This is advisory — it flags "this pattern is seen in X" without
        asserting diagnosis. Used by the findings enhancer and copilot.
        """
        matches: list[tuple[ClinicalCondition, EEGSignature]] = []
        for cc in _CONDITIONS:
            for sig in cc.eeg_signatures:
                band_match = band.lower() in sig.frequency_band.lower()
                dir_match = direction.lower() in sig.direction.lower()
                loc_match = any(region.upper() in loc.upper() for loc in sig.typical_locations)
                if band_match and dir_match and loc_match:
                    matches.append((cc, sig))
        return matches


def explain_clinical_condition(name_or_alias: str) -> dict[str, Any] | None:
    """Return a plain-dict explanation for *condition*, or None if unknown."""
    cc = ClinicalConditionAtlas.lookup(name_or_alias)
    if cc is None:
        return None
    return {
        "name": cc.name,
        "aliases": list(cc.aliases),
        "category": cc.category,
        "dsm_summary": cc.dsm_criteria_summary,
        "eeg_signatures": [
            {
                "description": s.description,
                "locations": list(s.typical_locations),
                "band": s.frequency_band,
                "direction": s.direction,
                "magnitude": s.magnitude,
                "citation": s.research_citation,
                "clinical_note": s.clinical_note,
            }
            for s in cc.eeg_signatures
        ],
        "protocol_suggestions": [
            {
                "name": p.name,
                "electrode_placement": p.electrode_placement,
                "reward_band": p.reward_band_hz,
                "inhibit_band": p.inhibit_band_hz,
                "session_count": p.session_count,
                "session_duration": p.session_duration_min,
                "expected_outcomes": list(p.expected_outcomes),
                "citation": p.research_citation,
                "note": p.note,
            }
            for p in cc.protocol_suggestions
        ],
        "key_references": list(cc.key_references),
        "copilot_summary": cc.copilot_summary,
    }


def flag_potential_clinical_pattern(
    region: str,
    band: str,
    direction: str,
    z_score: float | None = None,
) -> list[dict[str, str]]:
    """Return advisory clinical-context flags for a finding.

    Example: elevated theta at Fz -> "Pattern seen in ADHD (theta excess
    frontocentral). Not diagnostic — consider clinical correlation."
    """
    flags: list[dict[str, str]] = []
    for cc, sig in ClinicalConditionAtlas.match_signature(band, direction, region):
        severity = "high" if z_score is not None and abs(z_score) > 2.5 else "medium"
        flags.append(
            {
                "condition": cc.name,
                "pattern": sig.description,
                "confidence": severity,
                "note": (
                    f"{sig.description} is associated with {cc.name} research literature. "
                    f"{sig.clinical_note} This is not diagnostic — correlate with clinical assessment."
                ),
            }
        )
    return flags
