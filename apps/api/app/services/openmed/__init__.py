"""OpenMed adapter package.

Public surface:
  from app.services.openmed import adapter, schemas

The adapter handles backend selection (HTTP vs in-process heuristic);
schemas defines the typed contract callers should use.
"""
from . import adapter, schemas
from .schemas import (
    AnalyzeResponse,
    ClinicalTextInput,
    DeidentifyResponse,
    ExtractedClinicalEntity,
    HealthResponse,
    PIIEntity,
    PIIExtractResponse,
    TextSpan,
)

__all__ = [
    "adapter",
    "schemas",
    "AnalyzeResponse",
    "ClinicalTextInput",
    "DeidentifyResponse",
    "ExtractedClinicalEntity",
    "HealthResponse",
    "PIIEntity",
    "PIIExtractResponse",
    "TextSpan",
]
