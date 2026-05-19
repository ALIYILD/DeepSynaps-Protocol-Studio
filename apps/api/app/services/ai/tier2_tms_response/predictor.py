"""Multimodal-MRI TMS response predictor (stub)."""
from __future__ import annotations

import os
import time
from typing import Optional

from .disclaimers import TMS_RESPONSE_DISCLAIMER
from .schemas import (
    TmsResponseHealthResponse,
    TmsResponsePredictRequest,
    TmsResponsePredictResponse,
)

_STUB_MESSAGE = (
    "TMS response predictor is not loaded. Provide TMS_RESPONSE_MODEL_PATH "
    "and land the follow-up wiring PR to enable real prediction."
)
_AUC_REFERENCE = 0.932


class TmsResponsePredictor:
    def __init__(self) -> None:
        self.model_path: Optional[str] = os.getenv("TMS_RESPONSE_MODEL_PATH") or None

    @property
    def model_loaded(self) -> bool:
        return False

    def health(self) -> TmsResponseHealthResponse:
        return TmsResponseHealthResponse(
            status="stub",
            model_loaded=self.model_loaded,
            auc_reference=_AUC_REFERENCE,
            stub=True,
            message=_STUB_MESSAGE,
        )

    def predict(self, request: TmsResponsePredictRequest) -> TmsResponsePredictResponse:
        start = time.monotonic()
        _ = request.mri_uri
        latency_ms = int((time.monotonic() - start) * 1000)
        return TmsResponsePredictResponse(
            stub=True,
            status="stub",
            patient_id=request.patient_id,
            predicted_response_probability=None,
            auc_reference=_AUC_REFERENCE,
            feature_attribution=None,
            latency_ms=latency_ms,
            disclaimer=TMS_RESPONSE_DISCLAIMER,
            message=_STUB_MESSAGE,
        )


_singleton: Optional[TmsResponsePredictor] = None


def get_predictor() -> TmsResponsePredictor:
    global _singleton
    if _singleton is None:
        _singleton = TmsResponsePredictor()
    return _singleton
