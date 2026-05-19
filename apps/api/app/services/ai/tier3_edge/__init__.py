"""Tier 3 — Edge real-time qEEG + BioMistral screening (stub).

Targets in-clinic edge hardware (Apple M2 / Intel i7 / Jetson TX2).
EEGNet on ONNX for <10 ms qEEG screening; BioMistral-7B Q5_K_M on
llama.cpp for <100 ms LLM replies. Pure CPU paths.
"""
from .disclaimers import TIER3_DISCLAIMER
from .edge_runner import EdgeRunner, get_runner
from .schemas import (
    Tier3ChatRequest,
    Tier3ChatResponse,
    Tier3HealthResponse,
    Tier3ScreenRequest,
    Tier3ScreenResponse,
    Tier3Status,
)

__all__ = [
    "TIER3_DISCLAIMER",
    "EdgeRunner",
    "get_runner",
    "Tier3ChatRequest",
    "Tier3ChatResponse",
    "Tier3HealthResponse",
    "Tier3ScreenRequest",
    "Tier3ScreenResponse",
    "Tier3Status",
]
