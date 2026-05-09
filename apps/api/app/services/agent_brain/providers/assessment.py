"""AssessmentProvider — curated assessment-instrument catalog.

Loads `data/imports/clinical-database/assessments.csv` (≈42 instruments — PHQ-9,
GAD-7, BDI-II, YBOCS, MoCA, etc.) via the existing CSV reader and exposes a
filterable catalog. Each row carries: id, name, type, domain, use case,
population, link, license, scoring type, clinician/patient self-report,
related conditions, related phenotypes.

Read-only. Never fabricates a clinical instrument.
"""
from __future__ import annotations

import logging
from functools import lru_cache
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.services.agent_brain.providers.base import AgentBrainProvider
from app.services.agent_brain.safety import safe_fallback
from app.services.agent_brain.schemas import (
    Citation,
    ProviderQuery,
    ProviderResponse,
)

_log = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _load_assessments() -> list[dict[str, str]]:
    from app.services.clinical_data import _read_csv_records
    from app.settings import CLINICAL_DATA_ROOT

    return _read_csv_records(CLINICAL_DATA_ROOT / "assessments.csv")


def _normalize(row: dict[str, str]) -> dict[str, Any]:
    return {
        "id": row.get("Assessment_ID", ""),
        "name": row.get("Assessment_Name", ""),
        "type": row.get("Assessment_Type", ""),
        "domain": row.get("Domain", ""),
        "use_case": row.get("Use_Case", ""),
        "population": row.get("Population", ""),
        "link_url": row.get("Link_URL", ""),
        "license_or_access_notes": row.get("License_or_Access_Notes", ""),
        "scoring_type": row.get("Scoring_Type", ""),
        "clinician_vs_patient": row.get("Clinician_vs_Patient", ""),
        "related_conditions": row.get("Related_Conditions", ""),
        "related_phenotypes": row.get("Related_Phenotypes", ""),
        "notes": row.get("Notes", ""),
        "review_status": row.get("Review_Status", ""),
    }


class AssessmentProvider(AgentBrainProvider):
    name = "assessment"
    description = (
        "Curated assessment-instrument catalog (≈42 instruments — PHQ-9, "
        "GAD-7, BDI-II, MoCA, YBOCS, etc.) sourced from "
        "data/imports/clinical-database/assessments.csv. Read-only."
    )
    allowed_roles = ["technician", "reviewer", "clinician", "admin", "supervisor"]
    contains_phi = False
    can_read = True
    can_write = False
    requires_audit = False
    requires_citations = False
    patient_facing_allowed_default = True

    def is_configured(self) -> bool:
        try:
            return len(_load_assessments()) > 0
        except Exception:  # pragma: no cover
            return False

    def health(self) -> dict[str, Any]:
        try:
            count = len(_load_assessments())
        except Exception:
            count = 0
        return {
            "name": self.name,
            "status": "ok" if count > 0 else "not_configured",
            "instrument_count": count,
        }

    def query(
        self,
        request: ProviderQuery,
        *,
        actor_id: str,
        actor_role: str,
        session: Optional[Session] = None,
    ) -> ProviderResponse:
        try:
            rows = [_normalize(r) for r in _load_assessments()]
        except Exception as exc:
            return safe_fallback(
                provider=self.name,
                query=request.query,
                status="not_configured",
                missing_requirements=[f"assessments_csv_unavailable:{type(exc).__name__}"],
            )

        if not rows:
            return safe_fallback(
                provider=self.name,
                query=request.query,
                status="not_configured",
                missing_requirements=["assessments_csv_empty"],
            )

        ql = (request.query or "").lower()
        cl = (request.condition or "").lower()
        if ql or cl:
            def _match(r: dict) -> bool:
                blob = " ".join(
                    str(r.get(k, "") or "")
                    for k in (
                        "id",
                        "name",
                        "domain",
                        "use_case",
                        "related_conditions",
                        "related_phenotypes",
                    )
                ).lower()
                return (ql and ql in blob) or (cl and cl in blob)

            rows = [r for r in rows if _match(r)]

        return ProviderResponse(
            provider=self.name,
            status="ok",
            query=request.query,
            answer=(
                f"{len(rows)} assessment instrument(s) in catalog. Clinician "
                "review required before scoring is used in care."
            ),
            items=rows,
            citations=[Citation(source="clinical_data_csv", title="assessments.csv")],
            source_metadata={"source": "agent_brain.assessment.csv_catalog"},
            safety_flags=[
                "requires_clinician_review",
                "no_autonomous_diagnosis",
                "decision_support_only",
            ],
            requires_clinician_review=True,
            patient_facing_allowed=False,
            confidence="high",
        )
