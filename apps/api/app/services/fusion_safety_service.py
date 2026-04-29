"""Fusion safety gates — pre-generation checks before creating a FusionCase.

All checks are deterministic and require no external packages.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.persistence.models import (
    MriAnalysis,
    QEEGAnalysis,
    QEEGAIReport,
)

logger = logging.getLogger(__name__)


@dataclass
class FusionSafetyBlock:
    blocked: bool = False
    reasons: list[str] = field(default_factory=list)
    next_steps: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def _load_json(raw: str | None) -> Any:
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return None


def _check_red_flags(
    analysis: QEEGAnalysis | MriAnalysis,
    source: str,
) -> list[str]:
    """Return block reasons for unreviewed CRITICAL / BLOCKS_EXPORT red flags."""
    reasons: list[str] = []
    cockpit = _load_json(getattr(analysis, "safety_cockpit_json", None)) or {}
    red_flags = cockpit.get("red_flags", [])
    # Also check standalone red_flags_json if present
    standalone = _load_json(getattr(analysis, "red_flags_json", None))
    if isinstance(standalone, list):
        red_flags.extend(standalone)
    elif isinstance(standalone, dict) and "flags" in standalone:
        red_flags.extend(standalone["flags"])

    for flag in red_flags:
        if not isinstance(flag, dict):
            continue
        severity = flag.get("severity", "").lower()
        resolved = flag.get("resolved", False)
        code = flag.get("code", "UNKNOWN")
        if severity in ("critical", "blocks_export") and not resolved:
            reasons.append(
                f"{source} red flag '{code}' is critical and unresolved. "
                f"Resolve before fusion."
            )
    return reasons


def _check_radiology_review(mri: MriAnalysis | None) -> list[str]:
    """Return block reasons if MRI radiology review is required and unresolved."""
    reasons: list[str] = []
    if mri is None:
        return reasons
    cockpit = _load_json(mri.safety_cockpit_json) or {}
    red_flags = cockpit.get("red_flags", [])
    for flag in red_flags:
        if isinstance(flag, dict) and flag.get("code") == "RADIOLOGY_REVIEW_REQUIRED":
            if not flag.get("resolved", False):
                reasons.append(
                    "MRI radiology review is required and unresolved. "
                    "Complete radiology review before fusion."
                )
    return reasons


def _check_report_state(
    analysis: QEEGAnalysis | MriAnalysis | None,
    source: str,
    ai_report: QEEGAIReport | None = None,
) -> list[str]:
    """Return warnings if source analysis report is in DRAFT_AI state only."""
    warnings: list[str] = []
    if analysis is None:
        return warnings

    if source == "qEEG" and ai_report is not None:
        state = ai_report.report_state
    elif source == "MRI":
        state = getattr(analysis, "report_state", None) or "MRI_DRAFT_AI"
    else:
        return warnings

    if state in ("DRAFT_AI", "MRI_DRAFT_AI"):
        warnings.append(
            f"{source} analysis is in DRAFT_AI state and has not been clinically reviewed. "
            f"Fusion will include this as a limitation."
        )
    return warnings


def _check_recency(
    analysis: QEEGAnalysis | MriAnalysis | None,
    source: str,
    max_days: int = 180,
) -> list[str]:
    """Return warnings if analysis data is older than max_days."""
    warnings: list[str] = []
    if analysis is None:
        return warnings

    # Use analyzed_at for qEEG, created_at for MRI
    ts = getattr(analysis, "analyzed_at", None) or getattr(analysis, "created_at", None)
    if ts is None:
        return warnings

    now = datetime.now(timezone.utc)
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    age = now - ts
    if age > timedelta(days=max_days):
        warnings.append(
            f"{source} analysis is {age.days} days old (older than {max_days} days). "
            f"Consider re-acquiring data for the most accurate fusion."
        )
    return warnings


def run_safety_gates(
    db: Session,
    qeeg: QEEGAnalysis | None,
    mri: MriAnalysis | None,
    max_days: int = 180,
) -> FusionSafetyBlock:
    """Run all pre-generation safety gates.

    Returns a FusionSafetyBlock. If ``blocked`` is True, fusion case
    creation must be rejected. ``warnings`` are non-blocking advisories.
    """
    block = FusionSafetyBlock()

    # ── Red flags ──
    if qeeg is not None:
        block.reasons.extend(_check_red_flags(qeeg, "qEEG"))
    if mri is not None:
        block.reasons.extend(_check_red_flags(mri, "MRI"))

    # ── Radiology review ──
    block.reasons.extend(_check_radiology_review(mri))

    # ── Report state warnings ──
    qeeg_ai_report = None
    if qeeg is not None:
        qeeg_ai_report = (
            db.query(QEEGAIReport)
            .filter_by(analysis_id=qeeg.id)
            .order_by(QEEGAIReport.created_at.desc())
            .first()
        )
    block.warnings.extend(_check_report_state(qeeg, "qEEG", qeeg_ai_report))
    block.warnings.extend(_check_report_state(mri, "MRI"))

    # ── Recency warnings ──
    block.warnings.extend(_check_recency(qeeg, "qEEG", max_days))
    block.warnings.extend(_check_recency(mri, "MRI", max_days))

    if block.reasons:
        block.blocked = True
        block.next_steps = [
            "Review and resolve all blocking red flags in the source analyses.",
            "Complete required radiology review if applicable.",
            "Re-run safety checks after resolution.",
        ]

    return block
