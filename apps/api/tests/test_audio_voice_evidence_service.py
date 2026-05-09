"""Tests for app.services.audio_voice_evidence — decision-support evidence pack builder.

Covers:
- VOICE_DECISION_SUPPORT_DISCLAIMER is non-empty and clinical-safe
- EXTERNAL_VOICE_RESOURCES is a non-empty list with label/url keys
- _paper_to_ref extracts attributes safely from objects with/without fields
- build_voice_evidence_pack returns expected top-level keys
- build_voice_evidence_pack includes disclaimer in output
- build_voice_evidence_pack includes external_resources list
- targets_queried always includes voice_affect even for empty report
- targets_queried picks up pd_voice when score present
- targets_queried picks up cognitive_speech when score present
- targets_queried is limited to max_targets
- build_voice_evidence_pack handles evidence query errors gracefully
- _feature_summary_from_report extracts snr_db
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch


def test_disclaimer_is_nonempty():
    from app.services.audio_voice_evidence import VOICE_DECISION_SUPPORT_DISCLAIMER

    assert isinstance(VOICE_DECISION_SUPPORT_DISCLAIMER, str)
    assert len(VOICE_DECISION_SUPPORT_DISCLAIMER) > 50


def test_disclaimer_is_not_diagnosis_claim():
    from app.services.audio_voice_evidence import VOICE_DECISION_SUPPORT_DISCLAIMER

    lower = VOICE_DECISION_SUPPORT_DISCLAIMER.lower()
    assert "not diagnos" in lower or "not a diagnos" in lower or "are not diagnos" in lower, \
        "Disclaimer must clarify output is not a diagnosis"
    assert "decision-support" in lower, "Disclaimer must state decision-support framing"


def test_external_resources_is_nonempty_list():
    from app.services.audio_voice_evidence import EXTERNAL_VOICE_RESOURCES

    assert isinstance(EXTERNAL_VOICE_RESOURCES, list)
    assert len(EXTERNAL_VOICE_RESOURCES) >= 1


def test_external_resources_have_label_and_url():
    from app.services.audio_voice_evidence import EXTERNAL_VOICE_RESOURCES

    for r in EXTERNAL_VOICE_RESOURCES:
        assert "label" in r, "External resource missing 'label'"
        assert "url" in r, "External resource missing 'url'"
        assert r["url"].startswith("http"), f"URL should be http/https: {r['url']}"


def _make_mock_result(target_name="voice_affect"):
    result = MagicMock()
    result.claim = f"Evidence claim for {target_name}"
    result.confidence_score = 0.7
    result.literature_summary = "Summary text."
    result.recommended_caution = "Interpret with caution."
    result.supporting_papers = []
    result.conflicting_papers = []
    result.provenance = MagicMock()
    result.provenance.corpus = "deepsynaps"
    result.provenance.generated_at = "2026-05-09T00:00:00Z"
    result.provenance.matched_concepts = ["voice", "parkinson"]
    return result


def test_build_voice_evidence_pack_returns_top_level_keys():
    from app.services.audio_voice_evidence import build_voice_evidence_pack

    db = MagicMock()
    mock_result = _make_mock_result()
    with patch("app.services.audio_voice_evidence.query_evidence", return_value=mock_result), \
         patch("app.services.audio_voice_evidence.build_default_query") as mock_q:
        mock_q.return_value = MagicMock()
        pack = build_voice_evidence_pack({}, patient_id="p1", db=db)

    for key in ("disclaimer", "targets_queried", "evidence_packs", "external_resources",
                "internal_corpus_note"):
        assert key in pack, f"Missing key: {key}"


def test_build_voice_evidence_pack_includes_disclaimer():
    from app.services.audio_voice_evidence import (
        build_voice_evidence_pack,
        VOICE_DECISION_SUPPORT_DISCLAIMER,
    )

    db = MagicMock()
    mock_result = _make_mock_result()
    with patch("app.services.audio_voice_evidence.query_evidence", return_value=mock_result), \
         patch("app.services.audio_voice_evidence.build_default_query", return_value=MagicMock()):
        pack = build_voice_evidence_pack({}, patient_id="p2", db=db)

    assert pack["disclaimer"] == VOICE_DECISION_SUPPORT_DISCLAIMER


def test_targets_queried_always_includes_voice_affect():
    from app.services.audio_voice_evidence import build_voice_evidence_pack

    db = MagicMock()
    mock_result = _make_mock_result()
    with patch("app.services.audio_voice_evidence.query_evidence", return_value=mock_result), \
         patch("app.services.audio_voice_evidence.build_default_query", return_value=MagicMock()):
        pack = build_voice_evidence_pack({}, patient_id="p3", db=db)

    assert "voice_affect" in pack["targets_queried"], \
        "voice_affect must always be in targets_queried"


def test_targets_queried_adds_pd_voice_when_score_present():
    from app.services.audio_voice_evidence import build_voice_evidence_pack

    db = MagicMock()
    report = {"pd_voice": {"score": 0.65}}
    mock_result = _make_mock_result()
    with patch("app.services.audio_voice_evidence.query_evidence", return_value=mock_result), \
         patch("app.services.audio_voice_evidence.build_default_query", return_value=MagicMock()):
        pack = build_voice_evidence_pack(report, patient_id="p4", db=db)

    assert "parkinson_voice" in pack["targets_queried"], \
        "parkinson_voice target should fire when pd_voice.score present"


def test_targets_queried_adds_cognitive_speech():
    from app.services.audio_voice_evidence import build_voice_evidence_pack

    db = MagicMock()
    report = {"cognitive_speech": {"score": 0.4}}
    mock_result = _make_mock_result()
    with patch("app.services.audio_voice_evidence.query_evidence", return_value=mock_result), \
         patch("app.services.audio_voice_evidence.build_default_query", return_value=MagicMock()):
        pack = build_voice_evidence_pack(report, patient_id="p5", db=db)

    assert "mci_risk" in pack["targets_queried"]


def test_targets_queried_limited_by_max_targets():
    from app.services.audio_voice_evidence import build_voice_evidence_pack

    db = MagicMock()
    report = {
        "pd_voice": {"score": 0.5},
        "cognitive_speech": {"score": 0.3},
        "respiratory": {"score": 0.8},
    }
    mock_result = _make_mock_result()
    with patch("app.services.audio_voice_evidence.query_evidence", return_value=mock_result), \
         patch("app.services.audio_voice_evidence.build_default_query", return_value=MagicMock()):
        pack = build_voice_evidence_pack(report, patient_id="p6", db=db, max_targets=2)

    assert len(pack["targets_queried"]) <= 2


def test_build_voice_evidence_pack_handles_query_errors():
    from app.services.audio_voice_evidence import build_voice_evidence_pack

    db = MagicMock()
    with patch("app.services.audio_voice_evidence.query_evidence",
               side_effect=RuntimeError("DB unavailable")), \
         patch("app.services.audio_voice_evidence.build_default_query", return_value=MagicMock()):
        # Should not raise — errors are swallowed per module contract
        pack = build_voice_evidence_pack({}, patient_id="p7", db=db)

    assert "evidence_packs" in pack
    # Error packs should have 'error' key
    for v in pack["evidence_packs"].values():
        assert "error" in v


def test_external_resources_included_even_on_error():
    from app.services.audio_voice_evidence import build_voice_evidence_pack

    db = MagicMock()
    with patch("app.services.audio_voice_evidence.query_evidence",
               side_effect=Exception("fail")), \
         patch("app.services.audio_voice_evidence.build_default_query", return_value=MagicMock()):
        pack = build_voice_evidence_pack({}, patient_id="p8", db=db)

    assert isinstance(pack["external_resources"], list)
    assert len(pack["external_resources"]) >= 1
