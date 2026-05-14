"""Patient similarity graph for cohort benchmarking.

Builds dynamic k-NN graph from patient feature vectors.
Decision-support only.
"""

from __future__ import annotations

import math
from typing import Any


def cosine_similarity(a: list[float], b: list[float]) -> float:
    """Cosine similarity between two equal-length vectors."""
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def build_patient_similarity_graph(
    target_patient: dict[str, Any],
    cohort: list[dict[str, Any]],
    k: int = 5,
) -> dict[str, Any]:
    """Build k-NN similarity graph for target patient against cohort.

    Args:
        target_patient: dict with at least "fused_features" and "id" keys.
        cohort: list of patient dicts, each with "fused_features", "id",
                and optional "diagnosis" / "age".
        k: number of nearest neighbors to return.

    Returns:
        dict with target_patient id, k, neighbors list, avg_similarity,
        and cohort_size.
    """
    target_features = target_patient.get("fused_features", [])

    similarities: list[dict[str, Any]] = []
    for patient in cohort:
        p_features = patient.get("fused_features", [])
        sim = cosine_similarity(target_features, p_features)
        similarities.append(
            {
                "patient_id": patient.get("id"),
                "similarity": sim,
                "diagnosis": patient.get("diagnosis"),
                "age": patient.get("age"),
            }
        )

    # Sort descending by similarity
    similarities.sort(key=lambda x: x["similarity"], reverse=True)
    neighbors = similarities[:k]

    avg_similarity = (
        sum(n["similarity"] for n in neighbors) / len(neighbors) if neighbors else 0.0
    )

    return {
        "target_patient": target_patient.get("id"),
        "k": k,
        "neighbors": neighbors,
        "avg_similarity": avg_similarity,
        "cohort_size": len(cohort),
    }


def build_similarity_matrix(
    patients: list[dict[str, Any]],
) -> dict[str, Any]:
    """Build a full pairwise similarity matrix for a set of patients.

    Useful for cohort-level visualizations and clustering.
    """
    n = len(patients)
    features_list = [p.get("fused_features", []) for p in patients]
    ids = [p.get("id") for p in patients]

    matrix: list[list[float]] = [[0.0] * n for _ in range(n)]
    for i in range(n):
        matrix[i][i] = 1.0
        for j in range(i + 1, n):
            sim = cosine_similarity(features_list[i], features_list[j])
            matrix[i][j] = sim
            matrix[j][i] = sim

    return {
        "patient_ids": ids,
        "matrix": matrix,
        "n": n,
    }
