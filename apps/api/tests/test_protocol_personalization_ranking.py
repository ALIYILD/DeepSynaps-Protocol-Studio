"""Deterministic protocol ranking among eligible rows — unit + API coverage."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.services.clinical_data import load_clinical_dataset
from app.services.protocol_personalization import (
    NormalizedPersonalization,
    build_phenotypes_by_id,
    build_protocol_file_index,
    diagnose_personalization_rules,
    normalize_personalization_payload,
    resolve_failed_modality_ids,
    select_protocol_among_eligible,
)
from deepsynaps_core_schema import ProtocolDraftRequest


def test_normalize_personalization_maps_aliases_and_qeeg_allowlist() -> None:
    p = ProtocolDraftRequest(
        condition="Major Depressive Disorder (MDD)",
        symptom_cluster="General",
        modality="rTMS (Repetitive Transcranial Magnetic Stimulation)",
        device="",
        setting="Clinic",
        evidence_threshold="Guideline",
        phenotype_tags=[" Anxious ", "anxious"],
        comorbidities=["PTSD"],
        prior_failed_modalities=["rTMS (Repetitive Transcranial Magnetic Stimulation)"],
        qeeg_summary="Alpha asymmetry frontal",
    )
    n = normalize_personalization_payload(p)
    assert n.canonical_phenotype_tags == ["anxious_depression_mix"]
    assert "ptsd" in n.comorbidity_tags_norm
    assert n.canonical_qeeg_tags == ["frontal_alpha_asymmetry"]


def test_ranking_stable_deterministic() -> None:
    bundle = load_clinical_dataset()
    eligible = [p for p in bundle.tables["protocols"] if p["Protocol_ID"] in ("PRO-001", "PRO-031")]
    assert len(eligible) == 2
    idx = build_protocol_file_index(bundle.tables["protocols"])
    pheno = build_phenotypes_by_id(bundle.tables)
    failed = resolve_failed_modality_ids([], bundle.tables["modalities"])
    norm = NormalizedPersonalization(canonical_phenotype_tags=["anxious_depression_mix"])
    kwargs = dict(
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
    ra = select_protocol_among_eligible(**kwargs)
    rb = select_protocol_among_eligible(**kwargs)
    assert ra.chosen["Protocol_ID"] == rb.chosen["Protocol_ID"] == "PRO-031"


def test_fallback_token_overlap_when_no_structured_rule_matches() -> None:
    """Active hints + zero structured score (no rules table) => overlap from canonical qEEG tokens vs phenotype text."""
    bundle = load_clinical_dataset()
    eligible = [p for p in bundle.tables["protocols"] if p["Protocol_ID"] in ("PRO-001", "PRO-031")]
    idx = build_protocol_file_index(bundle.tables["protocols"])
    pheno = build_phenotypes_by_id(bundle.tables)
    failed = resolve_failed_modality_ids([], bundle.tables["modalities"])
    norm = NormalizedPersonalization(canonical_qeeg_tags=["frontal_alpha_asymmetry"])
    res = select_protocol_among_eligible(
        eligible=eligible,
        protocol_file_index=idx,
        phenotypes_by_id=pheno,
        failed_modality_ids=failed,
        norm=norm,
        personalization_rules=[],
        condition_id="CON-001",
        modality_id="MOD-001",
        device_id="DEV-001",
    )
    assert "phenotype_text_overlap_fallback" in res.ranking_factors_applied
    assert "structured_personalization_rules" not in res.ranking_factors_applied
    assert res.chosen["Protocol_ID"] == "PRO-001"


def test_conflicting_structured_rules_resolve_by_score_then_evidence() -> None:
    """anxious_depression_mix (250) beats anhedonia_cluster (120) for PRO-001 vs PRO-031."""
    bundle = load_clinical_dataset()
    eligible = [p for p in bundle.tables["protocols"] if p["Protocol_ID"] in ("PRO-001", "PRO-031")]
    idx = build_protocol_file_index(bundle.tables["protocols"])
    pheno = build_phenotypes_by_id(bundle.tables)
    failed = resolve_failed_modality_ids([], bundle.tables["modalities"])
    norm = NormalizedPersonalization(
        canonical_phenotype_tags=["anxious_depression_mix", "anhedonia_cluster"],
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
    assert res.chosen["Protocol_ID"] == "PRO-031"


def test_opaque_phenotype_only_preserves_csv_first() -> None:
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
            phenotype_tags=["zzzopaqueunknowntokenforaudit"],
        )
    )
    assert norm.canonical_phenotype_tags == []
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
    assert res.chosen["Protocol_ID"] == "PRO-001"
    assert res.ranking_factors_applied == []


def test_prior_failed_rtms_penalizes_both_rtms_rows_equally_tiebreak_csv(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    """Both eligible protocols are MOD-001; failed 'rTMS' maps to MOD-001 — equal penalty → CSV-first wins."""
    r = client.post(
        "/api/v1/protocols/generate-draft",
        headers=auth_headers["clinician"],
        json={
            "condition": "Major Depressive Disorder (MDD)",
            "symptom_cluster": "General",
            "modality": "rTMS (Repetitive Transcranial Magnetic Stimulation)",
            "device": "NeuroStar Advanced Therapy System",
            "setting": "Clinic",
            "evidence_threshold": "Guideline",
            "off_label": False,
            "prior_failed_modalities": ["rTMS"],
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert "37.5" in body["duration"]
    assert "prior_failed_modality_downrank" in body["ranking_factors_applied"]


def test_mdd_rtms_anxious_tag_uses_structured_rule(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    r = client.post(
        "/api/v1/protocols/generate-draft",
        headers=auth_headers["clinician"],
        json={
            "condition": "Major Depressive Disorder (MDD)",
            "symptom_cluster": "General",
            "modality": "rTMS (Repetitive Transcranial Magnetic Stimulation)",
            "device": "NeuroStar Advanced Therapy System",
            "setting": "Clinic",
            "evidence_threshold": "Guideline",
            "off_label": False,
            "phenotype_tags": ["anxious"],
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert "~45" in body["duration"] or "45 minutes" in body["duration"]
    assert "structured_personalization_rules" in body["ranking_factors_applied"]
    assert "phenotype_text_overlap_fallback" not in body["ranking_factors_applied"]
    assert body["structured_rules_applied"] == ["PR-001"]
    assert body["structured_rule_score_total"] == 250
    assert "PRO-031" in " ".join(body["protocol_ranking_rationale"])


def test_mdd_rtms_qeeg_frontal_asymmetry_structured_prefers_pro001(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    r = client.post(
        "/api/v1/protocols/generate-draft",
        headers=auth_headers["clinician"],
        json={
            "condition": "Major Depressive Disorder (MDD)",
            "symptom_cluster": "General",
            "modality": "rTMS (Repetitive Transcranial Magnetic Stimulation)",
            "device": "NeuroStar Advanced Therapy System",
            "setting": "Clinic",
            "evidence_threshold": "Guideline",
            "off_label": False,
            "qeeg_summary": "We note frontal alpha asymmetry on review.",
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert "37.5" in body["duration"]
    assert "structured_personalization_rules" in body["ranking_factors_applied"]
    assert body["structured_rules_applied"] == ["PR-002"]
    assert body["structured_rule_score_total"] == 240
    assert "PRO-001" in " ".join(body["protocol_ranking_rationale"])


def test_evidence_grade_still_applies_when_structured_scores_tie() -> None:
    """Synthetic: two rows same structured score; EV-A should beat EV-B."""
    eligible = [
        {
            "Protocol_ID": "PX-A",
            "Protocol_Name": "A",
            "Phenotype_ID": "",
            "Modality_ID": "MOD-001",
            "Evidence_Grade": "EV-B",
        },
        {
            "Protocol_ID": "PX-B",
            "Protocol_Name": "B",
            "Phenotype_ID": "",
            "Modality_ID": "MOD-001",
            "Evidence_Grade": "EV-A",
        },
    ]
    idx = {"PX-A": 0, "PX-B": 1}
    norm = NormalizedPersonalization(canonical_phenotype_tags=["anxious_depression_mix"])
    rules = [
        {
            "Rule_ID": "Z-1",
            "Condition_ID": "CON-001",
            "Modality_ID": "MOD-001",
            "Device_ID": "",
            "Phenotype_Tag": "anxious_depression_mix",
            "QEEG_Tag": "",
            "Comorbidity_Tag": "",
            "Prior_Response_Tag": "",
            "Preferred_Protocol_ID": "PX-A",
            "Score_Delta": "100",
            "Rationale_Label": "t",
            "Active": "Y",
            "Notes": "",
        },
        {
            "Rule_ID": "Z-2",
            "Condition_ID": "CON-001",
            "Modality_ID": "MOD-001",
            "Device_ID": "",
            "Phenotype_Tag": "anxious_depression_mix",
            "QEEG_Tag": "",
            "Comorbidity_Tag": "",
            "Prior_Response_Tag": "",
            "Preferred_Protocol_ID": "PX-B",
            "Score_Delta": "100",
            "Rationale_Label": "t",
            "Active": "Y",
            "Notes": "",
        },
    ]
    res = select_protocol_among_eligible(
        eligible=eligible,
        protocol_file_index=idx,
        phenotypes_by_id={},
        failed_modality_ids=set(),
        norm=norm,
        personalization_rules=rules,
        condition_id="CON-001",
        modality_id="MOD-001",
        device_id="DEV-001",
    )
    assert res.chosen["Protocol_ID"] == "PX-B"


def test_shipped_personalization_rules_have_no_duplicate_or_conflict_diagnoses() -> None:
    bundle = load_clinical_dataset()
    d = diagnose_personalization_rules(bundle.tables["personalization_rules"])
    assert not d["duplicates"]
    assert not d["conflicting_deltas"]
    assert not d["invalid_empty_match"]


def test_diagnose_detects_conflicting_deltas_same_match_key() -> None:
    rules = [
        {
            "Rule_ID": "E-1",
            "Condition_ID": "CON-001",
            "Modality_ID": "MOD-001",
            "Device_ID": "",
            "Phenotype_Tag": "x",
            "QEEG_Tag": "",
            "Comorbidity_Tag": "",
            "Prior_Response_Tag": "",
            "Preferred_Protocol_ID": "PRO-001",
            "Score_Delta": "10",
            "Rationale_Label": "",
            "Active": "Y",
            "Notes": "",
        },
        {
            "Rule_ID": "E-2",
            "Condition_ID": "CON-001",
            "Modality_ID": "MOD-001",
            "Device_ID": "",
            "Phenotype_Tag": "x",
            "QEEG_Tag": "",
            "Comorbidity_Tag": "",
            "Prior_Response_Tag": "",
            "Preferred_Protocol_ID": "PRO-001",
            "Score_Delta": "20",
            "Rationale_Label": "",
            "Active": "Y",
            "Notes": "",
        },
    ]
    d = diagnose_personalization_rules(rules)
    assert d["conflicting_deltas"]


def test_diagnose_detects_duplicate_active_rules() -> None:
    rules = [
        {
            "Rule_ID": "D-1",
            "Condition_ID": "CON-001",
            "Modality_ID": "MOD-001",
            "Device_ID": "",
            "Phenotype_Tag": "x",
            "QEEG_Tag": "",
            "Comorbidity_Tag": "",
            "Prior_Response_Tag": "",
            "Preferred_Protocol_ID": "PRO-001",
            "Score_Delta": "10",
            "Rationale_Label": "",
            "Active": "Y",
            "Notes": "",
        },
        {
            "Rule_ID": "D-2",
            "Condition_ID": "CON-001",
            "Modality_ID": "MOD-001",
            "Device_ID": "",
            "Phenotype_Tag": "x",
            "QEEG_Tag": "",
            "Comorbidity_Tag": "",
            "Prior_Response_Tag": "",
            "Preferred_Protocol_ID": "PRO-001",
            "Score_Delta": "10",
            "Rationale_Label": "",
            "Active": "Y",
            "Notes": "",
        },
    ]
    d = diagnose_personalization_rules(rules)
    assert d["duplicates"]


def test_multiple_structured_rules_sum_in_rule_id_order() -> None:
    eligible = [
        {
            "Protocol_ID": "PX-1",
            "Protocol_Name": "P",
            "Phenotype_ID": "",
            "Modality_ID": "MOD-001",
            "Evidence_Grade": "EV-A",
        },
        {
            "Protocol_ID": "PX-2",
            "Protocol_Name": "Q",
            "Phenotype_ID": "",
            "Modality_ID": "MOD-001",
            "Evidence_Grade": "EV-B",
        },
    ]
    idx = {"PX-1": 0, "PX-2": 1}
    norm = NormalizedPersonalization(canonical_phenotype_tags=["anxious_depression_mix"])
    rules = [
        {
            "Rule_ID": "M-02",
            "Condition_ID": "CON-001",
            "Modality_ID": "MOD-001",
            "Device_ID": "",
            "Phenotype_Tag": "anxious_depression_mix",
            "QEEG_Tag": "",
            "Comorbidity_Tag": "",
            "Prior_Response_Tag": "",
            "Preferred_Protocol_ID": "PX-1",
            "Score_Delta": "10",
            "Rationale_Label": "b",
            "Active": "Y",
            "Notes": "",
        },
        {
            "Rule_ID": "M-01",
            "Condition_ID": "CON-001",
            "Modality_ID": "MOD-001",
            "Device_ID": "",
            "Phenotype_Tag": "anxious_depression_mix",
            "QEEG_Tag": "",
            "Comorbidity_Tag": "",
            "Prior_Response_Tag": "",
            "Preferred_Protocol_ID": "PX-1",
            "Score_Delta": "5",
            "Rationale_Label": "a",
            "Active": "Y",
            "Notes": "",
        },
    ]
    res = select_protocol_among_eligible(
        eligible=eligible,
        protocol_file_index=idx,
        phenotypes_by_id={},
        failed_modality_ids=set(),
        norm=norm,
        personalization_rules=rules,
        condition_id="CON-001",
        modality_id="MOD-001",
        device_id="DEV-001",
    )
    assert res.structured_rules_applied == ["M-01", "M-02"]
    assert res.structured_rule_score_total == 15
    assert res.structured_rule_labels_applied == ["a", "b"]


def test_comorbidity_and_prior_columns_parse_without_matching_when_absent() -> None:
    """Registry rows may include Comorbidity_Tag / Prior_Response_Tag; empty => no extra filter."""
    eligible = [
        {
            "Protocol_ID": "PX-1",
            "Protocol_Name": "P",
            "Phenotype_ID": "",
            "Modality_ID": "MOD-001",
            "Evidence_Grade": "EV-A",
        },
        {
            "Protocol_ID": "PX-2",
            "Protocol_Name": "Q",
            "Phenotype_ID": "",
            "Modality_ID": "MOD-001",
            "Evidence_Grade": "EV-B",
        },
    ]
    idx = {"PX-1": 0, "PX-2": 1}
    norm = NormalizedPersonalization(
        canonical_phenotype_tags=["anxious_depression_mix"],
        comorbidity_tags_norm=["ptsd"],
        canonical_prior_response="partial_response",
    )
    rules = [
        {
            "Rule_ID": "C-1",
            "Condition_ID": "CON-001",
            "Modality_ID": "MOD-001",
            "Device_ID": "",
            "Phenotype_Tag": "anxious_depression_mix",
            "QEEG_Tag": "",
            "Comorbidity_Tag": "",
            "Prior_Response_Tag": "",
            "Preferred_Protocol_ID": "PX-1",
            "Score_Delta": "7",
            "Rationale_Label": "x",
            "Active": "Y",
            "Notes": "",
        },
    ]
    res = select_protocol_among_eligible(
        eligible=eligible,
        protocol_file_index=idx,
        phenotypes_by_id={},
        failed_modality_ids=set(),
        norm=norm,
        personalization_rules=rules,
        condition_id="CON-001",
        modality_id="MOD-001",
        device_id="DEV-001",
    )
    assert res.structured_rule_score_total == 7
