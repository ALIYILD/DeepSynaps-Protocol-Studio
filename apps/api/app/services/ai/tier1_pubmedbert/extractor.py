"""PubMedBERT clinical entity extractor.

Stub-only. Reads ``PUBMEDBERT_MODEL_PATH`` from the environment. Stays
in stub mode while the path is unset. No transformer is loaded, no
entity spans are fabricated.
"""
from __future__ import annotations

import os
import time
from typing import Optional

from .disclaimers import PUBMEDBERT_DISCLAIMER
from .schemas import (
    PubmedbertExtractRequest,
    PubmedbertExtractResponse,
    PubmedbertHealthResponse,
)

_STUB_MESSAGE = (
    "PubMedBERT model is not loaded. Provide PUBMEDBERT_MODEL_PATH and "
    "land the follow-up PR to enable real entity extraction."
)


class PubmedbertExtractor:
    """Stub clinical entity extractor."""

    def __init__(self) -> None:
        self.model_path: Optional[str] = os.getenv("PUBMEDBERT_MODEL_PATH") or None

    @property
    def model_loaded(self) -> bool:
        return False

    def health(self) -> PubmedbertHealthResponse:
        return PubmedbertHealthResponse(
            status="stub",
            model_loaded=self.model_loaded,
            stub=True,
            message=_STUB_MESSAGE,
        )

    def extract(self, request: PubmedbertExtractRequest) -> PubmedbertExtractResponse:
        start = time.monotonic()
        text_length = len(request.text)
        latency_ms = int((time.monotonic() - start) * 1000)
        return PubmedbertExtractResponse(
            stub=True,
            status="stub",
            entities=[],
            text_length=text_length,
            latency_ms=latency_ms,
            disclaimer=PUBMEDBERT_DISCLAIMER,
            message=_STUB_MESSAGE,
        )


_singleton: Optional[PubmedbertExtractor] = None


def get_extractor() -> PubmedbertExtractor:
    global _singleton
    if _singleton is None:
        _singleton = PubmedbertExtractor()
    return _singleton
