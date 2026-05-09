"""Clinical Agent Brain — Scout-inspired context layer for DeepSynaps AI surfaces.

This module exposes a typed provider registry that AI pages can call to fetch
grounded, role-gated, auditable context before producing clinical output.

It does NOT generate clinical recommendations on its own. It wraps existing
DeepSynaps services (evidence, registries, governance, report templates) with
a uniform safety envelope.

See:
- docs/architecture/deepsynaps-clinical-agent-brain.md
- docs/safety/agent-brain-clinical-safety-policy.md
"""
from app.services.agent_brain.schemas import (
    ProviderManifest,
    ProviderQuery,
    ProviderResponse,
    ProviderStatus,
    ProviderConfidence,
)
from app.services.agent_brain.registry import (
    PROVIDER_REGISTRY,
    list_provider_manifests,
    get_provider,
    overall_status,
)

__all__ = [
    "ProviderManifest",
    "ProviderQuery",
    "ProviderResponse",
    "ProviderStatus",
    "ProviderConfidence",
    "PROVIDER_REGISTRY",
    "list_provider_manifests",
    "get_provider",
    "overall_status",
]
