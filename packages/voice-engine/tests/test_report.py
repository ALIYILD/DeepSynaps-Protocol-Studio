"""Tests for packages/voice-engine/report.py.

All heavy imports (anthropic) remain inside _call_llm.
Module top is stdlib + dataclasses + the voice-engine imports.
No real LLM calls are made; _call_llm is always monkeypatched.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

_PKG = str(Path(__file__).parent.parent)
if _PKG not in sys.path:
    sys.path.insert(0, _PKG)

from biomarkers import BiomarkerFlags, BiomarkerResult
from emotion import EmotionPoint, EmotionResult
from scoring import RiskScoreResult
import report
from report import (
    ClinicalFinding,
    ClinicalVoiceReport,
    generate_clinical_report,
)


# ---------------------------------------------------------------------------
# Factories
# ---------------------------------------------------------------------------


def _moderate_risk() -> RiskScoreResult:
    return RiskScoreResult(
        depression_risk=0.45,
        anxiety_risk=0.40,
        stress_level=0.38,
        cognitive_load=0.35,
        risk_tier="moderate",
        flags=["High pause ratio", "Negative affect pattern"],
        model_name="rule-based-v1",
        fallback_used=True,
    )


def _minimal_biomarkers(**overrides) -> BiomarkerResult:
    defaults = dict(
        duration_sec=6.0,
        f0_mean_hz=180.0,
        f0_std_hz=20.0,
        f0_min_hz=120.0,
        f0_max_hz=240.0,
        f0_range_hz=120.0,
        jitter_local=0.01,
        jitter_rap=None,
        jitter_ppq5=None,
        jitter_ddp=None,
        shimmer_local=0.05,
        shimmer_apq3=None,
        shimmer_apq5=None,
        shimmer_apq11=None,
        shimmer_dda=None,
        hnr_db=15.0,
        mfcc_means=[0.0] * 13,
        mfcc_stds=[0.0] * 13,
        speech_rate_syllables_per_sec=3.5,
        pause_ratio=0.25,
        voice_breaks_count=1,
        cpp=None,
        flags=BiomarkerFlags(
            elevated_jitter=False,
            reduced_hnr=False,
            flat_f0_range=False,
            high_pause_ratio=False,
        ),
        extraction_warnings=[],
    )
    defaults.update(overrides)
    return BiomarkerResult(**defaults)


def _minimal_emotion(overall: str = "neutral") -> EmotionResult:
    timeline = [
        EmotionPoint(
            start=float(i),
            end=float(i + 1),
            emotion=overall,
            confidence=0.75,
            valence=0.1,
            arousal=0.2,
            clinical_tag=None,
        )
        for i in range(2)
    ]
    return EmotionResult(
        overall_emotion=overall,
        overall_confidence=0.75,
        timeline=timeline,
        model_name="test-stub",
        fallback_used=True,
    )


def _valid_llm_json() -> str:
    payload = {
        "summary": (
            "Voice analysis shows moderate signals consistent with mild changes "
            "in prosody and affect. Decision support only; clinical correlation "
            "is recommended before any care decision."
        ),
        "findings": [
            {
                "domain": "speech_quality",
                "observation": "Pause ratio is elevated relative to typical speech.",
                "clinical_significance": "May warrant correlation with self-report instruments.",
                "evidence_level": "moderate",
                "source_signals": ["high_pause_ratio", "pause_ratio"],
            },
            {
                "domain": "risk_indicators",
                "observation": "Moderate risk tier flagged by scoring model.",
                "clinical_significance": "Patterns consistent with signals warranting monitoring.",
                "evidence_level": "moderate",
                "source_signals": ["High pause ratio", "Negative affect pattern"],
            },
        ],
        "recommendations": [
            "Correlate with patient self-report (PHQ-9, GAD-7).",
            "Repeat assessment in 2-4 weeks.",
        ],
    }
    return json.dumps(payload)


# ---------------------------------------------------------------------------
# Test 1
# ---------------------------------------------------------------------------


def test_generate_clinical_report_basic_shape(monkeypatch):
    """LLM path: result has correct shape and all required fields."""
    monkeypatch.setattr(report, "_call_llm", lambda system_prompt, facts: _valid_llm_json())

    risk = _moderate_risk()
    bio = _minimal_biomarkers()
    emotion = _minimal_emotion("neutral")

    result = generate_clinical_report(risk, biomarkers=bio, emotion=emotion)

    assert isinstance(result, ClinicalVoiceReport)
    assert isinstance(result.summary, str) and result.summary.strip()
    assert isinstance(result.findings, list) and len(result.findings) > 0
    assert all(isinstance(f, ClinicalFinding) for f in result.findings)
    assert isinstance(result.recommendations, list) and len(result.recommendations) > 0
    assert all(isinstance(r, str) for r in result.recommendations)
    assert result.risk_tier == "moderate"
    assert set(result.raw_scores.keys()) == {
        "depression_risk", "anxiety_risk", "stress_level", "cognitive_load"
    }
    assert isinstance(result.raw_flags, list)
    assert isinstance(result.data_quality_notes, list)


# ---------------------------------------------------------------------------
# Test 2
# ---------------------------------------------------------------------------


def test_rule_based_fallback_used_on_llm_error(monkeypatch):
    """When _call_llm raises, fallback produces a non-empty report."""
    def _failing_llm(system_prompt, facts):
        raise RuntimeError("LLM down")

    monkeypatch.setattr(report, "_call_llm", _failing_llm)

    risk = _moderate_risk()
    bio = _minimal_biomarkers()
    emotion = _minimal_emotion("neutral")

    result = generate_clinical_report(risk, biomarkers=bio, emotion=emotion)

    assert isinstance(result, ClinicalVoiceReport)
    assert isinstance(result.summary, str) and result.summary.strip()
    assert isinstance(result.findings, list) and len(result.findings) > 0
    assert isinstance(result.recommendations, list) and len(result.recommendations) > 0


# ---------------------------------------------------------------------------
# Test 3
# ---------------------------------------------------------------------------


def test_data_quality_notes_include_sparse_flag_and_warnings(monkeypatch):
    """data_quality_notes must include biomarker warnings AND the sparse-data flag."""
    monkeypatch.setattr(report, "_call_llm", lambda system_prompt, facts: _valid_llm_json())

    warnings = [
        "F0 extraction failed: no voiced frames",
        "MFCC computation skipped",
    ]
    bio = _minimal_biomarkers(extraction_warnings=warnings)

    sparse_flag = "Limited acoustic evidence; score confidence reduced"
    risk = RiskScoreResult(
        depression_risk=0.20,
        anxiety_risk=0.18,
        stress_level=0.17,
        cognitive_load=0.16,
        risk_tier="low",
        flags=[sparse_flag],
        model_name="rule-based-v1",
        fallback_used=True,
    )

    result = generate_clinical_report(risk, biomarkers=bio)

    assert "F0 extraction failed: no voiced frames" in result.data_quality_notes
    assert "MFCC computation skipped" in result.data_quality_notes
    assert sparse_flag in result.data_quality_notes
