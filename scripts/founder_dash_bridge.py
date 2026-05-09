#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
from urllib.parse import urlencode
import urllib.error
import urllib.request


def _base_url() -> str:
    raw = (os.getenv("DEEPSYNAPS_FOUNDER_DASH_URL") or "").strip()
    if not raw:
        raise SystemExit("DEEPSYNAPS_FOUNDER_DASH_URL is required.")
    return raw.rstrip("/")


def _bridge_key() -> str:
    raw = (os.getenv("DEEPSYNAPS_FOUNDER_DASH_BRIDGE_KEY") or "").strip()
    if not raw:
        raise SystemExit("DEEPSYNAPS_FOUNDER_DASH_BRIDGE_KEY is required.")
    return raw


def _default_actor_id() -> str | None:
    raw = (os.getenv("DEEPSYNAPS_FOUNDER_DASH_ACTOR_ID") or "").strip()
    return raw or None


def _default_actor_role() -> str | None:
    raw = (os.getenv("DEEPSYNAPS_FOUNDER_DASH_ACTOR_ROLE") or "").strip()
    return raw or None


def _post(path: str, payload: dict) -> dict:
    req = urllib.request.Request(
        f"{_base_url()}{path}",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "X-Founder-Dash-Bridge-Key": _bridge_key(),
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"HTTP {exc.code}: {body}") from exc
    except urllib.error.URLError as exc:
        raise SystemExit(f"Request failed: {exc}") from exc


def _intake(args: argparse.Namespace) -> int:
    payload = {
        "actor_id": args.actor_id or _default_actor_id(),
        "actor_role": args.actor_role or _default_actor_role(),
        "title": args.title,
        "source_channel": args.source_channel,
        "source_agent_or_bot": args.source_agent_or_bot,
        "raw_summary": args.notes,
        "source": args.source,
        "priority": args.priority,
    }
    print(json.dumps(_post("/api/v1/hermes/bridge/intake", payload), indent=2))
    return 0


def _event(args: argparse.Namespace) -> int:
    if not args.related_task_id:
        raise SystemExit("--related-task-id is required for Hermes system events.")
    payload = {
        "task_id": args.related_task_id,
        "event_kind": args.event_kind,
        "title": args.title,
        "detail": args.detail or "",
    }
    print(json.dumps(_post(f"/api/v1/hermes/bridge/system-events?{urlencode(payload)}", {}), indent=2))
    return 0


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Post Hermes founder-command intake tasks and audit events.")
    sub = parser.add_subparsers(dest="command", required=True)

    intake = sub.add_parser("intake", help="Create a Hermes founder-command task through the bridge.")
    intake.add_argument("--title", required=True)
    intake.add_argument("--notes")
    intake.add_argument("--source-channel", default="bridge")
    intake.add_argument("--source-agent-or-bot", default="bridge")
    intake.add_argument(
        "--source",
        default="bridge",
        choices=[
            "bridge",
            "dash",
            "telegram-personal",
            "telegram-perfflux",
            "telegram-deepsynaps",
            "telegram-governance",
            "openclaw-personal",
            "openclaw-perfflux",
            "hermes",
            "paperclip",
        ],
    )
    intake.add_argument("--priority", default="routine", choices=["routine", "P2", "P1", "P0"])
    intake.add_argument("--actor-id")
    intake.add_argument("--actor-role")
    intake.set_defaults(func=_intake)

    event = sub.add_parser("event", help="Append a Hermes founder-command task audit event through the bridge.")
    event.add_argument("--event-kind", required=True)
    event.add_argument("--title", required=True)
    event.add_argument("--detail")
    event.add_argument("--related-task-id")
    event.set_defaults(func=_event)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    sys.exit(main())
