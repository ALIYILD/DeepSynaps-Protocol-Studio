"""
DICOM ingest + de-identification + NIfTI conversion.

Preferred converter: `dcm2niix` (system binary, BIDS-compatible).
Python fallback: `dicom2nifti` (pure-python; slower; less BIDS-rich).

De-identification strategy:
    1. Parse all files with pydicom.
    2. Apply a conservative tag blacklist (patient, institution, UIDs that leak).
    3. Optionally defer to the `deid` library with a recipe file if present.
    4. Write cleaned DICOMs to a scratch dir OR go directly DICOM → NIfTI and
       drop the DICOM entirely once conversion succeeds.

Design goal: keep PHI out of the pipeline after step 1. All downstream steps
only see NIfTI + a JSON sidecar (BIDS) with preserved acquisition params.

Notes
-----
- Face-stripping (`pydeface` / `mri_deface`) is called from `pipeline.py` after
  the T1 NIfTI has been produced.
- For `dcm2niix`, we pass `-ba y` (anonymize BIDS sidecar). See
  https://github.com/rordenlab/dcm2niix/blob/master/BIDS/README.md
"""
from __future__ import annotations

import json
import logging
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

log = logging.getLogger(__name__)


# DICOM tags we always blank. Pydicom uses group,element form.
# Covers the Global Private Information list from dcm2niix BIDS README.
_PHI_TAGS_TO_BLANK: tuple[tuple[int, int], ...] = (
    (0x0008, 0x0090),   # ReferringPhysicianName
    (0x0008, 0x0050),   # AccessionNumber
    (0x0010, 0x0010),   # PatientName
    (0x0010, 0x0020),   # PatientID
    (0x0010, 0x0030),   # PatientBirthDate
    (0x0010, 0x1000),   # OtherPatientIDs
    (0x0010, 0x1001),   # OtherPatientNames
    (0x0010, 0x2160),   # EthnicGroup
    (0x0010, 0x4000),   # PatientComments
    (0x0038, 0x0500),   # PatientState
    (0x0008, 0x1050),   # PerformingPhysicianName
    (0x0008, 0x1060),   # NameOfPhysiciansReadingStudy
    (0x0008, 0x1070),   # OperatorsName
    (0x0008, 0x0080),   # InstitutionName
    (0x0008, 0x0081),   # InstitutionAddress
    (0x0008, 0x1040),   # InstitutionalDepartmentName
)

# Tags we *preserve* even in anon mode because pipelines need them
# (diffusion gradients, slice timing, etc.). dcm2niix reads these from CSA.
_PHI_TAGS_TO_KEEP: tuple[tuple[int, int], ...] = (
    (0x0029, 0x1010),   # Siemens CSA Image Header Info (gradient dirs)
    (0x0029, 0x1020),   # Siemens CSA Series Header Info
    (0x0019, 0x000C),   # gradient direction
    (0x0019, 0x000D),   # bval
)


@dataclass
class ConvertedScan:
    """Result of converting a single DICOM series to NIfTI."""
    nifti_path: Path
    sidecar_path: Path | None
    modality_guess: str         # "T1w", "T2w", "FLAIR", "bold", "dwi", ...
    n_volumes: int
    voxel_size_mm: tuple[float, float, float] | None = None
    acquisition_time: str | None = None


# ---------------------------------------------------------------------------
# De-identification
# ---------------------------------------------------------------------------
def deidentify_dicom_dir(
    dicom_dir: Path,
    out_dir: Path,
    pseudo_patient_id: str,
) -> Path:
    """
    Walk `dicom_dir`, copy every DICOM into `out_dir` with PHI tags blanked.

    TODO: integrate pydicom.deid recipe file support (blacklist/whitelist/graylist).
    TODO: add an optional flag to keep date year only (for age-at-scan calculations).

    Parameters
    ----------
    dicom_dir : Path
        Input directory (recursive scan).
    out_dir : Path
        Clean output directory (will be created; must be empty).
    pseudo_patient_id : str
        Replacement token for all PHI name/ID fields, e.g. "DS-2026-000123".

    Returns
    -------
    Path : out_dir
    """
    import pydicom

    out_dir.mkdir(parents=True, exist_ok=True)
    n_files = 0
    for f in dicom_dir.rglob("*"):
        if not f.is_file():
            continue
        try:
            ds = pydicom.dcmread(f, force=True)
        except Exception as exc:  # noqa: BLE001
            log.warning("Skipping unreadable %s: %s", f, exc)
            continue

        for g, e in _PHI_TAGS_TO_BLANK:
            if (g, e) in ds:
                ds[(g, e)].value = pseudo_patient_id if (g, e) in {
                    (0x0010, 0x0010), (0x0010, 0x0020),
                } else ""

        # Write into a series-indexed sub-path
        series_uid = getattr(ds, "SeriesInstanceUID", "unknown")
        target_dir = out_dir / series_uid
        target_dir.mkdir(exist_ok=True)
        ds.save_as(target_dir / f.name)
        n_files += 1

    log.info("De-identified %d DICOM files into %s", n_files, out_dir)
    return out_dir


# ---------------------------------------------------------------------------
# DICOM → NIfTI via dcm2niix (preferred)
# ---------------------------------------------------------------------------
def _dcm2niix_available() -> bool:
    return shutil.which("dcm2niix") is not None


def convert_dicom_to_nifti(
    dicom_dir: Path,
    out_dir: Path,
    anonymize: bool = True,
    *,
    stderr_log_path: Path | None = None,
) -> list[ConvertedScan]:
    """
    Convert a DICOM directory into one or more NIfTI files.

    Uses `dcm2niix` if available (recommended), else falls back to `dicom2nifti`.

    dcm2niix flags used:
        -b y   : write BIDS sidecar JSON
        -ba y  : anonymize BIDS sidecar
        -z y   : gzip output
        -f %d_%s : filename template (SeriesDescription_SeriesNumber)

    stderr_log_path
        If set, ``dcm2niix`` stderr is appended here on failure (audit trail).
        Successful runs do not write this file unless stderr is non-empty
        (warnings are logged at INFO).

    Returns a list of `ConvertedScan`, one per output series.

    TODO:
        - parse the BIDS JSON sidecars and infer BIDS modality labels
        - handle multi-echo EPI
        - surface warnings from dcm2niix stderr to `ConvertedScan.notes`
    """
    out_dir.mkdir(parents=True, exist_ok=True)

    if _dcm2niix_available():
        cmd = [
            "dcm2niix",
            "-b", "y",
            "-ba", "y" if anonymize else "n",
            "-z", "y",
            "-f", "%d_%s",
            "-o", str(out_dir),
            str(dicom_dir),
        ]
        log.info("Running: %s", " ".join(cmd))
        try:
            proc = subprocess.run(cmd, check=True, capture_output=True, text=True)
            if proc.stderr and proc.stderr.strip():
                log.info("dcm2niix stderr: %s", proc.stderr.strip()[:2000])
        except subprocess.CalledProcessError as exc:
            err = (exc.stderr or "").strip()
            log.error("dcm2niix failed: %s", err[:2000] if err else exc)
            if stderr_log_path is not None:
                stderr_log_path = Path(stderr_log_path)
                stderr_log_path.parent.mkdir(parents=True, exist_ok=True)
                stderr_log_path.write_text(
                    f"command: {' '.join(cmd)}\nreturncode: {exc.returncode}\n\n{exc.stderr or ''}",
                    encoding="utf-8",
                )
            raise
    else:
        log.warning("dcm2niix not installed; falling back to dicom2nifti (slower, less BIDS-rich)")
        _fallback_dicom2nifti(dicom_dir, out_dir)

    return _collect_outputs(out_dir)


def _fallback_dicom2nifti(dicom_dir: Path, out_dir: Path) -> None:
    import dicom2nifti
    dicom2nifti.convert_directory(str(dicom_dir), str(out_dir), compression=True)


def _collect_outputs(out_dir: Path) -> list[ConvertedScan]:
    """Walk `out_dir` and build ConvertedScan records, pairing .nii.gz with .json sidecars."""
    import nibabel as nib

    scans: list[ConvertedScan] = []
    for nii in sorted(out_dir.glob("*.nii.gz")):
        sidecar = nii.with_suffix("").with_suffix(".json")
        sidecar_path = sidecar if sidecar.exists() else None
        meta = {}
        if sidecar_path:
            try:
                meta = json.loads(sidecar_path.read_text())
            except Exception:  # noqa: BLE001
                meta = {}

        try:
            img = nib.load(str(nii))
            n_vols = img.shape[3] if img.ndim == 4 else 1
            vox = tuple(map(float, img.header.get_zooms()[:3]))
        except Exception:  # noqa: BLE001
            n_vols, vox = 1, None

        modality = _guess_modality(meta, nii.name)
        scans.append(ConvertedScan(
            nifti_path=nii,
            sidecar_path=sidecar_path,
            modality_guess=modality,
            n_volumes=n_vols,
            voxel_size_mm=vox,
            acquisition_time=meta.get("AcquisitionTime"),
        ))
    return scans


def _guess_modality(meta: dict, filename: str) -> str:
    series = (meta.get("SeriesDescription") or "").lower() + " " + filename.lower()
    if "flair" in series:
        return "FLAIR"
    if "t2" in series and "t2star" not in series:
        return "T2w"
    if "mprage" in series or "t1" in series:
        return "T1w"
    if "bold" in series or "rest" in series or "epi" in series:
        return "bold"
    if "dwi" in series or "dti" in series or "diff" in series:
        return "dwi"
    if "asl" in series or "pcasl" in series:
        return "asl"
    return "unknown"


# ---------------------------------------------------------------------------
# Convenience: one-shot ingestion
# ---------------------------------------------------------------------------
def ingest(
    dicom_dir: Path,
    out_dir: Path,
    pseudo_patient_id: str,
) -> list[ConvertedScan]:
    """
    Full ingest pipeline:
        1. De-identify DICOMs into a temp folder
        2. Convert to NIfTI + BIDS sidecars
        3. Delete the cleaned DICOM temp folder
    """
    with tempfile.TemporaryDirectory(prefix="ds_mri_deid_") as td:
        clean = Path(td) / "clean"
        deidentify_dicom_dir(dicom_dir, clean, pseudo_patient_id)
        scans = convert_dicom_to_nifti(clean, out_dir, anonymize=True)
    return scans
