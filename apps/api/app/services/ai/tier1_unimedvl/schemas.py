"""Schemas for the Tier 1 UniMedVL multimodal adapter."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

UniMedVlStatus = Literal["ok", "stub", "model_not_loaded", "error"]


class UniMedVlHealthResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: UniMedVlStatus
    model_loaded: bool
    device: str
    stub: bool
    message: str


class UniMedVlUnderstandRequest(BaseModel):
    """Multimodal understanding call.

    ``image_uri`` is an opaque pointer to a medical image (DICOM /
    PNG / JPEG). NOT fetched in stub mode.
    """
    model_config = ConfigDict(extra="forbid")
    patient_id: str = Field(min_length=1)
    text: str = Field(min_length=1)
    image_uri: str = Field(min_length=1)


class UniMedVlUnderstandResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    stub: bool
    status: UniMedVlStatus
    patient_id: str
    understanding: str | None
    caption: str | None
    latency_ms: int = 0
    disclaimer: str
    message: str = ""
