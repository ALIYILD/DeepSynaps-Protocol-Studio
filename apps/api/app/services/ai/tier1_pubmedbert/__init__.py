"""Tier 1 — PubMedBERT clinical entity extractor.

Stub-mode by default. Reads ``PUBMEDBERT_MODEL_PATH`` from the
environment; while unset every ``extract`` call returns
``stub: True, entities: []`` with the canonical disclaimer.

No model weights loaded, no transformer call, no fabricated entities in
this module. Real wiring lands in a follow-up PR.
"""
from .disclaimers import PUBMEDBERT_DISCLAIMER
from .extractor import PubmedbertExtractor, get_extractor
from .schemas import (
    PubmedbertEntity,
    PubmedbertExtractRequest,
    PubmedbertExtractResponse,
    PubmedbertHealthResponse,
    PubmedbertStatus,
)

__all__ = [
    "PUBMEDBERT_DISCLAIMER",
    "PubmedbertExtractor",
    "get_extractor",
    "PubmedbertEntity",
    "PubmedbertExtractRequest",
    "PubmedbertExtractResponse",
    "PubmedbertHealthResponse",
    "PubmedbertStatus",
]
