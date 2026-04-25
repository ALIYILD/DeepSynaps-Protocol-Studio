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

__all__ = [
    "Citation",
    "CitationType",
    "Claim",
    "ConfidenceLabel",
    "EvidenceGrade",
    "IssueSeverity",
    "IssueType",
    "ValidationIssue",
    "ValidationRequest",
    "ValidationResult",
]
