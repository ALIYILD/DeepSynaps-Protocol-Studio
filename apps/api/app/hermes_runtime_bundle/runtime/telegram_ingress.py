from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import sys
from typing import Any

if __package__ in {None, ""}:
    _RUNTIME_DIR = Path(__file__).resolve().parent
    if str(_RUNTIME_DIR.parent) not in sys.path:
        sys.path.insert(0, str(_RUNTIME_DIR.parent))
    from runtime.boards import HermesBoardStore
    from runtime.router import preview_route, route_intake_task
    from runtime.schema import compact_multiline, compact_text
else:
    from .boards import HermesBoardStore
    from .router import preview_route, route_intake_task
    from .schema import compact_multiline, compact_text


def _bool_env(name: str, default: bool) -> bool:
    raw = str(os.getenv(name, str(default))).strip().lower()
    return raw in {"1", "true", "yes", "on"}


def _allowed_chat_ids() -> set[str]:
    raw = str(os.getenv("TELEGRAM_ALLOWED_CHAT_IDS", "")).strip()
    if not raw:
        return set()
    return {part.strip() for part in raw.split(",") if part.strip()}


def _route_source_from_update(chat_title: str, username: str, bot_name: str) -> tuple[str, str]:
    haystack = " ".join(part for part in (chat_title, username, bot_name) if part).lower()
    if "perfflux" in haystack:
        return "perfflux-hq", "telegram-perfflux"
    if "alislave" in haystack or "personal" in haystack:
        return "alislave-ai", "telegram-personal"
    if "paperclip" in haystack or "governance" in haystack:
        return "paperclip", "telegram-governance"
    if "hermes" in haystack or "deepsynaps" in haystack or "studio" in haystack:
        return "hermes", "telegram-deepsynaps"
    return "telegram-ingress-router", "telegram"


def normalize_telegram_update(update: dict[str, Any]) -> dict[str, Any]:
    message = update.get("message") or update.get("edited_message") or {}
    chat = message.get("chat") or {}
    sender = message.get("from") or {}
    text = message.get("text") or message.get("caption") or ""
    chat_id = str(chat.get("id") or "")
    chat_title = str(chat.get("title") or chat.get("username") or chat.get("first_name") or "").strip()
    username = str(sender.get("username") or "").strip()
    requested_by = compact_text(
        username or " ".join(part for part in (sender.get("first_name"), sender.get("last_name")) if part),
        limit=96,
    ) or "telegram-user"
    source_agent, logical_channel = _route_source_from_update(chat_title, username, str(update.get("bot_name") or ""))
    summary = compact_text(text, limit=240)
    return {
        "chat_id": chat_id,
        "chat_title": chat_title,
        "username": username,
        "message_text": text,
        "summary": summary,
        "timestamp": message.get("date") or update.get("update_id"),
        "source": "telegram",
        "source_channel": chat_title or logical_channel or "telegram",
        "source_agent_or_bot": source_agent,
        "requested_by": requested_by,
        "title": summary or "Telegram intake",
        "raw_summary": summary,
    }


def process_telegram_update(
    update: dict[str, Any],
    *,
    store: HermesBoardStore | None = None,
    dry_run: bool | None = None,
) -> dict[str, Any]:
    normalized = normalize_telegram_update(update)
    allowlist = _allowed_chat_ids()
    if allowlist and normalized["chat_id"] not in allowlist:
        return {
            "accepted": False,
            "reason": "unauthorized_chat",
            "chat_id": normalized["chat_id"],
        }
    resolved_dry_run = _bool_env("HERMES_TELEGRAM_DRY_RUN", True) if dry_run is None else dry_run
    intake_payload = {
        "title": normalized["title"],
        "source": normalized["source"],
        "source_channel": normalized["source_channel"],
        "source_agent_or_bot": normalized["source_agent_or_bot"],
        "raw_summary": normalized["raw_summary"],
        "requested_by": normalized["requested_by"],
        "priority": "routine",
        "links": [],
    }
    if resolved_dry_run:
        return {
            "accepted": True,
            "dry_run": True,
            "intake": intake_payload,
            "route_preview": preview_route(intake_payload),
        }
    runtime_store = store or HermesBoardStore()
    task = route_intake_task(runtime_store, intake_payload)
    return {
        "accepted": True,
        "dry_run": False,
        "task": task,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Normalize and route a Telegram update JSON blob.")
    parser.add_argument("update_json", help="Path to a Telegram update JSON file")
    parser.add_argument("--apply", action="store_true", help="Write to the Hermes runtime instead of dry-run preview")
    parser.add_argument("--runtime-root", default=os.getenv("HERMES_RUNTIME_ROOT", str(Path.home() / ".hermes")))
    args = parser.parse_args(argv)
    payload = json.loads(Path(args.update_json).read_text(encoding="utf-8"))
    store = HermesBoardStore(Path(args.runtime_root))
    result = process_telegram_update(payload, store=store, dry_run=not args.apply)
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
