"""Placeholder providers for AI surfaces whose backends are not wired into
the agent-brain layer yet (qEEG knowledge, MRI knowledge, DeepTwin context,
video/audio analysis, biomarker, assessment).

Each placeholder returns `status: "not_configured"` with the canonical
`NOT_CONFIGURED_FALLBACK` message — never fabricated content. The point of
exposing them through the registry now is so AI pages can introspect and
render an honest "not yet wired" pill rather than guessing.

The relevant backend services already exist in this repo (qeeg_pipeline,
mri_pipeline, deeptwin_engine, audio_pipeline, biometrics, assessment_*),
but wiring them through the agent-brain envelope is a follow-up PR.
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from app.services.agent_brain.providers.base import AgentBrainProvider
from app.services.agent_brain.safety import safe_fallback
from app.services.agent_brain.schemas import ProviderQuery, ProviderResponse


class _NotConfiguredPlaceholder(AgentBrainProvider):
    """Common base — placeholder providers all behave the same way."""

    can_read = True
    can_write = False
    requires_audit = False
    requires_citations = False
    patient_facing_allowed_default = False
    contains_phi = False  # placeholders never see PHI by definition

    def is_configured(self) -> bool:
        return False

    def query(
        self,
        request: ProviderQuery,
        *,
        actor_id: str,
        actor_role: str,
        session: Optional[Session] = None,
    ) -> ProviderResponse:
        return safe_fallback(
            provider=self.name,
            query=request.query,
            status="not_configured",
            missing_requirements=[f"{self.name}_provider_not_wired"],
        )


class QEEGKnowledgeProvider(_NotConfiguredPlaceholder):
    name = "qeeg_knowledge"
    description = (
        "qEEG knowledge facets (band powers, atlas regions, biomarker "
        "definitions). Backend exists in app.services.qeeg_*; agent-brain "
        "wiring is pending."
    )
    allowed_roles = ["clinician", "reviewer", "admin", "supervisor"]


class MRIKnowledgeProvider(_NotConfiguredPlaceholder):
    name = "mri_knowledge"
    description = (
        "MRI atlas/knowledge facets. Backend exists in app.services.mri_*; "
        "agent-brain wiring is pending."
    )
    allowed_roles = ["clinician", "reviewer", "admin", "supervisor"]


class DeepTwinContextProvider(_NotConfiguredPlaceholder):
    name = "deeptwin_context"
    description = (
        "Hypothesis-generating DeepTwin simulation context. Backend exists "
        "in app.services.deeptwin_*; agent-brain wiring is pending."
    )
    allowed_roles = ["clinician", "reviewer", "admin", "supervisor"]


class VideoAudioAnalysisProvider(_NotConfiguredPlaceholder):
    name = "video_audio_analysis"
    description = (
        "Video/audio analysis facets. Backend exists in app.services."
        "audio_pipeline / movement_analyzer; agent-brain wiring is pending."
    )
    allowed_roles = ["clinician", "reviewer", "admin", "supervisor"]


class BiomarkerProvider(_NotConfiguredPlaceholder):
    name = "biomarker"
    description = (
        "Biomarker facets. Backend exists in app.services.biometrics_*; "
        "agent-brain wiring is pending."
    )
    allowed_roles = ["clinician", "reviewer", "admin", "supervisor"]


class AssessmentProvider(_NotConfiguredPlaceholder):
    name = "assessment"
    description = (
        "Assessment instrument metadata. Backend exists in app.services."
        "assessment_*; agent-brain wiring is pending."
    )
    allowed_roles = ["technician", "reviewer", "clinician", "admin", "supervisor"]
