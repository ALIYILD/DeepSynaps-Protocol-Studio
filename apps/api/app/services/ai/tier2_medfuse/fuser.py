"""MEDFuse multimodal fusion (stub)."""
from __future__ import annotations

import os
import time
from typing import Optional

from .disclaimers import MEDFUSE_DISCLAIMER
from .schemas import MedfuseFuseRequest, MedfuseFuseResponse, MedfuseHealthResponse

_STUB_MESSAGE = (
    "MEDFuse model is not loaded. Provide MEDFUSE_MODEL_PATH and land the "
    "follow-up wiring PR to enable real fusion."
)
_SUPPORTED = ["mri", "fmri", "eeg", "clinical", "genomics"]


class MedfuseFuser:
    def __init__(self) -> None:
        self.model_path: Optional[str] = os.getenv("MEDFUSE_MODEL_PATH") or None

    @property
    def model_loaded(self) -> bool:
        return False

    def health(self) -> MedfuseHealthResponse:
        return MedfuseHealthResponse(
            status="stub",
            model_loaded=self.model_loaded,
            supported_modalities=list(_SUPPORTED),
            stub=True,
            message=_STUB_MESSAGE,
        )

    def fuse(self, request: MedfuseFuseRequest) -> MedfuseFuseResponse:
        start = time.monotonic()
        modalities_used = sorted(request.modalities.keys())
        latency_ms = int((time.monotonic() - start) * 1000)
        return MedfuseFuseResponse(
            stub=True,
            status="stub",
            patient_id=request.patient_id,
            fused_embedding=None,
            embedding_dim=None,
            modalities_used=modalities_used,
            latency_ms=latency_ms,
            disclaimer=MEDFUSE_DISCLAIMER,
            message=_STUB_MESSAGE,
        )


_singleton: Optional[MedfuseFuser] = None


def get_fuser() -> MedfuseFuser:
    global _singleton
    if _singleton is None:
        _singleton = MedfuseFuser()
    return _singleton
