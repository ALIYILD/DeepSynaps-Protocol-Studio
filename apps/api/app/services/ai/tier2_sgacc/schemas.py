"""Schemas for the Tier 2 sgACC TMS-targeting service.

Local Pydantic models. Kept inside the ``tier2_sgacc`` module so this PR
does not have to touch ``deepsynaps_core_schema``.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

SgaccStatus = Literal["ok", "stub", "model_not_loaded", "error"]


class SgaccHealthResponse(BaseModel):
    """Service health.

    ``stub`` is ``True`` whenever the reference seed map or the regression
    head is not loaded.
    """

    model_config = ConfigDict(extra="forbid")

    status: SgaccStatus
    reference_map_loaded: bool
    model_loaded: bool
    stub: bool
    message: str


class SgaccTargetRequest(BaseModel):
    """Input to the sgACC targeting predictor.

    ``fmri_volume_uri`` is an opaque pointer (s3:// or file://) to a
    resting-state fMRI volume. It is NOT fetched in stub mode.
    """

    model_config = ConfigDict(extra="forbid")

    patient_id: str = Field(min_length=1)
    fmri_volume_uri: str = Field(min_length=1)
    session_id: str | None = None


class SgaccTargetResponse(BaseModel):
    """Uniform response envelope for sgACC targeting calls.

    Stub mode: every nullable field is ``None``. Disclaimer always present.
    The recommended coil location is in MNI152 space and must be a
    three-vector when present (rejected by ``field_validator`` otherwise).
    """

    model_config = ConfigDict(extra="forbid")

    stub: bool
    status: SgaccStatus
    patient_id: str
    recommended_coil_mni: list[float] | None
    predicted_response_probability: float | None
    predictor_correlation_r: float | None
    latency_ms: int = 0
    disclaimer: str
    message: str = ""

    @field_validator("recommended_coil_mni")
    @classmethod
    def _mni_must_be_xyz(cls, v: list[float] | None) -> list[float] | None:
        if v is None:
            return v
        if len(v) != 3:
            raise ValueError("recommended_coil_mni must be an XYZ triplet.")
        return v
