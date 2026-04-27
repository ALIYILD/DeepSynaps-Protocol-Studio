"""Tests for the Reports router's JSON create/list endpoints.

POST /api/v1/reports  -> create a text-only clinician report
GET  /api/v1/reports  -> list current clinician's reports (newest first)
"""
from __future__ import annotations

import uuid

from fastapi.testclient import TestClient


def _create_patient(client: TestClient, auth_headers: dict) -> str:
    resp = client.post(
        "/api/v1/patients",
        json={"first_name": "Report", "last_name": "Patient"},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def test_create_report_round_trip(client: TestClient, auth_headers: dict):
    patient_id = _create_patient(client, auth_headers)
    body = {
        "patient_id": patient_id,
        "type": "clinician",
        "title": "Course 1 Treatment Summary — TMS Depression",
        "content": "PHQ-9 reduced from 22 to 8 over 20 sessions. Patient in remission.",
        "report_date": "2026-04-10",
        "source": "Dr. Okonkwo",
        "status": "generated",
    }
    r = client.post("/api/v1/reports", json=body, headers=auth_headers["clinician"])
    assert r.status_code == 201, r.text
    out = r.json()
    assert out["id"]
    assert out["title"] == body["title"]
    assert out["type"] == "clinician"
    assert out["content"] == body["content"]
    assert out["date"] == body["report_date"]
    assert out["source"] == body["source"]
    assert out["status"] == "generated"
    assert "T" in out["created_at"]


def test_list_reports_newest_first(client: TestClient, auth_headers: dict):
    patient_id = _create_patient(client, auth_headers)
    for title in ["Intake #1", "Progress #2", "Discharge #3"]:
        r = client.post(
            "/api/v1/reports",
            json={"patient_id": patient_id, "type": "progress", "title": title, "content": "body"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 201, r.text
    r = client.get("/api/v1/reports", headers=auth_headers["clinician"])
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["total"] == 3
    titles = [item["title"] for item in data["items"]]
    assert titles == ["Discharge #3", "Progress #2", "Intake #1"]


def test_clinician_cannot_see_other_clinician_reports(
    client: TestClient, auth_headers: dict
):
    patient_id = _create_patient(client, auth_headers)
    r = client.post(
        "/api/v1/reports",
        json={"patient_id": patient_id, "type": "clinician", "title": "Mine"},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 201, r.text

    admin_list = client.get("/api/v1/reports", headers=auth_headers["admin"])
    assert admin_list.status_code == 200
    assert admin_list.json()["total"] >= 1

    # Insert a row directly owned by a different clinician id.
    from app.database import get_db_session
    from app.persistence.models import PatientMediaUpload
    import uuid

    gen = get_db_session()
    db = next(gen)
    try:
        db.add(PatientMediaUpload(
            id=str(uuid.uuid4()),
            patient_id="other-patient",
            uploaded_by="clinician-other-demo",
            media_type="text",
            file_ref=None,
            text_content="should not leak",
            patient_note='{"title":"Other clinician report","report_type":"clinician"}',
            status="generated",
        ))
        db.commit()
    finally:
        try:
            next(gen)
        except StopIteration:
            pass

    r = client.get("/api/v1/reports", headers=auth_headers["clinician"])
    assert r.status_code == 200
    own_titles = [item["title"] for item in r.json()["items"]]
    assert "Mine" in own_titles
    assert "Other clinician report" not in own_titles


def test_create_requires_clinician_role(client: TestClient, auth_headers: dict):
    r = client.post(
        "/api/v1/reports",
        json={"type": "clinician", "title": "should 403"},
        headers=auth_headers["patient"],
    )
    assert r.status_code == 403, r.text


def test_list_with_since_filter_future(client: TestClient, auth_headers: dict):
    patient_id = _create_patient(client, auth_headers)
    r = client.post(
        "/api/v1/reports",
        json={"patient_id": patient_id, "type": "clinician", "title": "Recent"},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 201
    r2 = client.get(
        "/api/v1/reports?since=2099-01-01T00:00:00Z",
        headers=auth_headers["clinician"],
    )
    assert r2.status_code == 200
    assert r2.json()["total"] == 0


def test_invalid_since_is_ignored_not_400(client: TestClient, auth_headers: dict):
    patient_id = _create_patient(client, auth_headers)
    client.post(
        "/api/v1/reports",
        json={"patient_id": patient_id, "type": "clinician", "title": "Alive"},
        headers=auth_headers["clinician"],
    )
    r = client.get("/api/v1/reports?since=not-a-date", headers=auth_headers["clinician"])
    assert r.status_code == 200
    assert r.json()["total"] >= 1


def test_create_report_without_patient_id_is_rejected(client: TestClient, auth_headers: dict):
    r = client.post(
        "/api/v1/reports",
        json={"type": "clinician", "title": "No patient"},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 422, r.text


def test_ai_summary_requires_report_owner(client: TestClient, auth_headers: dict):
    patient_id = _create_patient(client, auth_headers)
    own = client.post(
        "/api/v1/reports",
        json={"patient_id": patient_id, "type": "clinician", "title": "Owned report", "content": "body"},
        headers=auth_headers["clinician"],
    )
    assert own.status_code == 201, own.text
    report_id = own.json()["id"]

    other = client.post(
        "/api/v1/auth/register",
        json={
            "email": "report-other@example.com",
            "display_name": "Other Clinician",
            "password": "testpass1234",
            "role": "clinician",
        },
    )
    assert other.status_code in (200, 201), other.text
    other_headers = {"Authorization": f"Bearer {other.json()['access_token']}"}

    denied = client.post(f"/api/v1/reports/{report_id}/ai-summary", headers=other_headers)
    assert denied.status_code == 404, denied.text


# ── Structured report payload + render contract tests ────────────────────────


def _create_minimal_report(client: TestClient, auth_headers: dict) -> str:
    patient_id = _create_patient(client, auth_headers)
    r = client.post(
        "/api/v1/reports",
        json={
            "patient_id": patient_id,
            "type": "clinician",
            "title": "Structured payload test",
            "content": "PHQ-9 reduced from 22 to 8 over 20 sessions.",
        },
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_preview_payload_returns_sample_when_empty(client: TestClient, auth_headers: dict):
    r = client.post(
        "/api/v1/reports/preview-payload",
        json={},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    body = r.json()
    # Schema id + generator stamps are mandatory.
    assert body["schema_id"].startswith("deepsynaps.report-payload/")
    assert body["generator_version"]
    assert body["generated_at"]
    # Sample payload always carries the required structural fields.
    assert body["sections"], "sample payload must include sections"
    for section in body["sections"]:
        assert "observed" in section
        assert "interpretations" in section
        assert "suggested_actions" in section
        assert "cautions" in section
        assert "limitations" in section


def test_preview_payload_separates_observed_and_interpretation(
    client: TestClient, auth_headers: dict
):
    r = client.post(
        "/api/v1/reports/preview-payload",
        json={
            "title": "Custom",
            "summary": "Just a probe",
            "audience": "clinician",
            "sections": [
                {
                    "section_id": "s1",
                    "title": "qEEG",
                    "observed": ["frontal alpha asymmetry: -0.12"],
                    "interpretations": [
                        {
                            "text": "consistent with depression phenotype",
                            "evidence_strength": "Moderate",
                            "evidence_refs": [],
                        }
                    ],
                    "cautions": ["confirm with clean re-record"],
                    "limitations": ["single-session"],
                }
            ],
            "references": [
                "Lefaucheur JP et al. doi:10.1016/j.clinph.2019.11.002",
                "Cash R et al. (no identifier)",
            ],
        },
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["sections"]) == 1
    s = body["sections"][0]
    # Observed and interpretation are separate, not collapsed.
    assert s["observed"] and s["interpretations"]
    assert s["observed"] != [i["text"] for i in s["interpretations"]]
    # cautions + limitations always present.
    assert s["cautions"] and s["limitations"]
    # Citations: at least one carries DOI; one is unverified (no identifier).
    assert body["citations"], "references must surface as citations"
    statuses = {c["status"] for c in body["citations"]}
    # The text-only ref ("Cash R et al. (no identifier)") must be unverified —
    # never invented. The DOI-bearing one is unverified too unless the LiteraturePaper
    # row is present in the test DB; either way one of them must be unverified.
    assert "unverified" in statuses
    for c in body["citations"]:
        # Every citation must declare retrieved_at.
        assert c["retrieved_at"], "retrieved_at must be stamped on every citation"
        # And carry an explicit evidence_level OR the unverified marker.
        if c["status"] == "unverified":
            assert c["evidence_level"] is None or c["evidence_level"]
        # And an identifier (doi/pmid/url) OR raw_text fallback.
        has_id = any(c.get(k) for k in ("doi", "pmid", "url"))
        assert has_id or c.get("raw_text"), (
            "citations must carry doi/pmid/url OR raw_text — never empty"
        )


def test_get_payload_for_stored_report_has_required_fields(
    client: TestClient, auth_headers: dict
):
    rid = _create_minimal_report(client, auth_headers)
    r = client.get(f"/api/v1/reports/{rid}/payload", headers=auth_headers["clinician"])
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["report_id"] == rid
    assert body["sections"]
    # Cautions/limitations always rendered, even on legacy rows.
    assert any("cautions" in s for s in body["sections"])
    assert any("limitations" in s for s in body["sections"])


def test_render_html_returns_text_html_non_empty(
    client: TestClient, auth_headers: dict
):
    rid = _create_minimal_report(client, auth_headers)
    r = client.get(
        f"/api/v1/reports/{rid}/render?format=html",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("text/html"), r.headers["content-type"]
    body = r.text
    assert body, "HTML response must not be empty"
    # Decision-support disclaimer must appear in the rendered output.
    assert "decision-support" in body.lower() or "decision support" in body.lower()
    # Observed-vs-interpretation labels must be visible.
    assert "Observed findings" in body
    # Audience toggle present in the default 'both' view.
    assert "data-ds-view" in body or "Clinician view" in body


def test_render_pdf_returns_503_or_pdf_bytes(
    client: TestClient, auth_headers: dict, monkeypatch
):
    """PDF endpoint must either return real bytes (when weasyprint is installed)
    OR a clean 503 with a clear message. It must NEVER return empty content
    or a 200 with a blank body — that would silently produce broken artefacts.
    """
    rid = _create_minimal_report(client, auth_headers)

    # Force the PDF renderer into the "lib missing" state to exercise the 503
    # branch deterministically regardless of host environment.
    from app.routers import reports_router as _rr
    from deepsynaps_render_engine.renderers import PdfRendererUnavailable

    def _raise(_):
        raise PdfRendererUnavailable("weasyprint not installed in test env")

    monkeypatch.setattr(_rr, "render_report_pdf", _raise)

    r = client.get(
        f"/api/v1/reports/{rid}/render?format=pdf",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 503, r.text
    body = r.json()
    # Clear, actionable error code + message — surface uses ErrorResponse shape.
    assert body.get("code") == "pdf_renderer_unavailable", body
    assert "weasyprint" in body.get("message", "").lower()


def test_render_pdf_returns_bytes_when_lib_present(
    client: TestClient, auth_headers: dict, monkeypatch
):
    """Sanity check: when the renderer succeeds we get application/pdf bytes,
    never an empty 200."""
    rid = _create_minimal_report(client, auth_headers)
    from app.routers import reports_router as _rr

    def _ok(_payload):
        return b"%PDF-1.4 fake bytes"

    monkeypatch.setattr(_rr, "render_report_pdf", _ok)
    r = client.get(
        f"/api/v1/reports/{rid}/render?format=pdf",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "application/pdf"
    assert r.content.startswith(b"%PDF"), "must return real PDF bytes"
    assert len(r.content) > 0, "never serve empty PDF"


def test_render_unknown_report_404(client: TestClient, auth_headers: dict):
    r = client.get(
        "/api/v1/reports/does-not-exist/render?format=html",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 404, r.text


def test_ai_summary_requires_patient_access(client: TestClient, auth_headers: dict):
    patient_id = _create_patient(client, auth_headers)

    report = client.post(
        "/api/v1/reports",
        json={"type": "clinician", "title": "Scoped report", "patient_id": patient_id, "content": "body"},
        headers=auth_headers["clinician"],
    )
    assert report.status_code == 201, report.text
    report_id = report.json()["id"]

    other = client.post(
        "/api/v1/auth/register",
        json={
            "email": f"report-scope-{uuid.uuid4().hex[:8]}@example.com",
            "display_name": "Other Clinician",
            "password": "testpass1234",
            "role": "clinician",
        },
    )
    assert other.status_code in (200, 201), other.text
    other_headers = {"Authorization": f"Bearer {other.json()['access_token']}"}

    denied = client.post(f"/api/v1/reports/{report_id}/ai-summary", headers=other_headers)
    assert denied.status_code == 404, denied.text
