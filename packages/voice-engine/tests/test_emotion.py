"""Tests for emotion analysis — monkeypatched; no real SpeechBrain weights or librosa required."""

from __future__ import annotations

import emotion as em
from transcription import TranscriptSegment


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_segments(n: int) -> list[TranscriptSegment]:
    """Return *n* non-overlapping 1-second segments starting at t=0."""
    return [
        TranscriptSegment(start=float(i), end=float(i + 1), text=f"seg{i}", confidence=None)
        for i in range(n)
    ]


class _FakeClassifier:
    """Minimal stand-in for a SpeechBrain EncoderClassifier."""

    def classify_batch(self, waveform):
        # Returns (out_prob, score, index, text_lab) matching SpeechBrain signature
        out_prob = [[0.92]]
        score = [0.92]
        index = [0]
        text_lab = ["happy"]
        return out_prob, score, index, text_lab


# ---------------------------------------------------------------------------
# Test 1
# ---------------------------------------------------------------------------

def test_analyze_emotion_returns_timeline_matching_segments(monkeypatch, tmp_path):
    """Monkeypatched loader; 3 segments → timeline length == 3, canonical labels, valid v/a."""
    from pathlib import Path

    fixture = Path(__file__).parent / "fixtures" / "sample_16k.wav"

    fake_model = _FakeClassifier()

    monkeypatch.setattr(em, "_load_emotion_model_impl", lambda name, device: fake_model)
    em._EMOTION_MODEL_CACHE.clear()

    # load_audio_segment is patched — return a sentinel object; classify_segment_with_speechbrain
    # is also patched so the chunk type doesn't matter.
    _FAKE_CHUNK = object()
    monkeypatch.setattr(em, "load_audio_segment", lambda path, start, end: _FAKE_CHUNK)
    monkeypatch.setattr(
        em,
        "classify_segment_with_speechbrain",
        lambda model, chunk, sr: ("happy", 0.92),
    )

    segments = _make_segments(3)
    result = em.analyze_emotion(str(fixture), segments)

    assert isinstance(result, em.EmotionResult)
    assert len(result.timeline) == 3

    for pt in result.timeline:
        assert pt.emotion in em._CANONICAL_LABELS, f"Non-canonical label: {pt.emotion!r}"
        v, a = pt.valence, pt.arousal
        assert -1.0 <= v <= 1.0, f"valence {v} out of range"
        assert -1.0 <= a <= 1.0, f"arousal {a} out of range"

    em._EMOTION_MODEL_CACHE.clear()


# ---------------------------------------------------------------------------
# Test 2
# ---------------------------------------------------------------------------

def test_emotion_mapping_returns_valid_valence_arousal():
    """For every canonical label, valence and arousal are both in [-1, 1]."""
    for label in em._CANONICAL_LABELS:
        v, a = em.emotion_to_valence_arousal(label)
        assert -1.0 <= v <= 1.0, f"{label}: valence {v} out of range"
        assert -1.0 <= a <= 1.0, f"{label}: arousal {a} out of range"

    # Unknown label → (0.0, 0.0)
    v, a = em.emotion_to_valence_arousal("totally_unknown_label")
    assert v == 0.0
    assert a == 0.0


# ---------------------------------------------------------------------------
# Test 3
# ---------------------------------------------------------------------------

def test_affect_indicator_mapping_is_expected():
    """Key affect indicator mappings are correct; unknown label returns None."""
    assert em.emotion_to_affect_indicator("sad") == "depressed_affect"
    assert em.emotion_to_affect_indicator("fearful") == "anxious"
    assert em.emotion_to_affect_indicator("calm") == "normal"
    assert em.emotion_to_affect_indicator("neutral") == "normal"
    assert em.emotion_to_affect_indicator("angry") == "agitated"
    assert em.emotion_to_affect_indicator("disgust") == "distressed"
    assert em.emotion_to_affect_indicator("surprised") == "heightened_reactivity"
    assert em.emotion_to_affect_indicator("happy") == "normal"
    assert em.emotion_to_affect_indicator("not_a_real_label") is None


# ---------------------------------------------------------------------------
# Test 4
# ---------------------------------------------------------------------------

def test_fallback_path_returns_valid_emotion_result(monkeypatch, tmp_path):
    """get_emotion_model returns None → fallback path; result is valid."""
    from pathlib import Path

    fixture = Path(__file__).parent / "fixtures" / "sample_16k.wav"

    _FAKE_CHUNK = object()

    # Force fallback
    monkeypatch.setattr(em, "get_emotion_model", lambda: None)
    # Deterministic fallback classifier
    monkeypatch.setattr(em, "classify_segment_fallback", lambda chunk, sr: ("calm", 0.50))
    # Avoid real file I/O
    monkeypatch.setattr(em, "load_audio_segment", lambda path, start, end: _FAKE_CHUNK)

    em._EMOTION_MODEL_CACHE.clear()

    segments = _make_segments(3)
    result = em.analyze_emotion(str(fixture), segments)

    assert result.fallback_used is True
    assert result.model_name == "heuristic-mfcc-fallback"
    assert len(result.timeline) == 3

    for pt in result.timeline:
        assert pt.emotion in em._CANONICAL_LABELS, f"Non-canonical label: {pt.emotion!r}"

    em._EMOTION_MODEL_CACHE.clear()
