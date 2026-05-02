"""Tests for voice biomarker reporting and longitudinal payload builders."""

from __future__ import annotations

import json
from datetime import datetime, timezone, timedelta

import pytest

from deepsynaps_audio.schemas import (
    AcousticFeatureSet,
    AudioQualityResult,
    CognitiveSpeechRiskScore,
    DysarthriaSeverityScore,
    PDVoiceRiskScore,
    RespiratoryRiskScore,
    VoiceQualityIndices,
    VoiceSegment,
    VoiceSessionReportPayload,
)
from deepsynaps_audio.voice_reporting import (
    generate_longitudinal_voice_summary,
    generate_voice_biomarker_report_payload,
)


def _synthetic_session_payload(
    session_id: str,
    patient_id: str | None = "p-1",
) -> VoiceSessionReportPayload:
    return generate_voice_biomarker_report_payload(
        session_id,
        patient_id=patient_id,
        acoustic_features=AcousticFeatureSet(
            f0_mean_hz=120.0,
            f0_sd_hz=8.2,
            intensity_mean_db=-18.0,
            intensity_sd_db=2.1,
            voiced_fraction=0.72,
        ),
        voice_quality=VoiceQualityIndices(avqi=2.1, dsi=-1.2, severity_band="mild"),
        pd_voice=PDVoiceRiskScore(
            score=0.35,
            model_name="pd_gbm",
            model_version="0.2.0",
            confidence=0.7,
            drivers=["jitter", "shimmer"],
            percentile=40.0,
        ),
        dysarthria=DysarthriaSeverityScore(
            severity=1.2,
            model_name="dys_lgbm",
            model_version="0.1.0",
            confidence=0.65,
            subtype_hint="hypokinetic",
            drivers=["ddk"],
        ),
        cognitive_speech=CognitiveSpeechRiskScore(
            score=0.22,
            model_name="baseline_cognitive_lr",
            model_version="1.0.0",
            confidence=0.7,
            drivers=["pause_time_ratio"],
            linguistic_features_used=True,
        ),
        respiratory=RespiratoryRiskScore(
            score=0.15,
            model_name="baseline_respiratory_lr",
            model_version="1.0.0",
            confidence=0.6,
            drivers=[],
        ),
        qc=AudioQualityResult(
            verdict="pass",
            loudness_lufs=-22.0,
            snr_db=22.0,
            clip_fraction=0.0,
            speech_ratio=0.5,
            reasons=[],
        ),
        task_segments={
            "sustained_vowel_a": VoiceSegment(
                start_s=0.0,
                end_s=3.0,
                sample_rate_hz=44100,
                waveform=[0.1, 0.2, 0.0],  # should not appear in payload
            )
        },
    )


def test_generate_voice_biomarker_report_payload_json_serializable() -> None:
    p = _synthetic_session_payload("sess-001")
    d = p.model_dump(mode="json")
    s = json.dumps(d)
    assert "waveform" not in s
    assert p.task_segment_refs["sustained_vowel_a"].duration_s == pytest.approx(3.0)
    assert p.task_segment_refs["sustained_vowel_a"].sample_rate_hz == 44100
    assert p.provenance.pipeline_version
    assert "pd_voice" in p.provenance.feature_sets_used
    assert "acoustic_descriptors" in p.provenance.models_used or p.acoustic_features is not None
    # round-trip
    p2 = VoiceSessionReportPayload.model_validate_json(s)
    assert p2.session_id == "sess-001"
    assert p2.pd_voice is not None and p2.pd_voice.score == pytest.approx(0.35)


def test_task_segment_refs_no_waveform() -> None:
    p = generate_voice_biomarker_report_payload(
        "s-2",
        task_segments={"ddk_pataka": VoiceSegment(start_s=1.0, end_s=2.0, sample_rate_hz=16000, waveform=[1.0] * 100)},
    )
    assert "ddk_pataka" in p.task_segment_refs
    assert p.task_segment_refs["ddk_pataka"].end_s == pytest.approx(2.0)
    raw = p.model_dump(mode="json")
    assert "waveform" not in json.dumps(raw)


def test_longitudinal_summary_order_and_deltas() -> None:
    t0 = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    t1 = t0 + timedelta(days=7)
    a = _synthetic_session_payload("a")
    b = _synthetic_session_payload("b")
    # Force ordering by generated_at (function uses "now" — override via model_copy)
    a2 = a.model_copy(update={"generated_at": t0, "session_id": "a"})
    b2 = b.model_copy(
        update={
            "generated_at": t1,
            "session_id": "b",
            "pd_voice": PDVoiceRiskScore(
                score=0.50,
                model_name="pd_gbm",
                model_version="0.2.0",
                confidence=0.7,
                drivers=[],
            ),
        }
    )
    summ = generate_longitudinal_voice_summary("patient-x", [b2, a2])  # out of order on purpose
    assert summ.n_sessions == 2
    assert summ.session_order == ["a", "b"]
    assert "pd_voice.score" in summ.trends
    assert summ.delta_first_last.get("pd_voice.score") == pytest.approx(0.15)
    j = json.dumps(summ.model_dump(mode="json"))
    assert "patient-x" in j
    assert summ.provenance.schema_version == "longitudinal_voice_summary/v1"


def test_minimal_payload_provenance() -> None:
    p = generate_voice_biomarker_report_payload("only-qc", qc=AudioQualityResult(verdict="warn", reasons=["loudness"]))
    assert p.provenance.feature_sets_used == ["quality_control"]
    long = generate_longitudinal_voice_summary("p", [p])
    assert long.n_sessions == 1
