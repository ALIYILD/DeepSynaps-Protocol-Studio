"""Pytest fixtures for text-pipeline tests."""

from __future__ import annotations

import pytest

from deepsynaps_text.run_store import MemoryRunStore, set_run_store


@pytest.fixture(autouse=True)
def reset_run_store() -> None:
    """Isolate pipeline run registry between tests."""
    set_run_store(MemoryRunStore())
    yield
