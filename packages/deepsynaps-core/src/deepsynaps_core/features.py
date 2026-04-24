"""
FeatureStore — every numeric signal from every subsystem, z-scored,
queryable as either snapshot or trajectory.

Backed by a materialized view over ``patient_events`` + Redis last-values
cache. This is the source-of-truth the RiskEngine, dashboards, and
agents all query against.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Literal

from pydantic import BaseModel


FeatureSource = Literal[
    "qeeg", "mri_structural", "mri_functional", "mri_diffusion",
    "wearable_hr", "wearable_hrv", "wearable_sleep", "wearable_activity",
    "prom", "derived",
]


class Feature(BaseModel):
    patient_id: str
    t_utc: datetime
    source: FeatureSource
    name: str                      # e.g. "DMN_within_fc", "hrv_rmssd_7d"
    value: float
    unit: str | None = None
    z: float | None = None
    percentile: float | None = None
    flagged: bool = False
    event_id: str | None = None    # origin event in patient_events


class FeatureSnapshot(BaseModel):
    patient_id: str
    t_utc: datetime
    features: dict[str, Feature]

    def flagged_only(self) -> dict[str, Feature]:
        return {k: v for k, v in self.features.items() if v.flagged}


class FeatureTrajectory(BaseModel):
    patient_id: str
    name: str
    points: list[tuple[datetime, float]]    # (t_utc, value)
    z_points: list[tuple[datetime, float]] | None = None

    def delta(self, days: int = 30) -> float | None:
        if len(self.points) < 2:
            return None
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        past = [v for t, v in self.points if t <= cutoff]
        recent = [v for t, v in self.points if t > cutoff]
        if not past or not recent:
            return None
        return (sum(recent) / len(recent)) - (sum(past) / len(past))


# ---------------------------------------------------------------------------
# Public API — the four queries 99% of the product uses.
# Implementations live in features_pg.py (Postgres-backed).
# ---------------------------------------------------------------------------
def get_snapshot(patient_id: str, age_hours: int = 24) -> FeatureSnapshot:
    """Most recent value of every feature, within the last N hours.

    Used by: RiskEngine tick, dashboard hero panel, agent context builder.
    """
    raise NotImplementedError


def get_trajectory(patient_id: str, name: str, window_days: int = 90) -> FeatureTrajectory:
    """Timeseries of one named feature over the last N days.

    Used by: longitudinal change maps, trend cards, agent "how has X moved?" tools.
    """
    raise NotImplementedError


def get_flagged(patient_id: str) -> list[Feature]:
    """Only abnormal features (|z|>1.96). Used by: crisis routing, chief-complaint summarizer."""
    raise NotImplementedError


def publish_feature(f: Feature) -> None:
    """Write a feature into the store. Called from subsystem event handlers
    after each analysis completes. Idempotent by (patient_id, t_utc, name, source)."""
    raise NotImplementedError
