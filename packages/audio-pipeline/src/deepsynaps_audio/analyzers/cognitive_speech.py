"""Cognitive speech analysis — paralinguistic features from audio and linguistic features from text.

Transcripts are supplied by upstream ASR; this module does not call ASR.

Research/wellness positioning: scores are monitoring indicators, not diagnoses.
"""

from __future__ import annotations

import logging
import math
import re
from typing import Union

import numpy as np

from ..schemas import (
    AcousticFeatureSet,
    CognitiveSpeechRiskScore,
    LinguisticFeatures,
    ParalinguisticCognitiveFeatures,
    VoiceAsset,
    VoiceSegment,
)

logger = logging.getLogger(__name__)

VoiceInput = Union[VoiceSegment, VoiceAsset]

# Provenance for bundled baseline models (hash-stable minor bumps only).
BASELINE_COGNITIVE_LR_VERSION = "1.0.0"
BASELINE_COGNITIVE_LR_WEIGHTS: dict[str, float] = {
    "speech_rate_wpm": -0.012,
    "pause_time_ratio": 0.85,
    "mean_pause_duration_s": 0.35,
    "f0_variability_hz": -0.018,
    "intensity_variability_db": -0.04,
    "type_token_ratio": -0.55,
    "mtld": -0.015,
    "repetition_ratio": 0.9,
    "coherence_score": -0.75,
    "mean_sentence_length": -0.06,
}
BASELINE_COGNITIVE_LR_BIAS = 0.35

_MODEL_REGISTRY: dict[str, tuple[str, dict[str, float], float]] = {
    "baseline_cognitive_lr": (
        BASELINE_COGNITIVE_LR_VERSION,
        BASELINE_COGNITIVE_LR_WEIGHTS,
        BASELINE_COGNITIVE_LR_BIAS,
    ),
}


def extract_paralinguistic_cognitive_features(
    segment: VoiceInput,
    *,
    features: AcousticFeatureSet | None = None,
) -> ParalinguisticCognitiveFeatures:
    """Extract pausing, rate, and prosodic-variability features from a voice clip.

    When ``features`` is supplied, F0 / intensity variability may be taken from
    precomputed acoustic descriptors. When raw ``waveform`` is absent, pause and
    rate features default to zero and ``extraction_notes`` records the gap.

    Parameters
    ----------
    segment
        :class:`VoiceSegment` (time slice with waveform) or :class:`VoiceAsset`
        (full clip; optional waveform).
    features
        Optional :class:`AcousticFeatureSet` from the acoustic pipeline.
    """

    notes: list[str] = []
    sr, duration_s, waveform = _resolve_waveform(segment)

    if waveform is None or len(waveform) == 0:
        notes.append("no_raw_audio_waveform")
        f0_var = float(features.f0_sd_hz) if features and features.f0_sd_hz is not None else 0.0
        int_var = (
            float(features.intensity_sd_db) if features and features.intensity_sd_db is not None else 0.0
        )
        return ParalinguisticCognitiveFeatures(
            speech_rate_wpm=0.0,
            articulation_rate_syl_per_s=0.0,
            pause_count=0,
            pause_mean_s=0.0,
            pause_sd_s=0.0,
            pause_time_ratio=0.0,
            mean_pause_duration_s=0.0,
            f0_variability_hz=f0_var,
            intensity_variability_db=int_var,
            syllable_count_est=0,
            word_count_est=0,
            extraction_notes=notes,
        )

    x = np.asarray(waveform, dtype=np.float64)
    if x.ndim > 1:
        x = np.mean(x, axis=0)
    n = len(x)
    if n < 8:
        notes.append("waveform_too_short")
        return _minimal_paralinguistic(duration_s, features, notes)

    # Frame energy envelope (RMS, 25 ms window, 10 ms hop).
    frame_len = max(1, int(0.025 * sr))
    hop = max(1, int(0.010 * sr))
    rms = _frame_rms(x, frame_len, hop)
    times = (np.arange(len(rms)) * hop + frame_len // 2) / sr
    if len(rms) == 0:
        notes.append("no_frames")
        return _minimal_paralinguistic(duration_s, features, notes)

    voiced = rms > (np.median(rms) * 0.15 + 1e-12)
    speech_time_s = float(np.sum(voiced) * hop / sr)
    speech_time_s = max(speech_time_s, 1e-6)

    # Pause segments: continuous non-voiced runs longer than 250 ms.
    pause_threshold_s = 0.25
    pauses = _silence_durations(voiced, hop / sr, pause_threshold_s)

    pause_count = len(pauses)
    pause_mean = float(np.mean(pauses)) if pauses else 0.0
    pause_sd = float(np.std(pauses)) if len(pauses) > 1 else 0.0
    total_pause_s = float(np.sum(pauses)) if pauses else 0.0
    dur = float(duration_s) if duration_s > 0 else float(n / sr)
    pause_time_ratio = float(min(1.0, total_pause_s / max(dur, 1e-6)))
    mean_pause_dur = pause_mean

    # Word / syllable proxies from envelope peaks (local maxima).
    smooth_rms = _moving_average(rms, max(1, int(0.05 * sr / hop)))
    peaks = _peak_pick(smooth_rms, hop, sr)
    word_est = max(1, len(peaks))
    syllable_est = max(1, int(round(word_est * 1.25)))

    speech_min = speech_time_s / 60.0
    speech_rate_wpm = float(word_est / max(speech_min, 1e-6))
    articulation_rate = float(syllable_est / max(speech_time_s, 1e-6))

    if features and features.f0_sd_hz is not None:
        f0_var = float(features.f0_sd_hz)
    else:
        f0_var = float(_spectral_centroid_std_hz(x, sr, frame_len, hop))

    if features and features.intensity_sd_db is not None:
        int_var = float(features.intensity_sd_db)
    else:
        db_frames = 20.0 * np.log10(rms + 1e-12)
        int_var = float(np.std(db_frames))

    return ParalinguisticCognitiveFeatures(
        speech_rate_wpm=speech_rate_wpm,
        articulation_rate_syl_per_s=articulation_rate,
        pause_count=pause_count,
        pause_mean_s=pause_mean,
        pause_sd_s=pause_sd,
        pause_time_ratio=pause_time_ratio,
        mean_pause_duration_s=mean_pause_dur,
        f0_variability_hz=f0_var,
        intensity_variability_db=int_var,
        syllable_count_est=syllable_est,
        word_count_est=word_est,
        extraction_notes=notes,
    )


def extract_linguistic_features(transcript: str) -> LinguisticFeatures:
    """Compute lexical richness, repetition, length, and a simple coherence proxy.

    Uses tokenizer-light heuristics suitable for offline tests without spaCy.
    """

    text = transcript.strip()
    if not text:
        return LinguisticFeatures(
            type_token_ratio=0.0,
            mtld=0.0,
            brunet_w=0.0,
            honore_r=0.0,
            mean_sentence_length=0.0,
            repetition_ratio=0.0,
            coherence_score=0.5,
            noun_ratio=0.0,
            verb_ratio=0.0,
            pronoun_ratio=0.0,
            idea_density=None,
        )

    sentences = [s.strip() for s in re.split(r"[.!?]+", text) if s.strip()]
    tokens = _tokenize(text)
    lower_tokens = [t.lower() for t in tokens]
    n_tokens = len(lower_tokens)
    n_unique = len(set(lower_tokens))
    types = n_unique
    token_total = max(n_tokens, 1)

    ttr = types / token_total

    mtld = _mtld(lower_tokens)
    brunet_w = float(types ** (-0.165) * (token_total**0.165)) if types > 0 else 0.0
    # Honoré's R — stabilised when V approaches N (avoid division blow-up).
    if types > 1 and token_total > types:
        denom = 1.0 - ((types - 1.0) ** 2) / ((token_total - 1.0) ** 2)
        honore_r = (100.0 * math.log(token_total)) / denom if denom > 1e-9 else float(types)
    elif types > 1:
        honore_r = float(types)
    else:
        honore_r = 0.0

    mean_sent_len = (
        float(np.mean([len(_tokenize(s)) for s in sentences])) if sentences else float(n_tokens)
    )

    repetition_ratio = _repetition_ratio(lower_tokens)

    # Lexical cohesion proxy: average pairwise bigram repetition / continuity.
    coherence_score = _coherence_simple(tokens)

    noun_ratio, verb_ratio, pron_ratio = _pos_ratios_heuristic(lower_tokens)

    idea_density = types / max(len(sentences), 1)

    return LinguisticFeatures(
        type_token_ratio=float(ttr),
        mtld=float(mtld),
        brunet_w=float(brunet_w),
        honore_r=float(honore_r),
        mean_sentence_length=float(mean_sent_len),
        repetition_ratio=float(repetition_ratio),
        coherence_score=float(coherence_score),
        noun_ratio=float(noun_ratio),
        verb_ratio=float(verb_ratio),
        pronoun_ratio=float(pron_ratio),
        idea_density=float(idea_density),
    )


def score_cognitive_speech_risk(
    paralinguistic: ParalinguisticCognitiveFeatures,
    linguistic: LinguisticFeatures | None = None,
    *,
    model_name: str = "baseline_cognitive_lr",
) -> CognitiveSpeechRiskScore:
    """Map paralinguistic (+ optional linguistic) features to a 0–1 risk score.

    The bundled ``baseline_cognitive_lr`` is a transparent weighted sum + logistic
    squashing — suitable for research monitoring, not diagnostic labels.
    """

    if model_name not in _MODEL_REGISTRY:
        logger.warning("Unknown cognitive speech model %r; falling back to baseline_cognitive_lr", model_name)
        model_name = "baseline_cognitive_lr"

    version, weights, bias = _MODEL_REGISTRY[model_name]
    z = bias
    drivers: list[str] = []

    def add_term(name: str, value: float, w: float) -> None:
        nonlocal z
        contrib = w * value
        z += contrib
        if abs(contrib) > 0.05:
            drivers.append(f"{name}={value:.4f}*{w:.4f}")

    add_term("speech_rate_wpm", paralinguistic.speech_rate_wpm, weights["speech_rate_wpm"])
    add_term("pause_time_ratio", paralinguistic.pause_time_ratio, weights["pause_time_ratio"])
    add_term("mean_pause_duration_s", paralinguistic.mean_pause_duration_s, weights["mean_pause_duration_s"])
    add_term("f0_variability_hz", paralinguistic.f0_variability_hz, weights["f0_variability_hz"])
    add_term(
        "intensity_variability_db",
        paralinguistic.intensity_variability_db,
        weights["intensity_variability_db"],
    )

    linguistic_used = linguistic is not None
    if linguistic is not None:
        add_term("type_token_ratio", linguistic.type_token_ratio, weights["type_token_ratio"])
        add_term("mtld", linguistic.mtld, weights["mtld"])
        add_term("repetition_ratio", linguistic.repetition_ratio, weights["repetition_ratio"])
        add_term("coherence_score", linguistic.coherence_score, weights["coherence_score"])
        add_term("mean_sentence_length", linguistic.mean_sentence_length, weights["mean_sentence_length"])
    else:
        # Missing linguistic branch: distribute neutral priors so score stays stable.
        z += 0.08

    score = float(1.0 / (1.0 + math.exp(-z)))
    score = max(0.0, min(1.0, score))

    confidence = 0.55 if not linguistic_used else 0.72

    return CognitiveSpeechRiskScore(
        score=score,
        model_name=model_name,
        model_version=version,
        confidence=confidence,
        drivers=sorted(drivers)[:12],
        linguistic_features_used=linguistic_used,
    )


# --- internals ---------------------------------------------------------


def _resolve_waveform(segment: VoiceInput) -> tuple[int, float, list[float] | None]:
    if isinstance(segment, VoiceSegment):
        sr = segment.sample_rate_hz
        wf = segment.waveform
        dur = max(0.0, segment.end_s - segment.start_s)
        if wf is not None and len(wf) > 0 and sr > 0:
            dur = len(wf) / float(sr)
        return sr, dur, wf
    sr = segment.sample_rate_hz
    wf = segment.waveform
    dur = float(segment.duration_s)
    if wf is not None and len(wf) > 0 and sr > 0:
        dur = len(wf) / float(sr)
    return sr, dur, wf


def _minimal_paralinguistic(
    duration_s: float,
    features: AcousticFeatureSet | None,
    notes: list[str],
) -> ParalinguisticCognitiveFeatures:
    f0_var = float(features.f0_sd_hz) if features and features.f0_sd_hz is not None else 0.0
    int_var = float(features.intensity_sd_db) if features and features.intensity_sd_db is not None else 0.0
    return ParalinguisticCognitiveFeatures(
        speech_rate_wpm=0.0,
        articulation_rate_syl_per_s=0.0,
        pause_count=0,
        pause_mean_s=0.0,
        pause_sd_s=0.0,
        pause_time_ratio=0.0,
        mean_pause_duration_s=0.0,
        f0_variability_hz=f0_var,
        intensity_variability_db=int_var,
        syllable_count_est=0,
        word_count_est=0,
        extraction_notes=notes + [f"duration_s={duration_s:.4f}"],
    )


def _frame_rms(x: np.ndarray, frame_len: int, hop: int) -> np.ndarray:
    out: list[float] = []
    n = len(x)
    i = 0
    while i + frame_len <= n:
        frame = x[i : i + frame_len]
        out.append(float(np.sqrt(np.mean(frame**2))))
        i += hop
    return np.asarray(out, dtype=np.float64)


def _moving_average(a: np.ndarray, win: int) -> np.ndarray:
    if win <= 1:
        return a
    kernel = np.ones(win, dtype=np.float64) / win
    return np.convolve(a, kernel, mode="same")


def _silence_durations(voiced: np.ndarray, frame_dur_s: float, min_pause_s: float) -> list[float]:
    pauses: list[float] = []
    run = 0
    for v in voiced:
        if not v:
            run += 1
        else:
            if run > 0:
                dur = run * frame_dur_s
                if dur >= min_pause_s:
                    pauses.append(dur)
            run = 0
    if run > 0:
        dur = run * frame_dur_s
        if dur >= min_pause_s:
            pauses.append(dur)
    return pauses


def _peak_pick(smooth_rms: np.ndarray, hop: int, sr: int) -> np.ndarray:
    if len(smooth_rms) < 3:
        return np.array([], dtype=int)
    dist = max(1, int(0.15 * sr / hop))
    prom = float(np.std(smooth_rms) * 0.35 + 1e-12)
    try:
        from scipy.signal import find_peaks

        peaks, _ = find_peaks(smooth_rms, distance=dist, prominence=prom)
        return peaks
    except Exception:
        # Fallback: simple maxima
        idx = [i for i in range(1, len(smooth_rms) - 1) if smooth_rms[i] > smooth_rms[i - 1] and smooth_rms[i] > smooth_rms[i + 1]]
        return np.asarray(idx, dtype=int)


def _spectral_centroid_std_hz(x: np.ndarray, sr: int, frame_len: int, hop: int) -> float:
    cents: list[float] = []
    n = len(x)
    freqs = np.fft.rfftfreq(frame_len, d=1.0 / sr)
    i = 0
    while i + frame_len <= n:
        frame = x[i : i + frame_len] * np.hanning(frame_len)
        mag = np.abs(np.fft.rfft(frame)) + 1e-12
        centroid = float(np.sum(freqs * mag) / np.sum(mag))
        cents.append(centroid)
        i += hop
    if not cents:
        return 0.0
    return float(np.std(cents))


def _tokenize(text: str) -> list[str]:
    return re.findall(r"[A-Za-z']+", text)


def _mtld(tokens: list[str]) -> float:
    if len(tokens) < 2:
        return float(len(set(tokens)))
    factor_lengths: list[int] = []
    factors = 0
    types: set[str] = set()
    for t in tokens:
        types.add(t)
        factors += 1
        if len(types) / factors <= 0.72:
            factor_lengths.append(factors)
            types.clear()
            factors = 0
    if factors > 0:
        factor_lengths.append(factors)
    if not factor_lengths:
        return float(len(set(tokens)))
    return float(np.mean(factor_lengths))


def _repetition_ratio(tokens: list[str]) -> float:
    if len(tokens) < 2:
        return 0.0
    repeats = sum(1 for i in range(1, len(tokens)) if tokens[i] == tokens[i - 1])
    return float(repeats / (len(tokens) - 1))


def _coherence_simple(tokens: list[str]) -> float:
    if len(tokens) < 2:
        return 0.5
    bigrams = [(tokens[i].lower(), tokens[i + 1].lower()) for i in range(len(tokens) - 1)]
    uniq = len(set(bigrams))
    return float(uniq / len(bigrams))


def _pos_ratios_heuristic(tokens: list[str]) -> tuple[float, float, float]:
    """Very small closed-class heuristic — English-oriented fallback."""

    pronouns = {
        "i",
        "you",
        "he",
        "she",
        "it",
        "we",
        "they",
        "me",
        "him",
        "her",
        "us",
        "them",
        "my",
        "your",
        "his",
        "its",
        "our",
        "their",
    }
    aux_verbs = {
        "is",
        "are",
        "was",
        "were",
        "be",
        "been",
        "being",
        "have",
        "has",
        "had",
        "do",
        "does",
        "did",
        "will",
        "would",
        "could",
        "should",
        "may",
        "might",
        "must",
        "can",
    }
    noun_suffix = ("tion", "ness", "ment", "ity", "ance", "ence")
    n = len(tokens)
    if n == 0:
        return 0.0, 0.0, 0.0
    pron = sum(1 for t in tokens if t in pronouns)
    verb = sum(1 for t in tokens if t in aux_verbs or t.endswith("ing") or t.endswith("ed"))
    noun = sum(
        1
        for t in tokens
        if t not in pronouns and t not in aux_verbs and not t.endswith("ing") and not t.endswith("ed")
    )
    # Renormalise so they sum ~1
    total = pron + verb + noun + 1e-9
    return pron / total, verb / total, noun / total
