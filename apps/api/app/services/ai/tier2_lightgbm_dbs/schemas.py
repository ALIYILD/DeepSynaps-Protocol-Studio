"""Schemas for the Tier 2 LightGBM DBS predictor."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

DbsStatus = Literal["ok", "stub", "model_not_loaded", "error"]


class DbsHealthResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: DbsStatus
    model_loaded: bool
    auc_reference: float = 0.921  # AUC reported in the published cohort
    stub: bool
    message: str


class DbsPredictRequest(BaseModel):
    """Clinical-features input for the DBS motor-outcome predictor.

    ``clinical_features`` is a flat dict of numeric values (UPDRS subscores,
    levodopa-equivalent dose, etc.). Specific feature schema is enforced
    by the real model in the follow-up PR.
    """
    model_config = ConfigDict(extra="forbid")
    patient_id: str = Field(min_length=1)
    clinical_features: dict[str, float] = Field(default_factory=dict)


class DbsPredictResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    stub: bool
    status: DbsStatus
    patient_id: str
    predicted_motor_improvement_pct: float | None
    auc_reference: float
    latency_ms: int = 0
    disclaimer: str
    message: str = ""
