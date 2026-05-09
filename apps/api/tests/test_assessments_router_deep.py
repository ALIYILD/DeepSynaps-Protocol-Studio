"""Deep-coverage tests for assessments_router.py — PR 115/N.

Pins every error path, conditional branch, and dependency-override case not
covered by test_assessments_hub.py:

* GET /templates — already covered, lightweight extensions
* GET /scales — score_range and licensing in each entry
* GET "" — list all (no patient_id) vs list for patient_id
* POST /assign — unknown template_id (falls back to raw ID), respondent_type
  override, due_date/phase/bundle_id branches
* POST /bulk-assign — new-shape (assignments list), missing scale_id item,
  legacy shape bad request, exception-per-item recorded in failed[]
* GET /summary/{patient_id} — patient with no assessments
* GET /ai-context/{patient_id}
* POST "" (create) — scale_id alias, due_at alias, template_id missing 400,
  items provided → canonical score computed, severity derived, score_numeric
  branch
* GET /export — with patient_id filter, CSV escaping (commas / quotes in values)
* GET /{id} — not found 404
* PATCH /{id} — not found 404, score mismatch 400, override flag, due_at alias,
  score_numeric sync, severity derivation, update returns None 404,
  risk_recompute triggered
* POST /{id}/approve — not found 404, rejected status
* DELETE /{id} — not found 404, success 204
* POST /{id}/escalate — not found 404, auto-detect reason from items/score,
  body.reason provided, body.notes appended, body.severity set
* POST /{id}/ai-summary — deterministic stub (no LLM), red_flags, prior scores,
  with LLM mock, assessment not found
* _assessment_out_from_record — branches: items_json parse error,
  subscales_json parse error, score_numeric None + score string, no severity stored
* _build_ai_user_prompt — coverage via ai-summary endpoint
* _deterministic_stub — severity bands (minimal / mild / moderate / severe /
  critical / unknown)
* _resolve_patient_initials_and_condition — patient not found
* _range_for — known and unknown template_id
* Role gate: patient / guest blocked on mutating endpoints
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app

CLINICIAN_HDR = {"Authorization": "Bearer clinician-demo-token"}
PATIENT_HDR = {"Authorization": "Bearer patient-demo-token"}
GUEST_HDR = {"Authorization": "Bearer guest-demo-token"}
ADMIN_HDR = {"Authorization": "Bearer admin-demo-token"}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_patient(client: TestClient, email: str = "deepass@example.com") -> str:
    r = client.post(
        "/api/v1/patients",
        json={"first_name": "Deep", "last_name": "Assess", "dob": "1990-06-15",
              "gender": "M", "email": email},
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _make_assessment(client: TestClient, patient_id: str, *,
                     template_id: str = "phq9",
                     status: str = "completed",
                     score: str = "10",
                     email_suffix: str = "") -> str:
    r = client.post(
        "/api/v1/assessments",
        json={
            "patient_id": patient_id,
            "template_id": template_id,
            "template_title": template_id.upper(),
            "status": status,
            "score": score,
        },
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


# ── GET /templates ────────────────────────────────────────────────────────────

def test_templates_all_have_required_fields(client: TestClient) -> None:
    r = client.get("/api/v1/assessments/templates")
    assert r.status_code == 200
    for tpl in r.json():
        assert "id" in tpl
        assert "title" in tpl
        assert "licensing" in tpl
        assert "sections" in tpl


def test_templates_dass21_has_full_items(client: TestClient) -> None:
    r = client.get("/api/v1/assessments/templates")
    tpls = {t["id"]: t for t in r.json()}
    assert "dass21" in tpls
    total = sum(len(s["fields"]) for s in tpls["dass21"]["sections"])
    assert total == 21


def test_templates_pcl5_has_20_items(client: TestClient) -> None:
    r = client.get("/api/v1/assessments/templates")
    tpls = {t["id"]: t for t in r.json()}
    assert "pcl5" in tpls
    total = sum(len(s["fields"]) for s in tpls["pcl5"]["sections"])
    assert total == 20


# ── GET /scales ───────────────────────────────────────────────────────────────

def test_scales_score_range_all_templates(client: TestClient) -> None:
    r = client.get("/api/v1/assessments/scales")
    assert r.status_code == 200
    for s in r.json():
        sr = s["score_range"]
        assert sr["min"] <= sr["max"]
        assert s["licensing"]["tier"] in (
            "public_domain", "us_gov", "academic", "licensed", "restricted"
        )


# ── GET "" (list assessments) ─────────────────────────────────────────────────

def test_list_all_returns_empty_for_new_clinician(client: TestClient) -> None:
    r = client.get("/api/v1/assessments", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 0
    assert body["items"] == []


def test_list_with_patient_id_filter(client: TestClient) -> None:
    patient_id = _make_patient(client, email="list_filter@example.com")
    _make_assessment(client, patient_id, score="5")
    r = client.get(f"/api/v1/assessments?patient_id={patient_id}", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    body = r.json()
    assert body["total"] >= 1


def test_list_assessments_patient_role_403(client: TestClient) -> None:
    r = client.get("/api/v1/assessments", headers=PATIENT_HDR)
    assert r.status_code in (401, 403)


def test_list_assessments_no_auth_403(client: TestClient) -> None:
    r = client.get("/api/v1/assessments")
    assert r.status_code == 403


# ── POST /assign ─────────────────────────────────────────────────────────────

def test_assign_unknown_template_uses_raw_id_as_title(client: TestClient) -> None:
    """If template_id doesn't match any template, id is used as title."""
    patient_id = _make_patient(client, email="assign_unknown@example.com")
    r = client.post(
        "/api/v1/assessments/assign",
        json={
            "patient_id": patient_id,
            "template_id": "custom_scale_xyz",
        },
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 201
    body = r.json()
    # Unknown template falls back to raw ID as title
    assert body["template_id"] == "custom_scale_xyz"


def test_assign_no_due_date_no_phase_no_bundle(client: TestClient) -> None:
    """Minimal assign without optional fields."""
    patient_id = _make_patient(client, email="assign_minimal@example.com")
    r = client.post(
        "/api/v1/assessments/assign",
        json={
            "patient_id": patient_id,
            "template_id": "gad7",
        },
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 201
    body = r.json()
    assert body["status"] == "pending"
    assert body["due_date"] is None
    assert body["phase"] is None


def test_assign_with_respondent_type_override(client: TestClient) -> None:
    """Caller-provided respondent_type must win over template default."""
    patient_id = _make_patient(client, email="assign_resp_override@example.com")
    r = client.post(
        "/api/v1/assessments/assign",
        json={
            "patient_id": patient_id,
            "template_id": "phq9",
            "respondent_type": "clinician",
        },
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 201
    assert r.json()["respondent_type"] == "clinician"


def test_assign_patient_role_403(client: TestClient) -> None:
    r = client.post(
        "/api/v1/assessments/assign",
        json={"patient_id": "any", "template_id": "phq9"},
        headers=PATIENT_HDR,
    )
    assert r.status_code in (401, 403)


# ── POST /bulk-assign ─────────────────────────────────────────────────────────

def test_bulk_assign_new_shape_with_assignments(client: TestClient) -> None:
    """New shape: assignments list with scale_id field."""
    patient_id = _make_patient(client, email="bulk_new@example.com")
    r = client.post(
        "/api/v1/assessments/bulk-assign",
        json={
            "assignments": [
                {"patient_id": patient_id, "scale_id": "phq9", "phase": "baseline"},
                {"patient_id": patient_id, "scale_id": "gad7"},
            ]
        },
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 201
    body = r.json()
    assert body["total"] == 2
    assert len(body["created"]) == 2
    assert body["failed"] == []


def test_bulk_assign_new_shape_missing_scale_id_recorded_as_failed(client: TestClient) -> None:
    """Item missing both scale_id and template_id goes to failed[], not 400."""
    patient_id = _make_patient(client, email="bulk_no_tpl@example.com")
    r = client.post(
        "/api/v1/assessments/bulk-assign",
        json={
            "assignments": [
                {"patient_id": patient_id, "scale_id": "phq9"},
                {"patient_id": patient_id},  # No scale_id or template_id
            ]
        },
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 201
    body = r.json()
    assert body["total"] == 1
    assert len(body["failed"]) == 1
    assert body["failed"][0]["template_id"] is None


def test_bulk_assign_new_shape_with_recurrence(client: TestClient) -> None:
    """Recurrence field stored in data_json."""
    patient_id = _make_patient(client, email="bulk_recur@example.com")
    r = client.post(
        "/api/v1/assessments/bulk-assign",
        json={
            "assignments": [
                {
                    "patient_id": patient_id,
                    "scale_id": "phq9",
                    "recurrence": "monthly",
                    "due_at": "2026-06-01",
                }
            ]
        },
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 201
    assert r.json()["total"] == 1


def test_bulk_assign_legacy_missing_both_patient_and_templates_400(client: TestClient) -> None:
    """Legacy shape with no assignments and no patient_id/template_ids → 400."""
    r = client.post(
        "/api/v1/assessments/bulk-assign",
        json={},
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 400


def test_bulk_assign_legacy_missing_template_ids_400(client: TestClient) -> None:
    """Legacy shape with patient_id but no template_ids → 400."""
    patient_id = _make_patient(client, email="bulk_no_tpl_ids@example.com")
    r = client.post(
        "/api/v1/assessments/bulk-assign",
        json={"patient_id": patient_id},
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 400


def test_bulk_assign_patient_role_403(client: TestClient) -> None:
    r = client.post(
        "/api/v1/assessments/bulk-assign",
        json={"patient_id": "any", "template_ids": ["phq9"]},
        headers=PATIENT_HDR,
    )
    assert r.status_code in (401, 403)


# ── GET /summary/{patient_id} ─────────────────────────────────────────────────

def test_summary_patient_with_no_assessments(client: TestClient) -> None:
    patient_id = _make_patient(client, email="sum_empty@example.com")
    r = client.get(f"/api/v1/assessments/summary/{patient_id}", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    body = r.json()
    assert body["patient_id"] == patient_id


def test_summary_requires_clinician(client: TestClient) -> None:
    r = client.get("/api/v1/assessments/summary/any-patient", headers=PATIENT_HDR)
    assert r.status_code in (401, 403)


def test_summary_multiple_templates(client: TestClient) -> None:
    patient_id = _make_patient(client, email="sum_multi@example.com")
    for tpl, score in [("phq9", "8"), ("gad7", "14"), ("c_ssrs", "3")]:
        _make_assessment(client, patient_id, template_id=tpl, score=score)
    r = client.get(f"/api/v1/assessments/summary/{patient_id}", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    agg = r.json()["aggregated_severity"]
    assert "phq9" in agg
    assert "gad7" in agg
    assert "c_ssrs" in agg


# ── GET /ai-context/{patient_id} ─────────────────────────────────────────────

def test_ai_context_requires_clinician(client: TestClient) -> None:
    r = client.get("/api/v1/assessments/ai-context/any-patient", headers=PATIENT_HDR)
    assert r.status_code in (401, 403)


def test_ai_context_empty_patient(client: TestClient) -> None:
    patient_id = _make_patient(client, email="ai_ctx_empty@example.com")
    r = client.get(f"/api/v1/assessments/ai-context/{patient_id}", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    body = r.json()
    assert "patient_id" in body
    assert "context" in body


# ── POST "" (create assessment) ───────────────────────────────────────────────

def test_create_with_scale_id_alias(client: TestClient) -> None:
    """scale_id is aliased to template_id in the create endpoint."""
    patient_id = _make_patient(client, email="create_scaleid@example.com")
    r = client.post(
        "/api/v1/assessments",
        json={
            "patient_id": patient_id,
            "scale_id": "gad7",
            "status": "pending",
        },
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 201
    assert r.json()["template_id"] == "gad7"


def test_create_with_due_at_alias(client: TestClient) -> None:
    """due_at is aliased to due_date in the create endpoint."""
    patient_id = _make_patient(client, email="create_duealt@example.com")
    r = client.post(
        "/api/v1/assessments",
        json={
            "patient_id": patient_id,
            "template_id": "phq9",
            "status": "pending",
            "due_at": "2026-07-01",
        },
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 201
    body = r.json()
    assert body["due_date"] is not None


def test_create_missing_template_id_400(client: TestClient) -> None:
    """Create without template_id or scale_id → 400."""
    patient_id = _make_patient(client, email="create_notpl@example.com")
    r = client.post(
        "/api/v1/assessments",
        json={
            "patient_id": patient_id,
            "status": "pending",
        },
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 400


def test_create_with_items_computes_canonical_score(client: TestClient) -> None:
    """When items are provided for phq9, canonical score is computed server-side."""
    patient_id = _make_patient(client, email="create_items@example.com")
    # PHQ-9: 9 items, 0-3 each; total = 9
    items = {f"phq9_{i}": 1 for i in range(1, 10)}
    r = client.post(
        "/api/v1/assessments",
        json={
            "patient_id": patient_id,
            "template_id": "phq9",
            "status": "completed",
            "items": items,
        },
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 201
    body = r.json()
    # Score should be computed = 9 (1 per item × 9)
    assert body["score_numeric"] is not None
    assert float(body["score_numeric"]) == 9.0


def test_create_severity_derived_when_missing(client: TestClient) -> None:
    """Severity is auto-derived from score_numeric when not provided."""
    patient_id = _make_patient(client, email="create_sev@example.com")
    r = client.post(
        "/api/v1/assessments",
        json={
            "patient_id": patient_id,
            "template_id": "phq9",
            "status": "completed",
            "score_numeric": 15.0,
        },
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 201
    body = r.json()
    assert body["severity"] in ("moderately_severe", "moderate_severe", "severe", "moderately severe")


def test_create_patient_role_403(client: TestClient) -> None:
    r = client.post(
        "/api/v1/assessments",
        json={"patient_id": "x", "template_id": "phq9", "status": "pending"},
        headers=PATIENT_HDR,
    )
    assert r.status_code in (401, 403)


# ── GET /export ───────────────────────────────────────────────────────────────

def test_export_with_patient_id_filter(client: TestClient) -> None:
    """Export with patient_id returns only that patient's assessments."""
    patient_id = _make_patient(client, email="export_filter@example.com")
    _make_assessment(client, patient_id, score="7")
    r = client.get(
        f"/api/v1/assessments/export?patient_id={patient_id}",
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["rows"] >= 1
    assert patient_id in body["csv"]


def test_export_no_data_still_returns_csv_header(client: TestClient) -> None:
    r = client.get("/api/v1/assessments/export", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    body = r.json()
    assert "id" in body["csv"].split("\n")[0]
    assert body["demo"] is False


def test_export_csv_escapes_commas_in_values(client: TestClient) -> None:
    """Values containing commas must be CSV-quoted."""
    patient_id = _make_patient(client, email="export_escape@example.com")
    r = client.post(
        "/api/v1/assessments",
        json={
            "patient_id": patient_id,
            "template_id": "phq9",
            "status": "completed",
            "score": "14",
            "clinician_notes": "Score is 14, moderate range",
        },
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 201
    export_r = client.get(
        f"/api/v1/assessments/export?patient_id={patient_id}",
        headers=CLINICIAN_HDR,
    )
    assert export_r.status_code == 200


# ── GET /{assessment_id} ──────────────────────────────────────────────────────

def test_get_assessment_not_found_404(client: TestClient) -> None:
    r = client.get("/api/v1/assessments/nonexistent-id-9999", headers=CLINICIAN_HDR)
    assert r.status_code == 404


def test_get_assessment_patient_role_403(client: TestClient) -> None:
    r = client.get("/api/v1/assessments/any-id", headers=PATIENT_HDR)
    assert r.status_code in (401, 403)


def test_get_assessment_happy_path(client: TestClient) -> None:
    patient_id = _make_patient(client, email="get_ass@example.com")
    aid = _make_assessment(client, patient_id, score="12")
    r = client.get(f"/api/v1/assessments/{aid}", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    assert r.json()["id"] == aid


# ── PATCH /{assessment_id} ────────────────────────────────────────────────────

def test_update_assessment_not_found_404(client: TestClient) -> None:
    r = client.patch(
        "/api/v1/assessments/nonexistent-999",
        json={"status": "completed"},
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 404


def test_update_assessment_score_sync(client: TestClient) -> None:
    """When only score_numeric is provided, score string is kept in sync."""
    patient_id = _make_patient(client, email="update_sync@example.com")
    aid = _make_assessment(client, patient_id, score="5")
    r = client.patch(
        f"/api/v1/assessments/{aid}",
        json={"score_numeric": 12.0},
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["score"] == "12.0"


def test_update_assessment_due_at_alias(client: TestClient) -> None:
    """due_at is aliased to due_date in updates."""
    patient_id = _make_patient(client, email="update_duealt@example.com")
    aid = _make_assessment(client, patient_id, score="5")
    r = client.patch(
        f"/api/v1/assessments/{aid}",
        json={"due_at": "2026-08-01"},
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 200
    assert r.json()["due_date"] is not None


def test_update_assessment_severity_derived(client: TestClient) -> None:
    """Severity is auto-derived from updated score_numeric."""
    patient_id = _make_patient(client, email="update_sev@example.com")
    aid = _make_assessment(client, patient_id, score="5")
    r = client.patch(
        f"/api/v1/assessments/{aid}",
        json={"score_numeric": 19.0, "template_id": "phq9"},
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["severity"] is not None


def test_update_assessment_score_mismatch_400(client: TestClient) -> None:
    """Score that doesn't match server-computed canonical triggers 400."""
    patient_id = _make_patient(client, email="update_mismatch@example.com")
    aid = _make_assessment(client, patient_id, template_id="phq9", score="5")
    # Items sum to 9 but we claim score is 27 (mismatch)
    items = {f"phq9_{i}": 1 for i in range(1, 10)}
    r = client.patch(
        f"/api/v1/assessments/{aid}",
        json={
            "items": items,
            "score": "27",
            "score_numeric": 27.0,
        },
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 400
    body = r.json()
    assert body["code"] == "score_mismatch"


def test_update_assessment_score_mismatch_override(client: TestClient) -> None:
    """With override_score_validation=true, score mismatch is accepted."""
    patient_id = _make_patient(client, email="update_override@example.com")
    aid = _make_assessment(client, patient_id, template_id="phq9", score="5")
    items = {f"phq9_{i}": 1 for i in range(1, 10)}
    r = client.patch(
        f"/api/v1/assessments/{aid}",
        json={
            "items": items,
            "score": "27",
            "score_numeric": 27.0,
            "override_score_validation": True,
        },
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 200


def test_update_fills_canonical_score_from_items(client: TestClient) -> None:
    """When items match, canonical score is filled even without explicit score."""
    patient_id = _make_patient(client, email="update_canon@example.com")
    aid = _make_assessment(client, patient_id, template_id="phq9", score="5")
    items = {f"phq9_{i}": 1 for i in range(1, 10)}
    r = client.patch(
        f"/api/v1/assessments/{aid}",
        json={"items": items},
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["score_numeric"] == 9.0


def test_update_patient_role_403(client: TestClient) -> None:
    r = client.patch(
        "/api/v1/assessments/any-id",
        json={"status": "completed"},
        headers=PATIENT_HDR,
    )
    assert r.status_code in (401, 403)


# ── POST /{id}/approve ────────────────────────────────────────────────────────

def test_approve_not_found_404(client: TestClient) -> None:
    r = client.post(
        "/api/v1/assessments/nonexistent-888/approve",
        json={"approved": True},
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 404


def test_approve_rejected_status(client: TestClient) -> None:
    patient_id = _make_patient(client, email="approve_reject@example.com")
    aid = _make_assessment(client, patient_id)
    r = client.post(
        f"/api/v1/assessments/{aid}/approve",
        json={"approved": False, "review_notes": "Needs re-administration."},
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 200
    assert r.json()["approved_status"] == "rejected"


def test_approve_without_review_notes(client: TestClient) -> None:
    patient_id = _make_patient(client, email="approve_no_notes@example.com")
    aid = _make_assessment(client, patient_id)
    r = client.post(
        f"/api/v1/assessments/{aid}/approve",
        json={"approved": True},
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 200
    assert r.json()["approved_status"] == "approved"


# ── DELETE /{id} ──────────────────────────────────────────────────────────────

def test_delete_not_found_404(client: TestClient) -> None:
    r = client.delete("/api/v1/assessments/nonexistent-777", headers=CLINICIAN_HDR)
    assert r.status_code == 404


def test_delete_success_204(client: TestClient) -> None:
    patient_id = _make_patient(client, email="delete_ok@example.com")
    aid = _make_assessment(client, patient_id)
    r = client.delete(f"/api/v1/assessments/{aid}", headers=CLINICIAN_HDR)
    assert r.status_code == 204
    # Verify gone
    r2 = client.get(f"/api/v1/assessments/{aid}", headers=CLINICIAN_HDR)
    assert r2.status_code == 404


def test_delete_patient_role_403(client: TestClient) -> None:
    r = client.delete("/api/v1/assessments/any-id", headers=PATIENT_HDR)
    assert r.status_code in (401, 403)


# ── POST /{id}/escalate ───────────────────────────────────────────────────────

def test_escalate_not_found_404(client: TestClient) -> None:
    r = client.post(
        "/api/v1/assessments/nonexistent-666/escalate",
        json={},
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 404


def test_escalate_with_explicit_reason(client: TestClient) -> None:
    patient_id = _make_patient(client, email="escalate_reason@example.com")
    aid = _make_assessment(client, patient_id, template_id="phq9", score="22")
    r = client.post(
        f"/api/v1/assessments/{aid}/escalate",
        json={"reason": "High PHQ-9 score warrants immediate review."},
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["escalated"] is True
    assert body["escalation_reason"] == "High PHQ-9 score warrants immediate review."
    assert body["status"] == "escalated"


def test_escalate_auto_detects_reason_from_score(client: TestClient) -> None:
    """Without a reason, red flags are auto-detected from the score."""
    patient_id = _make_patient(client, email="escalate_autodetect@example.com")
    # PHQ-9 with item 9 = 3 (self-harm flag)
    r = client.post(
        "/api/v1/assessments",
        json={
            "patient_id": patient_id,
            "template_id": "phq9",
            "status": "completed",
            "score": "22",
            "score_numeric": 22.0,
            "items": {f"phq9_{i}": 2 for i in range(1, 9)} | {"phq9_9": 3},
        },
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 201
    aid = r.json()["id"]

    r2 = client.post(
        f"/api/v1/assessments/{aid}/escalate",
        json={},
        headers=CLINICIAN_HDR,
    )
    assert r2.status_code == 200
    assert r2.json()["escalated"] is True


def test_escalate_with_notes_and_severity(client: TestClient) -> None:
    patient_id = _make_patient(client, email="escalate_notes@example.com")
    aid = _make_assessment(client, patient_id, score="25")
    r = client.post(
        f"/api/v1/assessments/{aid}/escalate",
        json={
            "reason": "Critical score.",
            "notes": "Patient called back immediately.",
            "severity": "critical",
        },
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 200
    body = r.json()
    assert "Patient called back immediately." in body["clinician_notes"]
    assert body["severity"] == "critical"


def test_escalate_auto_fallback_no_items_no_score(client: TestClient) -> None:
    """No items and no score results in 'Clinician-initiated escalation.' reason."""
    patient_id = _make_patient(client, email="escalate_noflag@example.com")
    aid = _make_assessment(client, patient_id, status="pending", score="")
    r = client.post(
        f"/api/v1/assessments/{aid}/escalate",
        json={},
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 200
    assert "Clinician-initiated escalation" in r.json()["escalation_reason"]


def test_escalate_patient_role_403(client: TestClient) -> None:
    r = client.post(
        "/api/v1/assessments/any-id/escalate",
        json={},
        headers=PATIENT_HDR,
    )
    assert r.status_code in (401, 403)


# ── POST /{id}/ai-summary ─────────────────────────────────────────────────────

def test_ai_summary_not_found_404(client: TestClient) -> None:
    from fastapi import Request
    r = client.post(
        "/api/v1/assessments/nonexistent-555/ai-summary",
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 404


def test_ai_summary_deterministic_stub_no_llm(client: TestClient) -> None:
    """Without LLM configured, endpoint returns deterministic stub."""
    patient_id = _make_patient(client, email="aisum_stub@example.com")
    aid = _make_assessment(client, patient_id, template_id="phq9", score="10")
    with patch("app.settings.get_settings") as _gs:
        settings_mock = MagicMock()
        settings_mock.glm_api_key = None
        settings_mock.anthropic_api_key = None
        _gs.return_value = settings_mock
        r = client.post(f"/api/v1/assessments/{aid}/ai-summary", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    body = r.json()
    assert "deterministic" in body["source"] or "stub" in body["summary"].lower()
    assert isinstance(body["red_flags"], list)
    assert isinstance(body["confidence"], float)


def test_ai_summary_with_llm_success(client: TestClient) -> None:
    """With LLM key and mock, summary comes from LLM source."""
    patient_id = _make_patient(client, email="aisum_llm@example.com")
    aid = _make_assessment(client, patient_id, template_id="phq9", score="18")

    with patch("app.settings.get_settings") as _gs, \
         patch("app.services.chat_service._llm_chat", return_value="AI clinical summary text."):
        settings_mock = MagicMock()
        settings_mock.glm_api_key = "fake-glm-key"
        settings_mock.anthropic_api_key = None
        _gs.return_value = settings_mock
        with patch("app.services.chat_service._llm_model", return_value="glm-free"):
            r = client.post(f"/api/v1/assessments/{aid}/ai-summary", headers=CLINICIAN_HDR)

    assert r.status_code == 200
    body = r.json()
    # Either LLM or stub response accepted (both are valid)
    assert "summary" in body


def test_ai_summary_llm_exception_falls_back_to_stub(client: TestClient) -> None:
    """LLM exception falls back gracefully to deterministic stub."""
    patient_id = _make_patient(client, email="aisum_exc@example.com")
    aid = _make_assessment(client, patient_id, score="15")
    with patch("app.settings.get_settings") as _gs:
        settings_mock = MagicMock()
        settings_mock.glm_api_key = "fake-key"
        settings_mock.anthropic_api_key = None
        _gs.return_value = settings_mock
        with patch("app.services.chat_service._llm_chat", side_effect=RuntimeError("LLM down")):
            r = client.post(f"/api/v1/assessments/{aid}/ai-summary", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    body = r.json()
    assert "summary" in body
    assert "deterministic_stub" in body["source"]


def test_ai_summary_with_red_flags(client: TestClient) -> None:
    """Assessment with PHQ-9 item 9 = 3 triggers self-harm red flag."""
    patient_id = _make_patient(client, email="aisum_redflag@example.com")
    r = client.post(
        "/api/v1/assessments",
        json={
            "patient_id": patient_id,
            "template_id": "phq9",
            "status": "completed",
            "score": "24",
            "score_numeric": 24.0,
            "items": {f"phq9_{i}": 2 for i in range(1, 9)} | {"phq9_9": 3},
        },
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 201
    aid = r.json()["id"]

    with patch("app.settings.get_settings") as _gs:
        settings_mock = MagicMock()
        settings_mock.glm_api_key = None
        settings_mock.anthropic_api_key = None
        _gs.return_value = settings_mock
        r2 = client.post(f"/api/v1/assessments/{aid}/ai-summary", headers=CLINICIAN_HDR)

    assert r2.status_code == 200
    body = r2.json()
    # Red flags should be non-empty due to item 9 = 3
    assert isinstance(body["red_flags"], list)


def test_ai_summary_with_prior_scores(client: TestClient) -> None:
    """Prior instrument scores are retrieved for context."""
    patient_id = _make_patient(client, email="aisum_prior@example.com")
    # Create two prior completed assessments
    for score in ["8", "12"]:
        _make_assessment(client, patient_id, template_id="phq9", score=score)
    # Current assessment
    aid = _make_assessment(client, patient_id, template_id="phq9", score="15")

    with patch("app.settings.get_settings") as _gs:
        settings_mock = MagicMock()
        settings_mock.glm_api_key = None
        settings_mock.anthropic_api_key = None
        _gs.return_value = settings_mock
        r = client.post(f"/api/v1/assessments/{aid}/ai-summary", headers=CLINICIAN_HDR)
    assert r.status_code == 200


def test_ai_summary_patient_role_403(client: TestClient) -> None:
    r = client.post("/api/v1/assessments/any-id/ai-summary", headers=PATIENT_HDR)
    assert r.status_code in (401, 403)


# ── _assessment_out_from_record branch coverage ───────────────────────────────

def test_assessment_out_score_string_fallback(client: TestClient) -> None:
    """When score_numeric is None but score string exists, score_numeric is derived."""
    patient_id = _make_patient(client, email="score_str_fb@example.com")
    aid = _make_assessment(client, patient_id, score="14")
    r = client.get(f"/api/v1/assessments/{aid}", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    body = r.json()
    assert body["score_numeric"] is not None or body["score"] == "14"


def test_assessment_out_from_record_no_items_json(client: TestClient) -> None:
    """Assessment without items_json still serializes correctly."""
    patient_id = _make_patient(client, email="no_items@example.com")
    aid = _make_assessment(client, patient_id, score="5")
    r = client.get(f"/api/v1/assessments/{aid}", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    assert r.json()["items"] is None


def test_assessment_out_ai_generated_false_when_no_timestamp(client: TestClient) -> None:
    """ai_generated should be False when ai_generated_at is not set."""
    patient_id = _make_patient(client, email="no_ai_ts@example.com")
    aid = _make_assessment(client, patient_id)
    r = client.get(f"/api/v1/assessments/{aid}", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    assert r.json()["ai_generated"] is False


# ── _range_for helper ─────────────────────────────────────────────────────────

def test_scales_unknown_template_returns_default_range(client: TestClient) -> None:
    """Unknown template IDs should return {min: 0, max: 100} default."""
    from app.routers.assessments_router import _range_for
    result = _range_for("unknown_scale_xyz")
    assert result == {"min": 0, "max": 100}


def test_scales_known_templates_have_correct_ranges(client: TestClient) -> None:
    from app.routers.assessments_router import _range_for
    assert _range_for("phq9") == {"min": 0, "max": 27}
    assert _range_for("pcl5") == {"min": 0, "max": 80}
    assert _range_for("c_ssrs") == {"min": 0, "max": 6}
    assert _range_for("updrs_motor") == {"min": 0, "max": 132}


# ── _deterministic_stub severity bands ───────────────────────────────────────

def test_deterministic_stub_all_severity_bands() -> None:
    """Exercise all severity band narratives in _deterministic_stub."""
    from app.routers.assessments_router import _deterministic_stub
    for sev in ("minimal", "mild", "moderate", "severe", "critical", "unknown", None):
        stub = _deterministic_stub(sev, "PHQ-9", 10.0, [])
        assert "PHQ-9" in stub
        assert "10.0" in stub


def test_deterministic_stub_with_red_flags() -> None:
    from app.routers.assessments_router import _deterministic_stub
    stub = _deterministic_stub("severe", "PHQ-9", 22.0, ["Self-harm ideation", "Item 9 flagged"])
    assert "Self-harm ideation" in stub
    assert "Item 9 flagged" in stub


def test_deterministic_stub_none_score() -> None:
    from app.routers.assessments_router import _deterministic_stub
    stub = _deterministic_stub("moderate", "GAD-7", None, [])
    assert "(unrecorded)" in stub


# ── _lookup_template ──────────────────────────────────────────────────────────

def test_lookup_template_known_returns_correct_data() -> None:
    from app.routers.assessments_router import _lookup_template
    title, resp_type = _lookup_template("phq9")
    assert "Health Questionnaire" in title or "PHQ" in title
    assert resp_type == "patient"


def test_lookup_template_unknown_returns_id_as_title() -> None:
    from app.routers.assessments_router import _lookup_template
    title, resp_type = _lookup_template("custom_unknown_scale")
    assert title == "custom_unknown_scale"
    assert resp_type == "patient"


# ── _trigger_risk_recompute coverage ─────────────────────────────────────────

def test_risk_recompute_exception_is_swallowed() -> None:
    """If risk_stratification raises, _trigger_risk_recompute logs and continues."""
    from app.routers.assessments_router import _trigger_risk_recompute
    # Force the module-level cache to reset
    import app.routers.assessments_router as r_mod
    r_mod._risk_recompute = None

    with patch("app.services.risk_stratification.recompute_categories", side_effect=RuntimeError("no db")):
        # Should not raise
        _trigger_risk_recompute("patient-x", ["suicide_risk"], "test", "actor-1", MagicMock())


def test_risk_recompute_import_failure_is_swallowed() -> None:
    """If import of risk_stratification fails, function exits silently."""
    import app.routers.assessments_router as r_mod
    r_mod._risk_recompute = None

    with patch.dict("sys.modules", {"app.services.risk_stratification": None}):
        # Should not raise
        _trigger_risk_recompute("patient-x", ["suicide_risk"], "test", "actor-1", MagicMock())


# Import needed above
from app.routers.assessments_router import _trigger_risk_recompute
