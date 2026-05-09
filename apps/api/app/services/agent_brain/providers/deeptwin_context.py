"""DeepTwinContextProvider — DeepTwin engine capability manifest.

The DeepTwin module (`app.services.deeptwin_engine`) exposes per-patient
simulation/causal-hypothesis functions. This provider does NOT call those
patient-bound functions. It only enumerates the available capabilities and
attaches the canonical hypothesis-generating disclaimer so AI surfaces can
introspect "what can DeepTwin do" without ever invoking it for the wrong
actor.
"""
from __future__ import annotations

import importlib
import logging
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.services.agent_brain.providers.base import AgentBrainProvider
from app.services.agent_brain.safety import DEEPTWIN_FALLBACK, safe_fallback
from app.services.agent_brain.schemas import (
    Citation,
    ProviderQuery,
    ProviderResponse,
)

_log = logging.getLogger(__name__)

# Capability names we expect to exist on `app.services.deeptwin_engine`.
# Each entry: (function_name, human description). The provider probes the
# module at runtime and reports which are actually present.
_CAPABILITIES: tuple[tuple[str, str], ...] = (
    ("compute_data_completeness", "Data-completeness scoring per patient."),
    ("build_twin_summary", "Aggregated digital-twin summary."),
    ("build_signal_matrix", "Multi-channel longitudinal signal matrix."),
    ("align_timeline_events", "Timeline alignment of clinical + biometric events."),
    ("detect_correlations", "Cross-channel correlation surfacing."),
    ("generate_causal_hypotheses", "Hypothesis generation — never claims causation."),
    ("estimate_trajectory", "Trajectory projection — uncertainty-flagged."),
    ("simulate_intervention_scenario", "What-if scenario simulation — hypothesis-only."),
    ("generate_clinician_report", "Clinician-facing decision-support report."),
)


class DeepTwinContextProvider(AgentBrainProvider):
    name = "deeptwin_context"
    description = (
        "Enumerates the DeepTwin engine capabilities (function manifest) so "
        "AI surfaces can introspect what's available without invoking "
        "patient-bound functions. Hypothesis-generating only."
    )
    allowed_roles = ["clinician", "reviewer", "admin", "supervisor"]
    contains_phi = False
    can_read = True
    can_write = False
    requires_audit = False
    requires_citations = False
    patient_facing_allowed_default = False

    def _engine_module(self) -> Any | None:
        try:
            return importlib.import_module("app.services.deeptwin_engine")
        except Exception:
            return None

    def is_configured(self) -> bool:
        return self._engine_module() is not None

    def health(self) -> dict[str, Any]:
        mod = self._engine_module()
        present = sum(1 for fn, _ in _CAPABILITIES if mod is not None and hasattr(mod, fn))
        return {
            "name": self.name,
            "status": "ok" if mod is not None else "not_configured",
            "capabilities_present": present,
            "capabilities_total": len(_CAPABILITIES),
        }

    def query(
        self,
        request: ProviderQuery,
        *,
        actor_id: str,
        actor_role: str,
        session: Optional[Session] = None,
    ) -> ProviderResponse:
        mod = self._engine_module()
        if mod is None:
            return safe_fallback(
                provider=self.name,
                query=request.query,
                status="not_configured",
                missing_requirements=["deeptwin_engine_module_not_importable"],
            )

        items: list[dict[str, Any]] = []
        missing: list[str] = []
        for fn_name, description in _CAPABILITIES:
            present = hasattr(mod, fn_name)
            items.append(
                {
                    "type": "deeptwin_capability",
                    "function": fn_name,
                    "description": description,
                    "present": present,
                    "module": "app.services.deeptwin_engine",
                }
            )
            if not present:
                missing.append(f"deeptwin_capability_missing:{fn_name}")

        return ProviderResponse(
            provider=self.name,
            status="ok",
            query=request.query,
            answer=(
                f"{sum(1 for it in items if it['present'])} / {len(items)} "
                "DeepTwin capabilities present in this build. "
                + DEEPTWIN_FALLBACK
            ),
            items=items,
            citations=[
                Citation(
                    source="deeptwin_engine_module",
                    title="app.services.deeptwin_engine capability manifest",
                )
            ],
            source_metadata={"source": "deeptwin_engine introspection"},
            safety_flags=[
                "requires_clinician_review",
                "no_autonomous_diagnosis",
                "hypothesis_generating_only",
                "no_causation_claim",
            ],
            missing_requirements=missing,
            requires_clinician_review=True,
            patient_facing_allowed=False,
            confidence="medium",
        )
