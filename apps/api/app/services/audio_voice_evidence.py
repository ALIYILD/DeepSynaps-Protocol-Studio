"""Decision-support evidence attachments for Voice Analyzer reports.

Combines retrieval from the internal evidence corpus (via evidence_intelligence)
with a small set of curated external reference URLs for clinician context.

This is not medical advice or a substitute for clinical judgment.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

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
