"""Tier 2 sgACC TMS-targeting predictor.

Stub-only. Reads ``SGACC_REFERENCE_MAP_URI`` and ``SGACC_MODEL_PATH``
from the environment. Stays in stub mode whenever either is unset.

Real connectivity computation (seed-based correlation of resting-state
fMRI against the sgACC reference map) and the regression head that maps
that connectivity to a recommended coil location and response probability
land in a follow-up PR. This module ships the contract only — no NIfTI
fetched, no sklearn/LightGBM model loaded, no MNI coordinates returned.
"""
from __future__ import annotations

import os
import time
from typing import Optional

from .disclaimers import SGACC_DISCLAIMER
from .schemas import SgaccHealthResponse, SgaccTargetRequest, SgaccTargetResponse

_STUB_MESSAGE = (
    "sgACC reference map and/or regression head are not loaded. "
    "Provide SGACC_REFERENCE_MAP_URI and SGACC_MODEL_PATH, then land "
    "the follow-up wiring PR to enable real prediction."
)


class SgaccPredictor:
    """Stub sgACC connectivity-based TMS targeting predictor."""

    def __init__(self) -> None:
        self.reference_map_uri: Optional[str] = (
            os.getenv("SGACC_REFERENCE_MAP_URI") or None
        )
        self.model_path: Optional[str] = os.getenv("SGACC_MODEL_PATH") or None

    @property
    def reference_map_loaded(self) -> bool:
        # Setting the env var does NOT yet load the map — the follow-up
        # PR will validate the file is reachable + cache the array.
        return False

    @property
    def model_loaded(self) -> bool:
        return False

    @property
    def is_stub(self) -> bool:
        return not (self.reference_map_loaded and self.model_loaded)

    def health(self) -> SgaccHealthResponse:
        return SgaccHealthResponse(
            status="stub",
            reference_map_loaded=self.reference_map_loaded,
            model_loaded=self.model_loaded,
            stub=True,
            message=_STUB_MESSAGE,
        )

    def predict(self, request: SgaccTargetRequest) -> SgaccTargetResponse:
        start = time.monotonic()
        # Touch the request so static analysers see it as used.
        _ = request.fmri_volume_uri
        latency_ms = int((time.monotonic() - start) * 1000)

        return SgaccTargetResponse(
            stub=True,
            status="stub",
            patient_id=request.patient_id,
            recommended_coil_mni=None,
            predicted_response_probability=None,
            predictor_correlation_r=None,
            latency_ms=latency_ms,
            disclaimer=SGACC_DISCLAIMER,
            message=_STUB_MESSAGE,
        )


_singleton: Optional[SgaccPredictor] = None


def get_predictor() -> SgaccPredictor:
    """Return a process-wide ``SgaccPredictor`` singleton."""
    global _singleton
    if _singleton is None:
        _singleton = SgaccPredictor()
    return _singleton
