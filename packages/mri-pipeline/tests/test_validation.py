"""Tests for :mod:`deepsynaps_mri.validation`.

Covers:

* extension whitelist (``.nii``, ``.nii.gz``, ``.zip`` accepted; everything
  else rejected with code ``unsupported_extension``).
* NIfTI magic-byte check (valid hand-built NIfTI-1 → ``ok``; truncated /
  wrong magic → ``nifti_too_short`` / ``nifti_bad_magic``).
* zip sanity check (empty zip rejected, corrupt bytes rejected).
* :func:`validate_upload_blob` end-to-end smoke tests.
"""
from __future__ import annotations

import gzip
import io
import struct
import zipfile

import pytest

from deepsynaps_mri import validation as v


# ---------------------------------------------------------------------------
# Test fixtures: a hand-built minimal valid NIfTI-1 gzipped payload.
# ---------------------------------------------------------------------------
def _make_nifti1_gz(
    *,
    pixdim: tuple[float, float, float] = (1.0, 1.0, 1.0),
    sform_code: int = 1,
    qform_code: int = 1,
    dim0: int = 3,
    magic: bytes = b"n+1\x00",
) -> bytes:
    """Build a gzipped NIfTI-1 header + 256-byte data block."""
    header = bytearray(348)
    struct.pack_into("i", header, 0, 348)
    struct.pack_into("h", header, 40, dim0)
    struct.pack_into("h", header, 42, 4)
    struct.pack_into("h", header, 44, 4)
    struct.pack_into("h", header, 46, 4)
    struct.pack_into("h", header, 48, 1)
    struct.pack_into("h", header, 50, 1)
    struct.pack_into("h", header, 52, 1)
    struct.pack_into("h", header, 54, 1)
    struct.pack_into("h", header, 70, 16)
    struct.pack_into("h", header, 72, 32)
    struct.pack_into("f", header, 76, pixdim[0])
    struct.pack_into("f", header, 80, pixdim[0])
    struct.pack_into("f", header, 84, pixdim[1])
    struct.pack_into("f", header, 88, pixdim[2])
    struct.pack_into("f", header, 108, 352.0)
    struct.pack_into("h", header, 252, qform_code)
    struct.pack_into("h", header, 254, sform_code)
    struct.pack_into("4f", header, 280, 1.0, 0.0, 0.0, 0.0)
    struct.pack_into("4f", header, 296, 0.0, 1.0, 0.0, 0.0)
    struct.pack_into("4f", header, 312, 0.0, 0.0, 1.0, 0.0)
    header[344:348] = magic
    nifti = bytes(header) + bytes(4) + bytes(256)
    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode="wb") as gz:
        gz.write(nifti)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Extension whitelist
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("filename,expected", [
    ("scan.nii", ".nii"),
    ("scan.NII", ".nii"),
    ("scan.nii.gz", ".nii.gz"),
    ("Scan.NII.GZ", ".nii.gz"),
    ("bundle.zip", ".zip"),
    ("scan.dcm", ".dcm"),
    ("notes.txt", ".txt"),
    ("noext", ""),
])
def test_normalised_extension(filename: str, expected: str) -> None:
    assert v.normalised_extension(filename) == expected


@pytest.mark.parametrize("filename", ["scan.nii", "scan.nii.gz", "bundle.zip"])
def test_validate_extension_accepts_whitelist(filename: str) -> None:
    result = v.validate_extension(filename)
    assert result.ok is True
    assert result.code == ""


@pytest.mark.parametrize("filename", ["scan.dcm", "scan.exe", "scan.txt", "noext"])
def test_validate_extension_rejects_others(filename: str) -> None:
    result = v.validate_extension(filename)
    assert result.ok is False
    assert result.code == "unsupported_extension"
    assert "Accepted" in result.message


# ---------------------------------------------------------------------------
# NIfTI magic-byte check
# ---------------------------------------------------------------------------
def test_validate_nifti_magic_accepts_valid_n1_gzip() -> None:
    blob = _make_nifti1_gz()
    result = v.validate_nifti_magic(blob)
    assert result.ok is True
    assert result.details["variant"] == "nifti1"


def test_validate_nifti_magic_rejects_too_short() -> None:
    result = v.validate_nifti_magic(b"NOT_A_NIFTI")
    assert result.ok is False
    assert result.code == "nifti_too_short"


def test_validate_nifti_magic_rejects_wrong_magic() -> None:
    blob = _make_nifti1_gz(magic=b"XXXX")
    result = v.validate_nifti_magic(blob)
    assert result.ok is False
    assert result.code == "nifti_bad_magic"


def test_validate_nifti_magic_handles_garbage_gzip() -> None:
    """A blob with a bogus gzip header should fail safely (no exception)."""
    blob = b"\x1f\x8b" + b"NOT_A_VALID_GZIP_STREAM"
    result = v.validate_nifti_magic(blob)
    assert result.ok is False
    assert result.code in ("nifti_too_short", "nifti_bad_magic")


# ---------------------------------------------------------------------------
# Zip sanity
# ---------------------------------------------------------------------------
def test_validate_zip_archive_accepts_real_zip() -> None:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("hello.txt", "world")
    result = v.validate_zip_archive(buf.getvalue())
    assert result.ok is True
    assert result.details["member_count"] == 1


def test_validate_zip_archive_rejects_non_zip_bytes() -> None:
    result = v.validate_zip_archive(b"this is not a zip")
    assert result.ok is False
    assert result.code in ("zip_corrupt", "zip_unreadable")


def test_validate_zip_archive_rejects_empty_payload() -> None:
    result = v.validate_zip_archive(b"")
    assert result.ok is False
    assert result.code == "zip_empty"


def test_validate_zip_archive_rejects_empty_archive() -> None:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w"):
        pass  # zero members
    result = v.validate_zip_archive(buf.getvalue())
    assert result.ok is False
    assert result.code == "zip_empty"


# ---------------------------------------------------------------------------
# End-to-end blob validation
# ---------------------------------------------------------------------------
def test_validate_upload_blob_accepts_valid_nifti_gz() -> None:
    blob = _make_nifti1_gz()
    result = v.validate_upload_blob("patient.nii.gz", blob)
    assert result.ok is True
    assert result.details["bytes"] == len(blob)


def test_validate_upload_blob_rejects_unknown_extension() -> None:
    result = v.validate_upload_blob("scan.dcm", b"\x00" * 1024)
    assert result.ok is False
    assert result.code == "unsupported_extension"


def test_validate_upload_blob_rejects_empty_payload() -> None:
    result = v.validate_upload_blob("scan.nii.gz", b"")
    assert result.ok is False
    assert result.code == "file_empty"


def test_validate_upload_blob_rejects_garbage_nifti() -> None:
    result = v.validate_upload_blob("scan.nii.gz", b"\x00" * 200)
    assert result.ok is False
    assert result.code in ("nifti_too_short", "nifti_bad_magic")


def test_validate_upload_blob_rejects_corrupt_zip() -> None:
    result = v.validate_upload_blob("bundle.zip", b"NOT_A_ZIP_AT_ALL")
    assert result.ok is False
    assert result.code in ("zip_corrupt", "zip_unreadable")
