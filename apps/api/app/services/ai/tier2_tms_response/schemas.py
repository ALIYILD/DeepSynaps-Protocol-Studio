"""Schemas for the Tier 2 multimodal-MRI TMS response predictor."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

TmsResponseStatus = Literal["ok", "stub", "model_not_loaded", "error"]


class TmsResponseHealthResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: TmsResponseStatus
    model_loaded: bool
    auc_reference: float = 0.932
    stub: bool
    message: str


class TmsResponsePredictRequest(BaseModel):
    """Inputs for the multimodal-MRI TMS response predictor.

    ``mri_uri`` is the structural T1 NIfTI pointer (required). The
    optional ``fmri_uri`` adds resting-state input. ``clinical_features``
    optionally carries non-imaging variables (age, sex, prior trials,
    PHQ-9 baseline).
    """
    model_config = ConfigDict(extra="forbid")
    patient_id: str = Field(min_length=1)
    mri_uri: str = Field(min_length=1)
    fmri_uri: str | None = None
    clinical_features: dict[str, float] | None = None


class TmsResponsePredictResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    stub: bool
    status: TmsResponseStatus
    patient_id: str
    predicted_response_probability: float | None
    auc_reference: float
    feature_attribution: dict[str, float] | None
    latency_ms: int = 0
    disclaimer: str
    message: str = ""
