"""OpenMed adapter facade.

Selects a backend at call time based on env (`OPENMED_BASE_URL`):
  set     -> HTTP backend (with heuristic fallback on upstream errors)
  unset   -> heuristic backend

The single facade keeps callers ignorant of backend choice and gives us
one place to add caching, audit logging, or rate-limit shaping later.
"""
from __future__ import annotations

import os

from .backends import heuristic, http
from .schemas import (
    AnalyzeResponse,
    ClinicalTextInput,
    DeidentifyResponse,
    HealthResponse,
    PIIExtractResponse,
)


def _use_http() -> bool:
    return bool(os.getenv("OPENMED_BASE_URL"))


def analyze(payload: ClinicalTextInput) -> AnalyzeResponse:
    return (http if _use_http() else heuristic).analyze(payload)


def extract_pii(payload: ClinicalTextInput) -> PIIExtractResponse:
    return (http if _use_http() else heuristic).extract_pii(payload)


def deidentify(payload: ClinicalTextInput) -> DeidentifyResponse:
    return (http if _use_http() else heuristic).deidentify(payload)


def health() -> HealthResponse:
    return (http if _use_http() else heuristic).health()


__all__ = ["analyze", "extract_pii", "deidentify", "health"]
