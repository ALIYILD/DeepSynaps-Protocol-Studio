"""Schema models for qEEG capability reporting."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

CapabilityStatus = Literal[
    "active",
    "fallback",
    "unavailable",
    "reference_only",
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


class NormativeDatabaseStatus(BaseModel):
    status: Literal["toy", "configured", "unavailable"]
    version: str | None = None
    clinical_caveat: str


class WineegReferenceStatus(BaseModel):
    status: Literal["reference_only"] = "reference_only"
    native_file_ingestion: bool = False
    caveat: str = (
        "No native WinEEG compatibility. Reference-only checklist and workflow guidance."
    )


class QeegCapabilitiesResponse(BaseModel):
    status: Literal["ok"] = "ok"
    generated_at: str
    features: list[CapabilityFeature]
    normative_database: NormativeDatabaseStatus
    wineeg_reference: WineegReferenceStatus
