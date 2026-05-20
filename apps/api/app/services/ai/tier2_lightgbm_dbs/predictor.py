"""LightGBM DBS motor-outcome predictor (stub)."""
from __future__ import annotations

import os
import time
from typing import Optional

from .disclaimers import LIGHTGBM_DBS_DISCLAIMER
from .schemas import DbsHealthResponse, DbsPredictRequest, DbsPredictResponse

_STUB_MESSAGE = (
    "LightGBM DBS predictor is not loaded. Provide DBS_MODEL_PATH and "
    "land the follow-up wiring PR to enable real prediction."
)
_AUC_REFERENCE = 0.921


class LightgbmDbsPredictor:
    def __init__(self) -> None:
        self.model_path: Optional[str] = os.getenv("DBS_MODEL_PATH") or None

    @property
    def model_loaded(self) -> bool:
        return False

    def health(self) -> DbsHealthResponse:
        return DbsHealthResponse(
            status="stub",
            model_loaded=self.model_loaded,
            auc_reference=_AUC_REFERENCE,
            stub=True,
            message=_STUB_MESSAGE,
        )

    def predict(self, request: DbsPredictRequest) -> DbsPredictResponse:
        start = time.monotonic()
        _ = request.clinical_features
        latency_ms = int((time.monotonic() - start) * 1000)
        return DbsPredictResponse(
            stub=True,
            status="stub",
            patient_id=request.patient_id,
            predicted_motor_improvement_pct=None,
            auc_reference=_AUC_REFERENCE,
            latency_ms=latency_ms,
            disclaimer=LIGHTGBM_DBS_DISCLAIMER,
            message=_STUB_MESSAGE,
        )


_singleton: Optional[LightgbmDbsPredictor] = None


def get_predictor() -> LightgbmDbsPredictor:
    global _singleton
    if _singleton is None:
        _singleton = LightgbmDbsPredictor()
    return _singleton
