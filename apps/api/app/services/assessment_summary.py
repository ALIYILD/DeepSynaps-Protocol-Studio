"""Normalized assessment summary service.

Central read layer that AI agents, reports, protocol personalization, and
documents should all use instead of touching AssessmentRecord directly.

Design goals:
    - Clinician-authored truth and AI-generated content stay separated.
    - Severity interpretation is deterministic and shared across callers.
    - All consumers see the same normalized shape, so prompts, reports, and
      protocol ranking cannot drift.

This module is intentionally stateless and depends only on AssessmentRecord
and OutcomeSeries — it does not mutate data.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.persistence.models import AssessmentRecord


# ── Severity rules (server-side mirror of scoring-engine.js) ───────────────
# Keep this in sync with apps/web/src/scoring-engine.js SCORING_RULES.
# Only thresholds are duplicated here; full item definitions remain in the
# authoritative frontend engine / licensed instrument sources.

_BANDS: dict[str, list[tuple[int, str, str]]] = {
    "phq9":   [(4, "Minimal", "minimal"), (9, "Mild", "mild"), (14, "Moderate", "moderate"), (19, "Moderately Severe", "severe"), (27, "Severe", "critical")],
    "phq2":   [(2, "Negative screen", "minimal"), (6, "Positive screen", "moderate")],
    "gad7":   [(4, "Minimal", "minimal"), (9, "Mild", "mild"), (14, "Moderate", "moderate"), (21, "Severe", "severe")],
    "gad2":   [(2, "Negative screen", "minimal"), (6, "Positive screen", "moderate")],
    "pcl5":   [(32, "Below probable PTSD threshold", "mild"), (80, "Probable PTSD", "severe")],
    "isi":    [(7, "No clinically significant insomnia", "minimal"), (14, "Subthreshold insomnia", "mild"), (21, "Moderate clinical insomnia", "moderate"), (28, "Severe clinical insomnia", "severe")],
    "ess":    [(10, "Normal", "minimal"), (15, "Excessive", "moderate"), (24, "Severe", "severe")],
    "hdrs17": [(7, "Normal", "minimal"), (13, "Mild", "mild"), (18, "Moderate", "moderate"), (22, "Severe", "severe"), (52, "Very Severe", "critical")],
    "madrs":  [(6, "Normal", "minimal"), (19, "Mild", "mild"), (34, "Moderate", "moderate"), (60, "Severe", "severe")],
    "ymrs":   [(12, "Remission", "minimal"), (20, "Mild", "mild"), (30, "Moderate", "moderate"), (60, "Severe", "severe")],
    "ybocs":  [(7, "Subclinical", "minimal"), (15, "Mild", "mild"), (23, "Moderate", "moderate"), (31, "Severe", "severe"), (40, "Extreme", "critical")],
    "adhd_rs5": [(16, "Normal", "minimal"), (32, "Moderate", "moderate"), (54, "Severe", "severe")],
    "c_ssrs": [(0, "No Ideation", "minimal"), (1, "Passive ideation", "mild"), (3, "Active ideation", "severe"), (6, "Ideation with plan / behavior", "critical")],
    "dass21": [(14, "Normal", "minimal"), (28, "Moderate", "moderate"), (63, "Severe", "severe")],
    "sf12":   [],  # SF-12 requires norm-based conversion; handled at source.
    "nrs_pain": [(3, "Mild pain", "mild"), (6, "Moderate pain", "moderate"), (10, "Severe pain", "severe")],
    "psqi":  [(5, "Good sleep", "minimal"), (21, "Poor sleep", "moderate")],
    "updrs_motor": [],  # licensed instrument; clinician interpretation only
}

_SEVERITY_ORDER = {"minimal": 0, "mild": 1, "moderate": 2, "severe": 3, "critical": 4}


def _template_key(template_id: str) -> str:
    if not template_id:
        return ""
    return template_id.strip().lower().replace("-", "").replace("_rs_5", "_rs5").replace("_rs-5", "_rs5")


def normalize_assessment_score(template_id: str, score_value: Optional[float]) -> dict[str, Any]:
    """Map (template_id, raw score) → standardized severity record.

    Returns a dict with 'level', 'severity', 'label', 'interpretation'. When
    no band is available, severity defaults to 'unknown'. Safe for unknown
    template_ids.
    """
    if score_value is None:
        return {"level": None, "severity": "unknown", "label": None, "interpretation": None}
    bands = _BANDS.get(_template_key(template_id))
    if not bands:
        return {"level": None, "severity": "unknown", "label": None,
                "interpretation": f"Score {score_value} — interpretation not available in this service."}
    for max_val, label, severity in bands:
        if score_value <= max_val:
            return {"level": severity, "severity": severity, "label": label,
                    "interpretation": f"{label} (score {score_value})"}
    max_val, label, severity = bands[-1]
    return {"level": severity, "severity": severity, "label": label,
            "interpretation": f"{label} (score {score_value})"}


def _parse_score(s: Optional[str]) -> Optional[float]:
    if s is None:
        return None
    try:
        return float(s)
    except (ValueError, TypeError):
        return None


@dataclass
class AssessmentSnapshot:
    id: str
    template_id: str
    template_title: str
    score_numeric: Optional[float]
    severity: str
    severity_label: Optional[str]
    respondent_type: str
    phase: Optional[str]
    completed_at: Optional[str]
    approved_status: str
    is_ai_generated: bool
    clinician_reviewed: bool
    raw_status: str


@dataclass
class AssessmentSummarySnapshot:
    patient_id: str
    assessments: list[AssessmentSnapshot] = field(default_factory=list)
    latest_by_template: dict[str, AssessmentSnapshot] = field(default_factory=dict)
    aggregated_severity: dict[str, str] = field(default_factory=dict)
    highest_severity: str = "unknown"
    snapshot_at: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "patient_id": self.patient_id,
            "snapshot_at": self.snapshot_at,
            "highest_severity": self.highest_severity,
            "aggregated_severity": dict(self.aggregated_severity),
            "latest_by_template": {
                k: _snap_to_dict(v) for k, v in self.latest_by_template.items()
            },
            "assessments": [_snap_to_dict(a) for a in self.assessments],
        }


def _snap_to_dict(s: AssessmentSnapshot) -> dict[str, Any]:
    return {
        "id": s.id,
        "template_id": s.template_id,
        "template_title": s.template_title,
        "score_numeric": s.score_numeric,
        "severity": s.severity,
        "severity_label": s.severity_label,
        "respondent_type": s.respondent_type,
        "phase": s.phase,
        "completed_at": s.completed_at,
        "approved_status": s.approved_status,
        "is_ai_generated": s.is_ai_generated,
        "clinician_reviewed": s.clinician_reviewed,
        "raw_status": s.raw_status,
    }


def _record_to_snapshot(r: AssessmentRecord) -> AssessmentSnapshot:
    score_num = _parse_score(r.score)
    severity = normalize_assessment_score(r.template_id, score_num)
    # Optional new fields may not exist yet on older rows; default safely.
    respondent_type = getattr(r, "respondent_type", None) or "patient"
    phase = getattr(r, "phase", None)
    approved_status = getattr(r, "approved_status", None) or "unreviewed"
    ai_generated_at = getattr(r, "ai_generated_at", None)
    reviewed_by = getattr(r, "reviewed_by", None)
    completed_at = None
    if r.status == "completed" and r.updated_at:
        completed_at = r.updated_at.isoformat()
    return AssessmentSnapshot(
        id=r.id,
        template_id=r.template_id,
        template_title=r.template_title,
        score_numeric=score_num,
        severity=severity["severity"],
        severity_label=severity["label"],
        respondent_type=respondent_type,
        phase=phase,
        completed_at=completed_at,
        approved_status=approved_status,
        is_ai_generated=ai_generated_at is not None,
        clinician_reviewed=reviewed_by is not None,
        raw_status=r.status,
    )


def get_patient_assessment_summary(
    session: Session,
    patient_id: str,
    clinician_id: Optional[str] = None,
) -> AssessmentSummarySnapshot:
    """Return normalized assessment state for one patient.

    Only completed assessments contribute to aggregated_severity; drafts and
    pending assignments are still listed but carry severity='unknown'.
    """
    stmt = select(AssessmentRecord).where(AssessmentRecord.patient_id == patient_id)
    if clinician_id:
        stmt = stmt.where(AssessmentRecord.clinician_id == clinician_id)
    stmt = stmt.order_by(AssessmentRecord.updated_at.desc())
    records = list(session.scalars(stmt).all())

    snaps = [_record_to_snapshot(r) for r in records]
    latest_by_template: dict[str, AssessmentSnapshot] = {}
    for s in snaps:
        # updated_at desc means first occurrence per template is latest
        if s.template_id not in latest_by_template and s.raw_status == "completed":
            latest_by_template[s.template_id] = s

    aggregated = {tid: s.severity for tid, s in latest_by_template.items() if s.severity != "unknown"}
    highest = "unknown"
    highest_ord = -1
    for sev in aggregated.values():
        ord_ = _SEVERITY_ORDER.get(sev, -1)
        if ord_ > highest_ord:
            highest_ord = ord_
            highest = sev

    return AssessmentSummarySnapshot(
        patient_id=patient_id,
        assessments=snaps,
        latest_by_template=latest_by_template,
        aggregated_severity=aggregated,
        highest_severity=highest,
        snapshot_at=datetime.now(timezone.utc).isoformat(),
    )


def extract_ai_assessment_context(
    session: Session,
    patient_id: str,
    template_ids: Optional[list[str]] = None,
    clinician_id: Optional[str] = None,
    max_items_per_template: int = 3,
) -> str:
    """Return a short natural-language snapshot safe for LLM context.

    - Only completed assessments.
    - Scores are paired with clinician-facing severity labels.
    - No copyrighted instrument item text is included.
    - Never includes draft/AI-generated text.
    """
    stmt = select(AssessmentRecord).where(
        AssessmentRecord.patient_id == patient_id,
        AssessmentRecord.status == "completed",
    )
    if clinician_id:
        stmt = stmt.where(AssessmentRecord.clinician_id == clinician_id)
    stmt = stmt.order_by(AssessmentRecord.updated_at.desc())
    records = list(session.scalars(stmt).all())

    by_template: dict[str, list[AssessmentRecord]] = {}
    for r in records:
        if template_ids and r.template_id not in template_ids:
            continue
        by_template.setdefault(r.template_id, []).append(r)

    if not by_template:
        return "No completed assessments on file."

    lines: list[str] = ["Assessment snapshot (clinician-authored; no AI extrapolation):"]
    for tpl_id, rows in by_template.items():
        rows = rows[:max_items_per_template]
        series = []
        latest_label = ""
        for r in rows:
            score = _parse_score(r.score)
            sev = normalize_assessment_score(r.template_id, score)
            when = r.updated_at.strftime("%Y-%m-%d") if r.updated_at else ""
            token = f"{score if score is not None else '?'}"
            if sev["label"]:
                token = f"{score} ({sev['label']})"
            series.append(f"{when} {token}".strip())
            if not latest_label and sev["label"]:
                latest_label = sev["label"]
        title = rows[0].template_title or tpl_id
        lines.append(f"- {title}: {' | '.join(series)}")
    return "\n".join(lines)


def severity_is_at_least(actual: str, threshold: str) -> bool:
    """Compare two severity tokens; unknown severity is treated as 0."""
    return _SEVERITY_ORDER.get(actual, -1) >= _SEVERITY_ORDER.get(threshold, 99)
