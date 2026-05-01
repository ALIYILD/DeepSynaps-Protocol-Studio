"""
High-level MRI ingestion — typed façade over :mod:`deepsynaps_mri.io` and
:mod:`deepsynaps_mri.validation`.

These names match the modular roadmap without changing ``pipeline.run_pipeline``,
which continues to call ``io.ingest`` directly.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

from . import io as io_mod
from .validation import ValidationResult, validate_nifti_header

log = logging.getLogger(__name__)


class SeriesMetadata(BaseModel):
    """Minimal series-level metadata after conversion."""

    nifti_path: str
    modality_guess: str
    n_volumes: int = 1
    sidecar_path: str | None = None


class ConversionResult(BaseModel):
    ok: bool
    scans: list[SeriesMetadata] = Field(default_factory=list)
    message: str = ""


class ImportDicomResult(BaseModel):
    ok: bool
    output_dir: str
    scans: list[SeriesMetadata] = Field(default_factory=list)
    message: str = ""


class MRIValidationEnvelope(BaseModel):
    ok: bool
    details: dict[str, Any] = Field(default_factory=dict)
    message: str = ""


def detect_series_metadata(scan: io_mod.ConvertedScan) -> SeriesMetadata:
    """Build :class:`SeriesMetadata` from a :class:`~deepsynaps_mri.io.ConvertedScan`."""
    return SeriesMetadata(
        nifti_path=str(scan.nifti_path.resolve()),
        modality_guess=scan.modality_guess,
        n_volumes=scan.n_volumes,
        sidecar_path=str(scan.sidecar_path.resolve()) if scan.sidecar_path else None,
    )


def convert_to_nifti(
    dicom_dir: str | Path,
    out_dir: str | Path,
    *,
    anonymize: bool = True,
    stderr_log_path: Path | None = None,
) -> ConversionResult:
    """Convert DICOM directory to NIfTI (``dcm2niix`` or fallback)."""
    dicom_dir = Path(dicom_dir)
    out_dir = Path(out_dir)
    try:
        scans = io_mod.convert_dicom_to_nifti(
            dicom_dir,
            out_dir,
            anonymize=anonymize,
            stderr_log_path=stderr_log_path,
        )
    except Exception as exc:  # noqa: BLE001
        log.exception("convert_to_nifti failed")
        return ConversionResult(ok=False, message=str(exc))
    meta = [detect_series_metadata(s) for s in scans]
    return ConversionResult(ok=True, scans=meta, message="ok")


def validate_mri_input(path: str | Path) -> MRIValidationEnvelope:
    """
    Validate a NIfTI on disk (alias-friendly wrapper around ``validate_nifti_header``).

    For upload blobs use :func:`deepsynaps_mri.validation.validate_upload_blob`.
    """
    vr = validate_nifti_header(Path(path))
    return MRIValidationEnvelope(
        ok=vr.ok,
        details=vr.to_dict(),
        message=vr.message,
    )


def import_dicom_series(
    dicom_dir: str | Path,
    out_dir: str | Path,
    pseudo_patient_id: str,
) -> ImportDicomResult:
    """De-identify DICOMs and convert to NIfTI under ``out_dir``."""
    out_dir = Path(out_dir)
    try:
        scans = io_mod.ingest(Path(dicom_dir), out_dir, pseudo_patient_id=pseudo_patient_id)
    except Exception as exc:  # noqa: BLE001
        log.exception("import_dicom_series failed")
        return ImportDicomResult(
            ok=False,
            output_dir=str(out_dir.resolve()),
            message=str(exc),
        )
    meta = [detect_series_metadata(s) for s in scans]
    return ImportDicomResult(
        ok=True,
        output_dir=str(out_dir.resolve()),
        scans=meta,
        message="ok",
    )


__all__ = [
    "SeriesMetadata",
    "ConversionResult",
    "ImportDicomResult",
    "MRIValidationEnvelope",
    "convert_to_nifti",
    "detect_series_metadata",
    "import_dicom_series",
    "validate_mri_input",
]
