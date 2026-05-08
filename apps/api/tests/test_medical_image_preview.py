"""Tests for the MIQ-inspired Medical Imaging Preview surface.

Covers:

* :mod:`app.services.medical_image_preview` — format detection, NIfTI
  metadata + preview-PNG generation (with a hand-rolled NIfTI-1 fixture so
  the tests run without nibabel installed), 4-D handling, oversize guard,
  and the safe report-context contract.
* :mod:`app.routers.medical_images_router` — preview upload, slice fetch,
  metadata fetch, supported-formats endpoint, report-context endpoint, and
  the patient-scoped index.
"""
from __future__ import annotations

import gzip
import io
import json
import os
import struct
from pathlib import Path

import pytest


# ── Hand-built NIfTI-1 fixtures ──────────────────────────────────────────────


def _build_nifti1(
    *,
    nx: int = 8,
    ny: int = 8,
    nz: int = 8,
    nt: int = 1,
    datatype: int = 16,  # float32
    bitpix: int = 32,
) -> bytes:
    """Build a valid little-endian NIfTI-1 ``.nii`` byte payload."""
    header = bytearray(348)
    struct.pack_into("<i", header, 0, 348)
    ndim = 4 if nt > 1 else 3
    struct.pack_into("<h", header, 40, ndim)
    struct.pack_into("<h", header, 42, nx)
    struct.pack_into("<h", header, 44, ny)
    struct.pack_into("<h", header, 46, nz)
    struct.pack_into("<h", header, 48, nt)
    struct.pack_into("<h", header, 50, 1)
    struct.pack_into("<h", header, 52, 1)
    struct.pack_into("<h", header, 54, 1)
    struct.pack_into("<h", header, 70, datatype)
    struct.pack_into("<h", header, 72, bitpix)
    struct.pack_into("<f", header, 76, 1.0)
    struct.pack_into("<f", header, 80, 1.5)  # voxel x
    struct.pack_into("<f", header, 84, 1.5)  # voxel y
    struct.pack_into("<f", header, 88, 1.0)  # voxel z
    struct.pack_into("<f", header, 108, 352.0)  # vox_offset
    struct.pack_into("<h", header, 252, 1)  # qform
    struct.pack_into("<h", header, 254, 1)  # sform
    struct.pack_into("<4f", header, 280, 1.0, 0.0, 0.0, 0.0)
    struct.pack_into("<4f", header, 296, 0.0, 1.0, 0.0, 0.0)
    struct.pack_into("<4f", header, 312, 0.0, 0.0, 1.0, 0.0)
    header[344:348] = b"n+1\x00"

    # 4 bytes of extension flag (all zero) + voxel data.
    # Use a simple gradient so percentile-based windowing has range to bite.
    voxels = bytearray()
    bytes_per_voxel = bitpix // 8
    for t in range(nt):
        for z in range(nz):
            for y in range(ny):
                for x in range(nx):
                    val = float((x + y + z + t) % 32) / 32.0
                    voxels += struct.pack("<f", val)
    # If datatype != float32, zero-pad — only used for negative tests.
    if datatype != 16:
        voxels = bytearray(nx * ny * nz * nt * bytes_per_voxel)
    return bytes(header) + bytes(4) + bytes(voxels)


def _gz(blob: bytes) -> bytes:
    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode="wb") as gz:
        gz.write(blob)
    return buf.getvalue()


# ── Service-layer tests ──────────────────────────────────────────────────────


def test_detect_supported_formats():
    from app.services import medical_image_preview as svc

    assert svc.detect_medical_volume_format("scan.nii") == "NIfTI"
    assert svc.detect_medical_volume_format("scan.NII.GZ") == "NIfTI"
    assert svc.detect_medical_volume_format("brain.nii.gz") == "NIfTI"
    assert svc.detect_medical_volume_format("aparc.mgh") == "FreeSurfer"
    assert svc.detect_medical_volume_format("aparc.mgz") == "FreeSurfer"
    assert svc.detect_medical_volume_format("aparc.mgh.gz") == "FreeSurfer"
    assert svc.detect_medical_volume_format("dwi.mif") == "MRtrix"
    assert svc.detect_medical_volume_format("dwi.mif.gz") == "MRtrix"
    assert svc.detect_medical_volume_format("notes.txt") is None
    assert svc.detect_medical_volume_format("") is None
    assert svc.is_supported_medical_volume("scan.nii.gz") is True
    assert svc.is_supported_medical_volume("notes.txt") is False


def test_supported_formats_payload():
    from app.services import medical_image_preview as svc

    formats = svc.supported_formats()
    by_name = {f["format"]: f for f in formats}
    assert "NIfTI" in by_name
    assert by_name["NIfTI"]["tier"] == "primary"
    assert ".nii.gz" in by_name["NIfTI"]["extensions"]


def test_metadata_extraction_from_synthetic_nifti(tmp_path: Path):
    from app.services import medical_image_preview as svc

    blob = _build_nifti1(nx=4, ny=5, nz=6)
    path = tmp_path / "small.nii"
    path.write_bytes(blob)

    md = svc.extract_medical_volume_metadata(str(path))
    assert md.format == "NIfTI"
    assert md.dimensions == [4, 5, 6]
    assert md.voxel_size_mm == [pytest.approx(1.5), pytest.approx(1.5), pytest.approx(1.0)]
    assert md.volumes == 1
    assert md.qform_code == 1
    assert md.sform_code == 1
    assert any("Preview only" in w for w in md.warnings)
    assert any("not reoriented" in w for w in md.warnings)


def test_metadata_extraction_from_gzipped_nifti(tmp_path: Path):
    from app.services import medical_image_preview as svc

    path = tmp_path / "scan.nii.gz"
    path.write_bytes(_gz(_build_nifti1(nx=4, ny=4, nz=4)))

    md = svc.extract_medical_volume_metadata(str(path))
    assert md.format == "NIfTI"
    assert md.dimensions == [4, 4, 4]
    assert md.compressed is True


def test_4d_volume_flagged_in_metadata(tmp_path: Path):
    from app.services import medical_image_preview as svc

    path = tmp_path / "fmri.nii"
    path.write_bytes(_build_nifti1(nx=4, ny=4, nz=4, nt=3))

    md = svc.extract_medical_volume_metadata(str(path))
    assert md.volumes == 3
    assert any("4-D volume" in w for w in md.warnings)


def test_preview_generation_writes_three_pngs(tmp_path: Path):
    from app.services import medical_image_preview as svc

    src = tmp_path / "brain.nii"
    src.write_bytes(_build_nifti1(nx=8, ny=10, nz=12))
    out = tmp_path / "previews"

    preview = svc.generate_orthogonal_preview_slices(str(src), str(out))
    assert preview.status == "ready"
    for plane in ("axial", "coronal", "sagittal"):
        assert os.path.exists(out / f"{plane}.png"), f"missing {plane}.png"
        # PNG magic header
        assert (out / f"{plane}.png").read_bytes()[:8] == b"\x89PNG\r\n\x1a\n"

    assert preview.metadata.intensity_min is not None
    assert preview.metadata.intensity_max is not None


def test_preview_generation_4d_uses_first_volume(tmp_path: Path):
    from app.services import medical_image_preview as svc

    src = tmp_path / "ts.nii"
    src.write_bytes(_build_nifti1(nx=6, ny=6, nz=6, nt=4))
    preview = svc.generate_orthogonal_preview_slices(str(src), str(tmp_path / "out"))
    assert preview.status == "ready"
    assert preview.metadata.volumes == 4
    assert any("4-D volume" in w for w in preview.metadata.warnings)


def test_preview_generation_corrupt_file_returns_safe_error(tmp_path: Path):
    from app.services import medical_image_preview as svc

    src = tmp_path / "garbage.nii"
    src.write_bytes(b"this is not a NIfTI header" * 50)
    preview = svc.generate_orthogonal_preview_slices(str(src), str(tmp_path / "out"))
    assert preview.status == "error"
    assert preview.error
    # The error must NEVER include diagnostic terms — it's just a parse failure.
    assert not any(
        term in (preview.error or "").lower()
        for term in svc.DIAGNOSTIC_FORBIDDEN_TERMS
    )


def test_preview_generation_unsupported_extension(tmp_path: Path):
    from app.services import medical_image_preview as svc

    src = tmp_path / "notes.txt"
    src.write_bytes(b"hello world")
    preview = svc.generate_orthogonal_preview_slices(str(src), str(tmp_path / "out"))
    assert preview.status == "unsupported"


def test_oversize_file_rejected(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    from app.services import medical_image_preview as svc

    src = tmp_path / "big.nii"
    src.write_bytes(_build_nifti1(nx=4, ny=4, nz=4))
    monkeypatch.setattr(svc, "MAX_PREVIEW_BYTES", 100)
    with pytest.raises(ValueError, match="too large"):
        svc.safe_load_first_volume(str(src))


def test_normalize_slice_handles_constant_array():
    from app.services import medical_image_preview as svc
    import numpy as np

    img = svc.normalize_slice_for_preview(np.zeros((4, 4)))
    assert img.size == (4, 4)


# ── Report-context contract ──────────────────────────────────────────────────


def test_build_context_unavailable_uses_safe_sentence():
    from app.services import medical_image_preview as svc

    ctx = svc.build_medical_image_context_for_report()
    assert ctx["available"] is False
    assert ctx["automated_interpretation_performed"] is False
    assert ctx["preview_status"] == "unavailable"
    assert ctx["safe_report_sentence"] == svc.SAFE_REPORT_SENTENCES["unavailable"]
    # No diagnostic words anywhere in the rendered sentence.
    sentence = ctx["safe_report_sentence"].lower()
    for term in svc.DIAGNOSTIC_FORBIDDEN_TERMS:
        assert term not in sentence


def test_build_context_metadata_only():
    from app.services import medical_image_preview as svc

    md = svc.MedicalVolumeMetadata(
        filename="x.nii", format="NIfTI", dimensions=[4, 4, 4], volumes=1
    )
    ctx = svc.build_medical_image_context_for_report(metadata=md, preview_status="metadata_only")
    assert ctx["available"] is True
    assert ctx["automated_interpretation_performed"] is False
    assert "no automated image interpretation was performed" in ctx["safe_report_sentence"]


def test_build_context_preview_ready_includes_safe_sentence():
    from app.services import medical_image_preview as svc

    md = svc.MedicalVolumeMetadata(
        filename="brain.nii.gz", format="NIfTI", dimensions=[160, 160, 192], volumes=1
    )
    ctx = svc.build_medical_image_context_for_report(metadata=md, preview_status="ready")
    assert ctx["preview_status"] == "ready"
    assert "non-diagnostic preview" in ctx["safe_report_sentence"]
    assert ctx["automated_interpretation_performed"] is False


def test_build_context_clinician_note_preserved_verbatim():
    """Even if the clinician note contains a diagnostic term it must be
    preserved verbatim — but flagged so the renderer can label it as
    clinician-entered, not AI-derived."""
    from app.services import medical_image_preview as svc

    md = svc.MedicalVolumeMetadata(filename="x.nii", format="NIfTI", dimensions=[4, 4, 4])
    ctx = svc.build_medical_image_context_for_report(
        metadata=md,
        preview_status="ready",
        clinician_imaging_note="Possible left frontal lesion noted on T1.",
    )
    assert ctx["clinician_imaging_note"] == "Possible left frontal lesion noted on T1."
    flags = " ".join(ctx["warnings"]).lower()
    assert "clinician-entered" in flags


def test_build_context_no_diagnostic_words_in_safe_sentence():
    """Scrub: regardless of input combination, the AI-emitted sentence must
    never contain a diagnostic term."""
    from app.services import medical_image_preview as svc

    md = svc.MedicalVolumeMetadata(filename="x.nii", format="NIfTI", dimensions=[4, 4, 4])
    for status in (None, "ready", "metadata_only", "error", "unsupported"):
        for note in (None, "", "Patient reports tinnitus.", "Lesion on T2."):
            ctx = svc.build_medical_image_context_for_report(
                metadata=md if status else None,
                preview_status=status,
                clinician_imaging_note=note,
            )
            sentence = ctx["safe_report_sentence"].lower()
            for term in svc.DIAGNOSTIC_FORBIDDEN_TERMS:
                assert term not in sentence, (
                    f"diagnostic term {term!r} leaked into safe sentence "
                    f"for status={status!r} note={note!r}"
                )


# ── Router-level integration tests ───────────────────────────────────────────


@pytest.fixture
def media_root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Redirect media_storage_root to the tmp tree so files don't pollute repo."""
    from app.settings import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "media_storage_root", str(tmp_path))
    return tmp_path


def test_supported_formats_endpoint(client, auth_headers):
    res = client.get(
        "/api/v1/medical-images/supported-formats", headers=auth_headers["clinician"]
    )
    assert res.status_code == 200
    body = res.json()
    assert any(f["format"] == "NIfTI" for f in body["formats"])
    assert "Not diagnostic" in body["disclaimer"]


def test_preview_endpoint_round_trip(client, auth_headers, media_root: Path):
    payload = _build_nifti1(nx=8, ny=10, nz=12)
    res = client.post(
        "/api/v1/medical-images/preview",
        files={"file": ("brain.nii", payload, "application/octet-stream")},
        headers=auth_headers["clinician"],
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["status"] == "ready"
    assert body["format"] == "NIfTI"
    assert body["metadata"]["dimensions"] == [8, 10, 12]
    image_id = body["id"]
    assert image_id.startswith("img_")
    assert body["preview"]["axial_url"].endswith(f"/medical-images/{image_id}/slices/axial.png")

    # Fetch slice
    slice_res = client.get(
        body["preview"]["axial_url"], headers=auth_headers["clinician"]
    )
    assert slice_res.status_code == 200
    assert slice_res.headers["content-type"] == "image/png"
    assert slice_res.content[:8] == b"\x89PNG\r\n\x1a\n"

    # Fetch metadata
    md_res = client.get(
        f"/api/v1/medical-images/{image_id}", headers=auth_headers["clinician"]
    )
    assert md_res.status_code == 200
    assert md_res.json()["status"] == "ready"


def test_preview_rejects_unsupported_extension(client, auth_headers, media_root: Path):
    res = client.post(
        "/api/v1/medical-images/preview",
        files={"file": ("notes.txt", b"hello", "text/plain")},
        headers=auth_headers["clinician"],
    )
    assert res.status_code == 422
    assert res.json()["code"] == "unsupported_medical_image"


def test_preview_rejects_empty_file(client, auth_headers, media_root: Path):
    res = client.post(
        "/api/v1/medical-images/preview",
        files={"file": ("empty.nii", b"", "application/octet-stream")},
        headers=auth_headers["clinician"],
    )
    assert res.status_code == 422
    assert res.json()["code"] == "file_empty"


def test_preview_role_gated_for_patient(client, auth_headers, media_root: Path):
    payload = _build_nifti1(nx=4, ny=4, nz=4)
    res = client.post(
        "/api/v1/medical-images/preview",
        files={"file": ("brain.nii", payload, "application/octet-stream")},
        headers=auth_headers["patient"],
    )
    assert res.status_code in (401, 403)


def test_report_context_endpoint_no_diagnostic_claims(
    client, auth_headers, media_root: Path
):
    from app.services import medical_image_preview as svc

    payload = _build_nifti1(nx=6, ny=6, nz=6)
    create = client.post(
        "/api/v1/medical-images/preview",
        files={"file": ("brain.nii", payload, "application/octet-stream")},
        headers=auth_headers["clinician"],
    )
    assert create.status_code == 201
    image_id = create.json()["id"]

    # No clinician note → safe-sentence-only.
    res = client.post(
        f"/api/v1/medical-images/{image_id}/report-context",
        json={"clinician_imaging_note": None},
        headers=auth_headers["clinician"],
    )
    assert res.status_code == 200, res.text
    ctx = res.json()["medical_image_context"]
    assert ctx["available"] is True
    assert ctx["automated_interpretation_performed"] is False
    sentence = ctx["safe_report_sentence"].lower()
    for term in svc.DIAGNOSTIC_FORBIDDEN_TERMS:
        assert term not in sentence

    # With clinician note → preserved verbatim, flagged.
    res2 = client.post(
        f"/api/v1/medical-images/{image_id}/report-context",
        json={"clinician_imaging_note": "Subtle white-matter disease on FLAIR."},
        headers=auth_headers["clinician"],
    )
    ctx2 = res2.json()["medical_image_context"]
    assert ctx2["clinician_imaging_note"] == "Subtle white-matter disease on FLAIR."
    # Safe sentence is still safe — diagnostic words live only in the note,
    # which the renderer must label as clinician-entered.
    safe2 = ctx2["safe_report_sentence"].lower()
    for term in svc.DIAGNOSTIC_FORBIDDEN_TERMS:
        assert term not in safe2


def test_report_context_unknown_image(client, auth_headers, media_root: Path):
    res = client.post(
        "/api/v1/medical-images/img_does_not_exist/report-context",
        json={"clinician_imaging_note": None},
        headers=auth_headers["clinician"],
    )
    assert res.status_code == 404


def test_patient_index_filters_by_patient_id(client, auth_headers, media_root: Path):
    """Two previews — one without a patient, one with — only the latter
    should appear in the patient-scoped index."""
    payload_a = _build_nifti1(nx=4, ny=4, nz=4)
    payload_b = _build_nifti1(nx=4, ny=4, nz=4)
    # Anonymous (demo) preview.
    a = client.post(
        "/api/v1/medical-images/preview",
        files={"file": ("anon.nii", payload_a, "application/octet-stream")},
        headers=auth_headers["clinician"],
    )
    assert a.status_code == 201

    # Patient-linked preview — uses an admin token to bypass cross-clinic
    # ownership for the demo. The index call must accept the same actor.
    b = client.post(
        "/api/v1/medical-images/preview",
        data={"patient_id": "patient-xyz"},
        files={"file": ("scan.nii", payload_b, "application/octet-stream")},
        headers=auth_headers["admin"],
    )
    assert b.status_code == 201, b.text

    res = client.get(
        "/api/v1/medical-images/patients/patient-xyz/index",
        headers=auth_headers["admin"],
    )
    assert res.status_code == 200
    items = res.json()["items"]
    assert len(items) == 1
    assert items[0]["patient_id"] == "patient-xyz"


def test_audit_event_emitted_on_preview(client, auth_headers, media_root: Path):
    from app.database import SessionLocal
    from app.persistence.models import AuditEventRecord

    payload = _build_nifti1(nx=4, ny=4, nz=4)
    res = client.post(
        "/api/v1/medical-images/preview",
        files={"file": ("scan.nii", payload, "application/octet-stream")},
        headers=auth_headers["clinician"],
    )
    assert res.status_code == 201
    image_id = res.json()["id"]

    db = SessionLocal()
    try:
        rows = (
            db.query(AuditEventRecord)
            .filter(AuditEventRecord.target_id == image_id[:64])
            .all()
        )
    finally:
        db.close()
    actions = {r.action for r in rows}
    assert "medical_image.uploaded" in actions
    assert "medical_image.preview_generated" in actions


def test_phi_filename_redacted_in_logs(caplog, client, auth_headers, media_root: Path):
    """Filenames that look like they carry identifiers must be redacted."""
    import logging

    payload = _build_nifti1(nx=4, ny=4, nz=4)
    with caplog.at_level(logging.INFO):
        res = client.post(
            "/api/v1/medical-images/preview",
            files={
                "file": (
                    "patient_smith_dob_19700101.nii",
                    payload,
                    "application/octet-stream",
                )
            },
            headers=auth_headers["clinician"],
        )
    assert res.status_code == 201
    # The PHI filename never appears verbatim in the log output.
    text = "\n".join(rec.getMessage() for rec in caplog.records)
    assert "smith" not in text.lower()


# ── nibabel-aware tests, run when the optional dep is present ───────────────


def _has_nibabel() -> bool:
    try:
        import nibabel  # type: ignore[import-not-found]  # noqa: F401

        return True
    except Exception:
        return False


@pytest.mark.skipif(not _has_nibabel(), reason="nibabel not installed")
def test_nibabel_path_matches_fallback(tmp_path: Path):
    """If nibabel is installed, both paths must produce the same metadata.

    Guards against silent drift between the nibabel and pure-Python parsers.
    """
    from app.services import medical_image_preview as svc

    src = tmp_path / "scan.nii.gz"
    src.write_bytes(_gz(_build_nifti1(nx=5, ny=6, nz=7)))

    md = svc.extract_medical_volume_metadata(str(src))
    assert md.dimensions == [5, 6, 7]
    assert md.volumes == 1
