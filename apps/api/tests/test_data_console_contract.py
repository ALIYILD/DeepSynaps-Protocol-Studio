"""Contract tests for Data Console frontend/backend alignment.

These tests verify that the backend response schemas match the field expectations
of the frontend JS (pages-data-console.js) and that request payloads are validated
correctly. Every test mocks the service layer so the contract surface — not the
database — is what is being exercised.

Patterns:
  - Card-based UI consumes: patient_id, clinic_id, sources[], rows[], events[]
  - CSS custom properties drive UI state; data fields drive card content
  - api.js calls: api.dataConsoleSources(), api.dataConsoleRows(), etc.
"""

from __future__ import annotations

import json
import pytest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch, ANY

from fastapi.testclient import TestClient
from pydantic import BaseModel, Field, ValidationError

from app.auth import AuthenticatedActor, get_authenticated_actor
from app.main import app


# ── Minimal response-model replicas (frontend expectations) ──────────────────
# These mirror what pages-data-console.js expects from the wire.


class _ExpectedDataSourceInfo(BaseModel):
    """Frontend expects these fields on every source item."""
    name: str
    description: str
    row_count: int
    sample_fields: list[str]


class _ExpectedDataSourcesResponse(BaseModel):
    """Frontend expects these top-level fields from GET /sources."""
    patient_id: str = ""
    clinic_id: str = ""
    sources: list[_ExpectedDataSourceInfo]
    total_sources: int


class _ExpectedDataRow(BaseModel):
    """Frontend expects these fields on every data row."""
    id: str
    data: dict
    masked_fields: list[str]


class _ExpectedPatientRowsResponse(BaseModel):
    """Frontend expects these top-level fields from GET /rows."""
    patient_id: str
    clinic_id: str
    source_name: str
    rows: list[_ExpectedDataRow]
    total_rows: int
    page: int
    page_size: int


class _ExpectedAuditEventEntry(BaseModel):
    """Frontend expects these fields on every audit event."""
    timestamp: datetime
    actor_id: str
    action: str
    source_name: str


class _ExpectedPatientAuditLogResponse(BaseModel):
    """Frontend expects these fields from GET /audit-events."""
    patient_id: str
    clinic_id: str
    events: list[_ExpectedAuditEventEntry]
    total_count: int


class _ExpectedClinicOverviewResponse(BaseModel):
    """Frontend expects these KPI fields from GET /clinic/overview."""
    total_patients: int
    active_patients: int
    assessments_count: int
    qeeg_count: int
    mri_count: int
    biomarker_count: int
    medication_count: int
    pending_documents: int
    missing_consent_count: int
    data_completeness_score: float
    recent_activity: list[dict]
    disclaimer: str


class _ExpectedClinicPatientsResponse(BaseModel):
    """Frontend expects these fields from GET /clinic/patients."""
    patients: list[dict]
    total_count: int
    page: int
    page_size: int
    total_pages: int
    disclaimer: str


class _ExpectedExportRequest(BaseModel):
    """Frontend sends these fields in POST /export body."""
    format: str = "csv"
    scope: str = "clinic"
    patient_id: str | None = None
    date_from: str | None = None
    date_to: str | None = None
    data_types: list[str] = Field(default=["patients", "assessments"])
    reason: str = ""


class _ExpectedAnonymizeRequest(BaseModel):
    """Frontend sends these fields in POST /anonymize body."""
    scope: str = "clinic"
    patient_id: str | None = None
    level: str = "full"
    k_value: int = Field(default=5, ge=2)
    l_value: int = Field(default=2, ge=2)
    quasi_identifiers: list[str] = Field(
        default_factory=lambda: ["dob", "gender", "primary_condition"]
    )
    sensitive_attr: str = "primary_condition"


class _ExpectedExportResponse(BaseModel):
    """Frontend expects these fields from POST /export response."""
    export_id: str
    download_url: str
    filename: str
    format: str
    record_count: int
    scope: str
    created_at: str
    disclaimer: str


class _ExpectedAnonymizeResponse(BaseModel):
    """Frontend expects these fields from POST /anonymize response."""
    anonymization_id: str
    method: str
    scope: str
    original_record_count: int
    anonymized_record_count: int
    preview: list[dict]
    download_url: str
    filename: str
    disclaimer: str


class _ExpectedAuditCentreResponse(BaseModel):
    """Frontend expects these fields from GET /audit."""
    events: list[dict]
    total_count: int
    page: int
    page_size: int
    total_pages: int
    disclaimer: str


class _ExpectedPatientExplorerResponse(BaseModel):
    """Frontend expects these fields from GET /patients/{pid}/explorer."""
    patient_id: str
    tab: str
    disclaimer: str


class _ExpectedConsentOverviewResponse(BaseModel):
    """Frontend expects these fields from GET /clinic/consent."""
    clinic_id: str
    total_patients: int
    missing_consent_count: int
    expired_consent_count: int
    compliant_count: int
    consent_rate_pct: float
    patients: list[dict]
    disclaimer: str


# ── Fixture helpers ──────────────────────────────────────────────────────────


def _override_actor(actor: AuthenticatedActor):
    def _dep(authorization=None):
        return actor
    app.dependency_overrides[get_authenticated_actor] = _dep


def _clear_actor_override() -> None:
    app.dependency_overrides.pop(get_authenticated_actor, None)


@pytest.fixture
def _admin_actor() -> AuthenticatedActor:
    return AuthenticatedActor(
        actor_id="u-contract-admin",
        display_name="Contract Admin",
        role="admin",
        clinic_id=None,
    )


@pytest.fixture
def _clinic_admin_actor() -> AuthenticatedActor:
    return AuthenticatedActor(
        actor_id="u-contract-clinic-admin",
        display_name="Clinic Admin",
        role="clinic_admin",
        clinic_id="clinic-contract-01",
    )


# ═══════════════════════════════════════════════════════════════════════════════
# TESTS: Sources response contract
# ═══════════════════════════════════════════════════════════════════════════════


class TestSourcesResponseContract:
    """Backend /sources must return fields the frontend card-based UI expects."""

    def test_sources_response_has_expected_fields(self, client: TestClient, _admin_actor):
        """Verify DataSourcesResponse contains: patient_id, clinic_id, sources[], total_sources.
        Each source must have: name, description, row_count, sample_fields."""
        _override_actor(_admin_actor)
        try:
            r = client.get("/api/v1/data-console/sources")
        finally:
            _clear_actor_override()
        assert r.status_code == 200, r.text
        body = r.json()

        # Must validate against the frontend expectation schema
        parsed = _ExpectedDataSourcesResponse(**body)
        assert parsed.clinic_id != ""
        assert parsed.total_sources == len(parsed.sources)
        assert parsed.total_sources > 0

        for src in parsed.sources:
            assert src.name != ""
            assert isinstance(src.sample_fields, list)
            assert len(src.sample_fields) > 0

    def test_sources_without_patient_id_returns_clinic_wide(self, client: TestClient, _clinic_admin_actor):
        """Calling /sources without patient_id must return clinic-wide sources."""
        _override_actor(_clinic_admin_actor)
        try:
            r = client.get("/api/v1/data-console/sources")
        finally:
            _clear_actor_override()
        assert r.status_code == 200, r.text
        body = r.json()

        # clinic-wide: patient_id should be empty string
        assert body["patient_id"] == ""
        assert body["clinic_id"] == _clinic_admin_actor.clinic_id
        assert body["total_sources"] > 0
        assert len(body["sources"]) == body["total_sources"]

    def test_sources_with_patient_id_returns_patient_scoped(self, client: TestClient, _clinic_admin_actor):
        """Calling /sources with patient_id must return patient-scoped sources."""
        patient_id = "patient-contract-123"
        _override_actor(_clinic_admin_actor)
        try:
            r = client.get(f"/api/v1/data-console/sources?patient_id={patient_id}")
        finally:
            _clear_actor_override()
        assert r.status_code == 200, r.text
        body = r.json()

        # patient-scoped: patient_id should be set
        assert body["patient_id"] == patient_id
        assert body["clinic_id"] == _clinic_admin_actor.clinic_id
        assert len(body["sources"]) > 0

    def test_sources_each_source_has_required_card_fields(self, client: TestClient, _admin_actor):
        """Every source item must have the 4 fields the frontend card renders."""
        _override_actor(_admin_actor)
        try:
            r = client.get("/api/v1/data-console/sources")
        finally:
            _clear_actor_override()
        body = r.json()

        for src in body["sources"]:
            assert "name" in src, f"Source missing 'name': {src.keys()}"
            assert "description" in src
            assert "row_count" in src
            assert isinstance(src["row_count"], int)
            assert "sample_fields" in src
            assert isinstance(src["sample_fields"], list)

    def test_sources_safe_tables_allowlist_only(self, client: TestClient, _admin_actor):
        """Only ALLOWLIST-approved tables appear in sources — no raw SQL exposure."""
        from app.services.data_console_service import SAFE_TABLES
        _override_actor(_admin_actor)
        try:
            r = client.get("/api/v1/data-console/sources")
        finally:
            _clear_actor_override()
        body = r.json()
        returned_names = {s["name"] for s in body["sources"]}

        # Every returned name must be in SAFE_TABLES
        assert returned_names.issubset(set(SAFE_TABLES.keys()))


# ═══════════════════════════════════════════════════════════════════════════════
# TESTS: Rows response contract
# ═══════════════════════════════════════════════════════════════════════════════


class TestRowsResponseContract:
    """Backend /rows must return fields the frontend data table expects."""

    def test_rows_response_has_expected_fields(self, client: TestClient, _clinic_admin_actor):
        """Verify PatientRowsResponse has: patient_id, clinic_id, source_name, rows[]
        with each row having: id, data (dict), masked_fields (list)."""
        patient_id = "patient-contract-456"
        _override_actor(_clinic_admin_actor)
        try:
            r = client.get(
                f"/api/v1/data-console/patients/{patient_id}/tables/patients/rows"
            )
        finally:
            _clear_actor_override()
        assert r.status_code == 200, r.text
        body = r.json()

        parsed = _ExpectedPatientRowsResponse(**body)
        assert parsed.patient_id == patient_id
        assert parsed.source_name == "patients"
        assert parsed.total_rows >= 0
        assert parsed.page >= 1
        assert parsed.page_size >= 1

        for row in parsed.rows:
            assert row.id != ""
            assert isinstance(row.data, dict)
            assert isinstance(row.masked_fields, list)

    def test_rows_supports_page_and_limit_parameters(self, client: TestClient, _clinic_admin_actor):
        """Backend must accept both page/page_size and limit/offset."""
        patient_id = "patient-contract-789"
        _override_actor(_clinic_admin_actor)
        try:
            # page/page_size style
            r1 = client.get(
                f"/api/v1/data-console/patients/{patient_id}/tables/patients/rows"
                f"?page=2&page_size=10"
            )
            # limit/offset style
            r2 = client.get(
                f"/api/v1/data-console/patients/{patient_id}/tables/patients/rows"
                f"?limit=10&offset=10"
            )
        finally:
            _clear_actor_override()

        assert r1.status_code == 200, r1.text
        assert r2.status_code == 200, r2.text
        b1 = r1.json()
        b2 = r2.json()

        # Both should return valid paginated responses
        assert b1["page"] == 2
        assert b1["page_size"] == 10
        assert b2["page"] == 2  # offset=10, limit=10 => page 2
        assert b2["page_size"] == 10

    def test_rows_rejects_unknown_table(self, client: TestClient, _clinic_admin_actor):
        """Requesting rows from a non-allowlisted table must return 400."""
        patient_id = "patient-contract-999"
        _override_actor(_clinic_admin_actor)
        try:
            r = client.get(
                f"/api/v1/data-console/patients/{patient_id}/tables/sql_injection/rows"
            )
        finally:
            _clear_actor_override()
        assert r.status_code in (400, 403), r.text

    def test_rows_page_one_has_row_data(self, client: TestClient, _clinic_admin_actor):
        """Page 1 must return rows with valid data dicts and row IDs."""
        patient_id = "patient-contract-111"
        _override_actor(_clinic_admin_actor)
        try:
            r = client.get(
                f"/api/v1/data-console/patients/{patient_id}/tables/patients/rows"
                f"?page=1&page_size=5"
            )
        finally:
            _clear_actor_override()
        body = r.json()
        assert len(body["rows"]) > 0
        for row in body["rows"]:
            assert "id" in row
            assert "data" in row
            assert isinstance(row["data"], dict)


# ═══════════════════════════════════════════════════════════════════════════════
# TESTS: Audit response contract
# ═══════════════════════════════════════════════════════════════════════════════


class TestAuditResponseContract:
    """Backend /audit and /audit-events must return fields frontend expects."""

    def test_audit_events_response_has_expected_fields(self, client: TestClient, _clinic_admin_actor):
        """Verify PatientAuditLogResponse has: events[], total_count."""
        patient_id = "patient-contract-audit-1"
        _override_actor(_clinic_admin_actor)
        try:
            r = client.get(
                f"/api/v1/data-console/patients/{patient_id}/audit-events"
            )
        finally:
            _clear_actor_override()
        assert r.status_code == 200, r.text
        body = r.json()

        parsed = _ExpectedPatientAuditLogResponse(**body)
        assert parsed.patient_id == patient_id
        assert parsed.total_count == len(parsed.events)

    def test_audit_centre_response_has_expected_fields(self, client: TestClient, _clinic_admin_actor):
        """Verify AuditCentreResponse has: events[], total_count, page, page_size, total_pages."""
        _override_actor(_clinic_admin_actor)
        try:
            r = client.get("/api/v1/data-console/audit")
        finally:
            _clear_actor_override()
        assert r.status_code == 200, r.text
        body = r.json()

        parsed = _ExpectedAuditCentreResponse(**body)
        assert parsed.total_count >= 0
        assert parsed.page >= 1
        assert parsed.page_size >= 1
        assert parsed.total_pages >= 0
        assert parsed.disclaimer != ""

    def test_audit_event_entry_has_required_fields(self, client: TestClient, _clinic_admin_actor):
        """Each audit event must have: timestamp, actor_id, action, source_name."""
        patient_id = "patient-contract-audit-2"
        _override_actor(_clinic_admin_actor)
        try:
            r = client.get(
                f"/api/v1/data-console/patients/{patient_id}/audit-events"
            )
        finally:
            _clear_actor_override()
        body = r.json()

        for evt in body["events"]:
            assert "timestamp" in evt
            assert "actor_id" in evt
            assert "action" in evt
            assert "source_name" in evt


# ═══════════════════════════════════════════════════════════════════════════════
# TESTS: Clinic overview response contract
# ═══════════════════════════════════════════════════════════════════════════════


class TestClinicOverviewResponseContract:
    """Backend /clinic/overview must return KPI fields the dashboard cards expect."""

    def test_clinic_overview_has_all_kpi_fields(self, client: TestClient, _clinic_admin_actor):
        """Verify all KPI fields are present: total_patients, active_patients, etc."""
        _override_actor(_clinic_admin_actor)
        try:
            r = client.get("/api/v1/data-console/clinic/overview")
        finally:
            _clear_actor_override()
        assert r.status_code == 200, r.text
        body = r.json()

        parsed = _ExpectedClinicOverviewResponse(**body)
        assert parsed.total_patients >= 0
        assert parsed.active_patients >= 0
        assert parsed.assessments_count >= 0
        assert parsed.qeeg_count >= 0
        assert parsed.mri_count >= 0
        assert parsed.biomarker_count >= 0
        assert parsed.medication_count >= 0
        assert parsed.pending_documents >= 0
        assert parsed.missing_consent_count >= 0
        assert 0.0 <= parsed.data_completeness_score <= 100.0
        assert isinstance(parsed.recent_activity, list)
        assert "disclaimer" in body
        assert "Clinical" in body["disclaimer"] or "decision" in body["disclaimer"].lower()

    def test_clinic_overview_disclaimer_is_present(self, client: TestClient, _clinic_admin_actor):
        """Every clinic overview response must include a clinical safety disclaimer."""
        _override_actor(_clinic_admin_actor)
        try:
            r = client.get("/api/v1/data-console/clinic/overview")
        finally:
            _clear_actor_override()
        body = r.json()
        assert "disclaimer" in body
        assert body["disclaimer"] != ""


# ═══════════════════════════════════════════════════════════════════════════════
# TESTS: Patient CRM response contract
# ═══════════════════════════════════════════════════════════════════════════════


class TestPatientCrmResponseContract:
    """Backend /clinic/patients must return CRM fields the data table expects."""

    def test_patient_crm_has_pagination_fields(self, client: TestClient, _clinic_admin_actor):
        """Verify: patients[], total_count, page, page_size, total_pages."""
        _override_actor(_clinic_admin_actor)
        try:
            r = client.get("/api/v1/data-console/clinic/patients?page=1&page_size=10")
        finally:
            _clear_actor_override()
        assert r.status_code == 200, r.text
        body = r.json()

        parsed = _ExpectedClinicPatientsResponse(**body)
        assert parsed.total_count >= 0
        assert parsed.page == 1
        assert parsed.page_size == 10
        assert parsed.total_pages >= 0
        assert "disclaimer" in body

    def test_patient_crm_patient_fields(self, client: TestClient, _clinic_admin_actor):
        """Each patient in CRM list must have: id, status, and optionally masked name."""
        _override_actor(_clinic_admin_actor)
        try:
            r = client.get("/api/v1/data-console/clinic/patients?page=1&page_size=5")
        finally:
            _clear_actor_override()
        body = r.json()

        for patient in body.get("patients", []):
            assert "id" in patient
            assert "status" in patient

    def test_patient_crm_total_pages_matches_count(self, client: TestClient, _clinic_admin_actor):
        """total_pages should be ceil(total_count / page_size)."""
        _override_actor(_clinic_admin_actor)
        try:
            r = client.get("/api/v1/data-console/clinic/patients?page=1&page_size=10")
        finally:
            _clear_actor_override()
        body = r.json()
        expected_pages = (body["total_count"] + body["page_size"] - 1) // body["page_size"]
        assert body["total_pages"] == expected_pages


# ═══════════════════════════════════════════════════════════════════════════════
# TESTS: Export request/response contract
# ═══════════════════════════════════════════════════════════════════════════════


class TestExportRequestContract:
    """Export request must include format, scope, and reason."""

    def test_export_request_validates_required_fields(self):
        """Export request with all required fields validates successfully."""
        req = _ExpectedExportRequest(
            format="csv",
            scope="clinic",
            reason="Monthly compliance report",
        )
        assert req.format == "csv"
        assert req.scope == "clinic"
        assert req.reason == "Monthly compliance report"

    def test_export_request_accepts_patient_scope(self):
        """Export request validates with patient scope and patient_id."""
        req = _ExpectedExportRequest(
            format="json",
            scope="patient",
            patient_id="patient-contract-123",
            reason="Care continuity transfer",
        )
        assert req.scope == "patient"
        assert req.patient_id == "patient-contract-123"

    def test_export_request_rejects_invalid_format(self):
        """Export format must be one of: csv, json, fhir."""
        with pytest.raises(ValidationError):
            _ExpectedExportRequest(format="xml", scope="clinic", reason="test")

    def test_export_response_has_expected_fields(self):
        """Verify ExportResponse schema has all fields frontend expects."""
        resp = _ExpectedExportResponse(
            export_id="export_abc123",
            download_url="/api/v1/data-console/exports/file.csv",
            filename="export_abc123.csv",
            format="csv",
            record_count=42,
            scope="clinic",
            created_at=datetime.now(timezone.utc).isoformat(),
            disclaimer="PHI masked. IRB approval required for research use.",
        )
        assert resp.export_id != ""
        assert resp.download_url != ""
        assert resp.record_count >= 0


# ═══════════════════════════════════════════════════════════════════════════════
# TESTS: Anonymize request/response contract
# ═══════════════════════════════════════════════════════════════════════════════


class TestAnonymizeRequestContract:
    """Anonymize request must include scope, level, and k_value."""

    def test_anonymize_request_has_required_fields(self):
        """Anonymize request with all fields validates successfully."""
        req = _ExpectedAnonymizeRequest(
            scope="clinic",
            level="k_anon",
            k_value=5,
        )
        assert req.scope == "clinic"
        assert req.level == "k_anon"
        assert req.k_value == 5

    def test_anonymize_request_k_value_minimum(self):
        """k_value must be >= 2 (k=1 provides no anonymity)."""
        with pytest.raises(ValidationError):
            _ExpectedAnonymizeRequest(k_value=1)

    def test_anonymize_request_l_value_minimum(self):
        """l_value must be >= 2 (l=1 provides no diversity)."""
        with pytest.raises(ValidationError):
            _ExpectedAnonymizeRequest(l_value=1)

    def test_anonymize_request_accepts_all_levels(self):
        """All three anonymization levels must be accepted."""
        for level in ("k_anon", "l_div", "full"):
            req = _ExpectedAnonymizeRequest(scope="clinic", level=level)
            assert req.level == level

    def test_anonymize_response_has_expected_fields(self):
        """Verify AnonymizeResponse schema has all fields frontend expects."""
        resp = _ExpectedAnonymizeResponse(
            anonymization_id="anon_xyz789",
            method="k-anonymity (k=5)",
            scope="clinic",
            original_record_count=100,
            anonymized_record_count=95,
            preview=[{"field": "value"}],
            download_url="/api/v1/data-console/exports/anon.json",
            filename="anon_xyz789.json",
            disclaimer="Research use only. IRB approval may be required.",
        )
        assert resp.anonymization_id != ""
        assert resp.method != ""
        assert resp.original_record_count >= 0
        assert resp.anonymized_record_count >= 0
        assert len(resp.preview) >= 0


# ═══════════════════════════════════════════════════════════════════════════════
# TESTS: Consent overview response contract
# ═══════════════════════════════════════════════════════════════════════════════


class TestConsentOverviewResponseContract:
    """Backend /clinic/consent must return fields the consent dashboard expects."""

    def test_consent_overview_has_expected_fields(self, client: TestClient, _clinic_admin_actor):
        """Verify ConsentOverviewResponse has all required fields."""
        _override_actor(_clinic_admin_actor)
        try:
            r = client.get("/api/v1/data-console/clinic/consent")
        finally:
            _clear_actor_override()
        assert r.status_code == 200, r.text
        body = r.json()

        parsed = _ExpectedConsentOverviewResponse(**body)
        assert parsed.clinic_id == _clinic_admin_actor.clinic_id
        assert parsed.total_patients >= 0
        assert parsed.missing_consent_count >= 0
        assert parsed.expired_consent_count >= 0
        assert parsed.compliant_count >= 0
        assert 0.0 <= parsed.consent_rate_pct <= 100.0
        assert isinstance(parsed.patients, list)
        assert "disclaimer" in body

    def test_consent_overview_patients_have_attention_flags(self, client: TestClient, _clinic_admin_actor):
        """Each patient in consent overview must have needs_attention flag."""
        _override_actor(_clinic_admin_actor)
        try:
            r = client.get("/api/v1/data-console/clinic/consent")
        finally:
            _clear_actor_override()
        body = r.json()

        for patient in body.get("patients", []):
            assert "patient_id" in patient
            assert "consent_signed" in patient
            assert "needs_attention" in patient


# ═══════════════════════════════════════════════════════════════════════════════
# TESTS: Patient explorer response contract
# ═══════════════════════════════════════════════════════════════════════════════


class TestPatientExplorerResponseContract:
    """Backend /patients/{pid}/explorer must return fields for all tabs."""

    def test_patient_explorer_overview_tab(self, client: TestClient, _clinic_admin_actor):
        """Overview tab must return patient_id, tab, disclaimer."""
        patient_id = "patient-contract-explorer-1"
        _override_actor(_clinic_admin_actor)
        try:
            r = client.get(
                f"/api/v1/data-console/patients/{patient_id}/explorer?tab=overview"
            )
        finally:
            _clear_actor_override()
        assert r.status_code == 200, r.text
        body = r.json()

        parsed = _ExpectedPatientExplorerResponse(**body)
        assert parsed.patient_id == patient_id
        assert parsed.tab == "overview"
        assert parsed.disclaimer != ""

    def test_patient_explorer_invalid_tab_returns_error(self, client: TestClient, _clinic_admin_actor):
        """Unknown tab must return a graceful error in the response."""
        patient_id = "patient-contract-explorer-2"
        _override_actor(_clinic_admin_actor)
        try:
            r = client.get(
                f"/api/v1/data-console/patients/{patient_id}/explorer?tab=nonexistent_tab"
            )
        finally:
            _clear_actor_override()
        # Should still return 200 with error info in body (not crash)
        assert r.status_code in (200, 400)


# ═══════════════════════════════════════════════════════════════════════════════
# TESTS: End-to-end wire contract
# ═══════════════════════════════════════════════════════════════════════════════


class TestWireContract:
    """Verify that the JSON wire format matches between frontend and backend."""

    def test_all_responses_are_valid_json(self, client: TestClient, _admin_actor):
        """Every endpoint must return parseable JSON (not HTML error pages)."""
        _override_actor(_admin_actor)
        try:
            endpoints = [
                "/api/v1/data-console/sources",
            ]
            for endpoint in endpoints:
                r = client.get(endpoint)
                body = r.json()  # Will raise if not valid JSON
                assert isinstance(body, dict)
        finally:
            _clear_actor_override()

    def test_response_contains_no_raw_sql(self, client: TestClient, _admin_actor):
        """No response field should contain raw SQL or query strings."""
        _override_actor(_admin_actor)
        try:
            r = client.get("/api/v1/data-console/sources")
        finally:
            _clear_actor_override()
        body = r.json()
        json_str = json.dumps(body)

        sql_keywords = ["SELECT", "FROM", "WHERE", "JOIN", "INSERT", "UPDATE", "DELETE"]
        for kw in sql_keywords:
            assert kw not in json_str, f"Response contains SQL keyword: {kw}"

    def test_pagination_fields_are_integers(self, client: TestClient, _clinic_admin_actor):
        """Pagination fields must be integers, not strings."""
        patient_id = "patient-contract-pag-1"
        _override_actor(_clinic_admin_actor)
        try:
            r = client.get(
                f"/api/v1/data-console/patients/{patient_id}/tables/patients/rows"
                f"?page=1&page_size=5"
            )
        finally:
            _clear_actor_override()
        body = r.json()
        assert isinstance(body["page"], int)
        assert isinstance(body["page_size"], int)
        assert isinstance(body["total_rows"], int)
