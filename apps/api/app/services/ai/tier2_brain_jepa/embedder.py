"""Brain-JEPA fMRI embedder (stub)."""
from __future__ import annotations

import os
import time
from typing import Optional

from .disclaimers import BRAIN_JEPA_DISCLAIMER
from .schemas import BrainJepaEmbedRequest, BrainJepaEmbedResponse, BrainJepaHealthResponse

_STUB_MESSAGE = (
    "Brain-JEPA model is not loaded. Provide BRAIN_JEPA_MODEL_PATH and land "
    "the follow-up wiring PR to enable real fMRI embedding."
)


class BrainJepaEmbedder:
    def __init__(self) -> None:
        self.model_path: Optional[str] = os.getenv("BRAIN_JEPA_MODEL_PATH") or None
        self.device: str = os.getenv("BRAIN_JEPA_DEVICE", "cpu")

    @property
    def model_loaded(self) -> bool:
        return False

    def health(self) -> BrainJepaHealthResponse:
        return BrainJepaHealthResponse(
            status="stub",
            model_loaded=self.model_loaded,
            device=self.device,
            stub=True,
            message=_STUB_MESSAGE,
        )

    def embed(self, request: BrainJepaEmbedRequest) -> BrainJepaEmbedResponse:
        start = time.monotonic()
        _ = request.fmri_uri
        latency_ms = int((time.monotonic() - start) * 1000)
        return BrainJepaEmbedResponse(
            stub=True,
            status="stub",
            patient_id=request.patient_id,
            embedding=None,
            embedding_dim=None,
            latency_ms=latency_ms,
            disclaimer=BRAIN_JEPA_DISCLAIMER,
            message=_STUB_MESSAGE,
        )


_singleton: Optional[BrainJepaEmbedder] = None


def get_embedder() -> BrainJepaEmbedder:
    global _singleton
    if _singleton is None:
        _singleton = BrainJepaEmbedder()
    return _singleton
