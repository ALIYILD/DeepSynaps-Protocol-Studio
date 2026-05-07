"""FastAPI-compatible routes for the DeepSynaps Neuro Engine."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

from .. import NeuroEngine

try:
    from fastapi import APIRouter, FastAPI, HTTPException
except ImportError:  # pragma: no cover - exercised in the local sandbox.

    class HTTPException(Exception):
        """Fallback HTTP exception mirroring FastAPI's constructor."""

        def __init__(self, status_code: int, detail: str) -> None:
            """Store HTTP-style error metadata."""

            super().__init__(detail)
            self.status_code = status_code
            self.detail = detail


    @dataclass(slots=True)
    class _Route:
        """Stored route metadata for the fallback router."""

        path: str
        methods: list[str]
        endpoint: Callable[..., Any]


    class APIRouter:
        """Fallback router that records decorated endpoints."""

        def __init__(self, prefix: str = "", tags: list[str] | None = None) -> None:
            """Initialize a lightweight router registry."""

            self.prefix = prefix
            self.tags = tags or []
            self.routes: list[_Route] = []

        def _register(self, path: str, methods: list[str]) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
            """Create a decorator that records a route registration."""

            def decorator(func: Callable[..., Any]) -> Callable[..., Any]:
                self.routes.append(_Route(path=f"{self.prefix}{path}", methods=methods, endpoint=func))
                return func

            return decorator

        def get(self, path: str, **_: Any) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
            """Register a GET route in the fallback router."""

            return self._register(path, ["GET"])

        def post(self, path: str, **_: Any) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
            """Register a POST route in the fallback router."""

            return self._register(path, ["POST"])


    class FastAPI:
        """Fallback FastAPI-like app used when FastAPI is unavailable."""

        def __init__(self, title: str, version: str) -> None:
            """Create a lightweight app container."""

            self.title = title
            self.version = version
            self.routes: list[_Route] = []

        def include_router(self, router: APIRouter) -> None:
            """Attach recorded router routes to the app."""

            self.routes.extend(router.routes)


def create_router(engine: NeuroEngine | None = None) -> APIRouter:
    """Create the neuro engine API router."""

    neuro_engine = engine or NeuroEngine()
    router = APIRouter(prefix="/neuro-engine", tags=["neuro-engine"])

    @router.get("/health")
    def health() -> dict[str, Any]:
        """Return a lightweight service health envelope."""

        return {
            "ok": True,
            "service": "DeepSynaps Neuro Engine",
            "device": neuro_engine.settings.device,
        }

    @router.post("/validate-bids")
    def validate_bids(payload: dict[str, Any]) -> dict[str, Any]:
        """Validate a BIDS tree provided by path."""

        result = neuro_engine.validate_bids_dataset(payload["bids_root"])
        return {
            "is_valid": result.is_valid,
            "subjects": result.subjects,
            "sessions": result.sessions,
            "modalities": result.modalities,
            "errors": result.errors,
            "warnings": result.warnings,
        }

    @router.post("/convert-dicom")
    def convert_dicom(payload: dict[str, Any]) -> dict[str, Any]:
        """Convert a DICOM series into NIfTI."""

        result = neuro_engine.convert_dicom_series(
            input_dir=payload["input_dir"],
            output_dir=payload["output_dir"],
            output_name=payload.get("output_name", "series.nii.gz"),
        )
        return {
            "status": result.status,
            "output_path": str(result.output_path) if result.output_path else None,
            "converted_slices": result.converted_slices,
            "notes": result.notes,
        }

    @router.post("/preprocess")
    def preprocess(payload: dict[str, Any]) -> dict[str, Any]:
        """Plan or run fMRIPrep preprocessing."""

        result = neuro_engine.run_preprocessing(
            bids_root=payload["bids_root"],
            output_root=payload["output_root"],
            work_root=payload["work_root"],
            participant_label=payload.get("participant_label"),
            execute=bool(payload.get("execute", False)),
        )
        return {
            "status": result.status,
            "command": result.command,
            "command_available": result.command_available,
            "expected_outputs": [str(path) for path in result.expected_outputs],
            "notes": result.notes,
        }

    @router.post("/structural")
    def structural(payload: dict[str, Any]) -> dict[str, Any]:
        """Plan or run FastSurfer structural segmentation."""

        result = neuro_engine.run_structural(
            t1w_path=payload["t1w_path"],
            subject_id=payload["subject_id"],
            subjects_dir=payload["subjects_dir"],
            execute=bool(payload.get("execute", False)),
        )
        return {
            "status": result.status,
            "command": result.command,
            "command_available": result.command_available,
            "expected_outputs": [str(path) for path in result.expected_outputs],
            "notes": result.notes,
        }

    @router.post("/connectivity")
    def connectivity(payload: dict[str, Any]) -> dict[str, Any]:
        """Compute a functional connectivity matrix."""

        result = neuro_engine.analyze_functional_connectivity(
            timeseries=payload.get("timeseries"),
            bold_path=payload.get("bold_path"),
            labels=payload.get("labels"),
        )
        return {
            "status": result.status,
            "backend": result.backend,
            "labels": result.labels,
            "matrix": result.matrix,
        }

    @router.post("/segment")
    def segment(payload: dict[str, Any]) -> dict[str, Any]:
        """Run the segmentation flow for a single volume."""

        result = neuro_engine.run_segmentation(
            volume_path=payload["volume_path"],
            output_dir=payload.get("output_dir"),
        )
        return {
            "status": result.status,
            "backend": result.backend,
            "mask_path": str(result.mask_path) if result.mask_path else None,
            "voxel_count": result.voxel_count,
        }

    @router.post("/orchestrate")
    def orchestrate(payload: dict[str, Any]) -> dict[str, Any]:
        """Run the orchestration façade across the requested stages."""

        result = neuro_engine.orchestrate(
            bids_root=payload.get("bids_root"),
            dicom_input_dir=payload.get("dicom_input_dir"),
            conversion_output_dir=payload.get("conversion_output_dir"),
            preprocessing_output_root=payload.get("preprocessing_output_root"),
            preprocessing_work_root=payload.get("preprocessing_work_root"),
            participant_label=payload.get("participant_label"),
            structural_t1w_path=payload.get("structural_t1w_path"),
            structural_subject_id=payload.get("structural_subject_id"),
            structural_subjects_dir=payload.get("structural_subjects_dir"),
            connectivity_timeseries=payload.get("connectivity_timeseries"),
            connectivity_bold_path=payload.get("connectivity_bold_path"),
            segmentation_volume_path=payload.get("segmentation_volume_path"),
            segmentation_output_dir=payload.get("segmentation_output_dir"),
            execute_external=bool(payload.get("execute_external", False)),
        )
        return result.to_dict()

    return router


def create_app(engine: NeuroEngine | None = None) -> FastAPI:
    """Create a FastAPI-compatible app exposing the neuro engine routes."""

    app = FastAPI(title="DeepSynaps Neuro Engine", version="0.1.0")
    app.include_router(create_router(engine=engine))
    return app
