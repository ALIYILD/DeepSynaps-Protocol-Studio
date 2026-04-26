from __future__ import annotations

import importlib
import logging
import os
from typing import Any

import numpy as np
from pydantic import BaseModel, Field


_log = logging.getLogger(__name__)


class DeeptwinSimulationJob(BaseModel):
    job_id: str
    tenant_id: str | None = None
    patient_id: str = Field(..., min_length=1)
    protocol_id: str = Field(..., min_length=1)
    horizon_days: int = Field(90, ge=7, le=365)
    modalities: list[str] = Field(default_factory=list)
    scenario: dict[str, Any] = Field(default_factory=dict)


_TRUTHY = {"1", "true", "yes", "on"}
_FALSY = {"0", "false", "no", "off"}


def _is_simulation_enabled() -> bool:
    """Mirror of apps/api/app/settings.resolve_enable_deeptwin_simulation.

    The worker is a separate Python package and cannot import the API's
    settings module, so the env-var resolution is duplicated here. Both
    sides read DEEPSYNAPS_ENABLE_DEEPTWIN_SIMULATION + DEEPSYNAPS_APP_ENV
    so behavior agrees between API and worker process boundaries.

    Defaults: False in production/staging, True in development/test.
    """
    raw = os.getenv("DEEPSYNAPS_ENABLE_DEEPTWIN_SIMULATION")
    if raw is not None:
        normalized = raw.strip().lower()
        if normalized in _TRUTHY:
            return True
        if normalized in _FALSY:
            return False
    app_env = os.getenv("DEEPSYNAPS_APP_ENV", "development").strip().lower()
    return app_env not in ("production", "staging")


def run_deeptwin_simulation(job: DeeptwinSimulationJob) -> dict[str, Any]:
    """
    Worker entry point for Deeptwin simulation.

    v1 behavior:
    - If the env-aware feature flag is off, return a structured ``disabled``
      response so the API surface can render a clean clinician-visible
      message rather than 500ing.
    - If `autoresearch` is importable, return a structured placeholder
      describing integration state (``not_implemented``).
    - Otherwise run a deterministic stub simulation so the UI and audit
      plumbing can ship.
    """
    if not _is_simulation_enabled():
        _log.warning(
            "DeepTwin simulation called but ENABLE_DEEPTWIN_SIMULATION=False; "
            "returning disabled status"
        )
        return {
            "status": "disabled",
            "reason": "deeptwin_simulation_not_enabled_in_environment",
            "message": (
                "DeepTwin simulation is gated off in this environment. "
                "Contact admin to enable."
            ),
        }

    try:
        importlib.import_module("autoresearch")
        return {
            "engine": {"name": "autoresearch", "status": "available"},
            "status": "not_implemented",
            "job_id": job.job_id,
            "inputs_echo": job.model_dump(),
            "notes": [
                "Autoresearch is installed but Deeptwin requires a domain-specific simulator wrapper.",
                "Recommended: run simulator in worker, store artifacts, and return pointers to API for auditability.",
            ],
        }
    except Exception:
        pass

    base = abs(hash((job.patient_id, job.protocol_id))) % 1000
    rng = np.random.default_rng(base)
    days = list(range(0, job.horizon_days + 1, 7))
    v = 0.0
    curve = []
    for d in days:
        v += float(rng.normal(loc=-0.15, scale=0.05))
        curve.append({"day": d, "delta_symptom_score": round(v, 3)})

    return {
        "engine": {"name": "stub", "status": "ok"},
        "job_id": job.job_id,
        "timecourse": curve,
        "modalities_used": job.modalities,
        "scenario": job.scenario,
    }
