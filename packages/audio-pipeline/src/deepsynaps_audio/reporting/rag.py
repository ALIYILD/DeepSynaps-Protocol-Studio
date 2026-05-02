"""MedRAG citation resolver — bridges into the shared 87k-paper Postgres DB."""

from __future__ import annotations

from typing import Sequence

from ..schemas import Citation


def medrag_evidence(
    condition: str,
    drivers: Sequence[str],
    *,
    top_k: int = 5,
) -> list[Citation]:
    """Resolve top-k cited findings for a flagged condition + its drivers.

    TODO: implement in PR #4 — re-use the MedRAG retrieval path
    already wired in ``packages/qeeg-pipeline`` /
    ``packages/mri-pipeline``. v1 ships with a curated starter list of
    ~30 PD / dysarthria / neuromodulation-voice papers; v2 widens to
    cognitive + respiratory.
    """

    raise NotImplementedError(
        "reporting.rag.medrag_evidence: implement in PR #4 "
        "(see AUDIO_ANALYZER_STACK.md §9)."
    )
