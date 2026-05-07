"""Lightweight BIDS sanity checks for DeepSynaps Neuro Engine datasets."""

from __future__ import annotations

from dataclasses import dataclass, field
import json
from pathlib import Path
from typing import Any

CURRENT_BIDS_VERSION = "1.11.1"
DEFAULT_DATASET_NAME = "DeepSynaps Neuro Dataset"


@dataclass(slots=True)
class BIDSValidationResult:
    """Validation outcome for a BIDS dataset tree."""

    bids_root: Path
    is_valid: bool
    subjects: list[str]
    sessions: list[str]
    modalities: list[str]
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def _dataset_description_path(bids_root: Path) -> Path:
    """Return the canonical dataset_description.json path."""

    return bids_root / "dataset_description.json"


def _ensure_dataset_description(bids_root: Path) -> list[str]:
    """Create a minimal dataset_description.json when it is missing."""

    warnings: list[str] = []
    path = _dataset_description_path(bids_root)
    if path.exists():
        return warnings
    payload = {
        "Name": DEFAULT_DATASET_NAME,
        "BIDSVersion": CURRENT_BIDS_VERSION,
        "DatasetType": "raw",
    }
    path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    warnings.append("dataset_description.json was missing and has been created automatically.")
    return warnings


def _load_dataset_description(bids_root: Path) -> tuple[dict[str, Any] | None, list[str], list[str]]:
    """Load dataset_description.json and return payload, errors, and warnings."""

    warnings = _ensure_dataset_description(bids_root)
    errors: list[str] = []
    path = _dataset_description_path(bids_root)
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        errors.append(f"dataset_description.json is invalid JSON: {exc}")
        return None, errors, warnings
    if "Name" not in payload:
        warnings.append("dataset_description.json is missing the Name field.")
    if "BIDSVersion" not in payload:
        warnings.append("dataset_description.json is missing the BIDSVersion field.")
    return payload, errors, warnings


def _sidecar_for_nifti(nifti_path: Path) -> Path:
    """Return the expected JSON sidecar path for a NIfTI file."""

    return nifti_path.with_name(f"{nifti_path.name[:-7]}.json")


def _collect_modalities(session_dir: Path) -> set[str]:
    """Return modalities that contain at least one NIfTI file."""

    modalities: set[str] = set()
    for modality in ("anat", "func"):
        modality_dir = session_dir / modality
        if any(modality_dir.glob("*.nii.gz")):
            modalities.add(modality)
    return modalities


def _validate_session_tree(session_dir: Path) -> tuple[list[str], list[str], set[str]]:
    """Validate NIfTI/JSON pairing and modality directories for a session tree."""

    errors: list[str] = []
    warnings: list[str] = []

    for modality in ("anat", "func"):
        modality_dir = session_dir / modality
        if modality_dir.exists() and not any(modality_dir.iterdir()):
            errors.append(f"{modality_dir} exists but is empty.")

    nifti_files = sorted(session_dir.rglob("*.nii.gz"))
    if not nifti_files:
        errors.append(f"No NIfTI files were found under {session_dir}.")
        return errors, warnings, set()

    for nifti_path in nifti_files:
        sidecar_path = _sidecar_for_nifti(nifti_path)
        if not sidecar_path.exists():
            errors.append(f"Missing JSON sidecar for {nifti_path.relative_to(session_dir)}.")

    modalities = _collect_modalities(session_dir)
    if not modalities:
        warnings.append(f"{session_dir} contains NIfTI files but no anat/func directories were detected.")
    return errors, warnings, modalities


class BidsValidator:
    """Perform lightweight, programmatic BIDS checks for one subject/session."""

    def validate_subject_session(self, bids_root: Path, subject_id: str, session_id: str) -> dict[str, Any]:
        """Validate one ``sub-<subject>/ses-<session>`` subtree.

        The method guarantees a top-level ``dataset_description.json`` file,
        then checks NIfTI/JSON pairing and basic anatomical/functional
        directory structure for the requested subject/session.
        """

        root = Path(bids_root)
        root.mkdir(parents=True, exist_ok=True)
        _, errors, warnings = _load_dataset_description(root)

        subject_label = subject_id[len("sub-") :] if subject_id.startswith("sub-") else subject_id
        session_label = session_id[len("ses-") :] if session_id.startswith("ses-") else session_id
        session_dir = root / f"sub-{subject_label}" / f"ses-{session_label}"
        if not session_dir.exists():
            errors.append(f"Subject/session directory does not exist: {session_dir}")
            return {
                "is_valid": False,
                "errors": errors,
                "warnings": warnings,
            }

        tree_errors, tree_warnings, _ = _validate_session_tree(session_dir)
        errors.extend(tree_errors)
        warnings.extend(tree_warnings)
        return {
            "is_valid": not errors,
            "errors": errors,
            "warnings": warnings,
        }


def _find_sessions(subject_dir: Path) -> list[Path]:
    """Collect session directories for a subject folder."""

    sessions = sorted(path for path in subject_dir.glob("ses-*") if path.is_dir())
    return sessions or [subject_dir]


def validate_bids_dataset(bids_root: str | Path) -> BIDSValidationResult:
    """Validate the high-value structural rules of a BIDS dataset."""

    root = Path(bids_root)
    errors: list[str] = []
    warnings: list[str] = []
    modalities: set[str] = set()
    if not root.exists():
        return BIDSValidationResult(
            bids_root=root,
            is_valid=False,
            subjects=[],
            sessions=[],
            modalities=[],
            errors=[f"BIDS root {root} does not exist."],
            warnings=[],
        )

    _, dataset_errors, dataset_warnings = _load_dataset_description(root)
    errors.extend(dataset_errors)
    warnings.extend(dataset_warnings)

    subjects = sorted(path.name for path in root.glob("sub-*") if path.is_dir())
    if not subjects:
        errors.append("No subject folders matching sub-* were found.")
        return BIDSValidationResult(
            bids_root=root,
            is_valid=False,
            subjects=[],
            sessions=[],
            modalities=[],
            errors=errors,
            warnings=warnings,
        )

    session_names: set[str] = set()
    validator = BidsValidator()
    for subject_name in subjects:
        subject_dir = root / subject_name
        session_dirs = _find_sessions(subject_dir)
        for session_dir in session_dirs:
            if session_dir == subject_dir:
                session_name = "baseline"
                session_errors, session_warnings, session_modalities = _validate_session_tree(session_dir)
            else:
                session_name = session_dir.name
                subject_label = subject_name[len("sub-") :]
                session_label = session_name[len("ses-") :]
                result = validator.validate_subject_session(root, subject_label, session_label)
                session_errors = result["errors"]
                session_warnings = result["warnings"]
                session_modalities = _collect_modalities(session_dir)
            session_names.add(session_name)
            errors.extend(session_errors)
            warnings.extend(session_warnings)
            modalities.update(session_modalities)

    return BIDSValidationResult(
        bids_root=root,
        is_valid=not errors,
        subjects=subjects,
        sessions=sorted(session_names),
        modalities=sorted(modalities),
        errors=errors,
        warnings=warnings,
    )
