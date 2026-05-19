"""Schemas for the Tier 2 E-field surrogate."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

EfieldStatus = Literal["ok", "stub", "model_not_loaded", "error"]
CoilType = Literal["figure8", "double_cone", "h_coil", "circular"]


class EfieldHealthResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: EfieldStatus
    model_loaded: bool
    device: str
    supported_coil_types: list[str]
    stub: bool
    message: str


class EfieldSimulateRequest(BaseModel):
    """Inputs for a single E-field surrogate run.

    ``coil_position`` and ``coil_orientation`` are XYZ triplets in head
    model space. ``head_model_uri`` is an opaque pointer to a SimNIBS
    head model (.msh) — not fetched in stub mode.
    """
    model_config = ConfigDict(extra="forbid")
    patient_id: str = Field(min_length=1)
    head_model_uri: str = Field(min_length=1)
    coil_position: list[float]
    coil_orientation: list[float]
    coil_type: CoilType = "figure8"

    @field_validator("coil_position", "coil_orientation")
    @classmethod
    def _xyz(cls, v: list[float]) -> list[float]:
        if len(v) != 3:
            raise ValueError("must be an XYZ triplet")
        return v


class EfieldSimulateResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    stub: bool
    status: EfieldStatus
    patient_id: str
    peak_efield_v_per_m: float | None
    target_efield_v_per_m: float | None
    off_target_ratio: float | None
    latency_ms: int = 0
    disclaimer: str
    message: str = ""
