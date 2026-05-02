"""Bridge biometrics analytics summaries to evidence intelligence (87k corpus query).

Builds :class:`EvidenceQuery` from optional correlation/features payloads and runs
:class:`query_evidence` — same stack as ``POST /api/v1/evidence/query``.
"""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field

from app.services.evidence_intelligence import (
    EvidenceFeatureSummary,
    EvidenceQuery,
    EvidenceResult,
    query_evidence,
)


def _map_context(ctx: str) -> str:
    c = (ctx or "biomarker").lower()
    allowed: set[str] = {
        "prediction",
        "biomarker",
        "risk_score",
        "recommendation",
        "multimodal_summary",
    }
    return c if c in allowed else "biomarker"


class BiometricsEvidenceRequest(BaseModel):
    patient_id: Optional[str] = None
    evidence_target: str = Field(
        default="stress_load",
        description=(
            "Evidence intelligence target (e.g. stress_load, wearable_sleep_circadian, "
            "wearable_activity_monitoring, depression_risk)."
        ),
    )
    context_type: str = Field(default="biomarker")
    max_results: int = Field(default=8, ge=1, le=30)
    correlation_snapshot: Optional[dict[str, Any]] = None
    features_snapshot: Optional[dict[str, Any]] = None
    phenotype_tags: list[str] = Field(default_factory=list)
    diagnosis_filters: list[str] = Field(default_factory=list)


def build_evidence_query_from_biometrics(req: BiometricsEvidenceRequest) -> EvidenceQuery:
    """Augment default concepts with numeric hints from biometrics JSON snapshots."""
    features: list[EvidenceFeatureSummary] = []

    corr = req.correlation_snapshot or {}
    matrix = corr.get("matrix") or corr.get("correlation_matrix")
    if isinstance(matrix, dict) and matrix:
        # strongest absolute pairwise coefficient among returned keys
        best_pair = None
        best_abs = -1.0
        for k, coef in matrix.items():
            if k is None:
                continue
            ks = str(k).replace(":", " ")
            parts = ks.split()
            try:
                v = float(coef)
            except (TypeError, ValueError):
                continue
            if abs(v) > best_abs:
                best_abs = abs(v)
                best_pair = (ks, v)
        if best_pair:
            features.append(
                EvidenceFeatureSummary(
                    name="strongest_bivariate_correlation",
                    value=f"{best_pair[0]} r≈{best_pair[1]:.3f}",
                    modality="wearables",
                    direction="associational_only",
                )
            )

    feat = req.features_snapshot or {}
    daily = feat.get("daily") if isinstance(feat.get("daily"), dict) else {}
    roll = feat.get("rolling_7d") if isinstance(feat.get("rolling_7d"), dict) else {}
    for label, bucket in (("daily_mean", daily), ("rolling_7d", roll)):
        for key, val in list(bucket.items())[:12]:
            if isinstance(val, (int, float)):
                features.append(
                    EvidenceFeatureSummary(
                        name=f"{label}_{key}",
                        value=float(val),
                        modality="wearables",
                    )
                )

    return EvidenceQuery(
        patient_id=req.patient_id,
        context_type=_map_context(req.context_type),  # type: ignore[arg-type]
        target_name=req.evidence_target,
        modality_filters=["wearables", "digital phenotype"],
        diagnosis_filters=list(req.diagnosis_filters),
        phenotype_tags=list(req.phenotype_tags),
        feature_summary=features,
        max_results=req.max_results,
        include_counter_evidence=True,
    )


def biometrics_evidence_result(req: BiometricsEvidenceRequest) -> EvidenceResult:
    q = build_evidence_query_from_biometrics(req)
    return query_evidence(q, db=None)


def provenance_note(corpus: str) -> str:
    return (
        f"Ranked from DeepSynaps evidence intelligence ({corpus or 'corpus'}). "
        "Citations support discussion only — not individualized prognosis."
    )
