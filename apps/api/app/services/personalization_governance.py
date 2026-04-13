"""Governance and review helpers for personalization_rules.csv — no ranking side effects."""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from app.services.protocol_personalization import (
    PersonalizationRankingResult,
    diagnose_personalization_rules,
    _is_active_flag,
)


RULE_REGISTRY_REVIEW_FORMAT_VERSION = 1

# Guardrail for API payloads: total Rule_ID × protocol entries in matches_by_protocol.
MAX_STRUCTURED_MATCH_FIRES_TOTAL = 5000


def validate_structured_matches_payload_size(
    matches_by_protocol: dict[str, list[Any]],
    *,
    max_total_fires: int = MAX_STRUCTURED_MATCH_FIRES_TOTAL,
) -> list[str]:
    """Return warning strings if payload is unusually large (deterministic; for CI/governance)."""
    total = sum(len(v) for v in matches_by_protocol.values())
    if total > max_total_fires:
        return [
            f"structured_rule_matches_by_protocol fire count {total} exceeds soft limit {max_total_fires}."
        ]
    return []


def build_personalization_rule_review_snapshot(rules: list[dict[str, str]]) -> dict[str, Any]:
    """Deterministic JSON-serializable summary for tests and tooling."""
    active = [r for r in rules if _is_active_flag(r.get("Active", ""))]
    inactive = len(rules) - len(active)

    by_condition: dict[str, list[str]] = defaultdict(list)
    by_modality: dict[str, list[str]] = defaultdict(list)
    by_target: dict[str, list[str]] = defaultdict(list)
    with_pheno: list[str] = []
    with_qeeg: list[str] = []
    with_comorb: list[str] = []
    with_prior: list[str] = []

    for r in active:
        rid = (r.get("Rule_ID") or "").strip()
        cid = (r.get("Condition_ID") or "").strip()
        mid = (r.get("Modality_ID") or "").strip()
        tid = (r.get("Preferred_Protocol_ID") or "").strip()
        if cid:
            by_condition[cid].append(rid)
        if mid:
            by_modality[mid].append(rid)
        if tid:
            by_target[tid].append(rid)
        if (r.get("Phenotype_Tag") or "").strip():
            with_pheno.append(rid)
        if (r.get("QEEG_Tag") or "").strip():
            with_qeeg.append(rid)
        if (r.get("Comorbidity_Tag") or "").strip():
            with_comorb.append(rid)
        if (r.get("Prior_Response_Tag") or "").strip():
            with_prior.append(rid)

    diagnostics = diagnose_personalization_rules(rules)

    parallel_groups = [
        line for line in diagnostics.get("parallel_competing_targets", []) if line
    ]
    shadow_groups = [line for line in diagnostics.get("shadow_candidates", []) if line]

    return {
        "format_version": RULE_REGISTRY_REVIEW_FORMAT_VERSION,
        "total_rules": len(rules),
        "active_rules_count": len(active),
        "inactive_rules_count": inactive,
        "rules_by_condition": {k: sorted(v) for k, v in sorted(by_condition.items())},
        "rules_by_modality": {k: sorted(v) for k, v in sorted(by_modality.items())},
        "rules_by_target_protocol": {k: sorted(v) for k, v in sorted(by_target.items())},
        "active_rule_ids_sorted": sorted({(r.get("Rule_ID") or "").strip() for r in active if (r.get("Rule_ID") or "").strip()}),
        "rules_with_phenotype_tag": sorted(with_pheno),
        "rules_with_qeeg_tag": sorted(with_qeeg),
        "rules_with_comorbidity_tag": sorted(with_comorb),
        "rules_with_prior_response_tag": sorted(with_prior),
        "diagnostics": {k: list(v) for k, v in sorted(diagnostics.items())},
        "parallel_rule_groups_messages": sorted(parallel_groups),
        "shadow_candidate_messages": sorted(shadow_groups),
    }


def format_personalization_rule_review_report(rules: list[dict[str, str]]) -> str:
    """Multi-line human-readable report for reviewers and local CLI."""
    snap = build_personalization_rule_review_snapshot(rules)
    lines: list[str] = [
        "=== Personalization rules registry review ===",
        f"Format version: {snap['format_version']}",
        f"Total rows: {snap['total_rules']} (active: {snap['active_rules_count']}, inactive: {snap['inactive_rules_count']})",
        "",
        "--- Rules by Condition_ID ---",
    ]
    for cid, rids in snap["rules_by_condition"].items():
        lines.append(f"  {cid}: {', '.join(rids)}")
    if not snap["rules_by_condition"]:
        lines.append("  (none)")
    lines.extend(["", "--- Rules by Modality_ID ---"])
    for mid, rids in snap["rules_by_modality"].items():
        lines.append(f"  {mid}: {', '.join(rids)}")
    if not snap["rules_by_modality"]:
        lines.append("  (none)")
    lines.extend(["", "--- Rules by target Preferred_Protocol_ID ---"])
    for pid, rids in snap["rules_by_target_protocol"].items():
        lines.append(f"  {pid}: {', '.join(rids)}")
    lines.extend(
        [
            "",
            "--- Tag dimensions (active rules) ---",
            f"  Phenotype_Tag: {len(snap['rules_with_phenotype_tag'])} rules ({', '.join(snap['rules_with_phenotype_tag']) or '-'})",
            f"  QEEG_Tag: {len(snap['rules_with_qeeg_tag'])} rules ({', '.join(snap['rules_with_qeeg_tag']) or '-'})",
            f"  Comorbidity_Tag: {len(snap['rules_with_comorbidity_tag'])} rules ({', '.join(snap['rules_with_comorbidity_tag']) or '-'})",
            f"  Prior_Response_Tag: {len(snap['rules_with_prior_response_tag'])} rules ({', '.join(snap['rules_with_prior_response_tag']) or '-'})",
            "",
            "--- Diagnostics (conservative static checks) ---",
        ]
    )
    diag = snap["diagnostics"]
    any_issue = False
    for key in sorted(diag.keys()):
        items = diag[key]
        if items:
            any_issue = True
        lines.append(f"  [{key}] ({len(items)})")
        for msg in items:
            lines.append(f"    - {msg}")
    if not any_issue:
        lines.append("  (no issues in any category)")
    lines.extend(["", "--- Parallel / shadow (informational) ---"])
    for msg in snap["parallel_rule_groups_messages"]:
        lines.append(f"  parallel: {msg}")
    for msg in snap["shadow_candidate_messages"]:
        lines.append(f"  shadow: {msg}")
    if not snap["parallel_rule_groups_messages"] and not snap["shadow_candidate_messages"]:
        lines.append("  (none)")
    lines.append("")
    return "\n".join(lines)


def build_why_selected_debug_projection(
    rank: PersonalizationRankingResult,
    *,
    max_competitors: int = 8,
) -> dict[str, Any]:
    """Compact, clinician/debug-friendly summary for one ranking outcome (no PHI)."""
    items = sorted(
        rank.structured_score_by_protocol.items(),
        key=lambda x: (-x[1], x[0]),
    )
    top_competing = [
        {"protocol_id": pid, "structured_score_total": score} for pid, score in items[: max(0, max_competitors)]
    ]
    factor_set = set(rank.ranking_factors_applied)
    evidence_fallback_tiebreak = sorted(
        factor_set
        & {
            "evidence_grade_weight",
            "prior_failed_modality_downrank",
            "csv_order_tiebreak",
            "phenotype_text_overlap_fallback",
            "structured_personalization_rules",
        }
    )
    return {
        "format_version": 1,
        "selected_protocol_id": rank.chosen.get("Protocol_ID", ""),
        "selected_protocol_name": rank.chosen.get("Protocol_Name", ""),
        "csv_first_baseline_protocol_id": rank.csv_baseline_protocol_id,
        "csv_first_baseline_protocol_name": rank.csv_baseline_protocol_name,
        "personalization_changed_vs_csv_first": rank.personalization_changed_vs_csv_first,
        "fired_rule_ids": list(rank.structured_rules_applied),
        "fired_rule_labels": list(rank.structured_rule_labels_applied),
        "structured_rule_score_total": rank.structured_rule_score_total,
        "token_fallback_used": rank.token_fallback_used,
        "ranking_factors_applied": list(rank.ranking_factors_applied),
        "secondary_sort_factors": evidence_fallback_tiebreak,
        "top_protocols_by_structured_score": top_competing,
        "deterministic_rank_order_protocol_ids": list(rank.ranked_protocol_ids),
        "eligible_protocol_count": len(rank.ranked_protocol_ids),
    }
