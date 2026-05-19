"""Tier 2 — Multimodal MRI ensemble TMS response predictor (stub).

Reference AUC 0.932 in the published cohort.
"""
from .disclaimers import TMS_RESPONSE_DISCLAIMER
from .predictor import TmsResponsePredictor, get_predictor
from .schemas import (
    TmsResponseHealthResponse,
    TmsResponsePredictRequest,
    TmsResponsePredictResponse,
    TmsResponseStatus,
)

__all__ = [
    "TMS_RESPONSE_DISCLAIMER",
    "TmsResponsePredictor",
    "get_predictor",
    "TmsResponseHealthResponse",
    "TmsResponsePredictRequest",
    "TmsResponsePredictResponse",
    "TmsResponseStatus",
]
