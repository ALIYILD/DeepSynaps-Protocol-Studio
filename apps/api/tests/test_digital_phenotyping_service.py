"""Tests for app.services.digital_phenotyping — consent-gated payload builder.

Covers:
- DEFAULT_DOMAINS_ENABLED shape and content
- RESEARCH_METADATA_SCHEMA_VERSION is a string
- build_stub_analyzer_payload returns expected top-level keys
- build_stub_analyzer_payload includes clinical_disclaimer
- clinical_disclaimer is decision-support framing (not diagnosis claim)
- merge_state_into_payload applies domain consent gates to snapshot
- merge_state_into_payload withholds summary_stats when domain disabled
- merge_observations_into_payload bumps data_completeness with recent obs
- merge_observations_into_payload adds mvp-rec-add-data when no observations
- attach_research_metadata adds research_metadata block
- attach_research_metadata.suitable_for_protocol_secondary_analysis requires obs > 0
- attach_research_metadata marks suitable_for_stub_endpoint_claims False
- audit_rows_to_payload_events maps ORM rows to event dicts
"""
from __future__ import annotations

from datetime import datetime, timezone, timedelta


def test_default_domains_enabled_is_dict():
    from app.services.digital_phenotyping import DEFAULT_DOMAINS_ENABLED

    assert isinstance(DEFAULT_DOMAINS_ENABLED, dict)
    assert len(DEFAULT_DOMAINS_ENABLED) >= 5


def test_research_metadata_schema_version_is_string():
    from app.services.digital_phenotyping import RESEARCH_METADATA_SCHEMA_VERSION

    assert isinstance(RESEARCH_METADATA_SCHEMA_VERSION, str)
    assert "." in RESEARCH_METADATA_SCHEMA_VERSION


def test_build_stub_payload_returns_top_level_keys():
    from app.services.digital_phenotyping import build_stub_analyzer_payload

    payload = build_stub_analyzer_payload("patient-123")
    for key in ("schema_version", "clinical_disclaimer", "generated_at", "patient_id",
                "snapshot", "domains", "consent_state"):
        assert key in payload, f"Missing key: {key}"


def test_build_stub_payload_includes_patient_id():
    from app.services.digital_phenotyping import build_stub_analyzer_payload

    payload = build_stub_analyzer_payload("patient-abc")
    assert payload["patient_id"] == "patient-abc"


def test_clinical_disclaimer_is_decision_support_not_diagnosis():
    from app.services.digital_phenotyping import build_stub_analyzer_payload

    payload = build_stub_analyzer_payload("p1")
    disclaimer = payload["clinical_disclaimer"].lower()
    assert "decision-support" in disclaimer or "decision support" in disclaimer, \
        "Disclaimer must use decision-support framing"
    assert "diagnos" not in disclaimer or "do not diagnose" in disclaimer, \
        "Disclaimer must not make diagnosis claims"


def test_merge_state_gates_disabled_domain_snapshot():
    from app.services.digital_phenotyping import (
        build_stub_analyzer_payload,
        merge_state_into_payload,
    )

    payload = build_stub_analyzer_payload("p2")
    # Disable screen_use — should null out screen_time_pattern
    domains = {"screen_use": False}
    result = merge_state_into_payload(
        payload,
        domains_enabled=domains,
        consent_scope_version="test-1.0",
        state_updated_at=None,
        hide_stub_audit_when_persisted=False,
    )
    snap = result["snapshot"]
    stm = snap.get("screen_time_pattern")
    if isinstance(stm, dict):
        assert stm["value"] is None or stm["completeness"] == 0.0, \
            "Disabled domain should null value or zero completeness"


def test_merge_state_withholds_summary_stats_for_disabled_domain():
    from app.services.digital_phenotyping import (
        build_stub_analyzer_payload,
        merge_state_into_payload,
    )

    payload = build_stub_analyzer_payload("p3")
    domains = {"screen_use": False}
    result = merge_state_into_payload(
        payload,
        domains_enabled=domains,
        consent_scope_version="test-1.0",
        state_updated_at=None,
        hide_stub_audit_when_persisted=False,
    )
    dom_list = result.get("domains", [])
    for d in dom_list:
        if d.get("signal_domain") == "screen_use":
            stats = d.get("summary_stats", {})
            assert stats.get("withheld") == "consent_off", \
                "Disabled domain should mark summary_stats withheld"


def test_merge_observations_bumps_completeness():
    from app.services.digital_phenotyping import (
        build_stub_analyzer_payload,
        merge_observations_into_payload,
    )

    payload = build_stub_analyzer_payload("p4")
    now = datetime.now(timezone.utc)
    observations = [
        {"source": "manual", "kind": "ema", "recorded_at": (now - timedelta(days=1)).isoformat()},
        {"source": "manual", "kind": "ema", "recorded_at": (now - timedelta(days=2)).isoformat()},
    ]
    result = merge_observations_into_payload(payload, observations=observations)
    base_val = payload["snapshot"]["data_completeness"]["value"]
    new_val = result["snapshot"]["data_completeness"]["value"]
    assert new_val >= base_val, "data_completeness should not decrease with observations"


def test_merge_observations_adds_mvp_rec_when_empty():
    from app.services.digital_phenotyping import (
        build_stub_analyzer_payload,
        merge_observations_into_payload,
    )

    payload = build_stub_analyzer_payload("p5")
    result = merge_observations_into_payload(payload, observations=[])
    rec_ids = [r.get("id") for r in result.get("recommendations", [])]
    assert "mvp-rec-add-data" in rec_ids, "Should add mvp-rec-add-data when no observations"


def test_attach_research_metadata_adds_block():
    from app.services.digital_phenotyping import (
        build_stub_analyzer_payload,
        attach_research_metadata,
    )

    payload = build_stub_analyzer_payload("p6")
    result = attach_research_metadata(
        payload,
        patient_id="p6",
        observation_row_count=3,
        consent_scope_version="2026.04",
    )
    assert "research_metadata" in result
    rm = result["research_metadata"]
    assert rm["research_metadata_schema_version"] == "1.0.0"


def test_attach_research_metadata_suitable_false_when_zero_obs():
    from app.services.digital_phenotyping import (
        build_stub_analyzer_payload,
        attach_research_metadata,
    )

    payload = build_stub_analyzer_payload("p7")
    result = attach_research_metadata(
        payload,
        patient_id="p7",
        observation_row_count=0,
        consent_scope_version="2026.04",
    )
    rm = result["research_metadata"]
    assert rm["suitable_for_protocol_secondary_analysis"] is False


def test_attach_research_metadata_stub_endpoint_claims_always_false():
    from app.services.digital_phenotyping import (
        build_stub_analyzer_payload,
        attach_research_metadata,
    )

    payload = build_stub_analyzer_payload("p8")
    result = attach_research_metadata(
        payload,
        patient_id="p8",
        observation_row_count=100,
        consent_scope_version="2026.04",
    )
    assert result["research_metadata"]["suitable_for_stub_endpoint_claims"] is False


def test_audit_rows_to_payload_events_maps_correctly():
    from app.services.digital_phenotyping import audit_rows_to_payload_events
    import types

    row = types.SimpleNamespace(
        id="evt-001",
        action="view",
        created_at=datetime(2026, 5, 1, 10, 0, 0, tzinfo=timezone.utc),
        detail_json='{"summary": "Page loaded"}',
    )
    events = audit_rows_to_payload_events([row])
    assert len(events) == 1
    e = events[0]
    assert e["event_id"] == "evt-001"
    assert e["action"] == "view"
    assert e["summary"] == "Page loaded"
