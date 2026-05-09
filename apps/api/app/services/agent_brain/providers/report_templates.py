"""ReportTemplateProvider — exposes available report/handbook structures.

Reads from two existing template surfaces:
- `qeeg_report_template.QEEGBrainMapReport` — canonical qEEG report contract
  (per repo memory: `deepsynaps-qeeg-brain-map-contract.md`).
- `services.generation` for handbook/report templates exposed via the
  existing handbook generator. We only enumerate template *names* and
  *sections* — the provider does not generate clinical text. Generation
  remains the responsibility of the existing `generate_handbook` path,
  which has its own clinician review semantics.
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.services.agent_brain.providers.base import AgentBrainProvider
from app.services.agent_brain.safety import safe_fallback
from app.services.agent_brain.schemas import Citation, ProviderQuery, ProviderResponse

_log = logging.getLogger(__name__)


class ReportTemplateProvider(AgentBrainProvider):
    name = "report_templates"
    description = (
        "Enumerates the available report/handbook template names and section "
        "structure (e.g. qEEG brain-map report, handbook generator). Does "
        "not generate clinical text on its own."
    )
    allowed_roles = ["clinician", "reviewer", "admin", "supervisor"]
    contains_phi = False
    can_read = True
    can_write = False
    requires_audit = False
    requires_citations = False
    patient_facing_allowed_default = False

    def is_configured(self) -> bool:
        try:
            import importlib
            importlib.import_module("app.services.qeeg_report_template")
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
        items: list[dict[str, Any]] = []
        missing: list[str] = []

        # qEEG brain-map report contract.
        try:
            from app.services import qeeg_report_template

            sections: list[str] = []
            for attr in (
                "ReportHeader",
                "Indicators",
                "LobeBreakdown",
                "BrainFunctionScore",
                "ROIZScore",
                "SourceMap",
                "DKRegion",
            ):
                if hasattr(qeeg_report_template, attr):
                    sections.append(attr)
            items.append(
                {
                    "template_id": "qeeg_brain_map_report",
                    "name": "qEEG Brain Map Report",
                    "module": "app.services.qeeg_report_template",
                    "sections": sections,
                    "patient_facing_allowed": False,
                    "clinician_review_required": True,
                    "notes": (
                        "Canonical contract — see "
                        "docs reference: deepsynaps-qeeg-brain-map-contract."
                    ),
                }
            )
        except Exception as exc:  # pragma: no cover - defensive
            missing.append(f"qeeg_template_unavailable:{type(exc).__name__}")

        # Handbook generator (read-only listing; generation goes through the
        # existing handbook router and carries its own clinician-review flow).
        try:
            from app.services import generation  # noqa: F401

            items.append(
                {
                    "template_id": "handbook_generate",
                    "name": "Handbook Generate (modality+protocol+device)",
                    "module": "app.services.generation",
                    "endpoint": "/api/v1/handbooks/generate",
                    "patient_facing_allowed": False,
                    "clinician_review_required": True,
                    "notes": (
                        "Generation must go through the existing handbook "
                        "router; this provider only enumerates the template."
                    ),
                }
            )
        except Exception as exc:  # pragma: no cover
            missing.append(f"handbook_generation_unavailable:{type(exc).__name__}")

        if not items:
            return safe_fallback(
                provider=self.name,
                query=request.query,
                status="not_configured",
                missing_requirements=missing or ["no_templates_available"],
            )

        return ProviderResponse(
            provider=self.name,
            status="ok",
            query=request.query,
            answer=f"{len(items)} report template(s) available.",
            items=items,
            citations=[Citation(source="qeeg_report_template", title="QEEGBrainMapReport contract")],
            source_metadata={"source": "agent_brain.report_templates"},
            safety_flags=[
                "requires_clinician_review",
                "no_autonomous_diagnosis",
                "templates_only_no_generation",
            ],
            missing_requirements=missing,
            requires_clinician_review=True,
            patient_facing_allowed=False,
            confidence="high",
        )
