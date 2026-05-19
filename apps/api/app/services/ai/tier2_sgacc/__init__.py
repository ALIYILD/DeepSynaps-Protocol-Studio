"""Tier 2 — sgACC-connectivity TMS targeting predictor.

Stub-mode by default. Reads ``SGACC_REFERENCE_MAP_URI`` and
``SGACC_MODEL_PATH`` from the environment; while either is unset every
``predict`` call returns ``stub: True, recommended_coil_mni: None,
predicted_response_probability: None`` with the canonical disclaimer.

No fMRI is fetched, no connectivity is computed, no regression head is
loaded in this module. Real wiring lands in a follow-up PR.
"""
from .disclaimers import SGACC_DISCLAIMER
from .predictor import SgaccPredictor, get_predictor
from .schemas import (
    SgaccHealthResponse,
    SgaccStatus,
    SgaccTargetRequest,
    SgaccTargetResponse,
)

__all__ = [
    "SGACC_DISCLAIMER",
    "SgaccPredictor",
    "get_predictor",
    "SgaccHealthResponse",
    "SgaccStatus",
    "SgaccTargetRequest",
    "SgaccTargetResponse",
]
