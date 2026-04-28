"""Agent ToolBroker package — registry + handlers for context pre-fetch.

Re-exports the public surface so callers can write::

    from app.services.agents.tools import (
        TOOL_REGISTRY,
        ToolDefinition,
        is_write_tool,
    )

instead of reaching into the submodule.
"""
from __future__ import annotations

from .registry import (
    TOOL_REGISTRY,
    ToolDefinition,
    is_write_tool,
)

__all__ = [
    "TOOL_REGISTRY",
    "ToolDefinition",
    "is_write_tool",
]
