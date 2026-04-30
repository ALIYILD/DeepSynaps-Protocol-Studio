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
from . import audit, broker, pending_calls, registry, runner, tool_dispatcher
from .audit import record_run
from .broker import fetch_context
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
from .tools import TOOL_REGISTRY, ToolDefinition, is_write_tool

__all__ = [
    "AGENT_REGISTRY",
    "AgentAudience",
    "AgentDefinition",
    "AgentRoleRequired",
    "MAX_MESSAGE_CHARS",
    "SAFETY_FOOTER",
    "SCHEMA_ID",
    "TOOL_REGISTRY",
    "ToolDefinition",
    "audit",
    "broker",
    "fetch_context",
    "is_write_tool",
    "list_visible_agents",
    "pending_calls",
    "record_run",
    "registry",
    "run_agent",
    "runner",
    "tool_dispatcher",
]
