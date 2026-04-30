"""Regression tests for the Telegram webhook ``app_env`` allowlist
and the in-process update-id replay cache.

The denylist that ``_webhook_secret_ok`` previously used (``app_env not in
{"production", "staging"}``) silently fail-opened on any unrecognised env
string — a typo like ``"preview"``, ``"ci"``, or an env that defaulted to
something other than ``"development"`` would accept unauthenticated
webhook posts. Post-fix the dev-bypass is an explicit allowlist of
``{"development", "test"}``; everything else fails closed when no secret
is configured.

Telegram retries any non-2xx (and slow handlers) for up to 24h, so the
same ``update_id`` will hit the webhook multiple times. Without dedup an
attacker who replays a captured update body — or a noisy retry storm —
re-fires LLM calls (cost), DrClaw callback dispatches, and audit-log
noise. ``_is_replay`` is a single-process LRU keyed by
``(bot_kind, update_id)`` covering Telegram's seconds-long retry burst on
the single-instance Fly app.
"""
from __future__ import annotations

import importlib

import pytest


def _reload_with(monkeypatch, **overrides):
    from app.settings import get_settings

    base = get_settings()
    overridden = base.model_copy(update=overrides)
    monkeypatch.setattr("app.settings.get_settings", lambda: overridden)
    import app.routers.telegram_router as mod
    return importlib.reload(mod)


# ---------------------------------------------------------------------------
# Allowlist (development / test only) for empty-secret bypass
# ---------------------------------------------------------------------------
class TestEnvAllowlist:
    def test_unrecognised_env_with_no_secret_denies(self, monkeypatch) -> None:
        """Pre-fix any env not in {production, staging} silently allowed
        unauthenticated webhooks. A typo'd ``"preview"`` would fail-open.
        Post-fix the bypass is an explicit allowlist."""
        mod = _reload_with(
            monkeypatch,
            app_env="preview",
            telegram_webhook_secret="",
            telegram_patient_webhook_secret="",
            telegram_clinician_webhook_secret="",
        )
        assert mod._webhook_secret_ok(None, "patient") is False
        assert mod._webhook_secret_ok("anything", "clinician") is False

    def test_ci_env_with_no_secret_denies(self, monkeypatch) -> None:
        """CI-like envs must also fail closed when no secret is set."""
        mod = _reload_with(
            monkeypatch,
            app_env="ci",
            telegram_webhook_secret="",
            telegram_patient_webhook_secret="",
            telegram_clinician_webhook_secret="",
        )
        assert mod._webhook_secret_ok(None, "patient") is False

    def test_test_env_with_no_secret_allows(self, monkeypatch) -> None:
        """``test`` is on the allowlist so the existing test suite's
        empty-secret default path keeps working."""
        mod = _reload_with(
            monkeypatch,
            app_env="test",
            telegram_webhook_secret="",
            telegram_patient_webhook_secret="",
            telegram_clinician_webhook_secret="",
        )
        assert mod._webhook_secret_ok(None, "patient") is True

    def test_development_env_with_no_secret_allows(self, monkeypatch) -> None:
        mod = _reload_with(
            monkeypatch,
            app_env="development",
            telegram_webhook_secret="",
            telegram_patient_webhook_secret="",
            telegram_clinician_webhook_secret="",
        )
        assert mod._webhook_secret_ok(None, "patient") is True

    def test_app_env_match_is_case_insensitive(self, monkeypatch) -> None:
        """Settings sometimes carry a mixed-case env (``"Development"``);
        the gate must lowercase before comparing."""
        mod = _reload_with(
            monkeypatch,
            app_env="DEVELOPMENT",
            telegram_webhook_secret="",
            telegram_patient_webhook_secret="",
            telegram_clinician_webhook_secret="",
        )
        assert mod._webhook_secret_ok(None, "patient") is True


# ---------------------------------------------------------------------------
# In-process update-id replay cache
# ---------------------------------------------------------------------------
class TestReplayCache:
    @pytest.fixture(autouse=True)
    def _reset_cache(self, monkeypatch):
        """Each test sees a clean LRU so order between tests doesn't matter."""
        import app.routers.telegram_router as mod
        monkeypatch.setattr(mod, "_seen_update_ids", None)
        yield

    def test_first_seen_is_not_replay(self) -> None:
        import app.routers.telegram_router as mod
        assert mod._is_replay("patient", 1001) is False

    def test_second_seen_is_replay(self) -> None:
        import app.routers.telegram_router as mod
        assert mod._is_replay("patient", 1001) is False
        assert mod._is_replay("patient", 1001) is True

    def test_different_update_id_is_not_replay(self) -> None:
        import app.routers.telegram_router as mod
        assert mod._is_replay("patient", 1001) is False
        assert mod._is_replay("patient", 1002) is False

    def test_different_bot_kind_same_id_is_separate(self) -> None:
        """A patient ``update_id`` and a clinician ``update_id`` collide on
        the integer; the cache must key on (bot_kind, update_id) so the
        clinician update isn't dropped as a "replay" of the patient one."""
        import app.routers.telegram_router as mod
        assert mod._is_replay("patient", 7) is False
        assert mod._is_replay("clinician", 7) is False
        assert mod._is_replay("patient", 7) is True
        assert mod._is_replay("clinician", 7) is True

    def test_missing_update_id_is_never_replay(self) -> None:
        """``update_id`` is required by Telegram; callers that pass None
        (malformed payload) must not poison the cache or be flagged."""
        import app.routers.telegram_router as mod
        assert mod._is_replay("patient", None) is False
        assert mod._is_replay("patient", None) is False

    def test_lru_evicts_oldest_when_capped(self, monkeypatch) -> None:
        """Cap eviction keeps the hot tail; an evicted update_id is no
        longer considered a replay (acceptable — Telegram's retry window
        is seconds, the cap is 4096)."""
        import app.routers.telegram_router as mod
        monkeypatch.setattr(mod, "_SEEN_UPDATES_MAX", 3)
        mod._seen_update_ids = None  # reset for isolation

        assert mod._is_replay("patient", 1) is False
        assert mod._is_replay("patient", 2) is False
        assert mod._is_replay("patient", 3) is False
        # Inserting a 4th entry evicts update_id=1 (oldest).
        assert mod._is_replay("patient", 4) is False
        # 1 was evicted, but calling _is_replay on it re-adds it (fresh
        # redelivery semantics). Verify the remaining original tail.
        assert mod._is_replay("patient", 3) is True
        assert mod._is_replay("patient", 4) is True


# ---------------------------------------------------------------------------
# End-to-end: replayed webhook returns 200 but doesn't double-process
# ---------------------------------------------------------------------------
class TestReplayEndToEnd:
    def test_replayed_update_short_circuits(self, monkeypatch, client) -> None:
        """A second POST with the same ``update_id`` must return ok
        without re-running the message handler."""
        from app.settings import get_settings

        base = get_settings()
        overridden = base.model_copy(update={
            "app_env": "test",
            "telegram_webhook_secret": "",
            "telegram_patient_webhook_secret": "",
            "telegram_clinician_webhook_secret": "",
        })
        monkeypatch.setattr("app.settings.get_settings", lambda: overridden)
        import app.routers.telegram_router as mod
        importlib.reload(mod)
        # Reset the LRU after reload so the test starts clean.
        monkeypatch.setattr(mod, "_seen_update_ids", None)

        # Spy on the outbound send so we can detect whether the handler
        # actually ran (instead of being short-circuited by the replay
        # cache). An unlinked patient chat triggers exactly one
        # ``send_message`` call ("Please link your account first…").
        calls = {"n": 0}

        def _spy(*args, **kwargs):
            calls["n"] += 1
            return None

        monkeypatch.setattr(mod.tg, "send_message", _spy)

        body = {
            "update_id": 555_001,
            "message": {"chat": {"id": 12345}, "text": "ping"},
        }
        r1 = client.post("/api/v1/telegram/webhook/patient", json=body)
        r2 = client.post("/api/v1/telegram/webhook/patient", json=body)
        assert r1.status_code == 200, r1.text
        assert r2.status_code == 200, r2.text
        # Only the original delivery reached the message branch; the
        # replay short-circuited before ``send_message``.
        assert calls["n"] == 1, f"replay should have been suppressed; n={calls['n']}"
