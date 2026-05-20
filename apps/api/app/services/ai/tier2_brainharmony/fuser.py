"""BrainHarmony sMRI+fMRI structure-function fusion (stub)."""
from __future__ import annotations

import os
import time
from typing import Optional

from .disclaimers import BRAINHARMONY_DISCLAIMER
from .schemas import (
    BrainHarmonyFuseRequest,
    BrainHarmonyFuseResponse,
    BrainHarmonyHealthResponse,
)

_STUB_MESSAGE = (
    "BrainHarmony model is not loaded. Provide BRAINHARMONY_MODEL_PATH and "
    "land the follow-up wiring PR to enable real fusion."
)


class BrainHarmonyFuser:
    def __init__(self) -> None:
        self.model_path: Optional[str] = os.getenv("BRAINHARMONY_MODEL_PATH") or None
        self.device: str = os.getenv("BRAINHARMONY_DEVICE", "cpu")

    @property
    def model_loaded(self) -> bool:
        return False

    def health(self) -> BrainHarmonyHealthResponse:
        return BrainHarmonyHealthResponse(
            status="stub",
            model_loaded=self.model_loaded,
            device=self.device,
            stub=True,
            message=_STUB_MESSAGE,
        )

    def fuse(self, request: BrainHarmonyFuseRequest) -> BrainHarmonyFuseResponse:
        start = time.monotonic()
        _ = request.smri_uri
        latency_ms = int((time.monotonic() - start) * 1000)
        return BrainHarmonyFuseResponse(
            stub=True,
            status="stub",
            patient_id=request.patient_id,
            fused_features=None,
            feature_dim=None,
            latency_ms=latency_ms,
            disclaimer=BRAINHARMONY_DISCLAIMER,
            message=_STUB_MESSAGE,
        )


_singleton: Optional[BrainHarmonyFuser] = None


def get_fuser() -> BrainHarmonyFuser:
    global _singleton
    if _singleton is None:
        _singleton = BrainHarmonyFuser()
    return _singleton
