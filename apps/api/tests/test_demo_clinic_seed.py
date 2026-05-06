"""Environment gate for scripts/seed_demo.py cohort seed."""
from __future__ import annotations

import pytest

from app.services.demo_clinic_seed import demo_seed_env_ok


def test_demo_seed_env_ok_requires_both_flags(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DEEPSYNAPS_APP_ENV", raising=False)
    monkeypatch.delenv("DEEPSYNAPS_DEMO_CLINIC_SEED", raising=False)
    assert demo_seed_env_ok() is False

    monkeypatch.setenv("DEEPSYNAPS_APP_ENV", "production")
    monkeypatch.setenv("DEEPSYNAPS_DEMO_CLINIC_SEED", "1")
    assert demo_seed_env_ok() is False

    monkeypatch.setenv("DEEPSYNAPS_APP_ENV", "development")
    monkeypatch.setenv("DEEPSYNAPS_DEMO_CLINIC_SEED", "0")
    assert demo_seed_env_ok() is False

    monkeypatch.setenv("DEEPSYNAPS_APP_ENV", "test")
    monkeypatch.setenv("DEEPSYNAPS_DEMO_CLINIC_SEED", "1")
    assert demo_seed_env_ok() is True
