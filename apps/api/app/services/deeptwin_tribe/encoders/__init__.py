"""Modality encoders for the TRIBE-inspired DeepTwin layer.

Each encoder exposes ``encode(patient_id, *, sample) -> ModalityEmbedding``.

For now each encoder is a deterministic feature-extraction + projection
function seeded by ``patient_id``. The interface is designed so a real
pretrained encoder (qEEG transformer, MRI vision encoder, sentence-bert
text encoder, etc.) can be swapped in without touching fusion/heads/
explanation downstream.

Why deterministic synthetic encoders today?
- The repo has no training infrastructure or labelled outcome data.
- The frontend already needs a stable, predictable response shape.
- Building TRIBE-shaped seams now lets a future model swap be a
  one-file change per modality.

Quality scoring
---------------
Each encoder reports ``quality`` in [0, 1]. The number is computed from
input signal: more channels, more sessions, fewer artifacts → higher
quality. It is purely a coverage/quality heuristic, not a clinical
score. Fusion uses it as the attention weight for that modality.
"""

from __future__ import annotations

from .assessments import encode_assessments
from .demographics import encode_demographics
from .medications import encode_medications
from .mri import encode_mri
from .qeeg import encode_qeeg
from .text import encode_text
from .treatment_history import encode_treatment_history
from .voice import encode_voice
from .wearables import encode_wearables

__all__ = [
    "encode_assessments",
    "encode_demographics",
    "encode_medications",
    "encode_mri",
    "encode_qeeg",
    "encode_text",
    "encode_treatment_history",
    "encode_voice",
    "encode_wearables",
]
