"""Repository for Risk Analyzer audit access used by the Risk Analyzer router.

Per Architect Rec #8 PR-A: routers MUST go through ``app.repositories`` rather
than importing models from ``app.persistence.models`` directly. This module
wraps the small audit-listing surface the Risk Analyzer router needs.
"""

from __future__ import annotations

from typing import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.persistence.models import RiskAnalyzerAudit, RiskStratificationAudit


def list_recent_risk_analyzer_audit(
    session: Session, *, patient_id: str, limit: int = 80
) -> Sequence[RiskAnalyzerAudit]:
    """Return the most recent RiskAnalyzerAudit rows for ``patient_id``."""
    return (
        session.execute(
            select(RiskAnalyzerAudit)
            .where(RiskAnalyzerAudit.patient_id == patient_id)
            .order_by(RiskAnalyzerAudit.created_at.desc())
            .limit(limit)
        )
        .scalars()
        .all()
    )


def list_recent_risk_stratification_audit(
    session: Session, *, patient_id: str, limit: int
) -> Sequence[RiskStratificationAudit]:
    """Return the most recent RiskStratificationAudit rows for ``patient_id``."""
    return (
        session.execute(
            select(RiskStratificationAudit)
            .where(RiskStratificationAudit.patient_id == patient_id)
            .order_by(RiskStratificationAudit.created_at.desc())
            .limit(limit)
        )
        .scalars()
        .all()
    )
