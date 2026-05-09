"""Efficacy criteria for qEEG-guided neurofeedback and assessment.

Implements the AAPB/ISNR 5-level efficacy taxonomy plus condition-specific
efficacy ratings sourced from QEEG course materials (Halter & Brand; Ingram).

This module helps clinicians, researchers, and AI agents understand:
- What level of evidence supports a given qEEG application
- Which normative databases meet peer-reviewed standards
- How to communicate evidence quality to patients and regulators
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable


@dataclass(frozen=True)
class EfficacyLevel:
    """One level in the 5-tier efficacy taxonomy."""

    level: int
    name: str
    description: str
    criteria: tuple[str, ...]
    clinical_implication: str
    examples: tuple[str, ...]


@dataclass(frozen=True)
class ConditionEfficacy:
    """Evidence rating for qEEG assessment or neurofeedback treatment of a condition."""

    condition: str
    assessment_level: int  # 1-5 for qEEG assessment
    assessment_evidence: str
    neurofeedback_level: int  # 1-5 for NF treatment
    neurofeedback_evidence: str
    key_studies: tuple[str, ...]
    regulatory_note: str
    copilot_summary: str


# ── 5-Level Taxonomy ────────────────────────────────────────────────────────

_EFFICACY_LEVELS: tuple[EfficacyLevel, ...] = (
    EfficacyLevel(
        level=1,
        name="Not empirically supported",
        description=(
            "Supported only by anecdotal reports and/or case studies in "
            "non-peer-reviewed venues."
        ),
        criteria=(
            "No peer-reviewed published studies",
            "Anecdotal or case-study evidence only",
            "No normative database validation in peer-reviewed journals",
        ),
        clinical_implication=(
            "Clinicians should not use normative databases that have not been "
            "published in a peer-reviewed journal for client evaluation. "
            "State licensing agencies should be informed when substandard "
            "normative databases are used."
        ),
        examples=(
            "Unpublished proprietary normative databases",
            "Commercial qEEG systems without peer-reviewed validation",
        ),
    ),
    EfficacyLevel(
        level=2,
        name="Possibly efficacious",
        description=(
            "At least one study of sufficient statistical power with well-identified "
            "outcome measures, but lacking randomized assignment to a control condition."
        ),
        criteria=(
            "One study with sufficient statistical power",
            "Well-identified outcome measures",
            "No randomized assignment to internal control condition",
            "Representative sample (balanced sex, ethnicity, SES, age)",
        ),
        clinical_implication=(
            "Promising but preliminary. May be offered with clear disclosure that "
            "evidence is emerging."
        ),
        examples=(
            "Single-case series with pre-post design",
            "Open-label pilot studies",
        ),
    ),
    EfficacyLevel(
        level=3,
        name="Probably efficacious",
        description=(
            "Multiple observational studies, clinical studies, wait-list controlled "
            "studies, and within-subject / intrasubject replication studies that "
            "demonstrate efficacy."
        ),
        criteria=(
            "Multiple observational or clinical studies",
            "Wait-list controlled designs",
            "Within-subject and intrasubject replication",
            "Consistent positive outcomes across studies",
        ),
        clinical_implication=(
            "Reasonable to offer in clinical practice with informed consent. "
            "Evidence base is growing but not yet at RCT standard."
        ),
        examples=(
            "ADHD theta/beta ratio neurofeedback (multiple replication studies)",
            "Anxiety alpha enhancement (multiple case series)",
        ),
    ),
    EfficacyLevel(
        level=4,
        name="Efficacious",
        description=(
            "Randomized comparison with no-treatment control, alternative treatment, "
            "or sham (placebo) control showing statistically significant superiority, "
            "demonstrated in at least two independent research settings."
        ),
        criteria=(
            "Randomized assignment to control condition",
            "Statistically significant superiority over control OR equivalence to established treatment",
            "Specific population with reliable, operationally defined inclusion criteria",
            "Valid and clearly specified outcome measures",
            "Appropriate data analysis",
            "Replicable diagnostic and treatment procedures",
            "Demonstrated in at least two independent research settings",
        ),
        clinical_implication=(
            "Evidence supports routine clinical use. Can be recommended as a "
            "first-line or adjunct intervention."
        ),
        examples=(
            "ADHD neurofeedback (multiple RCTs across independent labs)",
            "Epilepsy neurofeedback (RCT evidence)",
        ),
    ),
    EfficacyLevel(
        level=5,
        name="Well-established / Empirically supported",
        description=(
            "Meets all Level 4 criteria AND has been shown statistically superior to "
            "credible sham therapy, pill, or alternative bona fide treatment in at least "
            "two independent research settings. qEEG is reliable and reproducible."
        ),
        criteria=(
            "Meets all Level 4 criteria",
            "Superior to credible sham / placebo / alternative treatment",
            "At least two independent research settings",
            "Reliable and reproducible qEEG metrics",
        ),
        clinical_implication=(
            "Highest level of evidence. Can be offered with confidence comparable "
            "to established pharmacological or psychological treatments."
        ),
        examples=(
            "qEEG reliability and reproducibility (meta-analytic support)",
        ),
    ),
)

# ── Condition-specific efficacy ratings ─────────────────────────────────────

_CONDITION_EFFICACIES: tuple[ConditionEfficacy, ...] = (
    ConditionEfficacy(
        condition="ADHD",
        assessment_level=4,
        assessment_evidence=(
            "NEBA (Neuropsychiatric EEG-Based ADHD Assessment Aid) is FDA-cleared "
            "as an adjunct to ADHD clinical evaluation. Assists with DSM criterion E "
            "(symptoms not better explained by another disorder). Theta/beta ratio "
            "is the primary biomarker. AAN guideline supports utility with moderate confidence."
        ),
        neurofeedback_level=4,
        neurofeedback_evidence=(
            "Multiple RCTs across independent laboratories. Theta/beta training, SMR "
            "enhancement, and SCP protocols all have randomized controlled trial support. "
            "Effects persist > 6 months and up to 2 years post-treatment."
        ),
        key_studies=(
            "Stein, M. A., Snyder, S. M., Rugino, T. A., & Hornig, M. (2016). Commentary: Objective aids for the assessment of ADHD. Journal of Child Psychology and Psychiatry, 57(6), 770-771.",
            "Gloss, D., Varma, J. K., Pringsheim, T., & Nuwer, M. R. (2016). Practice advisory: The utility of EEG theta/beta power ratio in ADHD diagnosis. Neurology, 87(22), 2375-2379.",
            "Sherlin, L., Arns, M., Lubar, J., & Sokhadze, E. (2010). A position paper on Neurofeedback for ADHD. Journal of Neurotherapy, 14(2), 66-78.",
            "Arns, M., Clark, C. R., Trullinger, M., deBeus, R., Mack, M., & Aniftos, M. (2020). Neurofeedback and ADHD in Children. Applied psychophysiology and biofeedback, 45(2), 39-48.",
        ),
        regulatory_note=(
            "FDA states NEBA is NOT to be used as a stand-alone diagnostic tool. "
            "It is for further testing following clinical evaluation."
        ),
        copilot_summary=(
            "ADHD qEEG assessment (NEBA/TBR) is Level 4/Efficacious — FDA-cleared adjunct. "
            "Neurofeedback treatment is also Level 4 with multiple RCTs showing sustained effects."
        ),
    ),
    ConditionEfficacy(
        condition="Schizophrenia",
        assessment_level=3,
        assessment_evidence=(
            "qEEG shows characteristic patterns in schizophrenia (excess delta/theta, "
            "reduced alpha, altered coherence). Assessment can guide individualized "
            "protocol selection."
        ),
        neurofeedback_level=3,
        neurofeedback_evidence=(
            "Clinical case series show promising results. In a study of 51 subjects, "
            "48 showed clinical improvement after qEEG-guided neurofeedback based on PANSS scores. "
            "47 of 48 responders achieved >20% decrease in PANSS total score — comparable to "
            "antipsychotic medication trial criteria."
        ),
        key_studies=(
            "Surmeli, T., Ertem, A., Eralp, E., & Kos, I. H. (2012). Schizophrenia and the efficacy of qEEG-guided neurofeedback treatment: a clinical case series. Clinical EEG and Neuroscience, 43(2), 133-144.",
        ),
        regulatory_note=(
            "Not yet at RCT level. Consider as adjunctive therapy with standard care. "
            "Medications were discontinued during recording in the key study — caution advised."
        ),
        copilot_summary=(
            "Schizophrenia qEEG-guided neurofeedback is Level 3/Probably Efficacious. "
            "A clinical case series of 51 subjects showed 94% clinical improvement rate with "
            "PANSS reductions comparable to antipsychotic trials."
        ),
    ),
    ConditionEfficacy(
        condition="Anxiety",
        assessment_level=3,
        assessment_evidence=(
            "Elevated beta2 (19-23 Hz) and reduced posterior alpha are consistent qEEG "
            "markers in anxiety disorders. Assessment can identify hyperarousal patterns."
        ),
        neurofeedback_level=3,
        neurofeedback_evidence=(
            "Multiple case studies and open trials support alpha enhancement and alpha-theta "
            "training. The Peniston protocol (alpha-theta for PTSD) showed 80% remission at "
            "26-month follow-up. Hammond's meta-analysis found 33% more alpha post-training "
            "with significant anxiety reduction."
        ),
        key_studies=(
            "Hammond, D. C. (2005). Neurofeedback treatment of depression and anxiety. Journal of Adult Development, 12(2), 131-137.",
            "Peniston, E. G., & Kulkosky, P. J. (1993). Alpha-theta brainwave neuro-feedback therapy for Vietnam veterans with combat-related PTSD. Medical Psychotherapy, 6, 37-50.",
            "Moradi, A., Pouladi, F., Pishva, N., Rezaei, B., Torshabi, M., & Mehrjerdi, Z. A. (2011). Treatment of anxiety disorder with neurofeedback: case study. Procedia-Social and Behavioral Sciences, 30, 103-107.",
        ),
        regulatory_note=(
            "Strong emerging evidence but not yet Level 4/RCT standard across all anxiety subtypes."
        ),
        copilot_summary=(
            "Anxiety qEEG neurofeedback is Level 3/Probably Efficacious. Alpha enhancement and "
            "alpha-theta training have the strongest evidence, with the Peniston protocol showing "
            "80% PTSD remission at long-term follow-up."
        ),
    ),
    ConditionEfficacy(
        condition="Autism Spectrum Disorder",
        assessment_level=3,
        assessment_evidence=(
            "qEEG identifies hypercoherence, excessive slow/fast power, and reduced alpha — "
            "all characteristic of ASD. Assessment can guide connectivity-based protocol selection."
        ),
        neurofeedback_level=3,
        neurofeedback_evidence=(
            "Connectivity-guided neurofeedback shows 40% symptom reduction (ATEC) and 76% "
            "decreased hyperconnectivity. Multiple open trials and replication studies support "
            "theta/beta training for executive function improvement."
        ),
        key_studies=(
            "Coben, R. (2007). Connectivity-guided neurofeedback for autistic spectrum disorder. Biofeedback, 35(4), 131-135.",
            "Coben, R., & Padolsky, I. (2007). Assessment-guided Neurofeedback for autistic spectrum disorder. Journal of Neurotherapy, 11(1), 5-23.",
            "Kouijzer, M. E., de Moor, J. M., Gerrits, B. J., Congedo, M., & van Schie, H. T. (2009). Neurofeedback improves executive functioning in children with autism spectrum disorders. Research in Autism Spectrum Disorders, 3(1), 145-162.",
        ),
        regulatory_note=(
            "Level 3 — reasonable to offer with informed consent. Not yet at RCT standard."
        ),
        copilot_summary=(
            "ASD qEEG neurofeedback is Level 3/Probably Efficacious. Connectivity-guided approaches "
            "have shown 40% symptom reduction with decreased hyperconnectivity. Theta/beta training "
            "improves executive function."
        ),
    ),
    ConditionEfficacy(
        condition="OCD",
        assessment_level=3,
        assessment_evidence=(
            "Hypercoherence and elevated beta over anterior cingulate are consistent qEEG "
            "findings in OCD. Assessment can identify individualized hypercoherence targets."
        ),
        neurofeedback_level=3,
        neurofeedback_evidence=(
            "qEEG-guided neurofeedback showed superior Y-BOCS improvement (21.53 points) vs "
            "drug treatment (10.64 points). Benefits sustained at 2-year follow-up. Case series "
            "design — promising but not yet RCT."
        ),
        key_studies=(
            "Sürmeli, T., & Ertem, A. (2011). Obsessive compulsive disorder and the efficacy of qEEG-guided neurofeedback treatment. Clinical EEG and Neuroscience, 42(3), 195-201.",
        ),
        regulatory_note=(
            "Level 3 — strong clinical case series evidence. Consider as adjunct to standard care."
        ),
        copilot_summary=(
            "OCD qEEG neurofeedback is Level 3/Probably Efficacious. qEEG-guided treatment showed "
            "superior Y-BOCS improvement compared to drug treatment, with sustained benefits at 2-year follow-up."
        ),
    ),
    ConditionEfficacy(
        condition="Eating Disorders",
        assessment_level=2,
        assessment_evidence=(
            "Frontal alpha asymmetry and reduced rolandic alpha are observed, but consistent "
            "qEEG assessment protocols are not yet established."
        ),
        neurofeedback_level=2,
        neurofeedback_evidence=(
            "Limited research. Some evidence for theta/beta training in bulimia due to ADHD-like "
            "impulsivity overlap. Feedback-based craving reduction is emerging."
        ),
        key_studies=(
            "Bartholdy, S., Musiat, P., Campbell, I. C., & Schmidt, U. (2013). The potential of neurofeedback in the treatment of eating disorders. European Eating Disorders Review, 21(6), 456-463.",
            "Imperatori, C., Mancini, M., Della Marca, G., et al. (2018). Feedback-based treatments for eating disorders. (Preliminary findings)",
        ),
        regulatory_note=(
            "Level 2 — possibly efficacious. Very limited evidence base. Offer only with clear disclosure."
        ),
        copilot_summary=(
            "Eating disorder qEEG neurofeedback is Level 2/Possibly Efficacious. Limited research exists; "
            "theta/beta training may help bulimia due to comorbid impulsivity patterns."
        ),
    ),
)

# ── Indexes ─────────────────────────────────────────────────────────────────

_BY_LEVEL: dict[int, EfficacyLevel] = {el.level: el for el in _EFFICACY_LEVELS}
_BY_CONDITION: dict[str, ConditionEfficacy] = {
    ce.condition.lower(): ce for ce in _CONDITION_EFFICACIES
}


class EfficacyAtlas:
    """Read-only accessor for efficacy taxonomy and condition ratings."""

    @staticmethod
    def level(level: int) -> EfficacyLevel | None:
        """Return the EfficacyLevel for *level* (1-5)."""
        return _BY_LEVEL.get(level)

    @staticmethod
    def all_levels() -> tuple[EfficacyLevel, ...]:
        """Return all 5 efficacy levels."""
        return _EFFICACY_LEVELS

    @staticmethod
    def condition_rating(condition: str) -> ConditionEfficacy | None:
        """Return the efficacy rating for *condition* (case-insensitive)."""
        return _BY_CONDITION.get(condition.lower())

    @staticmethod
    def all_condition_ratings() -> tuple[ConditionEfficacy, ...]:
        """Return all condition efficacy ratings."""
        return _CONDITION_EFFICACIES

    @staticmethod
    def conditions_at_level(level: int) -> list[ConditionEfficacy]:
        """Return all conditions rated at or above *level*."""
        return [ce for ce in _CONDITION_EFFICACIES if ce.neurofeedback_level >= level]


def explain_efficacy_level(level: int) -> dict[str, str | list[str]] | None:
    """Return a plain-dict explanation for efficacy *level* (1-5), or None."""
    el = EfficacyAtlas.level(level)
    if el is None:
        return None
    return {
        "level": str(el.level),
        "name": el.name,
        "description": el.description,
        "criteria": list(el.criteria),
        "clinical_implication": el.clinical_implication,
        "examples": list(el.examples),
    }


def explain_condition_efficacy(condition: str) -> dict[str, str | int | list[str]] | None:
    """Return a plain-dict efficacy rating for *condition*, or None."""
    ce = EfficacyAtlas.condition_rating(condition)
    if ce is None:
        return None
    return {
        "condition": ce.condition,
        "assessment_level": ce.assessment_level,
        "assessment_evidence": ce.assessment_evidence,
        "neurofeedback_level": ce.neurofeedback_level,
        "neurofeedback_evidence": ce.neurofeedback_evidence,
        "key_studies": list(ce.key_studies),
        "regulatory_note": ce.regulatory_note,
        "copilot_summary": ce.copilot_summary,
    }
