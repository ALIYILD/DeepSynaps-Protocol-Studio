from __future__ import annotations

from unittest.mock import patch

import pytest

from app.auth import AuthenticatedActor
from app.database import SessionLocal
from app.services.agent_brain.schemas import Citation, ProviderResponse
from app.services.agents.registry import AGENT_REGISTRY
from app.services.agents.tool_dispatcher import WRITE_HANDLERS
from app.services.agents.tools.registry import TOOL_REGISTRY
from app.services.agents.tool_dispatcher import EvidenceSaveCitationRequestArgs
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


def test_evidence_source_status_uses_bundled_fallback_when_sqlite_missing(client, monkeypatch) -> None:
    monkeypatch.setenv("EVIDENCE_DB_PATH", "/tmp/definitely-missing-evidence.db")
    resp = client.get("/api/v1/evidence/source-status", headers={"Authorization": "Bearer clinician-demo-token"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["source_kind"] == "bundled_fallback"
    assert body["source_label"] == "Bundled evidence snapshot"


def test_evidence_status_tool_matches_source_status_shape(
    clinician_actor: AuthenticatedActor,
    db_session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("EVIDENCE_DB_PATH", "/tmp/definitely-missing-evidence.db")
    handler = TOOL_REGISTRY["evidence.status"].handler
    assert handler is not None

    payload = handler(clinician_actor, db_session)

    assert payload["source_kind"] == "bundled_fallback"
    assert payload["source_label"] == "Bundled evidence snapshot"
    assert "literature_paper_count" in payload
    assert "pending_review_citation_count" in payload
    assert "unverified_saved_citation_count" in payload
    assert "library_paper_count" not in payload


def test_evidence_source_status_counts_pending_and_unverified_saved_citations(
    client,
    auth_headers,
) -> None:
    from app.database import SessionLocal
    from app.persistence.models import Clinic, Patient, User
    from app.services.evidence_intelligence import SaveCitationRequest, save_citation

    session = SessionLocal()
    try:
        if session.get(Patient, "pat-status") is None:
            session.add(
                Patient(
                    id="pat-status",
                    clinician_id="actor-clinician-demo",
                    first_name="Status",
                    last_name="Patient",
                )
            )
            session.commit()

        if session.get(Clinic, "clinic-other") is None:
            session.add(Clinic(id="clinic-other", name="Other Clinic"))
            session.commit()
        if session.get(User, "actor-other-clinic") is None:
            session.add(
                User(
                    id="actor-other-clinic",
                    email="other_clinic@example.com",
                    display_name="Other Clinic User",
                    hashed_password="x",
                    role="clinician",
                    package_id="clinician_pro",
                    clinic_id="clinic-other",
                )
            )
            session.commit()
        if session.get(Patient, "pat-other-clinic") is None:
            session.add(
                Patient(
                    id="pat-other-clinic",
                    clinician_id="actor-other-clinic",
                    first_name="Other",
                    last_name="Clinic",
                )
            )
            session.commit()

        save_citation(
            SaveCitationRequest(
                patient_id="pat-status",
                finding_id="finding-pending",
                finding_label="Finding Pending",
                claim="Claim Pending",
                paper_id="paper-pending",
                paper_title="Pending citation",
                citation_payload={
                    "approval_status": "pending_clinician_review",
                    "approval_required": True,
                },
            ),
            "clinician-status",
            session,
        )
        save_citation(
            SaveCitationRequest(
                patient_id="pat-status",
                finding_id="finding-unverified",
                finding_label="Finding Unverified",
                claim="Claim Unverified",
                paper_id="paper-unverified",
                paper_title="Unverified citation",
                citation_payload={},
            ),
            "clinician-status",
            session,
        )
        save_citation(
            SaveCitationRequest(
                patient_id="pat-other-clinic",
                finding_id="finding-other",
                finding_label="Finding Other",
                claim="Claim Other",
                paper_id="paper-other",
                paper_title="Other clinic citation",
                citation_payload={
                    "approval_status": "pending_clinician_review",
                    "approval_required": True,
                },
            ),
            "clinician-other",
            session,
        )
    finally:
        session.close()

    resp = client.get("/api/v1/evidence/source-status", headers=auth_headers["clinician"])
    assert resp.status_code == 200
    body = resp.json()
    assert body["pending_review_citation_count"] == 1
    assert body["unverified_saved_citation_count"] >= 1


def test_evidence_status_tool_scopes_saved_citation_counts_to_actor_clinic(
    clinician_actor: AuthenticatedActor,
    db_session,
) -> None:
    from app.persistence.models import Clinic, Patient, User
    from app.services.evidence_intelligence import SaveCitationRequest, save_citation

    if db_session.get(Patient, "pat-status-tool") is None:
        db_session.add(
            Patient(
                id="pat-status-tool",
                clinician_id="actor-clinician-demo",
                first_name="Status",
                last_name="Tool",
            )
        )
        db_session.commit()
    if db_session.get(Clinic, "clinic-other-tool") is None:
        db_session.add(Clinic(id="clinic-other-tool", name="Other Clinic Tool"))
        db_session.commit()
    if db_session.get(User, "actor-other-tool") is None:
        db_session.add(
            User(
                id="actor-other-tool",
                email="other_tool@example.com",
                display_name="Other Clinic Tool User",
                hashed_password="x",
                role="clinician",
                package_id="clinician_pro",
                clinic_id="clinic-other-tool",
            )
        )
        db_session.commit()
    if db_session.get(Patient, "pat-other-tool") is None:
        db_session.add(
            Patient(
                id="pat-other-tool",
                clinician_id="actor-other-tool",
                first_name="Other",
                last_name="Tool",
            )
        )
        db_session.commit()

    save_citation(
        SaveCitationRequest(
            patient_id="pat-status-tool",
            finding_id="finding-tool-local",
            finding_label="Finding Tool Local",
            claim="Claim Tool Local",
            paper_id="paper-tool-local",
            paper_title="Tool local citation",
            citation_payload={
                "approval_status": "pending_clinician_review",
                "approval_required": True,
            },
        ),
        "clinician-tool-local",
        db_session,
    )
    save_citation(
        SaveCitationRequest(
            patient_id="pat-other-tool",
            finding_id="finding-tool-other",
            finding_label="Finding Tool Other",
            claim="Claim Tool Other",
            paper_id="paper-tool-other",
            paper_title="Tool other citation",
            citation_payload={
                "approval_status": "pending_clinician_review",
                "approval_required": True,
            },
        ),
        "clinician-tool-other",
        db_session,
    )

    handler = TOOL_REGISTRY["evidence.status"].handler
    assert handler is not None

    payload = handler(clinician_actor, db_session)

    assert payload["pending_review_citation_count"] == 1
    assert payload["unverified_saved_citation_count"] >= 1


def test_evidence_source_status_requires_authenticated_clinician(client) -> None:
    resp = client.get("/api/v1/evidence/source-status")
    assert resp.status_code == 403


def test_evidence_save_citation_request_is_persisted_as_pending_review(
    clinician_actor: AuthenticatedActor,
    db_session,
) -> None:
    _model, handler = WRITE_HANDLERS["evidence.save_citation_request"]
    with patch(
        "app.services.agents.tool_dispatcher._guard_patient_scope",
        return_value=None,
    ), patch(
        "app.services.evidence_intelligence.save_citation",
        return_value={
            "id": "saved-1",
            "citation_payload": {
                "approval_status": "pending_clinician_review",
                "approval_required": True,
                "requested_via": "agent_tool",
            },
        },
    ) as mocked_save:
        out = handler(
            clinician_actor,
            db_session,
            EvidenceSaveCitationRequestArgs(
                patient_id="pat-1",
                finding_id="finding-1",
                finding_label="Finding 1",
                claim="Claim 1",
                paper_id="paper-1",
                paper_title="Paper 1",
                citation_payload={"inline_citation": "(A, 2026)"},
            ),
        )
    sent_request = mocked_save.call_args.args[0]
    assert sent_request.citation_payload["approval_status"] == "pending_clinician_review"
    assert sent_request.citation_payload["approval_required"] is True
    assert sent_request.citation_payload["requested_via"] == "agent_tool"
    assert out["result"]["record"]["citation_payload"]["approval_status"] == "pending_clinician_review"
