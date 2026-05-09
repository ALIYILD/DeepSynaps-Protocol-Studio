"""PatientContextProvider — DISABLED by default.

Even when enabled (env `AGENT_BRAIN_PATIENT_CONTEXT_ENABLED=1`), every read:
- requires `clinician`/`reviewer`/`admin`/`supervisor` role,
- runs through `require_patient_owner` (cross-clinic gate from app.auth),
- writes an audit event via `app.services.agent_brain.audit.record_query`.

The provider returns a compact summary built from existing services/models —
it does NOT denormalize PHI into a new table. The router is responsible for
calling `record_query` BEFORE this provider is asked to do work.
"""
from __future__ import annotations

import logging
import os
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.services.agent_brain.providers.base import AgentBrainProvider
from app.services.agent_brain.safety import safe_fallback
from app.services.agent_brain.schemas import ProviderQuery, ProviderResponse

_log = logging.getLogger(__name__)


def _enabled() -> bool:
    return os.environ.get("AGENT_BRAIN_PATIENT_CONTEXT_ENABLED", "").strip() in {"1", "true", "yes"}


class PatientContextProvider(AgentBrainProvider):
    name = "patient_context"
    description = (
        "Compact patient summary for clinician-side AI surfaces. DISABLED by "
        "default. Every read is role-gated, cross-clinic-checked, and audited."
    )
    allowed_roles = ["clinician", "reviewer", "admin", "supervisor"]
    contains_phi = True
    can_read = True
    can_write = False
    requires_audit = True
    requires_citations = False
    patient_facing_allowed_default = False

    def is_configured(self) -> bool:
        return _enabled()

    def health(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "status": "ok" if _enabled() else "not_configured",
            "enabled": _enabled(),
        }

    def query(
        self,
        request: ProviderQuery,
        *,
        actor_id: str,
        actor_role: str,
        session: Optional[Session] = None,
    ) -> ProviderResponse:
        if not _enabled():
            return safe_fallback(
                provider=self.name,
                query=request.query,
                status="not_configured",
                answer=(
                    "Patient-context provider is disabled in this environment. "
                    "Set AGENT_BRAIN_PATIENT_CONTEXT_ENABLED=1 to enable."
                ),
                missing_requirements=["patient_context_disabled"],
            )

        if actor_role not in self.allowed_roles:
            return safe_fallback(
                provider=self.name,
                query=request.query,
                status="denied",
                answer=(
                    f"Role '{actor_role}' is not permitted to access patient context."
                ),
                safety_flags=["role_not_permitted"],
                missing_requirements=["role_below_clinician"],
            )

        if session is None:
            return safe_fallback(
                provider=self.name,
                query=request.query,
                status="error",
                answer="No DB session available — provider cannot run.",
                missing_requirements=["session_unavailable"],
            )

        if not request.patient_id:
            return safe_fallback(
                provider=self.name,
                query=request.query,
                status="error",
                answer="patient_id is required for patient_context queries.",
                missing_requirements=["patient_id_required"],
            )

        # Cross-clinic gate. We resolve via the existing repository so that
        # every code path sees the same answer.
        try:
            from app.auth import AuthenticatedActor, require_patient_owner
            from app.repositories.patients import resolve_patient_clinic_id

            patient_clinic_id = resolve_patient_clinic_id(session, request.patient_id)
            actor = AuthenticatedActor(
                actor_id=actor_id,
                display_name=actor_id,
                role=actor_role,  # type: ignore[arg-type]
                clinic_id=(request.context or {}).get("actor_clinic_id"),
            )
            require_patient_owner(actor, patient_clinic_id)
        except Exception as exc:
            return safe_fallback(
                provider=self.name,
                query=request.query,
                status="denied",
                answer=f"Cross-clinic access denied: {type(exc).__name__}.",
                safety_flags=["cross_clinic_denied"],
                missing_requirements=["cross_clinic_gate"],
            )

        # Compact, non-narrative summary. We deliberately do NOT pull free-text
        # notes here — only structured fields the existing patient summary
        # service already publishes.
        try:
            from app.services.patient_context import build_patient_context_summary
            summary = build_patient_context_summary(session, request.patient_id)
        except Exception:
            summary = {
                "patient_id": request.patient_id,
                "clinic_id": patient_clinic_id,
                "note": (
                    "patient_context summary service not available; returning "
                    "minimal record."
                ),
            }

        return ProviderResponse(
            provider=self.name,
            status="ok",
            query=request.query,
            answer="Patient context summary loaded under cross-clinic gate.",
            items=[summary],
            source_metadata={"source": "patient_context.build_patient_context_summary"},
            safety_flags=["contains_phi", "audit_recorded"],
            requires_clinician_review=True,
            patient_facing_allowed=False,
            confidence="medium",
        )
