"""Governance helpers, review reports, why-selected projections, and payload bounds."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from app.services.clinical_data import load_clinical_dataset
from app.services.personalization_governance import (
    MAX_STRUCTURED_MATCH_FIRES_TOTAL,
    build_personalization_rule_review_snapshot,
    build_why_selected_debug_projection,
    format_personalization_rule_review_report,
    validate_structured_matches_payload_size,
)
from app.services.protocol_personalization import (
    build_phenotypes_by_id,
    build_protocol_file_index,
    normalize_personalization_payload,
    resolve_failed_modality_ids,
    select_protocol_among_eligible,
)
from deepsynaps_core_schema import ProtocolDraftRequest


def test_review_snapshot_shape_and_counts() -> None:
    bundle = load_clinical_dataset()
    rules = bundle.tables["personalization_rules"]
    snap = build_personalization_rule_review_snapshot(rules)
    assert snap["format_version"] == 1
    assert snap["total_rules"] == len(rules)
    assert snap["active_rules_count"] >= 1
    assert "rules_by_condition" in snap
    assert "diagnostics" in snap
    assert isinstance(snap["active_rule_ids_sorted"], list)
    text = format_personalization_rule_review_report(rules)
    assert "Personalization rules registry review" in text
    assert "Diagnostics" in text


def test_shipped_registry_diagnostics_clean() -> None:
    bundle = load_clinical_dataset()
    snap = build_personalization_rule_review_snapshot(bundle.tables["personalization_rules"])
    for key, items in snap["diagnostics"].items():
        assert not items, f"unexpected diagnostic [{key}]: {items}"


def test_why_selected_projection_reflects_structured_choice() -> None:
    bundle = load_clinical_dataset()
    eligible = [p for p in bundle.tables["protocols"] if p["Protocol_ID"] in ("PRO-001", "PRO-031")]
    idx = build_protocol_file_index(bundle.tables["protocols"])
    pheno = build_phenotypes_by_id(bundle.tables)
    failed = resolve_failed_modality_ids([], bundle.tables["modalities"])
    norm = normalize_personalization_payload(
        ProtocolDraftRequest(
            condition="Major Depressive Disorder (MDD)",
            symptom_cluster="General",
            modality="rTMS (Repetitive Transcranial Magnetic Stimulation)",
            device="NeuroStar Advanced Therapy System",
            setting="Clinic",
            evidence_threshold="Guideline",
            phenotype_tags=["anxious"],
        )
    )
    res = select_protocol_among_eligible(
        eligible=eligible,
        protocol_file_index=idx,
        phenotypes_by_id=pheno,
        failed_modality_ids=failed,
        norm=norm,
        personalization_rules=bundle.tables["personalization_rules"],
        condition_id="CON-001",
        modality_id="MOD-001",
        device_id="DEV-001",
    )
    dbg = build_why_selected_debug_projection(res)
    assert dbg["selected_protocol_id"] == "PRO-031"
    assert dbg["csv_first_baseline_protocol_id"] == "PRO-001"
    assert dbg["personalization_changed_vs_csv_first"] is True
    assert dbg["fired_rule_ids"] == ["PR-001"]
    assert "structured_personalization_rules" in dbg["ranking_factors_applied"]
    assert dbg["token_fallback_used"] is False
    assert dbg["deterministic_rank_order_protocol_ids"][0] == "PRO-031"
    top = dbg["top_protocols_by_structured_score"]
    assert top[0]["protocol_id"] == "PRO-031"
    assert top[0]["structured_score_total"] == 250


def test_why_selected_no_hints_baseline_equals_selected() -> None:
    bundle = load_clinical_dataset()
    eligible = [p for p in bundle.tables["protocols"] if p["Protocol_ID"] in ("PRO-001", "PRO-031")]
    idx = build_protocol_file_index(bundle.tables["protocols"])
    pheno = build_phenotypes_by_id(bundle.tables)
    failed = resolve_failed_modality_ids([], bundle.tables["modalities"])
    norm = normalize_personalization_payload(
        ProtocolDraftRequest(
            condition="Major Depressive Disorder (MDD)",
            symptom_cluster="General",
            modality="rTMS (Repetitive Transcranial Magnetic Stimulation)",
            device="NeuroStar Advanced Therapy System",
            setting="Clinic",
            evidence_threshold="Guideline",
        )
    )
    res = select_protocol_among_eligible(
        eligible=eligible,
        protocol_file_index=idx,
        phenotypes_by_id=pheno,
        failed_modality_ids=failed,
        norm=norm,
        personalization_rules=bundle.tables["personalization_rules"],
        condition_id="CON-001",
        modality_id="MOD-001",
        device_id="DEV-001",
    )
    dbg = build_why_selected_debug_projection(res)
    assert dbg["personalization_changed_vs_csv_first"] is False
    assert dbg["selected_protocol_id"] == dbg["csv_first_baseline_protocol_id"]


def test_structured_matches_payload_stays_bounded_for_shipped_data() -> None:
    bundle = load_clinical_dataset()
    eligible = [p for p in bundle.tables["protocols"] if p["Protocol_ID"] in ("PRO-001", "PRO-031")]
    idx = build_protocol_file_index(bundle.tables["protocols"])
    pheno = build_phenotypes_by_id(bundle.tables)
    norm = normalize_personalization_payload(
        ProtocolDraftRequest(
            condition="Major Depressive Disorder (MDD)",
            symptom_cluster="General",
            modality="rTMS (Repetitive Transcranial Magnetic Stimulation)",
            device="NeuroStar Advanced Therapy System",
            setting="Clinic",
            evidence_threshold="Guideline",
            phenotype_tags=["anxious"],
        )
    )
    res = select_protocol_among_eligible(
        eligible=eligible,
        protocol_file_index=idx,
        phenotypes_by_id=pheno,
        failed_modality_ids=set(),
        norm=norm,
        personalization_rules=bundle.tables["personalization_rules"],
        condition_id="CON-001",
        modality_id="MOD-001",
        device_id="DEV-001",
    )
    w = validate_structured_matches_payload_size(
        dict(res.structured_rule_matches_by_protocol),
        max_total_fires=MAX_STRUCTURED_MATCH_FIRES_TOTAL,
    )
    assert not w


def test_validate_structured_matches_warns_when_over_limit() -> None:
    huge = {f"P-{i}": [object()] * 3 for i in range(2000)}
    msgs = validate_structured_matches_payload_size(huge, max_total_fires=100)
    assert msgs


def test_optional_load_time_registry_warn(monkeypatch) -> None:
    load_clinical_dataset.cache_clear()

    def _fake_diag(_rules):
        return {"duplicates": ["unit-test synthetic duplicate message"]}

    monkeypatch.setenv("DEEPSYNAPS_PERSONALIZATION_REGISTRY_WARN", "1")
    with patch("app.services.protocol_personalization.diagnose_personalization_rules", _fake_diag):
        with pytest.warns(UserWarning, match="Personalization registry diagnostics"):
            load_clinical_dataset()
