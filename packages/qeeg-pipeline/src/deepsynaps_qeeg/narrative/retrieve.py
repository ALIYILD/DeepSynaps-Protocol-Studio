from __future__ import annotations

import math
from typing import Any

from .types import Citation, Finding


def _finding_query_text(f: Finding) -> str:
    # De-identified query string (no PHI).
    direction = "increased" if f.direction == "elevated" else "decreased" if f.direction == "reduced" else "normal"
    return (
        f"qEEG {f.metric} {f.band} {f.region} z={f.z:.2f} ({direction}) "
        "resting EEG normative deviation"
    )


def retrieve_evidence(finding: Finding, top_k: int = 5) -> list[Citation]:
    """Retrieve literature evidence for a single finding via MedRAG.

    Blending policy:
    - 60% "graph" pass (condition/modality-aware inputs)
    - 40% "vector" pass (free-text note query)

    Notes
    -----
    MedRAG's current public API returns a unified list already; we implement
    the blend by issuing two MedRAG queries and merging unique results.
    """
    try:
        from ..ai import medrag as medrag_mod
    except Exception:
        return []

    k = int(top_k or 5)
    if k <= 0:
        return []

    graph_k = max(1, int(math.ceil(0.6 * k)))
    vec_k = max(0, k - graph_k)

    # "graph" query: drive the KG traversal by using broad, non-PHI slugs.
    # We do NOT invent clinical labels; we just provide feature tokens.
    graph_features: dict[str, Any] = {
        "flagged_conditions": [],
        "modalities": [],
        "notes": _finding_query_text(finding),
    }
    graph_meta: dict[str, Any] = {"age": None, "sex": None}

    # "vector" query: free text only.
    vec_features: dict[str, Any] = {"notes": _finding_query_text(finding)}
    vec_meta: dict[str, Any] = {"query": _finding_query_text(finding)}

    graph_rows = []
    try:
        graph_rows = medrag_mod.retrieve(graph_features, graph_meta, k=graph_k)
    except Exception:
        graph_rows = []

    vec_rows = []
    if vec_k > 0:
        try:
            vec_rows = medrag_mod.retrieve(vec_features, vec_meta, k=vec_k)
        except Exception:
            vec_rows = []

    merged: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in (graph_rows or []) + (vec_rows or []):
        if not isinstance(row, dict):
            continue
        pid = row.get("paper_id") or row.get("pmid") or row.get("doi") or row.get("url")
        if not pid:
            continue
        pid_s = str(pid)
        if pid_s in seen:
            continue
        seen.add(pid_s)
        merged.append(row)
        if len(merged) >= k:
            break

    citations: list[Citation] = []
    for i, row in enumerate(merged, start=1):
        citations.append(
            Citation(
                citation_id=f"C{i}",
                pmid=str(row.get("pmid")) if row.get("pmid") else None,
                doi=str(row.get("doi")) if row.get("doi") else None,
                title=row.get("title"),
                year=int(row["year"]) if row.get("year") is not None else None,
                url=row.get("url"),
                relevance=float(row.get("relevance") or row.get("relevance_score") or 0.0),
                extra={"paper_id": row.get("paper_id"), "evidence_chain": row.get("evidence_chain")},
            )
        )
    return citations


__all__ = ["retrieve_evidence"]

