"""Tier 1 — cloud LLM adapter for clinical reasoning.

Stub-mode by default. Reads ``TIER1_LLM_ENDPOINT`` from the environment; if
unset, every call returns ``stub: True, output: None`` with the canonical
clinical disclaimer attached. No real network call is made in this module
until a follow-up PR wires the vLLM HTTP client.
"""
from .client import VLLMClient, get_client
from .disclaimers import CLINICAL_DISCLAIMER
from .schemas import (
    ClinicalReasoningRequest,
    ClinicalReasoningResponse,
    Tier1HealthResponse,
    Tier1Status,
)

__all__ = [
    "VLLMClient",
    "get_client",
    "CLINICAL_DISCLAIMER",
    "ClinicalReasoningRequest",
    "ClinicalReasoningResponse",
    "Tier1HealthResponse",
    "Tier1Status",
]
