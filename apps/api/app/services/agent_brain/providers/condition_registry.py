"""ConditionRegistryProvider — read-only view of curated conditions.

Wraps `app.services.registries.list_conditions` / `get_condition`.
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.services.agent_brain.providers.base import AgentBrainProvider
from app.services.agent_brain.safety import safe_fallback
from app.services.agent_brain.schemas import Citation, ProviderQuery, ProviderResponse

_log = logging.getLogger(__name__)


class ConditionRegistryProvider(AgentBrainProvider):
    name = "condition_registry"
    description = (
        "Curated condition registry: name, category, symptom clusters, common "
        "phenotypes, severity levels, contraindication alerts, and review "
        "status. Read-only."
    )
    allowed_roles = ["guest", "patient", "technician", "reviewer", "clinician", "admin", "supervisor"]
    contains_phi = False
    can_read = True
    can_write = False
    requires_audit = False
    requires_citations = False
    patient_facing_allowed_default = True  # The registry itself contains
    # patient-readable category metadata. Per-row patient-facing decisions still
    # require clinician sign-off — see the safety_flags on every response.

    def is_configured(self) -> bool:
        try:
            from app.services.registries import list_conditions
            list_conditions()
            return True
        except Exception:  # pragma: no cover
            return False

    def query(
        self,
        request: ProviderQuery,
        *,
        actor_id: str,
        actor_role: str,
        session: Optional[Session] = None,
    ) -> ProviderResponse:
        try:
            from app.services.registries import get_condition, list_conditions
        except Exception as exc:
            return safe_fallback(
                provider=self.name,
                query=request.query,
                status="not_configured",
                missing_requirements=[f"registries_unavailable:{type(exc).__name__}"],
            )

        condition_id = (request.context or {}).get("condition_id") or request.condition

        if condition_id:
            row = get_condition(condition_id) if isinstance(condition_id, str) else None
            if row is None:
                # Try a fuzzy lookup by name.
                ql = (str(condition_id) or "").lower()
                row = next(
                    (c for c in list_conditions() if ql and ql in str(c.get("name", "")).lower()),
                    None,
                )
            if row is None:
                return safe_fallback(
                    provider=self.name,
                    query=request.query,
                    status="ok",
                    answer=f"Condition '{condition_id}' was not found in the registry.",
                    safety_flags=["condition_not_found"],
                    missing_requirements=["condition_not_in_registry"],
                )
            return ProviderResponse(
                provider=self.name,
                status="ok",
                query=request.query,
                answer=f"Condition: {row.get('name')} ({row.get('category')}).",
                items=[row],
                citations=[Citation(source="clinical_data_csv", title="conditions.csv")],
                source_metadata={"source": "registries.get_condition"},
                safety_flags=["requires_clinician_review", "no_autonomous_diagnosis"],
                requires_clinician_review=True,
                patient_facing_allowed=False,
                confidence="high",
            )

        # No condition specified — return the full curated list (small, ~30 rows)
        rows = list_conditions()
        ql = (request.query or "").lower()
        if ql:
            rows = [r for r in rows if ql in str(r.get("name", "")).lower()]
        return ProviderResponse(
            provider=self.name,
            status="ok",
            query=request.query,
            answer=f"{len(rows)} condition(s) in registry.",
            items=rows,
            citations=[Citation(source="clinical_data_csv", title="conditions.csv")],
            source_metadata={"source": "registries.list_conditions"},
            safety_flags=["requires_clinician_review", "no_autonomous_diagnosis"],
            requires_clinician_review=True,
            patient_facing_allowed=False,
            confidence="high",
        )
