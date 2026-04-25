from __future__ import annotations

import importlib
from typing import Any

import numpy as np
from pydantic import BaseModel, Field


class DeeptwinSimulationJob(BaseModel):
    job_id: str
    tenant_id: str | None = None
    patient_id: str = Field(..., min_length=1)
    protocol_id: str = Field(..., min_length=1)
    horizon_days: int = Field(90, ge=7, le=365)
    modalities: list[str] = Field(default_factory=list)
    scenario: dict[str, Any] = Field(default_factory=dict)


def run_deeptwin_simulation(job: DeeptwinSimulationJob) -> dict[str, Any]:
    """
    Worker entry point for Deeptwin simulation.

    v1 behavior:
    - If `autoresearch` is importable, return a structured placeholder describing integration state.
    - Otherwise run a deterministic stub simulation so the UI and audit plumbing can ship.
    """
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

