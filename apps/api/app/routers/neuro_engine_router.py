"""DeepSynaps Neuro Engine integration routes.

This wrapper keeps the monorepo API in control of authentication, error
handling, and path conventions while delegating neuroimaging orchestration to
the sibling ``deepsynaps.neuro_engine`` package when it is installed.
"""

from __future__ import annotations

from dataclasses import fields, is_dataclass
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.errors import ApiServiceError

try:
    from deepsynaps.neuro_engine import NeuroEngine, __version__ as NEURO_ENGINE_VERSION

    HAS_NEURO_ENGINE = True
except ImportError as exc:  # pragma: no cover - exercised in thin installs.
    NeuroEngine = None  # type: ignore[assignment]
    NEURO_ENGINE_VERSION = None
    HAS_NEURO_ENGINE = False
    _IMPORT_ERROR = exc
else:
    _IMPORT_ERROR = None


router = APIRouter(prefix="/api/v1/neuro-engine", tags=["neuro-engine"])


class ValidateBIDSRequest(BaseModel):
    """Request payload for validating a BIDS directory."""

    bids_root: str = Field(..., description="Path to the BIDS dataset root.")


class ConvertDICOMRequest(BaseModel):
    """Request payload for converting a DICOM series into NIfTI."""

    input_dir: str = Field(..., description="Directory that contains the DICOM series.")
    output_dir: str = Field(..., description="Directory that will receive the converted NIfTI file.")
    output_name: str = Field(default="series.nii.gz", description="Output NIfTI filename.")


class PreprocessRequest(BaseModel):
    """Request payload for planning or executing fMRIPrep."""

    bids_root: str = Field(..., description="Path to the BIDS dataset root.")
    output_root: str = Field(..., description="Directory for fMRIPrep derivatives.")
    work_root: str = Field(..., description="Working directory for fMRIPrep.")
    participant_label: str | None = Field(default=None, description="Participant label without or with sub- prefix.")
    execute: bool = Field(default=False, description="Run the external command instead of returning a plan.")
    extra_args: list[str] | None = Field(default=None, description="Additional CLI arguments passed to fMRIPrep.")


class StructuralRequest(BaseModel):
    """Request payload for planning or executing FastSurfer."""

    t1w_path: str = Field(..., description="Path to the input T1-weighted NIfTI image.")
    subject_id: str = Field(..., description="FastSurfer subject identifier.")
    subjects_dir: str = Field(..., description="FastSurfer subjects directory.")
    execute: bool = Field(default=False, description="Run the external command instead of returning a plan.")
    extra_args: list[str] | None = Field(default=None, description="Additional CLI arguments passed to FastSurfer.")


class ConnectivityRequest(BaseModel):
    """Request payload for functional connectivity analysis."""

    timeseries: list[list[float]] | None = Field(default=None, description="Timepoints-by-regions matrix.")
    bold_path: str | None = Field(default=None, description="Optional 4D BOLD NIfTI path.")
    labels: list[str] | None = Field(default=None, description="Optional region labels.")


class SegmentationModelRequest(BaseModel):
    """Request payload for loading a segmentation model bundle."""

    model_path: str | None = Field(default=None, description="Optional path to segmentation weights.")
    model_name: str | None = Field(default=None, description="Optional model name override.")


class SegmentationRunRequest(BaseModel):
    """Request payload for running segmentation on a volume."""

    volume_path: str = Field(..., description="Input NIfTI volume path.")
    output_dir: str | None = Field(default=None, description="Directory for the output segmentation mask.")
    model_path: str | None = Field(default=None, description="Optional path to segmentation weights.")
    model_name: str | None = Field(default=None, description="Optional model name override.")


class OrchestrateRequest(BaseModel):
    """Request payload for the end-to-end Neuro Engine orchestration facade."""

    bids_root: str | None = Field(default=None, description="Optional BIDS dataset root.")
    dicom_input_dir: str | None = Field(default=None, description="Optional DICOM study directory.")
    conversion_output_dir: str | None = Field(default=None, description="Optional conversion output directory.")
    preprocessing_output_root: str | None = Field(default=None, description="Optional fMRIPrep output directory.")
    preprocessing_work_root: str | None = Field(default=None, description="Optional fMRIPrep work directory.")
    participant_label: str | None = Field(default=None, description="Optional participant label for preprocessing.")
    structural_t1w_path: str | None = Field(default=None, description="Optional T1-weighted image path.")
    structural_subject_id: str | None = Field(default=None, description="Optional structural subject identifier.")
    structural_subjects_dir: str | None = Field(default=None, description="Optional FastSurfer subjects directory.")
    connectivity_timeseries: list[list[float]] | None = Field(default=None, description="Optional time-series matrix.")
    connectivity_bold_path: str | None = Field(default=None, description="Optional BOLD NIfTI path.")
    segmentation_volume_path: str | None = Field(default=None, description="Optional segmentation input volume path.")
    segmentation_output_dir: str | None = Field(default=None, description="Optional segmentation output directory.")
    execute_external: bool = Field(default=False, description="Whether external tools should be executed.")


def _require_clinician(actor: AuthenticatedActor) -> None:
    """Enforce clinician-or-higher access for Neuro Engine endpoints."""

    require_minimum_role(actor, "clinician")


def _get_engine() -> Any:
    """Return an active NeuroEngine instance or raise a service-unavailable error."""

    if not HAS_NEURO_ENGINE or NeuroEngine is None:
        detail = str(_IMPORT_ERROR) if _IMPORT_ERROR is not None else "package not installed"
        raise ApiServiceError(
            code="neuro_engine_unavailable",
            message="DeepSynaps Neuro Engine is unavailable in this environment.",
            warnings=[detail],
            status_code=503,
        )
    return NeuroEngine()


def _to_jsonable(value: Any) -> Any:
    """Convert dataclasses and paths into FastAPI-friendly JSON primitives."""

    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, dict):
        return {str(key): _to_jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_to_jsonable(item) for item in value]
    if hasattr(value, "to_dict") and callable(value.to_dict):
        return _to_jsonable(value.to_dict())
    if is_dataclass(value):
        return {
            field.name: _to_jsonable(getattr(value, field.name))
            for field in fields(value)
            if field.name not in {"model", "transforms"}
        }
    return repr(value)


@router.get("/health")
def health(actor: AuthenticatedActor = Depends(get_authenticated_actor)) -> dict[str, Any]:
    """Report whether the sibling Neuro Engine package is available."""

    _require_clinician(actor)
    return {
        "ok": HAS_NEURO_ENGINE,
        "status": "available" if HAS_NEURO_ENGINE else "unavailable",
        "package_version": NEURO_ENGINE_VERSION,
        "warning": None if HAS_NEURO_ENGINE else str(_IMPORT_ERROR),
    }


@router.post("/validate-bids")
def validate_bids(
    request: ValidateBIDSRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """Validate a BIDS dataset structure."""

    _require_clinician(actor)
    return _to_jsonable(_get_engine().validate_bids_dataset(request.bids_root))


@router.post("/convert-dicom")
def convert_dicom(
    request: ConvertDICOMRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """Convert a DICOM series to NIfTI."""

    _require_clinician(actor)
    return _to_jsonable(
        _get_engine().convert_dicom_series(
            input_dir=request.input_dir,
            output_dir=request.output_dir,
            output_name=request.output_name,
        )
    )


@router.post("/preprocess")
def preprocess(
    request: PreprocessRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """Plan or execute an fMRIPrep preprocessing run."""

    _require_clinician(actor)
    return _to_jsonable(
        _get_engine().run_preprocessing(
            bids_root=request.bids_root,
            output_root=request.output_root,
            work_root=request.work_root,
            participant_label=request.participant_label,
            execute=request.execute,
            extra_args=request.extra_args,
        )
    )


@router.post("/structural")
def structural(
    request: StructuralRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """Plan or execute a FastSurfer structural segmentation run."""

    _require_clinician(actor)
    return _to_jsonable(
        _get_engine().run_structural(
            t1w_path=request.t1w_path,
            subject_id=request.subject_id,
            subjects_dir=request.subjects_dir,
            execute=request.execute,
            extra_args=request.extra_args,
        )
    )


@router.post("/connectivity")
def connectivity(
    request: ConnectivityRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """Compute a functional connectivity matrix."""

    _require_clinician(actor)
    return _to_jsonable(
        _get_engine().analyze_functional_connectivity(
            timeseries=request.timeseries,
            bold_path=request.bold_path,
            labels=request.labels,
        )
    )


@router.post("/segmentation/model")
def segmentation_model(
    request: SegmentationModelRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """Load or plan the segmentation model bundle."""

    _require_clinician(actor)
    return _to_jsonable(
        _get_engine().prepare_segmentation_model(
            model_path=request.model_path,
            model_name=request.model_name,
        )
    )


@router.post("/segmentation/run")
def segmentation_run(
    request: SegmentationRunRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """Run segmentation on an imaging volume."""

    _require_clinician(actor)
    engine = _get_engine()
    bundle = engine.prepare_segmentation_model(
        model_path=request.model_path,
        model_name=request.model_name,
    )
    return _to_jsonable(
        engine.run_segmentation(
            volume_path=request.volume_path,
            output_dir=request.output_dir,
            bundle=bundle,
        )
    )


@router.post("/orchestrate")
def orchestrate(
    request: OrchestrateRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """Run the high-level Neuro Engine orchestration facade."""

    _require_clinician(actor)
    return _to_jsonable(
        _get_engine().orchestrate(
            bids_root=request.bids_root,
            dicom_input_dir=request.dicom_input_dir,
            conversion_output_dir=request.conversion_output_dir,
            preprocessing_output_root=request.preprocessing_output_root,
            preprocessing_work_root=request.preprocessing_work_root,
            participant_label=request.participant_label,
            structural_t1w_path=request.structural_t1w_path,
            structural_subject_id=request.structural_subject_id,
            structural_subjects_dir=request.structural_subjects_dir,
            connectivity_timeseries=request.connectivity_timeseries,
            connectivity_bold_path=request.connectivity_bold_path,
            segmentation_volume_path=request.segmentation_volume_path,
            segmentation_output_dir=request.segmentation_output_dir,
            execute_external=request.execute_external,
        )
    )
