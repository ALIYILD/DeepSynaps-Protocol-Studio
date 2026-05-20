"""Tier 2 — qEEG inference adapter (EEGNet + BIOT, ONNX Runtime).

Stub-mode by default. Reads ``QEEG_ONNX_MODELS_DIR`` from the environment;
if unset or no ``.onnx`` weights are present, every ``run`` call returns
``stub: True, predictions: None`` with the canonical qEEG disclaimer.
No ONNX Runtime call is made in this module until a follow-up PR wires
the real runner.
"""
from .disclaimers import QEEG_DISCLAIMER
from .model_registry import BIOT_META, EEGNET_META, list_models
from .onnx_runner import OnnxRunner, get_runner
from .schemas import (
    QeegHealthResponse,
    QeegInferenceRequest,
    QeegInferenceResponse,
    QeegModelName,
    QeegRunStatus,
)

__all__ = [
    "QEEG_DISCLAIMER",
    "BIOT_META",
    "EEGNET_META",
    "list_models",
    "OnnxRunner",
    "get_runner",
    "QeegHealthResponse",
    "QeegInferenceRequest",
    "QeegInferenceResponse",
    "QeegModelName",
    "QeegRunStatus",
]
