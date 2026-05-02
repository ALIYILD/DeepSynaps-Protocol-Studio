"""Tests for :mod:`deepsynaps_mri.ingestion` façade."""
from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

from deepsynaps_mri import ingestion
from deepsynaps_mri import io
from deepsynaps_mri.validation import validate_nifti_header


def _write_minimal_nifti_gz(path: Path) -> None:
    """Write a tiny valid NIfTI-1 gzip (reuses same pattern as test_validation)."""
    import gzip
    import io as io_std
    import struct

    header = bytearray(348)
    struct.pack_into("i", header, 0, 348)
    struct.pack_into("h", header, 40, 3)
    struct.pack_into("h", header, 42, 4)
    struct.pack_into("h", header, 44, 4)
    struct.pack_into("h", header, 46, 4)
    struct.pack_into("h", header, 48, 1)
    struct.pack_into("h", header, 50, 1)
    struct.pack_into("h", header, 52, 1)
    struct.pack_into("h", header, 54, 1)
    struct.pack_into("h", header, 70, 16)
    struct.pack_into("h", header, 72, 32)
    struct.pack_into("f", header, 76, 1.0)
    struct.pack_into("f", header, 80, 1.0)
    struct.pack_into("f", header, 84, 1.0)
    struct.pack_into("f", header, 88, 1.0)
    struct.pack_into("f", header, 108, 352.0)
    struct.pack_into("h", header, 252, 1)
    struct.pack_into("h", header, 254, 1)
    struct.pack_into("4f", header, 280, 1.0, 0.0, 0.0, 0.0)
    struct.pack_into("4f", header, 296, 0.0, 1.0, 0.0, 0.0)
    struct.pack_into("4f", header, 312, 0.0, 0.0, 1.0, 0.0)
    header[344:348] = b"n+1\x00"
    nifti = bytes(header) + bytes(4) + bytes(256)
    buf = io_std.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode="wb") as gz:
        gz.write(nifti)
    path.write_bytes(buf.getvalue())


def test_detect_series_metadata(tmp_path: Path) -> None:
    nii = tmp_path / "s.nii.gz"
    nii.parent.mkdir(parents=True, exist_ok=True)
    _write_minimal_nifti_gz(nii)
    side = tmp_path / "s.json"
    side.write_text("{}", encoding="utf-8")
    scan = io.ConvertedScan(
        nifti_path=nii,
        sidecar_path=side,
        modality_guess="T1w",
        n_volumes=1,
    )
    meta = ingestion.detect_series_metadata(scan)
    assert meta.nifti_path == str(nii.resolve())
    assert meta.modality_guess == "T1w"
    assert meta.n_volumes == 1
    assert meta.sidecar_path == str(side.resolve())


def test_validate_mri_input_delegates_to_header(tmp_path: Path) -> None:
    nii = tmp_path / "v.nii.gz"
    _write_minimal_nifti_gz(nii)
    env = ingestion.validate_mri_input(nii)
    direct = validate_nifti_header(nii)
    assert env.ok == direct.ok
    assert env.details == direct.to_dict()


def test_convert_to_nifti_error_path(tmp_path: Path) -> None:
    """Errors from ``io.convert_dicom_to_nifti`` surface as ``ConversionResult(ok=False)``."""
    with patch("deepsynaps_mri.ingestion.io_mod.convert_dicom_to_nifti", side_effect=RuntimeError("boom")):
        res = ingestion.convert_to_nifti(tmp_path / "any", tmp_path / "out")
    assert res.ok is False
    assert "boom" in res.message
