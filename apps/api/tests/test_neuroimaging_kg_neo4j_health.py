"""Phase 5 — Neo4j driver health-check unit tests.

These tests must NOT require a live Neo4j; we monkeypatch the driver
factory inside `app.services.neuroimaging.kg_neo4j`.
"""
from __future__ import annotations

import importlib


def _reload_module():
    from app.services.neuroimaging import kg_neo4j
    return importlib.reload(kg_neo4j)


def _clear_env(monkeypatch):
    for var in ("NEO4J_URI", "NEO4J_USER", "NEO4J_PASSWORD"):
        monkeypatch.delenv(var, raising=False)


def test_health_check_driver_missing_sets_error(monkeypatch):
    """HAS_NEO4J_DRIVER=False → driver_installed False, reachable None, error populated."""
    kg = _reload_module()
    monkeypatch.setattr(kg, "HAS_NEO4J_DRIVER", False)
    out = kg.health_check()
    assert out["driver_installed"] is False
    assert out["reachable"] is None
    assert "not installed" in (out["error"] or "")


def test_health_check_not_configured_returns_reachable_none(monkeypatch):
    """No NEO4J_* env → configured=False, reachable=None, no error, no exception."""
    kg = _reload_module()
    if not kg.HAS_NEO4J_DRIVER:
        import pytest
        pytest.skip("neo4j driver not installed in this environment")
    _clear_env(monkeypatch)
    out = kg.health_check()
    assert out["driver_installed"] is True
    assert out["configured"] is False
    assert out["reachable"] is None
    assert out["error"] is None


class _FakeRecord:
    def __init__(self, value):
        self._value = value

    def get(self, key):
        return self._value


class _FakeResult:
    def __init__(self, value):
        self._value = value

    def single(self):
        return _FakeRecord(self._value)


class _FakeSession:
    def __init__(self, *, result_value=1, raise_on_run=None):
        self._result_value = result_value
        self._raise = raise_on_run

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def run(self, query):
        if self._raise is not None:
            raise self._raise
        return _FakeResult(self._result_value)


class _FakeDriver:
    def __init__(self, *, session_kwargs=None):
        self._session_kwargs = session_kwargs or {}
        self.closed = False

    def session(self):
        return _FakeSession(**self._session_kwargs)

    def close(self):
        self.closed = True


def test_health_check_reachable_true_when_stub_returns_one(monkeypatch):
    """Stub session yielding {"ok": 1} → reachable=True, no error, driver closed."""
    kg = _reload_module()
    if not kg.HAS_NEO4J_DRIVER:
        import pytest
        pytest.skip("neo4j driver not installed in this environment")
    monkeypatch.setenv("NEO4J_URI", "bolt://stub:7687")
    monkeypatch.setenv("NEO4J_USER", "neo4j")
    monkeypatch.setenv("NEO4J_PASSWORD", "test-pass")
    driver = _FakeDriver()
    monkeypatch.setattr(kg, "get_driver", lambda: driver)

    out = kg.health_check()
    assert out["driver_installed"] is True
    assert out["configured"] is True
    assert out["reachable"] is True
    assert out["error"] is None
    assert driver.closed is True


def test_health_check_reachable_false_when_session_raises(monkeypatch):
    """Session.run raises → reachable=False, error captures exception, driver closed."""
    kg = _reload_module()
    if not kg.HAS_NEO4J_DRIVER:
        import pytest
        pytest.skip("neo4j driver not installed in this environment")
    monkeypatch.setenv("NEO4J_URI", "bolt://unreachable:7687")
    monkeypatch.setenv("NEO4J_USER", "neo4j")
    monkeypatch.setenv("NEO4J_PASSWORD", "wrong-pass")
    boom = RuntimeError("ServiceUnavailable: simulated outage")
    driver = _FakeDriver(session_kwargs={"raise_on_run": boom})
    monkeypatch.setattr(kg, "get_driver", lambda: driver)

    out = kg.health_check()
    assert out["driver_installed"] is True
    assert out["configured"] is True
    assert out["reachable"] is False
    assert "simulated outage" in (out["error"] or "")
    assert driver.closed is True


def test_get_driver_raises_when_not_configured(monkeypatch):
    """get_driver() with missing env vars raises RuntimeError."""
    import pytest
    kg = _reload_module()
    if not kg.HAS_NEO4J_DRIVER:
        pytest.skip("neo4j driver not installed in this environment")
    _clear_env(monkeypatch)
    with pytest.raises(RuntimeError, match="not configured"):
        kg.get_driver()
