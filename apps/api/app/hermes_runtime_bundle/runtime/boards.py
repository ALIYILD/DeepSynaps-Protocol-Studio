from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from .audit import append_audit_event, make_audit_event
from .schema import BOARD_IDS, TASK_STATUSES, compact_text, utcnow_iso, validate_board_metadata


class HermesBoardStore:
    def __init__(self, root: Path | str | None = None):
        self.root = Path(root or Path.home() / ".hermes")
        self.board_root = self.root / "kanban" / "boards"
        self.runtime_root = self.root / "runtime"
        self.tasks_path = self.runtime_root / "tasks.json"
        self.events_path = self.runtime_root / "events.ndjson"
        self._ensure_runtime_files()

    def _ensure_runtime_files(self) -> None:
        self.runtime_root.mkdir(parents=True, exist_ok=True)
        if not self.tasks_path.exists():
            self._atomic_write_json(self.tasks_path, {"version": 1, "updated_at": utcnow_iso(), "tasks": []})
        if not self.events_path.exists():
            self.events_path.write_text("", encoding="utf-8")

    def _atomic_write_json(self, path: Path, payload: dict[str, Any]) -> None:
        tmp_path = path.with_suffix(f"{path.suffix}.tmp")
        tmp_path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
        os.replace(tmp_path, path)

    def _load_state(self) -> dict[str, Any]:
        self._ensure_runtime_files()
        return json.loads(self.tasks_path.read_text(encoding="utf-8"))

    def _save_state(self, state: dict[str, Any]) -> None:
        state["updated_at"] = utcnow_iso()
        self._atomic_write_json(self.tasks_path, state)

    def load_boards(self) -> list[dict[str, Any]]:
        boards: list[dict[str, Any]] = []
        for board_id in BOARD_IDS:
            path = self.board_root / board_id / "board.json"
            if not path.exists():
                raise FileNotFoundError(f"Missing board file: {path}")
            payload = json.loads(path.read_text(encoding="utf-8"))
            boards.append(validate_board_metadata(payload))
        return boards

    def board_meta(self, board_id: str) -> dict[str, Any]:
        for board in self.load_boards():
            if board["slug"] == board_id:
                return board
        raise KeyError(board_id)

    def list_tasks(self, board_id: str | None = None) -> list[dict[str, Any]]:
        tasks = list(self._load_state().get("tasks") or [])
        if board_id is not None:
            tasks = [task for task in tasks if task.get("board") == board_id]
        return sorted(tasks, key=lambda row: (row.get("updated_at") or "", row.get("created_at") or ""), reverse=True)

    def get_task(self, task_id: str) -> dict[str, Any] | None:
        for task in self._load_state().get("tasks") or []:
            if task.get("id") == task_id:
                return task
        return None

    def create_task(self, task: dict[str, Any]) -> dict[str, Any]:
        state = self._load_state()
        tasks = list(state.get("tasks") or [])
        tasks.append(task)
        state["tasks"] = tasks
        self._save_state(state)
        return task

    def replace_task(self, task_id: str, new_task: dict[str, Any]) -> dict[str, Any]:
        state = self._load_state()
        tasks = list(state.get("tasks") or [])
        for idx, task in enumerate(tasks):
            if task.get("id") == task_id:
                tasks[idx] = new_task
                state["tasks"] = tasks
                self._save_state(state)
                return new_task
        raise KeyError(task_id)

    def update_task(self, task_id: str, patch: dict[str, Any], *, audit_actor: str | None = None, audit_event: str | None = None, audit_detail: str | None = None) -> dict[str, Any]:
        task = self.get_task(task_id)
        if task is None:
            raise KeyError(task_id)
        updated = {**task, **patch, "updated_at": utcnow_iso()}
        status = updated.get("status")
        if status not in TASK_STATUSES:
            raise ValueError(f"Unsupported task status: {status}")
        if audit_event and audit_actor:
            append_audit_event(
                updated,
                make_audit_event(
                    audit_event,
                    actor=audit_actor,
                    detail=audit_detail,
                    board=str(updated.get("board") or ""),
                    target_agent=str(updated.get("target_agent") or ""),
                ),
            )
        return self.replace_task(task_id, updated)

    def move_task(
        self,
        task_id: str,
        *,
        target_board: str,
        target_agent: str,
        routing_reason: str,
        actor: str,
        status: str | None = None,
    ) -> dict[str, Any]:
        self.board_meta(target_board)
        patch = {
            "board": target_board,
            "target_board": target_board,
            "target_agent": compact_text(target_agent, limit=96),
            "routing_reason": routing_reason,
        }
        if status:
            patch["status"] = status
        detail = f"Moved to {target_board} via {target_agent}. {routing_reason}".strip()
        return self.update_task(
            task_id,
            patch,
            audit_actor=actor,
            audit_event="routed",
            audit_detail=detail,
        )

    def append_task_audit(
        self,
        task_id: str,
        *,
        event_type: str,
        actor: str,
        detail: str,
        extra: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        task = self.get_task(task_id)
        if task is None:
            raise KeyError(task_id)
        append_audit_event(
            task,
            make_audit_event(
                event_type,
                actor=actor,
                detail=detail,
                board=str(task.get("board") or ""),
                target_agent=str(task.get("target_agent") or ""),
                extra=extra,
            ),
        )
        return self.replace_task(task_id, task)

    def append_system_event(self, event: dict[str, Any]) -> None:
        serialized = json.dumps(event, sort_keys=True)
        with self.events_path.open("a", encoding="utf-8") as handle:
            handle.write(serialized + "\n")

    def board_snapshot(self, board_id: str) -> dict[str, Any]:
        meta = self.board_meta(board_id)
        tasks = self.list_tasks(board_id)
        counts = {status: 0 for status in TASK_STATUSES}
        for task in tasks:
            status = str(task.get("status") or "todo")
            counts[status] = counts.get(status, 0) + 1
        return {
            "board": board_id,
            "meta": meta,
            "counts": counts,
            "total": len(tasks),
            "newest_tasks": tasks[:10],
        }

    def all_board_snapshots(self) -> list[dict[str, Any]]:
        return [self.board_snapshot(board_id) for board_id in BOARD_IDS]
