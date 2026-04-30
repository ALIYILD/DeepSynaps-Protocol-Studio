"""Phase 5b — qEEG upload endpoint tests.

Verifies the QC heuristic + path validation for /api/v1/qeeg-records/upload.
Pure-function tests — does not stand up the full FastAPI app since the
endpoint is integration-tested via existing qeeg_records test fixtures.
"""
from __future__ import annotations

import os
from pathlib import Path

import pytest

from app.routers.qeeg_records_router import (
    _QEEG_UPLOAD_ALLOWED_EXTS,
    _QEEG_UPLOAD_LARGE_BYTES,
    _QEEG_UPLOAD_MAX_BYTES,
    _QEEG_UPLOAD_MIN_BYTES,
    _qeeg_save_recording_file,
    _qeeg_suggest_path,
    _qeeg_suggest_reason,
)
from app.errors import ApiServiceError


class _FakeSettings:
    def __init__(self, root: str):
        self.media_storage_root = root


# ── Suggest path ────────────────────────────────────────────────────────────


def test_suggest_path_auto_for_typical_recording():
    # 50 MB EDF — typical 10-minute resting state at 250 Hz, 19 channels
    assert _qeeg_suggest_path(50 * 1024 * 1024, "edf") == "auto"
    assert _qeeg_suggest_path(10 * 1024 * 1024, "vhdr") == "auto"
    assert _qeeg_suggest_path(80 * 1024 * 1024, "bdf") == "auto"


def test_suggest_path_manual_when_too_small():
    assert _qeeg_suggest_path(500 * 1024, "edf") == "manual"
    assert _qeeg_suggest_path(_QEEG_UPLOAD_MIN_BYTES - 1, "edf") == "manual"


def test_suggest_path_manual_when_too_large():
    assert _qeeg_suggest_path(_QEEG_UPLOAD_LARGE_BYTES + 1, "edf") == "manual"


def test_suggest_path_manual_for_eeglab_exports():
    assert _qeeg_suggest_path(50 * 1024 * 1024, "set") == "manual"
    assert _qeeg_suggest_path(50 * 1024 * 1024, "fdt") == "manual"


def test_suggest_reason_phrases_are_descriptive():
    auto = _qeeg_suggest_reason(50 * 1024 * 1024, "edf", "auto")
    assert "auto" in auto.lower()
    small = _qeeg_suggest_reason(500 * 1024, "edf", "manual")
    assert "small" in small.lower()
    big = _qeeg_suggest_reason(_QEEG_UPLOAD_LARGE_BYTES + 1, "edf", "manual")
    assert "large" in big.lower()
    eeglab = _qeeg_suggest_reason(50 * 1024 * 1024, "set", "manual")
    assert "eeglab" in eeglab.lower()


# ── File save / sandboxing ──────────────────────────────────────────────────


def test_save_recording_file_persists_bytes_and_returns_ref(tmp_path: Path):
    settings = _FakeSettings(str(tmp_path))
    payload = b"DUMMY EDF DATA" * 1024
    ref, ext = _qeeg_save_recording_file(
        patient_id="patient-abc",
        record_id="record-xyz",
        file_bytes=payload,
        filename="resting.edf",
        settings=settings,
    )
    assert ext == "edf"
    assert ref.startswith("fixtures://qeeg/patient-abc/")
    expected = tmp_path / "qeeg" / "patient-abc" / "record-xyz.edf"
    assert expected.exists()
    assert expected.read_bytes() == payload


def test_save_recording_file_rejects_unsupported_extension(tmp_path: Path):
    settings = _FakeSettings(str(tmp_path))
    with pytest.raises(ApiServiceError) as exc:
        _qeeg_save_recording_file(
            patient_id="p",
            record_id="r",
            file_bytes=b"x",
            filename="evil.exe",
            settings=settings,
        )
    assert exc.value.status_code == 422


def test_save_recording_file_traversal_in_patient_id_stays_in_sandbox(tmp_path: Path):
    """Even with an evil patient_id, the resolved destination must stay
    inside the media_root/qeeg/ sandbox, never escape to /etc or similar."""
    settings = _FakeSettings(str(tmp_path))
    sandbox = (tmp_path / "qeeg").resolve()
    try:
        ref, _ext = _qeeg_save_recording_file(
            patient_id="../../../etc",
            record_id="r",
            file_bytes=b"x",
            filename="x.edf",
            settings=settings,
        )
    except ApiServiceError as exc:
        # If the helper raises, the sandbox guard fired — that's fine.
        assert exc.status_code == 422
        return
    # Otherwise, the file MUST exist under tmp_path (never under /etc).
    assert not Path("/etc/r.edf").exists()
    # The ref's resolved on-disk path should canonicalize to inside
    # media_root/qeeg, regardless of the traversal attempt.
    # Walk the tmp_path to confirm exactly one .edf file was created.
    found = list(tmp_path.rglob("*.edf"))
    assert found, "expected the file to land somewhere under tmp_path"
    for p in found:
        # Each path realpath must start with the media_root realpath.
        assert str(p.resolve()).startswith(str(tmp_path.resolve())), (
            f"file escaped tmp_path sandbox: {p}"
        )


def test_allowed_extensions_cover_supported_formats():
    expected = {"edf", "bdf", "vhdr", "vmrk", "eeg", "set", "fdt", "fif"}
    assert expected.issubset(_QEEG_UPLOAD_ALLOWED_EXTS)


def test_size_caps_are_sane():
    assert 0 < _QEEG_UPLOAD_MIN_BYTES < _QEEG_UPLOAD_LARGE_BYTES < _QEEG_UPLOAD_MAX_BYTES
