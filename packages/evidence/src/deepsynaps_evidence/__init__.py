"""DeepSynaps Evidence Citation Validator.

Validates clinical claims against the 87,654-paper pgvector corpus,
assigns GRADE-informed evidence scores, enriches the EEG-MedRAG
hypergraph, and maintains a SHA-256 hash-chained audit trail.
"""
from __future__ import annotations

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
    "cap_confidence",
    "hash_inputs",
]
