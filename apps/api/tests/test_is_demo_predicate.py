"""Tests for ``app.security.is_demo`` — the canonical demo-session predicate.

These tests pin the behaviour of the additive PR-A predicate so that
PR-B (which migrates the 8 ad-hoc gates) can refactor with confidence.
"""

from __future__ import annotations

import pytest

from app.auth import AuthenticatedActor
from app.security.is_demo import (
    DEMO_CLINIC_IDS,
    is_demo_actor,
    is_demo_clinic_id,
    is_demo_env,
)


# ── Module constants ─────────────────────────────────────────────────────────


def test_demo_clinic_ids_constant_matches_router_literal() -> None:
    """If this fails, update both this constant and every router that
    hard-codes ``{"clinic-demo-default", "clinic-cd-demo"}`` (see the
    docstring of ``app.security.is_demo`` for the full list)."""
    assert DEMO_CLINIC_IDS == frozenset({"clinic-demo-default", "clinic-cd-demo"})


# ── is_demo_clinic_id ────────────────────────────────────────────────────────


@pytest.mark.parametrize("clinic_id", sorted(DEMO_CLINIC_IDS))
def test_is_demo_clinic_id_true_for_canonical_demo_clinics(clinic_id: str) -> None:
    assert is_demo_clinic_id(clinic_id) is True


@pytest.mark.parametrize(
    "clinic_id",
    [
        "clinic-real-001",
        "clinic-prod",
        "CLINIC-DEMO-DEFAULT",  # case-sensitive on purpose
        " clinic-demo-default",  # whitespace must NOT be coerced
        "",
        None,
    ],
)
def test_is_demo_clinic_id_false_for_everything_else(clinic_id) -> None:
    assert is_demo_clinic_id(clinic_id) is False


# ── is_demo_env ──────────────────────────────────────────────────────────────


def test_is_demo_env_true_when_flag_set(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MRI_DEMO_MODE", "1")
    assert is_demo_env() is True


def test_is_demo_env_false_when_flag_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("MRI_DEMO_MODE", raising=False)
    assert is_demo_env() is False


@pytest.mark.parametrize("value", ["", "0", "true", "yes", "2", "TRUE"])
def test_is_demo_env_false_for_non_one_values(
    monkeypatch: pytest.MonkeyPatch, value: str
) -> None:
    """Mirrors ``mri_analysis_router._demo_mode_enabled`` which accepts
    only the literal string ``"1"``."""
    monkeypatch.setenv("MRI_DEMO_MODE", value)
    assert is_demo_env() is False


# ── is_demo_actor ────────────────────────────────────────────────────────────


def _real_actor(**overrides) -> AuthenticatedActor:
    base = dict(
        actor_id="user-real-001",
        display_name="Dr Real",
        role="clinician",
        package_id="clinician_pro",
        token_id="real-jwt-abc",
        clinic_id="clinic-real-001",
    )
    base.update(overrides)
    return AuthenticatedActor(**base)


def test_is_demo_actor_false_for_none(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("MRI_DEMO_MODE", raising=False)
    assert is_demo_actor(None) is False


def test_is_demo_actor_false_for_real_actor(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("MRI_DEMO_MODE", raising=False)
    assert is_demo_actor(_real_actor()) is False


def test_is_demo_actor_true_when_env_flag_overrides_real_actor(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Global ``MRI_DEMO_MODE=1`` short-circuits even a real actor."""
    monkeypatch.setenv("MRI_DEMO_MODE", "1")
    assert is_demo_actor(_real_actor()) is True
    # And the None case too — env override is unconditional.
    assert is_demo_actor(None) is True


@pytest.mark.parametrize("clinic_id", sorted(DEMO_CLINIC_IDS))
def test_is_demo_actor_true_when_clinic_is_demo(
    monkeypatch: pytest.MonkeyPatch, clinic_id: str
) -> None:
    monkeypatch.delenv("MRI_DEMO_MODE", raising=False)
    actor = _real_actor(clinic_id=clinic_id)
    assert is_demo_actor(actor) is True


def test_is_demo_actor_true_when_actor_id_matches_demo_pattern(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("MRI_DEMO_MODE", raising=False)
    actor = _real_actor(actor_id="actor-clinician-demo", clinic_id=None)
    assert is_demo_actor(actor) is True


def test_is_demo_actor_true_when_token_id_has_demo_suffix(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("MRI_DEMO_MODE", raising=False)
    actor = _real_actor(
        actor_id="user-real-001",
        clinic_id="clinic-real-001",
        token_id="patient-demo-token",
    )
    assert is_demo_actor(actor) is True


def test_is_demo_actor_accepts_optional_db_argument(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """*db* is reserved for PR-B; passing one today must be a no-op."""
    monkeypatch.delenv("MRI_DEMO_MODE", raising=False)
    sentinel_db = object()
    assert is_demo_actor(_real_actor(), db=sentinel_db) is False
    assert (
        is_demo_actor(_real_actor(clinic_id="clinic-demo-default"), db=sentinel_db)
        is True
    )


def test_is_demo_actor_handles_actor_without_optional_attrs(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Defensive: a duck-typed actor missing ``token_id`` / ``clinic_id``
    attributes (e.g. a future test stub) must not raise."""
    monkeypatch.delenv("MRI_DEMO_MODE", raising=False)

    class _Stub:
        actor_id = "user-real-002"
        # No clinic_id, no token_id.

    assert is_demo_actor(_Stub()) is False  # type: ignore[arg-type]
