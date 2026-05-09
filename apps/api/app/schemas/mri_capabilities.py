"""Schema models for MRI capability reporting."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

CapabilityStatus = Literal[
    "active",
    "fallback",
    "unavailable",
    "experimental",
]


class CapabilityFeature(BaseModel):
    id: str
    label: str
    status: CapabilityStatus
    required_packages: list[str] = Field(default_factory=list)
    missing_packages: list[str] = Field(default_factory=list)
    required_env: list[str] = Field(default_factory=list)
    missing_env: list[str] = Field(default_factory=list)
    clinical_caveat: str
    ui_surfaces: list[str] = Field(default_factory=list)
    notes: str = ""


class MriCapabilitiesResponse(BaseModel):
    status: Literal["ok"] = "ok"
    generated_at: str
    features: list[CapabilityFeature]
    clinical_disclaimer: str = (
        "MRI Analyzer is a decision-support tool. Not a medical device. "
        "Model-estimated indicators. Requires radiologist/neurologist review."
    )
