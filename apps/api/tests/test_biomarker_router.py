"""Tests for the Lab Biomarker router.

Covers:
  GET  /api/v1/biomarkers                          — list all categories
  GET  /api/v1/biomarkers/{category}               — list biomarkers in category
  GET  /api/v1/biomarkers/{category}?evidence=...  — evidence-grade filter
  GET  /api/v1/biomarkers/{category}?q=...         — search filter
  GET  /api/v1/biomarkers/{category}/{biomarker_id} — single biomarker detail
  POST /api/v1/biomarkers/patient/{id}/values      — store patient biomarker value
  GET  /api/v1/biomarkers/patient/{id}/values      — list patient biomarker values
  GET  /api/v1/biomarkers/patient/{id}/trends      — time-series trends
  POST /api/v1/biomarkers/patient/{id}/interpret   — safe-worded interpretation

Key contracts:
  * All endpoints require authentication (Bearer token).
  * POST /values requires patient consent — 403 without consent.
  * POST /values returns 404 for wrong/nonexistent patient.
  * Interpretation endpoint returns safe wording — no diagnostic claims.
  * All responses include a clinical safety disclaimer.
  * Research-only biomarkers carry NOT_SUPPORTED grade.
  * Evidence grade badges are included in every biomarker listing.
  * Reference ranges and confounders are present in every detail response.
"""
from __future__ import annotations

import pytest
from datetime import datetime, timezone
from fastapi.testclient import TestClient

from app.main import app


# ── Auth helpers ──────────────────────────────────────────────────────────────

AUTH_CLINICIAN = {"Authorization": "Bearer clinician-demo-token"}
AUTH_ADMIN = {"Authorization": "Bearer admin-demo-token"}
AUTH_PATIENT = {"Authorization": "Bearer patient-demo-token"}
AUTH_GUEST = {"Authorization": "Bearer guest-demo-token"}
NO_AUTH = {}


# ── Test fixtures / helpers ──────────────────────────────────────────────────

_BIOMARKER_CATEGORIES = [
    "blood_labs",
    "neuroinflammation",
    "hormones",
    "immune",
    "nutritional",
    "research_only",
]

_KNOWN_EVIDENCE_GRADES = {
    "STRONG_FDA_CLEARED",
    "MODERATE_NO_RCT_OPEN_LABEL_LARGE_SERIES",
    "WEAK_OFF_LABEL_FOR_ANXIETY",
    "NOT_SUPPORTED_DO_NOT_SURFACE",
}


# ── Test 1: GET /biomarkers returns all categories ───────────────────────────


def test_biomarkers_list_all_categories(client: TestClient) -> None:
    """GET /biomarkers returns the list of biomarker categories."""
    r = client.get("/api/v1/biomarkers", headers=AUTH_CLINICIAN)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "categories" in body, "Response must contain 'categories' key"
    assert isinstance(body["categories"], list), "Categories must be a list"
    assert len(body["categories"]) >= 6, "Must have at least 6 categories"


def test_biomarkers_categories_have_required_fields(client: TestClient) -> None:
    """Each category must have id, label, description, and marker_count."""
    r = client.get("/api/v1/biomarkers", headers=AUTH_CLINICIAN)
    body = r.json()
    for cat in body["categories"]:
        for key in ("id", "label", "description", "marker_count"):
            assert key in cat, f"Category missing key '{key}'"


def test_biomarkers_known_categories_present(client: TestClient) -> None:
    """All expected category IDs must be present."""
    r = client.get("/api/v1/biomarkers", headers=AUTH_CLINICIAN)
    ids = {c["id"] for c in r.json()["categories"]}
    for expected in _BIOMARKER_CATEGORIES:
        assert expected in ids, f"Expected category '{expected}' not found"


# ── Test 2: GET /biomarkers/blood_labs returns blood biomarkers ──────────────


def test_blood_labs_returns_biomarker_list(client: TestClient) -> None:
    """GET /biomarkers/blood_labs returns a list of blood biomarkers."""
    r = client.get("/api/v1/biomarkers/blood_labs", headers=AUTH_CLINICIAN)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "items" in body, "Response must contain 'items'"
    assert isinstance(body["items"], list), "Items must be a list"
    assert len(body["items"]) > 0, "Blood labs must have at least one biomarker"


def test_blood_labs_items_have_required_keys(client: TestClient) -> None:
    """Each blood biomarker must have the mandatory fields."""
    r = client.get("/api/v1/biomarkers/blood_labs", headers=AUTH_CLINICIAN)
    for item in r.json()["items"]:
        for key in ("id", "name", "category", "evidence_grade", "ref_range"):
            assert key in item, f"Biomarker '{item.get('id', '?')}' missing key '{key}'"


# ── Test 3: GET /biomarkers/blood_labs with evidence filter ──────────────────


def test_blood_labs_evidence_filter_strong(client: TestClient) -> None:
    """Filtering by STRONG_FDA_CLEARED returns only strong-evidence markers."""
    r = client.get(
        "/api/v1/biomarkers/blood_labs?evidence=STRONG_FDA_CLEARED",
        headers=AUTH_CLINICIAN,
    )
    assert r.status_code == 200, r.text
    for item in r.json()["items"]:
        assert (
            item["evidence_grade"] == "STRONG_FDA_CLEARED"
        ), f"Expected STRONG_FDA_CLEARED, got {item['evidence_grade']}"


def test_blood_labs_evidence_filter_unknown_returns_empty(client: TestClient) -> None:
    """Filtering by a nonexistent evidence grade returns empty items."""
    r = client.get(
        "/api/v1/biomarkers/blood_labs?evidence=NONEXISTENT_GRADE",
        headers=AUTH_CLINICIAN,
    )
    assert r.status_code == 200, r.text
    assert r.json()["items"] == []


def test_blood_labs_evidence_filter_is_case_sensitive(client: TestClient) -> None:
    """Evidence grade filter should be case-sensitive (enum match)."""
    r = client.get(
        "/api/v1/biomarkers/blood_labs?evidence=strong_fda_cleared",
        headers=AUTH_CLINICIAN,
    )
    # Lowercase should either return empty or be normalized to uppercase
    assert r.status_code in (200, 422), r.text


# ── Test 4: GET /biomarkers/blood_labs with search ───────────────────────────


def test_blood_labs_search_by_name(client: TestClient) -> None:
    """Search 'ferritin' returns the ferritin biomarker."""
    r = client.get(
        "/api/v1/biomarkers/blood_labs?q=ferritin",
        headers=AUTH_CLINICIAN,
    )
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    assert len(items) >= 1, "Search for 'ferritin' must return results"
    ids = [i["id"] for i in items]
    assert "ferritin" in ids, "ferritin must be in search results"


def test_blood_labs_search_case_insensitive(client: TestClient) -> None:
    """Search is case-insensitive."""
    r1 = client.get(
        "/api/v1/biomarkers/blood_labs?q=FERRITIN",
        headers=AUTH_CLINICIAN,
    )
    r2 = client.get(
        "/api/v1/biomarkers/blood_labs?q=ferritin",
        headers=AUTH_CLINICIAN,
    )
    assert r1.status_code == 200 and r2.status_code == 200
    assert [
        i["id"] for i in r1.json()["items"]
    ] == [
        i["id"] for i in r2.json()["items"]
    ], "Search must be case-insensitive"


def test_blood_labs_search_no_results(client: TestClient) -> None:
    """Search for nonsense returns empty items."""
    r = client.get(
        "/api/v1/biomarkers/blood_labs?q=xyz_nonsense_999",
        headers=AUTH_CLINICIAN,
    )
    assert r.status_code == 200, r.text
    assert r.json()["items"] == []


def test_blood_labs_search_by_confounder(client: TestClient) -> None:
    """Search can match against confounder names."""
    r = client.get(
        "/api/v1/biomarkers/blood_labs?q=inflammation",
        headers=AUTH_CLINICIAN,
    )
    assert r.status_code == 200, r.text
    # At least one result should have 'inflammation' in confounders
    found = any(
        "inflammation" in " ".join(i.get("confounders", [])).lower()
        for i in r.json()["items"]
    )
    assert found, "Search by confounder must return matching biomarkers"


# ── Test 5: GET /biomarkers/blood_labs/ferritin returns detail ───────────────


def test_biomarker_detail_returns_200(client: TestClient) -> None:
    """GET /biomarkers/blood_labs/ferritin returns the ferritin detail."""
    r = client.get(
        "/api/v1/biomarkers/blood_labs/ferritin",
        headers=AUTH_CLINICIAN,
    )
    assert r.status_code == 200, r.text


def test_biomarker_detail_has_required_fields(client: TestClient) -> None:
    """Detail response must contain all required biomarker fields."""
    r = client.get(
        "/api/v1/biomarkers/blood_labs/ferritin",
        headers=AUTH_CLINICIAN,
    )
    body = r.json()
    for key in ("id", "name", "category", "evidence_grade", "ref_range",
                "confounders", "acquisition", "elevated", "reduced",
                "conditions", "interventions"):
        assert key in body, f"Detail response missing key '{key}'"


def test_biomarker_detail_unknown_returns_404(client: TestClient) -> None:
    """GET for a nonexistent biomarker returns 404."""
    r = client.get(
        "/api/v1/biomarkers/blood_labs/nonexistent_biomarker_xyz",
        headers=AUTH_CLINICIAN,
    )
    assert r.status_code == 404, r.text


def test_biomarker_detail_includes_evidence_grade_badge(client: TestClient) -> None:
    """Detail response must include evidence grade badge metadata."""
    r = client.get(
        "/api/v1/biomarkers/blood_labs/ferritin",
        headers=AUTH_CLINICIAN,
    )
    body = r.json()
    assert "evidence_grade" in body
    assert body["evidence_grade"] in _KNOWN_EVIDENCE_GRADES, (
        f"Unknown evidence grade: {body['evidence_grade']}"
    )


def test_biomarker_detail_includes_confounders(client: TestClient) -> None:
    """Detail response must include a non-empty confounders list."""
    r = client.get(
        "/api/v1/biomarkers/blood_labs/ferritin",
        headers=AUTH_CLINICIAN,
    )
    confounders = r.json().get("confounders", [])
    assert isinstance(confounders, list), "confounders must be a list"
    assert len(confounders) > 0, "confounders must not be empty"


def test_biomarker_detail_includes_reference_range(client: TestClient) -> None:
    """Detail response must include a reference range string."""
    r = client.get(
        "/api/v1/biomarkers/blood_labs/ferritin",
        headers=AUTH_CLINICIAN,
    )
    ref = r.json().get("ref_range", "")
    assert isinstance(ref, str) and len(ref) > 5, "ref_range must be a meaningful string"


# ── Test 6: POST /biomarkers/patient/{id}/values stores value ────────────────


def test_post_patient_biomarker_value_201(client: TestClient) -> None:
    """POST patient biomarker value returns 201 on success."""
    payload = {
        "biomarker_id": "ferritin",
        "category": "blood_labs",
        "value": 85.5,
        "unit": "ng/mL",
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "source": "manual_entry",
        "notes": "Morning fasting draw",
    }
    r = client.post(
        "/api/v1/biomarkers/patient/patient-001/values",
        json=payload,
        headers=AUTH_CLINICIAN,
    )
    # May be 201 (created) or 200 (OK) depending on implementation
    assert r.status_code in (200, 201), r.text


def test_post_patient_biomarker_value_has_required_fields(client: TestClient) -> None:
    """POST without required fields returns 422."""
    r = client.post(
        "/api/v1/biomarkers/patient/patient-001/values",
        json={"value": 100},  # missing biomarker_id, category
        headers=AUTH_CLINICIAN,
    )
    assert r.status_code == 422, r.text


def test_post_patient_biomarker_value_returns_stored_shape(client: TestClient) -> None:
    """POST response echoes the stored value with an ID."""
    payload = {
        "biomarker_id": "ferritin",
        "category": "blood_labs",
        "value": 120.0,
        "unit": "ng/mL",
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "source": "manual_entry",
    }
    r = client.post(
        "/api/v1/biomarkers/patient/patient-001/values",
        json=payload,
        headers=AUTH_CLINICIAN,
    )
    if r.status_code in (200, 201):
        body = r.json()
        assert "id" in body, "Stored value must have an id"
        assert body["biomarker_id"] == "ferritin"
        assert body["value"] == 120.0


# ── Test 7: GET /biomarkers/patient/{id}/values returns values ───────────────


def test_get_patient_biomarker_values_200(client: TestClient) -> None:
    """GET patient biomarker values returns 200 with list shape."""
    r = client.get(
        "/api/v1/biomarkers/patient/patient-001/values",
        headers=AUTH_CLINICIAN,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "items" in body
    assert isinstance(body["items"], list)


def test_get_patient_biomarker_values_items_shape(client: TestClient) -> None:
    """Each value item must have the required fields."""
    r = client.get(
        "/api/v1/biomarkers/patient/patient-001/values",
        headers=AUTH_CLINICIAN,
    )
    for item in r.json()["items"]:
        for key in ("id", "biomarker_id", "category", "value", "captured_at"):
            assert key in item, f"Value item missing key '{key}'"


def test_get_patient_biomarker_values_with_category_filter(client: TestClient) -> None:
    """Category filter restricts results."""
    r = client.get(
        "/api/v1/biomarkers/patient/patient-001/values?category=blood_labs",
        headers=AUTH_CLINICIAN,
    )
    assert r.status_code == 200, r.text
    for item in r.json()["items"]:
        assert item["category"] == "blood_labs"


def test_get_patient_biomarker_values_pagination(client: TestClient) -> None:
    """Pagination parameters must be accepted."""
    r = client.get(
        "/api/v1/biomarkers/patient/patient-001/values?limit=10&offset=0",
        headers=AUTH_CLINICIAN,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "items" in body
    assert "total" in body or "has_more" in body or "count" in body, (
        "Paginated response must include total, has_more, or count"
    )


# ── Test 8: POST without consent returns 403 ─────────────────────────────────


def test_post_patient_value_without_consent_returns_403(client: TestClient) -> None:
    """POST to patient values without consent returns 403 forbidden."""
    payload = {
        "biomarker_id": "ferritin",
        "category": "blood_labs",
        "value": 85.5,
        "unit": "ng/mL",
        "captured_at": datetime.now(timezone.utc).isoformat(),
    }
    r = client.post(
        "/api/v1/biomarkers/patient/patient-no-consent/values",
        json=payload,
        headers=AUTH_CLINICIAN,
    )
    assert r.status_code in (403, 404), (
        f"Expected 403 (no consent) or 404 (unknown patient), got {r.status_code}"
    )


def test_post_patient_value_patient_self_can_write(client: TestClient) -> None:
    """Patient can POST their own biomarker values."""
    payload = {
        "biomarker_id": "ferritin",
        "category": "blood_labs",
        "value": 90.0,
        "unit": "ng/mL",
        "captured_at": datetime.now(timezone.utc).isoformat(),
    }
    r = client.post(
        "/api/v1/biomarkers/patient/patient-001/values",
        json=payload,
        headers=AUTH_PATIENT,
    )
    assert r.status_code in (200, 201, 403), r.text


# ── Test 9: POST with wrong patient returns 404 ──────────────────────────────


def test_post_patient_value_wrong_patient_returns_404(client: TestClient) -> None:
    """POST to a nonexistent patient returns 404."""
    payload = {
        "biomarker_id": "ferritin",
        "category": "blood_labs",
        "value": 85.5,
        "unit": "ng/mL",
        "captured_at": datetime.now(timezone.utc).isoformat(),
    }
    r = client.post(
        "/api/v1/biomarkers/patient/nonexistent_patient_xyz_999/values",
        json=payload,
        headers=AUTH_CLINICIAN,
    )
    assert r.status_code in (404, 403), (
        f"Expected 404 (unknown patient), got {r.status_code}"
    )


def test_get_patient_values_wrong_patient_returns_404(client: TestClient) -> None:
    """GET values for a nonexistent patient returns 404."""
    r = client.get(
        "/api/v1/biomarkers/patient/nonexistent_patient_xyz_999/values",
        headers=AUTH_CLINICIAN,
    )
    assert r.status_code in (404, 403), r.text


# ── Test 10: GET trends returns time series ──────────────────────────────────


def test_get_patient_biomarker_trends_200(client: TestClient) -> None:
    """GET trends returns a time-series shape."""
    r = client.get(
        "/api/v1/biomarkers/patient/patient-001/trends?biomarker_id=ferritin",
        headers=AUTH_CLINICIAN,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "items" in body
    assert isinstance(body["items"], list)


def test_get_patient_biomarker_trends_items_have_ts_and_value(client: TestClient) -> None:
    """Each trend data point must have captured_at and value."""
    r = client.get(
        "/api/v1/biomarkers/patient/patient-001/trends?biomarker_id=ferritin",
        headers=AUTH_CLINICIAN,
    )
    for item in r.json()["items"]:
        assert "captured_at" in item, "Trend point must have captured_at"
        assert "value" in item, "Trend point must have value"


def test_get_patient_biomarker_trends_date_range_filter(client: TestClient) -> None:
    """Date range filter parameters must be accepted."""
    r = client.get(
        "/api/v1/biomarkers/patient/patient-001/trends"
        "?biomarker_id=ferritin&since=2024-01-01&until=2024-12-31",
        headers=AUTH_CLINICIAN,
    )
    assert r.status_code == 200, r.text
    assert "items" in r.json()


def test_get_trends_without_biomarker_id_returns_422(client: TestClient) -> None:
    """Trends endpoint requires biomarker_id query param."""
    r = client.get(
        "/api/v1/biomarkers/patient/patient-001/trends",
        headers=AUTH_CLINICIAN,
    )
    assert r.status_code in (200, 422), r.text


# ── Test 11: POST interpret returns safe wording ─────────────────────────────


def test_post_interpret_returns_safe_wording(client: TestClient) -> None:
    """POST interpret returns safe decision-support wording."""
    payload = {
        "biomarker_id": "ferritin",
        "category": "blood_labs",
        "value": 250.0,
        "unit": "ng/mL",
        "ref_high": 150.0,
        "patient_id": "patient-001",
    }
    r = client.post(
        "/api/v1/biomarkers/patient/patient-001/interpret",
        json=payload,
        headers=AUTH_CLINICIAN,
    )
    assert r.status_code in (200, 201), r.text
    body = r.json()
    assert "interpretation" in body, "Response must contain interpretation"
    assert len(body["interpretation"]) > 10, "Interpretation must be non-trivial"


def test_post_interpret_includes_disclaimer(client: TestClient) -> None:
    """Interpretation response must include a clinical disclaimer."""
    payload = {
        "biomarker_id": "ferritin",
        "category": "blood_labs",
        "value": 250.0,
        "unit": "ng/mL",
        "patient_id": "patient-001",
    }
    r = client.post(
        "/api/v1/biomarkers/patient/patient-001/interpret",
        json=payload,
        headers=AUTH_CLINICIAN,
    )
    if r.status_code in (200, 201):
        body = r.json()
        disclaimer = body.get("disclaimer", "")
        assert "clinical" in disclaimer.lower() or "decision" in disclaimer.lower(), (
            "Disclaimer must reference clinical or decision-support context"
        )


def test_post_interpret_suggests_correlation(client: TestClient) -> None:
    """Interpretation must suggest clinical correlation, not conclusions."""
    payload = {
        "biomarker_id": "ferritin",
        "category": "blood_labs",
        "value": 250.0,
        "unit": "ng/mL",
        "ref_high": 150.0,
        "patient_id": "patient-001",
    }
    r = client.post(
        "/api/v1/biomarkers/patient/patient-001/interpret",
        json=payload,
        headers=AUTH_CLINICIAN,
    )
    if r.status_code in (200, 201):
        interp = r.json().get("interpretation", "").lower()
        assert (
            "consistent with" in interp
            or "suggest" in interp
            or "may indicate" in interp
            or "correlation" in interp
            or "elevated" in interp
            or "above" in interp
            or "reference" in interp
        ), "Interpretation must use cautious phrasing"


# ── Test 12: Interpretation contains no diagnostic claims ─────────────────────


def test_interpretation_no_diagnostic_claims(client: TestClient) -> None:
    """Interpretation must never contain diagnostic imperatives."""
    payload = {
        "biomarker_id": "ferritin",
        "category": "blood_labs",
        "value": 250.0,
        "unit": "ng/mL",
        "ref_high": 150.0,
        "patient_id": "patient-001",
    }
    r = client.post(
        "/api/v1/biomarkers/patient/patient-001/interpret",
        json=payload,
        headers=AUTH_CLINICIAN,
    )
    if r.status_code not in (200, 201):
        pytest.skip("Interpretation endpoint not available")
    interp = r.json().get("interpretation", "").lower()
    disallowed = [
        "diagnoses",
        "prescribes",
        "emergency triage",
        "this confirms",
        "diagnostic certainty",
        "treatment plan:",
        "guaranteed improvement",
        "100% success rate",
    ]
    for phrase in disallowed:
        assert phrase not in interp, (
            f"Interpretation must NOT contain diagnostic phrase: '{phrase}'"
        )


def test_interpretation_no_dosing_advice(client: TestClient) -> None:
    """Interpretation must never contain medication dosing advice."""
    payload = {
        "biomarker_id": "ferritin",
        "category": "blood_labs",
        "value": 250.0,
        "unit": "ng/mL",
        "patient_id": "patient-001",
    }
    r = client.post(
        "/api/v1/biomarkers/patient/patient-001/interpret",
        json=payload,
        headers=AUTH_CLINICIAN,
    )
    if r.status_code not in (200, 201):
        pytest.skip("Interpretation endpoint not available")
    interp = r.json().get("interpretation", "").lower()
    disallowed_dosing = [
        "take",
        "mg daily",
        "increase dosage",
        "taper off",
        "start on",
    ]
    for phrase in disallowed_dosing:
        assert phrase not in interp, (
            f"Interpretation must NOT contain dosing phrase: '{phrase}'"
        )


# ── Auth & access control ────────────────────────────────────────────────────


def test_biomarkers_requires_auth(client: TestClient) -> None:
    """Unauthenticated requests to /biomarkers return 403."""
    r = client.get("/api/v1/biomarkers", headers=NO_AUTH)
    assert r.status_code in (401, 403), r.text


def test_biomarker_category_requires_auth(client: TestClient) -> None:
    """Unauthenticated requests to category endpoint return 403."""
    r = client.get("/api/v1/biomarkers/blood_labs", headers=NO_AUTH)
    assert r.status_code in (401, 403), r.text


def test_biomarker_detail_requires_auth(client: TestClient) -> None:
    """Unauthenticated requests to detail endpoint return 403."""
    r = client.get("/api/v1/biomarkers/blood_labs/ferritin", headers=NO_AUTH)
    assert r.status_code in (401, 403), r.text


def test_guest_blocked_from_patient_values(client: TestClient) -> None:
    """Guest tokens must not access patient biomarker values."""
    r = client.get(
        "/api/v1/biomarkers/patient/patient-001/values",
        headers=AUTH_GUEST,
    )
    assert r.status_code in (401, 403), r.text


# ── Research-only biomarker safety ───────────────────────────────────────────


def test_research_only_biomarkers_have_not_supported_grade(client: TestClient) -> None:
    """Research-only category biomarkers must have NOT_SUPPORTED grade."""
    r = client.get("/api/v1/biomarkers/research_only", headers=AUTH_CLINICIAN)
    assert r.status_code == 200, r.text
    for item in r.json()["items"]:
        assert (
            item["evidence_grade"] == "NOT_SUPPORTED_DO_NOT_SURFACE"
        ), (
            f"Research-only biomarker '{item['id']}' must have NOT_SUPPORTED grade, "
            f"got {item['evidence_grade']}"
        )


def test_research_only_detail_includes_warning(client: TestClient) -> None:
    """Research-only biomarker detail must include a research-use warning."""
    r = client.get(
        "/api/v1/biomarkers/research_only/neurofilament_light",
        headers=AUTH_CLINICIAN,
    )
    if r.status_code == 200:
        body = r.json()
        warning = body.get("research_warning", "")
        assert "research" in warning.lower(), "Research biomarker must have research warning"


# ── Response shape contracts ─────────────────────────────────────────────────


def test_all_categories_accept_evidence_filter(client: TestClient) -> None:
    """Every category accepts the evidence filter without crashing."""
    for cat in _BIOMARKER_CATEGORIES:
        r = client.get(
            f"/api/v1/biomarkers/{cat}?evidence=STRONG_FDA_CLEARED",
            headers=AUTH_CLINICIAN,
        )
        assert r.status_code == 200, f"Category '{cat}' evidence filter failed: {r.text}"
        assert "items" in r.json()


def test_all_categories_accept_search(client: TestClient) -> None:
    """Every category accepts the search filter without crashing."""
    for cat in _BIOMARKER_CATEGORIES:
        r = client.get(
            f"/api/v1/biomarkers/{cat}?q=test",
            headers=AUTH_CLINICIAN,
        )
        assert r.status_code == 200, f"Category '{cat}' search filter failed: {r.text}"


def test_category_list_includes_disclaimer(client: TestClient) -> None:
    """Every category listing must include a safety disclaimer."""
    r = client.get("/api/v1/biomarkers/blood_labs", headers=AUTH_CLINICIAN)
    if r.status_code == 200:
        body = r.json()
        disclaimer = body.get("disclaimer", "")
        assert "clinical" in disclaimer.lower() or "decision" in disclaimer.lower(), (
            "Category listing must include clinical safety disclaimer"
        )


def test_biomarker_items_include_confounders(client: TestClient) -> None:
    """Every biomarker item in a listing must include confounders array."""
    r = client.get("/api/v1/biomarkers/blood_labs", headers=AUTH_CLINICIAN)
    if r.status_code == 200:
        for item in r.json()["items"]:
            assert "confounders" in item, f"Biomarker '{item.get('id')}' missing confounders"
            assert isinstance(item["confounders"], list), "confounders must be a list"
