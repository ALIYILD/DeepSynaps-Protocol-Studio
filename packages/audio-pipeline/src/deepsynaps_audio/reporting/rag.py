"""MedRAG citation stub — returns empty until Postgres bridge is wired."""

from __future__ import annotations

from typing import Sequence

from ..schemas import Citation


def medrag_evidence(
    condition: str,
    drivers: Sequence[str],
    *,
    top_k: int = 5,
) -> list[Citation]:
    """Placeholder: wire to shared evidence DB in production."""

    _ = (condition, drivers, top_k)
    return []
