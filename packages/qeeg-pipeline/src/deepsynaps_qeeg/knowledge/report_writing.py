"""qEEG report writing guide derived from QEEG courseware (ACNS / Kaplan & Benbadis).

Provides structured guidance for writing clinically appropriate EEG/qEEG
reports following the American Clinical Neurophysiology Society guidelines.
All guidance is advisory — final report authority rests with the qualified
interpreting clinician.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable


@dataclass(frozen=True)
class ReportSectionProfile:
    """A single report section with required content and cautions."""

    section_name: str
    purpose: str
    required_elements: tuple[str, ...]
    cautions: str
    audience: str


_SECTIONS: tuple[ReportSectionProfile, ...] = (
    ReportSectionProfile(
        section_name="introduction",
        purpose="Orient the reader to the study parameters and clinical context.",
        required_elements=(
            "Demographics (age, gender)",
            "Clinical question — why the client is there and what is being determined",
            "Relevant medical and psychological history",
            "States of consciousness (awake, asleep, concussed, etc.)",
            "Eye conditions (eyes open / eyes closed) and how they were tracked",
            "Number and placement of scalp electrodes",
            "Extra recording modalities used (ECG, EMG, respiration) and their purpose",
            "Duration — time started and ended",
        ),
        cautions=(
            "Do not include premature interpretive statements in the introduction. "
            "Ensure eye condition labels match the actual recording state — posterior alpha can indicate eyes closed."
        ),
        audience="All readers of the report.",
    ),
    ReportSectionProfile(
        section_name="description",
        purpose="Provide a factual, visual-analysis description of the EEG tracing without interpretation.",
        required_elements=(
            "Dominant rhythm — frequency, location, reactivity",
            "All frequencies in detail (amounts, locations, symmetry, persistence)",
            "Sleep patterns if applicable",
            "Symmetry, distribution, persistence, and amplitude in microvolts",
            "Whether activity is continuous or intermittent",
            "Effects of stimulating or arousal procedures on frequencies and amplitude",
            "Any suspicious features resembling epileptiform or transient activity",
            "Phase reversals — list locations only (cleaner for non-neurologists than calling them 'spikes')",
        ),
        cautions=(
            "Do NOT state whether activity is seizure activity unless you are a neurologist. "
            "Use 'phase reversal' as a descriptive term rather than diagnostic labeling. "
            "Describe what you see, not what you think it means."
        ),
        audience="Trained EEG readers and referring clinicians.",
    ),
    ReportSectionProfile(
        section_name="interpretation",
        purpose="Synthesize findings into an impression and correlate with the clinical picture.",
        required_elements=(
            "Inclusive review of EEG findings taking into account the client's history",
            "Explanation of how EEG findings fit (or do not fit) the clinical picture",
            "Impression of whether the study is normal or abnormal",
            "Degree of abnormality if applicable",
            "Comparison with prior EEGs if available",
            "Suggestion of whether further EEGs may help",
        ),
        cautions=(
            "Write for clinicians — not only for EEG specialists. "
            "Avoid specific therapeutic suggestions such as 'this pattern warrants antiepileptic drugs.' "
            "Avoid noncommittal phrases ('consistent with', 'compatible with') when specificity is available. "
            "Avoid vague statements like 'clinical correlation is warranted' — explain what correlation means."
        ),
        audience="Referring clinicians and other medical professionals.",
    ),
    ReportSectionProfile(
        section_name="clinical_correlation",
        purpose="Tie the EEG findings directly back to the clinical question that prompted the study.",
        required_elements=(
            "Direct answer to the clinical question posed in the introduction",
            "How the EEG findings inform the presenting concern",
            "Any limitations of the EEG in addressing the clinical question",
        ),
        cautions=(
            "Do not introduce new findings here that were not described or interpreted above. "
            "Do not add management recommendations — the report describes the EEG, it does not prescribe treatment."
        ),
        audience="Referring clinician and care team.",
    ),
)

_DOS_AND_DONTS: dict[str, tuple[str, ...]] = {
    "dos": (
        "Convey a written impression of the visual analysis and its clinical significance.",
        "Use technical terms when applicable — but explain them for non-specialists.",
        "Make the report easily understood for any medical professional.",
        "Compare with prior EEGs when available.",
        "Be specific when specificity is available.",
        "Include self-report measures and performance assessments as supplementary context.",
        "Review head maps from multiple montages (Linked Ears, Laplacian) for complementary views.",
        "Use longitudinal (double banana) montages when assessing for epileptiform discharges.",
    ),
    "donts": (
        "Do NOT use SOAP format — it does not provide enough detail for EEG interpretation.",
        "Do NOT add advice or treatment recommendations — only report on the EEG.",
        "Do NOT provide a list of possible differential diagnoses.",
        "Do NOT state 'clinical correlation is warranted' without explaining what that means.",
        "Do NOT use noncommittal phrases ('consistent with', 'compatible with') when more specific language is possible.",
        "Do NOT include inconclusive findings without explaining why they are inconclusive.",
        "Do NOT allow vague language when specificity is available.",
        "Do NOT claim that qEEG can diagnose epilepsy — routine EEG and qEEG cannot do this alone.",
        "Do NOT claim that qEEG can differentiate infarction from hemorrhage, tumor, or other focal lesions.",
        "Do NOT present qEEG brain mapping as a standalone diagnostic in legal or insurance contexts — false positives are a known risk.",
    ),
}

_SECTION_INDEX: dict[str, ReportSectionProfile] = {}
for _entry in _SECTIONS:
    _SECTION_INDEX[_entry.section_name] = _entry


class ReportWritingGuide:
    """Read-only accessor for EEG/qEEG report writing guidance."""

    @staticmethod
    def section(name: str) -> ReportSectionProfile | None:
        return _SECTION_INDEX.get(name)

    @staticmethod
    def all_sections() -> tuple[ReportSectionProfile, ...]:
        return _SECTIONS

    @staticmethod
    def dos_and_donts() -> dict[str, tuple[str, ...]]:
        return dict(_DOS_AND_DONTS)


def explain_report_section(section_name: str) -> dict[str, str] | None:
    """Return guidance for *section_name*, or None if unknown."""
    profile = ReportWritingGuide.section(section_name)
    if profile is None:
        return None
    return {
        "section_name": profile.section_name,
        "purpose": profile.purpose,
        "required_elements": "\n".join(profile.required_elements),
        "cautions": profile.cautions,
        "audience": profile.audience,
    }


def generate_report_outline(
    clinical_question: str,
    recording_conditions: Iterable[str],
    has_prior_eeg: bool = False,
) -> dict[str, list[str]]:
    """Return a structured outline for a qEEG report.

    Parameters
    ----------
    clinical_question : str
        The reason for the study.
    recording_conditions : iterable of str
        e.g. ["eyes_closed_rest", "eyes_open_rest"].
    has_prior_eeg : bool
        Whether prior EEGs exist for comparison.

    Returns
    -------
    dict
        Keys ``introduction``, ``description``, ``interpretation``,
        ``clinical_correlation``, each mapped to a list of bullet points.
    """
    intro = [
        f"Clinical question: {clinical_question}",
        "Demographics and relevant history.",
        f"Recording conditions: {', '.join(recording_conditions) or 'not specified'}.",
        "Electrode montage and extra modalities.",
        "Duration and technical quality.",
    ]

    desc = [
        "Dominant rhythm: frequency, location, reactivity.",
        "All frequencies: amounts, locations, symmetry, persistence.",
        "Amplitudes in microvolts.",
        "Continuous vs intermittent activity.",
        "Effects of stimulation/arousal procedures.",
        "Suspicious features / phase reversals (list locations only).",
    ]

    interp = [
        "Review of EEG findings in context of clinical history.",
        "Impression: normal vs abnormal.",
        "Degree of abnormality if applicable.",
    ]
    if has_prior_eeg:
        interp.append("Comparison with prior EEGs.")
    interp.append("Whether further EEGs may help.")

    corr = [
        f"Direct correlation to clinical question: {clinical_question}",
        "How EEG findings inform the presenting concern.",
        "Limitations of EEG in addressing the clinical question.",
    ]

    return {
        "introduction": intro,
        "description": desc,
        "interpretation": interp,
        "clinical_correlation": corr,
    }
