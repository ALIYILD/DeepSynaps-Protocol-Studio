"""Phase 3 SimNIBS probe tests.

SimNIBS is GPL-3.0 and intentionally NOT a Python dependency. We probe for
the `simnibs_python` CLI binary on PATH and report version when found.
These tests mock `shutil.which` + `subprocess.run` so they pass on every
developer machine regardless of whether SimNIBS is installed.
"""
from __future__ import annotations

import subprocess

import pytest


def test_simnibs_health_schema_shape():
    """SimnibsHealth schema exposes available:bool and version:str|None."""
    from app.services.neuroimaging.schemas import SimnibsHealth

    h = SimnibsHealth(available=False, version=None)
    assert h.available is False
    assert h.version is None


def test_has_simnibs_reflects_shutil_which_present(monkeypatch):
    """When shutil.which returns a path, the probe returns that path."""
    import app.services.neuroimaging.simnibs_adapter as mod

    monkeypatch.setattr(
        mod.shutil, "which", lambda name: "/usr/local/bin/simnibs_python"
    )
    assert mod._probe_simnibs_binary() == "/usr/local/bin/simnibs_python"


def test_has_simnibs_reflects_shutil_which_absent(monkeypatch):
    """When shutil.which returns None, the probe returns None."""
    import app.services.neuroimaging.simnibs_adapter as mod

    monkeypatch.setattr(mod.shutil, "which", lambda name: None)
    assert mod._probe_simnibs_binary() is None


def test_check_simnibs_version_returns_simnibs_health(monkeypatch):
    """check_simnibs_version returns SimnibsHealth dataclass with version."""
    import app.services.neuroimaging.simnibs_adapter as mod
    from app.services.neuroimaging.schemas import SimnibsHealth

    monkeypatch.setattr(
        mod.shutil, "which", lambda name: "/usr/local/bin/simnibs_python"
    )

    class _R:
        returncode = 0
        stdout = "SimNIBS 4.1.0\n"
        stderr = ""

    monkeypatch.setattr(mod.subprocess, "run", lambda *a, **kw: _R())
    result = mod.check_simnibs_version()
    assert isinstance(result, SimnibsHealth)
    assert result.available is True
    assert result.version is not None
    assert "4.1.0" in result.version


def test_check_simnibs_version_when_missing(monkeypatch):
    """Returns SimnibsHealth(available=False, version=None) when binary missing."""
    import app.services.neuroimaging.simnibs_adapter as mod

    monkeypatch.setattr(mod.shutil, "which", lambda name: None)
    result = mod.check_simnibs_version()
    assert result.available is False
    assert result.version is None


def test_head_model_summary_raises_when_binary_missing(monkeypatch, tmp_path):
    """head_model_summary raises ImportError when SimNIBS CLI is absent."""
    import app.services.neuroimaging.simnibs_adapter as mod

    monkeypatch.setattr(mod.shutil, "which", lambda name: None)
    fake_t1 = tmp_path / "t1.nii.gz"
    fake_t1.write_bytes(b"\x00")
    with pytest.raises(ImportError):
        mod.head_model_summary(str(fake_t1))


def test_check_simnibs_version_subprocess_timeout(monkeypatch):
    """When subprocess hangs, return available=True / version=None gracefully."""
    import app.services.neuroimaging.simnibs_adapter as mod

    monkeypatch.setattr(
        mod.shutil, "which", lambda name: "/usr/local/bin/simnibs_python"
    )

    def _boom(*a, **kw):
        raise subprocess.TimeoutExpired(cmd="simnibs_python", timeout=5)

    monkeypatch.setattr(mod.subprocess, "run", _boom)
    result = mod.check_simnibs_version()
    assert result.available is True
    assert result.version is None
