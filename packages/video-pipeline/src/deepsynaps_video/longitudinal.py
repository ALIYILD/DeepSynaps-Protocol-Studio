"""Per-patient longitudinal trends across visits.

Reads prior ``video_analyses`` rows from Postgres, computes per-biomarker
trend lines, and returns a ``LongitudinalTrend`` for the current report.
Mixed-effects models (statsmodels / lme4-via-rpy) are deferred to v2.
"""

from __future__ import annotations

from .schemas import LongitudinalTrend


def build_trend(patient_id: str, *, current_analysis_id: str) -> LongitudinalTrend:
    """Pull prior visits and assemble the trend object.

    TODO(impl): query ``video_analyses`` for the patient ordered by
    ``capture_started_at``; assemble per-biomarker lists; cap to the most
    recent N visits configured by the clinic.
    """

    _ = (patient_id, current_analysis_id)
    raise NotImplementedError


__all__ = ["build_trend"]
