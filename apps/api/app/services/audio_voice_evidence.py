"""Decision-support evidence attachments for Voice Analyzer reports.

Combines retrieval from the internal evidence corpus (via evidence_intelligence)
with a small set of curated external reference URLs for clinician context.

This is not medical advice or a substitute for clinical judgment.
"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.orm import Session

from app.services.evidence_intelligence import EvidenceFeatureSummary, build_default_query, query_evidence

_logger = logging.getLogger(__name__)

VOICE_DECISION_SUPPORT_DISCLAIMER = (
    "These outputs are clinical decision-support signals derived from acoustic and "
    "language heuristics plus literature retrieval from the DeepSynaps evidence corpus. "
    "They are not diagnoses, staging tools, treatment directives, or replacements for "
    "face-to-face examination, standardized assessments, or specialist interpretation."
)

# Curated open-access style references (education / orientation — not exhaustive).
# Evidence-graded key studies (2023-2025) are included for clinician context.
EXTERNAL_VOICE_RESOURCES: list[dict[str, str]] = [
    {
        "label": "NIH · Speech and Language (overview)",
        "url": "https://www.ninds.nih.gov/health-information/disorders/speech-and-language",
    },
    {
        "label": "ASHA · Voice disorders (patient education)",
        "url": "https://www.asha.org/public/speech/voice/",
    },
    {
        "label": "PubMed · Parkinson disease speech (search)",
        "url": "https://pubmed.ncbi.nlm.nih.gov/?term=Parkinson+disease+speech+biomarkers",
    },
    {
        "label": "Cantor-Cutiva et al. · Voice biomarkers in depression — systematic review/meta-analysis (2026)",
        "url": "https://pubmed.ncbi.nlm.nih.gov/?term=Cantor-Cutiva+voice+biomarkers+depression+meta-analysis",
    },
    {
        "label": "Saeedi et al. · Voice of patients with Alzheimer's disease vs healthy controls — meta-analysis (JPAD 2024)",
        "url": "https://pubmed.ncbi.nlm.nih.gov/?term=Saeedi+voice+Alzheimer+meta-analysis+JPAD",
    },
    {
        "label": "Nature npj Parkinson's Disease · Longitudinal voice changes in Parkinson's — 33-month progression study (2025)",
        "url": "https://www.nature.com/npjparkdis/",
    },
    {
        "label": "Parola et al. · Voice abnormalities in schizophrenia — meta-analysis (Nature 2023)",
        "url": "https://pubmed.ncbi.nlm.nih.gov/?term=Parola+voice+schizophrenia+meta-analysis",
    },
    {
        "label": "arXiv 2505.18195v1 · Suicide risk prediction from voice: systematic review and limitations (2025)",
        "url": "https://arxiv.org/abs/2505.18195",
    },
]


def _paper_to_ref(p: Any) -> dict[str, Any]:
    return {
        "paper_id": getattr(p, "paper_id", None),
        "title": getattr(p, "title", None),
        "year": getattr(p, "year", None),
        "journal": getattr(p, "journal", None),
        "pmid": getattr(p, "pmid", None),
        "doi": getattr(p, "doi", None),
        "url": getattr(p, "url", None) or (
            f"https://pubmed.ncbi.nlm.nih.gov/{p.pmid}/" if getattr(p, "pmid", None) else None
        ),
        "relevance_note": getattr(p, "relevance_note", "")[:320],
    }


def build_voice_evidence_pack(
    voice_report: dict[str, Any],
    *,
    patient_id: str,
    db: Session,
    max_targets: int = 3,
) -> dict[str, Any]:
    """Attach ranked literature + disclaimers based on report content."""

    targets: list[tuple[str, str]] = []

    pd = (voice_report.get("pd_voice") or {}) if isinstance(voice_report, dict) else {}
    cog = (voice_report.get("cognitive_speech") or {}) if isinstance(voice_report, dict) else {}
    resp = (voice_report.get("respiratory") or {}) if isinstance(voice_report, dict) else {}

    if pd.get("score") is not None:
        targets.append(("parkinson_voice", ""))
    if cog.get("score") is not None:
        targets.append(("mci_risk", ""))
    if resp.get("score") is not None:
        targets.append(("respiratory_screening", ""))

    # Always include general voice affect linkage for prosody / stress monitoring.
    if not any(t[0] == "voice_affect" for t in targets):
        targets.insert(0, ("voice_affect", ""))

    packs: dict[str, Any] = {}
    for target_name, _ in targets[:max_targets]:
        try:
            q = build_default_query(patient_id, target_name, context_type="biomarker")
            q.feature_summary = _feature_summary_from_report(voice_report)
            result = query_evidence(q, db)
            packs[target_name] = {
                "claim": result.claim,
                "confidence_score": result.confidence_score,
                "literature_summary": result.literature_summary,
                "recommended_caution": result.recommended_caution,
                "supporting_papers": [_paper_to_ref(p) for p in result.supporting_papers[:6]],
                "conflicting_papers": [_paper_to_ref(p) for p in result.conflicting_papers[:3]],
                "provenance": {
                    "corpus": getattr(result.provenance, "corpus", None),
                    "generated_at": getattr(result.provenance, "generated_at", None),
                    "matched_concepts": getattr(result.provenance, "matched_concepts", [])[:12],
                },
            }
        except Exception as exc:  # noqa: BLE001
            _logger.warning("voice evidence query failed for %s: %s", target_name, exc)
            packs[target_name] = {"error": str(exc)}

    return {
        "disclaimer": VOICE_DECISION_SUPPORT_DISCLAIMER,
        "targets_queried": [t[0] for t in targets[:max_targets]],
        "evidence_packs": packs,
        "external_resources": EXTERNAL_VOICE_RESOURCES,
        "internal_corpus_note": (
            "Ranked papers are retrieved from the DeepSynaps embedded literature index "
            "(tens of thousands of curated abstracts); relevance is semantic and heuristic."
        ),
    }


def _feature_summary_from_report(voice_report: dict[str, Any]) -> list[EvidenceFeatureSummary]:
    out: list[EvidenceFeatureSummary] = []
    qc = voice_report.get("qc") or {}
    if qc.get("snr_db") is not None:
        out.append(EvidenceFeatureSummary(name="snr_db", value=qc.get("snr_db"), modality="voice"))
    pd = voice_report.get("pd_voice") or {}
    if pd.get("score") is not None:
        out.append(EvidenceFeatureSummary(name="pd_voice_score", value=pd.get("score"), modality="voice"))
    cog = voice_report.get("cognitive_speech") or {}
    if cog.get("score") is not None:
        out.append(
            EvidenceFeatureSummary(name="cognitive_speech_risk", value=cog.get("score"), modality="voice"),
        )
    return out[:12]


# Evidence-grade mapping for voice/acoustic flag types based on 2023-2025 literature.
# Grades: A=Meta-analysis/SR, B=RCT/Controlled trial, C=Observational, D=Expert opinion.
_VOICE_EVIDENCE_GRADE_MAP: dict[str, dict[str, str]] = {
    "depression": {
        "cpp": "B",
        "speech_rate": "A",
        "pause_duration": "A",
        "f0": "A",
        "jitter": "C",
        "shimmer": "C",
        "hnr": "C",
    },
    "parkinsons": {
        "vowel_articulation": "B",
        "shimmer": "B",
        "nhr": "B",
        "speech_rate": "B",
        "pause_ratio": "B",
    },
    "alzheimers": {
        "speech_rate": "A",
        "articulation_rate": "A",
        "voice_breaks": "A",
        "npvi": "A",
    },
    "schizophrenia": {
        "pause_duration": "A",
        "speech_rate": "A",
        "spoken_time_proportion": "A",
    },
    "anxiety": {
        "f0_slope": "C",
        "pitch_range": "C",
    },
}


def _get_evidence_grade_for_flag(flag_type: str) -> dict[str, Any]:
    """Map a flag type string to its evidence grade based on the research matrix.

    Returns a dict with keys: grade, strength, note. Defaults to grade D when
    the flag type is not found in the matrix.
    """
    flag_lower = flag_type.lower().strip()
    # Direct condition lookups
    for condition, features in _VOICE_EVIDENCE_GRADE_MAP.items():
        if flag_lower in features:
            grade = features[flag_lower]
            strength_note = {
                "A": "Strong — meta-analytic or systematic-review support",
                "B": "Moderate — controlled-trial evidence",
                "C": "Limited — observational or cross-sectional data",
                "D": "Very limited — expert opinion or case series",
            }
            return {
                "grade": grade,
                "strength": strength_note.get(grade, "Unknown"),
                "note": f"Mapped to {condition} evidence matrix",
            }
    # Partial matching for compound flag names
    condition_keywords = {
        "depression": "depression",
        "parkinson": "parkinsons",
        "alzheimer": "alzheimers",
        "cognitive": "alzheimers",
        "dementia": "alzheimers",
        "schizophrenia": "schizophrenia",
        "anxiety": "anxiety",
        "suicide": "anxiety",
    }
    for keyword, condition in condition_keywords.items():
        if keyword in flag_lower:
            return {
                "grade": "D",
                "strength": "Very limited — consult condition-specific evidence",
                "note": f"Flag type '{flag_type}' matched to {condition} category; no specific biomarker grade available",
            }
    return {
        "grade": "D",
        "strength": "Very limited — no evidence mapping available",
        "note": f"Flag type '{flag_type}' not found in evidence matrix (2023-2025)",
    }
