from __future__ import annotations

from pydantic import BaseModel, Field


class EEGInputMetadata(BaseModel):
    sample_rate_hz: int = Field(..., ge=64, le=4096)
    channel_count: int = Field(..., ge=1, le=512)
    duration_seconds: float = Field(..., gt=0)
    montage: str = "unknown"


class EEGQualityCheck(BaseModel):
    passed: bool
    warnings: list[str] = Field(default_factory=list)
    artifact_flags: list[str] = Field(default_factory=list)


class EEGModelOutput(BaseModel):
    summary: str
    confidence: float = Field(..., ge=0, le=1)
    signals: list[str] = Field(default_factory=list)


class EEGModelStatus(BaseModel):
    provider_name: str
    configured: bool = False
    recommended_packages: list[str] = Field(default_factory=list)
