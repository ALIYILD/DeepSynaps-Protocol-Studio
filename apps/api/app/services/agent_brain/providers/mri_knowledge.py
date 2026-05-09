"""MRIKnowledgeProvider — atlas regions + MRI pipeline availability probe.

Wraps `app.services.brain_regions.list_brain_regions` (modality-neutral atlas;
each row tags `targetable_modalities` so MRI-relevant regions are
identifiable). Reports whether the heavy `app.services.mri_pipeline` is
importable so callers can distinguish "atlas reference present" from
"MRI pipeline available". Never fabricates atlas data.
"""
from __future__ import annotations

import importlib
import logging
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.services.agent_brain.providers.base import AgentBrainProvider
from app.services.agent_brain.safety import (
    QEEG_MRI_VIDEO_AUDIO_FALLBACK,
    safe_fallback,
)
from app.services.agent_brain.schemas import (
    Citation,
    ProviderQuery,
    ProviderResponse,
)

_log = logging.getLogger(__name__)


class MRIKnowledgeProvider(AgentBrainProvider):
    name = "mri_knowledge"
    description = (
        "Curated brain-region atlas (modality-neutral; rows tag MRI-relevant "
        "regions and target modalities). Probes the MRI pipeline module to "
        "report whether processing capabilities are available. Read-only."
    )
    allowed_roles = ["clinician", "reviewer", "technician", "admin", "supervisor"]
    contains_phi = False
    can_read = True
    can_write = False
    requires_audit = False
    requires_citations = False
    patient_facing_allowed_default = False

    def is_configured(self) -> bool:
        try:
            from app.services.brain_regions import list_brain_regions
            list_brain_regions()
            return True
        except Exception:  # pragma: no cover
            return False

    def health(self) -> dict[str, Any]:
        pipeline_present = False
        try:
            importlib.import_module("app.services.mri_pipeline")
            pipeline_present = True
        except Exception:
            pipeline_present = False
        return {
            "name": self.name,
            "status": "ok" if self.is_configured() else "not_configured",
            "atlas": "available",
            "mri_pipeline": "available" if pipeline_present else "missing",
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
            from app.services.brain_regions import list_brain_regions
        except Exception as exc:
            return safe_fallback(
                provider=self.name,
                query=request.query,
                status="not_configured",
                missing_requirements=[f"brain_regions_service_unavailable:{type(exc).__name__}"],
            )

        payload = list_brain_regions()
        rows = [
            r.model_dump() if hasattr(r, "model_dump") else dict(r)
            for r in (payload.items if hasattr(payload, "items") else [])
        ]

        ql = (request.query or "").lower()
        cl = (request.condition or "").lower()
        if ql or cl:
            def _match(r: dict) -> bool:
                blob = " ".join(
                    str(r.get(k, "") or "")
                    for k in (
                        "name",
                        "abbreviation",
                        "lobe",
                        "primary_functions",
                        "key_conditions",
                        "targetable_modalities",
                        "brodmann_area",
                    )
                ).lower()
                return (ql and ql in blob) or (cl and cl in blob)

            rows = [r for r in rows if _match(r)]

        rows = rows[:80]

        pipeline_present = True
        try:
            importlib.import_module("app.services.mri_pipeline")
        except Exception:
            pipeline_present = False

        missing: list[str] = []
        if not pipeline_present:
            missing.append("mri_pipeline_module_not_importable")

        if not rows:
            return safe_fallback(
                provider=self.name,
                query=request.query,
                status="ok",
                answer=(
                    "No matching atlas region in the curated registry. "
                    + QEEG_MRI_VIDEO_AUDIO_FALLBACK
                ),
                missing_requirements=missing + ["no_atlas_match"],
                confidence="unknown",
            )

        return ProviderResponse(
            provider=self.name,
            status="ok",
            query=request.query,
            answer=(
                f"{len(rows)} atlas region(s) returned. "
                + QEEG_MRI_VIDEO_AUDIO_FALLBACK
            ),
            items=rows,
            citations=[Citation(source="clinical_data_csv", title="brain_regions.csv")],
            source_metadata={
                "source": "brain_regions.list_brain_regions",
                "mri_pipeline_available": pipeline_present,
            },
            safety_flags=[
                "requires_clinician_review",
                "no_autonomous_diagnosis",
                "decision_support_only",
                *(["mri_pipeline_unavailable"] if not pipeline_present else []),
            ],
            missing_requirements=missing,
            requires_clinician_review=True,
            patient_facing_allowed=False,
            confidence="high",
        )
