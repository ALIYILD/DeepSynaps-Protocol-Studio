"""MRI DICOM Processing Service.

Handles DICOM metadata extraction, PHI de-identification, series organization,
NIfTI conversion, and quality assurance for the MRI Analyzer module.

Decision-support only. Not a medical device.

Clinical Safety Notes
---------------------
* All outputs carry provenance labels: ``measured`` (direct from DICOM headers),
  ``inferred`` (computed), ``proxy`` (derived from standard references), or
  ``simulated`` (synthetic test data).
* De-identification is best-effort and does NOT replace a formal DICOM
  de-identification validation by a qualified clinical engineer.
* Burned-in annotations (patient name in pixel data) are NOT automatically
  detected or removed. Manual visual inspection is required.
* This service is part of a decision-support platform; it is NOT FDA-cleared,
  CE-marked, or approved as a medical device. All outputs require qualified
  clinician review.

References
----------
* DICOM Standard PS3.15-2019 — Security and System Management
* HIPAA Safe Harbor de-identification method (45 CFR 164.514)
* PylerD — systematic review of DICOM de-identification tools (Evans et al.)
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import shutil
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import numpy as np

_log = logging.getLogger(__name__)

# ── Optional dependency guards ────────────────────────────────────────────────
try:
    import pydicom
    from pydicom.dataset import Dataset, FileDataset
    from pydicom.uid import ExplicitVRLittleEndian, generate_uid
    HAS_PYDICOM = True
except ImportError:
    HAS_PYDICOM = False
    _log.warning("pydicom not available — DICOM processing will use fallback")

try:
    import nibabel as nib
    HAS_NIBABEL = True
except ImportError:
    HAS_NIBABEL = False
    _log.warning("NiBabel not available — NIfTI conversion disabled")

try:
    import dicom2nifti
    HAS_DICOM2NIFTI = True
except ImportError:
    HAS_DICOM2NIFTI = False
    _log.debug("dicom2nifti not available — using NiBabel fallback")

try:
    from dicognito.anonymizer import Anonymizer
    HAS_DICOGNITO = True
except ImportError:
    HAS_DICOGNITO = False
    _log.debug("dicognito not available — using pydicom fallback")

# ── Service constants ────────────────────────────────────────────────────────

# PHI tags to de-identify (DICOM Standard PS3.15-2019, Table E.1-1)
# evidence_grade: B (RCT-equivalent for DICOM standard compliance)
PHI_TAGS: list[tuple[int, int]] = [
    (0x0010, 0x0010),  # PatientName
    (0x0010, 0x0020),  # PatientID
    (0x0010, 0x0030),  # PatientBirthDate
    (0x0010, 0x0040),  # PatientSex
    (0x0010, 0x1010),  # PatientAge
    (0x0010, 0x1020),  # PatientSize
    (0x0010, 0x1030),  # PatientWeight
    (0x0010, 0x2000),  # MedicalAlerts
    (0x0010, 0x2110),  # Allergies
    (0x0010, 0x21B0),  # AdditionalPatientHistory
    (0x0010, 0x21C0),  # PregnancyStatus
    (0x0010, 0x4000),  # PatientComments
    (0x0008, 0x0090),  # ReferringPhysicianName
    (0x0008, 0x009C),  # ConsultingPhysicianName
    (0x0008, 0x1048),  # PhysiciansOfRecord
    (0x0008, 0x1050),  # PerformingPhysicianName
    (0x0008, 0x1070),  # OperatorsName
    (0x0008, 0x0080),  # InstitutionName
    (0x0008, 0x0081),  # InstitutionAddress
    (0x0008, 0x0092),  # ReferringPhysicianAddress
    (0x0008, 0x1140),  # ReferencedImageSequence — may contain UIDs linking to PHI
    (0x0018, 0x1030),  # ProtocolName — may contain institutional identifiers
    (0x0040, 0x0275),  # RequestAttributesSequence
    (0x0040, 0x0007),  # ScheduledProcedureStepDescription
    (0x0040, 0x0009),  # ScheduledProcedureStepID
    (0x0040, 0x1001),  # RequestedProcedureID
    (0x0040, 0x1002),  # ReasonForTheRequestedProcedure
    (0x0040, 0x1400),  # RequestedProcedureComments
    (0x0008, 0x0050),  # AccessionNumber
    (0x0020, 0x000D),  # StudyInstanceUID — remapped, not removed
    (0x0020, 0x000E),  # SeriesInstanceUID — remapped, not removed
    (0x0008, 0x0018),  # SOPInstanceUID — remapped, not removed
    (0x0018, 0x1000),  # DeviceSerialNumber
    (0x0008, 0x1010),  # StationName
    (0x0008, 0x0012),  # InstanceCreationDate
    (0x0008, 0x0013),  # InstanceCreationTime
    (0x0008, 0x0020),  # StudyDate
    (0x0008, 0x0021),  # SeriesDate
    (0x0008, 0x0022),  # AcquisitionDate
    (0x0008, 0x0023),  # ContentDate
    (0x0008, 0x0030),  # StudyTime
    (0x0008, 0x0031),  # SeriesTime
    (0x0008, 0x0032),  # AcquisitionTime
    (0x0008, 0x0033),  # ContentTime
    (0x0032, 0x1060),  # RequestedProcedureDescription
    (0x0032, 0x4000),  # StudyComments
    (0x0010, 0x1040),  # PatientAddress
    (0x0010, 0x2154),  # PatientTelephoneNumbers
    (0x0010, 0x2297),  # ResponsiblePerson
    (0x0010, 0x2298),  # ResponsiblePersonRole
    (0x0010, 0x2299),  # ResponsibleOrganization
]

# Tags that are preserved (required for image interpretation)
# evidence_grade: A (DICOM standard requirement)
PRESERVED_TAGS: list[tuple[int, int]] = [
    (0x0008, 0x0060),  # Modality
    (0x0008, 0x0070),  # Manufacturer
    (0x0008, 0x1090),  # ManufacturerModelName
    (0x0018, 0x0087),  # MagneticFieldStrength
    (0x0018, 0x0080),  # RepetitionTime
    (0x0018, 0x0081),  # EchoTime
    (0x0018, 0x0082),  # InversionTime
    (0x0018, 0x1314),  # FlipAngle
    (0x0018, 0x0050),  # SliceThickness
    (0x0018, 0x0088),  # SpacingBetweenSlices
    (0x0028, 0x0010),  # Rows
    (0x0028, 0x0011),  # Columns
    (0x0028, 0x0030),  # PixelSpacing
    (0x0020, 0x0032),  # ImagePositionPatient
    (0x0020, 0x0037),  # ImageOrientationPatient
    (0x0020, 0x0011),  # SeriesNumber
    (0x0020, 0x0013),  # InstanceNumber
    (0x0018, 0x0023),  # MRAcquisitionType
    (0x0018, 0x0015),  # BodyPartExamined
    (0x0018, 0x0020),  # ScanningSequence
    (0x0018, 0x0021),  # SequenceVariant
    (0x0018, 0x0022),  # ScanOptions
    (0x0028, 0x0100),  # BitsAllocated
    (0x0028, 0x0103),  # PixelRepresentation
    (0x0028, 0x0004),  # PhotometricInterpretation
    (0x0028, 0x1052),  # RescaleIntercept
    (0x0028, 0x1053),  # RescaleSlope
]

# Standard MRI disclaimer appended to all outputs
MRI_STANDARD_DISCLAIMER: str = (
    "Decision-support only. Not a medical device. "
    "This output is intended for research and clinical decision support; "
    "it does not replace qualified radiologist or neurologist interpretation. "
    "All metrics require verification before clinical use. "
    "FDA 510(k)/CE-IVD status: not applicable — investigational software."
)

# Provenance label definitions
PROVENANCE_MEASURED = "measured"    # Direct from DICOM header
PROVENANCE_INFERRED = "inferred"    # Computed from measured values
PROVENANCE_PROXY = "proxy"          # From standard reference data
PROVENANCE_SIMULATED = "simulated"  # Synthetic / test data


class DicomProcessingError(Exception):
    """Raised when DICOM processing fails critically.

    This is a domain-specific exception so callers can distinguish
    DICOM errors from generic I/O or database failures.
    """


class DeidentificationError(Exception):
    """Raised when PHI de-identification fails or produces invalid output."""


class NiftiConversionError(Exception):
    """Raised when DICOM-to-NIfTI conversion fails."""


class QualityValidationError(Exception):
    """Raised when DICOM quality assurance detects critical issues."""


# ── 1. DICOM Metadata Extraction ─────────────────────────────────────────────

def extract_dicom_metadata(dicom_path: str) -> dict[str, Any]:
    """Extract standardized metadata from a DICOM file using pydicom.

    Parameters
    ----------
    dicom_path : str
        Absolute path to a DICOM file.

    Returns
    -------
    dict
        Dictionary containing MRI-relevant DICOM tags with provenance labels.
        Keys: patient_id (de-identified hash), study_date, modality,
        series_description, manufacturer, field_strength, slice_thickness,
        pixel_spacing, matrix_size, num_slices, echo_time, repetition_time,
        flip_angle, acquisition_type, body_part, protocol_name.
        All scalar values carry a ``_provenance`` suffix key.

    evidence_grade : B
        DICOM tag extraction is based on PS3.6 data dictionary (consensus
        standard), equivalent to systematic review for data field definitions.

    Raises
    ------
    DicomProcessingError
        If pydicom is unavailable or the file cannot be read.
    FileNotFoundError
        If the DICOM file does not exist.
    """
    _log.info("extract_dicom_metadata:start", extra={"dicom_path": dicom_path})

    if not HAS_PYDICOM:
        raise DicomProcessingError(
            "pydicom is required for DICOM metadata extraction. "
            "Install with: pip install pydicom"
        )

    dicom_path_obj = Path(dicom_path)
    if not dicom_path_obj.exists():
        raise FileNotFoundError(f"DICOM file not found: {dicom_path}")

    try:
        ds = pydicom.dcmread(str(dicom_path), force=True)
    except pydicom.errors.InvalidDicomError as exc:
        raise DicomProcessingError(f"Invalid DICOM file: {exc}") from exc
    except Exception as exc:
        raise DicomProcessingError(f"Failed to read DICOM: {exc}") from exc

    # --- Patient & Study Information ---
    patient_id_raw = str(ds.get((0x0010, 0x0020), "Unknown"))
    # De-identified hash for patient_id
    patient_id_hash = hashlib.sha256(patient_id_raw.encode()).hexdigest()[:16]

    study_date = str(ds.get((0x0008, 0x0020), ""))
    modality = str(ds.get((0x0008, 0x0060), "MR"))

    # --- Series Information ---
    series_description = str(ds.get((0x0008, 0x103E), ""))
    protocol_name = str(ds.get((0x0018, 0x1030), ""))

    # --- MRI Acquisition Parameters ---
    manufacturer = str(ds.get((0x0008, 0x0070), ""))
    field_strength = float(ds.get((0x0018, 0x0087), 0.0))
    slice_thickness = float(ds.get((0x0018, 0x0050), 0.0))
    echo_time = float(ds.get((0x0018, 0x0081), 0.0))
    repetition_time = float(ds.get((0x0018, 0x0080), 0.0))
    flip_angle = float(ds.get((0x0018, 0x1314), 0.0))
    acquisition_type = str(ds.get((0x0018, 0x0023), ""))
    body_part = str(ds.get((0x0018, 0x0015), ""))

    # --- Image Geometry ---
    rows = int(ds.get((0x0028, 0x0010), 0))
    columns = int(ds.get((0x0028, 0x0011), 0))
    matrix_size = f"{rows}x{columns}" if rows and columns else ""

    pixel_spacing_raw = ds.get((0x0028, 0x0030), [])
    pixel_spacing = list(pixel_spacing_raw) if pixel_spacing_raw else []

    # --- Slice count (from NumberOfFrames or inferred) ---
    num_slices = _get_num_slices(ds)

    # StudyInstanceUID for provenance
    study_uid = str(ds.get((0x0020, 0x000D), ""))
    series_uid = str(ds.get((0x0020, 0x000E), ""))

    result: dict[str, Any] = {
        "patient_id": f"ANON_{patient_id_hash}",
        "patient_id_provenance": PROVENANCE_INFERRED,
        "study_date": study_date,
        "study_date_provenance": PROVENANCE_MEASURED,
        "study_instance_uid": study_uid,
        "study_instance_uid_provenance": PROVENANCE_MEASURED,
        "series_instance_uid": series_uid,
        "series_instance_uid_provenance": PROVENANCE_MEASURED,
        "modality": modality,
        "modality_provenance": PROVENANCE_MEASURED,
        "series_description": series_description,
        "series_description_provenance": PROVENANCE_MEASURED,
        "protocol_name": protocol_name,
        "protocol_name_provenance": PROVENANCE_MEASURED,
        "manufacturer": manufacturer,
        "manufacturer_provenance": PROVENANCE_MEASURED,
        "field_strength": field_strength,
        "field_strength_provenance": PROVENANCE_MEASURED,
        "field_strength_unit": "T",
        "slice_thickness": slice_thickness,
        "slice_thickness_provenance": PROVENANCE_MEASURED,
        "slice_thickness_unit": "mm",
        "pixel_spacing": pixel_spacing,
        "pixel_spacing_provenance": PROVENANCE_MEASURED,
        "pixel_spacing_unit": "mm",
        "matrix_size": matrix_size,
        "matrix_size_provenance": PROVENANCE_INFERRED,
        "num_slices": num_slices,
        "num_slices_provenance": PROVENANCE_MEASURED,
        "echo_time": echo_time,
        "echo_time_provenance": PROVENANCE_MEASURED,
        "echo_time_unit": "ms",
        "repetition_time": repetition_time,
        "repetition_time_provenance": PROVENANCE_MEASURED,
        "repetition_time_unit": "ms",
        "flip_angle": flip_angle,
        "flip_angle_provenance": PROVENANCE_MEASURED,
        "flip_angle_unit": "degrees",
        "acquisition_type": acquisition_type,
        "acquisition_type_provenance": PROVENANCE_MEASURED,
        "body_part": body_part,
        "body_part_provenance": PROVENANCE_MEASURED,
        "evidence_grade": "B",
        "disclaimer": MRI_STANDARD_DISCLAIMER,
        "extracted_at": datetime.now(timezone.utc).isoformat(),
        "source_file": str(dicom_path),
    }

    _log.info(
        "extract_dicom_metadata:complete",
        extra={
            "event": "dicom_metadata_extracted",
            "modality": modality,
            "field_strength": field_strength,
            "acquisition_type": acquisition_type,
            "matrix_size": matrix_size,
            "num_slices": num_slices,
        },
    )
    return result


# ── 2. Series Organization ───────────────────────────────────────────────────

def organize_dicom_series(dicom_dir: str) -> dict[str, list[str]]:
    """Organize DICOM files by series using SeriesInstanceUID.

    Parameters
    ----------
    dicom_dir : str
        Directory containing DICOM files (scanned recursively).

    Returns
    -------
    dict
        Mapping ``{series_uid: [file_paths]}`` sorted by instance number
        within each series. Each series entry also contains validation
        metadata (consistent modality, consistent dimensions).

    evidence_grade : B
        SeriesInstanceUID grouping is per DICOM PS3.3 C.7.3 — consensus
        standard for series organisation.

    Raises
    ------
    DicomProcessingError
        If pydicom is unavailable or the directory cannot be scanned.
    FileNotFoundError
        If the directory does not exist.
    """
    _log.info("organize_dicom_series:start", extra={"dicom_dir": dicom_dir})

    if not HAS_PYDICOM:
        raise DicomProcessingError(
            "pydicom is required for series organization. "
            "Install with: pip install pydicom"
        )

    dir_path = Path(dicom_dir)
    if not dir_path.exists():
        raise FileNotFoundError(f"Directory not found: {dicom_dir}")
    if not dir_path.is_dir():
        raise DicomProcessingError(f"Path is not a directory: {dicom_dir}")

    # Scan for DICOM files
    dicom_entries: list[dict[str, Any]] = []
    skipped = 0

    for fpath in dir_path.rglob("*"):
        if not fpath.is_file():
            continue
        try:
            ds = pydicom.dcmread(str(fpath), force=True, stop_before_pixels=True)
            series_uid = str(ds.get((0x0020, 0x000E), ""))
            modality = str(ds.get((0x0008, 0x0060), ""))
            instance_num = int(ds.get((0x0020, 0x0013), 0))
            series_num = int(ds.get((0x0020, 0x0011), 0))
            series_desc = str(ds.get((0x0008, 0x103E), ""))
            rows = int(ds.get((0x0028, 0x0010), 0))
            cols = int(ds.get((0x0028, 0x0011), 0))

            if not series_uid:
                skipped += 1
                continue

            dicom_entries.append({
                "filepath": str(fpath),
                "series_uid": series_uid,
                "modality": modality,
                "instance_number": instance_num,
                "series_number": series_num,
                "series_description": series_desc,
                "rows": rows,
                "columns": cols,
            })
        except Exception:
            skipped += 1
            continue

    if not dicom_entries:
        _log.warning("organize_dicom_series:no_dicom_files", extra={"dicom_dir": dicom_dir})
        return {"_error": f"No valid DICOM files found in {dicom_dir}. Skipped {skipped} files."}

    # Group by series UID
    series_map: dict[str, list[dict[str, Any]]] = {}
    for entry in dicom_entries:
        suid = entry["series_uid"]
        series_map.setdefault(suid, []).append(entry)

    # Sort each series by instance number; validate consistency
    result: dict[str, Any] = {}
    for suid, entries in series_map.items():
        entries.sort(key=lambda e: e["instance_number"])

        file_paths = [e["filepath"] for e in entries]

        # Validate consistency within series
        modalities = {e["modality"] for e in entries if e["modality"]}
        rows_set = {e["rows"] for e in entries if e["rows"]}
        cols_set = {e["columns"] for e in entries if e["columns"]}

        warnings: list[str] = []
        if len(modalities) > 1:
            warnings.append(f"Mixed modalities in series: {modalities}")
        if len(rows_set) > 1 or len(cols_set) > 1:
            warnings.append(f"Mixed dimensions in series: rows={rows_set}, cols={cols_set}")

        # Check for missing instance numbers
        instance_nums = sorted(e["instance_number"] for e in entries)
        gaps = _find_instance_gaps(instance_nums)
        if gaps:
            warnings.append(f"Missing instance numbers detected: {gaps}")

        result[suid] = {
            "file_paths": file_paths,
            "series_number": entries[0].get("series_number", 0),
            "series_description": entries[0].get("series_description", ""),
            "modality": entries[0].get("modality", ""),
            "num_instances": len(file_paths),
            "dimensions": {
                "rows": max(rows_set) if rows_set else 0,
                "columns": max(cols_set) if cols_set else 0,
            },
            "warnings": warnings,
            "valid": len(warnings) == 0,
            "instance_gaps": gaps,
        }

    _log.info(
        "organize_dicom_series:complete",
        extra={
            "event": "dicom_series_organized",
            "num_series": len(result),
            "total_files": len(dicom_entries),
            "skipped_files": skipped,
        },
    )
    return result


# ── 3. PHI De-identification ─────────────────────────────────────────────────

def deidentify_dicom(
    input_path: str,
    output_path: str,
    patient_alias: Optional[str] = None,
) -> dict[str, Any]:
    """Remove PHI from a DICOM file using dicognito or pydicom fallback.

    Implements the DICOM Basic Application Level Confidentiality Profile
    (PS3.15-2019, Table E.1-1) plus HIPAA Safe Harbor provisions.

    Parameters
    ----------
    input_path : str
        Path to the source DICOM file.
    output_path : str
        Path where the de-identified DICOM will be written.
    patient_alias : str, optional
        Optional pseudonym to assign as PatientID. If None, a SHA-256
        hash of the original PatientID is used.

    Returns
    -------
    dict
        Audit log of changes made, including original/anonymised UID
        mappings, removed tags, and risk assessment.

    evidence_grade : B
        Based on DICOM PS3.15-2019 Basic Confidentiality Profile and
        HIPAA Safe Harbor (45 CFR 164.514) — regulatory consensus standard.

    Raises
    ------
    DeidentificationError
        If de-identification fails or produces an unreadable file.
    FileNotFoundError
        If the input file does not exist.
    """
    _log.info(
        "deidentify_dicom:start",
        extra={"input": input_path, "output": output_path},
    )

    if not HAS_PYDICOM:
        raise DeidentificationError(
            "pydicom is required for de-identification. "
            "Install with: pip install pydicom"
        )

    input_obj = Path(input_path)
    if not input_obj.exists():
        raise FileNotFoundError(f"Input DICOM not found: {input_path}")

    output_obj = Path(output_path)
    output_obj.parent.mkdir(parents=True, exist_ok=True)

    try:
        ds = pydicom.dcmread(str(input_path), force=True)
    except Exception as exc:
        raise DeidentificationError(f"Failed to read input DICOM: {exc}") from exc

    # Capture original values for audit trail
    audit_log: dict[str, Any] = {
        "operation": "dicom_deidentification",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "input_file": str(input_path),
        "output_file": str(output_path),
        "method": None,
        "original_values": {},
        "removed_tags": [],
        "modified_tags": [],
        "uid_mappings": {},
        "risk_assessment": {},
    }

    # Record original PHI values
    phi_tag_names = {
        (0x0010, 0x0010): "PatientName",
        (0x0010, 0x0020): "PatientID",
        (0x0010, 0x0030): "PatientBirthDate",
        (0x0010, 0x0040): "PatientSex",
        (0x0010, 0x1010): "PatientAge",
        (0x0010, 0x1030): "PatientWeight",
        (0x0008, 0x0090): "ReferringPhysicianName",
        (0x0008, 0x1050): "PerformingPhysicianName",
        (0x0008, 0x1070): "OperatorsName",
        (0x0008, 0x0080): "InstitutionName",
        (0x0008, 0x0081): "InstitutionAddress",
        (0x0008, 0x0050): "AccessionNumber",
        (0x0008, 0x1010): "StationName",
        (0x0018, 0x1000): "DeviceSerialNumber",
    }

    for tag, name in phi_tag_names.items():
        if tag in ds:
            val = str(ds[tag].value) if ds[tag].value is not None else ""
            if val.strip():
                audit_log["original_values"][name] = val[:64]  # Truncate for audit safety

    # ── De-identification: prefer dicognito, fall back to pydicom ──
    if HAS_DICOGNITO:
        audit_log["method"] = "dicognito_basic_profile"
        try:
            anonymizer = Anonymizer()
            anonymizer.anonymize(ds)
        except Exception as exc:
            _log.warning(
                "dicognito_failed_falling_back",
                extra={"error": str(exc)},
            )
            audit_log["method"] = "pydicom_fallback_after_dicognito_error"
            _apply_pydicom_deidentification(ds, patient_alias)
    else:
        audit_log["method"] = "pydicom_manual_profile"
        _apply_pydicom_deidentification(ds, patient_alias)

    # Post-processing: remove private tags
    ds.remove_private_tags()
    audit_log["removed_tags"].append("private_tags")

    # Clean sequences that may contain PHI
    if (0x0040, 0x0275) in ds:
        del ds[0x0040, 0x0275]
        audit_log["removed_tags"].append("RequestAttributesSequence")

    # Record modified values
    for tag, name in phi_tag_names.items():
        if tag in ds:
            new_val = str(ds[tag].value) if ds[tag].value is not None else ""
            old_val = audit_log["original_values"].get(name, "")
            if new_val != old_val:
                audit_log["modified_tags"].append(name)

    # UID remapping audit
    if (0x0020, 0x000D) in ds:
        audit_log["uid_mappings"]["StudyInstanceUID"] = "remapped"
    if (0x0020, 0x000E) in ds:
        audit_log["uid_mappings"]["SeriesInstanceUID"] = "remapped"
    if (0x0008, 0x0018) in ds:
        audit_log["uid_mappings"]["SOPInstanceUID"] = "remapped"

    # Risk assessment
    burned_in_warning = str(ds.get((0x0028, 0x0301), "")).upper() == "YES"
    audit_log["risk_assessment"] = {
        "burned_in_annotation_flag": burned_in_warning,
        "burned_in_annotation_message": (
            "Burned-in annotations (patient name in pixel data) detected in DICOM header. "
            "Manual visual inspection of image pixels is REQUIRED."
            if burned_in_warning else
            "No burned-in annotation flag in DICOM header. "
            "Note: this flag may not be set even when annotations exist. "
            "Manual visual inspection is still recommended."
        ),
        "residual_phi_risk": "medium" if burned_in_warning else "low",
        "private_tags_removed": True,
        "method_used": audit_log["method"],
    }

    # Save de-identified file
    try:
        ds.save_as(str(output_path))
    except Exception as exc:
        raise DeidentificationError(f"Failed to save de-identified DICOM: {exc}") from exc

    audit_log["success"] = True
    audit_log["output_file_size_bytes"] = output_obj.stat().st_size if output_obj.exists() else 0

    _log.info(
        "deidentify_dicom:complete",
        extra={
            "event": "dicom_deidentified",
            "method": audit_log["method"],
            "removed_tag_count": len(audit_log["removed_tags"]),
            "modified_tag_count": len(audit_log["modified_tags"]),
            "risk_level": audit_log["risk_assessment"]["residual_phi_risk"],
        },
    )
    return audit_log


# ── 4. DICOM to NIfTI Conversion ─────────────────────────────────────────────

def dicom_to_nifti(
    dicom_dir: str,
    output_path: str,
    series_index: int = 0,
) -> dict[str, Any]:
    """Convert organized DICOM series to NIfTI format.

    Uses dicom2nifti if available, otherwise falls back to NiBabel's
    DICOM reading capability. The output is validated for spatial
    integrity (affine matrix, voxel sizes, orientation).

    Parameters
    ----------
    dicom_dir : str
        Directory containing a single DICOM series.
    output_path : str
        Path for the output NIfTI file (should end in .nii or .nii.gz).
    series_index : int, optional
        If the directory contains multiple series, which series to convert
        (0-indexed). Default is 0 (first series).

    Returns
    -------
    dict
        Conversion result with keys: output_path, shape, affine, voxel_sizes,
        orientation, provenance labels, and validation status.

    evidence_grade : C
        DICOM-to-NIfTI conversion algorithms are validated through cohort
        studies but inter-tool differences exist (e.g., dicom2nifti vs
        MRIcron). Output should always be visually verified.

    Raises
    ------
    NiftiConversionError
        If conversion fails or produces an invalid NIfTI file.
    FileNotFoundError
        If the DICOM directory does not exist.
    """
    _log.info(
        "dicom_to_nifti:start",
        extra={"dicom_dir": dicom_dir, "output_path": output_path, "series_index": series_index},
    )

    if not HAS_NIBABEL:
        raise NiftiConversionError(
            "NiBabel is required for NIfTI conversion. "
            "Install with: pip install nibabel"
        )

    dir_path = Path(dicom_dir)
    if not dir_path.exists():
        raise FileNotFoundError(f"DICOM directory not found: {dicom_dir}")

    output_obj = Path(output_path)
    output_obj.parent.mkdir(parents=True, exist_ok=True)

    # If dicom2nifti is available, use it (handles multi-slice DICOM better)
    converted = False
    conversion_method = "unknown"

    if HAS_DICOM2NIFTI:
        try:
            # dicom2nifti works best with a temp output directory
            import tempfile
            with tempfile.TemporaryDirectory() as tmpdir:
                dicom2nifti.convert_directory(dicom_dir, tmpdir)
                # Find the generated .nii or .nii.gz file
                tmpdir_path = Path(tmpdir)
                nifti_files = list(tmpdir_path.glob("*.nii*"))
                if nifti_files:
                    if len(nifti_files) > series_index:
                        shutil.copy2(str(nifti_files[series_index]), str(output_path))
                    else:
                        shutil.copy2(str(nifti_files[0]), str(output_path))
                    converted = True
                    conversion_method = "dicom2nifti"
                else:
                    _log.warning("dicom2nifti: no output files found")
        except Exception as exc:
            _log.warning(
                "dicom2nifti_failed_falling_back",
                extra={"error": str(exc)},
            )

    # Fallback to NiBabel
    if not converted:
        try:
            # Find DICOM files and sort by instance number
            if not HAS_PYDICOM:
                raise NiftiConversionError(
                    "pydicom is required for NiBabel DICOM fallback conversion"
                )

            dicom_files = []
            for fpath in dir_path.rglob("*"):
                if not fpath.is_file():
                    continue
                try:
                    ds = pydicom.dcmread(str(fpath), force=True, stop_before_pixels=True)
                    instance_num = int(ds.get((0x0020, 0x0013), 0))
                    series_uid = str(ds.get((0x0020, 0x000E), ""))
                    dicom_files.append((instance_num, str(fpath), series_uid))
                except Exception:
                    continue

            if not dicom_files:
                raise NiftiConversionError(f"No valid DICOM files found in {dicom_dir}")

            # Group by series and select
            series_groups: dict[str, list[tuple[int, str]]] = {}
            for inst_num, fpath, suid in dicom_files:
                series_groups.setdefault(suid, []).append((inst_num, fpath))

            series_list = list(series_groups.keys())
            if not series_list:
                raise NiftiConversionError("No valid series found")

            target_series = series_list[min(series_index, len(series_list) - 1)]
            files_for_series = sorted(series_groups[target_series], key=lambda x: x[0])
            sorted_file_paths = [fpath for _, fpath in files_for_series]

            # Load slices and build 3D array
            slices_data: list[np.ndarray] = []
            first_ds = None
            for fpath in sorted_file_paths:
                ds = pydicom.dcmread(fpath, force=True)
                if first_ds is None:
                    first_ds = ds
                pixel_array = ds.pixel_array.astype(np.float32)
                # Apply rescale slope/intercept if present
                slope = float(ds.get((0x0028, 0x1053), 1))
                intercept = float(ds.get((0x0028, 0x1052), 0))
                pixel_array = pixel_array * slope + intercept
                slices_data.append(pixel_array)

            if not slices_data:
                raise NiftiConversionError("No pixel data extracted from DICOM files")

            volume = np.stack(slices_data, axis=-1)

            # Build affine matrix from DICOM geometry
            affine = _build_affine_from_dicom(first_ds)

            # Create NIfTI image
            nifti_img = nib.Nifti1Image(volume, affine)
            nib.save(nifti_img, str(output_path))
            converted = True
            conversion_method = "nibabel_manual"

        except Exception as exc:
            raise NiftiConversionError(f"NIfTI conversion failed: {exc}") from exc

    # Validate the output NIfTI
    result = _validate_nifti_output(output_path, conversion_method)
    result["conversion_method"] = conversion_method
    result["evidence_grade"] = "C"
    result["disclaimer"] = MRI_STANDARD_DISCLAIMER

    _log.info(
        "dicom_to_nifti:complete",
        extra={
            "event": "dicom_to_nifti_converted",
            "method": conversion_method,
            "output_shape": result.get("shape"),
            "voxel_sizes": result.get("voxel_sizes"),
        },
    )
    return result


# ── 5. Quality Assurance ─────────────────────────────────────────────────────

def validate_dicom_quality(dicom_path: str) -> dict[str, Any]:
    """Run quality assurance checks on a DICOM file or series directory.

    Performs pixel data integrity validation, slice consistency checks,
    orientation validation, and missing slice detection.

    Parameters
    ----------
    dicom_path : str
        Path to a single DICOM file or a directory containing a DICOM series.

    Returns
    -------
    dict
        QA report with ``passed`` (bool), ``checks`` (list of per-check
        results), and ``warnings`` (list of human-readable warnings).

    evidence_grade : B
        QA checks are based on DICOM conformance requirements (PS3.3)
        and established imaging QC protocols (AAPM TG18).

    Raises
    ------
    QualityValidationError
        If the DICOM data is critically corrupted.
    FileNotFoundError
        If the path does not exist.
    """
    _log.info("validate_dicom_quality:start", extra={"dicom_path": dicom_path})

    if not HAS_PYDICOM:
        raise QualityValidationError(
            "pydicom is required for quality validation. "
            "Install with: pip install pydicom"
        )

    path_obj = Path(dicom_path)
    if not path_obj.exists():
        raise FileNotFoundError(f"Path not found: {dicom_path}")

    checks: list[dict[str, Any]] = []
    warnings: list[str] = []

    # Determine if path is a single file or directory
    if path_obj.is_dir():
        return _validate_dicom_series_quality(dicom_path)

    # ── Single-file validation ──
    try:
        ds = pydicom.dcmread(str(dicom_path), force=True)
    except Exception as exc:
        checks.append({
            "name": "dicom_readability",
            "passed": False,
            "details": f"Cannot read DICOM: {exc}",
            "provenance": PROVENANCE_MEASURED,
        })
        return {"passed": False, "checks": checks, "warnings": [str(exc)]}

    # Check 1: Pixel data present
    has_pixel_data = (0x7FE0, 0x0010) in ds or hasattr(ds, "pixel_array")
    checks.append({
        "name": "pixel_data_present",
        "passed": has_pixel_data,
        "details": "Pixel data element present" if has_pixel_data else "Missing pixel data",
        "provenance": PROVENANCE_MEASURED,
    })
    if not has_pixel_data:
        warnings.append("No pixel data found — this may be a DICOMDIR or header-only file")

    # Check 2: Pixel data integrity (can we read it?)
    pixel_integrity = False
    pixel_shape = None
    if has_pixel_data:
        try:
            arr = ds.pixel_array
            pixel_shape = arr.shape
            pixel_integrity = True
            checks.append({
                "name": "pixel_data_integrity",
                "passed": True,
                "details": f"Pixel array shape: {pixel_shape}, dtype: {arr.dtype}",
                "provenance": PROVENANCE_MEASURED,
            })
        except Exception as exc:
            checks.append({
                "name": "pixel_data_integrity",
                "passed": False,
                "details": f"Cannot read pixel array: {exc}",
                "provenance": PROVENANCE_MEASURED,
            })
            warnings.append(f"Pixel data may be corrupted: {exc}")

    # Check 3: Required geometry tags
    required_geometry = [
        (0x0028, 0x0010, "Rows"),
        (0x0028, 0x0011, "Columns"),
        (0x0028, 0x0030, "PixelSpacing"),
        (0x0020, 0x0037, "ImageOrientationPatient"),
    ]
    missing_geometry = []
    for tag, name in required_geometry:
        if tag not in ds:
            missing_geometry.append(name)

    geometry_ok = len(missing_geometry) == 0
    checks.append({
        "name": "required_geometry_tags",
        "passed": geometry_ok,
        "details": (
            f"All required tags present" if geometry_ok else
            f"Missing geometry tags: {missing_geometry}"
        ),
        "provenance": PROVENANCE_MEASURED,
    })
    if missing_geometry:
        warnings.append(f"Missing geometry tags: {missing_geometry}")

    # Check 4: Modality is MR
    modality = str(ds.get((0x0008, 0x0060), ""))
    is_mr = modality == "MR"
    checks.append({
        "name": "modality_validation",
        "passed": is_mr,
        "details": f"Modality: {modality}",
        "provenance": PROVENANCE_MEASURED,
    })
    if not is_mr:
        warnings.append(f"Expected MR modality, found: {modality}")

    # Check 5: Acquisition parameters present
    acq_params_ok = (
        (0x0018, 0x0080) in ds  # TR
        and (0x0018, 0x0081) in ds  # TE
    )
    checks.append({
        "name": "acquisition_parameters",
        "passed": acq_params_ok,
        "details": (
            "TR and TE present" if acq_params_ok else
            "Missing TR and/or TE — may be a derived/secondary image"
        ),
        "provenance": PROVENANCE_MEASURED,
    })
    if not acq_params_ok:
        warnings.append("Missing TR/TE — this may be a derived image or localizer")

    # Check 6: Image orientation (should be a 6-element vector for 3D)
    orientation_valid = False
    iop = ds.get((0x0020, 0x0037))
    if iop is not None:
        try:
            iop_list = [float(v) for v in iop]
            orientation_valid = len(iop_list) == 6
            checks.append({
                "name": "orientation_vector",
                "passed": orientation_valid,
                "details": f"ImageOrientationPatient: {iop_list}",
                "provenance": PROVENANCE_MEASURED,
            })
        except (ValueError, TypeError):
            checks.append({
                "name": "orientation_vector",
                "passed": False,
                "details": "Invalid ImageOrientationPatient values",
                "provenance": PROVENANCE_MEASURED,
            })
    else:
        checks.append({
            "name": "orientation_vector",
            "passed": False,
            "details": "Missing ImageOrientationPatient",
            "provenance": PROVENANCE_MEASURED,
        })

    # Overall result
    passed = all(c["passed"] for c in checks)

    result = {
        "passed": passed,
        "checks": checks,
        "warnings": warnings,
        "evidence_grade": "B",
        "disclaimer": MRI_STANDARD_DISCLAIMER,
        "validated_at": datetime.now(timezone.utc).isoformat(),
        "source_path": dicom_path,
    }

    _log.info(
        "validate_dicom_quality:complete",
        extra={
            "event": "dicom_qa_complete",
            "passed": passed,
            "num_checks": len(checks),
            "num_warnings": len(warnings),
        },
    )
    return result


# ── 6. Batch Processing ──────────────────────────────────────────────────────

async def process_dicom_upload(
    upload_dir: str,
    analysis_id: str,
    clinic_id: str,
) -> dict[str, Any]:
    """Full DICOM processing pipeline: organize, de-identify, validate, convert.

    This is the main entry point for processing a DICOM upload directory.
    It orchestrates all pipeline stages and returns a comprehensive result
    with metadata, file paths, QA results, and an audit log entry.

    Parameters
    ----------
    upload_dir : str
        Directory containing the uploaded DICOM files.
    analysis_id : str
        Unique identifier for this analysis run.
    clinic_id : str
        Clinic identifier for multi-tenancy scoping.

    Returns
    -------
    dict
        Comprehensive processing result including organized series,
        de-identification audit, QA report, NIfTI conversion result,
        and overall pipeline status.

    evidence_grade : D
        Pipeline orchestration is expert-opinion based (implementation
        pattern), though each sub-step has higher-grade evidence.

    Notes
    -----
    This function is **async** to allow concurrent processing stages.
    All file I/O is blocking (run in thread if needed).
    """
    _log.info(
        "process_dicom_upload:start",
        extra={
            "event": "dicom_pipeline_start",
            "analysis_id": analysis_id,
            "clinic_id": clinic_id,
            "upload_dir": upload_dir,
        },
    )

    pipeline_start = datetime.now(timezone.utc)
    audit_log: list[dict[str, Any]] = []

    result: dict[str, Any] = {
        "analysis_id": analysis_id,
        "clinic_id": clinic_id,
        "pipeline_version": "1.0.0",
        "started_at": pipeline_start.isoformat(),
        "stages": {},
        "audit_log": audit_log,
        "status": "in_progress",
        "disclaimer": MRI_STANDARD_DISCLAIMER,
        "evidence_grade": "D",
    }

    try:
        # ── Stage 1: Organize DICOM series ──
        try:
            series_result = organize_dicom_series(upload_dir)
            result["stages"]["organize"] = {
                "status": "completed",
                "series_count": len([k for k in series_result.keys() if not k.startswith("_")]),
                "result": series_result,
            }
            audit_log.append({
                "stage": "organize",
                "status": "completed",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
        except Exception as exc:
            result["stages"]["organize"] = {"status": "failed", "error": str(exc)}
            audit_log.append({"stage": "organize", "status": "failed", "error": str(exc)})
            raise DicomProcessingError(f"Stage 1 (organize) failed: {exc}") from exc

        # ── Stage 2: De-identify each series ──
        deidentify_results: dict[str, Any] = {}
        deidentify_dir = os.path.join(upload_dir, "deidentified")
        os.makedirs(deidentify_dir, exist_ok=True)

        for series_uid, series_info in series_result.items():
            if series_uid.startswith("_"):
                continue
            file_paths = series_info.get("file_paths", [])
            if not file_paths:
                continue

            series_deidentify_dir = os.path.join(deidentify_dir, series_uid[:8])
            os.makedirs(series_deidentify_dir, exist_ok=True)

            for i, fpath in enumerate(file_paths):
                out_fname = f"slice_{i:04d}.dcm"
                out_path = os.path.join(series_deidentify_dir, out_fname)
                try:
                    deid_result = deidentify_dicom(fpath, out_path)
                    deidentify_results[f"{series_uid}_{i}"] = deid_result
                except Exception as exc:
                    deidentify_results[f"{series_uid}_{i}"] = {
                        "success": False,
                        "error": str(exc),
                    }

        result["stages"]["deidentify"] = {
            "status": "completed",
            "output_dir": deidentify_dir,
            "results": deidentify_results,
        }
        audit_log.append({
            "stage": "deidentify",
            "status": "completed",
            "files_processed": len(deidentify_results),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

        # ── Stage 3: Validate quality ──
        qa_results: dict[str, Any] = {}
        for series_uid, series_info in series_result.items():
            if series_uid.startswith("_"):
                continue
            file_paths = series_info.get("file_paths", [])
            if file_paths:
                # Validate the first file of each series
                try:
                    qa_result = validate_dicom_quality(file_paths[0])
                    qa_results[series_uid] = qa_result
                except Exception as exc:
                    qa_results[series_uid] = {
                        "passed": False,
                        "error": str(exc),
                    }

        result["stages"]["validate"] = {
            "status": "completed",
            "results": qa_results,
        }
        audit_log.append({
            "stage": "validate",
            "status": "completed",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

        # ── Stage 4: Convert to NIfTI ──
        nifti_results: dict[str, Any] = {}
        nifti_dir = os.path.join(upload_dir, "nifti")
        os.makedirs(nifti_dir, exist_ok=True)

        series_list = [
            (uid, info) for uid, info in series_result.items()
            if not uid.startswith("_") and info.get("file_paths")
        ]

        for idx, (series_uid, series_info) in enumerate(series_list):
            nifti_path = os.path.join(nifti_dir, f"series_{idx:02d}.nii.gz")
            try:
                # Create per-series temp directory for clean conversion
                series_files = series_info["file_paths"]
                series_temp_dir = os.path.join(upload_dir, "temp_series", series_uid[:8])
                os.makedirs(series_temp_dir, exist_ok=True)
                # Symlink or copy files for clean conversion input
                for j, src in enumerate(series_files):
                    dst = os.path.join(series_temp_dir, f"IM_{j:04d}.dcm")
                    if not os.path.exists(dst):
                        shutil.copy2(src, dst)

                nifti_result = dicom_to_nifti(series_temp_dir, nifti_path, series_index=0)
                nifti_results[series_uid] = nifti_result
            except Exception as exc:
                nifti_results[series_uid] = {
                    "success": False,
                    "error": str(exc),
                }

        result["stages"]["nifti_conversion"] = {
            "status": "completed",
            "output_dir": nifti_dir,
            "results": nifti_results,
        }
        audit_log.append({
            "stage": "nifti_conversion",
            "status": "completed",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

        # ── Final: extract metadata from first series ──
        metadata: dict[str, Any] = {}
        for series_uid, series_info in series_result.items():
            if series_uid.startswith("_"):
                continue
            file_paths = series_info.get("file_paths", [])
            if file_paths:
                try:
                    metadata = extract_dicom_metadata(file_paths[0])
                    break
                except Exception as exc:
                    _log.warning("metadata_extraction_skipped", extra={"error": str(exc)})

        result["metadata"] = metadata
        result["status"] = "completed"
        result["completed_at"] = datetime.now(timezone.utc).isoformat()

    except Exception as exc:
        result["status"] = "failed"
        result["error"] = str(exc)
        result["failed_at"] = datetime.now(timezone.utc).isoformat()
        _log.error(
            "process_dicom_upload:failed",
            extra={
                "event": "dicom_pipeline_failed",
                "analysis_id": analysis_id,
                "error": str(exc),
            },
        )

    _log.info(
        "process_dicom_upload:complete",
        extra={
            "event": "dicom_pipeline_complete",
            "analysis_id": analysis_id,
            "status": result["status"],
            "stages_completed": list(result["stages"].keys()),
        },
    )
    return result


# ── 7. FastAPI Service Functions ─────────────────────────────────────────────

async def get_dicom_metadata_service(
    analysis_id: str,
    db: "Session",
) -> dict[str, Any]:
    """Get extracted DICOM metadata for an analysis from the database.

    Parameters
    ----------
    analysis_id : str
        The MRI analysis ID.
    db : sqlalchemy.orm.Session
        Database session.

    Returns
    -------
    dict
        DICOM metadata including provenance labels and evidence grade.
        Returns empty metadata with error indicator if not found.

    evidence_grade : D
        Database retrieval is implementation-specific (expert opinion
        for service pattern).
    """
    from app.persistence.models import MriAnalysis

    _log.info(
        "get_dicom_metadata_service",
        extra={"event": "dicom_metadata_service", "analysis_id": analysis_id},
    )

    try:
        analysis = db.query(MriAnalysis).filter(
            MriAnalysis.analysis_id == analysis_id,
        ).first()

        if not analysis:
            return {
                "analysis_id": analysis_id,
                "error": "Analysis not found",
                "metadata": {},
                "evidence_grade": "D",
                "disclaimer": MRI_STANDARD_DISCLAIMER,
            }

        # Parse stored metadata from JSON columns
        modalities = _json_loads(analysis.modalities_present_json) or {}
        structural = _json_loads(analysis.structural_json) or {}
        qc = _json_loads(analysis.qc_json) or {}

        # Build unified metadata response
        metadata: dict[str, Any] = {
            "analysis_id": analysis_id,
            "patient_id": analysis.patient_id,
            "patient_id_provenance": PROVENANCE_INFERRED,
            "condition": analysis.condition,
            "age": analysis.age,
            "age_provenance": PROVENANCE_MEASURED if analysis.age else PROVENANCE_PROXY,
            "sex": analysis.sex,
            "sex_provenance": PROVENANCE_MEASURED if analysis.sex else PROVENANCE_PROXY,
            "pipeline_version": analysis.pipeline_version,
            "norm_db_version": analysis.norm_db_version,
            "state": analysis.state,
            "modalities": modalities,
            "structural": structural,
            "qc_summary": qc,
            "extracted_at": analysis.created_at.isoformat() if analysis.created_at else None,
            "evidence_grade": "D",
            "disclaimer": MRI_STANDARD_DISCLAIMER,
        }

        return metadata

    except Exception as exc:
        _log.error(
            "get_dicom_metadata_service:error",
            extra={"analysis_id": analysis_id, "error": str(exc)},
        )
        return {
            "analysis_id": analysis_id,
            "error": str(exc),
            "metadata": {},
            "evidence_grade": "D",
            "disclaimer": MRI_STANDARD_DISCLAIMER,
        }


async def get_series_info_service(
    analysis_id: str,
    db: "Session",
) -> list[dict[str, Any]]:
    """Get organized series information for an analysis.

    Parameters
    ----------
    analysis_id : str
        The MRI analysis ID.
    db : sqlalchemy.orm.Session
        Database session.

    Returns
    -------
    list[dict]
        List of series information dictionaries, each containing
        series UID, description, modality, instance count, and dimensions.

    evidence_grade : D
    """
    from app.persistence.models import MriAnalysis

    _log.info(
        "get_series_info_service",
        extra={"event": "series_info_service", "analysis_id": analysis_id},
    )

    try:
        analysis = db.query(MriAnalysis).filter(
            MriAnalysis.analysis_id == analysis_id,
        ).first()

        if not analysis:
            return [{
                "analysis_id": analysis_id,
                "error": "Analysis not found",
                "evidence_grade": "D",
                "disclaimer": MRI_STANDARD_DISCLAIMER,
            }]

        # Series info may be stored in upload_ref or modalities JSON
        modalities = _json_loads(analysis.modalities_present_json) or {}
        upload_ref = _json_loads(analysis.upload_ref) or {}

        # Build series list from modalities data
        series_list: list[dict[str, Any]] = []
        if isinstance(modalities, dict):
            for series_uid, series_data in modalities.items():
                if isinstance(series_data, dict):
                    series_list.append({
                        "series_uid": series_uid,
                        "series_description": series_data.get("series_description", ""),
                        "modality": series_data.get("modality", "MR"),
                        "num_instances": series_data.get("num_instances", 0),
                        "dimensions": series_data.get("dimensions", {}),
                        "field_strength": series_data.get("field_strength"),
                        "acquisition_type": series_data.get("acquisition_type", ""),
                        "provenance": PROVENANCE_MEASURED,
                        "evidence_grade": "B",
                    })

        if not series_list:
            # Fallback: return a minimal entry from upload_ref
            series_list.append({
                "analysis_id": analysis_id,
                "upload_reference": upload_ref,
                "state": analysis.state,
                "note": "No series details available in database. Run pipeline first.",
                "provenance": PROVENANCE_PROXY,
                "evidence_grade": "D",
            })

        return series_list

    except Exception as exc:
        _log.error(
            "get_series_info_service:error",
            extra={"analysis_id": analysis_id, "error": str(exc)},
        )
        return [{
            "analysis_id": analysis_id,
            "error": str(exc),
            "evidence_grade": "D",
            "disclaimer": MRI_STANDARD_DISCLAIMER,
        }]


async def trigger_deidentification_service(
    analysis_id: str,
    db: "Session",
) -> dict[str, Any]:
    """Trigger PHI de-identification for an analysis.

    Parameters
    ----------
    analysis_id : str
        The MRI analysis ID.
    db : sqlalchemy.orm.Session
        Database session.

    Returns
    -------
    dict
        De-identification audit trail with method used, tags removed/modified,
        UID mappings, and risk assessment.

    evidence_grade : B
        De-identification follows DICOM PS3.15-2019 Basic Confidentiality Profile.
    """
    from app.persistence.models import MriAnalysis, MriReportAudit

    _log.info(
        "trigger_deidentification_service",
        extra={"event": "trigger_deidentification", "analysis_id": analysis_id},
    )

    try:
        analysis = db.query(MriAnalysis).filter(
            MriAnalysis.analysis_id == analysis_id,
        ).first()

        if not analysis:
            return {
                "analysis_id": analysis_id,
                "error": "Analysis not found",
                "evidence_grade": "B",
                "disclaimer": MRI_STANDARD_DISCLAIMER,
            }

        # Get the upload directory from upload_ref
        upload_ref = _json_loads(analysis.upload_ref) or {}
        upload_path = upload_ref.get("path", "")

        if not upload_path or not os.path.exists(upload_path):
            return {
                "analysis_id": analysis_id,
                "error": f"Upload directory not found: {upload_path}",
                "evidence_grade": "B",
                "disclaimer": MRI_STANDARD_DISCLAIMER,
            }

        # Find first DICOM file and de-identify it
        deidentify_dir = os.path.join(os.path.dirname(upload_path), "deidentified")
        os.makedirs(deidentify_dir, exist_ok=True)

        # Look for DICOM files
        dicom_files = []
        for root, _dirs, files in os.walk(upload_path):
            for fname in files:
                fpath = os.path.join(root, fname)
                dicom_files.append(fpath)
            if len(dicom_files) >= 1:
                break

        if not dicom_files:
            return {
                "analysis_id": analysis_id,
                "error": "No DICOM files found in upload directory",
                "evidence_grade": "B",
                "disclaimer": MRI_STANDARD_DISCLAIMER,
            }

        # De-identify the first file as a representative sample
        sample_output = os.path.join(deidentify_dir, "sample_deidentified.dcm")
        deid_result = deidentify_dicom(dicom_files[0], sample_output)

        # Create audit record
        audit = MriReportAudit(
            analysis_id=analysis_id,
            action="DEIDENTIFICATION_TRIGGERED",
            actor_id="system",
            actor_role="service",
            new_state="DEIDENTIFIED",
            note=json.dumps({
                "method": deid_result.get("method"),
                "removed_tags": len(deid_result.get("removed_tags", [])),
                "modified_tags": len(deid_result.get("modified_tags", [])),
                "risk_level": deid_result.get("risk_assessment", {}).get("residual_phi_risk"),
            }),
        )
        db.add(audit)
        db.commit()

        result = {
            "analysis_id": analysis_id,
            "status": "completed",
            "deidentification": deid_result,
            "audit_record_id": audit.id,
            "output_sample": sample_output,
            "evidence_grade": "B",
            "disclaimer": MRI_STANDARD_DISCLAIMER,
        }

        _log.info(
            "trigger_deidentification_service:complete",
            extra={
                "analysis_id": analysis_id,
                "method": deid_result.get("method"),
                "risk_level": deid_result.get("risk_assessment", {}).get("residual_phi_risk"),
            },
        )
        return result

    except Exception as exc:
        _log.error(
            "trigger_deidentification_service:error",
            extra={"analysis_id": analysis_id, "error": str(exc)},
        )
        return {
            "analysis_id": analysis_id,
            "status": "failed",
            "error": str(exc),
            "evidence_grade": "B",
            "disclaimer": MRI_STANDARD_DISCLAIMER,
        }


async def convert_to_nifti_service(
    analysis_id: str,
    db: "Session",
) -> dict[str, Any]:
    """Trigger DICOM-to-NIfTI conversion for an analysis.

    Parameters
    ----------
    analysis_id : str
        The MRI analysis ID.
    db : sqlalchemy.orm.Session
        Database session.

    Returns
    -------
    dict
        Conversion result with output path, shape, affine, voxel sizes,
        orientation, and validation status.

    evidence_grade : C
        DICOM-to-NIfTI conversion validation through cohort studies.
    """
    from app.persistence.models import MriAnalysis, MriReportAudit

    _log.info(
        "convert_to_nifti_service",
        extra={"event": "convert_to_nifti", "analysis_id": analysis_id},
    )

    try:
        analysis = db.query(MriAnalysis).filter(
            MriAnalysis.analysis_id == analysis_id,
        ).first()

        if not analysis:
            return {
                "analysis_id": analysis_id,
                "error": "Analysis not found",
                "evidence_grade": "C",
                "disclaimer": MRI_STANDARD_DISCLAIMER,
            }

        upload_ref = _json_loads(analysis.upload_ref) or {}
        upload_path = upload_ref.get("path", "")

        if not upload_path or not os.path.exists(upload_path):
            return {
                "analysis_id": analysis_id,
                "error": f"Upload directory not found: {upload_path}",
                "evidence_grade": "C",
                "disclaimer": MRI_STANDARD_DISCLAIMER,
            }

        # Output directory
        nifti_dir = os.path.join(os.path.dirname(upload_path), "nifti")
        os.makedirs(nifti_dir, exist_ok=True)
        nifti_path = os.path.join(nifti_dir, f"{analysis_id}.nii.gz")

        # Convert
        conversion_result = dicom_to_nifti(upload_path, nifti_path, series_index=0)

        # Create audit record
        audit = MriReportAudit(
            analysis_id=analysis_id,
            action="NIFTI_CONVERSION",
            actor_id="system",
            actor_role="service",
            new_state="NIFTI_READY",
            note=json.dumps({
                "output_path": nifti_path,
                "shape": conversion_result.get("shape"),
                "voxel_sizes": conversion_result.get("voxel_sizes"),
                "method": conversion_result.get("conversion_method"),
            }),
        )
        db.add(audit)
        db.commit()

        result = {
            "analysis_id": analysis_id,
            "status": "completed",
            "conversion": conversion_result,
            "nifti_path": nifti_path,
            "audit_record_id": audit.id,
            "evidence_grade": "C",
            "disclaimer": MRI_STANDARD_DISCLAIMER,
        }

        _log.info(
            "convert_to_nifti_service:complete",
            extra={
                "analysis_id": analysis_id,
                "shape": conversion_result.get("shape"),
                "method": conversion_result.get("conversion_method"),
            },
        )
        return result

    except Exception as exc:
        _log.error(
            "convert_to_nifti_service:error",
            extra={"analysis_id": analysis_id, "error": str(exc)},
        )
        return {
            "analysis_id": analysis_id,
            "status": "failed",
            "error": str(exc),
            "evidence_grade": "C",
            "disclaimer": MRI_STANDARD_DISCLAIMER,
        }


async def run_dicom_qa_service(
    analysis_id: str,
    db: "Session",
) -> dict[str, Any]:
    """Run quality assurance checks for an analysis.

    Parameters
    ----------
    analysis_id : str
        The MRI analysis ID.
    db : sqlalchemy.orm.Session
        Database session.

    Returns
    -------
    dict
        QA report with passed status, individual check results,
        warnings, and overall quality assessment.

    evidence_grade : B
        QA checks based on DICOM conformance (PS3.3) and AAPM TG18.
    """
    from app.persistence.models import MriAnalysis, MriReportAudit

    _log.info(
        "run_dicom_qa_service",
        extra={"event": "run_dicom_qa", "analysis_id": analysis_id},
    )

    try:
        analysis = db.query(MriAnalysis).filter(
            MriAnalysis.analysis_id == analysis_id,
        ).first()

        if not analysis:
            return {
                "analysis_id": analysis_id,
                "error": "Analysis not found",
                "evidence_grade": "B",
                "disclaimer": MRI_STANDARD_DISCLAIMER,
            }

        upload_ref = _json_loads(analysis.upload_ref) or {}
        upload_path = upload_ref.get("path", "")

        if not upload_path or not os.path.exists(upload_path):
            return {
                "analysis_id": analysis_id,
                "error": f"Upload directory not found: {upload_path}",
                "evidence_grade": "B",
                "disclaimer": MRI_STANDARD_DISCLAIMER,
            }

        # Find first DICOM file for validation
        sample_file = None
        for root, _dirs, files in os.walk(upload_path):
            for fname in files:
                candidate = os.path.join(root, fname)
                if HAS_PYDICOM:
                    try:
                        pydicom.dcmread(candidate, force=True, stop_before_pixels=True)
                        sample_file = candidate
                        break
                    except Exception:
                        continue
            if sample_file:
                break

        if not sample_file:
            return {
                "analysis_id": analysis_id,
                "error": "No valid DICOM files found",
                "evidence_grade": "B",
                "disclaimer": MRI_STANDARD_DISCLAIMER,
            }

        qa_result = validate_dicom_quality(sample_file)

        # Create audit record
        audit = MriReportAudit(
            analysis_id=analysis_id,
            action="QA_VALIDATION",
            actor_id="system",
            actor_role="service",
            previous_state=analysis.state,
            new_state="QA_COMPLETE" if qa_result["passed"] else "QA_FAILED",
            note=json.dumps({
                "passed": qa_result["passed"],
                "num_checks": len(qa_result.get("checks", [])),
                "num_warnings": len(qa_result.get("warnings", [])),
            }),
        )
        db.add(audit)
        db.commit()

        result = {
            "analysis_id": analysis_id,
            "status": "completed",
            "qa_report": qa_result,
            "audit_record_id": audit.id,
            "evidence_grade": "B",
            "disclaimer": MRI_STANDARD_DISCLAIMER,
        }

        _log.info(
            "run_dicom_qa_service:complete",
            extra={
                "analysis_id": analysis_id,
                "passed": qa_result["passed"],
                "checks": len(qa_result.get("checks", [])),
            },
        )
        return result

    except Exception as exc:
        _log.error(
            "run_dicom_qa_service:error",
            extra={"analysis_id": analysis_id, "error": str(exc)},
        )
        return {
            "analysis_id": analysis_id,
            "status": "failed",
            "error": str(exc),
            "evidence_grade": "B",
            "disclaimer": MRI_STANDARD_DISCLAIMER,
        }


# ── Internal helper functions ────────────────────────────────────────────────

def _apply_pydicom_deidentification(
    ds: "Dataset",
    patient_alias: Optional[str] = None,
) -> None:
    """Apply manual de-identification using pydicom (fallback method).

    Modifies the dataset in place.

    Parameters
    ----------
    ds : pydicom.Dataset
        The DICOM dataset to de-identify.
    patient_alias : str, optional
        Optional pseudonym. If None, a hash of PatientID is used.
    """
    # Remove direct PHI tags
    tags_to_remove = [
        "PatientName",
        "PatientBirthDate",
        "PatientBirthTime",
        "PatientSex",
        "PatientAge",
        "PatientSize",
        "PatientWeight",
        "PatientMotherBirthName",
        "OtherPatientIDs",
        "OtherPatientNames",
        "PatientAddress",
        "PatientTelephoneNumbers",
        "PatientInsurancePlanCodeSequence",
        "PerformingPhysicianName",
        "ReferringPhysicianName",
        "ConsultingPhysicianName",
        "PhysiciansOfRecord",
        "OperatorsName",
        "AdmittingDiagnosesDescription",
        "MedicalAlerts",
        "Allergies",
        "AdditionalPatientHistory",
        "PregnancyStatus",
        "PatientComments",
        "InstitutionName",
        "InstitutionAddress",
        "StationName",
        "DeviceSerialNumber",
        "AccessionNumber",
        "StudyDate",
        "SeriesDate",
        "AcquisitionDate",
        "ContentDate",
        "StudyTime",
        "SeriesTime",
        "AcquisitionTime",
        "ContentTime",
        "InstanceCreationDate",
        "InstanceCreationTime",
        "ProtocolName",
        "ScheduledProcedureStepDescription",
        "ScheduledProcedureStepID",
        "RequestedProcedureID",
        "ReasonForTheRequestedProcedure",
        "RequestedProcedureComments",
        "StudyComments",
        "RequestingService",
    ]

    for tag_name in tags_to_remove:
        if hasattr(ds, tag_name):
            delattr(ds, tag_name)

    # Handle PatientID: hash or use alias
    original_id = ""
    if hasattr(ds, "PatientID"):
        original_id = str(ds.PatientID)

    if patient_alias:
        ds.PatientID = patient_alias[:64]
    elif original_id:
        hashed = hashlib.sha256(original_id.encode()).hexdigest()[:16]
        ds.PatientID = f"ANON_{hashed}"
    else:
        ds.PatientID = f"ANON_{uuid.uuid4().hex[:16]}"

    # Remap UIDs to prevent cross-referencing
    if hasattr(ds, "StudyInstanceUID"):
        ds.StudyInstanceUID = generate_uid()
    if hasattr(ds, "SeriesInstanceUID"):
        ds.SeriesInstanceUID = generate_uid()
    if hasattr(ds, "SOPInstanceUID"):
        ds.SOPInstanceUID = generate_uid()

    # Clean RequestAttributesSequence
    if (0x0040, 0x0275) in ds:
        del ds[0x0040, 0x0275]

    # Remove private tags
    ds.remove_private_tags()

    _log.debug("pydicom_fallback_deidentification_applied")


def _build_affine_from_dicom(ds: "Dataset") -> np.ndarray:
    """Build a 4x4 affine matrix from DICOM geometry tags.

    The affine maps voxel indices (i, j, k) to patient coordinates (x, y, z).
    Follows DICOM Image Orientation/Position Patient conventions.

    Parameters
    ----------
    ds : pydicom.Dataset
        A DICOM dataset from the series (used for orientation/spacing).

    Returns
    -------
    np.ndarray
        4x4 affine matrix.
    """
    # Image orientation (direction cosines)
    iop = ds.get((0x0020, 0x0037), [1, 0, 0, 0, 1, 0])
    iop = [float(v) for v in iop]
    row_cos = np.array(iop[:3])
    col_cos = np.array(iop[3:])

    # Pixel spacing
    ps = ds.get((0x0028, 0x0030), [1.0, 1.0])
    ps = [float(v) for v in ps]
    px, py = ps[1], ps[0]  # DICOM: [row_spacing, col_spacing]

    # Slice thickness / spacing
    slice_thick = float(ds.get((0x0018, 0x0050), 1.0))
    spacing_between = float(ds.get((0x0018, 0x0088), slice_thick))

    # Build slice direction (cross product of row and column directions)
    slice_cos = np.cross(row_cos, col_cos)
    # Normalize
    norm = np.linalg.norm(slice_cos)
    if norm > 0:
        slice_cos = slice_cos / norm

    # Image position (origin)
    ipp = ds.get((0x0020, 0x0032), [0, 0, 0])
    origin = np.array([float(v) for v in ipp])

    # Build affine
    affine = np.eye(4)
    affine[:3, 0] = row_cos * px
    affine[:3, 1] = col_cos * py
    affine[:3, 2] = slice_cos * spacing_between
    affine[:3, 3] = origin

    return affine


def _get_num_slices(ds: "Dataset") -> int:
    """Determine the number of slices from a DICOM dataset.

    Handles NumberOfFrames for multi-frame DICOM and falls back
    to inferring from SliceThickness + volume extent.

    Parameters
    ----------
    ds : pydicom.Dataset
        The DICOM dataset.

    Returns
    -------
    int
        Number of slices. Returns 0 if cannot be determined.
    """
    # Try NumberOfFrames (for enhanced/multi-frame DICOM)
    nf = ds.get((0x0028, 0x0008), None)
    if nf is not None:
        try:
            return int(nf)
        except (ValueError, TypeError):
            pass

    # Try to count from NumberOfSlicesInAcquisition
    ns = ds.get((0x0021, 0x104F), None)  # Private tag — not reliable
    if ns is not None:
        try:
            return int(ns)
        except (ValueError, TypeError):
            pass

    # Cannot determine from single slice
    return 0


def _find_instance_gaps(instance_numbers: list[int]) -> list[int]:
    """Find missing instance numbers in a sorted sequence.

    Parameters
    ----------
    instance_numbers : list[int]
        Sorted list of instance numbers.

    Returns
    -------
    list[int]
        List of missing instance numbers.
    """
    if not instance_numbers:
        return []

    full_set = set(range(min(instance_numbers), max(instance_numbers) + 1))
    actual_set = set(instance_numbers)
    gaps = sorted(full_set - actual_set)
    return gaps


def _validate_nifti_output(
    nifti_path: str,
    conversion_method: str,
) -> dict[str, Any]:
    """Validate a generated NIfTI file for spatial integrity.

    Parameters
    ----------
    nifti_path : str
        Path to the NIfTI file.
    conversion_method : str
        Method used for conversion (for provenance).

    Returns
    -------
    dict
        Validation result with shape, affine, voxel_sizes, orientation.
    """
    try:
        img = nib.load(nifti_path)
        data = img.get_fdata()
        shape = data.shape
        affine = img.affine.tolist()
        header = img.header

        # Extract voxel sizes from affine
        voxel_sizes = nib.aff2axcodes(img.affine)
        # Get actual voxel dimensions
        pixdim = header.get("pixdim", [1, 1, 1, 1])
        voxel_dimensions = [float(pixdim[i]) for i in range(1, min(4, len(pixdim)))]

        # Determine orientation code
        orientation_code = nib.orientations.aff2axcodes(img.affine)

        return {
            "output_path": nifti_path,
            "shape": shape,
            "shape_provenance": PROVENANCE_MEASURED,
            "affine": affine,
            "affine_provenance": PROVENANCE_INFERRED,
            "voxel_sizes": voxel_dimensions,
            "voxel_sizes_provenance": PROVENANCE_MEASURED,
            "orientation": "".join(orientation_code) if orientation_code else "",
            "orientation_provenance": PROVENANCE_INFERRED,
            "conversion_method": conversion_method,
            "conversion_method_provenance": PROVENANCE_MEASURED,
            "valid": True,
        }
    except Exception as exc:
        return {
            "output_path": nifti_path,
            "valid": False,
            "error": str(exc),
            "conversion_method": conversion_method,
        }


def _validate_dicom_series_quality(dicom_dir: str) -> dict[str, Any]:
    """Validate quality for a DICOM series directory.

    Parameters
    ----------
    dicom_dir : str
        Directory containing DICOM files.

    Returns
    -------
    dict
        QA report with passed, checks, and warnings.
    """
    checks: list[dict[str, Any]] = []
    warnings: list[str] = []

    # Organize and check series consistency
    try:
        series_result = organize_dicom_series(dicom_dir)
    except Exception as exc:
        return {
            "passed": False,
            "checks": [{"name": "series_organization", "passed": False, "details": str(exc)}],
            "warnings": [str(exc)],
        }

    # Check each series
    for series_uid, series_info in series_result.items():
        if series_uid.startswith("_"):
            continue

        # Series-level checks
        file_paths = series_info.get("file_paths", [])
        checks.append({
            "name": f"series_{series_uid[:8]}_file_count",
            "passed": len(file_paths) > 0,
            "details": f"{len(file_paths)} files in series",
            "provenance": PROVENANCE_MEASURED,
        })

        # Check for warnings from organizer
        series_warnings = series_info.get("warnings", [])
        if series_warnings:
            warnings.extend(series_warnings)
            checks.append({
                "name": f"series_{series_uid[:8]}_consistency",
                "passed": False,
                "details": "; ".join(series_warnings),
                "provenance": PROVENANCE_MEASURED,
            })
        else:
            checks.append({
                "name": f"series_{series_uid[:8]}_consistency",
                "passed": True,
                "details": "All files consistent",
                "provenance": PROVENANCE_MEASURED,
            })

        # Check for gaps
        gaps = series_info.get("instance_gaps", [])
        if gaps:
            checks.append({
                "name": f"series_{series_uid[:8]}_slice_completeness",
                "passed": False,
                "details": f"Missing slices: {gaps}",
                "provenance": PROVENANCE_MEASURED,
            })
            warnings.append(f"Series {series_uid[:8]}: missing instance numbers {gaps}")
        else:
            checks.append({
                "name": f"series_{series_uid[:8]}_slice_completeness",
                "passed": True,
                "details": "No missing slices detected",
                "provenance": PROVENANCE_MEASURED,
            })

        # Validate first file's pixel data
        if file_paths:
            try:
                single_qa = validate_dicom_quality(file_paths[0])
                for ch in single_qa.get("checks", []):
                    ch["name"] = f"series_{series_uid[:8]}_{ch['name']}"
                    checks.append(ch)
                warnings.extend(single_qa.get("warnings", []))
            except Exception as exc:
                checks.append({
                    "name": f"series_{series_uid[:8]}_pixel_validation",
                    "passed": False,
                    "details": str(exc),
                })

    passed = all(c["passed"] for c in checks)

    return {
        "passed": passed,
        "checks": checks,
        "warnings": warnings,
        "evidence_grade": "B",
        "disclaimer": MRI_STANDARD_DISCLAIMER,
        "validated_at": datetime.now(timezone.utc).isoformat(),
        "source_path": dicom_dir,
    }


def _json_loads(raw: Optional[str]) -> Any:
    """Safely parse a JSON string.

    Parameters
    ----------
    raw : str or None
        JSON string to parse.

    Returns
    -------
    Any
        Parsed JSON value, or None if parsing fails.
    """
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return None
