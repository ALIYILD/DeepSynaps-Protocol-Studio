"""Phase 1 neuroimaging I/O endpoints.

Dark-launch: only mounted when DEEPSYNAPS_ENABLE_NEUROIMAGING=1.
"""
from __future__ import annotations

import os
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, Request, UploadFile
from pydantic import BaseModel, Field, model_validator

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
    require_patient_owner,
)
from app.database import get_db_session
from app.errors import ApiServiceError
from app.limiter import limiter
from app.repositories.patients import resolve_patient_clinic_id
from app.services.consent_enforcement import (
    ConsentMissingError,
    require_ai_analysis_consent,
)
from sqlalchemy.orm import Session
from fastapi import Body
from app.services.neuroimaging import (
    HAS_BRAINDECODE,
    HAS_BRAINSPACE,
    HAS_MONAI,
    HAS_NIBABEL,
    HAS_NEUROKIT,
    HAS_PYBIDS,
    HAS_PYNWB,
    build_eegnet,
    forward_pass,
    HAS_SIMNIBS,
    build_unet,
    check_simnibs_version,
    compute_gradients,
    nifti_header_summary,
    open_layout,
    process_ecg,
    process_eda,
    process_rsp,
    read_nwb_summary,
    summarise_layout,
)
from app.services.neuroimaging.kg_biocypher import (
    HAS_BIOCYPHER,
    build_schema_summary as biocypher_build_schema_summary,
)
from app.services.neuroimaging.kg_neo4j import (
    HAS_NEO4J_DRIVER,
    health_check as neo4j_health_check,
)
from app.services.neuroimaging.schemas import (
    BIDSFileRef,
    EcgFeatures,
    EdaFeatures,
    EegModelSummary,
    GradientSummary,
    LayoutSummary,
    MonaiModelSummary,
    NeuroimagingHealth,
    NiftiSummary,
    NwbSummary,
    RspFeatures,
    SimnibsHealth,
)

router = APIRouter(prefix="/api/v1/neuroimaging", tags=["neuroimaging"])

# Category 4 PR-4 — patient-linked neuroimaging knowledge search.
#
# Lives on a SEPARATE router instance from ``router`` so it can be mounted
# unconditionally in ``main.py`` (the legacy ``router`` is gated behind the
# ``DEEPSYNAPS_ENABLE_NEUROIMAGING`` feature flag because it loads heavy
# optional dependencies; the patient-linked search has none of those).
#
# Same URL prefix (``/api/v1/neuroimaging``) so consumers see a single
# coherent neuroimaging API surface regardless of which APIRouter the
# endpoint physically belongs to.
patient_search_router = APIRouter(
    prefix="/api/v1/neuroimaging", tags=["neuroimaging"]
)

_MAX_UPLOAD_BYTES = 500 * 1024 * 1024  # 500 MiB

_NIFTI_EXTS = frozenset({".nii", ".nii.gz"})
_NWB_EXTS = frozenset({".nwb"})

# NIfTI-1 uncompressed magic at byte offset 344
_NIFTI1_MAGIC = b"n+1\x00"
# gzip magic for .nii.gz
_GZIP_MAGIC = b"\x1f\x8b"
# HDF5 magic for .nwb
_HDF5_MAGIC = b"\x89HDF\r\n\x1a\n"


def _bids_allow_list() -> list[Path]:
    """Return the list of allowed BIDS root prefixes.

    Priority: DEEPSYNAPS_BIDS_ROOTS env (colon-separated absolute paths),
    then /data/bids (Fly volume destination from fly.toml [[mounts]]) and
    /tmp/deepsynaps_bids as fallback.
    """
    raw = os.environ.get("DEEPSYNAPS_BIDS_ROOTS", "").strip()
    if raw:
        return [Path(p) for p in raw.split(":") if p]
    return [Path("/data/bids"), Path("/tmp/deepsynaps_bids")]


async def _stream_upload_to_file(file: UploadFile, dest: Path, max_bytes: int) -> None:
    """Stream *file* to *dest*, raising 413 if *max_bytes* is exceeded."""
    total = 0
    with open(dest, "wb") as fh:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > max_bytes:
                raise ApiServiceError(
                    status_code=413,
                    code="file_too_large",
                    message=f"File exceeds maximum size of {max_bytes // (1024 * 1024)} MB",
                )
            fh.write(chunk)


class _BIDSSummariseRequest(BaseModel):
    root_path: str


@router.get("/health", response_model=NeuroimagingHealth)
def get_health(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> NeuroimagingHealth:
    """Return availability of each Phase 1 neuroimaging library."""
    require_minimum_role(actor, "clinician")
    return NeuroimagingHealth(
        nibabel=HAS_NIBABEL,
        pybids=HAS_PYBIDS,
        pynwb=HAS_PYNWB,
        neurokit2=HAS_NEUROKIT,
        nilearn=HAS_NILEARN,
        dipy=HAS_DIPY,
        simnibs=HAS_SIMNIBS,
        monai=HAS_MONAI,
        brainspace=HAS_BRAINSPACE,
        neo4j=HAS_NEO4J_DRIVER,
        biocypher=HAS_BIOCYPHER,
        braindecode=HAS_BRAINDECODE,
        torch=HAS_BRAINDECODE,
        versions={},
    )


@router.get("/kg/neo4j/health")
def get_kg_neo4j_health(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
):
    """Phase 5 — probe Neo4j reachability lazily; never opens connection at startup."""
    require_minimum_role(actor, "clinician")
    if not HAS_NEO4J_DRIVER:
        raise ApiServiceError(
            status_code=503,
            code="neuroimaging_library_unavailable",
            message="neo4j driver is not installed",
        )
    return neo4j_health_check()


class _BiocypherSchemaRequest(BaseModel):
    yaml_path: str


@router.post("/kg/biocypher/schema")
def post_kg_biocypher_schema(
    body: _BiocypherSchemaRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
):
    """Phase 5 — summarise a BioCypher YAML schema."""
    require_minimum_role(actor, "clinician")
    return biocypher_build_schema_summary(body.yaml_path)


@router.post("/nifti/inspect", response_model=NiftiSummary)
@limiter.limit("10/minute")
async def inspect_nifti(
    request: Request,
    file: UploadFile,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> NiftiSummary:
    """Upload a NIfTI file and return header summary."""
    if not HAS_NIBABEL:
        raise ApiServiceError(
            status_code=503,
            code="neuroimaging_library_unavailable",
            message="nibabel is not installed",
        )
    require_minimum_role(actor, "clinician")

    name = file.filename or "upload.nii"
    suffix = "".join(Path(name).suffixes[-2:]) or Path(name).suffix
    if suffix not in _NIFTI_EXTS:
        raise ApiServiceError(
            status_code=415,
            code="unsupported_media_type",
            message=f"Unsupported extension '{suffix}'. Accepted: {', '.join(sorted(_NIFTI_EXTS))}",
        )

    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir) / "upload.nii.gz"
        await _stream_upload_to_file(file, tmp_path, _MAX_UPLOAD_BYTES)
        with open(tmp_path, "rb") as fh:
            header_bytes = fh.read(352)
        if suffix == ".nii.gz":
            if header_bytes[:2] != _GZIP_MAGIC:
                raise ApiServiceError(
                    status_code=415,
                    code="invalid_file_signature",
                    message="File does not appear to be a valid gzip-compressed NIfTI (.nii.gz)",
                )
        else:
            if len(header_bytes) >= 348 and header_bytes[344:348] != _NIFTI1_MAGIC:
                raise ApiServiceError(
                    status_code=415,
                    code="invalid_file_signature",
                    message="File does not appear to be a valid NIfTI-1 file (bad magic bytes at offset 344)",
                )
        return nifti_header_summary(str(tmp_path))


@router.post("/bids/summarise", response_model=LayoutSummary)
def summarise_bids(
    body: _BIDSSummariseRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> LayoutSummary:
    """Open a server-side BIDS dataset root and return layout summary."""
    if not HAS_PYBIDS:
        raise ApiServiceError(
            status_code=503,
            code="neuroimaging_library_unavailable",
            message="pybids is not installed",
        )
    require_minimum_role(actor, "clinician")

    try:
        resolved = Path(body.root_path).resolve(strict=True)
    except (OSError, ValueError):
        raise ApiServiceError(
            status_code=403,
            code="bids_root_not_allowed",
            message="The provided BIDS root path does not exist or is not accessible.",
        )

    allow_list = _bids_allow_list()
    if not any(
        resolved == prefix or resolved.is_relative_to(prefix)
        for prefix in allow_list
    ):
        raise ApiServiceError(
            status_code=403,
            code="bids_root_not_allowed",
            message="The provided BIDS root path is not in the server allow-list.",
        )

    layout = open_layout(str(resolved))
    return summarise_layout(layout)


@router.post("/nwb/inspect", response_model=NwbSummary)
@limiter.limit("10/minute")
async def inspect_nwb(
    request: Request,
    file: UploadFile,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> NwbSummary:
    """Upload an NWB file and return summary."""
    if not HAS_PYNWB:
        raise ApiServiceError(
            status_code=503,
            code="neuroimaging_library_unavailable",
            message="pynwb is not installed",
        )
    require_minimum_role(actor, "clinician")

    name = file.filename or "upload.nwb"
    suffix = Path(name).suffix.lower()
    if suffix not in _NWB_EXTS:
        raise ApiServiceError(
            status_code=415,
            code="unsupported_media_type",
            message=f"Unsupported extension '{suffix}'. Accepted: .nwb",
        )

    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir) / "upload.nwb"
        await _stream_upload_to_file(file, tmp_path, _MAX_UPLOAD_BYTES)
        with open(tmp_path, "rb") as fh:
            magic = fh.read(8)
        if magic != _HDF5_MAGIC:
            raise ApiServiceError(
                status_code=415,
                code="invalid_file_signature",
                message="File does not appear to be a valid HDF5/NWB file (bad magic bytes)",
            )
        return read_nwb_summary(str(tmp_path))


# ---------------------------------------------------------------------------
# Phase 2a — NeuroKit2 physiology endpoints
# ---------------------------------------------------------------------------

_MAX_SIGNAL_SAMPLES = 5_000_000  # ≈5 M samples


class _PhysioRequest(BaseModel):
    signal: list[float]
    sampling_rate: int


def _validate_physio_request(body: _PhysioRequest) -> None:
    if body.sampling_rate < 1 or body.sampling_rate > 100_000:
        raise ApiServiceError(
            status_code=422,
            code="invalid_sampling_rate",
            message=f"sampling_rate must be in [1, 100000]; got {body.sampling_rate}.",
        )
    if len(body.signal) > _MAX_SIGNAL_SAMPLES:
        raise ApiServiceError(
            status_code=413,
            code="signal_too_long",
            message=f"Signal length {len(body.signal)} exceeds maximum of {_MAX_SIGNAL_SAMPLES} samples.",
        )


@router.post("/physio/ecg", response_model=EcgFeatures)
@limiter.limit("10/minute")
def physio_ecg(
    request: Request,
    body: _PhysioRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> EcgFeatures:
    """Process an ECG signal and return features."""
    if not HAS_NEUROKIT:
        raise ApiServiceError(
            status_code=503,
            code="neuroimaging_library_unavailable",
            message="neurokit2 is not installed",
        )
    require_minimum_role(actor, "clinician")
    _validate_physio_request(body)
    return process_ecg(body.signal, body.sampling_rate)


@router.post("/physio/eda", response_model=EdaFeatures)
@limiter.limit("10/minute")
def physio_eda(
    request: Request,
    body: _PhysioRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> EdaFeatures:
    """Process an EDA signal and return features."""
    if not HAS_NEUROKIT:
        raise ApiServiceError(
            status_code=503,
            code="neuroimaging_library_unavailable",
            message="neurokit2 is not installed",
        )
    require_minimum_role(actor, "clinician")
    _validate_physio_request(body)
    return process_eda(body.signal, body.sampling_rate)


@router.post("/physio/rsp", response_model=RspFeatures)
@limiter.limit("10/minute")
def physio_rsp(
    request: Request,
    body: _PhysioRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> RspFeatures:
    """Process a respiratory signal and return features."""
    if not HAS_NEUROKIT:
        raise ApiServiceError(
            status_code=503,
            code="neuroimaging_library_unavailable",
            message="neurokit2 is not installed",
        )
    require_minimum_role(actor, "clinician")
    _validate_physio_request(body)
    return process_rsp(body.signal, body.sampling_rate)


# ---------------------------------------------------------------------------
# Phase 2b — Nilearn + DIPY endpoints
# ---------------------------------------------------------------------------

from app.services.neuroimaging import (  # noqa: E402 — appended import block
    HAS_NILEARN,
    HAS_DIPY,
    mask_nifti,
    extract_atlas_timeseries,
    compute_connectome,
    fit_dti,
)
from app.services.neuroimaging.schemas import (  # noqa: E402
    MaskerSummary,
    AtlasTimeseriesSummary,
    ConnectomeSummary,
    DtiScalarSummary,
)

_MAX_BVAL_BYTES = 1 * 1024 * 1024   # 1 MiB
_MAX_BVEC_BYTES = 1 * 1024 * 1024   # 1 MiB
_BVAL_EXTS = frozenset({".bval", ".bvals"})
_BVEC_EXTS = frozenset({".bvec", ".bvecs"})
_KNOWN_CONNECTOME_KINDS = frozenset(
    {"correlation", "partial correlation", "tangent", "covariance", "precision"}
)


class _NilearenAtlasRequest(BaseModel):
    img_path: str
    atlas_path: str


class _ConnectomeRequest(BaseModel):
    timeseries: list[list[float]]
    kind: str = "correlation"


def _resolve_allowed_path(raw_path: str) -> Path:
    """Resolve *raw_path* against the BIDS allow-list. Raises ApiServiceError on traversal."""
    try:
        resolved = Path(raw_path).resolve(strict=False)
    except (OSError, ValueError):
        raise ApiServiceError(
            status_code=403,
            code="path_not_allowed",
            message="Path could not be resolved.",
        )
    allow_list = _bids_allow_list()
    if not any(
        resolved == prefix or str(resolved).startswith(str(prefix) + "/")
        for prefix in allow_list
    ):
        raise ApiServiceError(
            status_code=403,
            code="path_not_allowed",
            message="The provided path is not in the server allow-list.",
        )
    return resolved


@router.post("/nilearn/mask", response_model=MaskerSummary)
@limiter.limit("10/minute")
async def nilearn_mask(
    request: Request,
    file: UploadFile,
    mask_strategy: str = "whole-brain",
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> MaskerSummary:
    """Upload a NIfTI file and return NiftiMasker summary."""
    if not HAS_NILEARN:
        raise ApiServiceError(
            status_code=503,
            code="neuroimaging_library_unavailable",
            message="nilearn is not installed",
        )
    require_minimum_role(actor, "clinician")

    name = file.filename or "upload.nii"
    suffix = "".join(Path(name).suffixes[-2:]) or Path(name).suffix
    if suffix not in _NIFTI_EXTS:
        raise ApiServiceError(
            status_code=415,
            code="unsupported_media_type",
            message=f"Unsupported extension '{suffix}'. Accepted: {', '.join(sorted(_NIFTI_EXTS))}",
        )

    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir) / ("upload" + suffix)
        await _stream_upload_to_file(file, tmp_path, _MAX_UPLOAD_BYTES)
        with open(tmp_path, "rb") as fh:
            header_bytes = fh.read(8)
        if suffix == ".nii.gz":
            if header_bytes[:2] != _GZIP_MAGIC:
                raise ApiServiceError(
                    status_code=415,
                    code="invalid_file_signature",
                    message="File does not appear to be a valid gzip-compressed NIfTI (.nii.gz)",
                )
        return mask_nifti(str(tmp_path), mask_strategy=mask_strategy)


@router.post("/nilearn/atlas-timeseries", response_model=AtlasTimeseriesSummary)
@limiter.limit("10/minute")
async def nilearn_atlas_timeseries(
    request: Request,
    body: _NilearenAtlasRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> AtlasTimeseriesSummary:
    """Extract atlas timeseries from server-side NIfTI + atlas files."""
    if not HAS_NILEARN:
        raise ApiServiceError(
            status_code=503,
            code="neuroimaging_library_unavailable",
            message="nilearn is not installed",
        )
    require_minimum_role(actor, "clinician")

    img_resolved = _resolve_allowed_path(body.img_path)
    atlas_resolved = _resolve_allowed_path(body.atlas_path)
    return extract_atlas_timeseries(str(img_resolved), str(atlas_resolved))


@router.post("/nilearn/connectome", response_model=ConnectomeSummary)
@limiter.limit("10/minute")
async def nilearn_connectome(
    request: Request,
    body: _ConnectomeRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> ConnectomeSummary:
    """Compute a connectivity matrix from a client-supplied timeseries."""
    if not HAS_NILEARN:
        raise ApiServiceError(
            status_code=503,
            code="neuroimaging_library_unavailable",
            message="nilearn is not installed",
        )
    require_minimum_role(actor, "clinician")

    if body.kind not in _KNOWN_CONNECTOME_KINDS:
        raise ApiServiceError(
            status_code=422,
            code="invalid_connectome_kind",
            message=f"Unknown kind '{body.kind}'. Valid: {sorted(_KNOWN_CONNECTOME_KINDS)}",
        )

    ts = body.timeseries
    n_tp = len(ts)
    n_reg = len(ts[0]) if ts else 0
    if n_tp * n_reg > 1_000_000:
        raise ApiServiceError(
            status_code=413,
            code="timeseries_too_large",
            message=f"n_timepoints * n_regions = {n_tp * n_reg} exceeds limit of 1,000,000",
        )

    return compute_connectome(ts, kind=body.kind)


@router.post("/dipy/dti-scalars", response_model=DtiScalarSummary)
@limiter.limit("10/minute")
async def dipy_dti_scalars(
    request: Request,
    nifti_file: UploadFile,
    bval_file: UploadFile,
    bvec_file: UploadFile,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> DtiScalarSummary:
    """Upload DWI NIfTI + bval + bvec files and return DTI scalar summary."""
    if not HAS_DIPY:
        raise ApiServiceError(
            status_code=503,
            code="neuroimaging_library_unavailable",
            message="dipy is not installed",
        )
    require_minimum_role(actor, "clinician")

    nifti_name = nifti_file.filename or "dwi.nii"
    nifti_suffix = "".join(Path(nifti_name).suffixes[-2:]) or Path(nifti_name).suffix
    if nifti_suffix not in _NIFTI_EXTS:
        raise ApiServiceError(
            status_code=415,
            code="unsupported_media_type",
            message=f"NIfTI extension '{nifti_suffix}' not accepted. Use .nii or .nii.gz",
        )

    bval_name = bval_file.filename or "dwi.bval"
    bval_suffix = Path(bval_name).suffix.lower()
    if bval_suffix not in _BVAL_EXTS:
        raise ApiServiceError(
            status_code=415,
            code="unsupported_media_type",
            message=f"bval extension '{bval_suffix}' not accepted. Use .bval or .bvals",
        )

    bvec_name = bvec_file.filename or "dwi.bvec"
    bvec_suffix = Path(bvec_name).suffix.lower()
    if bvec_suffix not in _BVEC_EXTS:
        raise ApiServiceError(
            status_code=415,
            code="unsupported_media_type",
            message=f"bvec extension '{bvec_suffix}' not accepted. Use .bvec or .bvecs",
        )

    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp = Path(tmp_dir)
        nii_path = tmp / ("dwi" + nifti_suffix)
        bval_path = tmp / "dwi.bval"
        bvec_path = tmp / "dwi.bvec"
        await _stream_upload_to_file(nifti_file, nii_path, _MAX_UPLOAD_BYTES)
        await _stream_upload_to_file(bval_file, bval_path, _MAX_BVAL_BYTES)
        await _stream_upload_to_file(bvec_file, bvec_path, _MAX_BVEC_BYTES)

        with open(nii_path, "rb") as fh:
            magic = fh.read(2)
        if nifti_suffix == ".nii.gz" and magic != _GZIP_MAGIC:
            raise ApiServiceError(
                status_code=415,
                code="invalid_file_signature",
                message="NIfTI file does not appear to be gzip-compressed",
            )

        return fit_dti(str(nii_path), str(bval_path), str(bvec_path))


# ---------------------------------------------------------------------------
# Phase 2c — Braindecode (optional [neuro-dl] extra) endpoints
# ---------------------------------------------------------------------------
class _BuildModelRequest(BaseModel):
    model: str = "eegnet"
    n_channels: int = Field(..., ge=1, le=256)
    n_classes: int = Field(..., ge=2, le=100)
    input_window_samples: int = Field(..., ge=16, le=100_000)


class _ForwardRequest(BaseModel):
    model_spec: dict
    input_shape: list[int] = Field(..., min_length=3, max_length=3)

    @model_validator(mode="after")
    def _check_shape_bounds(self) -> "_ForwardRequest":
        shape = self.input_shape
        if len(shape) != 3:
            raise ValueError("input_shape must have exactly 3 elements")
        batch, channels, timepoints = shape
        if batch > 16:
            raise ValueError("batch must be <= 16")
        if channels > 256:
            raise ValueError("channels must be <= 256")
        if timepoints > 100_000:
            raise ValueError("timepoints must be <= 100_000")
        return self


@router.post("/eeg-dl/build-model", response_model=EegModelSummary)
@limiter.limit("10/minute")
async def eeg_dl_build_model(
    request: Request,
    body: _BuildModelRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> EegModelSummary:
    """Build a braindecode EEG model and return layer/param summary."""
    require_minimum_role(actor, "clinician")
    if not HAS_BRAINDECODE:
        raise ApiServiceError(
            status_code=503,
            code="neuroimaging_library_unavailable",
            message="Braindecode is not installed",
        )
    return build_eegnet(
        n_channels=body.n_channels,
        n_classes=body.n_classes,
        input_window_samples=body.input_window_samples,
    )


@router.post("/eeg-dl/forward")
@limiter.limit("10/minute")
async def eeg_dl_forward(
    request: Request,
    body: _ForwardRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict:
    """Run a random forward pass through the specified braindecode model."""
    require_minimum_role(actor, "clinician")
    if not HAS_BRAINDECODE:
        raise ApiServiceError(
            status_code=503,
            code="neuroimaging_library_unavailable",
            message="Braindecode is not installed",
        )

    shape = body.input_shape
    if len(shape) != 3:
        raise ApiServiceError(
            status_code=422,
            code="invalid_input_shape",
            message="input_shape must have exactly 3 elements",
        )
    batch, channels, timepoints = shape
    if batch > 16:
        raise ApiServiceError(
            status_code=422,
            code="invalid_input_shape",
            message="batch must be <= 16",
        )
    if channels > 256:
        raise ApiServiceError(
            status_code=422,
            code="invalid_input_shape",
            message="channels must be <= 256",
        )
    if timepoints > 100_000:
        raise ApiServiceError(
            status_code=422,
            code="invalid_input_shape",
            message="timepoints must be <= 100_000",
        )

    return forward_pass(body.model_spec, input_shape=tuple(shape))

# ── Phase 3 simulation: SimNIBS / MONAI / BrainSpace ───────────────────────


# Per-axis cap for MONAI build-unet — SimNIBS / MONAI documentation
# recommends keeping per-axis channels modest on CPU paths. We refuse
# >128 to bound the construction time and memory.
_MAX_UNET_AXIS = 128

# Per-axis cap for BrainSpace connectome ingest. Total cells max = 1e6
# so a 1000x1000 matrix is the upper bound — beyond that we 413.
_MAX_CONNECTOME_CELLS = 1_000_000


class _MonaiBuildUnetRequest(BaseModel):
    in_channels: int
    out_channels: int
    spatial_dims: int = 3


class _BrainspaceGradientsRequest(BaseModel):
    matrix: list[list[float]]
    n_components: int = 3


@router.get("/simnibs/health", response_model=SimnibsHealth)
def get_simnibs_health(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> SimnibsHealth:
    """Probe the SimNIBS CLI binary on PATH and report version.

    Safe to call even when the GPL-3.0 binary is absent — returns
    available=False / version=None in that case.
    """
    require_minimum_role(actor, "clinician")
    return check_simnibs_version()


@router.post("/monai/build-unet", response_model=MonaiModelSummary)
@limiter.limit("10/minute")
async def monai_build_unet(
    request: Request,
    body: _MonaiBuildUnetRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> MonaiModelSummary:
    """Construct a small MONAI UNet and return a parameter summary.

    Constraints: in_channels and out_channels in [1, 128]; spatial_dims
    in {2, 3}. No training or persistence happens.
    """
    if not HAS_MONAI:
        raise ApiServiceError(
            status_code=503,
            code="neuroimaging_library_unavailable",
            message="MONAI is not installed (install with the [neuro-dl] extra)",
        )
    require_minimum_role(actor, "clinician")

    if body.spatial_dims not in (2, 3):
        raise ApiServiceError(
            status_code=422,
            code="invalid_spatial_dims",
            message="spatial_dims must be 2 or 3",
        )
    if not (1 <= body.in_channels <= _MAX_UNET_AXIS):
        raise ApiServiceError(
            status_code=422,
            code="invalid_in_channels",
            message=f"in_channels must be in [1, {_MAX_UNET_AXIS}]",
        )
    if not (1 <= body.out_channels <= _MAX_UNET_AXIS):
        raise ApiServiceError(
            status_code=422,
            code="invalid_out_channels",
            message=f"out_channels must be in [1, {_MAX_UNET_AXIS}]",
        )

    return build_unet(
        in_channels=body.in_channels,
        out_channels=body.out_channels,
        spatial_dims=body.spatial_dims,
    )


@router.post("/brainspace/gradients", response_model=GradientSummary)
@limiter.limit("10/minute")
async def brainspace_gradients(
    request: Request,
    body: _BrainspaceGradientsRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> GradientSummary:
    """Decompose a connectome into principal gradients via BrainSpace.

    Constraints: square matrix, no jagged rows, total cells <= 1e6,
    n_components in [1, 50].
    """
    if not HAS_BRAINSPACE:
        raise ApiServiceError(
            status_code=503,
            code="neuroimaging_library_unavailable",
            message="brainspace is not installed",
        )
    require_minimum_role(actor, "clinician")

    matrix = body.matrix
    if not matrix or not isinstance(matrix, list):
        raise ApiServiceError(
            status_code=422,
            code="invalid_matrix",
            message="matrix must be a non-empty 2-D list",
        )
    n_rows = len(matrix)
    row_lengths = {len(row) for row in matrix}
    if len(row_lengths) != 1:
        raise ApiServiceError(
            status_code=422,
            code="jagged_matrix",
            message="all rows of matrix must have the same length",
        )
    n_cols = row_lengths.pop()
    if n_rows != n_cols:
        raise ApiServiceError(
            status_code=422,
            code="non_square_matrix",
            message="matrix must be square (n_rows == n_cols)",
        )
    if n_rows * n_cols > _MAX_CONNECTOME_CELLS:
        raise ApiServiceError(
            status_code=413,
            code="matrix_too_large",
            message=f"matrix exceeds the {_MAX_CONNECTOME_CELLS} cell cap",
        )
    if not (1 <= body.n_components <= 50):
        raise ApiServiceError(
            status_code=422,
            code="invalid_n_components",
            message="n_components must be in [1, 50]",
        )
    if n_rows <= body.n_components:
        raise ApiServiceError(
            status_code=422,
            code="matrix_too_small_for_components",
            message="matrix dimension must exceed n_components",
        )

    return compute_gradients(matrix, n_components=body.n_components)


# ─── Patient-linked neuroimaging knowledge search ────────────────────────────
#
# Category 4 PR-4. This endpoint accepts a patient_id and runs the same
# federated catalog search the anonymous PR-3 ``POST /search`` runs, with
# three additional gates applied IN ORDER before any upstream call:
#
#   1. role gate (clinician/admin/owner) via ``require_minimum_role``
#   2. cross-clinic IDOR gate via ``_gate_patient_access_neuro`` (the
#      module-local helper below — same shape as biomarker_router etc.).
#   3. AI-analysis consent gate via ``require_ai_analysis_consent``.
#
# The endpoint then delegates to the SAME ``federate()`` PR-3 wires under
# ``/search``. No duplicate federation logic. If the PR-3 federation
# runtime is not present in this deployment (e.g. running against a tree
# where ``app.services.knowledge.neuroimaging_federation`` has not yet
# been wired), the endpoint returns a structured 503 with
# ``code="federation_runtime_unavailable"`` — it does NOT crash and does
# NOT silently degrade to a stub.
#
# Response is the PR-3 shape PLUS ``patient_id`` echoed in provenance
# and ``consent_status`` carrying the consent record id used.


def _gate_patient_access_neuro(
    actor: AuthenticatedActor, patient_id: str, db: Session
) -> None:
    """Cross-clinic IDOR guard. See ``deepsynaps-qeeg-pdf-export-tenant-gate.md``.

    Pattern mirrors biomarker_router._gate_patient_access. Kept module-local
    so this PR is purely additive — no shared helper extraction.
    """
    require_minimum_role(actor, "clinician")
    exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
    if not exists:
        raise ApiServiceError(
            code="not_found",
            message="Patient not found.",
            status_code=404,
        )
    require_patient_owner(actor, clinic_id)


class _PatientNeuroSearchRequest(BaseModel):
    """Patient-linked neuroimaging knowledge search body.

    Same fields as PR-3 ``NeuroimagingSearchRequest`` PLUS the required
    ``patient_id``. Every catalog field is optional — an empty body
    (apart from ``patient_id``) returns all enabled-source results.
    """

    patient_id: str = Field(..., min_length=1, description="Owning-clinic patient id")
    condition: str | None = Field(None)
    modality: str | None = Field(None)
    region: str | None = Field(None)
    coordinate: list[float] | None = Field(None)
    atlas: str | None = Field(None)
    population: str | None = Field(None)
    sources: list[str] | None = Field(None)
    limit: int = Field(20, ge=1, le=100)


@patient_search_router.post("/search-for-patient")
async def search_neuroimaging_for_patient(
    payload: _PatientNeuroSearchRequest = Body(...),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Patient-scoped neuroimaging knowledge federation.

    Catalog federation is identical to the anonymous PR-3 endpoint. The
    patient linkage is purely about *authorisation* (cross-clinic gate +
    consent) and *audit* (patient id echoed in provenance). No PHI is
    forwarded to upstream catalogs — the query payload contains only
    public clinical metadata (condition, modality, region, atlas,
    population) sourced from clinician input.

    Gates run in the exact order required by the audit pattern:
      1. role gate
      2. cross-clinic ownership gate
      3. AI-analysis consent gate
    Each failure produces a structured ``ApiServiceError`` (403/404/422)
    BEFORE any upstream catalog call is attempted.

    The ``federate`` import is lazy so the router can still boot in
    deployments where PR-3's federation runtime has not landed; in that
    case the endpoint returns 503 with ``federation_runtime_unavailable``.
    """
    # 1) role + 2) cross-clinic ownership (raises 403 or 404).
    _gate_patient_access_neuro(actor, payload.patient_id, db)

    # 3) consent gate — must run BEFORE the federation call so a missing
    # consent record is the 403 the caller sees, not some federation result.
    try:
        consent = require_ai_analysis_consent(
            db, payload.patient_id, actor, ai_modality="neuroimaging"
        )
    except ConsentMissingError as exc:
        raise ApiServiceError(
            code="consent_missing",
            message=str(exc),
            status_code=403,
            warnings=[
                "ai_analysis consent is required for patient-linked neuroimaging search.",
            ],
        ) from exc

    # Lazy-import PR-3 federation runtime. If absent, return a structured
    # 503 — the endpoint is wired but the federation backend is not yet
    # available in this build.
    try:
        from app.services.knowledge.neuroimaging_federation import (  # type: ignore[import-not-found]
            NeuroimagingSearchQuery,
            federate,
        )
        from app.services.knowledge.neuroimaging_inventory import (  # type: ignore[import-not-found]
            DECISION_SUPPORT_DISCLAIMER,
            NEUROIMAGING_SOURCES,
            list_enabled_sources,
        )
    except ImportError as exc:
        raise ApiServiceError(
            code="federation_runtime_unavailable",
            message=(
                "Neuroimaging federation runtime is not wired in this build. "
                "Patient-linked search requires the PR-3 federation runtime."
            ),
            status_code=503,
            warnings=[str(exc)],
        ) from exc

    # Build the federation query (catalog metadata only — no patient id leaks
    # into the upstream call shape).
    query = NeuroimagingSearchQuery(
        condition=payload.condition,
        modality=payload.modality,
        region=payload.region,
        coordinate=payload.coordinate,
        atlas=payload.atlas,
        population=payload.population,
        sources=payload.sources,
        limit=payload.limit,
    )

    enabled = list_enabled_sources()
    requested_ids = set(payload.sources or [])
    unknown: set[str] = set()
    if requested_ids:
        all_ids = {src["id"] for src in NEUROIMAGING_SOURCES}
        unknown = requested_ids - all_ids
        enabled = [src for src in enabled if src["id"] in requested_ids]

    outcome = await federate(query, enabled)

    src_lookup = {src["id"]: src for src in enabled}
    results: list[dict] = []
    for r in outcome["results"]:
        src = src_lookup.get(r.source, {})
        results.append(
            {
                "source_id": r.source,
                "source_name": src.get("name", r.source),
                "record": r.model_dump(),
                "provenance": {
                    "source_id": r.source,
                    "source_url": src.get("source_url", ""),
                    "lifecycle_state": src.get("lifecycle_state", "healthy"),
                    **(r.provenance or {}),
                },
            }
        )

    warnings = list(outcome["warnings"])
    for unk in sorted(unknown):
        warnings.append(f"unknown source id ignored: {unk}")

    provenance = {
        "queried_sources": [src["id"] for src in enabled],
        "total_results": len(results),
        "patient_id": payload.patient_id,
        "decision_support_disclaimer": DECISION_SUPPORT_DISCLAIMER,
    }

    return {
        "patient_id": payload.patient_id,
        "consent_status": {
            "consent_id": getattr(consent, "id", None),
            "consent_type": "ai_analysis",
            "ai_modality": "neuroimaging",
        },
        "source_status": outcome["source_status"],
        "results": results,
        "warnings": warnings,
        "provenance": provenance,
        "decision_support_disclaimer": DECISION_SUPPORT_DISCLAIMER,
    }
