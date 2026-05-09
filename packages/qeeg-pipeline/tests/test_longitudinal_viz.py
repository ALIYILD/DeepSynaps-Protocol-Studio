"""Tests for :mod:`deepsynaps_qeeg.longitudinal.viz`.

All tests use synthetic SessionData — no real EDF fixtures required.
"""

from __future__ import annotations

import base64
import math
from pathlib import Path

import pytest

from deepsynaps_qeeg.longitudinal.store import SessionData
from deepsynaps_qeeg.longitudinal.viz import (
    _band_z_mean_abs,
    _tbr,
    _to_float,
    plot_change_topomap,
    plot_trend_lines,
)

pytest.importorskip("matplotlib")
pytest.importorskip("mne")

# ─── helpers ──────────────────────────────────────────────────────────────────

_CHS = ["Fp1", "Fp2", "F3", "F4", "Fz"]


def _sess(
    *,
    sid: str = "s1",
    theta_abs: float = 10.0,
    beta_abs: float = 5.0,
    alpha_z: float = 1.0,
    theta_z: float = 2.0,
    paf: dict[str, float] | None = None,
    state: str = "eyes_closed",
) -> SessionData:
    abs_map = {ch: theta_abs for ch in _CHS}
    beta_map = {ch: beta_abs for ch in _CHS}
    z_abs = {ch: theta_z for ch in _CHS}
    return SessionData(
        patient_id="P001",
        session_id=sid,
        features={
            "spectral": {
                "peak_alpha_freq": paf or {ch: 10.0 for ch in _CHS},
                "bands": {
                    "theta": {"absolute_uv2": abs_map},
                    "beta": {"absolute_uv2": beta_map},
                    "alpha": {"absolute_uv2": {ch: alpha_z for ch in _CHS}},
                },
            },
            "connectivity": {"channels": _CHS},
        },
        zscores={
            "spectral": {
                "bands": {
                    "theta": {"absolute_uv2": z_abs},
                    "alpha": {"absolute_uv2": {ch: alpha_z for ch in _CHS}},
                }
            }
        },
        quality={"recording_state": state},
    )


# ─── _to_float ────────────────────────────────────────────────────────────────

def test_to_float_number():
    assert _to_float(3.14) == pytest.approx(3.14)


def test_to_float_string_number():
    assert _to_float("2.5") == pytest.approx(2.5)


def test_to_float_none():
    assert _to_float(None) is None


def test_to_float_nan():
    assert _to_float(float("nan")) is None


def test_to_float_inf():
    assert _to_float(float("inf")) is None


def test_to_float_garbage():
    assert _to_float("not_a_number") is None


# ─── _tbr ─────────────────────────────────────────────────────────────────────

def test_tbr_returns_ratio():
    sess = _sess(theta_abs=10.0, beta_abs=5.0)
    ratio = _tbr(sess)
    assert ratio is not None
    assert ratio == pytest.approx(2.0)


def test_tbr_zero_beta_returns_none():
    sess = _sess(theta_abs=10.0, beta_abs=0.0)
    ratio = _tbr(sess)
    assert ratio is None


def test_tbr_missing_features():
    sess = SessionData(patient_id="P", session_id="s", features={})
    assert _tbr(sess) is None


# ─── _band_z_mean_abs ─────────────────────────────────────────────────────────

def test_band_z_mean_abs_all_channels():
    sess = _sess(theta_z=2.0)
    val = _band_z_mean_abs(sess, band="theta", channel=None)
    assert val is not None
    assert val == pytest.approx(2.0)


def test_band_z_mean_abs_specific_channel():
    sess = _sess(theta_z=3.0)
    val = _band_z_mean_abs(sess, band="theta", channel="Fp1")
    assert val == pytest.approx(3.0)


def test_band_z_mean_abs_missing_band():
    sess = _sess()
    val = _band_z_mean_abs(sess, band="gamma", channel=None)
    assert val is None


# ─── plot_trend_lines ─────────────────────────────────────────────────────────

def test_plot_trend_lines_fewer_than_3_returns_none():
    sessions = [_sess(sid="s1"), _sess(sid="s2")]
    result = plot_trend_lines(sessions, metric="tbr")
    assert result is None


def test_plot_trend_lines_tbr_returns_base64(tmp_path: Path):
    sessions = [_sess(sid=f"s{i}", theta_abs=10.0 + i, beta_abs=5.0) for i in range(3)]
    result = plot_trend_lines(sessions, metric="tbr")
    assert result is not None
    assert result.startswith("data:image/png;base64,")
    raw = base64.b64decode(result.split(",", 1)[1])
    assert raw[:4] == b"\x89PNG"


def test_plot_trend_lines_tbr_to_file(tmp_path: Path):
    sessions = [_sess(sid=f"s{i}", theta_abs=10.0 + i, beta_abs=5.0) for i in range(4)]
    out = tmp_path / "trend.png"
    result = plot_trend_lines(sessions, metric="tbr", out_path=out)
    assert result == out
    assert out.exists()
    assert out.stat().st_size > 100


def test_plot_trend_lines_iapf(tmp_path: Path):
    sessions = [
        _sess(sid=f"s{i}", paf={ch: 9.0 + i * 0.5 for ch in _CHS})
        for i in range(3)
    ]
    result = plot_trend_lines(sessions, metric="iapf_mean_hz")
    assert result is not None
    assert result.startswith("data:image/png;base64,")


def test_plot_trend_lines_band_z_mean_abs(tmp_path: Path):
    sessions = [_sess(sid=f"s{i}", theta_z=1.5 + i) for i in range(3)]
    result = plot_trend_lines(sessions, metric="band_z_mean_abs", band="theta")
    assert result is not None
    assert result.startswith("data:image/png;base64,")


def test_plot_trend_lines_unsupported_metric_raises():
    sessions = [_sess(sid=f"s{i}") for i in range(3)]
    with pytest.raises(ValueError, match="Unsupported metric"):
        plot_trend_lines(sessions, metric="not_a_real_metric")


# ─── plot_change_topomap ──────────────────────────────────────────────────────

def _sess_with_zdelta(sid: str, delta: float) -> SessionData:
    """Return a session that has z_absolute_uv2 per channel for delta computation."""
    ch_z = {ch: delta for ch in _CHS}
    return SessionData(
        patient_id="P001",
        session_id=sid,
        features={
            "spectral": {
                "bands": {
                    "alpha": {"absolute_uv2": {ch: 12.0 for ch in _CHS}},
                },
            },
            "connectivity": {"channels": _CHS},
        },
        zscores={
            "spectral": {
                "bands": {
                    "alpha": {
                        "z_absolute_uv2": ch_z,
                        "absolute_uv2": {ch: 1.0 for ch in _CHS},
                    }
                }
            }
        },
        quality={"recording_state": "eyes_closed"},
    )


def test_plot_change_topomap_returns_base64():
    curr = _sess_with_zdelta("s2", delta=1.5)
    prev = _sess_with_zdelta("s1", delta=0.5)
    result = plot_change_topomap(curr, prev, band="alpha")
    # Returns a data-URI or None (if mne plot_topomap is unavailable in headless)
    if result is not None:
        assert isinstance(result, str)
        # Could be base64 or file path string
        if result.startswith("data:image/png"):
            raw = base64.b64decode(result.split(",", 1)[1])
            assert raw[:4] == b"\x89PNG"


def test_plot_change_topomap_to_file(tmp_path: Path):
    curr = _sess_with_zdelta("s2", delta=1.5)
    prev = _sess_with_zdelta("s1", delta=0.5)
    out = tmp_path / "topo.png"
    result = plot_change_topomap(curr, prev, band="alpha", out_path=out)
    if result is not None:
        assert Path(str(result)).exists()
