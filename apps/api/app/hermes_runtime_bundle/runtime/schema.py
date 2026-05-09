from __future__ import annotations

from datetime import datetime, timezone
import re
import uuid
from typing import Any


BOARD_IDS = (
    "global-inbox",
    "personal",
    "perfflux",
    "deepsynaps",
    "governance",
)

TASK_STATUSES = (
    "todo",
    "needs_triage",
    "reviewed",
    "in_progress",
    "waiting",
    "done",
    "closed",
)

TASK_PRIORITIES = (
    "routine",
    "P2",
    "P1",
    "P0",
)


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_task_id() -> str:
    return f"ht_{uuid.uuid4().hex[:12]}"


def compact_text(value: str | None, *, limit: int = 280) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    if len(text) <= limit:
        return text
    return f"{text[: limit - 1].rstrip()}…"


def compact_multiline(value: str | None, *, limit: int = 800) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    if len(text) <= limit:
        return text
    return f"{text[: limit - 1].rstrip()}…"


def validate_board_metadata(payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("Board metadata must be an object.")
    slug = str(payload.get("slug") or "").strip()
    name = str(payload.get("name") or "").strip()
    if slug not in BOARD_IDS:
        raise ValueError(f"Unsupported board slug: {slug or '<missing>'}")
    if not name:
        raise ValueError(f"Board {slug} is missing a display name.")
    return payload


def normalize_links(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        value = [value]
    if not isinstance(value, list):
        return []
    out: list[str] = []
    for item in value:
        text = str(item or "").strip()
        if text and text not in out:
            out.append(text[:500])
    return out


def base_task(payload: dict[str, Any]) -> dict[str, Any]:
    now = utcnow_iso()
    summary = compact_text(
        payload.get("raw_summary")
        or payload.get("title")
        or payload.get("message")
        or payload.get("notes"),
        limit=240,
    )
    title = compact_text(payload.get("title") or summary or "Untitled task", limit=140)
    source = compact_text(payload.get("source") or "unknown", limit=64) or "unknown"
    source_channel = compact_text(payload.get("source_channel"), limit=96)
    source_agent_or_bot = compact_text(payload.get("source_agent_or_bot"), limit=96)
    requested_by = compact_text(payload.get("requested_by"), limit=96)
    priority = str(payload.get("priority") or "routine")
    if priority not in TASK_PRIORITIES:
        priority = "routine"
    target_board = str(payload.get("target_board") or "global-inbox")
    if target_board not in BOARD_IDS:
        target_board = "global-inbox"
    task = {
        "id": new_task_id(),
        "title": title,
        "source": source,
        "source_channel": source_channel or source,
        "source_agent_or_bot": source_agent_or_bot,
        "raw_summary": summary,
        "requested_by": requested_by,
        "board": "global-inbox",
        "target_board": target_board,
        "target_agent": compact_text(payload.get("target_agent") or "global-inbox-router", limit=96),
        "priority": priority,
        "status": "todo",
        "created_at": now,
        "updated_at": now,
        "routing_reason": compact_multiline(payload.get("routing_reason"), limit=400),
        "links": normalize_links(payload.get("links")),
        "audit_events": [],
        "approval_required": bool(payload.get("approval_required", False)),
        "risk_level": compact_text(payload.get("risk_level"), limit=32),
        "source_project": compact_text(payload.get("source_project"), limit=96),
        "deadline": compact_text(payload.get("deadline"), limit=48),
    }
    return task
