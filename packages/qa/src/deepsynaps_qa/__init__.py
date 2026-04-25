"""DeepSynaps QA — Artifact completeness scoring engine.

Public surface:
    models   — ArtifactType, CheckSeverity, Verdict, Artifact, QASpec, Check,
               CheckResult, Score, QAResult, QAAuditEntry, DemotionEvent
    engine   — QAEngine
    verdicts — compute_score, compute_verdict
    audit    — emit_audit_record, verify_chain, compute_hash
"""

from __future__ import annotations

__version__ = "0.1.0"

from deepsynaps_qa.models import (
    Artifact,
    ArtifactType,
    Check,
    CheckResult,
    CheckSeverity,
    DemotionEvent,
    QAAuditEntry,
    QAResult,
    QASpec,
    Score,
    Verdict,
)

__all__ = [
    "Artifact",
    "ArtifactType",
    "Check",
    "CheckResult",
    "CheckSeverity",
    "DemotionEvent",
    "QAAuditEntry",
    "QAResult",
    "QASpec",
    "Score",
    "Verdict",
]
