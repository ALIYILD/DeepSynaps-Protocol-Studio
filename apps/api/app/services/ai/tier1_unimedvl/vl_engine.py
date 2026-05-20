"""UniMedVL multimodal text+image medical understanding engine (stub)."""
from __future__ import annotations

import os
import time
from typing import Optional

from .disclaimers import UNIMEDVL_DISCLAIMER
from .schemas import (
    UniMedVlHealthResponse,
    UniMedVlUnderstandRequest,
    UniMedVlUnderstandResponse,
)

_STUB_MESSAGE = (
    "UniMedVL model is not loaded. Provide UNIMEDVL_MODEL_PATH and land "
    "the follow-up wiring PR to enable real multimodal understanding."
)


class UniMedVlEngine:
    def __init__(self) -> None:
        self.model_path: Optional[str] = os.getenv("UNIMEDVL_MODEL_PATH") or None
        self.device: str = os.getenv("UNIMEDVL_DEVICE", "cpu")

    @property
    def model_loaded(self) -> bool:
        return False

    def health(self) -> UniMedVlHealthResponse:
        return UniMedVlHealthResponse(
            status="stub",
            model_loaded=self.model_loaded,
            device=self.device,
            stub=True,
            message=_STUB_MESSAGE,
        )

    def understand(
        self, request: UniMedVlUnderstandRequest
    ) -> UniMedVlUnderstandResponse:
        start = time.monotonic()
        _ = request.image_uri
        latency_ms = int((time.monotonic() - start) * 1000)
        return UniMedVlUnderstandResponse(
            stub=True,
            status="stub",
            patient_id=request.patient_id,
            understanding=None,
            caption=None,
            latency_ms=latency_ms,
            disclaimer=UNIMEDVL_DISCLAIMER,
            message=_STUB_MESSAGE,
        )


_singleton: Optional[UniMedVlEngine] = None


def get_engine() -> UniMedVlEngine:
    global _singleton
    if _singleton is None:
        _singleton = UniMedVlEngine()
    return _singleton
