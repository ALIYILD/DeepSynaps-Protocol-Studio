"""DICOM-to-NIfTI and DICOM-to-BIDS conversion helpers."""

from __future__ import annotations

from dataclasses import dataclass, field
import json
import logging
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
from typing import Any, Mapping

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class DICOMConversionResult:
    """Structured outcome for a legacy DICOM-to-NIfTI conversion attempt."""

    status: str
    input_dir: Path
    output_path: Path | None
    dicom_files: list[Path]
    converted_slices: int
    notes: list[str] = field(default_factory=list)


class DicomConversionError(RuntimeError):
    """Raised when a DICOM conversion run cannot be completed safely."""


@dataclass(slots=True)
class _ConvertedSeries:
    """Represent one NIfTI plus JSON sidecar emitted by dcm2niix."""

    nifti_path: Path
    sidecar_path: Path
    metadata: dict[str, Any]


def _discover_dicom_files(input_dir: Path) -> list[Path]:
    """Locate DICOM-like files inside a study directory."""

    extensions = {".dcm", ".dicom", ".ima", ""}
    return sorted(
        path
        for path in input_dir.rglob("*")
        if path.is_file() and path.suffix.lower() in extensions
    )


def _strip_bids_prefix(value: str, prefix: str) -> str:
    """Return an entity value without an existing BIDS prefix."""

    return value[len(prefix):] if value.startswith(prefix) else value


def _normalize_lookup_key(value: str) -> str:
    """Normalize a series description or protocol name for dictionary lookup."""

    collapsed = re.sub(r"[^A-Za-z0-9]+", "_", value.strip()).strip("_").lower()
    return collapsed


def _sanitize_task_label(value: str) -> str:
    """Convert a free-text task label into a BIDS-friendly token."""

    cleaned = re.sub(r"[^A-Za-z0-9]+", "", value.strip().lower())
    return cleaned or "unknown"


def _sidecar_for_nifti(nifti_path: Path) -> Path:
    """Return the expected JSON sidecar path for a NIfTI file."""

    if nifti_path.name.endswith(".nii.gz"):
        return nifti_path.with_name(f"{nifti_path.name[:-7]}.json")
    return nifti_path.with_suffix(".json")


def _load_series_from_directory(output_dir: Path) -> list[_ConvertedSeries]:
    """Load all dcm2niix outputs from a temporary conversion directory."""

    converted: list[_ConvertedSeries] = []
    for nifti_path in sorted(output_dir.glob("*.nii.gz")):
        sidecar_path = _sidecar_for_nifti(nifti_path)
        if not sidecar_path.exists():
            raise DicomConversionError(
                f"dcm2niix output {nifti_path.name} is missing the JSON sidecar {sidecar_path.name}."
            )
        metadata = json.loads(sidecar_path.read_text(encoding="utf-8"))
        converted.append(
            _ConvertedSeries(
                nifti_path=nifti_path,
                sidecar_path=sidecar_path,
                metadata=metadata,
            )
        )
    return converted


def _run_dcm2niix(dicom_dir: Path, output_dir: Path, dcm2niix_path: str) -> subprocess.CompletedProcess[str]:
    """Execute dcm2niix and return its completed process object."""

    command = [
        dcm2niix_path,
        "-b",
        "y",
        "-z",
        "y",
        "-o",
        str(output_dir),
        str(dicom_dir),
    ]
    logger.info("Running dcm2niix for %s", dicom_dir)
    logger.debug("dcm2niix command: %s", command)
    try:
        return subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=False,
        )
    except FileNotFoundError as exc:
        raise DicomConversionError(f"dcm2niix executable was not found: {dcm2niix_path}") from exc


def _modality_map_candidates(metadata: Mapping[str, Any], nifti_path: Path) -> list[str]:
    """Return lookup candidates derived from metadata and filenames."""

    candidates: list[str] = []
    for key in ("SeriesDescription", "ProtocolName", "SequenceName"):
        value = metadata.get(key)
        if isinstance(value, str) and value.strip():
            candidates.append(value.strip())
    candidates.append(nifti_path.name[:-7] if nifti_path.name.endswith(".nii.gz") else nifti_path.stem)
    return candidates


def _task_label_from_metadata(metadata: Mapping[str, Any], descriptor: str) -> str:
    """Infer a BIDS task label from sidecar metadata or free-text descriptors."""

    task_name = metadata.get("TaskName")
    if isinstance(task_name, str) and task_name.strip():
        return _sanitize_task_label(task_name)
    if "rest" in descriptor or "rsfmri" in descriptor or "resting" in descriptor:
        return "rest"
    task_match = re.search(r"task[-_\s]?([A-Za-z0-9]+)", descriptor)
    if task_match:
        return _sanitize_task_label(task_match.group(1))
    return "unknown"


def _infer_modality_and_suffix(metadata: Mapping[str, Any], nifti_path: Path) -> tuple[str, str] | None:
    """Infer a BIDS modality and suffix from sidecar metadata."""

    descriptor = " ".join(_modality_map_candidates(metadata, nifti_path)).lower()
    image_type = metadata.get("ImageType")
    image_type_text = " ".join(image_type).lower() if isinstance(image_type, list) else str(image_type or "").lower()
    if any(token in descriptor for token in ("mprage", "t1w", "bravo", "spgr", "tfl")):
        return ("anat", "T1w")
    if "flair" in descriptor:
        return ("anat", "FLAIR")
    if "t2" in descriptor and "bold" not in descriptor:
        return ("anat", "T2w")

    has_functional_markers = any(
        key in metadata for key in ("TaskName", "SliceTiming", "MultibandAccelerationFactor", "RepetitionTime")
    )
    if has_functional_markers and any(
        token in f"{descriptor} {image_type_text}" for token in ("bold", "rest", "task", "fmri", "func", "epi")
    ):
        task_label = _task_label_from_metadata(metadata, descriptor)
        return ("func", f"task-{task_label}_bold")
    return None


def _resolve_modality_and_suffix(
    series: _ConvertedSeries,
    modality_map: Mapping[str, tuple[str, str]] | None,
) -> tuple[str, str]:
    """Resolve one dcm2niix output into a BIDS directory and suffix."""

    if modality_map:
        normalized_map = {
            _normalize_lookup_key(key): value
            for key, value in modality_map.items()
        }
        for candidate in _modality_map_candidates(series.metadata, series.nifti_path):
            mapped = normalized_map.get(_normalize_lookup_key(candidate))
            if mapped is not None:
                return mapped

    inferred = _infer_modality_and_suffix(series.metadata, series.nifti_path)
    if inferred is not None:
        return inferred
    raise DicomConversionError(
        "Unable to map dcm2niix output into BIDS. "
        f"SeriesDescription={series.metadata.get('SeriesDescription')!r}, "
        f"ProtocolName={series.metadata.get('ProtocolName')!r}, "
        f"file={series.nifti_path.name!r}."
    )


def _build_bids_stem(subject_id: str, session_id: str, suffix_spec: str, run_index: int) -> str:
    """Build a BIDS filename stem from subject, session, and suffix information."""

    parts = suffix_spec.split("_")
    suffix = parts[-1]
    entities = parts[:-1]
    if run_index > 1 and not any(entity.startswith("run-") for entity in entities):
        entities.append(f"run-{run_index:02d}")
    return "_".join([f"sub-{subject_id}", f"ses-{session_id}", *entities, suffix])


def _inject_task_name(metadata: dict[str, Any], suffix_spec: str) -> dict[str, Any]:
    """Populate TaskName in functional sidecars when it is implied by the BIDS name."""

    if metadata.get("TaskName"):
        return metadata
    suffix_parts = suffix_spec.split("_")
    for part in suffix_parts:
        if part.startswith("task-"):
            metadata["TaskName"] = part[len("task-") :]
            break
    return metadata


class DicomToBidsConverter:
    """Convert a single-session DICOM directory into a lightweight BIDS tree."""

    def __init__(self, bids_root: Path, dcm2niix_path: str = "dcm2niix") -> None:
        """Store the BIDS destination root and dcm2niix executable path."""

        self.bids_root = Path(bids_root)
        self.dcm2niix_path = dcm2niix_path

    def convert_session(
        self,
        dicom_dir: Path,
        subject_id: str,
        session_id: str,
        modality_map: dict[str, tuple[str, str]] | None = None,
    ) -> Path:
        """Convert a single DICOM visit into a BIDS-like subject/session tree.

        Parameters
        ----------
        dicom_dir:
            Directory containing DICOM series for one visit.
        subject_id:
            Study-specific subject identifier. ``sub-`` is added automatically
            if not already present.
        session_id:
            Study-specific session identifier. ``ses-`` is added automatically
            if not already present.
        modality_map:
            Optional mapping from DICOM SeriesDescription or ProtocolName to a
            BIDS modality/suffix tuple, for example
            ``{"MPRAGE_T1": ("anat", "T1w")}``.

        Returns
        -------
        Path
            The created ``sub-<subject>/ses-<session>`` directory.

        Raises
        ------
        DicomConversionError
            Raised when dcm2niix fails, emits no NIfTI files, or an output
            series cannot be mapped into BIDS.
        """

        resolved_dicom_dir = Path(dicom_dir)
        if not resolved_dicom_dir.exists():
            raise DicomConversionError(f"DICOM input directory does not exist: {resolved_dicom_dir}")

        subject_label = _strip_bids_prefix(subject_id, "sub-")
        session_label = _strip_bids_prefix(session_id, "ses-")
        session_dir = self.bids_root / f"sub-{subject_label}" / f"ses-{session_label}"
        session_dir.mkdir(parents=True, exist_ok=True)
        logger.info(
            "Converting DICOM session %s into %s",
            resolved_dicom_dir,
            session_dir,
        )

        with tempfile.TemporaryDirectory(prefix="deepsynaps_dcm2niix_") as temp_dir_name:
            temp_dir = Path(temp_dir_name)
            completed = _run_dcm2niix(resolved_dicom_dir, temp_dir, self.dcm2niix_path)
            if completed.returncode != 0:
                logger.error("dcm2niix failed for %s: %s", resolved_dicom_dir, completed.stderr.strip())
                raise DicomConversionError(
                    f"dcm2niix failed with exit code {completed.returncode}: {completed.stderr.strip() or completed.stdout.strip()}"
                )

            series_outputs = _load_series_from_directory(temp_dir)
            if not series_outputs:
                raise DicomConversionError(f"dcm2niix produced no NIfTI files for {resolved_dicom_dir}")

            seen_targets: dict[tuple[str, str], int] = {}
            for series in series_outputs:
                modality, suffix_spec = _resolve_modality_and_suffix(series, modality_map)
                modality_dir = session_dir / modality
                modality_dir.mkdir(parents=True, exist_ok=True)

                series.metadata = _inject_task_name(series.metadata, suffix_spec)
                series_key = (modality, suffix_spec)
                seen_targets[series_key] = seen_targets.get(series_key, 0) + 1
                run_index = seen_targets[series_key]

                while True:
                    stem = _build_bids_stem(subject_label, session_label, suffix_spec, run_index)
                    destination_nifti = modality_dir / f"{stem}.nii.gz"
                    destination_json = modality_dir / f"{stem}.json"
                    if not destination_nifti.exists() and not destination_json.exists():
                        break
                    run_index += 1

                logger.info(
                    "Mapping %s to %s/%s",
                    series.nifti_path.name,
                    modality,
                    destination_nifti.name,
                )
                shutil.move(str(series.nifti_path), str(destination_nifti))
                destination_json.write_text(
                    json.dumps(series.metadata, indent=2, sort_keys=True),
                    encoding="utf-8",
                )
                series.sidecar_path.unlink(missing_ok=True)

        return session_dir


def convert_dicom_series(
    input_dir: str | Path,
    output_dir: str | Path,
    output_name: str = "series.nii.gz",
) -> DICOMConversionResult:
    """Convert a DICOM directory into one NIfTI file using dcm2niix.

    This helper is retained for backwards compatibility with the initial
    Neuro Engine scaffold. For multi-series session-to-BIDS conversion,
    prefer :class:`DicomToBidsConverter`.
    """

    resolved_input = Path(input_dir)
    resolved_output_dir = Path(output_dir)
    resolved_output_dir.mkdir(parents=True, exist_ok=True)
    dicom_files = _discover_dicom_files(resolved_input)
    notes: list[str] = []
    if not dicom_files:
        return DICOMConversionResult(
            status="empty",
            input_dir=resolved_input,
            output_path=None,
            dicom_files=[],
            converted_slices=0,
            notes=["No DICOM files were found in the input directory."],
        )

    with tempfile.TemporaryDirectory(prefix="deepsynaps_dcm2niix_legacy_") as temp_dir_name:
        temp_dir = Path(temp_dir_name)
        try:
            completed = _run_dcm2niix(resolved_input, temp_dir, "dcm2niix")
            if completed.returncode != 0:
                notes.append(f"dcm2niix failed: {completed.stderr.strip() or completed.stdout.strip()}")
                return DICOMConversionResult(
                    status="failed",
                    input_dir=resolved_input,
                    output_path=None,
                    dicom_files=dicom_files,
                    converted_slices=0,
                    notes=notes,
                )
            series_outputs = _load_series_from_directory(temp_dir)
        except (DicomConversionError, json.JSONDecodeError) as exc:
            notes.append(str(exc))
            return DICOMConversionResult(
                status="failed",
                input_dir=resolved_input,
                output_path=None,
                dicom_files=dicom_files,
                converted_slices=0,
                notes=notes,
            )

        if not series_outputs:
            return DICOMConversionResult(
                status="failed",
                input_dir=resolved_input,
                output_path=None,
                dicom_files=dicom_files,
                converted_slices=0,
                notes=["dcm2niix produced no NIfTI files."],
            )

        selected_series = series_outputs[0]
        if len(series_outputs) > 1:
            notes.append(
                f"dcm2niix produced {len(series_outputs)} series; the first output was selected for legacy conversion."
            )

        output_path = resolved_output_dir / output_name
        sidecar_path = output_path.with_name(
            f"{output_path.name[:-7]}.json" if output_path.name.endswith(".nii.gz") else f"{output_path.stem}.json"
        )
        shutil.move(str(selected_series.nifti_path), str(output_path))
        shutil.move(str(selected_series.sidecar_path), str(sidecar_path))
        notes.append(f"Converted {len(dicom_files)} DICOM files into {output_path.name}.")
        return DICOMConversionResult(
            status="completed",
            input_dir=resolved_input,
            output_path=output_path,
            dicom_files=dicom_files,
            converted_slices=len(dicom_files),
            notes=notes,
        )
