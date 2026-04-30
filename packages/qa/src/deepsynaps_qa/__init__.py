"""DeepSynaps QA — Artifact completeness scoring engine.

Public surface:
    models     — ArtifactType, CheckSeverity, Verdict, Artifact, QASpec, Check,
                 CheckResult, Score, QAResult, QAAuditEntry, DemotionEvent
    engine     — QAEngine
    verdicts   — compute_score, compute_verdict
    audit      — emit_audit_record, verify_chain, compute_hash
    demotion   — apply_demotion, should_demote
    specs      — SPEC_REGISTRY, get_spec, list_specs, get_spec_for_artifact_type
    checks     — CheckRegistry, BaseCheck, _ensure_checks_imported
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

from deepsynaps_qa.engine import QAEngine
from deepsynaps_qa.audit import emit_audit_record, verify_chain
from deepsynaps_qa.verdicts import compute_score, compute_verdict
from deepsynaps_qa.demotion import apply_demotion, should_demote
from deepsynaps_qa.specs import SPEC_REGISTRY, get_spec, get_spec_for_artifact_type, list_specs
from deepsynaps_qa.checks import BaseCheck, CheckRegistry, _ensure_checks_imported

__all__ = [
    # models
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
    # engine
    "QAEngine",
    # verdicts
    "compute_score",
    "compute_verdict",
    # audit
    "emit_audit_record",
    "verify_chain",
    # demotion
    "apply_demotion",
    "should_demote",
    # specs
    "SPEC_REGISTRY",
    "get_spec",
    "get_spec_for_artifact_type",
    "list_specs",
    # checks
    "BaseCheck",
    "CheckRegistry",
    "_ensure_checks_imported",
]
