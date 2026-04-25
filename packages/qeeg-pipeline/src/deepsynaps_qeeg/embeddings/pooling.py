"""Pooling helpers for transformer token sequences.

The embedders in this repo expose a consistent post-model representation
interface: a window yields either a single embedding vector or a token matrix.
Pooling helpers convert token matrices into a single vector per window.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import numpy as np


PoolingName = Literal["mean", "cls", "attention"]


def mean_pool(tokens: np.ndarray) -> np.ndarray:
    """Mean pool over the token axis.

    Parameters
    ----------
    tokens : np.ndarray
        Shape ``(n_tokens, d)`` or ``(batch, n_tokens, d)``.
    """
    if tokens.ndim == 2:
        return tokens.mean(axis=0)
    if tokens.ndim == 3:
        return tokens.mean(axis=1)
    raise ValueError(f"tokens must be 2D or 3D, got shape {tokens.shape}")


def cls_pool(tokens: np.ndarray) -> np.ndarray:
    """Take the first token as the pooled representation."""
    if tokens.ndim == 2:
        return tokens[0]
    if tokens.ndim == 3:
        return tokens[:, 0, :]
    raise ValueError(f"tokens must be 2D or 3D, got shape {tokens.shape}")


@dataclass(frozen=True)
class AttentionPooling:
    """Simple attention pooling with a fixed query vector.

    This is intentionally minimal: it is a deterministic post-processing helper,
    not a trainable layer. The query can be learned elsewhere and passed in.
    """

    query: np.ndarray  # shape (d,)
    temperature: float = 1.0

    def __call__(self, tokens: np.ndarray) -> np.ndarray:
        if tokens.ndim == 2:
            return _attn_pool_2d(tokens, self.query, self.temperature)
        if tokens.ndim == 3:
            return np.stack(
                [_attn_pool_2d(t, self.query, self.temperature) for t in tokens], axis=0
            )
        raise ValueError(f"tokens must be 2D or 3D, got shape {tokens.shape}")


def _attn_pool_2d(tokens: np.ndarray, query: np.ndarray, temperature: float) -> np.ndarray:
    if tokens.ndim != 2:
        raise ValueError("tokens must be 2D")
    if query.ndim != 1 or query.shape[0] != tokens.shape[1]:
        raise ValueError(f"query must be shape ({tokens.shape[1]},), got {query.shape}")
    temp = float(temperature) if float(temperature) > 0 else 1.0
    logits = (tokens @ query) / temp  # (n_tokens,)
    logits = logits - float(np.max(logits))
    weights = np.exp(logits)
    weights = weights / (float(np.sum(weights)) or 1.0)
    return (tokens * weights[:, None]).sum(axis=0)


def pool(tokens: np.ndarray, name: PoolingName, *, query: np.ndarray | None = None) -> np.ndarray:
    """Pool tokens into a single vector.

    Parameters
    ----------
    tokens : np.ndarray
        Shape ``(n_tokens, d)`` or ``(batch, n_tokens, d)``.
    name : {"mean","cls","attention"}
    query : np.ndarray | None
        Required for ``attention`` pooling. Shape ``(d,)``.
    """
    if name == "mean":
        return mean_pool(tokens)
    if name == "cls":
        return cls_pool(tokens)
    if name == "attention":
        if query is None:
            raise ValueError("query is required for attention pooling")
        return AttentionPooling(query=query)(tokens)
    raise ValueError(f"Unknown pooling mode: {name}")

