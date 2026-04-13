"""Reviewer/admin endpoints for personalization registry governance (no ranking side effects)."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, Query

from deepsynaps_core_schema import PersonalizationRulesReviewResponse

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.services.clinical_data import load_clinical_dataset
from app.services.personalization_governance import (
    build_personalization_rule_review_snapshot,
    format_personalization_rule_review_report,
)

router = APIRouter(prefix="/api/v1/personalization", tags=["personalization"])


@router.get("/rules/review", response_model=PersonalizationRulesReviewResponse)
def personalization_rules_review(
    view: Literal["snapshot", "report", "both"] = Query(
        "both",
        description=(
            "snapshot: JSON snapshot only (report_text null). "
            "report: snapshot + formatted report text. "
            "both: same as report."
        ),
    ),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> PersonalizationRulesReviewResponse:
    """Deterministic review of personalization_rules.csv (admin-only)."""
    require_minimum_role(
        actor,
        "admin",
        warnings=["Personalization registry review is restricted to admin users."],
    )
    bundle = load_clinical_dataset()
    rules = bundle.tables["personalization_rules"]
    snapshot = build_personalization_rule_review_snapshot(rules)
    want_report = view in ("report", "both")
    report_text = format_personalization_rule_review_report(rules) if want_report else None
    return PersonalizationRulesReviewResponse(snapshot=snapshot, report_text=report_text)
