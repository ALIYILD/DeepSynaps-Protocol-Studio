"""Tests for services/analyses/_engine.py — decorator registry + runner.

Covers:
* register_analysis registers a function under category/slug key.
* get_registry returns a copy — mutations do not affect the live registry.
* run_all calls every registered function with the supplied context.
* run_all returns meta fields: total, completed, failed, duration_sec.
* run_all result shape: status=ok, label, category, data, summary, duration_ms.
* Failing analyses are isolated: one error does not stop others.
* Failing analysis produces status=error with a capped error string.
* Registered function is still callable directly (decorator is transparent).
* Empty registry run_all returns empty results dict with zeroed meta.
"""
from __future__ import annotations

import importlib
from typing import Any

import pytest

# We need a fresh isolated registry for each test to avoid cross-contamination
# with real registered analyses.  We achieve this by importing the module under
# test and temporarily replacing the _REGISTRY dict.


def _make_isolated_engine():
    """Return a fresh engine module with an empty _REGISTRY."""
    import app.services.analyses._engine as _engine_mod
    original = _engine_mod._REGISTRY.copy()
    _engine_mod._REGISTRY.clear()
    return _engine_mod, original


@pytest.fixture
def engine():
    """Yield the engine module with an isolated empty registry; restore after."""
    import app.services.analyses._engine as _engine_mod
    original = dict(_engine_mod._REGISTRY)
    _engine_mod._REGISTRY.clear()
    yield _engine_mod
    _engine_mod._REGISTRY.clear()
    _engine_mod._REGISTRY.update(original)


# ── register_analysis ─────────────────────────────────────────────────────────


def test_register_adds_entry(engine) -> None:
    @engine.register_analysis("test_cat", "test_slug", "Test Label")
    def my_fn(ctx: dict) -> dict:
        return {"data": {}, "summary": ""}

    reg = engine.get_registry()
    assert "test_cat/test_slug" in reg
    entry = reg["test_cat/test_slug"]
    assert entry["category"] == "test_cat"
    assert entry["slug"] == "test_slug"
    assert entry["label"] == "Test Label"
    assert entry["fn"] is my_fn


def test_register_decorator_is_transparent(engine) -> None:
    """The decorated function must still be directly callable."""

    @engine.register_analysis("cat", "slug", "L")
    def direct_fn(ctx: dict) -> dict:
        return {"data": {"x": 1}, "summary": "ok"}

    result = direct_fn({})
    assert result["data"]["x"] == 1


# ── get_registry ─────────────────────────────────────────────────────────────


def test_get_registry_returns_copy(engine) -> None:
    @engine.register_analysis("cat", "slug2", "L")
    def fn(ctx):
        return {"data": {}, "summary": ""}

    copy = engine.get_registry()
    copy["injected"] = {}
    # The live registry must not contain the injected key
    assert "injected" not in engine._REGISTRY


# ── run_all ───────────────────────────────────────────────────────────────────


def test_run_all_empty_registry(engine) -> None:
    out = engine.run_all({})
    assert out["results"] == {}
    assert out["meta"]["total"] == 0
    assert out["meta"]["completed"] == 0
    assert out["meta"]["failed"] == 0


def test_run_all_calls_function(engine) -> None:
    called_with: list[dict] = []

    @engine.register_analysis("x", "recorder", "Recorder")
    def recorder(ctx: dict) -> dict:
        called_with.append(ctx)
        return {"data": {"recorded": True}, "summary": "done"}

    ctx = {"key": "value"}
    engine.run_all(ctx)
    assert called_with == [ctx]


def test_run_all_result_shape(engine) -> None:
    @engine.register_analysis("x", "shape_test", "Shape Test")
    def fn(ctx: dict) -> dict:
        return {"data": {"n": 42}, "summary": "42 items"}

    out = engine.run_all({})
    assert "shape_test" in out["results"]
    r = out["results"]["shape_test"]
    assert r["status"] == "ok"
    assert r["label"] == "Shape Test"
    assert r["category"] == "x"
    assert r["data"] == {"n": 42}
    assert r["summary"] == "42 items"
    assert r["error"] is None
    assert isinstance(r["duration_ms"], int)


def test_run_all_meta_counts(engine) -> None:
    @engine.register_analysis("x", "ok_fn", "OK")
    def ok_fn(ctx):
        return {"data": {}, "summary": ""}

    @engine.register_analysis("x", "bad_fn", "Bad")
    def bad_fn(ctx):
        raise ValueError("boom")

    out = engine.run_all({})
    assert out["meta"]["total"] == 2
    assert out["meta"]["completed"] == 1
    assert out["meta"]["failed"] == 1


def test_run_all_error_isolation(engine) -> None:
    """A failing analysis must not prevent others from running."""

    @engine.register_analysis("x", "first", "First")
    def first(ctx):
        raise RuntimeError("first fails")

    @engine.register_analysis("x", "second", "Second")
    def second(ctx):
        return {"data": {"ran": True}, "summary": "second ok"}

    out = engine.run_all({})
    assert out["results"]["first"]["status"] == "error"
    assert "first fails" in out["results"]["first"]["error"]
    assert out["results"]["second"]["status"] == "ok"


def test_run_all_error_message_capped_at_300(engine) -> None:
    """Error strings are capped at 300 characters."""
    long_msg = "x" * 500

    @engine.register_analysis("x", "long_err", "LongErr")
    def fn(ctx):
        raise ValueError(long_msg)

    out = engine.run_all({})
    assert len(out["results"]["long_err"]["error"]) <= 300


def test_run_all_duration_sec_present(engine) -> None:
    @engine.register_analysis("x", "dur_test", "Dur")
    def fn(ctx):
        return {"data": {}, "summary": ""}

    out = engine.run_all({})
    assert isinstance(out["meta"]["duration_sec"], float)
    assert out["meta"]["duration_sec"] >= 0
