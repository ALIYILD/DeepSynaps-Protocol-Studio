"""Tier 2 qEEG ONNX Runner.

Stub-only. Reads ``QEEG_ONNX_MODELS_DIR`` and ``QEEG_RUNTIME_PROVIDER``
from the environment. If the directory is unset or no ``.onnx`` file is
resolvable for the requested model, ``run`` returns
``stub: True, predictions: None`` with the canonical disclaimer.

Real ONNX Runtime integration is a follow-up PR. The eventual dependency
to add is ``onnxruntime`` (CPU build) plus ``onnxruntime-gpu`` for CUDA
deploys. This module intentionally does NOT import them yet so this PR
does not change the dependency surface.
"""
from __future__ import annotations

import os
import time
from typing import Optional

from .disclaimers import QEEG_DISCLAIMER
from .model_registry import get_model, list_models
from .schemas import (
    QeegHealthResponse,
    QeegInferenceRequest,
    QeegInferenceResponse,
)

_STUB_MESSAGE = (
    "Tier 2 qEEG models are not loaded. Provide QEEG_ONNX_MODELS_DIR and "
    "land the follow-up wiring PR to enable real inference."
)


class OnnxRunner:
    """Stub ONNX Runtime wrapper.

    Constructed once per process. Real instantiation will lazy-load
    ``onnxruntime.InferenceSession`` per resolved model file.
    """

    def __init__(self) -> None:
        self.models_dir: Optional[str] = os.getenv("QEEG_ONNX_MODELS_DIR") or None
        self.provider: str = os.getenv("QEEG_RUNTIME_PROVIDER", "cpu")

    @property
    def loaded_models(self) -> list[str]:
        # No weights are loaded in stub mode regardless of dir presence.
        return []

    def health(self) -> QeegHealthResponse:
        available = [m.name for m in list_models()]
        return QeegHealthResponse(
            status="stub",
            models_available=available,
            models_loaded=self.loaded_models,
            stub=True,
            message=_STUB_MESSAGE,
        )

    def run(self, request: QeegInferenceRequest) -> QeegInferenceResponse:
        meta = get_model(request.model)
        if meta is None:
            return QeegInferenceResponse(
                stub=True,
                model=request.model,
                status="error",
                predictions=None,
                latency_ms=0,
                disclaimer=QEEG_DISCLAIMER,
                message=f"Unknown model '{request.model}'.",
            )

        start = time.monotonic()
        # Touch the request so static analysers see it as used.
        _ = request.signal_shape
        latency_ms = int((time.monotonic() - start) * 1000)

        return QeegInferenceResponse(
            stub=True,
            model=meta.name,
            status="stub",
            predictions=None,
            latency_ms=latency_ms,
            disclaimer=QEEG_DISCLAIMER,
            message=_STUB_MESSAGE,
        )


_singleton: Optional[OnnxRunner] = None


def get_runner() -> OnnxRunner:
    """Return a process-wide ``OnnxRunner`` singleton."""
    global _singleton
    if _singleton is None:
        _singleton = OnnxRunner()
    return _singleton
