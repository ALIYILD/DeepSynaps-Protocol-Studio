"""Agent Marketplace service package.

Re-exports the public surface so callers can write::

    from app.services.agents import (
        AGENT_REGISTRY,
        AgentDefinition,
        list_visible_agents,
        run_agent,
        record_run,
    )

instead of reaching into the individual submodules.
"""
from . import audit, registry, runner
from .audit import record_run
from .registry import (
    AGENT_REGISTRY,
    AgentAudience,
    AgentDefinition,
    AgentRoleRequired,
    list_visible_agents,
)
from .runner import (
    MAX_MESSAGE_CHARS,
    SAFETY_FOOTER,
    SCHEMA_ID,
    run_agent,
)

__all__ = [
    "AGENT_REGISTRY",
    "AgentAudience",
    "AgentDefinition",
    "AgentRoleRequired",
    "MAX_MESSAGE_CHARS",
    "SAFETY_FOOTER",
    "SCHEMA_ID",
    "audit",
    "list_visible_agents",
    "record_run",
    "registry",
    "run_agent",
    "runner",
]
