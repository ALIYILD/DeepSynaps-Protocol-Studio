"""Real-time E-field surrogate (stub)."""
from __future__ import annotations

import os
import time
from typing import Optional

from .disclaimers import EFIELD_DISCLAIMER
from .schemas import EfieldHealthResponse, EfieldSimulateRequest, EfieldSimulateResponse

_STUB_MESSAGE = (
    "E-field surrogate model is not loaded. Provide EFIELD_MODEL_PATH and "
    "land the follow-up wiring PR to enable real surrogate simulation."
)
_SUPPORTED_COILS = ["figure8", "double_cone", "h_coil", "circular"]


class EfieldSurrogate:
    def __init__(self) -> None:
        self.model_path: Optional[str] = os.getenv("EFIELD_MODEL_PATH") or None
        self.device: str = os.getenv("EFIELD_DEVICE", "cpu")

    @property
    def model_loaded(self) -> bool:
        return False

    def health(self) -> EfieldHealthResponse:
        return EfieldHealthResponse(
            status="stub",
            model_loaded=self.model_loaded,
            device=self.device,
            supported_coil_types=list(_SUPPORTED_COILS),
            stub=True,
            message=_STUB_MESSAGE,
        )

    def simulate(self, request: EfieldSimulateRequest) -> EfieldSimulateResponse:
        start = time.monotonic()
        _ = request.coil_position
        latency_ms = int((time.monotonic() - start) * 1000)
        return EfieldSimulateResponse(
            stub=True,
            status="stub",
            patient_id=request.patient_id,
            peak_efield_v_per_m=None,
            target_efield_v_per_m=None,
            off_target_ratio=None,
            latency_ms=latency_ms,
            disclaimer=EFIELD_DISCLAIMER,
            message=_STUB_MESSAGE,
        )


_singleton: Optional[EfieldSurrogate] = None


def get_surrogate() -> EfieldSurrogate:
    global _singleton
    if _singleton is None:
        _singleton = EfieldSurrogate()
    return _singleton
