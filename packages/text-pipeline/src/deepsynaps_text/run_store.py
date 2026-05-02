"""Pluggable persistence for :class:`TextPipelineRun` (memory default, optional JSON files)."""

from __future__ import annotations

import json
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Optional

from deepsynaps_text.schemas import TextPipelineRun


class RunStore(ABC):
    @abstractmethod
    def save(self, run: TextPipelineRun) -> None:
        ...

    @abstractmethod
    def get(self, run_id: str) -> Optional[TextPipelineRun]:
        ...

    @abstractmethod
    def clear(self) -> None:
        """Clear all runs (testing only)."""


class MemoryRunStore(RunStore):
    def __init__(self) -> None:
        self._runs: dict[str, TextPipelineRun] = {}

    def save(self, run: TextPipelineRun) -> None:
        self._runs[run.run_id] = run.model_copy(deep=True)

    def get(self, run_id: str) -> Optional[TextPipelineRun]:
        r = self._runs.get(run_id)
        return r.model_copy(deep=True) if r else None

    def clear(self) -> None:
        self._runs.clear()


class FileRunStore(RunStore):
    """One JSON file per run_id under ``directory``."""

    def __init__(self, directory: Path) -> None:
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)

    def _path(self, run_id: str) -> Path:
        safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in run_id)
        return self.directory / f"{safe}.json"

    def save(self, run: TextPipelineRun) -> None:
        path = self._path(run.run_id)
        payload = run.model_dump(mode="json")
        path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    def get(self, run_id: str) -> Optional[TextPipelineRun]:
        path = self._path(run_id)
        if not path.is_file():
            return None
        data = json.loads(path.read_text(encoding="utf-8"))
        return TextPipelineRun.model_validate(data)

    def clear(self) -> None:
        for p in self.directory.glob("*.json"):
            p.unlink(missing_ok=True)


_ACTIVE_STORE: RunStore = MemoryRunStore()


def get_run_store() -> RunStore:
    return _ACTIVE_STORE


def set_run_store(store: RunStore) -> None:
    """Replace the active store (tests and app bootstrap)."""
    global _ACTIVE_STORE
    _ACTIVE_STORE = store


def configure_run_store_from_env() -> RunStore:
    """Call at startup: file-backed store when persist + dir are set."""
    from deepsynaps_text.feature_flags import load_text_pipeline_feature_flags

    flags = load_text_pipeline_feature_flags()
    if flags.persist_runs_to_disk and flags.run_store_dir:
        store: RunStore = FileRunStore(Path(flags.run_store_dir))
    else:
        store = MemoryRunStore()
    set_run_store(store)
    return store


def ensure_run_store_configured() -> None:
    """If persistence env is set, switch to file store (idempotent per process)."""
    import os

    if not os.environ.get("DEEPSYNAPS_TEXT_PERSIST_RUNS"):
        return
    configure_run_store_from_env()
