"""CBraMod EEG foundation-model embedder (stub)."""
from __future__ import annotations

import os
import time
from typing import Optional

from .disclaimers import CBRAMOD_DISCLAIMER
from .schemas import CbramodEmbedRequest, CbramodEmbedResponse, CbramodHealthResponse

_STUB_MESSAGE = (
    "CBraMod model is not loaded. Provide CBRAMOD_MODEL_PATH and land the "
    "follow-up wiring PR to enable real EEG embedding."
)


class CbramodEmbedder:
    def __init__(self) -> None:
        self.model_path: Optional[str] = os.getenv("CBRAMOD_MODEL_PATH") or None
        self.device: str = os.getenv("CBRAMOD_DEVICE", "cpu")

    @property
    def model_loaded(self) -> bool:
        return False

    def health(self) -> CbramodHealthResponse:
        return CbramodHealthResponse(
            status="stub",
            model_loaded=self.model_loaded,
            device=self.device,
            stub=True,
            message=_STUB_MESSAGE,
        )

    def embed(self, request: CbramodEmbedRequest) -> CbramodEmbedResponse:
        start = time.monotonic()
        _ = request.patient_id
        latency_ms = int((time.monotonic() - start) * 1000)
        return CbramodEmbedResponse(
            stub=True,
            status="stub",
            patient_id=request.patient_id,
            embedding=None,
            embedding_dim=None,
            latency_ms=latency_ms,
            disclaimer=CBRAMOD_DISCLAIMER,
            message=_STUB_MESSAGE,
        )


_singleton: Optional[CbramodEmbedder] = None


def get_embedder() -> CbramodEmbedder:
    global _singleton
    if _singleton is None:
        _singleton = CbramodEmbedder()
    return _singleton
