"""Tests for ``deepsynaps_audio.longitudinal`` + ``clinician_facade``.

Pins the patient-as-own-baseline + clinician-facing facade contracts:

- delta_vs_baseline: Cohen's d-style effect size + MDC flag when the
  effect is small (< 0.2 in absolute value) — drives the clinician
  "is this a real change?" badge.
- timeline aggregates per-session feature dicts into parallel lists.
- clinician_facade:
  * extract_audio_metadata strips the waveform array (so JSON
    payloads stay small + don't leak audio).
  * gate_audio_for_analysis delegates to quality.gate.
  * score_pd_voice_risk delegates to pd_voice_likelihood and emits
    a dict (Pydantic model_dump).
- estimate_grbas stub returns the documented "uniform mid scores
  until CNN ships" envelope.
"""
from __future__ import annotations

from typing import Any
from unittest import mock
from uuid import UUID, uuid4

import pytest

from deepsynaps_audio.clinical_indices import estimate_grbas
from deepsynaps_audio.clinician_facade import (
    extract_audio_metadata,
    gate_audio_for_analysis,
    score_pd_voice_risk,
)
from deepsynaps_audio.longitudinal import delta_vs_baseline, timeline
from deepsynaps_audio.schemas import (
    Delta,
    GRBASScore,
    QCReport,
    Recording,
    Timeline,
)


# ── delta_vs_baseline ────────────────────────────────────────────────────


class TestDeltaVsBaseline:
    def test_envelope_shape(self) -> None:
        d = delta_vs_baseline("jitter_local", 0.022, 0.020)
        assert isinstance(d, Delta)
        assert d.feature == "jitter_local"
        assert d.current == 0.022
        assert d.baseline == 0.020
        assert d.raw_delta == pytest.approx(0.002, rel=1e-6)

    def test_pct_delta_normalised_by_abs_baseline(self) -> None:
        d = delta_vs_baseline("x", 12.0, 10.0)
        # (12-10) / 10 = 0.2.
        assert d.pct_delta == pytest.approx(0.2)

    def test_zero_baseline_does_not_div_by_zero(self) -> None:
        # Pin: baseline=0 must NOT raise; pct_delta is computed against
        # an epsilon so the dashboard never crashes on a fresh patient.
        d = delta_vs_baseline("x", 1.0, 0.0)
        assert isinstance(d, Delta)
        # pct_delta is a very large number (1.0 / 1e-12) but finite.
        assert d.pct_delta > 0.0

    def test_explicit_sd_baseline_overrides_default(self) -> None:
        d = delta_vs_baseline("x", 12.0, 10.0, sd_baseline=2.0)
        # Cohen's d = (12-10)/2 = 1.0.
        assert d.effect_size == pytest.approx(1.0)
        # Effect size 1.0 is large → MDC flag is False.
        assert d.minimum_detectable_change_flag is False

    def test_small_effect_size_trips_mdc_flag(self) -> None:
        # |effect_size| < 0.2 → MDC flag True. With baseline=10 and
        # default sd = 10 * 0.1 = 1, a 0.1 raw delta gives effect_size
        # = 0.1 → trips MDC.
        d = delta_vs_baseline("x", 10.1, 10.0)
        assert d.effect_size == pytest.approx(0.1, rel=1e-6)
        assert d.minimum_detectable_change_flag is True

    def test_default_sd_uses_10pct_of_baseline(self) -> None:
        d = delta_vs_baseline("x", 11.0, 10.0)
        # default sd = abs(10) * 0.1 = 1.0 → d = 1.0 / 1.0 = 1.0.
        assert d.effect_size == pytest.approx(1.0, rel=1e-3)


# ── timeline ─────────────────────────────────────────────────────────────


class TestTimeline:
    def test_aggregates_features_into_parallel_lists(self) -> None:
        patient_id = uuid4()
        s1 = uuid4()
        s2 = uuid4()
        s3 = uuid4()
        sessions = {
            s1: {"jitter_local": 0.020, "hnr_db": 22.0},
            s2: {"jitter_local": 0.022, "hnr_db": 21.0},
            s3: {"jitter_local": 0.024, "hnr_db": 20.0},
        }
        out = timeline(patient_id, sessions)
        assert isinstance(out, Timeline)
        assert out.patient_id == patient_id
        assert out.sessions == [s1, s2, s3]
        assert out.key_features["jitter_local"] == [0.020, 0.022, 0.024]
        assert out.key_features["hnr_db"] == [22.0, 21.0, 20.0]

    def test_empty_sessions_returns_empty_timeline(self) -> None:
        out = timeline(uuid4(), {})
        assert out.sessions == []
        assert out.key_features == {}

    def test_partial_features_per_session_handled(self) -> None:
        # Sessions with different feature sets — missing keys don't crash.
        patient_id = uuid4()
        sessions = {
            uuid4(): {"a": 1.0, "b": 2.0},
            uuid4(): {"a": 1.5},
        }
        out = timeline(patient_id, sessions)
        # 'a' has both points, 'b' has only one.
        assert len(out.key_features["a"]) == 2
        assert len(out.key_features["b"]) == 1


# ── clinician_facade.extract_audio_metadata ──────────────────────────────


class TestExtractAudioMetadata:
    def test_strips_waveform_from_payload(self) -> None:
        # Pin the safety contract: the JSON payload MUST NOT leak the
        # raw audio waveform. clinician_facade is the public API surface;
        # callers who get the metadata dict shouldn't accidentally dump
        # the audio array into a log or response body.
        rec = Recording(
            recording_id=uuid4(),
            task_protocol="sustained_vowel_a",
            sample_rate=16000,
            duration_s=1.0,
            n_samples=16000,
            waveform=[0.1, 0.2, 0.3] * 1000,  # large array
        )
        out = extract_audio_metadata(rec)
        assert "waveform" not in out
        assert out["task_protocol"] == "sustained_vowel_a"
        assert out["sample_rate"] == 16000

    def test_recording_id_serialised_as_string(self) -> None:
        rec = Recording(
            recording_id=uuid4(),
            task_protocol="x",
            sample_rate=16000,
            duration_s=1.0,
            n_samples=16000,
        )
        out = extract_audio_metadata(rec)
        # Pydantic serialises UUID as str in mode='json'.
        assert isinstance(out["recording_id"], str)


# ── clinician_facade.gate_audio_for_analysis ─────────────────────────────


class TestGateAudioForAnalysis:
    def test_pass_proceeds(self) -> None:
        report = QCReport(recording_id=uuid4(), verdict="pass")
        assert gate_audio_for_analysis(report) is True

    def test_warn_proceeds(self) -> None:
        report = QCReport(recording_id=uuid4(), verdict="warn")
        assert gate_audio_for_analysis(report) is True

    def test_fail_blocks(self) -> None:
        report = QCReport(recording_id=uuid4(), verdict="fail")
        assert gate_audio_for_analysis(report) is False


# ── clinician_facade.score_pd_voice_risk ─────────────────────────────────


class TestScorePdVoiceRisk:
    def test_returns_dict_with_score_drivers_model_version(self) -> None:
        out = score_pd_voice_risk({"jitter_local": 0.025, "hnr_db": 12.0})
        assert isinstance(out, dict)
        assert "score" in out
        assert "drivers" in out
        assert "model_version" in out
        assert 0.0 <= out["score"] <= 1.0

    def test_empty_features_still_returns_dict(self) -> None:
        # The PD likelihood path tolerates empty features.
        out = score_pd_voice_risk({})
        assert isinstance(out, dict)
        assert 0.0 <= out["score"] <= 1.0


# ── estimate_grbas stub ──────────────────────────────────────────────────


class TestEstimateGrbasStub:
    def test_returns_uniform_mid_scores_with_low_confidence(self) -> None:
        # Pin the stub contract: GRBAS without a CNN backend returns
        # uniform mid scores + low confidence (0.2). The clinician UI
        # treats this as a placeholder until the model ships.
        rec = Recording(
            recording_id=uuid4(),
            task_protocol="sustained_vowel_a",
            sample_rate=44100,
            duration_s=3.0,
            n_samples=44100 * 3,
        )
        out = estimate_grbas(rec)
        assert isinstance(out, GRBASScore)
        assert out.grade == 1
        assert out.roughness == 1
        assert out.breathiness == 1
        assert out.asthenia == 1
        assert out.strain == 1
        assert out.confidence == 0.2
