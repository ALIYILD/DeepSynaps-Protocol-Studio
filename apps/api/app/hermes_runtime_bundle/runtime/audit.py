from __future__ import annotations

from typing import Any

from .schema import compact_multiline, compact_text, utcnow_iso


def make_audit_event(
    event_type: str,
    *,
    actor: str,
    detail: str | None = None,
    board: str | None = None,
    target_agent: str | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload = {
        "ts": utcnow_iso(),
        "event": compact_text(event_type, limit=64) or "unknown",
        "actor": compact_text(actor, limit=96) or "system",
        "detail": compact_multiline(detail, limit=500),
        "board": compact_text(board, limit=64),
        "target_agent": compact_text(target_agent, limit=96),
    }
    if extra:
        payload["extra"] = extra
    return payload


def append_audit_event(task: dict[str, Any], event: dict[str, Any]) -> dict[str, Any]:
    events = list(task.get("audit_events") or [])
    events.append(event)
    task["audit_events"] = events[-50:]
    task["updated_at"] = utcnow_iso()
    return task
