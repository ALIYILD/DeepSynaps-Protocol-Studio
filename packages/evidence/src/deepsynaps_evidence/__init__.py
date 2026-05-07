"""DeepSynaps Evidence Citation Validator.

Validates clinical claims against the 87,654-paper pgvector corpus,
assigns GRADE-informed evidence scores, enriches the EEG-MedRAG
hypergraph, and maintains a SHA-256 hash-chained audit trail.
"""
from __future__ import annotations

from typing import Any

from deepsynaps_evidence.schemas import (
    Citation,
    CitationType,
    Claim,
    ConfidenceLabel,
    EvidenceGrade,
    IssueSeverity,
    IssueType,
    ValidationIssue,
    ValidationRequest,
    ValidationResult,
)
from deepsynaps_evidence.score_response import (
    Caution,
    ConfidenceBand,
    EvidenceRef,
    MethodProvenance,
    ScoreResponse,
    ScoreScale,
    TopContributor,
    cap_confidence,
    hash_inputs,
)
from deepsynaps_evidence.scoring import assign_grade


def grade_evidence(*args: Any, **kwargs: Any) -> str:
    """Backward-compatible evidence-grade shim.

    qEEG currently probes for ``deepsynaps_evidence.grade_evidence`` to decide
    whether the evidence layer is available. The modern package exports the
    lower-level ``assign_grade`` helper instead, so we provide a thin alias to
    keep older callers import-compatible.
    """
    return assign_grade(*args, **kwargs)


def search_papers(query_text: str, limit: int = 3) -> list[dict[str, Any]]:
    """Best-effort text search shim for older qEEG callers.

    Returns a lightweight citation dict list. If the application DB or paper
    corpus is unavailable, degrade to ``[]`` instead of raising.
    """
    if not query_text or not query_text.strip():
        return []
    try:
        from app.database import SessionLocal  # type: ignore[import-not-found]
        from deepsynaps_evidence import corpus_adapter
    except Exception:
        return []

    session = SessionLocal()
    try:
        hits = corpus_adapter.find_similar_text(session, query_text, top_k=limit)
    except Exception:
        return []
    finally:
        try:
            session.close()
        except Exception:
            pass

    out: list[dict[str, Any]] = []
    for hit in hits or []:
        out.append(
            {
                "title": getattr(hit, "title", None),
                "url": getattr(hit, "url", None),
                "pmid": getattr(hit, "pmid", None),
                "year": getattr(hit, "year", None),
                "evidence_level": getattr(hit, "evidence_grade", None),
            }
        )
    return out

__all__ = [
    "Caution",
    "Citation",
    "CitationType",
    "Claim",
    "ConfidenceBand",
    "ConfidenceLabel",
    "EvidenceGrade",
    "EvidenceRef",
    "IssueSeverity",
    "IssueType",
    "MethodProvenance",
    "ScoreResponse",
    "ScoreScale",
    "TopContributor",
    "ValidationIssue",
    "ValidationRequest",
    "ValidationResult",
    "grade_evidence",
    "search_papers",
    "cap_confidence",
    "hash_inputs",
]
