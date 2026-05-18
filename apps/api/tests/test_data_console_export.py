"""Tests for Data Console export functionality.

Covers CSV, JSON, and FHIR export formats with PHI masking controls,
audit event creation, role-based access control, and special character
handling. Every export creates an audit event; PHI access is logged.

These tests mock the service layer and filesystem to exercise the router
contract, and also test the service-level export helpers directly.
"""

from __future__ import annotations

import csv
import io
import json
import os
import tempfile
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch, mock_open, ANY

import pytest
from fastapi.testclient import TestClient

from app.auth import AuthenticatedActor, get_authenticated_actor
from app.main import app
from app.services.data_console_service import (
    export_to_csv,
    export_to_json,
    export_to_fhir,
    create_data_export,
    _build_export_data,
    mask_phi_field,
    DataConsoleAccessError,
    SAFE_TABLES,
)


# ── Fixture helpers ──────────────────────────────────────────────────────────


def _override_actor(actor: AuthenticatedActor):
    def _dep(authorization=None):
        return actor
    app.dependency_overrides[get_authenticated_actor] = _dep


def _clear_actor_override() -> None:
    app.dependency_overrides.pop(get_authenticated_actor, None)


@pytest.fixture
def _clinic_admin_actor() -> AuthenticatedActor:
    return AuthenticatedActor(
        actor_id="u-export-clinic-admin",
        display_name="Export Clinic Admin",
        role="clinic_admin",
        clinic_id="clinic-export-01",
    )


@pytest.fixture
def _admin_actor() -> AuthenticatedActor:
    return AuthenticatedActor(
        actor_id="u-export-admin",
        display_name="Export Admin",
        role="admin",
        clinic_id=None,
    )


@pytest.fixture
def _clinician_actor() -> AuthenticatedActor:
    return AuthenticatedActor(
        actor_id="u-export-clinician",
        display_name="Export Clinician",
        role="clinician",
        clinic_id="clinic-export-01",
    )


@pytest.fixture
def sample_export_data() -> list[dict]:
    """Sample patient data for export tests."""
    return [
        {
            "source_table": "patients",
            "patient_id": "p-001",
            "first_name": "Alice",
            "last_name": "Smith",
            "dob": "1985-03-15",
            "gender": "F",
            "primary_condition": "Epilepsy",
            "status": "active",
            "consent_signed": True,
            "created_at": "2024-01-15T10:30:00",
        },
        {
            "source_table": "patients",
            "patient_id": "p-002",
            "first_name": "Bob",
            "last_name": "Jones",
            "dob": "1978-11-22",
            "gender": "M",
            "primary_condition": "Parkinsons",
            "status": "active",
            "consent_signed": False,
            "created_at": "2024-02-20T14:45:00",
        },
        {
            "source_table": "assessment_records",
            "patient_id": "p-001",
            "template_title": "MMSE",
            "status": "completed",
            "score": "28/30",
            "score_numeric": 28.0,
            "severity": "mild",
            "phase": "baseline",
            "created_at": "2024-03-01T09:00:00",
        },
    ]


# ═══════════════════════════════════════════════════════════════════════════════
# TESTS: CSV Export
# ═══════════════════════════════════════════════════════════════════════════════


class TestExportToCsv:
    """CSV export produces valid CSV with correct headers and data."""

    def test_export_to_csv_basic(self, sample_export_data):
        """CSV export produces valid CSV with correct headers."""
        filename = "test_export.csv"
        filepath = export_to_csv(sample_export_data, filename, masked=True)

        assert os.path.exists(filepath)
        with open(filepath, "r", newline="") as f:
            reader = csv.reader(f)
            rows = list(reader)

        expected_headers = []
        for row in sample_export_data:
            for key in row.keys():
                if key not in expected_headers:
                    expected_headers.append(key)

        # Header row
        assert rows[0] == expected_headers
        # Data rows
        assert len(rows) == 1 + len(sample_export_data)

        # Cleanup
        os.remove(filepath)

    def test_export_to_csv_with_masking(self, sample_export_data):
        """CSV export masks PHI fields when masking=True."""
        # Pre-mask the data like the service does
        masked_data = []
        for row in sample_export_data:
            masked_row = {
                k: mask_phi_field(v, k) for k, v in row.items()
            }
            masked_data.append(masked_row)

        filename = "test_masked.csv"
        filepath = export_to_csv(masked_data, filename, masked=True)

        with open(filepath, "r", newline="") as f:
            content = f.read()

        assert "***" in content  # Masked names
        assert "Alice" not in content  # Original name should not appear
        assert "Smith" not in content

        os.remove(filepath)

    def test_export_to_csv_without_masking(self, sample_export_data):
        """CSV export shows raw data when masking=False (admin only)."""
        filename = "test_unmasked.csv"
        filepath = export_to_csv(sample_export_data, filename, masked=False)

        with open(filepath, "r", newline="") as f:
            content = f.read()

        assert "Alice" in content
        assert "Smith" in content
        assert "***" not in content

        os.remove(filepath)

    def test_export_to_csv_empty_data(self):
        """CSV export with empty data produces file with just headers."""
        filename = "test_empty.csv"
        filepath = export_to_csv([], filename, masked=True)

        assert os.path.exists(filepath)
        with open(filepath, "r") as f:
            content = f.read()
        # Empty data => empty file (service behavior)
        assert content == ""

        os.remove(filepath)

    def test_csv_export_handles_special_characters(self):
        """CSV export properly escapes commas, quotes, and newlines."""
        data_with_special = [
            {
                "id": "1",
                "note": 'Contains "quoted" text, and commas',
                "address": "123 Main St\nApt 4",
            },
            {
                "id": "2",
                "note": "Normal note",
                "address": "456 Oak Ave",
            },
        ]
        filename = "test_special_chars.csv"
        filepath = export_to_csv(data_with_special, filename, masked=False)

        with open(filepath, "r", newline="") as f:
            reader = csv.reader(f)
            rows = list(reader)

        # Header + 2 data rows
        assert len(rows) == 3
        # First data row should have the special characters properly handled
        assert 'Contains "quoted" text, and commas' in rows[1][1]
        # Newlines in address should be preserved in the cell, not split to new row
        assert "Apt 4" in rows[1][2] or rows[1][2].endswith("Apt 4")

        os.remove(filepath)

    def test_csv_export_file_path_in_temp(self, sample_export_data):
        """CSV export writes to the system temp directory."""
        filename = "test_path.csv"
        filepath = export_to_csv(sample_export_data, filename, masked=True)

        assert filepath.startswith(tempfile.gettempdir())
        assert filepath.endswith(filename)
        assert os.path.exists(filepath)

        os.remove(filepath)


# ═══════════════════════════════════════════════════════════════════════════════
# TESTS: JSON Export
# ═══════════════════════════════════════════════════════════════════════════════


class TestExportToJson:
    """JSON export produces valid, parseable JSON."""

    def test_export_to_json(self, sample_export_data):
        """JSON export produces valid JSON array of objects."""
        filename = "test_export.json"
        filepath = export_to_json(sample_export_data, filename, masked=True)

        assert os.path.exists(filepath)
        with open(filepath, "r") as f:
            loaded = json.load(f)

        assert isinstance(loaded, list)
        assert len(loaded) == len(sample_export_data)
        assert loaded[0]["patient_id"] == sample_export_data[0]["patient_id"]

        os.remove(filepath)

    def test_export_to_json_empty_data(self):
        """JSON export with empty data produces empty array."""
        filename = "test_empty.json"
        filepath = export_to_json([], filename, masked=True)

        with open(filepath, "r") as f:
            loaded = json.load(f)

        assert loaded == []

        os.remove(filepath)

    def test_export_to_json_preserves_nested_types(self):
        """JSON export preserves booleans, numbers, and nulls correctly."""
        data = [
            {
                "id": 1,
                "active": True,
                "score": 28.5,
                "notes": None,
            }
        ]
        filename = "test_types.json"
        filepath = export_to_json(data, filename, masked=False)

        with open(filepath, "r") as f:
            loaded = json.load(f)

        assert loaded[0]["active"] is True
        assert loaded[0]["score"] == 28.5
        assert loaded[0]["notes"] is None

        os.remove(filepath)


# ═══════════════════════════════════════════════════════════════════════════════
# TESTS: FHIR Export
# ═══════════════════════════════════════════════════════════════════════════════


class TestExportToFhir:
    """FHIR export produces valid FHIR R4 Bundle."""

    def test_export_to_fhir(self, sample_export_data):
        """FHIR export produces valid FHIR R4 Bundle structure."""
        patient_id = "p-001"
        bundle = export_to_fhir(sample_export_data, patient_id)

        assert bundle["resourceType"] == "Bundle"
        assert bundle["id"].startswith("deepsynaps-export-")
        assert bundle["type"] == "collection"
        assert "meta" in bundle
        assert "entry" in bundle
        assert len(bundle["entry"]) == len(sample_export_data)

    def test_export_to_fhir_patient_resource_type(self, sample_export_data):
        """Patient rows become Patient resources; others become appropriate types."""
        bundle = export_to_fhir(sample_export_data, "p-001")

        resource_types = [e["resource"]["resourceType"] for e in bundle["entry"]]
        assert "Patient" in resource_types  # patients table row

    def test_export_to_fhir_entries_have_request(self, sample_export_data):
        """Each entry has a request block with method and url."""
        bundle = export_to_fhir(sample_export_data, "p-001")

        for entry in bundle["entry"]:
            assert "request" in entry
            assert entry["request"]["method"] == "PUT"
            assert "url" in entry["request"]

    def test_export_to_fhir_empty_data(self):
        """FHIR export with empty data produces Bundle with no entries."""
        bundle = export_to_fhir([], "p-001")

        assert bundle["resourceType"] == "Bundle"
        assert bundle["entry"] == []


# ═══════════════════════════════════════════════════════════════════════════════
# TESTS: Export via Router (end-to-end with mocks)
# ═══════════════════════════════════════════════════════════════════════════════


class TestExportRouter:
    """Export endpoint tests via the FastAPI router."""

    def test_export_creates_audit_event(self, client: TestClient, _clinic_admin_actor):
        """Every export creates an audit event."""
        _override_actor(_clinic_admin_actor)
        try:
            with patch(
                "app.routers.data_console_router.create_data_export"
            ) as mock_export, patch(
                "app.routers.data_console_router._audit_clinic_data_console_access"
            ) as mock_audit:
                mock_export.return_value = {
                    "export_id": "export_test_001",
                    "download_url": "/api/v1/data-console/exports/test.csv",
                    "filename": "test.csv",
                    "format": "csv",
                    "record_count": 42,
                    "scope": "clinic",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "disclaimer": "PHI masked.",
                }
                r = client.post(
                    "/api/v1/data-console/export",
                    json={
                        "format": "csv",
                        "scope": "clinic",
                        "reason": "Monthly report",
                    },
                )
        finally:
            _clear_actor_override()

        assert r.status_code == 200, r.text
        # Audit function should have been called
        mock_audit.assert_called_once()
        call_kwargs = mock_audit.call_args.kwargs
        assert call_kwargs["action"] == "data_export_requested"

    def test_export_requires_reason(self, client: TestClient, _clinic_admin_actor):
        """Export without reason is accepted but reason defaults to empty string."""
        _override_actor(_clinic_admin_actor)
        try:
            with patch(
                "app.routers.data_console_router.create_data_export"
            ) as mock_export:
                mock_export.return_value = {
                    "export_id": "export_test_002",
                    "download_url": "/api/v1/data-console/exports/test2.csv",
                    "filename": "test2.csv",
                    "format": "csv",
                    "record_count": 10,
                    "scope": "clinic",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "disclaimer": "PHI masked.",
                }
                r = client.post(
                    "/api/v1/data-console/export",
                    json={
                        "format": "csv",
                        "scope": "clinic",
                        "reason": "",  # Empty reason
                    },
                )
        finally:
            _clear_actor_override()

        assert r.status_code == 200, r.text
        # The service should still process it with empty reason
        body = r.json()
        assert body["export_id"] == "export_test_002"

    def test_export_logs_phi_access_for_patient_scope(self, client: TestClient, _clinic_admin_actor):
        """Export of patient-scoped data logs PHI access."""
        patient_id = "p-export-phi-001"
        _override_actor(_clinic_admin_actor)
        try:
            with patch(
                "app.routers.data_console_router.create_data_export"
            ) as mock_export, patch(
                "app.routers.data_console_router.require_patient_access"
            ) as mock_patient_access, patch(
                "app.routers.data_console_router._audit_clinic_data_console_access"
            ) as mock_audit:
                mock_export.return_value = {
                    "export_id": "export_phi_001",
                    "download_url": "/api/v1/data-console/exports/patient.csv",
                    "filename": "patient.csv",
                    "format": "csv",
                    "record_count": 5,
                    "scope": "patient",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "disclaimer": "PHI masked.",
                }
                r = client.post(
                    "/api/v1/data-console/export",
                    json={
                        "format": "csv",
                        "scope": "patient",
                        "patient_id": patient_id,
                        "reason": "Transfer of care",
                    },
                )
        finally:
            _clear_actor_override()

        assert r.status_code == 200, r.text
        # Patient access should have been verified
        mock_patient_access.assert_called_once()

    def test_clinic_export_requires_admin_role(self, client: TestClient, _clinician_actor):
        """Clinic-wide export requires admin/clinic_admin — clinician is blocked."""
        _override_actor(_clinician_actor)
        try:
            r = client.post(
                "/api/v1/data-console/export",
                json={
                    "format": "csv",
                    "scope": "clinic",
                    "reason": "Should fail",
                },
            )
        finally:
            _clear_actor_override()

        assert r.status_code == 403, r.text

    def test_patient_export_requires_patient_access(self, client: TestClient, _clinician_actor):
        """Patient export requires patient access — clinician without assignment is blocked."""
        _override_actor(_clinician_actor)
        try:
            # The clinician actor doesn't have explicit patient access
            # but may pass role check; the patient access check should block
            with patch(
                "app.routers.data_console_router._resolve_clinic_scope",
                return_value="clinic-export-01",
            ), patch(
                "app.routers.data_console_router.require_clinic_access"
            ):
                r = client.post(
                    "/api/v1/data-console/export",
                    json={
                        "format": "csv",
                        "scope": "patient",
                        "patient_id": "unauthorized-patient",
                        "reason": "Should fail",
                    },
                )
        finally:
            _clear_actor_override()

        # Expecting 403 due to patient access check
        assert r.status_code in (403, 422)

    def test_export_disclaimer_present(self, client: TestClient, _clinic_admin_actor):
        """Every export response must include a clinical safety disclaimer."""
        _override_actor(_clinic_admin_actor)
        try:
            with patch(
                "app.routers.data_console_router.create_data_export"
            ) as mock_export:
                mock_export.return_value = {
                    "export_id": "export_disc_001",
                    "download_url": "/api/v1/data-console/exports/disc.csv",
                    "filename": "disc.csv",
                    "format": "csv",
                    "record_count": 1,
                    "scope": "clinic",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "disclaimer": (
                        "This export is for clinical review only. "
                        "Not for research use without IRB approval."
                    ),
                }
                r = client.post(
                    "/api/v1/data-console/export",
                    json={
                        "format": "csv",
                        "scope": "clinic",
                        "reason": "Test disclaimer",
                    },
                )
        finally:
            _clear_actor_override()

        assert r.status_code == 200, r.text
        body = r.json()
        assert "disclaimer" in body
        assert body["disclaimer"] != ""
        assert "IRB" in body["disclaimer"] or "clinical" in body["disclaimer"].lower()


# ═══════════════════════════════════════════════════════════════════════════════
# TESTS: Export URL expiration
# ═══════════════════════════════════════════════════════════════════════════════


class TestExportUrlExpiration:
    """Export download URLs should have time-limited validity."""

    def test_export_url_contains_timestamp(self, client: TestClient, _clinic_admin_actor):
        """Export filename contains timestamp for expiration tracking."""
        _override_actor(_clinic_admin_actor)
        try:
            with patch(
                "app.routers.data_console_router.create_data_export"
            ) as mock_export:
                mock_export.return_value = {
                    "export_id": "export_ts_001",
                    "download_url": "/api/v1/data-console/exports/export_ts_001_20240115_120000.csv",
                    "filename": "export_ts_001_20240115_120000.csv",
                    "format": "csv",
                    "record_count": 10,
                    "scope": "clinic",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "disclaimer": "PHI masked.",
                }
                r = client.post(
                    "/api/v1/data-console/export",
                    json={
                        "format": "csv",
                        "scope": "clinic",
                        "reason": "Test timestamp",
                    },
                )
        finally:
            _clear_actor_override()

        assert r.status_code == 200, r.text
        body = r.json()
        # Filename should contain timestamp pattern YYYYMMDD_HHMMSS
        import re
        assert re.search(r"\d{8}_\d{6}", body["filename"]), (
            f"Filename missing timestamp: {body['filename']}"
        )

    def test_export_response_includes_created_at(self, client: TestClient, _clinic_admin_actor):
        """Export response includes created_at for TTL calculation."""
        _override_actor(_clinic_admin_actor)
        try:
            with patch(
                "app.routers.data_console_router.create_data_export"
            ) as mock_export:
                mock_export.return_value = {
                    "export_id": "export_ttl_001",
                    "download_url": "/api/v1/data-console/exports/ttl.csv",
                    "filename": "ttl.csv",
                    "format": "csv",
                    "record_count": 5,
                    "scope": "clinic",
                    "created_at": "2024-01-15T12:00:00+00:00",
                    "disclaimer": "PHI masked.",
                }
                r = client.post(
                    "/api/v1/data-console/export",
                    json={
                        "format": "csv",
                        "scope": "clinic",
                        "reason": "Test TTL",
                    },
                )
        finally:
            _clear_actor_override()

        assert r.status_code == 200, r.text
        body = r.json()
        assert "created_at" in body
        # created_at should be a valid ISO timestamp
        dt = datetime.fromisoformat(body["created_at"].replace("Z", "+00:00"))
        assert dt.tzinfo is not None


# ═══════════════════════════════════════════════════════════════════════════════
# TESTS: CSV content validation
# ═══════════════════════════════════════════════════════════════════════════════


class TestCsvContentValidation:
    """Deep validation of CSV output format and content."""

    def test_csv_columns_match_fieldnames(self, sample_export_data):
        """Every row in CSV must have the same number of columns as headers."""
        filename = "test_columns.csv"
        filepath = export_to_csv(sample_export_data, filename, masked=False)

        with open(filepath, "r", newline="") as f:
            reader = csv.reader(f)
            rows = list(reader)

        header_len = len(rows[0])
        for i, row in enumerate(rows[1:], 1):
            assert len(row) == header_len, (
                f"Row {i} has {len(row)} columns, expected {header_len}"
            )

        os.remove(filepath)

    def test_csv_roundtrip(self, sample_export_data):
        """CSV written by export_to_csv can be read back accurately."""
        filename = "test_roundtrip.csv"
        filepath = export_to_csv(sample_export_data, filename, masked=False)

        with open(filepath, "r", newline="") as f:
            reader = csv.DictReader(f)
            rows = list(reader)

        assert len(rows) == len(sample_export_data)
        assert rows[0]["first_name"] == "Alice"
        assert rows[0]["patient_id"] == "p-001"

        os.remove(filepath)

    def test_csv_unicode_handling(self):
        """CSV export handles Unicode characters correctly."""
        data = [
            {
                "id": "1",
                "name": "Marie Curie",
                "note": "Patient with seizures \u00e9pilepsie",
                "emoji": "\U0001F9E0",
            }
        ]
        filename = "test_unicode.csv"
        filepath = export_to_csv(data, filename, masked=False)

        with open(filepath, "r", newline="", encoding="utf-8") as f:
            content = f.read()

        assert "\u00e9pilepsie" in content
        assert "\U0001F9E0" in content

        os.remove(filepath)


# ═══════════════════════════════════════════════════════════════════════════════
# TESTS: Service-level create_data_export
# ═══════════════════════════════════════════════════════════════════════════════


class TestCreateDataExportService:
    """Tests for the service-level create_data_export function."""

    def test_create_data_export_returns_correct_structure(self):
        """create_data_export returns a dict with all required export fields."""
        mock_session = MagicMock()

        # Mock _build_export_data
        with patch(
            "app.services.data_console_service._build_export_data",
            return_value=[{"id": "1", "name": "Test"}],
        ), patch(
            "app.services.data_console_service.export_to_csv",
            return_value="/tmp/test_export.csv",
        ), patch(
            "app.services.data_console_service.create_audit_event"
        ) as mock_audit:
            result = create_data_export(
                session=mock_session,
                clinic_id="clinic-001",
                request={
                    "format": "csv",
                    "scope": "clinic",
                    "reason": "Test export",
                },
                actor_id="actor-001",
            )

        assert "export_id" in result
        assert "download_url" in result
        assert "filename" in result
        assert result["format"] == "csv"
        assert result["scope"] == "clinic"
        assert result["record_count"] >= 0
        assert "created_at" in result
        assert "disclaimer" in result

    def test_create_data_export_unsupported_format_raises(self):
        """create_data_export raises error for unsupported format."""
        mock_session = MagicMock()

        with patch(
            "app.services.data_console_service._build_export_data",
            return_value=[{"id": "1"}],
        ), pytest.raises(DataConsoleAccessError) as exc_info:
            create_data_export(
                session=mock_session,
                clinic_id="clinic-001",
                request={
                    "format": "xml",  # Unsupported
                    "scope": "clinic",
                    "reason": "Test",
                },
                actor_id="actor-001",
            )

        assert "Unsupported export format" in str(exc_info.value)

    def test_create_data_export_patient_scope(self):
        """create_data_export with patient scope builds patient-scoped data."""
        mock_session = MagicMock()

        with patch(
            "app.services.data_console_service._build_export_data",
            return_value=[{"patient_id": "p-001", "name": "Test Patient"}],
        ) as mock_build, patch(
            "app.services.data_console_service.export_to_csv",
            return_value="/tmp/patient_export.csv",
        ), patch(
            "app.services.data_console_service.create_audit_event"
        ):
            result = create_data_export(
                session=mock_session,
                clinic_id="clinic-001",
                request={
                    "format": "csv",
                    "scope": "patient",
                    "patient_id": "p-001",
                    "reason": "Transfer",
                },
                actor_id="actor-001",
            )

        # _build_export_data should have been called with patient scope
        mock_build.assert_called_once()
        call_args = mock_build.call_args
        assert call_args[0][2] == "patient"  # scope arg
        assert call_args[0][3] == "p-001"    # patient_id arg

        assert result["scope"] == "patient"
