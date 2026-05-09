"""Provider registry for the Clinical Agent Brain.

Process-wide singleton that maps `provider name → AgentBrainProvider instance`.
Imported by the router and tests.

Adding a new provider is two lines: import it and add it to `_PROVIDERS`.
The registry deliberately does NOT auto-discover, so every provider in scope
is reviewable from this single file.
"""
from __future__ import annotations

from typing import Iterable

from app.services.agent_brain.providers.agent_memory import AgentMemoryProvider
from app.services.agent_brain.providers.assessment import AssessmentProvider
from app.services.agent_brain.providers.biomarker import BiomarkerProvider
from app.services.agent_brain.providers.deeptwin_context import DeepTwinContextProvider
from app.services.agent_brain.providers.mri_knowledge import MRIKnowledgeProvider
from app.services.agent_brain.providers.qeeg_knowledge import QEEGKnowledgeProvider
from app.services.agent_brain.providers.video_audio_analysis import VideoAudioAnalysisProvider
from app.services.agent_brain.providers.base import AgentBrainProvider
from app.services.agent_brain.providers.condition_registry import ConditionRegistryProvider
from app.services.agent_brain.providers.device_registry import DeviceRegistryProvider
from app.services.agent_brain.providers.evidence import EvidenceProvider
from app.services.agent_brain.providers.patient_context import PatientContextProvider
from app.services.agent_brain.providers.protocol_governance import ProtocolGovernanceProvider
from app.services.agent_brain.providers.report_templates import ReportTemplateProvider
from app.services.agent_brain.schemas import ProviderManifest


def _build_registry() -> dict[str, AgentBrainProvider]:
    providers: list[AgentBrainProvider] = [
        # MVP — wired to existing services.
        EvidenceProvider(),
        ProtocolGovernanceProvider(),
        ConditionRegistryProvider(),
        DeviceRegistryProvider(),
        ReportTemplateProvider(),
        AgentMemoryProvider(),
        # Gated, off-by-default.
        PatientContextProvider(),
        # Placeholders — return not_configured.
        QEEGKnowledgeProvider(),
        MRIKnowledgeProvider(),
        DeepTwinContextProvider(),
        VideoAudioAnalysisProvider(),
        BiomarkerProvider(),
        AssessmentProvider(),
    ]
    return {p.name: p for p in providers}


PROVIDER_REGISTRY: dict[str, AgentBrainProvider] = _build_registry()

# Names that the spec calls "MVP providers" — the six wired-to-existing-services
# entries. Used by tests and by the page-provider map.
MVP_PROVIDER_NAMES: tuple[str, ...] = (
    "evidence",
    "protocol_governance",
    "condition_registry",
    "device_registry",
    "report_templates",
    "agent_memory",
)


def list_provider_manifests() -> list[ProviderManifest]:
    return [p.manifest() for p in PROVIDER_REGISTRY.values()]


def get_provider(name: str) -> AgentBrainProvider | None:
    return PROVIDER_REGISTRY.get(name)


def overall_status() -> dict[str, object]:
    healths = [p.health() for p in PROVIDER_REGISTRY.values()]
    configured = sum(1 for p in PROVIDER_REGISTRY.values() if p.is_configured())
    return {
        "service": "clinical_agent_brain",
        "version": "0.1.0",
        "providers_total": len(PROVIDER_REGISTRY),
        "providers_configured": configured,
        "providers_mvp": list(MVP_PROVIDER_NAMES),
        "safety_mode": "strict_clinical",
        "providers": healths,
    }


def reset_registry_for_tests() -> None:
    """Rebuild the registry. Useful for tests that toggle env flags between
    cases (e.g. AGENT_BRAIN_MEMORY_ALLOW_WRITES) and need fresh provider
    instances."""
    global PROVIDER_REGISTRY
    PROVIDER_REGISTRY = _build_registry()
