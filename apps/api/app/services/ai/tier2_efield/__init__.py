"""Tier 2 — Real-time E-field surrogate (stub).

Approximates SimNIBS E-field output for fast iteration during TMS coil
placement. SimNIBS itself remains the ground-truth simulator before any
clinical decision.
"""
from .disclaimers import EFIELD_DISCLAIMER
from .surrogate import EfieldSurrogate, get_surrogate
from .schemas import (
    EfieldHealthResponse,
    EfieldSimulateRequest,
    EfieldSimulateResponse,
    EfieldStatus,
)

__all__ = [
    "EFIELD_DISCLAIMER",
    "EfieldSurrogate",
    "get_surrogate",
    "EfieldHealthResponse",
    "EfieldSimulateRequest",
    "EfieldSimulateResponse",
    "EfieldStatus",
]
