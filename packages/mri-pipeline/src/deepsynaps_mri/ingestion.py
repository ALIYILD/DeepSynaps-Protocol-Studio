"""
MRI study ingestion layer — DICOM series and NIfTI inputs.

This module provides typed entry points that compose :mod:`io` (de-ID,
``dcm2niix`` / ``dicom2nifti``) and :mod:`validation` (extension / magic /
header checks). Use it from the API façade or ``pipeline.py`` instead of
calling ``io`` helpers ad hoc.

Public functions
----------------
``import_dicom_series``
    Copy + de-identify DICOMs to a working directory; optional NIfTI conversion.
``detect_series_metadata``
    Scan a directory of DICOM files and return per-series acquisition hints.
``convert_to_nifti``
    Wrap ``io.convert_dicom_to_nifti`` with logging and a structured result.
``validate_mri_input``
    Validate a filesystem path (NIfTI file, ZIP bundle, or DICOM directory).

Decision-support context only — ingestion does not diagnose patients.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

from . import io as io_mod
from .validation import (
    ValidationResult,
    validate_extension,
    validate_nifti_header,
    validate_nifti_magic,
    validate_zip_archive,
)

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Result dataclasses (JSON-serialisable via ``to_dict()``)
# ---------------------------------------------------------------------------
@dataclass
class SeriesMetadata:
    """Summary for one DICOM series (non-PHI technical tags preferred)."""

    series_instance_uid: str
    series_number: int | None = None
    series_description: str | None = None
    modality: str | None = None
    series_date: str | None = None
    echo_time_ms: float | None = None
    repetition_time_ms: float | None = None
    protocol_name: str | None = None
    num_dicoms: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "series_instance_uid": self.series_instance_uid,
            "series_number": self.series_number,
            "series_description": self.series_description,
            "modality": self.modality,
            "series_date": self.series_date,
            "echo_time_ms": self.echo_time_ms,
            "repetition_time_ms": self.repetition_time_ms,
            "protocol_name": self.protocol_name,
            "num_dicoms": self.num_dicoms,
        }


@dataclass
class ConversionResult:
    """Output of :func:`convert_to_nifti`."""

    ok: bool
    scans: list[io_mod.ConvertedScan] = field(default_factory=list)
    converter: Literal["dcm2niix", "dicom2nifti"] | None = None
    stderr_log_path: Path | None = None
    code: str = ""
    message: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "scans": [_converted_scan_to_dict(s) for s in self.scans],
            "converter": self.converter,
            "stderr_log_path": str(self.stderr_log_path) if self.stderr_log_path else None,
            "code": self.code,
            "message": self.message,
        }


def _converted_scan_to_dict(s: io_mod.ConvertedScan) -> dict[str, Any]:
    return {
        "nifti_path": str(s.nifti_path),
        "sidecar_path": str(s.sidecar_path) if s.sidecar_path else None,
        "modality_guess": s.modality_guess,
        "n_volumes": s.n_volumes,
        "voxel_size_mm": list(s.voxel_size_mm) if s.voxel_size_mm else None,
        "acquisition_time": s.acquisition_time,
    }


@dataclass
class ImportDicomResult:
    """Output of :func:`import_dicom_series`."""

    ok: bool
    deidentified_dir: Path | None = None
    pseudo_patient_id: str = ""
    series: list[SeriesMetadata] = field(default_factory=list)
    n_files_deidentified: int = 0
    conversion: ConversionResult | None = None
    code: str = ""
    message: str = ""

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "ok": self.ok,
            "deidentified_dir": str(self.deidentified_dir) if self.deidentified_dir else None,
            "pseudo_patient_id": self.pseudo_patient_id,
            "series": [s.to_dict() for s in self.series],
            "n_files_deidentified": self.n_files_deidentified,
            "code": self.code,
            "message": self.message,
        }
        if self.conversion is not None:
            out["conversion"] = self.conversion.to_dict()
        return out


@dataclass
class MRIValidationEnvelope:
    """Filesystem validation result for API / logging."""

    ok: bool
    input_kind: Literal["nifti", "zip", "dicom_dir", "unknown"] = "unknown"
    path: str = ""
    validation: ValidationResult | None = None
    dicom_file_count: int = 0
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "input_kind": self.input_kind,
            "path": self.path,
            "validation": self.validation.to_dict() if self.validation else None,
            "dicom_file_count": self.dicom_file_count,
            "warnings": list(self.warnings),
        }


# ---------------------------------------------------------------------------
# detect_series_metadata
# ---------------------------------------------------------------------------
def detect_series_metadata(
    dicom_root: str | Path,
    *,
    max_files_per_series_sample: int = 1,
) -> list[SeriesMetadata]:
    """
    Scan ``dicom_root`` recursively for DICOM files and group by
    ``SeriesInstanceUID``.

    Reads at most ``max_files_per_series_sample`` files per series for tag
    extraction (first file wins for numeric/string tags).

    Parameters
    ----------
    dicom_root
        Directory containing DICOM files (de-identified recommended).
    max_files_per_series_sample
        Reserved for future multi-slice consistency checks; currently only the
        first file per series is read for metadata.

    Returns
    -------
    list[SeriesMetadata]
        One entry per discovered series, sorted by ``series_instance_uid``.

    Raises
    ------
    FileNotFoundError
        If ``dicom_root`` does not exist.
    ImportError
        If ``pydicom`` is not installed (optional neuro extra).
    """
    root = Path(dicom_root).resolve()
    if not root.is_dir():
        raise FileNotFoundError(f"DICOM root is not a directory: {root}")

    try:
        import pydicom
    except ImportError as exc:
        raise ImportError(
            "detect_series_metadata requires pydicom; install with "
            "`pip install -e '.[neuro]'` from packages/mri-pipeline.",
        ) from exc

    # series_uid -> { "paths": [...], "meta": SeriesMetadata | None }
    buckets: dict[str, dict[str, Any]] = {}

    for fpath in sorted(root.rglob("*")):
        if not fpath.is_file():
            continue
        try:
            ds = pydicom.dcmread(fpath, force=True, stop_before_pixels=True)
        except Exception as exc:  # noqa: BLE001
            log.debug("Skip non-DICOM %s: %s", fpath, exc)
            continue

        suid = str(getattr(ds, "SeriesInstanceUID", "") or "unknown")
        if suid not in buckets:
            buckets[suid] = {"paths": [], "sampled": False}

        buckets[suid]["paths"].append(fpath)

        if buckets[suid]["sampled"]:
            continue
        if len(buckets[suid]["paths"]) > max_files_per_series_sample:
            continue

        series_number = getattr(ds, "SeriesNumber", None)
        try:
            snum = int(series_number) if series_number is not None else None
        except (TypeError, ValueError):
            snum = None

        et = getattr(ds, "EchoTime", None)
        tr = getattr(ds, "RepetitionTime", None)
        try:
            et_f = float(et) if et is not None else None
        except (TypeError, ValueError):
            et_f = None
        try:
            tr_f = float(tr) if tr is not None else None
        except (TypeError, ValueError):
            tr_f = None

        sd = getattr(ds, "SeriesDescription", None)
        modality = getattr(ds, "Modality", None)
        sdate = getattr(ds, "SeriesDate", None)
        proto = getattr(ds, "ProtocolName", None)

        buckets[suid]["meta"] = SeriesMetadata(
            series_instance_uid=suid,
            series_number=snum,
            series_description=str(sd).strip() if sd else None,
            modality=str(modality).strip() if modality else None,
            series_date=str(sdate).strip() if sdate else None,
            echo_time_ms=et_f,
            repetition_time_ms=tr_f,
            protocol_name=str(proto).strip() if proto else None,
            num_dicoms=0,
        )
        buckets[suid]["sampled"] = True

    result: list[SeriesMetadata] = []
    for suid in sorted(buckets.keys()):
        info = buckets[suid]
        n = len(info["paths"])
        meta_obj = info.get("meta")
        if meta_obj is None:
            # Series discovered by path grouping only — minimal entry
            meta_obj = SeriesMetadata(series_instance_uid=suid, num_dicoms=n)
        else:
            meta_obj.num_dicoms = n
        result.append(meta_obj)

    log.info("detect_series_metadata: %d series under %s", len(result), root)
    return result


# ---------------------------------------------------------------------------
# convert_to_nifti
# ---------------------------------------------------------------------------
def convert_to_nifti(
    dicom_dir: str | Path,
    out_dir: str | Path,
    *,
    anonymize_bids_sidecar: bool = True,
    stderr_log_path: str | Path | None = None,
) -> ConversionResult:
    """
    Convert de-identified DICOM files under ``dicom_dir`` to NIfTI + JSON sidecars.

    Uses ``dcm2niix`` when available; otherwise ``dicom2nifti`` (see :mod:`io`).
    Subprocess output may be written to ``stderr_log_path`` when using dcm2niix.

    Parameters
    ----------
    dicom_dir
        Folder containing DICOMs (typically output of :func:`import_dicom_series`).
    out_dir
        Directory for ``*.nii.gz`` and ``*.json`` outputs (created if missing).
    anonymize_bids_sidecar
        Passed to ``dcm2niix -ba`` when True.
    stderr_log_path
        Optional path to write combined stdout/stderr from ``dcm2niix``.

    Returns
    -------
    ConversionResult
        ``ok`` is False only when conversion raises; caller should inspect ``code``.
    """
    src = Path(dicom_dir).resolve()
    dst = Path(out_dir).resolve()
    log_path = Path(stderr_log_path).resolve() if stderr_log_path else None

    if not src.is_dir():
        return ConversionResult(
            ok=False,
            code="dicom_dir_missing",
            message=f"DICOM directory does not exist: {src}",
        )

    converter: Literal["dcm2niix", "dicom2nifti"] = (
        "dcm2niix" if io_mod._dcm2niix_available() else "dicom2nifti"
    )

    try:
        scans = io_mod.convert_dicom_to_nifti(
            src,
            dst,
            anonymize=anonymize_bids_sidecar,
            stderr_log_path=log_path,
        )
    except Exception as exc:  # noqa: BLE001
        log.exception("convert_to_nifti failed: %s", exc)
        return ConversionResult(
            ok=False,
            converter=converter,
            stderr_log_path=log_path,
            code="conversion_failed",
            message=str(exc),
        )

    return ConversionResult(
        ok=True,
        scans=scans,
        converter=converter,
        stderr_log_path=log_path,
        message=f"Converted {len(scans)} NIfTI output(s).",
    )


# ---------------------------------------------------------------------------
# import_dicom_series
# ---------------------------------------------------------------------------
def import_dicom_series(
    dicom_source_dir: str | Path,
    work_dir: str | Path,
    pseudo_patient_id: str,
    *,
    nifti_out_dir: str | Path | None = None,
    stderr_log_path: str | Path | None = None,
) -> ImportDicomResult:
    """
    De-identify DICOMs from ``dicom_source_dir`` into ``work_dir/deidentified``.

    Optionally converts to NIfTI when ``nifti_out_dir`` is set (usually under
    ``work_dir/nifti``).

    Parameters
    ----------
    dicom_source_dir
        Raw or staging directory containing DICOM files (recursive scan).
    work_dir
        Writable workspace; ``deidentified/`` is created inside it.
    pseudo_patient_id
        Replacement token for PHI fields (see :func:`io.deidentify_dicom_dir`).
    nifti_out_dir
        If set, run :func:`convert_to_nifti` on the de-identified tree.
    stderr_log_path
        Optional log path forwarded to ``dcm2niix`` capture.

    Returns
    -------
    ImportDicomResult
        Always returns a structured object; ``ok`` is False on failure.
    """
    src = Path(dicom_source_dir).resolve()
    work = Path(work_dir).resolve()

    if not src.is_dir():
        return ImportDicomResult(
            ok=False,
            code="source_missing",
            message=f"DICOM source directory does not exist: {src}",
            pseudo_patient_id=pseudo_patient_id,
        )

    deid = work / "deidentified"
    try:
        io_mod.deidentify_dicom_dir(src, deid, pseudo_patient_id)
    except Exception as exc:  # noqa: BLE001
        log.exception("deidentify_dicom_dir failed")
        return ImportDicomResult(
            ok=False,
            code="deidentify_failed",
            message=str(exc),
            pseudo_patient_id=pseudo_patient_id,
        )

    n_files = sum(1 for _ in deid.rglob("*") if _.is_file())

    try:
        series = detect_series_metadata(deid)
    except Exception as exc:  # noqa: BLE001
        log.warning("detect_series_metadata after de-ID failed: %s", exc)
        series = []

    conv: ConversionResult | None = None
    if nifti_out_dir is not None:
        n_out = Path(nifti_out_dir).resolve()
        log_path = Path(stderr_log_path).resolve() if stderr_log_path else (n_out / "dcm2niix.log")
        conv = convert_to_nifti(deid, n_out, stderr_log_path=log_path)

    ok = True
    code = "ok"
    msg = f"De-identified {n_files} file(s) into {deid}"
    if conv is not None and not conv.ok:
        ok = False
        code = conv.code or "conversion_failed"
        msg = conv.message

    return ImportDicomResult(
        ok=ok,
        deidentified_dir=deid,
        pseudo_patient_id=pseudo_patient_id,
        series=series,
        n_files_deidentified=n_files,
        conversion=conv,
        code=code,
        message=msg,
    )


# ---------------------------------------------------------------------------
# validate_mri_input
# ---------------------------------------------------------------------------
def _read_head_bytes(path: Path, limit: int = 2 * 1024 * 1024) -> bytes:
    """Read up to ``limit`` bytes for magic checks (NIfTI gzip head)."""
    with path.open("rb") as fh:
        return fh.read(limit)


def validate_mri_input(
    path: str | Path,
    *,
    kind: Literal["auto", "nifti", "zip", "dicom_dir"] = "auto",
) -> MRIValidationEnvelope:
    """
    Validate a filesystem input intended for the MRI pipeline.

    * **NIfTI** (``.nii`` / ``.nii.gz``): extension whitelist, magic bytes,
      optional deep header check via nibabel when installed.
    * **ZIP**: structural integrity via :func:`validation.validate_zip_archive`
      (reads entire file — acceptable for upload-sized bundles).
    * **DICOM directory**: existence + at least one pydicom-readable file.

    Parameters
    ----------
    path
        File or directory path.
    kind
        ``auto`` infers from path (directory → ``dicom_dir``, else extension).

    Returns
    -------
    MRIValidationEnvelope
        JSON-serialisable via :meth:`MRIValidationEnvelope.to_dict`.
    """
    p = Path(path).resolve()
    resolved_kind = kind

    if kind == "auto":
        if p.is_dir():
            resolved_kind = "dicom_dir"
        else:
            ext = p.name.lower()
            if ext.endswith(".nii.gz"):
                resolved_kind = "nifti"
            elif ext.endswith(".nii"):
                resolved_kind = "nifti"
            elif ext.endswith(".zip"):
                resolved_kind = "zip"
            else:
                vext = validate_extension(p.name)
                return MRIValidationEnvelope(
                    ok=False,
                    input_kind="unknown",
                    path=str(p),
                    validation=vext,
                )

    if resolved_kind == "dicom_dir":
        if not p.is_dir():
            return MRIValidationEnvelope(
                ok=False,
                input_kind="dicom_dir",
                path=str(p),
                validation=ValidationResult(
                    ok=False,
                    code="path_not_directory",
                    message=f"Expected directory for DICOM ingest: {p}",
                ),
            )
        try:
            import pydicom
        except ImportError:
            return MRIValidationEnvelope(
                ok=False,
                input_kind="dicom_dir",
                path=str(p),
                validation=ValidationResult(
                    ok=False,
                    code="pydicom_missing",
                    message="pydicom required for DICOM directory validation.",
                ),
            )
        n_ok = 0
        for fpath in p.rglob("*"):
            if not fpath.is_file():
                continue
            try:
                pydicom.dcmread(fpath, force=True, stop_before_pixels=True)
                n_ok += 1
                if n_ok >= 1:
                    break
            except Exception:  # noqa: BLE001
                continue
        if n_ok == 0:
            return MRIValidationEnvelope(
                ok=False,
                input_kind="dicom_dir",
                path=str(p),
                validation=ValidationResult(
                    ok=False,
                    code="dicom_none_readable",
                    message=f"No readable DICOM files under {p}",
                ),
                dicom_file_count=0,
            )
        total_dicom = sum(
            1
            for fp in p.rglob("*")
            if fp.is_file()
            and _quick_dicom_probe(fp)
        )
        return MRIValidationEnvelope(
            ok=True,
            input_kind="dicom_dir",
            path=str(p),
            validation=ValidationResult(ok=True, details={"readable": True}),
            dicom_file_count=total_dicom,
        )

    if resolved_kind == "zip":
        if not p.is_file():
            return MRIValidationEnvelope(
                ok=False,
                input_kind="zip",
                path=str(p),
                validation=ValidationResult(
                    ok=False,
                    code="zip_not_file",
                    message=f"ZIP path is not a file: {p}",
                ),
            )
        blob = p.read_bytes()
        zr = validate_zip_archive(blob)
        return MRIValidationEnvelope(
            ok=zr.ok,
            input_kind="zip",
            path=str(p),
            validation=zr,
        )

    # nifti
    if not p.is_file():
        return MRIValidationEnvelope(
            ok=False,
            input_kind="nifti",
            path=str(p),
            validation=ValidationResult(
                ok=False,
                code="nifti_not_file",
                message=f"NIfTI path is not a file: {p}",
            ),
        )

    vext = validate_extension(p.name)
    if not vext.ok:
        return MRIValidationEnvelope(
            ok=False,
            input_kind="nifti",
            path=str(p),
            validation=vext,
        )

    head = _read_head_bytes(p)
    vm = validate_nifti_magic(head)
    if not vm.ok:
        return MRIValidationEnvelope(
            ok=False,
            input_kind="nifti",
            path=str(p),
            validation=vm,
        )

    vh = validate_nifti_header(p)
    warnings: list[str] = []
    if vh.code == "header_check_skipped":
        warnings.append(vh.message)

    if not vh.ok:
        return MRIValidationEnvelope(
            ok=False,
            input_kind="nifti",
            path=str(p),
            validation=vh,
            warnings=warnings,
        )

    merged = ValidationResult(ok=True, details={**vm.details, **vh.details})
    return MRIValidationEnvelope(
        ok=True,
        input_kind="nifti",
        path=str(p),
        validation=merged,
        warnings=warnings,
    )


def _quick_dicom_probe(fpath: Path) -> bool:
    try:
        import pydicom

        pydicom.dcmread(fpath, force=True, stop_before_pixels=True)
        return True
    except Exception:  # noqa: BLE001
        return False


__all__ = [
    "ConversionResult",
    "ImportDicomResult",
    "MRIValidationEnvelope",
    "SeriesMetadata",
    "convert_to_nifti",
    "detect_series_metadata",
    "import_dicom_series",
    "validate_mri_input",
]
