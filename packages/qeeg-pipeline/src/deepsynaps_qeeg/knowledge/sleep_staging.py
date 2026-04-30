"""Sleep staging criteria derived from structured clinical EEG education.

Provides deterministic rules for identifying sleep stages from scalp EEG
patterns. Intended for:
- Automated sleep staging scaffolds
- Copilot explanations of sleep architecture
- Report annotations when recordings include sleep periods

All criteria follow AASM (American Academy of Sleep Medicine) conventions
adapted for scalp EEG (without full PSG montage).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


Stage = Literal["wake", "n1", "n2", "n3", "rem"]


@dataclass(frozen=True)
class StageCriterion:
    """A single criterion for identifying a sleep stage."""

    stage: Stage
    required_features: tuple[str, ...]
    forbidden_features: tuple[str, ...]
    eeg_frequency_hz: tuple[float, float]
    duration_sec: float
    topography: str
    confidence: str  # high | medium | low


# ── Stage criteria (deterministic, AASM-aligned) ──────────────────────────

_STAGE_CRITERIA: tuple[StageCriterion, ...] = (
    # WAKE
    StageCriterion(
        stage="wake",
        required_features=("posterior_dominant_rhythm", "eye_blinks", "myogenic_activity"),
        forbidden_features=("sleep_spindles", "k_complexes", "slow_wave_sleep"),
        eeg_frequency_hz=(8.0, 13.0),
        duration_sec=5.0,
        topography="Posterior alpha (PDR) with frontal eye blinks and muscle artifact",
        confidence="high",
    ),
    # N1 (Stage I)
    StageCriterion(
        stage="n1",
        required_features=("vertex_waves",),
        forbidden_features=("sleep_spindles", "k_complexes", "slow_waves"),
        eeg_frequency_hz=(4.0, 8.0),
        duration_sec=3.0,
        topography="Vertex waves (Cz) are the hallmark; POSTS may appear in occipital leads",
        confidence="high",
    ),
    StageCriterion(
        stage="n1",
        required_features=("posts",),
        forbidden_features=("sleep_spindles", "k_complexes"),
        eeg_frequency_hz=(4.0, 8.0),
        duration_sec=3.0,
        topography="Positive occipital sharp transients of sleep (POSTS) — sail-like, positive deflections",
        confidence="medium",
    ),
    # N2 (Stage II)
    StageCriterion(
        stage="n2",
        required_features=("sleep_spindles", "k_complexes"),
        forbidden_features=("slow_waves",),
        eeg_frequency_hz=(0.5, 14.0),
        duration_sec=0.5,
        topography="Spindles (12–14 Hz bursts) and K-complexes at vertex/centroparietal regions",
        confidence="high",
    ),
    StageCriterion(
        stage="n2",
        required_features=("sleep_spindles",),
        forbidden_features=("slow_waves",),
        eeg_frequency_hz=(12.0, 14.0),
        duration_sec=0.5,
        topography="Sleep spindles — symmetric 12–14 Hz bursts, maximal at Cz/C3/C4",
        confidence="high",
    ),
    StageCriterion(
        stage="n2",
        required_features=("k_complexes",),
        forbidden_features=("slow_waves",),
        eeg_frequency_hz=(0.5, 2.0),
        duration_sec=0.5,
        topography="K-complexes — high-amplitude biphasic slow waves, vertex/centroparietal",
        confidence="high",
    ),
    # N3 (Slow wave sleep)
    StageCriterion(
        stage="n3",
        required_features=("slow_waves",),
        forbidden_features=(),
        eeg_frequency_hz=(0.5, 2.0),
        duration_sec=20.0,
        topography="High-amplitude (>75 µV) delta 0.5–2 Hz occupying >20% of an epoch",
        confidence="high",
    ),
    # REM
    StageCriterion(
        stage="rem",
        required_features=("sawtooth_waves", "rapid_eye_movements"),
        forbidden_features=("sleep_spindles", "k_complexes", "slow_waves"),
        eeg_frequency_hz=(4.0, 8.0),
        duration_sec=5.0,
        topography="Low-amplitude mixed-frequency theta with sawtooth waves and REMs; muscle atonia",
        confidence="high",
    ),
    StageCriterion(
        stage="rem",
        required_features=("theta_predominant",),
        forbidden_features=("sleep_spindles", "k_complexes", "slow_waves", "alpha_dominant"),
        eeg_frequency_hz=(4.0, 8.0),
        duration_sec=5.0,
        topography="Low-voltage theta with absence of spindles/K-complexes and minimal muscle",
        confidence="medium",
    ),
)


# ── Normal sleep architecture (adult) ──────────────────────────────────────

class SleepArchitecture:
    """Normative sleep architecture values for adults."""

    CYCLE_DURATION_MIN: int = 90
    CYCLES_PER_NIGHT: int = 4
    TOTAL_SLEEP_TIME_MIN: int = 360  # 6 hours

    STAGE_PERCENTAGES: dict[Stage, tuple[float, float]] = {
        "n1": (5.0, 10.0),   # 5–10%
        "n2": (45.0, 55.0),  # 45–55%
        "n3": (15.0, 25.0),  # 15–25%
        "rem": (20.0, 25.0), # 20–25%
    }

    LATENCY_REM_MIN: tuple[float, float] = (70.0, 120.0)  # Normal REM latency
    LATENCY_N3_MIN: tuple[float, float] = (15.0, 30.0)    # Normal slow-wave onset

    @classmethod
    def is_stage_percentage_normal(cls, stage: Stage, percent: float) -> bool:
        """Return True if *percent* is within normal range for *stage*."""
        low, high = cls.STAGE_PERCENTAGES.get(stage, (0.0, 100.0))
        return low <= percent <= high


# ── Pediatric sleep norms ─────────────────────────────────────────────────

class PediatricSleepNorms:
    """Age-dependent sleep norms (simplified)."""

    @staticmethod
    def rem_percentage(age_months: int) -> tuple[float, float]:
        """Return (min%, max%) for REM sleep at *age_months*."""
        if age_months <= 3:
            return (40.0, 55.0)
        if age_months <= 12:
            return (30.0, 40.0)
        if age_months <= 36:
            return (25.0, 35.0)
        if age_months <= 120:
            return (20.0, 25.0)
        return (20.0, 25.0)  # adult

    @staticmethod
    def total_sleep_hours(age_months: int) -> tuple[float, float]:
        """Return (min, max) total sleep hours per 24h."""
        if age_months <= 3:
            return (14.0, 17.0)
        if age_months <= 12:
            return (12.0, 15.0)
        if age_months <= 36:
            return (11.0, 14.0)
        if age_months <= 72:
            return (10.0, 13.0)
        if age_months <= 120:
            return (9.0, 12.0)
        if age_months <= 180:
            return (8.0, 10.0)
        return (7.0, 9.0)  # adult


# ── Public API ────────────────────────────────────────────────────────────

class SleepStagingEngine:
    """Deterministic sleep staging helper."""

    @staticmethod
    def criteria_for_stage(stage: Stage) -> list[StageCriterion]:
        """Return all criteria that identify *stage*."""
        return [c for c in _STAGE_CRITERIA if c.stage == stage]

    @staticmethod
    def all_criteria() -> tuple[StageCriterion, ...]:
        """Return the full criteria set."""
        return _STAGE_CRITERIA

    @staticmethod
    def stage_from_features(
        features_present: list[str],
        dominant_frequency_hz: float,
        amplitude_uv: float,
    ) -> list[tuple[Stage, str]]:
        """Return candidate stages with confidence ratings.

        This is an intentionally simple heuristic — production sleep staging
        should use a trained model (e.g., YASA + age calibration).
        """
        candidates: list[tuple[Stage, str]] = []
        for c in _STAGE_CRITERIA:
            # Check required features.
            if not all(req in features_present for req in c.required_features):
                continue
            # Check forbidden features.
            if any(forb in features_present for forb in c.forbidden_features):
                continue
            # Check frequency range.
            if not (c.eeg_frequency_hz[0] <= dominant_frequency_hz <= c.eeg_frequency_hz[1]):
                continue
            candidates.append((c.stage, c.confidence))
        # Deduplicate by stage, keeping highest confidence.
        seen: dict[Stage, str] = {}
        for stage, conf in candidates:
            if stage not in seen or conf == "high":
                seen[stage] = conf
        return [(s, c) for s, c in seen.items()]


def describe_sleep_stage(stage: Stage) -> dict[str, str]:
    """Return a human-readable description of *stage*."""
    descriptions: dict[Stage, dict[str, str]] = {
        "wake": {
            "name": "Wakefulness",
            "eeg": "Posterior dominant alpha rhythm (8–13 Hz) with eye blinks and muscle artifact",
            "significance": "Normal alert state; PDR should attenuate with eye opening",
        },
        "n1": {
            "name": "N1 (Stage I) Sleep",
            "eeg": "Low-voltage mixed frequencies with vertex waves and POSTS; PDR fades",
            "significance": "Lightest sleep; easily aroused; may be mistaken for drowsiness",
        },
        "n2": {
            "name": "N2 (Stage II) Sleep",
            "eeg": "Sleep spindles (12–14 Hz) and K-complexes; background slows further",
            "significance": "True sleep onset; comprises ~45–55% of adult sleep",
        },
        "n3": {
            "name": "N3 (Slow Wave / Deep) Sleep",
            "eeg": "High-amplitude delta (0.5–2 Hz) occupying >20% of epoch",
            "significance": "Restorative sleep; decreases with age; important for memory consolidation",
        },
        "rem": {
            "name": "REM Sleep",
            "eeg": "Low-voltage theta with sawtooth waves; muscle atonia; rapid eye movements",
            "significance": "Dreaming state; essential for emotional regulation and memory",
        },
    }
    return descriptions.get(stage, {"name": "Unknown", "eeg": "", "significance": ""})
