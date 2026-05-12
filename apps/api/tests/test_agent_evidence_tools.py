from __future__ import annotations

from unittest.mock import patch

import pytest

from app.auth import AuthenticatedActor
from app.database import SessionLocal
from app.services.agent_brain.schemas import Citation, ProviderResponse
from app.services.agents.registry import AGENT_REGISTRY
from app.services.agents.tool_dispatcher import WRITE_HANDLERS
from app.services.agents.tools.registry import TOOL_REGISTRY
from app.services.evidence_intelligence import PatientEvidenceOverview


@pytest.fixture
def clinician_actor() -> AuthenticatedActor:
    return AuthenticatedActor(
        actor_id="actor-clinician-demo",
        display_name="Verified Clinician Demo",
        role="clinician",  # type: ignore[arg-type]
        package_id="clinician_pro",
        clinic_id="clinic-demo-default",
    )


@pytest.fixture
def db_session():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def test_clinic_agents_gain_evidence_tools() -> None:
    assert "evidence.query" in AGENT_REGISTRY["clinic.dr_ai"].tool_allowlist
    assert "evidence.literature_search" in AGENT_REGISTRY["clinic.dr_ai"].tool_allowlist
    assert "evidence.patient_overview" in AGENT_REGISTRY["clinic.dr_ai"].tool_allowlist
    assert "evidence.draft_report_citations" in AGENT_REGISTRY["clinic.dr_ai"].tool_allowlist
    assert "evidence.save_citation_request" in AGENT_REGISTRY["clinic.dr_ai"].tool_allowlist

    assert "evidence.status" in AGENT_REGISTRY["clinic.head_of_clinic"].tool_allowlist
    assert "evidence.query" in AGENT_REGISTRY["clinic.head_of_clinic"].tool_allowlist
    assert "evidence.patient_overview" in AGENT_REGISTRY["clinic.nurse"].tool_allowlist
    assert "evidence.status" in AGENT_REGISTRY["clinic.manager"].tool_allowlist
    assert "evidence.patient_overview" not in AGENT_REGISTRY["clinic.manager"].tool_allowlist


def test_evidence_write_tools_registered_and_dispatchable() -> None:
    for tool_id in ("evidence.draft_report_citations", "evidence.save_citation_request"):
        assert tool_id in TOOL_REGISTRY
        assert TOOL_REGISTRY[tool_id].write_only is True
        assert tool_id in WRITE_HANDLERS


def test_evidence_query_handler_uses_provider_fallback_without_patient_scope(
    clinician_actor: AuthenticatedActor,
) -> None:
    handler = TOOL_REGISTRY["evidence.query"].handler
    assert handler is not None
    with patch(
        "app.services.agent_brain.providers.evidence.EvidenceProvider.query",
        return_value=ProviderResponse(
            provider="evidence",
            status="ok",
            query="what evidence supports TMS?",
            answer="Provider answer",
            items=[{"title": "Paper A"}],
            citations=[Citation(source="evidence_db", title="Paper A", pmid="123456")],
            safety_flags=["requires_clinician_review"],
            source_metadata={"source": "evidence_db"},
            confidence="medium",
            requires_clinician_review=True,
        ),
    ):
        payload = handler(
            clinician_actor,
            object(),
            message="what evidence supports TMS for treatment-resistant depression?",
        )
    assert payload["mode"] == "provider_fallback"
    assert payload["answer"] == "Provider answer"
    assert payload["citations"][0]["pmid"] == "123456"


def test_evidence_patient_overview_requires_patient_id(
    clinician_actor: AuthenticatedActor,
) -> None:
    handler = TOOL_REGISTRY["evidence.patient_overview"].handler
    assert handler is not None
    payload = handler(clinician_actor, object(), message="show evidence context")
    assert payload["unavailable"] is True
    assert payload["reason"] == "patient_id_required"


def test_evidence_patient_overview_returns_authorized_overview(
    clinician_actor: AuthenticatedActor,
    db_session,
) -> None:
    handler = TOOL_REGISTRY["evidence.patient_overview"].handler
    assert handler is not None
    with patch(
        "app.repositories.patients.resolve_patient_clinic_id",
        return_value=(True, "clinic-demo-default"),
    ), patch(
        "app.services.evidence_intelligence.build_patient_overview",
        return_value=PatientEvidenceOverview(
            patient_id="pat-123",
            highlights=[],
            by_modality={},
            by_score=[],
            by_protocol=[],
            contradictory_findings=[],
            saved_citations=[],
            compare_with_literature_phenotype={},
            evidence_used_in_report=[],
        ),
    ):
        payload = handler(
            clinician_actor,
            db_session,
            message="patient_id: pat-123 show evidence overview",
        )
    assert payload["patient_id"] == "pat-123"


def test_evidence_source_status_degraded_when_sqlite_missing(client, monkeypatch) -> None:
    monkeypatch.setenv("EVIDENCE_DB_PATH", "/tmp/definitely-missing-evidence.db")
    resp = client.get("/api/v1/evidence/source-status")
    assert resp.status_code == 200
    body = resp.json()
    assert body["source_kind"] == "degraded"
    assert body["source_label"] == "Evidence DB unavailable"
