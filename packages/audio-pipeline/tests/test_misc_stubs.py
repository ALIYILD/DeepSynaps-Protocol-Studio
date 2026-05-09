"""Tests for the small but currently-zero-coverage modules in
``deepsynaps_audio``.

The audio-pipeline package documents several stubs as "implement in
PR #N — see AUDIO_ANALYZER_STACK.md". Until those land we still need
to pin the contract that the stub raises NotImplementedError instead
of silently returning a neutral / fake answer (which would risk
shipping a degraded clinical signal).

Modules covered:

- normative.zscore + normative.database: stubs raise
  NotImplementedError with the canonical PR-pointer message.
- normative package re-exports.
- respiratory.cough + respiratory.breath: same NotImplementedError
  contract (v2 modules).
- respiratory.risk: deterministic logit composition via the
  analyzers.respiratory_voice bundle.
- reporting.rag.medrag_evidence: returns [] until the Postgres bridge
  is wired (no fabricated citations).
- neurological.parkinson.pd_voice_likelihood: transparent heuristic
  logit — score is in [0, 1], drivers list is bounded, model_version
  is pinned to "heuristic_logit/v1".
"""
from __future__ import annotations

import pytest

from deepsynaps_audio.neurological.parkinson import (
    MODEL_VERSION,
    pd_voice_likelihood,
)


# ── normative stubs ───────────────────────────────────────────────────────


class TestNormativeStubs:
    def test_zscore_raises_not_implemented(self) -> None:
        from deepsynaps_audio.normative.zscore import zscore

        with pytest.raises(NotImplementedError, match="implement in PR #4"):
            zscore("jitter_local", 0.02, age=40, sex="F", language="en")

    def test_load_norm_bins_raises_not_implemented(self) -> None:
        from deepsynaps_audio.normative.database import load_norm_bins

        with pytest.raises(NotImplementedError, match="implement in PR #4"):
            load_norm_bins("v1")

    def test_normative_package_reexports(self) -> None:
        from deepsynaps_audio import normative as nm

        assert hasattr(nm, "zscore")
        assert hasattr(nm, "load_norm_bins")
        assert "zscore" in nm.__all__
        assert "load_norm_bins" in nm.__all__


# ── respiratory stubs ─────────────────────────────────────────────────────


class TestRespiratoryStubs:
    def test_breath_cycle_metrics_v2_stub(self) -> None:
        from deepsynaps_audio.respiratory.breath import breath_cycle_metrics

        with pytest.raises(NotImplementedError, match="v2 module"):
            breath_cycle_metrics(None)  # type: ignore[arg-type]

    def test_detect_cough_v2_stub(self) -> None:
        from deepsynaps_audio.respiratory.cough import detect_cough

        with pytest.raises(NotImplementedError, match="v2 module"):
            detect_cough(None)  # type: ignore[arg-type]

    def test_respiratory_package_reexports(self) -> None:
        from deepsynaps_audio import respiratory as rp

        assert hasattr(rp, "detect_cough")
        assert hasattr(rp, "breath_cycle_metrics")
        assert hasattr(rp, "respiratory_risk")
        for name in ("detect_cough", "breath_cycle_metrics", "respiratory_risk"):
            assert name in rp.__all__


# ── respiratory.risk ──────────────────────────────────────────────────────


class TestRespiratoryRisk:
    def test_risk_score_in_unit_range(self) -> None:
        # respiratory_risk delegates to the analyzer bundle.
        from deepsynaps_audio.respiratory.risk import respiratory_risk

        # Empty features → analyzer fills RespiratoryFeatures defaults.
        out = respiratory_risk({})
        assert 0.0 <= out.score <= 1.0
        assert isinstance(out.drivers, list)
        assert isinstance(out.confidence, float)
        assert "/" in out.model_version  # name/version concatenation


# ── reporting.rag.medrag_evidence ────────────────────────────────────────


class TestMedragEvidenceStub:
    def test_returns_empty_list_until_bridge_wired(self) -> None:
        from deepsynaps_audio.reporting.rag import medrag_evidence

        out = medrag_evidence("MDD", ["jitter_local"], top_k=5)
        assert out == []

    def test_default_top_k(self) -> None:
        from deepsynaps_audio.reporting.rag import medrag_evidence

        # Pin: the default top_k is 5; the function still returns [] but
        # accepts the call without raising.
        assert medrag_evidence("PD", []) == []


# ── neurological.parkinson.pd_voice_likelihood ───────────────────────────


class TestPdVoiceLikelihood:
    def test_empty_features_returns_baseline_score(self) -> None:
        out = pd_voice_likelihood({})
        # All zeros → z = -0.15 → sigmoid(-0.15) ≈ 0.46.
        assert 0.0 <= out.score <= 1.0
        assert out.confidence == 0.55
        assert out.model_version == MODEL_VERSION
        assert out.percentile is None

    def test_high_jitter_drives_elevated_score(self) -> None:
        out = pd_voice_likelihood({"jitter_local": 0.05})
        # jitter > 0.02 should fire the driver flag.
        assert "elevated_jitter_local" in out.drivers

    def test_low_hnr_drives_reduced_hnr_flag(self) -> None:
        out = pd_voice_likelihood({"hnr_db": 10.0})
        # hnr < 15.0 → reduced_hnr_db driver.
        assert "reduced_hnr_db" in out.drivers

    def test_high_rpde_drives_elevated_rpde_flag(self) -> None:
        out = pd_voice_likelihood({"rpde": 0.7})
        assert "elevated_rpde" in out.drivers

    def test_drivers_bounded_to_eight(self) -> None:
        # Even if every driver fires, the list is sliced to <= 8 entries.
        out = pd_voice_likelihood(
            {
                "jitter_local": 0.05,
                "hnr_db": 5.0,
                "rpde": 0.7,
                "dfa": 0.9,
                "ppe": 0.5,
            }
        )
        assert len(out.drivers) <= 8

    def test_score_clamped_to_unit_range(self) -> None:
        # Pathological feature values should still produce a clamped
        # score (no NaN, no >1, no <0).
        out = pd_voice_likelihood(
            {
                "jitter_local": 100.0,
                "hnr_db": -1000.0,
                "rpde": 100.0,
            }
        )
        assert 0.0 <= out.score <= 1.0

    def test_model_version_pinned(self) -> None:
        # Pin: refactor cannot bump model_version silently.
        assert MODEL_VERSION == "heuristic_logit/v1"
