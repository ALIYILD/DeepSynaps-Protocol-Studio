"""Tests for :mod:`deepsynaps_mri.ingestion`."""
from __future__ import annotations

import io
import struct
import tempfile
import zipfile
from pathlib import Path
from unittest.mock import patch

import pytest

pytest.importorskip("pydicom")

from deepsynaps_mri import ingestion


def _minimal_nifti1_file(path: Path, *, magic: bytes = b"n+1\x00") -> None:
    """Write a minimal valid NIfTI-1 single-file image (4×4×4 + header)."""
    header = bytearray(348)
    struct.pack_into("i", header, 0, 348)
    struct.pack_into("h", header, 40, 3)
    struct.pack_into("h", header, 42, 4)
    struct.pack_into("h", header, 44, 4)
    struct.pack_into("h", header, 46, 4)
    struct.pack_into("h", header, 48, 1)
    struct.pack_into("h", header, 70, 2)   # DT_UINT8
    struct.pack_into("h", header, 72, 8)   # bitpix
    struct.pack_into("f", header, 76, 1.0)
    struct.pack_into("f", header, 80, 1.0)
    struct.pack_into("f", header, 84, 1.0)
    struct.pack_into("f", header, 88, 1.0)
    struct.pack_into("h", header, 252, 1)
    struct.pack_into("h", header, 254, 1)
    struct.pack_into("4f", header, 280, 1.0, 0.0, 0.0, 0.0)
    struct.pack_into("4f", header, 296, 0.0, 1.0, 0.0, 0.0)
    struct.pack_into("4f", header, 312, 0.0, 0.0, 1.0, 0.0)
    header[344:348] = magic
    data = bytes(4 * 4 * 4 * 1)
    path.write_bytes(bytes(header) + bytes(4) + data)


def test_validate_mri_input_rejects_bad_extension(tmp_path: Path) -> None:
    bad = tmp_path / "x.bin"
    bad.write_bytes(b"hello")
    env = ingestion.validate_mri_input(bad)
    assert env.ok is False
    assert env.validation is not None
    assert env.validation.code == "unsupported_extension"


def test_validate_mri_input_nifti_ok(tmp_path: Path) -> None:
    nii = tmp_path / "t.nii"
    _minimal_nifti1_file(nii)
    env = ingestion.validate_mri_input(nii, kind="nifti")
    assert env.ok is True
    assert env.input_kind == "nifti"
    assert env.validation is not None
    assert env.validation.ok is True


def test_validate_mri_input_zip_ok(tmp_path: Path) -> None:
    zpath = tmp_path / "b.zip"
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("a.txt", "hi")
    zpath.write_bytes(buf.getvalue())
    env = ingestion.validate_mri_input(zpath, kind="zip")
    assert env.ok is True


def test_validate_mri_input_dicom_dir_empty(tmp_path: Path) -> None:
    d = tmp_path / "empty_dicoms"
    d.mkdir()
    env = ingestion.validate_mri_input(d, kind="dicom_dir")
    assert env.ok is False
    assert env.validation is not None
    assert env.validation.code == "dicom_none_readable"


def test_detect_series_metadata_groups_series(tmp_path: Path) -> None:
    import pydicom
    from pydicom.dataset import Dataset, FileDataset

    series_dir = tmp_path / "series_a"
    series_dir.mkdir()

    def write_one(name: str, suid: str, desc: str) -> None:
        ds = Dataset()
        ds.PatientID = "TEST"
        ds.SeriesInstanceUID = suid
        ds.SeriesNumber = 1
        ds.SeriesDescription = desc
        ds.Modality = "MR"
        ds.InstanceNumber = 1
        ds.file_meta = Dataset()
        ds.file_meta.MediaStorageSOPClassUID = pydicom.uid.generate_uid()
        ds.file_meta.MediaStorageSOPInstanceUID = pydicom.uid.generate_uid()
        ds.file_meta.TransferSyntaxUID = pydicom.uid.ImplicitVRLittleEndian
        ds.SOPClassUID = ds.file_meta.MediaStorageSOPClassUID
        ds.SOPInstanceUID = ds.file_meta.MediaStorageSOPInstanceUID
        ds.is_little_endian = True
        ds.is_implicit_VR = True
        pydicom.dcmwrite(series_dir / name, ds)

    write_one("0001.dcm", "1.2.3.4.5", "MPRAGE")
    write_one("0002.dcm", "1.2.3.4.5", "MPRAGE")

    meta_list = ingestion.detect_series_metadata(series_dir)
    assert len(meta_list) == 1
    assert meta_list[0].series_instance_uid == "1.2.3.4.5"
    assert meta_list[0].num_dicoms == 2
    assert meta_list[0].series_description == "MPRAGE"


def test_import_dicom_series_deidentifies(tmp_path: Path) -> None:
    import pydicom
    from pydicom.dataset import Dataset

    raw = tmp_path / "raw"
    raw.mkdir()
    ds = Dataset()
    ds.PatientID = "SECRET"
    ds.PatientName = "SECRET"
    ds.SeriesInstanceUID = "9.9.9.9"
    ds.SeriesNumber = 3
    ds.SeriesDescription = "T1"
    ds.Modality = "MR"
    ds.InstanceNumber = 1
    ds.file_meta = Dataset()
    ds.file_meta.MediaStorageSOPClassUID = pydicom.uid.generate_uid()
    ds.file_meta.MediaStorageSOPInstanceUID = pydicom.uid.generate_uid()
    ds.file_meta.TransferSyntaxUID = pydicom.uid.ImplicitVRLittleEndian
    ds.SOPClassUID = ds.file_meta.MediaStorageSOPClassUID
    ds.SOPInstanceUID = ds.file_meta.MediaStorageSOPInstanceUID
    ds.is_little_endian = True
    ds.is_implicit_VR = True
    pydicom.dcmwrite(raw / "img.dcm", ds)

    work = tmp_path / "work"
    res = ingestion.import_dicom_series(raw, work, "DS-PSEUDO-001", nifti_out_dir=None)
    assert res.ok is True
    assert res.deidentified_dir is not None
    assert res.deidentified_dir.exists()
    assert res.n_files_deidentified >= 1
    # PHI blanked in copy
    clean_files = list(res.deidentified_dir.rglob("*.dcm"))
    assert clean_files
    red = pydicom.dcmread(clean_files[0], force=True)
    assert str(red.PatientID) != "SECRET"


def test_convert_to_nifti_mocked_success(tmp_path: Path) -> None:
    from deepsynaps_mri.io import ConvertedScan

    in_dir = tmp_path / "in"
    in_dir.mkdir()

    fake_scan = ConvertedScan(
        nifti_path=tmp_path / "out.nii.gz",
        sidecar_path=None,
        modality_guess="T1w",
        n_volumes=1,
        voxel_size_mm=(1.0, 1.0, 1.0),
    )
    fake_scan.nifti_path.touch()

    with patch("deepsynaps_mri.io.convert_dicom_to_nifti", return_value=[fake_scan]):
        result = ingestion.convert_to_nifti(in_dir, tmp_path / "out")
    assert result.ok is True
    assert len(result.scans) == 1
    assert result.converter in ("dcm2niix", "dicom2nifti")


def test_conversion_result_to_dict_roundtrip() -> None:
    from deepsynaps_mri.io import ConvertedScan

    cs = ConvertedScan(
        nifti_path=Path("/tmp/x.nii.gz"),
        sidecar_path=None,
        modality_guess="bold",
        n_volumes=100,
    )
    cr = ingestion.ConversionResult(ok=True, scans=[cs], converter="dcm2niix")
    d = cr.to_dict()
    assert d["ok"] is True
    assert d["scans"][0]["modality_guess"] == "bold"


def test_import_result_to_dict_includes_conversion_when_present() -> None:
    cr = ingestion.ConversionResult(ok=False, code="x", message="fail")
    ir = ingestion.ImportDicomResult(
        ok=False,
        conversion=cr,
        pseudo_patient_id="p",
    )
    d = ir.to_dict()
    assert "conversion" in d
    assert d["conversion"]["ok"] is False
