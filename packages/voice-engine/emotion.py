"""Speech emotion recognition: SpeechBrain primary path + librosa heuristic fallback.

All heavy imports (speechbrain, torch, librosa) are lazy — inside functions —
so this module can be imported in CPU-only test environments without those
packages installed.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

from transcription import TranscriptSegment, _get_audio_duration

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Public dataclasses (stdlib only — safe at module top)
# ---------------------------------------------------------------------------

_MIN_SEGMENT_DURATION = 0.300  # seconds


@dataclass
class EmotionPoint:
    start: float
    end: float
    emotion: str
    confidence: float
    valence: float
    arousal: float
    clinical_tag: Optional[str]


@dataclass
class EmotionResult:
    overall_emotion: str
    overall_confidence: float
    timeline: list[EmotionPoint]
    model_name: str
    fallback_used: bool


# ---------------------------------------------------------------------------
# Canonical label set and mappings
# ---------------------------------------------------------------------------

_CANONICAL_LABELS = frozenset(
    {"neutral", "calm", "happy", "sad", "angry", "fearful", "disgust", "surprised"}
)

_LABEL_NORMALISATION: dict[str, str] = {
    # identity
    "neutral": "neutral",
    "calm": "calm",
    "happy": "happy",
    "sad": "sad",
    "angry": "angry",
    "fearful": "fearful",
    "disgust": "disgust",
    "surprised": "surprised",
    # common alternates
    "frustration": "angry",
    "frustrate": "angry",
    "anger": "angry",
    "fear": "fearful",
    "scared": "fearful",
    "anxiety": "fearful",
    "anxious": "fearful",
    "excitement": "happy",
    "excited": "happy",
    "joy": "happy",
    "joyful": "happy",
    "elated": "happy",
    "sadness": "sad",
    "depressed": "sad",
    "sorrow": "sad",
    "disgust": "disgust",
    "disgusted": "disgust",
    "distress": "disgust",
    "surprise": "surprised",
    "boredom": "neutral",
    "bored": "neutral",
    "tired": "calm",
    "relaxed": "calm",
    "pleased": "happy",
}

_CLINICAL_TAG_MAP: dict[str, str] = {
    "sad": "depressed_affect",
    "fearful": "anxious",
    "calm": "normal",
    "neutral": "normal",
    "happy": "normal",
    "angry": "agitated",
    "disgust": "distressed",
    "surprised": "heightened_reactivity",
}

_VALENCE_AROUSAL_MAP: dict[str, tuple[float, float]] = {
    "calm": (0.4, -0.4),
    "neutral": (0.0, 0.0),
    "happy": (0.8, 0.5),
    "sad": (-0.8, -0.5),
    "angry": (-0.7, 0.8),
    "fearful": (-0.8, 0.7),
    "disgust": (-0.6, 0.3),
    "surprised": (0.1, 0.8),
}


def normalize_emotion_label(raw: str) -> str:
    """Map a raw model label into the canonical 8-label set.

    Matching is case-insensitive. Unmapped labels return ``"neutral"``.
    """
    key = raw.strip().lower()
    if key in _LABEL_NORMALISATION:
        return _LABEL_NORMALISATION[key]
    if key in _CANONICAL_LABELS:
        return key
    return "neutral"


def emotion_to_valence_arousal(label: str) -> tuple[float, float]:
    """Return (valence, arousal) for a canonical label, clamped to [-1, 1].

    Unknown labels return (0.0, 0.0).
    """
    v, a = _VALENCE_AROUSAL_MAP.get(label, (0.0, 0.0))
    v = max(-1.0, min(1.0, v))
    a = max(-1.0, min(1.0, a))
    return v, a


def emotion_to_clinical_tag(label: str) -> Optional[str]:
    """Return the clinical tag for a canonical label, or None for unknown labels."""
    return _CLINICAL_TAG_MAP.get(label, None)


# ---------------------------------------------------------------------------
# Model cache — module-level singleton
# ---------------------------------------------------------------------------

_EMOTION_MODEL_CACHE: dict[str, Any] = {}


def _load_emotion_model_impl(name: str, device: str) -> Any:
    """Load the SpeechBrain emotion classifier onto *device*. Seam for monkeypatching."""
    from speechbrain.inference.classifiers import EncoderClassifier  # lazy import
    import torch  # lazy import  # noqa: F401

    logger.info("Loading emotion model '%s' onto device '%s'", name, device)
    classifier = EncoderClassifier.from_hparams(
        source=name,
        savedir=os.path.join(os.path.expanduser("~"), ".cache", "speechbrain", name.replace("/", "_")),
        run_opts={"device": device},
    )
    return classifier


def _detect_device() -> str:
    try:
        import torch  # lazy import

        return "cuda" if torch.cuda.is_available() else "cpu"
    except ImportError:
        return "cpu"


def get_emotion_model() -> Any | None:
    """Return a cached SpeechBrain emotion classifier, or None if it can't load.

    Model name from env ``EMOTION_MODEL``, default
    ``"speechbrain/emotion-recognition-wav2vec2-IEMOCAP"``.
    Never raises.
    """
    model_name = os.environ.get(
        "EMOTION_MODEL", "speechbrain/emotion-recognition-wav2vec2-IEMOCAP"
    )
    if model_name in _EMOTION_MODEL_CACHE:
        return _EMOTION_MODEL_CACHE[model_name]

    device = _detect_device()
    logger.info("get_emotion_model: name=%s  device=%s", model_name, device)
    try:
        model = _load_emotion_model_impl(model_name, device)
        _EMOTION_MODEL_CACHE[model_name] = model
        return model
    except Exception as exc:
        logger.warning("get_emotion_model: failed to load '%s': %s", model_name, exc)
        return None


# ---------------------------------------------------------------------------
# Audio segment loading
# ---------------------------------------------------------------------------


def load_audio_segment(audio_path: str, start: float, end: float) -> Any:
    """Load a slice of an audio file and return a numpy array at 16 kHz.

    Lazy-imports librosa (and scipy as fallback). Raises RuntimeError if
    neither is available.
    """
    try:
        import librosa  # lazy import

        y, _ = librosa.load(audio_path, sr=16000, offset=start, duration=max(end - start, 0.001))
        return y
    except ImportError:
        pass

    try:
        from scipy.io import wavfile  # lazy import
        import numpy as np  # lazy import

        rate, data = wavfile.read(audio_path)
        if data.ndim > 1:
            data = data[:, 0]
        data = data.astype(float)
        s_start = int(start * rate)
        s_end = int(end * rate)
        chunk = data[s_start:s_end]
        # Resample to 16000 if needed (simple linear interp)
        if rate != 16000:
            import numpy as np  # noqa: F811

            target_len = int(len(chunk) * 16000 / rate)
            chunk = np.interp(
                np.linspace(0, len(chunk), target_len),
                np.arange(len(chunk)),
                chunk,
            )
        return chunk
    except ImportError:
        pass

    raise RuntimeError(
        "Cannot load audio segment: neither librosa nor scipy is available."
    )


# ---------------------------------------------------------------------------
# Inference helpers
# ---------------------------------------------------------------------------


def classify_segment_with_speechbrain(
    model: Any, audio_chunk: Any, sr: int
) -> tuple[str, float]:
    """Run SpeechBrain classifier on *audio_chunk* and return (canonical_label, confidence)."""
    import torch  # lazy import
    import numpy as np  # lazy import

    if isinstance(audio_chunk, np.ndarray):
        waveform = torch.tensor(audio_chunk, dtype=torch.float32).unsqueeze(0)
    else:
        waveform = audio_chunk

    out_prob, score, index, text_lab = model.classify_batch(waveform)
    raw_label = text_lab[0] if isinstance(text_lab, (list, tuple)) else str(text_lab)
    confidence = float(score[0]) if hasattr(score, "__getitem__") else float(score)
    # Clamp confidence to [0, 1]
    confidence = max(0.0, min(1.0, confidence))
    label = normalize_emotion_label(raw_label)
    return label, confidence


def classify_segment_fallback(audio_chunk: Any, sr: int) -> tuple[str, float]:
    """Librosa-based heuristic classifier. Returns (canonical_label, confidence ~0.45-0.55).

    Features: MFCC mean, RMS energy, zero-crossing rate, optional pitch (yin).
    """
    try:
        import librosa  # lazy import
        import numpy as np  # lazy import

        y = audio_chunk.astype(float) if hasattr(audio_chunk, "astype") else audio_chunk

        rms = float(np.mean(librosa.feature.rms(y=y)))
        zcr = float(np.mean(librosa.feature.zero_crossing_rate(y=y)))

        pitch_hz: Optional[float] = None
        try:
            f0 = librosa.yin(y, fmin=50, fmax=600, sr=sr)
            valid = f0[(f0 > 50) & (f0 < 600)]
            if len(valid) > 0:
                pitch_hz = float(np.median(valid))
        except Exception:
            pass

        # Heuristic thresholds (calibrated for 16 kHz normalised audio)
        HIGH_RMS = 0.05
        LOW_RMS = 0.01
        HIGH_ZCR = 0.10
        HIGH_PITCH = 200.0

        if rms < LOW_RMS and zcr < HIGH_ZCR:
            if pitch_hz is not None and pitch_hz < HIGH_PITCH:
                return "sad", 0.45
            return "calm", 0.50
        if rms > HIGH_RMS and zcr > HIGH_ZCR:
            if pitch_hz is not None and pitch_hz > HIGH_PITCH:
                return "fearful", 0.45
            return "angry", 0.50
        return "neutral", 0.55

    except ImportError:
        return "neutral", 0.30


# ---------------------------------------------------------------------------
# Aggregation
# ---------------------------------------------------------------------------


def aggregate_overall_emotion(timeline: list[EmotionPoint]) -> tuple[str, float]:
    """Duration-weighted vote across the timeline.

    Returns the label with greatest total weight and its weighted mean confidence.
    """
    if not timeline:
        return "neutral", 0.0

    weight_sum: dict[str, float] = {}
    confidence_sum: dict[str, float] = {}

    for pt in timeline:
        dur = max(pt.end - pt.start, 0.0)
        weight_sum[pt.emotion] = weight_sum.get(pt.emotion, 0.0) + dur
        confidence_sum[pt.emotion] = confidence_sum.get(pt.emotion, 0.0) + pt.confidence * dur

    dominant = max(weight_sum, key=lambda k: weight_sum[k])
    total_dur = weight_sum[dominant]
    weighted_conf = confidence_sum[dominant] / total_dur if total_dur > 0 else 0.0
    return dominant, max(0.0, min(1.0, weighted_conf))


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


def analyze_emotion(
    audio_path: str,
    transcript_segments: list[TranscriptSegment],
) -> EmotionResult:
    """Analyse per-segment emotion and return a structured EmotionResult.

    Raises
    ------
    FileNotFoundError
        If *audio_path* does not exist on disk.
    TypeError
        If *transcript_segments* is not a list.
    """
    path = Path(audio_path)
    if not path.exists():
        raise FileNotFoundError(
            f"Audio file not found: {audio_path!r}. "
            "Ensure the file exists before running emotion analysis."
        )

    if not isinstance(transcript_segments, list):
        raise TypeError(
            f"transcript_segments must be a list, got {type(transcript_segments).__name__!r}."
        )

    model_name = os.environ.get(
        "EMOTION_MODEL", "speechbrain/emotion-recognition-wav2vec2-IEMOCAP"
    )

    model = get_emotion_model()
    fallback_used = model is None
    effective_model_name = model_name if not fallback_used else "heuristic-mfcc-fallback"

    # Determine audio duration for segment expansion
    audio_duration: Optional[float] = _get_audio_duration(audio_path)

    timeline: list[EmotionPoint] = []

    for seg in transcript_segments:
        start = seg.start
        end = seg.end
        duration = end - start
        low_confidence_penalty = 1.0

        # Expand short segments symmetrically
        if duration < _MIN_SEGMENT_DURATION:
            shortfall = _MIN_SEGMENT_DURATION - duration
            expand_each = shortfall / 2.0
            new_start = start - expand_each
            new_end = end + expand_each

            if audio_duration is not None:
                new_start = max(0.0, new_start)
                new_end = min(audio_duration, new_end)
                if (new_end - new_start) < _MIN_SEGMENT_DURATION:
                    low_confidence_penalty = 0.5
            else:
                new_start = max(0.0, new_start)
                if (new_end - new_start) < _MIN_SEGMENT_DURATION:
                    low_confidence_penalty = 0.5

            start = new_start
            end = new_end

        try:
            audio_chunk = load_audio_segment(audio_path, start, end)
        except Exception as exc:
            logger.warning("load_audio_segment failed for %s [%.2f-%.2f]: %s", audio_path, start, end, exc)
            # Fail gracefully — classify as neutral
            label = "neutral"
            confidence = 0.30 * low_confidence_penalty
            valence, arousal = emotion_to_valence_arousal(label)
            timeline.append(EmotionPoint(
                start=seg.start,
                end=seg.end,
                emotion=label,
                confidence=confidence,
                valence=valence,
                arousal=arousal,
                clinical_tag=emotion_to_clinical_tag(label),
            ))
            continue

        if model is not None:
            try:
                label, confidence = classify_segment_with_speechbrain(model, audio_chunk, 16000)
                if fallback_used:
                    effective_model_name = "heuristic-mfcc-fallback"
            except Exception as exc:
                logger.warning("SpeechBrain inference failed: %s", exc)
                label, confidence = classify_segment_fallback(audio_chunk, 16000)
                fallback_used = True
                effective_model_name = "heuristic-mfcc-fallback"
        else:
            label, confidence = classify_segment_fallback(audio_chunk, 16000)

        confidence = confidence * low_confidence_penalty
        valence, arousal = emotion_to_valence_arousal(label)

        timeline.append(EmotionPoint(
            start=seg.start,
            end=seg.end,
            emotion=label,
            confidence=confidence,
            valence=valence,
            arousal=arousal,
            clinical_tag=emotion_to_clinical_tag(label),
        ))

    if not timeline:
        # No segments — return a minimal valid result
        return EmotionResult(
            overall_emotion="neutral",
            overall_confidence=0.0,
            timeline=[],
            model_name=effective_model_name,
            fallback_used=fallback_used,
        )

    overall_emotion, overall_confidence = aggregate_overall_emotion(timeline)

    return EmotionResult(
        overall_emotion=overall_emotion,
        overall_confidence=overall_confidence,
        timeline=timeline,
        model_name=effective_model_name,
        fallback_used=fallback_used,
    )
