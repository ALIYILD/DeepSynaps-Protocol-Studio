"""Tests for app.services.protocol_personalization — deterministic protocol ranking.

Covers:
- PHENOTYPE_INPUT_ALIASES maps 'anxious' to canonical tag
- QEEG_PHRASE_TO_CANONICAL maps 'alpha asymmetry' to frontal_alpha_asymmetry
- PRIOR_RESPONSE_ALIASES maps 'partial' to 'partial_response'
- normalize_personalization_payload handles empty phenotype_tags
- normalize_personalization_payload maps aliases to canonical tags
- normalize_personalization_payload captures unmapped phenotype strings
- normalize_personalization_payload maps qeeg summary phrase
- has_active_ranking_hints returns False when norm is empty
- has_active_ranking_hints returns True with canonical phenotype tags
- select_protocol_among_eligible returns first when only one eligible
- select_protocol_among_eligible returns PersonalizationRankingResult
- build_protocol_file_index maps Protocol_ID to index
- diagnose_personalization_rules detects duplicates
- structured_score_for_protocol sums matching rule deltas
"""
from __future__ import annotations

from unittest.mock import MagicMock


def _make_request(**kwargs):
    """Build a minimal ProtocolDraftRequest-like mock."""
    req = MagicMock()
    req.phenotype_tags = kwargs.get("phenotype_tags", [])
    req.qeeg_summary = kwargs.get("qeeg_summary", "")
    req.comorbidities = kwargs.get("comorbidities", [])
    req.prior_failed_modalities = kwargs.get("prior_failed_modalities", [])
    req.prior_response = kwargs.get("prior_response", "")
    return req


def _make_protocol(pid: str, name: str = "Proto", evidence: str = "EV-B",
                   modality: str = "MOD-1", phenotype: str = "PHENO-1") -> dict:
    return {
        "Protocol_ID": pid,
        "Protocol_Name": name,
        "Evidence_Grade": evidence,
        "Modality_ID": modality,
        "Phenotype_ID": phenotype,
    }


def _make_norm(**kwargs):
    from app.services.protocol_personalization import NormalizedPersonalization
    return NormalizedPersonalization(**kwargs)


def test_phenotype_aliases_maps_anxious():
    from app.services.protocol_personalization import PHENOTYPE_INPUT_ALIASES

    assert "anxious" in PHENOTYPE_INPUT_ALIASES
    assert PHENOTYPE_INPUT_ALIASES["anxious"] == "anxious_depression_mix"


def test_qeeg_phrase_maps_alpha_asymmetry():
    from app.services.protocol_personalization import QEEG_PHRASE_TO_CANONICAL

    assert "alpha asymmetry" in QEEG_PHRASE_TO_CANONICAL
    assert QEEG_PHRASE_TO_CANONICAL["alpha asymmetry"] == "frontal_alpha_asymmetry"


def test_prior_response_aliases_maps_partial():
    from app.services.protocol_personalization import PRIOR_RESPONSE_ALIASES

    assert "partial" in PRIOR_RESPONSE_ALIASES
    assert PRIOR_RESPONSE_ALIASES["partial"] == "partial_response"


def test_normalize_empty_request():
    from app.services.protocol_personalization import normalize_personalization_payload

    req = _make_request()
    norm = normalize_personalization_payload(req)
    assert norm.canonical_phenotype_tags == []
    assert norm.canonical_qeeg_tags == []


def test_normalize_maps_anxious_alias():
    from app.services.protocol_personalization import normalize_personalization_payload

    req = _make_request(phenotype_tags=["anxious"])
    norm = normalize_personalization_payload(req)
    assert "anxious_depression_mix" in norm.canonical_phenotype_tags


def test_normalize_captures_unmapped_phenotype():
    from app.services.protocol_personalization import normalize_personalization_payload

    req = _make_request(phenotype_tags=["totally_unknown_phenotype"])
    norm = normalize_personalization_payload(req)
    assert "totally_unknown_phenotype" in norm.phenotype_unmapped
    assert norm.canonical_phenotype_tags == []


def test_normalize_maps_qeeg_phrase():
    from app.services.protocol_personalization import normalize_personalization_payload

    req = _make_request(qeeg_summary="patient shows frontal alpha asymmetry")
    norm = normalize_personalization_payload(req)
    assert "frontal_alpha_asymmetry" in norm.canonical_qeeg_tags


def test_has_active_ranking_hints_false_when_empty():
    from app.services.protocol_personalization import has_active_ranking_hints

    norm = _make_norm()
    result = has_active_ranking_hints(norm, [])
    assert result is False


def test_has_active_ranking_hints_true_with_phenotype():
    from app.services.protocol_personalization import has_active_ranking_hints

    norm = _make_norm(canonical_phenotype_tags=["anxious_depression_mix"])
    result = has_active_ranking_hints(norm, [])
    assert result is True


def test_select_protocol_single_eligible():
    from app.services.protocol_personalization import (
        select_protocol_among_eligible,
        NormalizedPersonalization,
    )

    p = _make_protocol("P-001")
    norm = NormalizedPersonalization()
    result = select_protocol_among_eligible(
        eligible=[p],
        protocol_file_index={"P-001": 0},
        phenotypes_by_id={},
        failed_modality_ids=set(),
        norm=norm,
        personalization_rules=[],
        condition_id="COND-1",
        modality_id="MOD-1",
        device_id="DEV-1",
    )
    assert result.chosen["Protocol_ID"] == "P-001"
    assert result.ranked_protocol_ids == ["P-001"]


def test_select_protocol_returns_ranking_result():
    from app.services.protocol_personalization import (
        select_protocol_among_eligible,
        PersonalizationRankingResult,
        NormalizedPersonalization,
    )

    p1 = _make_protocol("P-001", evidence="EV-A")
    p2 = _make_protocol("P-002", evidence="EV-C")
    norm = NormalizedPersonalization()
    result = select_protocol_among_eligible(
        eligible=[p1, p2],
        protocol_file_index={"P-001": 0, "P-002": 1},
        phenotypes_by_id={},
        failed_modality_ids=set(),
        norm=norm,
        personalization_rules=[],
        condition_id="COND-1",
        modality_id="MOD-1",
        device_id="DEV-1",
    )
    assert isinstance(result, PersonalizationRankingResult)
    assert result.chosen is not None


def test_build_protocol_file_index():
    from app.services.protocol_personalization import build_protocol_file_index

    table = [
        {"Protocol_ID": "P-001"},
        {"Protocol_ID": "P-002"},
        {"Protocol_ID": "P-003"},
    ]
    idx = build_protocol_file_index(table)
    assert idx["P-001"] == 0
    assert idx["P-002"] == 1
    assert idx["P-003"] == 2


def test_diagnose_personalization_rules_detects_duplicates():
    from app.services.protocol_personalization import diagnose_personalization_rules

    rule = {
        "Rule_ID": "R-001",
        "Active": "Y",
        "Condition_ID": "COND-1",
        "Modality_ID": "MOD-1",
        "Device_ID": "DEV-1",
        "Phenotype_Tag": "anxious_depression_mix",
        "QEEG_Tag": "",
        "Comorbidity_Tag": "",
        "Prior_Response_Tag": "",
        "Preferred_Protocol_ID": "P-001",
        "Score_Delta": "50",
        "Rationale_Label": "anxious match",
    }
    duplicate = dict(rule)
    duplicate["Rule_ID"] = "R-002"  # same trigger, same target — duplicate
    report = diagnose_personalization_rules([rule, duplicate])
    assert "duplicates" in report
    assert len(report["duplicates"]) >= 1


def test_structured_score_sums_matching_rules():
    from app.services.protocol_personalization import structured_score_for_protocol

    protocol = {"Protocol_ID": "P-001", "Modality_ID": "MOD-1"}
    rule1 = {
        "Rule_ID": "R-001",
        "Active": "Y",
        "Condition_ID": "COND-1",
        "Modality_ID": "",
        "Device_ID": "",
        "Phenotype_Tag": "anxious_depression_mix",
        "QEEG_Tag": "",
        "Comorbidity_Tag": "",
        "Prior_Response_Tag": "",
        "Preferred_Protocol_ID": "P-001",
        "Score_Delta": "40",
        "Rationale_Label": "anxious match",
    }
    rule2 = dict(rule1)
    rule2["Rule_ID"] = "R-002"
    rule2["Score_Delta"] = "20"

    total, fired = structured_score_for_protocol(
        protocol,
        [rule1, rule2],
        condition_id="COND-1",
        modality_id="MOD-1",
        device_id="DEV-1",
        canonical_pheno={"anxious_depression_mix"},
        canonical_qeeg=set(),
        canonical_comorbidity=set(),
        canonical_prior=None,
    )
    assert total == 60
    assert len(fired) == 2
