"""Abstract base for Agent Brain providers.

A provider is a small, single-responsibility object that:
1. Declares its safety posture in `manifest()`.
2. Reports its own readiness in `health()`.
3. Answers a `ProviderQuery` in `query()`.

The router enforces `allowed_roles` and writes audit events. Providers must
NEVER fabricate citations, parameters, or clinical claims when the underlying
data is missing — they must return a `safe_fallback` response instead.
"""
from __future__ import annotations

from typing import Any, Optional

from sqlalchemy.orm import Session

from app.services.agent_brain.schemas import (
    ProviderManifest,
    ProviderQuery,
    ProviderResponse,
)


class AgentBrainProvider:
    """Base class. Subclasses set the class-level fields that drive `manifest()`."""

    name: str = ""
    description: str = ""
    allowed_roles: list[str] = ["clinician", "admin", "supervisor"]
    contains_phi: bool = False
    can_read: bool = True
    can_write: bool = False
    requires_audit: bool = False
    requires_citations: bool = False
    patient_facing_allowed_default: bool = False
    safety_policy: str = (
        "Output is decision-support only. Clinician review is required before "
        "use in care."
    )
    citation_policy: str = (
        "Citations are attached only when present in the source data; missing "
        "citations are reported as `missing_requirements`, never fabricated."
    )

    def manifest(self) -> ProviderManifest:
        return ProviderManifest(
            name=self.name,
            description=self.description,
            allowed_roles=list(self.allowed_roles),  # type: ignore[arg-type]
            contains_phi=self.contains_phi,
            can_read=self.can_read,
            can_write=self.can_write,
            requires_audit=self.requires_audit,
            requires_citations=self.requires_citations,
            patient_facing_allowed_default=self.patient_facing_allowed_default,
            configured=self.is_configured(),
            safety_policy=self.safety_policy,
            citation_policy=self.citation_policy,
        )

    # ── Override hooks ────────────────────────────────────────────────────────

    def is_configured(self) -> bool:
        """True if the provider has the data/services it needs to answer.
        Default True for in-repo providers that wrap CSV registries.
        """
        return True

    def health(self) -> dict[str, Any]:
        """Lightweight health check — must not raise. Returns a small dict the
        router exposes via /agent-brain/status."""
        return {"name": self.name, "status": "ok" if self.is_configured() else "not_configured"}

    def query(
        self,
        request: ProviderQuery,
        *,
        actor_id: str,
        actor_role: str,
        session: Optional[Session] = None,
    ) -> ProviderResponse:  # pragma: no cover - abstract
        raise NotImplementedError

    # ── Convenience ───────────────────────────────────────────────────────────

    def role_allowed(self, role: str | None) -> bool:
        if role is None:
            return False
        return role in self.allowed_roles
