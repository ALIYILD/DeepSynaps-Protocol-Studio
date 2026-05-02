"""Pydantic dataclasses shared across the DeepSynaps Audio analyzer.

Every public function in the package returns one of these models (or
a list of them). No raw dicts on public boundaries.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


# --- ingestion -------------------------------------------------------


class Recording(BaseModel):
    """A single normalised audio take, mono float32, in-memory waveform."""

    recording_id: UUID
    task_protocol: str
    sample_rate: int
    duration_s: float
    n_samples: int
    channels: int = 1
    file_hash: Optional[str] = None
    source_path: Optional[str] = None
    recorder_fingerprint: Optional[str] = None
    captured_at: Optional[datetime] = None

    model_config = ConfigDict(arbitrary_types_allowed=True)


class Session(BaseModel):
    """A clinical voice session — one patient, multiple task takes."""

    session_id: UUID
    patient_id: UUID
    tenant_id: UUID
    recordings: dict[str, Recording] = Field(default_factory=dict)
    captured_at: Optional[datetime] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


# --- quality control --------------------------------------------------


QCVerdict = Literal["pass", "warn", "fail"]


class QCReport(BaseModel):
    recording_id: UUID
    lufs: Optional[float] = None
    peak_dbfs: Optional[float] = None
    clip_fraction: Optional[float] = None
    snr_db: Optional[float] = None
    speech_ratio: Optional[float] = None
    native_sample_rate: Optional[int] = None
    verdict: QCVerdict = "pass"
    reasons: list[str] = Field(default_factory=list)


# --- acoustic features -----------------------------------------------


class PitchSummary(BaseModel):
    f0_mean_hz: float
    f0_sd_hz: float
    f0_min_hz: float
    f0_max_hz: float
    f0_range_hz: float
    voiced_fraction: float


class PerturbationFeatures(BaseModel):
    jitter_local: float
    jitter_rap: float
    jitter_ppq5: float
    shimmer_local: float
    shimmer_apq3: float
    shimmer_apq5: float
    shimmer_apq11: float
    hnr_db: float
    nhr: float


class SpectralFeatures(BaseModel):
    cpps_db: float
    ltas_slope_db_per_octave: float
    spectral_tilt_db: float
    spectral_centroid_hz: float


class FormantFeatures(BaseModel):
    f1_hz: float
    f2_hz: float
    f3_hz: float
    f4_hz: float
    formant_dispersion_hz: float
    vowel_space_area: Optional[float] = None


class MFCCSummary(BaseModel):
    n_coefficients: int
    mean: list[float]
    sd: list[float]
    delta_mean: list[float]
    delta_delta_mean: list[float]


class EGeMAPSVector(BaseModel):
    feature_set: Literal["eGeMAPSv02", "ComParE_2016"] = "eGeMAPSv02"
    values: list[float]
    names: list[str]


# --- clinical indices -------------------------------------------------


VoiceQualityBand = Literal["normal", "mild", "moderate", "severe"]


class AVQIScore(BaseModel):
    value: float
    severity_band: VoiceQualityBand
    sub_features: dict[str, float] = Field(default_factory=dict)


class DSIScore(BaseModel):
    value: float
    severity_band: VoiceQualityBand


class GRBASScore(BaseModel):
    grade: int
    roughness: int
    breathiness: int
    asthenia: int
    strain: int
    confidence: float


class VoiceBreakStats(BaseModel):
    voice_break_rate_per_s: float
    voice_break_ratio: float
    longest_break_s: float


# --- linguistic -------------------------------------------------------


class TranscriptWord(BaseModel):
    text: str
    start_s: float
    end_s: float
    confidence: float


class Transcript(BaseModel):
    language: str
    text: str
    words: list[TranscriptWord] = Field(default_factory=list)
    asr_engine: str
    asr_model_version: str


class ProsodyFeatures(BaseModel):
    speech_rate_wpm: float
    articulation_rate_syl_per_s: float
    pause_count: int
    pause_mean_s: float
    pause_sd_s: float
    pause_time_ratio: float
    hesitation_count: int


class LexicalFeatures(BaseModel):
    type_token_ratio: float
    mtld: float
    brunet_w: float
    honore_r: float
    noun_ratio: float
    verb_ratio: float
    pronoun_ratio: float
    idea_density: Optional[float] = None


class SyntacticFeatures(BaseModel):
    mean_length_of_utterance: float
    yngve_depth_mean: float
    embedded_clause_depth_mean: float


# --- neurological -----------------------------------------------------


class DDKMetrics(BaseModel):
    syllable_rate_per_s: float
    syllable_rate_sd: float
    voice_onset_time_ms: Optional[float] = None
    regularity_index: float


class NonlinearFeatures(BaseModel):
    rpde: float
    dfa: float
    ppe: float


class PDLikelihood(BaseModel):
    score: float = Field(ge=0.0, le=1.0)
    percentile: Optional[float] = None
    drivers: list[str] = Field(default_factory=list)
    confidence: float
    model_version: str


class DysarthriaScore(BaseModel):
    severity: float = Field(ge=0.0, le=4.0)
    subtype_hint: Optional[
        Literal["spastic", "flaccid", "ataxic", "hyperkinetic", "hypokinetic", "mixed"]
    ] = None
    drivers: list[str] = Field(default_factory=list)
    confidence: float
    model_version: str


class DystoniaIndex(BaseModel):
    value: float
    drivers: list[str] = Field(default_factory=list)
    confidence: float


# --- cognitive speech analyzer (MCI / AD spectrum) -------------------


class VoiceSegment(BaseModel):
    """A time-bounded slice of audio within a longer recording."""

    start_s: float = 0.0
    end_s: float
    sample_rate_hz: int
    waveform: list[float] = Field(default_factory=list)


class VoiceAsset(BaseModel):
    """A whole recording or clip referenced for cognitive speech analysis."""

    duration_s: float
    sample_rate_hz: int
    waveform: Optional[list[float]] = None
    asset_id: Optional[UUID] = None


class AcousticFeatureSet(BaseModel):
    """Precomputed acoustic descriptors when raw waveform is unavailable or partial."""

    f0_mean_hz: Optional[float] = None
    f0_sd_hz: Optional[float] = None
    intensity_mean_db: Optional[float] = None
    intensity_sd_db: Optional[float] = None
    voiced_fraction: Optional[float] = None


class ParalinguisticCognitiveFeatures(BaseModel):
    """Timing and prosody-related features associated with cognitive status in speech.

    Based on MCI/AD speech biomarker literature: speech rate, articulation rate,
    pause patterns, and variability in pitch / intensity (proxies for prosodic control).
    """

    speech_rate_wpm: float
    articulation_rate_syl_per_s: float
    pause_count: int
    pause_mean_s: float
    pause_sd_s: float
    pause_time_ratio: float
    mean_pause_duration_s: float
    f0_variability_hz: float
    intensity_variability_db: float
    syllable_count_est: int
    word_count_est: int
    extraction_notes: list[str] = Field(default_factory=list)


class LinguisticFeatures(BaseModel):
    """Lexical, syntactic, and discourse-level features from a transcript (no ASR here).

    Mirrors constructs used in PD/AD speech work: richness, complexity, coherence,
    and repetition.
    """

    type_token_ratio: float
    mtld: float
    brunet_w: float
    honore_r: float
    mean_sentence_length: float
    repetition_ratio: float
    coherence_score: float
    noun_ratio: float
    verb_ratio: float
    pronoun_ratio: float
    idea_density: Optional[float] = None


class CognitiveSpeechRiskScore(BaseModel):
    """Research/wellness cognitive-speech risk envelope — not a clinical diagnosis."""

    score: float = Field(ge=0.0, le=1.0, description="Continuous risk indicator (0–1).")
    model_name: str
    model_version: str
    confidence: float = Field(ge=0.0, le=1.0)
    drivers: list[str] = Field(default_factory=list)
    linguistic_features_used: bool = False


# --- cognitive (legacy alias toward analyzer) -------------------------


class MCIRisk(BaseModel):
    score: float = Field(ge=0.0, le=1.0)
    percentile: Optional[float] = None
    drivers: list[str] = Field(default_factory=list)
    confidence: float
    model_version: str


# --- respiratory ------------------------------------------------------


class CoughEvent(BaseModel):
    start_s: float
    end_s: float
    cough_type: Literal["wet", "dry", "unknown"] = "unknown"
    confidence: float


class CoughEvents(BaseModel):
    events: list[CoughEvent] = Field(default_factory=list)
    cough_count: int = 0
    mean_cough_power: Optional[float] = None


class BreathStats(BaseModel):
    breath_rate_per_min: float
    inspiration_expiration_ratio: float
    inspiration_mean_s: float
    expiration_mean_s: float


class RespRisk(BaseModel):
    score: float = Field(ge=0.0, le=1.0)
    drivers: list[str] = Field(default_factory=list)
    confidence: float
    model_version: str


class RespiratoryFeatures(BaseModel):
    """Acoustic features from cough and breath clips for smartphone-style respiratory screening.

    Band ratios approximate energy distribution (e.g., cough harshness vs breath noise).
    ``wheeze_like_band_ratio`` emphasises mid-frequency narrowband energy vs broadband,
    a coarse proxy for wheeze-like spectral structure — research/wellness use only.
    """

    task_type: Literal["cough", "breath", "other"] = "cough"
    cough_count: int = 0
    cough_rate_per_min: float = 0.0
    mean_cough_duration_s: float = 0.0
    cough_duration_sd_s: float = 0.0
    peak_rms_db: float = 0.0
    mean_rms_db: float = 0.0
    spectral_centroid_hz_mean: float = 0.0
    spectral_flatness_mean: float = 0.0
    band_energy_ratio_low: float = 0.0
    band_energy_ratio_mid: float = 0.0
    band_energy_ratio_high: float = 0.0
    wheeze_like_band_ratio: float = 0.0
    breath_cycles_estimated: int = 0
    inspiration_mean_s: float = 0.0
    expiration_mean_s: float = 0.0
    ie_ratio: float = 0.0
    breath_rate_per_min: float = 0.0
    extraction_notes: list[str] = Field(default_factory=list)


class RespiratoryRiskScore(BaseModel):
    """Research/wellness respiratory acoustic risk envelope — not a clinical diagnosis."""

    score: float = Field(ge=0.0, le=1.0, description="Continuous risk indicator (0–1), e.g. COPD-style screening context.")
    model_name: str
    model_version: str
    confidence: float = Field(ge=0.0, le=1.0)
    drivers: list[str] = Field(default_factory=list)


# --- normative + longitudinal ----------------------------------------


class ZScore(BaseModel):
    feature: str
    value: float
    z: float
    percentile: float
    n_in_bin: int
    bin_id: str


class Delta(BaseModel):
    feature: str
    current: float
    baseline: float
    raw_delta: float
    pct_delta: float
    effect_size: float
    minimum_detectable_change_flag: bool


class Timeline(BaseModel):
    patient_id: UUID
    sessions: list[UUID] = Field(default_factory=list)
    key_features: dict[str, list[float]] = Field(default_factory=dict)


# --- reporting --------------------------------------------------------


class Citation(BaseModel):
    paper_id: str
    title: str
    year: Optional[int] = None
    doi: Optional[str] = None
    url: Optional[str] = None


class ReportBundle(BaseModel):
    session_id: UUID
    json_payload: dict[str, Any]
    html_path: Optional[str] = None
    pdf_path: Optional[str] = None
    citations: list[Citation] = Field(default_factory=list)
    pipeline_version: str
    norm_db_version: str
    model_versions: dict[str, str] = Field(default_factory=dict)
    flagged_conditions: list[str] = Field(default_factory=list)
