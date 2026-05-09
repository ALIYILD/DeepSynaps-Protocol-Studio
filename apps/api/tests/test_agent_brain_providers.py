"""Provider-level behaviour tests.

Covers spec items 3, 4, 5, 6, 9 (audit on patient context).
"""
from __future__ import annotations

from app.services.agent_brain.registry import get_provider
from app.services.agent_brain.schemas import ProviderQuery


def test_evidence_provider_does_not_invent_citations(monkeypatch) -> None:
    """If both the evidence DB and CSV loader return nothing, the provider
    must return zero citations and a safe fallback message — never a
    hallucinated PMID/DOI."""
    monkeypatch.setattr(
        "app.services.agent_brain.providers.evidence._evidence_db_path",
        lambda: None,
    )

    class _EmptyResp:
        items: list = []

    monkeypatch.setattr(
        "app.services.clinical_data.list_evidence_from_clinical_data",
        lambda: _EmptyResp(),
    )

    p = get_provider("evidence")
    assert p is not None
    resp = p.query(
        ProviderQuery(provider="evidence", query="zzz_no_match_term_xxx"),
        actor_id="actor-clinician-demo",
        actor_role="clinician",
        session=None,
    )
    assert resp.citations == []
    assert resp.requires_clinician_review is True
    assert "clinician review" in resp.answer.lower() or "review required" in resp.answer.lower()


def test_evidence_provider_safe_fallback_when_no_evidence(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.services.agent_brain.providers.evidence._evidence_db_path",
        lambda: None,
    )

    class _EmptyResp:
        items: list = []

    monkeypatch.setattr(
        "app.services.clinical_data.list_evidence_from_clinical_data",
        lambda: _EmptyResp(),
    )

    p = get_provider("evidence")
    resp = p.query(  # type: ignore[union-attr]
        ProviderQuery(provider="evidence", query="zzzz_no_match"),
        actor_id="actor-clinician-demo",
        actor_role="clinician",
    )
    assert resp.status == "ok"
    assert "insufficient_local_evidence" in resp.safety_flags
    assert resp.confidence == "unknown"


def test_protocol_governance_flags_clinician_review() -> None:
    p = get_provider("protocol_governance")
    resp = p.query(  # type: ignore[union-attr]
        ProviderQuery(provider="protocol_governance", query="depression", condition="depression"),
        actor_id="actor-clinician-demo",
        actor_role="clinician",
    )
    assert resp.status == "ok"
    assert resp.requires_clinician_review is True
    assert "requires_clinician_review" in resp.safety_flags
    # The rule registry must be in the response. It's harmless if matched
    # protocols is zero.
    rule_items = [it for it in resp.items if it.get("type") == "rule"]
    assert rule_items, "expected at least one governance rule to be returned"


def test_device_provider_does_not_invent_parameters() -> None:
    p = get_provider("device_registry")
    resp = p.query(  # type: ignore[union-attr]
        ProviderQuery(provider="device_registry", query=""),
        actor_id="actor-clinician-demo",
        actor_role="clinician",
    )
    assert resp.status == "ok"
    # Every device row must have an explicit parameter_data_missing list.
    for it in resp.items:
        assert "parameter_data_missing" in it
        # Every flagged-missing field must be null in the same row.
        for missing_field in it["parameter_data_missing"]:
            assert it[missing_field] is None, (
                f"{missing_field} flagged missing but value is not None: {it[missing_field]!r}"
            )


def test_condition_registry_returns_curated_rows() -> None:
    p = get_provider("condition_registry")
    resp = p.query(  # type: ignore[union-attr]
        ProviderQuery(provider="condition_registry", query=""),
        actor_id="actor-clinician-demo",
        actor_role="clinician",
    )
    assert resp.status == "ok"
    assert resp.items, "condition registry must return at least one row"


def test_report_templates_lists_qeeg_template() -> None:
    p = get_provider("report_templates")
    resp = p.query(  # type: ignore[union-attr]
        ProviderQuery(provider="report_templates", query=""),
        actor_id="actor-clinician-demo",
        actor_role="clinician",
    )
    assert resp.status == "ok"
    template_ids = {it.get("template_id") for it in resp.items}
    assert "qeeg_brain_map_report" in template_ids


def test_agent_memory_disabled_by_default() -> None:
    p = get_provider("agent_memory")
    resp = p.query(  # type: ignore[union-attr]
        ProviderQuery(provider="agent_memory", query=""),
        actor_id="actor-clinician-demo",
        actor_role="clinician",
    )
    assert resp.status == "not_configured"
    assert "agent_memory_disabled" in resp.missing_requirements


def test_patient_context_disabled_by_default() -> None:
    p = get_provider("patient_context")
    resp = p.query(  # type: ignore[union-attr]
        ProviderQuery(provider="patient_context", query="", patient_id="pt-1"),
        actor_id="actor-clinician-demo",
        actor_role="clinician",
    )
    assert resp.status == "not_configured"
    assert "patient_context_disabled" in resp.missing_requirements
