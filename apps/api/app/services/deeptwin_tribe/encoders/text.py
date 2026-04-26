"""Text/journal/sentiment encoder.

Today: deterministic surface features (length, sentiment proxy, lexicon
hits). Tomorrow: replace with a sentence-bert / clinical-NLP encoder.
"""

from __future__ import annotations

from typing import Any

import numpy as np

from ..types import ModalityEmbedding
from ._common import attribution_dict, compute_quality, empty_embedding, project_features, stable_seed

FEATURE_NAMES = [
    "n_journal_entries_30d",
    "avg_entry_length",
    "sentiment_polarity",
    "sentiment_variance",
    "lex_distress",
    "lex_hopeful",
    "lex_sleep",
    "lex_pain",
    "lex_focus",
    "lex_social",
]

POSITIVE_WORDS = {"better", "calm", "sleep", "focused", "hopeful", "good", "ok"}
NEGATIVE_WORDS = {"anxious", "depressed", "tired", "panic", "pain", "bad", "stress"}


def _sentiment(text: str) -> float:
    tokens = text.lower().split()
    if not tokens:
        return 0.0
    pos = sum(1 for t in tokens if t in POSITIVE_WORDS)
    neg = sum(1 for t in tokens if t in NEGATIVE_WORDS)
    if pos + neg == 0:
        return 0.0
    return float(pos - neg) / float(pos + neg)


def _extract_features(patient_id: str, sample: dict[str, Any] | None) -> tuple[np.ndarray, int]:
    if sample:
        entries: list[str] = [str(e) for e in (sample.get("journal_entries") or [])]
        n = len(entries)
        if n == 0:
            return np.zeros(len(FEATURE_NAMES)), 0
        avg_len = float(np.mean([len(e) for e in entries]))
        sentiments = np.array([_sentiment(e) for e in entries])
        polarity = float(np.mean(sentiments))
        variance = float(np.var(sentiments))
        all_text = " ".join(entries).lower()

        def _hits(words: set[str]) -> float:
            return float(sum(1 for w in all_text.split() if w in words))

        return np.array([
            float(n), avg_len, polarity, variance,
            _hits({"distressed", "anxious", "panic", "scared"}),
            _hits({"hopeful", "better", "improving"}),
            _hits({"sleep", "tired", "rest"}),
            _hits({"pain", "ache", "sore"}),
            _hits({"focused", "distracted", "concentrating"}),
            _hits({"family", "friends", "social"}),
        ]), n
    rng = np.random.default_rng(stable_seed("text_features", patient_id))
    n = int(np.clip(rng.normal(loc=8, scale=6), 0, 30))
    if n == 0:
        return np.zeros(len(FEATURE_NAMES)), 0
    vec = rng.standard_normal(size=len(FEATURE_NAMES)) * 0.5
    vec[0] = float(n)
    vec[1] = float(np.clip(120 + rng.normal(scale=40), 20, 600))
    return vec, n


def encode_text(patient_id: str, *, sample: dict[str, Any] | None = None) -> ModalityEmbedding:
    if "__no_text__" in patient_id:
        return empty_embedding("text", "No journal or note text in the last 30 days.")
    vec, n = _extract_features(patient_id, sample)
    quality = compute_quality(available=int(n), expected=10)
    if quality == 0:
        return empty_embedding("text", "Text modality has zero recent entries.")
    embedding = project_features(vec, modality="text", patient_id=patient_id)
    return ModalityEmbedding(
        modality="text",
        vector=embedding.tolist(),
        quality=quality,
        missing=False,
        feature_attributions=attribution_dict(FEATURE_NAMES, vec),
        notes=["Sentiment is a coarse lexicon proxy; no clinical claim."],
    )
