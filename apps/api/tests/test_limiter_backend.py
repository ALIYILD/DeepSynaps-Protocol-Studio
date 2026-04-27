"""Regression tests for the SlowAPI limiter backend selection.

Pre-fix the rate-limiter was hard-wired to in-memory storage, so on a
horizontally-scaled Fly app each machine kept its own counters and the
effective per-IP limit became ``(configured limit) × (machine count)``
— trivially defeatable for the brute-force + LLM-cost limits we ship.

These tests pin the env-var-driven backend selection in
``app.limiter._build_limiter``.
"""
from __future__ import annotations

import logging

import pytest


def _rebuild(monkeypatch, *, redis_uri: str = "", app_env: str = "test"):
    """Reload app.limiter with a temporarily-overridden get_settings()."""
    import importlib

    import app.limiter as limiter_mod
    from app.settings import get_settings

    base = get_settings()
    overridden = base.model_copy(update={
        "limiter_redis_uri": redis_uri,
        "app_env": app_env,
    })

    monkeypatch.setattr("app.settings.get_settings", lambda: overridden)
    return importlib.reload(limiter_mod)


def test_limiter_uses_in_memory_when_redis_uri_unset(monkeypatch) -> None:
    mod = _rebuild(monkeypatch, redis_uri="", app_env="test")
    # In-memory storage from the limits package — class name is "MemoryStorage".
    storage = mod.limiter._storage
    assert "Memory" in type(storage).__name__, type(storage).__name__


def test_limiter_warns_on_in_memory_in_production(monkeypatch, caplog) -> None:
    caplog.set_level(logging.WARNING, logger="app.limiter")
    _rebuild(monkeypatch, redis_uri="", app_env="production")
    msgs = [r.getMessage() for r in caplog.records]
    assert any("in-memory storage in app_env=production" in m for m in msgs), msgs


def test_limiter_silent_in_dev_when_in_memory(monkeypatch, caplog) -> None:
    caplog.set_level(logging.WARNING, logger="app.limiter")
    _rebuild(monkeypatch, redis_uri="", app_env="development")
    msgs = [r.getMessage() for r in caplog.records]
    assert not any("in-memory storage" in m for m in msgs), msgs


def test_redact_uri_strips_password() -> None:
    from app.limiter import _redact_uri

    assert _redact_uri("redis://default:hunter2@redis.local:6379/0") == (
        "redis://***@redis.local:6379/0"
    )
    # No password — pass through.
    assert _redact_uri("redis://redis.local:6379") == "redis://redis.local:6379"
    # Empty / non-URI input — no crash.
    assert _redact_uri("") == ""
    assert _redact_uri("not-a-uri") == "not-a-uri"


def test_limiter_picks_redis_backend_when_uri_set(monkeypatch, caplog) -> None:
    """When a Redis URI is configured the Limiter is constructed with
    storage_uri pointing at it. We assert at the construction layer only
    — actually round-tripping to Redis is outside this unit test."""
    caplog.set_level(logging.INFO, logger="app.limiter")
    fake_uri = "redis://default:s3cret@127.0.0.1:6379/0"
    mod = _rebuild(monkeypatch, redis_uri=fake_uri, app_env="staging")

    # SlowAPI exposes the storage URI as a private attribute; we assert on
    # it directly because hitting Redis would require a live instance.
    assert getattr(mod.limiter, "_storage_uri", None) == fake_uri

    # Startup log should mention the Redis backend with the password redacted.
    msgs = [r.getMessage() for r in caplog.records]
    assert any("shared Redis backend" in m and "***" in m for m in msgs), msgs
    assert "s3cret" not in " ".join(msgs)
