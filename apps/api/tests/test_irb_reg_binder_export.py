"""Unit tests for app.services.irb_reg_binder_export.

Tests cover: helper serialisers, cover-page text, ZIP structure,
IDOR guard, and reg_binder_filename.  DB interactions are mocked.
"""

from __future__ import annotations

import io
import json
import zipfile
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

from app.errors import ApiServiceError
from app.services.irb_reg_binder_export import (
    _amendment_dict,
    _audit_dict,
    _cover_text,
    _isofmt,
    _protocol_dict,
    build_reg_binder,
    reg_binder_filename,
)


# ── _isofmt ───────────────────────────────────────────────────────────────────

def test_isofmt_none_returns_none():
    assert _isofmt(None) is None


def test_isofmt_aware_dt_roundtrips():
    dt = datetime(2024, 3, 15, 12, 0, 0, tzinfo=timezone.utc)
    result = _isofmt(dt)
    assert "2024-03-15" in result


def test_isofmt_naive_dt_coerced_to_utc():
    naive = datetime(2024, 6, 1, 8, 0, 0)
    result = _isofmt(naive)
    assert result is not None
    # Should contain UTC offset marker
    assert "+00:00" in result or result.endswith("Z")


# ── _protocol_dict ─────────────────────────────────────────────────────────────

def _fake_protocol(**overrides):
    proto = MagicMock()
    proto.id = overrides.get("id", "proto-1")
    proto.clinic_id = overrides.get("clinic_id", "clinic-1")
    proto.protocol_code = overrides.get("protocol_code", "DS-2024-001")
    proto.title = overrides.get("title", "Theta Burst Study")
    proto.description = overrides.get("description", "A safety study")
    proto.irb_board = "Local IRB"
    proto.irb_number = "IRB-2024-01"
    proto.sponsor = "DeepSynaps Research"
    proto.pi_user_id = "pi-user-1"
    proto.phase = "Phase I"
    proto.status = "approved"
    proto.risk_level = "minimal"
    proto.approval_date = "2024-01-01"
    proto.expiry_date = "2025-01-01"
    proto.enrollment_target = 30
    proto.enrolled_count = 5
    proto.consent_version = "v1.2"
    proto.version = 2
    proto.is_demo = False
    proto.created_at = datetime(2024, 1, 1, tzinfo=timezone.utc)
    proto.updated_at = datetime(2024, 6, 1, tzinfo=timezone.utc)
    proto.closed_at = None
    proto.closed_by = None
    proto.closure_note = None
    proto.created_by = "admin-1"
    return proto


def test_protocol_dict_contains_required_keys():
    proto = _fake_protocol()
    d = _protocol_dict(proto)
    for key in ("id", "clinic_id", "title", "status", "version", "is_demo"):
        assert key in d, f"Missing key: {key}"


def test_protocol_dict_is_demo_bool():
    proto = _fake_protocol()
    proto.is_demo = 0  # SQLite stores as int
    d = _protocol_dict(proto)
    assert isinstance(d["is_demo"], bool)


# ── _amendment_dict ────────────────────────────────────────────────────────────

def _fake_amendment(diff_json=None, payload_json=None):
    amd = MagicMock()
    amd.id = "amd-1"
    amd.protocol_id = "proto-1"
    amd.version = 1
    amd.amendment_type = "modification"
    amd.description = "Add exclusion criteria"
    amd.reason = "Safety update"
    amd.status = "approved"
    amd.submitted_by = "pi-user-1"
    amd.created_by_user_id = "pi-user-1"
    amd.assigned_reviewer_user_id = "rev-1"
    amd.submitted_at = datetime(2024, 2, 1, tzinfo=timezone.utc)
    amd.reviewed_at = datetime(2024, 2, 10, tzinfo=timezone.utc)
    amd.effective_at = datetime(2024, 2, 15, tzinfo=timezone.utc)
    amd.review_decision_note = "Approved with minor comments"
    amd.consent_version_after = "v1.3"
    amd.amendment_diff_json = diff_json
    amd.payload_json = payload_json
    return amd


def test_amendment_dict_malformed_json_returns_empty():
    amd = _fake_amendment(diff_json="NOT JSON", payload_json="{bad}")
    d = _amendment_dict(amd)
    assert d["diff"] == []
    assert d["payload"] == {}


def test_amendment_dict_valid_json_parsed():
    diff = json.dumps([{"field": "title", "change_type": "modified"}])
    payload = json.dumps({"title": "New title"})
    amd = _fake_amendment(diff_json=diff, payload_json=payload)
    d = _amendment_dict(amd)
    assert isinstance(d["diff"], list)
    assert d["diff"][0]["field"] == "title"
    assert d["payload"]["title"] == "New title"


# ── _cover_text ────────────────────────────────────────────────────────────────

def test_cover_text_contains_protocol_title():
    proto = _fake_protocol(title="Brain Stim Safety")
    text = _cover_text(proto)
    assert "Brain Stim Safety" in text


def test_cover_text_contains_irb_regulatory_binder_header():
    proto = _fake_protocol()
    text = _cover_text(proto)
    assert "IRB Regulatory Binder" in text


def test_cover_text_contains_generated_at():
    proto = _fake_protocol()
    text = _cover_text(proto)
    assert "Generated at:" in text


# ── reg_binder_filename ────────────────────────────────────────────────────────

def test_reg_binder_filename_format():
    proto = _fake_protocol(id="proto-abc")
    proto.version = 3
    filename = reg_binder_filename(proto)
    assert filename.startswith("reg_binder_proto-abc_v3")
    assert filename.endswith(".zip")


def test_reg_binder_filename_version_none_defaults_to_1():
    proto = _fake_protocol()
    proto.version = None
    filename = reg_binder_filename(proto)
    assert "_v1" in filename


# ── build_reg_binder ───────────────────────────────────────────────────────────

def _make_mock_db(proto, amendments=None, audit_rows=None):
    db = MagicMock()
    q_proto = MagicMock()
    q_proto.filter.return_value.first.return_value = proto

    q_amds = MagicMock()
    q_amds.filter.return_value.order_by.return_value.all.return_value = amendments or []

    q_audit = MagicMock()
    q_audit.filter.return_value.order_by.return_value.all.return_value = audit_rows or []

    call_count = [0]

    def _query_side_effect(model):
        call_count[0] += 1
        from app.persistence.models import IRBProtocol, IRBProtocolAmendment, AuditEventRecord
        if model is IRBProtocol:
            return q_proto
        if model is IRBProtocolAmendment:
            return q_amds
        if model is AuditEventRecord:
            return q_audit
        return MagicMock()

    db.query.side_effect = _query_side_effect
    return db


def test_build_reg_binder_returns_valid_zip():
    proto = _fake_protocol()
    db = _make_mock_db(proto)
    data = build_reg_binder(db, "proto-1", "clinic-1")
    buf = io.BytesIO(data)
    assert zipfile.is_zipfile(buf)


def test_build_reg_binder_zip_contains_cover_page():
    proto = _fake_protocol()
    db = _make_mock_db(proto)
    data = build_reg_binder(db, "proto-1", "clinic-1")
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        names = zf.namelist()
    assert "cover_page.txt" in names


def test_build_reg_binder_zip_contains_protocol_json():
    proto = _fake_protocol()
    proto.version = 2
    db = _make_mock_db(proto)
    data = build_reg_binder(db, "proto-1", "clinic-1")
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        names = zf.namelist()
    assert "protocol_v2.json" in names


def test_build_reg_binder_includes_amendment_files():
    proto = _fake_protocol()
    amd = _fake_amendment()
    amd.id = "amd-55"
    amd.version = 1
    db = _make_mock_db(proto, amendments=[amd])
    data = build_reg_binder(db, "proto-1", "clinic-1")
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        names = zf.namelist()
    assert any("amendment_amd-55" in n for n in names)


def test_build_reg_binder_includes_audit_trail():
    proto = _fake_protocol()
    db = _make_mock_db(proto)
    data = build_reg_binder(db, "proto-1", "clinic-1")
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        assert "audit_trail.json" in zf.namelist()


def test_build_reg_binder_raises_404_for_missing_protocol():
    db = _make_mock_db(None)
    with pytest.raises(ApiServiceError) as exc_info:
        build_reg_binder(db, "nonexistent", "clinic-1")
    assert exc_info.value.status_code == 404


def test_build_reg_binder_idor_guard():
    """Cross-clinic access should raise 404, not 403, to avoid disclosure."""
    proto = _fake_protocol(clinic_id="clinic-A")
    db = _make_mock_db(proto)
    with pytest.raises(ApiServiceError) as exc_info:
        build_reg_binder(db, "proto-1", "clinic-B")  # wrong clinic
    assert exc_info.value.status_code == 404


def test_build_reg_binder_admin_bypass_clinic_check():
    """clinic_id=None means admin — should not raise even if proto has a clinic."""
    proto = _fake_protocol(clinic_id="clinic-A")
    db = _make_mock_db(proto)
    # Should not raise
    data = build_reg_binder(db, "proto-1", None)
    assert len(data) > 0
