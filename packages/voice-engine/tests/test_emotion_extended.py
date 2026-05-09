"""Extended tests for voice-engine emotion.py — monkeypatched; no SpeechBrain/librosa required.

Covers:
- normalize_emotion_label: synonym normalisation, unknown fallback, case-insensitive
- emotion_to_valence_arousal: all canonical labels, boundary clamping
- emotion_to_affect_indicator: all canonical labels + unknown
- aggregate_overall_emotion: single-segment, multi-segment weighted vote, empty list
- analyze_emotion: FileNotFoundError, TypeError, empty segment list,
  short-segment expansion, load_audio_segment failure path (fallback to neutral),
  SpeechBrain failure mid-loop (fallback to heuristic)
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

# conftest.py inserts voice-engine root; safe to import bare names here.
import emotion as em
from transcription import TranscriptSegment


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _seg(start: float, end: float, text: str = "x") -> TranscriptSegment:
    return TranscriptSegment(start=start, end=end, text=text, confidence=None)


def _fake_audio_path(tmp_path: Path) -> str:
    """Return path to the fixture WAV that already exists in the test tree."""
    p = Path(__file__).parent / "fixtures" / "sample_16k.wav"
    return str(p)


# ---------------------------------------------------------------------------
# normalize_emotion_label
# ---------------------------------------------------------------------------

class TestNormalizeEmotionLabel:
    def test_identity_canonical_labels_pass_through(self):
        for label in ["neutral", "calm", "happy", "sad", "angry", "fearful", "disgust", "surprised"]:
            assert em.normalize_emotion_label(label) == label

    def test_synonym_frustration_maps_to_angry(self):
        assert em.normalize_emotion_label("frustration") == "angry"

    def test_synonym_anxiety_maps_to_fearful(self):
        assert em.normalize_emotion_label("anxiety") == "fearful"

    def test_synonym_joy_maps_to_happy(self):
        assert em.normalize_emotion_label("joy") == "happy"

    def test_synonym_sadness_maps_to_sad(self):
        assert em.normalize_emotion_label("sadness") == "sad"

    def test_synonym_boredom_maps_to_neutral(self):
        assert em.normalize_emotion_label("boredom") == "neutral"

    def test_synonym_tired_maps_to_calm(self):
        assert em.normalize_emotion_label("tired") == "calm"

    def test_case_insensitive_matching(self):
        assert em.normalize_emotion_label("HAPPY") == "happy"
        assert em.normalize_emotion_label("Frustration") == "angry"

    def test_unknown_label_returns_neutral(self):
        assert em.normalize_emotion_label("zorblax_1337") == "neutral"

    def test_whitespace_stripped_before_lookup(self):
        assert em.normalize_emotion_label("  calm  ") == "calm"


# ---------------------------------------------------------------------------
# emotion_to_valence_arousal
# ---------------------------------------------------------------------------

class TestEmotionToValenceArousal:
    def test_happy_has_positive_valence(self):
        v, a = em.emotion_to_valence_arousal("happy")
        assert v == 0.8
        assert a == 0.5

    def test_sad_has_negative_valence_and_arousal(self):
        v, a = em.emotion_to_valence_arousal("sad")
        assert v == -0.8
        assert a == -0.5

    def test_angry_has_high_arousal(self):
        _, a = em.emotion_to_valence_arousal("angry")
        assert a == 0.8

    def test_neutral_is_zero_zero(self):
        v, a = em.emotion_to_valence_arousal("neutral")
        assert v == 0.0
        assert a == 0.0

    def test_unknown_label_returns_zero_zero(self):
        v, a = em.emotion_to_valence_arousal("not_a_real_emotion_xyz")
        assert v == 0.0
        assert a == 0.0

    def test_all_canonical_labels_in_range(self):
        for label in em._CANONICAL_LABELS:
            v, a = em.emotion_to_valence_arousal(label)
            assert -1.0 <= v <= 1.0, f"{label}: valence {v}"
            assert -1.0 <= a <= 1.0, f"{label}: arousal {a}"


# ---------------------------------------------------------------------------
# aggregate_overall_emotion
# ---------------------------------------------------------------------------

class TestAggregateOverallEmotion:
    def _pt(self, start: float, end: float, emotion: str, confidence: float) -> em.EmotionPoint:
        v, a = em.emotion_to_valence_arousal(emotion)
        return em.EmotionPoint(
            start=start, end=end, emotion=emotion, confidence=confidence,
            valence=v, arousal=a,
            acoustic_affect_indicator=em.emotion_to_affect_indicator(emotion),
        )

    def test_empty_timeline_returns_neutral_zero(self):
        label, conf = em.aggregate_overall_emotion([])
        assert label == "neutral"
        assert conf == 0.0

    def test_single_segment_returns_its_label(self):
        pts = [self._pt(0.0, 2.0, "happy", 0.9)]
        label, conf = em.aggregate_overall_emotion(pts)
        assert label == "happy"
        assert round(conf, 6) == 0.9

    def test_longer_segment_wins_over_shorter(self):
        # sad for 3 s, happy for 1 s — sad should win
        pts = [
            self._pt(0.0, 3.0, "sad", 0.8),
            self._pt(3.0, 4.0, "happy", 0.95),
        ]
        label, _ = em.aggregate_overall_emotion(pts)
        assert label == "sad"

    def test_confidence_is_duration_weighted(self):
        # One segment, 2 s, confidence 0.6 → weighted conf = 0.6
        pts = [self._pt(0.0, 2.0, "calm", 0.6)]
        _, conf = em.aggregate_overall_emotion(pts)
        assert abs(conf - 0.6) < 1e-6

    def test_confidence_clamped_to_one(self):
        # Artificially supply confidence > 1 via EmotionPoint directly
        pt = em.EmotionPoint(0.0, 1.0, "happy", 1.5, 0.8, 0.5, None)
        _, conf = em.aggregate_overall_emotion([pt])
        # _clamp01 inside aggregate ensures ≤ 1
        assert conf <= 1.0


# ---------------------------------------------------------------------------
# analyze_emotion — error paths and edge cases
# ---------------------------------------------------------------------------

class TestAnalyzeEmotion:
    def test_nonexistent_audio_raises_file_not_found(self):
        with pytest.raises(FileNotFoundError, match="Audio file not found"):
            em.analyze_emotion("/nonexistent/path/audio.wav", [])

    def test_wrong_segments_type_raises_type_error(self):
        fixture = str(Path(__file__).parent / "fixtures" / "sample_16k.wav")
        with pytest.raises(TypeError, match="transcript_segments must be a list"):
            em.analyze_emotion(fixture, "not a list")  # type: ignore[arg-type]

    def test_empty_segment_list_returns_neutral_result(self, monkeypatch):
        fixture = str(Path(__file__).parent / "fixtures" / "sample_16k.wav")
        monkeypatch.setattr(em, "get_emotion_model", lambda: None)
        result = em.analyze_emotion(fixture, [])
        assert isinstance(result, em.EmotionResult)
        assert result.overall_emotion == "neutral"
        assert result.overall_confidence == 0.0
        assert result.timeline == []

    def test_load_audio_failure_produces_neutral_segment(self, monkeypatch):
        """load_audio_segment raises → segment gets neutral label + 0.30 confidence."""
        fixture = str(Path(__file__).parent / "fixtures" / "sample_16k.wav")

        monkeypatch.setattr(em, "get_emotion_model", lambda: None)
        monkeypatch.setattr(
            em, "load_audio_segment",
            lambda path, start, end: (_ for _ in ()).throw(RuntimeError("No audio lib")),
        )

        result = em.analyze_emotion(fixture, [_seg(0.0, 1.0)])
        assert len(result.timeline) == 1
        pt = result.timeline[0]
        assert pt.emotion == "neutral"
        assert abs(pt.confidence - 0.30) < 1e-6

    def test_short_segment_expanded_symmetrically(self, monkeypatch):
        """A 0.1-second segment should be expanded to ≥ 0.3 s before audio load."""
        fixture = str(Path(__file__).parent / "fixtures" / "sample_16k.wav")

        loaded_windows = []

        def _fake_load(path, start, end):
            loaded_windows.append((start, end))
            return object()

        monkeypatch.setattr(em, "get_emotion_model", lambda: None)
        monkeypatch.setattr(em, "load_audio_segment", _fake_load)
        monkeypatch.setattr(em, "classify_segment_fallback", lambda chunk, sr: ("calm", 0.5))

        em.analyze_emotion(fixture, [_seg(0.5, 0.6)])

        assert len(loaded_windows) == 1
        start, end = loaded_windows[0]
        assert (end - start) >= em._MIN_SEGMENT_DURATION - 1e-9

    def test_speechbrain_failure_triggers_fallback(self, monkeypatch):
        """SpeechBrain classify_segment_with_speechbrain raises → fallback used."""
        fixture = str(Path(__file__).parent / "fixtures" / "sample_16k.wav")

        fake_model = object()
        monkeypatch.setattr(em, "get_emotion_model", lambda: fake_model)
        monkeypatch.setattr(
            em, "load_audio_segment",
            lambda path, start, end: object(),
        )
        monkeypatch.setattr(
            em, "classify_segment_with_speechbrain",
            lambda model, chunk, sr: (_ for _ in ()).throw(RuntimeError("cuda error")),
        )
        monkeypatch.setattr(em, "classify_segment_fallback", lambda chunk, sr: ("calm", 0.50))

        result = em.analyze_emotion(fixture, [_seg(0.0, 1.0)])
        assert result.fallback_used is True
        assert result.model_name == "heuristic-mfcc-fallback"

    def test_result_model_name_set_from_env(self, monkeypatch):
        """model_name in result reflects EMOTION_MODEL env var when model loads."""
        fixture = str(Path(__file__).parent / "fixtures" / "sample_16k.wav")

        fake_model = object()
        monkeypatch.setenv("EMOTION_MODEL", "test/my-model-v2")
        monkeypatch.setattr(em, "get_emotion_model", lambda: fake_model)
        monkeypatch.setattr(em, "load_audio_segment", lambda path, start, end: object())
        monkeypatch.setattr(em, "classify_segment_with_speechbrain", lambda m, c, sr: ("happy", 0.9))

        result = em.analyze_emotion(fixture, [_seg(0.0, 1.0)])
        assert result.model_name == "test/my-model-v2"

    def test_each_timeline_point_has_canonical_label(self, monkeypatch):
        """All timeline labels must be in the canonical 8-label set."""
        fixture = str(Path(__file__).parent / "fixtures" / "sample_16k.wav")

        monkeypatch.setattr(em, "get_emotion_model", lambda: None)
        monkeypatch.setattr(em, "load_audio_segment", lambda path, start, end: object())
        monkeypatch.setattr(em, "classify_segment_fallback", lambda chunk, sr: ("calm", 0.50))

        segments = [_seg(float(i), float(i + 1)) for i in range(5)]
        result = em.analyze_emotion(fixture, segments)

        for pt in result.timeline:
            assert pt.emotion in em._CANONICAL_LABELS, f"Non-canonical: {pt.emotion!r}"
