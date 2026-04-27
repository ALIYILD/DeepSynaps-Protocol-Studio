"""Regression tests for the Telegram webhook secret-token check.

Pre-fix ``_webhook_secret_ok`` returned True whenever the configured
secret was empty, leaving the webhook fully unauthenticated. An
attacker who learned the public webhook URL could post arbitrary
"updates" — including fake LINK / CONFIRM / CANCEL messages bound to
any chat_id, plus arbitrary user messages routed straight to the LLM
on DeepSynaps' bill.

Post-fix policy:

* Production / staging: empty secret => 401 (fail closed).
* Development / test: empty secret => 200 (so local ngrok testing
  still works).
* Set secret => header must match exactly using ``hmac.compare_digest``
  for constant-time equality.
* Per-bot secrets (``TELEGRAM_PATIENT_WEBHOOK_SECRET`` /
  ``TELEGRAM_CLINICIAN_WEBHOOK_SECRET``) win over the shared legacy
  secret so a leaked patient secret cannot authenticate clinician
  posts.
* Legacy ``/webhook`` returns 410 Gone — the per-bot routes are the
  only supported entrypoints.
"""
from __future__ import annotations

import importlib

import pytest
from fastapi.testclient import TestClient


def _reload_with(monkeypatch, **overrides):
    """Reload :mod:`app.routers.telegram_router` against patched settings."""
    from app.settings import get_settings

    base = get_settings()
    overridden = base.model_copy(update=overrides)
    monkeypatch.setattr("app.settings.get_settings", lambda: overridden)
    import app.routers.telegram_router as mod
    return importlib.reload(mod)


def test_webhook_secret_ok_dev_env_no_secret_allows(monkeypatch) -> None:
    mod = _reload_with(
        monkeypatch,
        app_env="development",
        telegram_webhook_secret="",
        telegram_patient_webhook_secret="",
        telegram_clinician_webhook_secret="",
    )
    assert mod._webhook_secret_ok(None, "patient") is True
    assert mod._webhook_secret_ok("", "clinician") is True


def test_webhook_secret_ok_production_no_secret_denies(monkeypatch) -> None:
    """Production deploys MUST configure a secret. No secret => fail closed."""
    mod = _reload_with(
        monkeypatch,
        app_env="production",
        telegram_webhook_secret="",
        telegram_patient_webhook_secret="",
        telegram_clinician_webhook_secret="",
    )
    assert mod._webhook_secret_ok(None, "patient") is False
    assert mod._webhook_secret_ok("anything", "clinician") is False


def test_webhook_secret_ok_per_bot_secret_isolates_bots(monkeypatch) -> None:
    """A patient secret must not authenticate a clinician webhook post."""
    mod = _reload_with(
        monkeypatch,
        app_env="production",
        telegram_webhook_secret="",
        telegram_patient_webhook_secret="patient-secret",
        telegram_clinician_webhook_secret="clinician-secret",
    )
    assert mod._webhook_secret_ok("patient-secret", "patient") is True
    assert mod._webhook_secret_ok("patient-secret", "clinician") is False
    assert mod._webhook_secret_ok("clinician-secret", "clinician") is True
    assert mod._webhook_secret_ok("clinician-secret", "patient") is False


def test_webhook_secret_ok_falls_back_to_shared(monkeypatch) -> None:
    """When per-bot secrets are unset the shared secret applies."""
    mod = _reload_with(
        monkeypatch,
        app_env="production",
        telegram_webhook_secret="shared",
        telegram_patient_webhook_secret="",
        telegram_clinician_webhook_secret="",
    )
    assert mod._webhook_secret_ok("shared", "patient") is True
    assert mod._webhook_secret_ok("shared", "clinician") is True
    assert mod._webhook_secret_ok("wrong", "patient") is False


def test_webhook_secret_uses_constant_time_compare(monkeypatch) -> None:
    """Trivially: comparison must accept the exact secret and reject
    anything else; the constant-time path is exercised via
    ``hmac.compare_digest`` underneath."""
    mod = _reload_with(
        monkeypatch,
        app_env="production",
        telegram_webhook_secret="abcdef0123456789",
        telegram_patient_webhook_secret="",
        telegram_clinician_webhook_secret="",
    )
    assert mod._webhook_secret_ok("abcdef0123456789", "patient") is True
    # Same length, single-bit flip — must still reject.
    assert mod._webhook_secret_ok("abcdef0123456788", "patient") is False
    # Shorter prefix — must reject.
    assert mod._webhook_secret_ok("abcdef0123456", "patient") is False


def test_legacy_webhook_returns_410(client: TestClient) -> None:
    """The legacy ``/webhook`` (no per-bot suffix) must be permanently
    deprecated so a misconfigured deploy fails loudly instead of silently
    cross-wiring clinician traffic to the patient bot."""
    resp = client.post("/api/v1/telegram/webhook", json={})
    assert resp.status_code == 410, resp.text
    body = resp.json()
    assert body.get("code") == "telegram_webhook_deprecated", body


def test_webhook_returns_401_when_production_secret_missing(
    monkeypatch, client: TestClient
) -> None:
    """End-to-end: an unauthenticated production webhook hit returns
    401, not the pre-fix silent 200 ``{"ok": true}``."""
    from app.settings import get_settings

    base = get_settings()
    overridden = base.model_copy(update={
        "app_env": "production",
        "telegram_webhook_secret": "",
        "telegram_patient_webhook_secret": "",
        "telegram_clinician_webhook_secret": "",
    })
    monkeypatch.setattr("app.settings.get_settings", lambda: overridden)
    # Reload so the route picks up the patched settings on its next call.
    import app.routers.telegram_router as mod
    importlib.reload(mod)

    resp = client.post(
        "/api/v1/telegram/webhook/patient",
        json={"message": {"chat": {"id": 1}, "text": "ping"}},
    )
    assert resp.status_code == 401, resp.text
    assert resp.json().get("code") == "telegram_webhook_unauthorized"
