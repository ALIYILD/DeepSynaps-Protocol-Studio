"""Tests for the Assessments Hub backend: router endpoints, scoring summary,
licensing metadata, and governance fields.

Covers:
    - /templates returns all scales with licensing metadata
    - /scales catalog is lightweight and includes licensing tier
    - Licensed instruments (ISI, ADHD-RS-5, UPDRS, SF-12, C-SSRS) are marked
      score_only and carry embedded_text_allowed=false — no item text leaks.
    - /assign creates a pending assessment with respondent_type and phase
    - /bulk-assign creates multiple pending assessments in a single call
    - /summary/{patient_id} returns normalized severity buckets
    - /ai-context/{patient_id} returns clinician-authored plain text (no AI text)
    - /{id}/approve records reviewer and timestamp
    - Permission: clinician-only on mutating endpoints
    - PHQ-9 score → moderate severity mapping is correct
    - C-SSRS score ≥ 2 surfaces as severe / critical
"""
from __future__ import annotations

from fastapi.testclient import TestClient


# ── Fixtures ──────────────────────────────────────────────────────────────────


def _create_patient(client: TestClient, auth_headers: dict, *, email: str = "hub_patient@example.com") -> str:
    r = client.post(
        "/api/v1/patients",
        json={"first_name": "Hub", "last_name": "Patient", "dob": "1985-01-01",
              "gender": "F", "email": email},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


# ── Catalog / licensing ───────────────────────────────────────────────────────


def test_templates_endpoint_returns_public_and_licensed(client: TestClient):
    r = client.get("/api/v1/assessments/templates")
    assert r.status_code == 200
    tpls = {t["id"]: t for t in r.json()}
    assert "phq9" in tpls
    assert "c_ssrs" in tpls
    assert tpls["phq9"]["licensing"]["tier"] == "public_domain"
    assert tpls["phq9"]["licensing"]["embedded_text_allowed"] is True
    # PHQ-9 must ship with full 9 items and must flag item 9 in scoring_info.
    phq_fields = tpls["phq9"]["sections"][0]["fields"]
    assert len(phq_fields) == 9
    assert "safety" in tpls["phq9"]["scoring_info"].lower() or "item 9" in tpls["phq9"]["scoring_info"]


def test_licensed_instruments_are_metadata_only(client: TestClient):
    """ADHD-RS-5, ISI, UPDRS, SF-12, C-SSRS must NOT expose copyrighted item text."""
    r = client.get("/api/v1/assessments/templates")
    assert r.status_code == 200
    tpls = {t["id"]: t for t in r.json()}
    for restricted_id in ("isi", "adhd_rs5", "updrs_motor", "sf12", "c_ssrs"):
        assert restricted_id in tpls, f"Missing template {restricted_id}"
        tpl = tpls[restricted_id]
        assert tpl["score_only"] is True, f"{restricted_id} must be score_only"
        assert tpl["licensing"]["embedded_text_allowed"] is False, (
            f"{restricted_id} must not allow embedded item text"
        )
        # Score-only templates may expose an empty or score_entry-typed section,
        # but must never include >3 items (signals a full instrument leaked).
        total_fields = sum(len(s.get("fields", [])) for s in tpl["sections"])
        assert total_fields <= 3, f"{restricted_id} leaks {total_fields} fields"


def test_scales_catalog_is_lightweight(client: TestClient):
    r = client.get("/api/v1/assessments/scales")
    assert r.status_code == 200
    scales = r.json()
    assert len(scales) >= 7
    for s in scales:
        assert {"id", "title", "abbreviation", "conditions", "respondent_type", "score_range", "licensing"} <= set(s.keys())
        assert s["score_range"]["max"] >= s["score_range"]["min"]


# ── Assign / bulk-assign ──────────────────────────────────────────────────────


def test_assign_sets_phase_and_respondent_type(client: TestClient, auth_headers: dict):
    patient_id = _create_patient(client, auth_headers)
    r = client.post(
        "/api/v1/assessments/assign",
        json={
            "patient_id": patient_id,
            "template_id": "phq9",
            "phase": "baseline",
            "due_date": "2026-04-25",
            "bundle_id": "CON-001",
        },
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["status"] == "pending"
    assert body["phase"] == "baseline"
    assert body["respondent_type"] == "patient"
    assert body["bundle_id"] == "CON-001"
    assert body["due_date"] is not None


def test_bulk_assign_creates_multiple(client: TestClient, auth_headers: dict):
    patient_id = _create_patient(client, auth_headers, email="bulk_p@example.com")
    r = client.post(
        "/api/v1/assessments/bulk-assign",
        json={
            "patient_id": patient_id,
            "template_ids": ["phq9", "gad7", "c_ssrs"],
            "phase": "baseline",
            "bundle_id": "CON-001",
        },
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["total"] == 3
    assert len(body["created"]) == 3
    # C-SSRS must come back as clinician respondent.
    cssrs = next(c for c in body["created"] if c["template_id"] == "c_ssrs")
    assert cssrs["respondent_type"] == "clinician"


def test_patient_cannot_assign(client: TestClient, auth_headers: dict):
    patient_id = _create_patient(client, auth_headers, email="deny_p@example.com")
    r = client.post(
        "/api/v1/assessments/assign",
        json={"patient_id": patient_id, "template_id": "phq9"},
        headers=auth_headers["patient"],
    )
    assert r.status_code in (401, 403)


# ── Severity normalization + summary ──────────────────────────────────────────


def test_summary_returns_normalized_severity(client: TestClient, auth_headers: dict):
    patient_id = _create_patient(client, auth_headers, email="sum_p@example.com")
    # Create a completed PHQ-9 with a moderate score.
    client.post(
        "/api/v1/assessments",
        json={
            "patient_id": patient_id,
            "template_id": "phq9",
            "template_title": "PHQ-9",
            "status": "completed",
            "score": "12",
            "phase": "baseline",
        },
        headers=auth_headers["clinician"],
    )
    r = client.get(f"/api/v1/assessments/summary/{patient_id}", headers=auth_headers["clinician"])
    assert r.status_code == 200
    summary = r.json()
    assert summary["patient_id"] == patient_id
    assert summary["aggregated_severity"].get("phq9") == "moderate"
    # PHQ-9 at 12 → "Moderate"
    latest = summary["latest_by_template"]["phq9"]
    assert latest["severity"] == "moderate"
    assert latest["severity_label"] and "moderate" in latest["severity_label"].lower()


def test_ai_context_is_clinician_authored_only(client: TestClient, auth_headers: dict):
    patient_id = _create_patient(client, auth_headers, email="ai_p@example.com")
    client.post(
        "/api/v1/assessments",
        json={
            "patient_id": patient_id,
            "template_id": "gad7",
            "template_title": "GAD-7",
            "status": "completed",
            "score": "18",
            "phase": "baseline",
        },
        headers=auth_headers["clinician"],
    )
    r = client.get(f"/api/v1/assessments/ai-context/{patient_id}", headers=auth_headers["clinician"])
    assert r.status_code == 200
    body = r.json()
    # Must include clinician-authored score with severity label; must never
    # hint at AI or include draft-only content.
    assert "GAD-7" in body["context"]
    assert "18" in body["context"]
    assert "Severe" in body["context"]  # 18 → Severe band
    # Guardrail: the prompt header must be explicit about provenance.
    assert "clinician-authored" in body["context"]
    # Guardrail: never surface AI-draft wording (e.g. "suggests", "according to")
    lower = body["context"].lower()
    assert "ai suggestion" not in lower
    assert "ai-generated summary" not in lower


def test_c_ssrs_score_2_is_severe(client: TestClient, auth_headers: dict):
    patient_id = _create_patient(client, auth_headers, email="cssrs_p@example.com")
    client.post(
        "/api/v1/assessments",
        json={
            "patient_id": patient_id,
            "template_id": "c_ssrs",
            "template_title": "C-SSRS",
            "status": "completed",
            "score": "2",
        },
        headers=auth_headers["clinician"],
    )
    r = client.get(f"/api/v1/assessments/summary/{patient_id}", headers=auth_headers["clinician"])
    sev = r.json()["aggregated_severity"].get("c_ssrs")
    # 2-3 → active ideation (severe)
    assert sev == "severe"


# ── Approval workflow ─────────────────────────────────────────────────────────


def test_approve_sets_reviewer_and_status(client: TestClient, auth_headers: dict):
    patient_id = _create_patient(client, auth_headers, email="appr_p@example.com")
    created = client.post(
        "/api/v1/assessments",
        json={
            "patient_id": patient_id,
            "template_id": "phq9",
            "template_title": "PHQ-9",
            "status": "completed",
            "score": "8",
        },
        headers=auth_headers["clinician"],
    )
    assert created.status_code == 201, created.text
    aid = created.json()["id"]
    r = client.post(
        f"/api/v1/assessments/{aid}/approve",
        json={"approved": True, "review_notes": "Reviewed and confirmed."},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["approved_status"] == "approved"
    assert body["reviewed_by"]


# ── CSV export (launch-audit 2026-04-30) ──────────────────────────────────────


def test_csv_export_returns_real_rows(client: TestClient, auth_headers: dict):
    """The /export endpoint must return real CSV with the clinician's data,
    not fake rows. Demo flag must be false. Headers must include audit fields.
    """
    patient_id = _create_patient(client, auth_headers, email="csv_p@example.com")
    client.post(
        "/api/v1/assessments",
        json={
            "patient_id": patient_id,
            "template_id": "phq9",
            "template_title": "PHQ-9",
            "status": "completed",
            "score": "12",
            "phase": "baseline",
        },
        headers=auth_headers["clinician"],
    )
    r = client.get("/api/v1/assessments/export", headers=auth_headers["clinician"])
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["demo"] is False
    assert body["rows"] >= 1
    csv_text = body["csv"]
    # Header row contains the audit-friendly columns.
    first_line = csv_text.split("\n", 1)[0]
    for col in ("id", "patient_id", "instrument", "score", "severity", "red_flag"):
        assert col in first_line, f"missing column {col} in {first_line}"
    # The created row appears.
    assert "phq9" in csv_text
    assert "12" in csv_text


def test_csv_export_requires_clinician(client: TestClient, auth_headers: dict):
    r = client.get("/api/v1/assessments/export", headers=auth_headers["patient"])
    assert r.status_code in (401, 403)
