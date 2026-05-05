from __future__ import annotations

from enum import Enum
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class AnalysisTier(str, Enum):
    T1 = "T1"
    T2 = "T2"
    T3 = "T3"


class AnalysisStatus(str, Enum):
    implemented = "implemented"
    implemented_beta = "implemented_beta"
    library_mapped_validation_pending = "library_mapped_validation_pending"
    research_stub_not_validated = "research_stub_not_validated"


class Reference(BaseModel):
    type: Literal["doi", "pmid", "isbn", "url"]
    id: str
    short: str


class AnalysisParameter(BaseModel):
    key: str
    label: dict[str, str] = Field(default_factory=dict)
    type: Literal[
        "number",
        "enum",
        "boolean",
        "channel-multiselect",
        "band-select",
        "time-range",
    ]
    default: Any = None
    min: Optional[float] = None
    max: Optional[float] = None
    options: Optional[list[dict[str, Any]]] = None
    helpText: Optional[dict[str, str]] = None


class AnalysisOutputSchema(BaseModel):
    key: str
    type: Literal["scalar", "vector", "matrix", "topomap", "timeseries", "image", "nifti"]
    units: Optional[str] = None
    shape: Optional[str] = None
    description: str


class AnalysisVisualization(BaseModel):
    type: Literal[
        "topomap",
        "band-bar",
        "connectivity-matrix",
        "graph-network",
        "spectrogram",
        "microstate-timeline",
        "3d-source",
        "table",
        "z-score-heatmap",
        "raster",
    ]
    outputKeys: list[str] = Field(default_factory=list)
    title: dict[str, str] = Field(default_factory=dict)


class InputRequirements(BaseModel):
    minDurationSec: int = 0
    minChannels: int = 0
    samplingRateHz: Optional[int] = None
    needsERPMarkers: Optional[bool] = None
    needsMRI: Optional[bool] = None
    needsRestingState: Optional[bool] = None


class ComputeBackend(BaseModel):
    routerPath: str
    estimatedRuntimeSec: int = 0
    requiresGPU: bool = False


class ValidatedCondition(BaseModel):
    id: str
    label_en: str
    label_tr: str
    icd10: str
    icd11: Optional[str] = None
    evidence_grade: Literal["A", "B", "C", "stub"] = "stub"
    qeeg_categories: list[int] = Field(default_factory=list)


class AnalysisDefinition(BaseModel):
    code: str
    name: dict[str, str]
    category: int = Field(..., ge=1, le=12)
    tier: AnalysisTier
    status: AnalysisStatus
    shortDescription: dict[str, str] = Field(default_factory=dict)
    clinicalUse: dict[str, str] = Field(default_factory=dict)
    inputRequirements: InputRequirements = Field(default_factory=InputRequirements)
    parameters: list[AnalysisParameter] = Field(default_factory=list)
    outputs: list[AnalysisOutputSchema] = Field(default_factory=list)
    visualizations: list[AnalysisVisualization] = Field(default_factory=list)
    computeBackend: ComputeBackend
    references: list[Reference] = Field(default_factory=list)
    contraindications: list[str] = Field(default_factory=list)
    hedgeLanguage: str = ""
    validatedConditions: list[ValidatedCondition] = Field(default_factory=list)
    lastReviewed: str = ""
    reviewedBy: str = ""


class AnalysesCatalogResponse(BaseModel):
    analyses: list[AnalysisDefinition]

