"""Type contracts for the TRIBE-inspired DeepTwin layer.

These dataclasses are the stable interfaces between encoders, fusion,
adapter, heads, and explanation. Real ML models can be swapped behind
the same interfaces later without touching downstream code.

Design notes
------------
- Embeddings are fixed-dimensional (``EMBED_DIM`` = 32) so heads can be
  trained independently.
- Every embedding carries ``quality`` (0..1) and ``missing`` (bool) so
  fusion can mask gracefully when a modality has no data.
- ``feature_attributions`` lets the explanation layer expose human-readable
  drivers without needing a separate XAI runtime.
- Nothing here imports torch/sklearn/numpy at module level. ``numpy`` is
  imported inside encoder/fusion code only, matching the rest of the
  deeptwin engine.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

EMBED_DIM = 32

ModalityName = Literal[
    "qeeg",
    "mri",
    "assessments",
    "wearables",
    "treatment_history",
    "demographics",
    "medications",
    "text",
    "voice",
]

ALL_MODALITIES: tuple[ModalityName, ...] = (
    "qeeg",
    "mri",
    "assessments",
    "wearables",
    "treatment_history",
    "demographics",
    "medications",
    "text",
    "voice",
)


@dataclass
class ModalityEmbedding:
    """Output of a single modality encoder."""

    modality: ModalityName
    vector: list[float]  # length == EMBED_DIM
    quality: float  # 0..1
    missing: bool  # True if no real data was available
    feature_attributions: dict[str, float] = field(default_factory=dict)
    notes: list[str] = field(default_factory=list)


@dataclass
class PatientLatent:
    """Fused patient representation produced by the fusion layer."""

    patient_id: str
    vector: list[float]  # length == EMBED_DIM
    modality_weights: dict[str, float]  # how much each modality contributed
    used_modalities: list[str]
    missing_modalities: list[str]
    fusion_quality: float  # weighted-mean encoder quality
    coverage_ratio: float  # used / total
    notes: list[str] = field(default_factory=list)


@dataclass
class AdaptedPatient:
    """Output of the patient-adaptation layer.

    Adds subject-specific bias (demographics, diagnosis, baseline severity,
    prior protocol response, modality availability).
    """

    base: PatientLatent
    adapted_vector: list[float]
    adaptation_summary: dict[str, Any]


@dataclass
class ProtocolSpec:
    """Minimal protocol specification accepted by the heads."""

    protocol_id: str
    label: str | None = None
    modality: Literal[
        "tms", "tdcs", "tacs", "ces", "pbm", "behavioural", "therapy",
        "medication", "lifestyle"
    ] = "tdcs"
    target: str | None = None
    frequency_hz: float | None = None
    current_ma: float | None = None
    duration_min: int | None = None
    sessions_per_week: int | None = None
    weeks: int | None = None
    contraindications: list[str] = field(default_factory=list)
    adherence_assumption_pct: float = 80.0
    notes: str | None = None


@dataclass
class TrajectoryPoint:
    week: int
    point: float
    ci_low: float
    ci_high: float


@dataclass
class TrajectoryHead:
    metric: str  # e.g. "phq9_total", "alpha_power_norm"
    units: str | None
    baseline: float
    points: list[TrajectoryPoint]
    direction_better: Literal["lower", "higher"]


@dataclass
class HeadOutputs:
    symptom_trajectories: list[TrajectoryHead]
    biomarker_trajectories: list[TrajectoryHead]
    risk_shifts: list[dict[str, Any]]
    response_probability: float  # 0..1
    response_confidence: Literal["low", "moderate", "high"]
    adverse_risk: dict[str, Any]
    latent_state_change: dict[str, Any]


@dataclass
class Explanation:
    top_modalities: list[dict[str, Any]]  # [{modality, weight, quality}]
    top_drivers: list[dict[str, Any]]  # [{modality, feature, weight, direction}]
    missing_data_notes: list[str]
    cautions: list[str]
    evidence_grade: Literal["low", "moderate", "high"]
    rationale: str


@dataclass
class SimulationOutput:
    patient_id: str
    protocol: ProtocolSpec
    horizon_weeks: int
    heads: HeadOutputs
    explanation: Explanation
    approval_required: bool
    labels: dict[str, bool]
    disclaimer: str


@dataclass
class ProtocolComparison:
    patient_id: str
    horizon_weeks: int
    candidates: list[SimulationOutput]
    ranking: list[dict[str, Any]]  # [{protocol_id, score, rank, rationale}]
    winner: str | None
    confidence_gap: float
    disclaimer: str
