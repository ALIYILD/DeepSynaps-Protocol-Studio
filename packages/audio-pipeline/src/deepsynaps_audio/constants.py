"""Shared constants for the DeepSynaps Audio / Voice Analyzer.

Keep these in one place so neurological, cognitive, respiratory, and
reporting modules cannot drift out of sync.
"""

from __future__ import annotations

from typing import Final, Mapping, TypedDict


class TaskProtocol(TypedDict):
    target_sr: int
    min_duration_s: float


# Canonical task protocol catalogue. The portal recorder, QC stage,
# downstream analyzers, and reports all key off these slugs.
TASK_PROTOCOLS: Final[Mapping[str, TaskProtocol]] = {
    "sustained_vowel_a":       {"target_sr": 44100, "min_duration_s": 3.0},
    "sustained_vowel_a_long":  {"target_sr": 44100, "min_duration_s": 5.0},
    "reading_passage":         {"target_sr": 16000, "min_duration_s": 20.0},
    "counting_1_20":           {"target_sr": 16000, "min_duration_s": 6.0},
    "ddk_pataka":              {"target_sr": 16000, "min_duration_s": 5.0},
    "ddk_papapa":              {"target_sr": 16000, "min_duration_s": 5.0},
    "free_speech":             {"target_sr": 16000, "min_duration_s": 30.0},
    "picture_description":     {"target_sr": 16000, "min_duration_s": 30.0},
    "verbal_fluency_semantic": {"target_sr": 16000, "min_duration_s": 60.0},
    "verbal_fluency_phonemic": {"target_sr": 16000, "min_duration_s": 60.0},
    "voluntary_cough":         {"target_sr": 16000, "min_duration_s": 1.0},
    "deep_breath":             {"target_sr": 16000, "min_duration_s": 5.0},
}


# Quality-control thresholds. Override per-tenant via config when needed.
QC_DEFAULTS: Final[Mapping[str, float]] = {
    "lufs_target": -23.0,
    "lufs_min":    -30.0,
    "lufs_max":    -16.0,
    "peak_clip_dbfs":          -1.0,
    "peak_clip_max_fraction":  0.001,
    "snr_warn_db": 15.0,
    "snr_fail_db": 5.0,
    "vad_speech_ratio_warn_low":  0.3,
    "vad_speech_ratio_warn_high": 0.95,
    "min_native_sr": 8000,
}


# Speech band of interest and AVQI LTAS slope range.
SPEECH_BAND_HZ:   Final[tuple[float, float]] = (80.0, 8000.0)
LTAS_SLOPE_BAND_HZ: Final[tuple[float, float]] = (1000.0, 10000.0)


# F0 search ranges. Override per-recording when sex / age is known.
F0_RANGE_DEFAULT: Final[tuple[float, float]] = (75.0, 500.0)
F0_RANGE_ADULT_MALE:   Final[tuple[float, float]] = (60.0, 300.0)
F0_RANGE_ADULT_FEMALE: Final[tuple[float, float]] = (120.0, 500.0)


# Pipeline + report version stamps.
PIPELINE_VERSION: Final[str] = "0.1.0"
NORM_DB_VERSION:  Final[str] = "open-data-v0"
