"""AgentMemoryProvider — small, in-process operational notes store.

**Disabled by default**. Even when enabled, it:
- Rejects payloads that look like PHI (heuristic key-name check).
- Stores only per-process, in-memory notes (no DB write surface in MVP).
- Refuses writes from anyone below `clinician` unless the env override
  `AGENT_BRAIN_MEMORY_ALLOW_WRITES=1` is set AND the actor's role is in
  `allowed_roles`.

This is intentionally minimal. The point is to give Hermes / future agents a
*safe* place to drop operational notes without ever leaking patient context
into a clinical surface.
"""
from __future__ import annotations

import logging
import os
import threading
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.services.agent_brain.providers.base import AgentBrainProvider
from app.services.agent_brain.safety import looks_like_phi, safe_fallback
from app.services.agent_brain.schemas import ProviderQuery, ProviderResponse

_log = logging.getLogger(__name__)


def _writes_enabled() -> bool:
    return os.environ.get("AGENT_BRAIN_MEMORY_ALLOW_WRITES", "").strip() in {"1", "true", "yes"}


class AgentMemoryProvider(AgentBrainProvider):
    name = "agent_memory"
    description = (
        "Small in-process operational notes store. Disabled by default. "
        "Rejects PHI-shaped payloads. No DB persistence in MVP."
    )
    allowed_roles = ["clinician", "admin", "supervisor"]
    contains_phi = False
    can_read = True
    can_write = True
    requires_audit = True
    requires_citations = False
    patient_facing_allowed_default = False

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._notes: list[dict[str, Any]] = []

    def is_configured(self) -> bool:
        return _writes_enabled()

    def health(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "status": "ok" if _writes_enabled() else "not_configured",
            "writes_enabled": _writes_enabled(),
            "note_count": len(self._notes),
        }

    # ── Read (query) ──────────────────────────────────────────────────────────

    def query(
        self,
        request: ProviderQuery,
        *,
        actor_id: str,
        actor_role: str,
        session: Optional[Session] = None,
    ) -> ProviderResponse:
        if not _writes_enabled():
            return safe_fallback(
                provider=self.name,
                query=request.query,
                status="not_configured",
                answer=(
                    "Agent memory is not enabled in this environment. "
                    "Set AGENT_BRAIN_MEMORY_ALLOW_WRITES=1 to enable."
                ),
                missing_requirements=["agent_memory_disabled"],
            )

        ql = (request.query or "").lower()
        with self._lock:
            if ql:
                items = [n for n in self._notes if ql in str(n.get("note", "")).lower()]
            else:
                items = list(self._notes[-50:])
        return ProviderResponse(
            provider=self.name,
            status="ok",
            query=request.query,
            answer=f"{len(items)} note(s) in agent memory.",
            items=items,
            safety_flags=["no_phi", "operational_only"],
            requires_clinician_review=False,
            patient_facing_allowed=False,
            confidence="high",
        )

    # ── Write (only callable by router for /agent-brain/memory POST) ──────────

    def write_note(
        self,
        *,
        note: str,
        tags: list[str],
        actor_id: str,
        actor_role: str,
    ) -> ProviderResponse:
        if not _writes_enabled():
            return safe_fallback(
                provider=self.name,
                query=note,
                status="not_configured",
                answer=(
                    "Agent memory writes are not enabled in this environment."
                ),
                missing_requirements=["agent_memory_disabled"],
            )

        if actor_role not in self.allowed_roles:
            return safe_fallback(
                provider=self.name,
                query=note,
                status="denied",
                answer=(
                    f"Role '{actor_role}' is not permitted to write agent memory."
                ),
                safety_flags=["role_not_permitted"],
                missing_requirements=["role_below_clinician"],
            )

        payload = {"note": note, "tags": tags}
        if looks_like_phi(payload):
            return safe_fallback(
                provider=self.name,
                query=note,
                status="denied",
                answer=(
                    "Refusing to store note: payload looks like PHI. Agent "
                    "memory is for non-PHI operational notes only."
                ),
                safety_flags=["phi_payload_rejected"],
                missing_requirements=["phi_in_payload"],
            )

        record = {
            "note": note,
            "tags": list(tags or []),
            "actor_id": actor_id,
            "actor_role": actor_role,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        with self._lock:
            self._notes.append(record)
            count = len(self._notes)

        return ProviderResponse(
            provider=self.name,
            status="ok",
            query=note,
            answer=f"Stored note. {count} note(s) in agent memory.",
            items=[record],
            safety_flags=["no_phi", "operational_only"],
            requires_clinician_review=False,
            patient_facing_allowed=False,
            confidence="high",
        )
