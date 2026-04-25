from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

from deepsynaps_qeeg.ai import medrag as medrag_mod

from .contraindications import ContraindicationHit, filter_contraindicated
from .features import FeatureVector
from .protocols import Protocol, ProtocolLibrary
from .rules import RuleHit, evaluate_rules


@dataclass(frozen=True)
class ProtocolRecommendation:
    protocol_id: str
    protocol_name: str
    score: float
    condition_id: str
    modality_id: str
    target_region: str | None
    evidence_urls: list[str] = field(default_factory=list)
    rule_hits: list[RuleHit] = field(default_factory=list)
    contraindications_filtered: bool = False
    disclaimer: str = (
        "Decision support only. Not a diagnosis or treatment recommendation. "
        "Clinician supervision required."
    )


def _condition_prior_from_rule_hits(rule_hits: list[RuleHit]) -> dict[str, float]:
    priors: dict[str, float] = {}
    for hit in rule_hits:
        priors[hit.condition_slug] = max(priors.get(hit.condition_slug, 0.0), float(hit.score))
    return priors


def _medrag_evidence_score(
    *,
    condition_slug: str,
    modality_hint: str | None,
    medrag_fn: Callable[..., list[dict[str, Any]]],
) -> tuple[float, list[str]]:
    # medrag.retrieve expects "flagged_conditions" and "modalities" keys in eeg_features.
    query = {
        "flagged_conditions": [condition_slug.replace("_like", "")],
        "modalities": [modality_hint] if modality_hint else [],
    }
    papers = medrag_fn(query, {}, k=5) or []
    urls: list[str] = []
    score = 0.0
    for p in papers:
        score += float(p.get("relevance") or 0.0)
        url = p.get("url")
        if isinstance(url, str) and url:
            urls.append(url)
    # Normalise to a small additive term.
    return min(2.0, score / 5.0), urls[:5]


def recommend_protocols(
    fv: FeatureVector,
    *,
    patient_meta: dict[str, Any] | None = None,
    library: ProtocolLibrary | None = None,
    top_k: int = 5,
    medrag_fn: Callable[..., list[dict[str, Any]]] | None = None,
) -> tuple[list[ProtocolRecommendation], list[ContraindicationHit], list[RuleHit]]:
    """Rank distinct protocol candidates.

    Returns
    -------
    (recommendations, contraindication_hits, rule_hits)
    """
    library = library or ProtocolLibrary.load()
    medrag_fn = medrag_fn or medrag_mod.retrieve

    rule_hits = evaluate_rules(fv)
    priors = _condition_prior_from_rule_hits(rule_hits)

    # Candidate selection: keep protocols whose condition_id is among the top
    # supported rule-hit slugs if possible; otherwise fall back to entire catalog.
    # We do not have condition_id↔slug mapping inside qeeg-pipeline, so we rank
    # directly over the catalog but boost by rule-hit priors via simple heuristics.
    candidates: list[Protocol] = library.protocols

    # Contraindication hard filter.
    candidates, contra_hits = filter_contraindicated(candidates, patient_meta)

    recs: list[ProtocolRecommendation] = []
    for p in candidates:
        score = 0.0

        # Rule-hit boost by matching heuristic keywords in protocol name.
        name_l = (p.protocol_name or "").lower()
        for hit in rule_hits:
            if hit.condition_slug.startswith("adhd") and "adhd" in name_l:
                score += float(hit.score)
            if hit.condition_slug.startswith("mdd") and ("mdd" in name_l or "depress" in name_l):
                score += float(hit.score)
            if hit.condition_slug.startswith("anxiety") and "anx" in name_l:
                score += float(hit.score)
            if hit.condition_slug.startswith("cognitive") and ("cogn" in name_l or "mci" in name_l):
                score += float(hit.score)

        # If we couldn't match anything by keyword, add a small prior to keep rule hits influential.
        score += 0.1 * sum(priors.values())

        # MedRAG evidence term (condition slug only, modality hint unknown here).
        # We use the best rule-hit condition (by score) as the evidence query.
        best = max(rule_hits, key=lambda h: h.score, default=None)
        if best is not None:
            ev_score, ev_urls = _medrag_evidence_score(
                condition_slug=best.condition_slug,
                modality_hint=None,
                medrag_fn=medrag_fn,
            )
            score += ev_score
        else:
            ev_urls = []

        # Catalog evidence URLs (primary/secondary sources).
        urls = list(dict.fromkeys([*p.source_urls, *ev_urls]))

        recs.append(
            ProtocolRecommendation(
                protocol_id=p.protocol_id,
                protocol_name=p.protocol_name,
                score=score,
                condition_id=p.condition_id,
                modality_id=p.modality_id,
                target_region=p.target_region,
                evidence_urls=urls[:6],
                rule_hits=rule_hits,
            )
        )

    # Sort + ensure distinct by protocol_id, return top_k.
    recs.sort(key=lambda r: r.score, reverse=True)
    distinct: list[ProtocolRecommendation] = []
    seen: set[str] = set()
    for r in recs:
        if r.protocol_id in seen:
            continue
        seen.add(r.protocol_id)
        distinct.append(r)
        if len(distinct) >= int(top_k):
            break

    return distinct, contra_hits, rule_hits

