"""Facade and exports for the DeepSynaps Neuro Engine."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence

from .config import NeuroEngineSettings, load_settings
from .functional.connectivity import (
    ConnectivityBundle,
    ConnectivityExtractionError,
    ConnectivityResult,
    ConnectivityRunResult,
    FunctionalConnectivityExtractor,
    compute_functional_connectivity,
)
from .models.segmentation import (
    SegmentationInferenceResult,
    SegmentationModelBundle,
    load_segmentation_model,
    run_segmentation,
)
from .preprocessing.fmriprep_runner import (
    FMRIPrepExecutionError,
    FMRIPrepRunConfig,
    FMRIPrepRunResult,
    FMRIPrepRunner,
    run_fmriprep,
)
from .structural.fastsurfer_runner import (
    FastSurferExecutionError,
    FastSurferRunConfig,
    FastSurferRunResult,
    FastSurferRunner,
    run_fastsurfer,
)
from .structural.biomarkers import (
    FastSurferBiomarkerExtractor,
    StructuralBiomarkerBundle,
    StructuralBiomarkerError,
)
from .structural.normalization import (
    NormalizedStructuralRecord,
    StructuralNormalizationError,
    StructuralNormalizer,
)
from .utils.bids_validator import BIDSValidationResult, validate_bids_dataset
from .utils.dicom_converter import DICOMConversionResult, convert_dicom_series

__version__ = "0.1.0"


@dataclass(slots=True)
class NeuroEngineRunResult:
    """Aggregate result for a full neuro engine orchestration run."""

    validation: BIDSValidationResult | None = None
    conversion: DICOMConversionResult | None = None
    preprocessing: FMRIPrepRunResult | None = None
    structural: FastSurferRunResult | None = None
    connectivity: ConnectivityResult | None = None
    segmentation_bundle: SegmentationModelBundle | None = None
    segmentation: SegmentationInferenceResult | None = None

    def to_dict(self) -> dict[str, Any]:
        """Serialize the orchestration result into JSON-friendly primitives."""

        return {
            "validation": None if self.validation is None else {
                "bids_root": str(self.validation.bids_root),
                "is_valid": self.validation.is_valid,
                "subjects": self.validation.subjects,
                "sessions": self.validation.sessions,
                "modalities": self.validation.modalities,
                "errors": self.validation.errors,
                "warnings": self.validation.warnings,
            },
            "conversion": None if self.conversion is None else {
                "status": self.conversion.status,
                "input_dir": str(self.conversion.input_dir),
                "output_path": str(self.conversion.output_path) if self.conversion.output_path else None,
                "converted_slices": self.conversion.converted_slices,
                "notes": self.conversion.notes,
            },
            "preprocessing": None if self.preprocessing is None else {
                "status": self.preprocessing.status,
                "command": self.preprocessing.command,
                "command_available": self.preprocessing.command_available,
                "expected_outputs": [str(path) for path in self.preprocessing.expected_outputs],
                "notes": self.preprocessing.notes,
            },
            "structural": None if self.structural is None else {
                "status": self.structural.status,
                "command": self.structural.command,
                "command_available": self.structural.command_available,
                "expected_outputs": [str(path) for path in self.structural.expected_outputs],
                "notes": self.structural.notes,
            },
            "connectivity": None if self.connectivity is None else {
                "status": self.connectivity.status,
                "backend": self.connectivity.backend,
                "matrix": self.connectivity.matrix,
                "labels": self.connectivity.labels,
                "notes": self.connectivity.notes,
            },
            "segmentation_bundle": None if self.segmentation_bundle is None else {
                "status": self.segmentation_bundle.status,
                "backend": self.segmentation_bundle.backend,
                "model_name": self.segmentation_bundle.model_name,
                "model_loaded": self.segmentation_bundle.model_loaded,
                "transforms_loaded": self.segmentation_bundle.transforms_loaded,
                "notes": self.segmentation_bundle.notes,
            },
            "segmentation": None if self.segmentation is None else {
                "status": self.segmentation.status,
                "backend": self.segmentation.backend,
                "mask_path": str(self.segmentation.mask_path) if self.segmentation.mask_path else None,
                "voxel_count": self.segmentation.voxel_count,
                "foreground_fraction": self.segmentation.foreground_fraction,
                "notes": self.segmentation.notes,
            },
        }


class NeuroEngine:
    """Clinical orchestration façade for the DeepSynaps neuroimaging stack."""

    def __init__(self, settings: NeuroEngineSettings | None = None) -> None:
        """Initialize the façade with env-backed settings."""

        self.settings = settings or load_settings()

    def validate_bids_dataset(self, bids_root: str | Path) -> BIDSValidationResult:
        """Validate a BIDS dataset tree."""

        return validate_bids_dataset(bids_root)

    def convert_dicom_series(
        self,
        input_dir: str | Path,
        output_dir: str | Path,
        output_name: str = "series.nii.gz",
    ) -> DICOMConversionResult:
        """Convert a DICOM series into a NIfTI file when dependencies are available."""

        return convert_dicom_series(input_dir=input_dir, output_dir=output_dir, output_name=output_name)

    def run_preprocessing(
        self,
        bids_root: str | Path,
        output_root: str | Path,
        work_root: str | Path,
        participant_label: str | None = None,
        session_id: str | None = None,
        execute: bool = False,
        extra_args: Sequence[str] | None = None,
    ) -> FMRIPrepRunResult:
        """Plan or run fMRIPrep preprocessing."""

        return run_fmriprep(
            settings=self.settings,
            bids_root=Path(bids_root),
            output_root=Path(output_root),
            work_root=Path(work_root),
            participant_label=participant_label or self.settings.default_participant_label,
            session_id=session_id,
            extra_args=extra_args,
            execute=execute,
        )

    def run_fmriprep(
        self,
        subject_id: str,
        session_id: str | None = None,
        *,
        bids_root: str | Path | None = None,
        output_root: str | Path | None = None,
        work_root: str | Path | None = None,
        fs_license_file: str | Path | None = None,
        image: str | None = None,
        threads: int | None = None,
        mem_mb: int = 32000,
        use_freesurfer: bool = True,
        output_spaces: Sequence[str] | None = None,
        skip_bids_validation: bool = False,
        clean_workdir: bool = False,
        extra_args: Sequence[str] | None = None,
        docker_executable: str = "docker",
    ) -> Path:
        """Execute fMRIPrep for one subject/session and return the derivatives root."""

        resolved_bids_root = Path(bids_root) if bids_root is not None else self.settings.bids_root
        resolved_output_root = (
            Path(output_root)
            if output_root is not None
            else getattr(self.settings, "fmriprep_output_root", self.settings.output_root)
        )
        resolved_work_root = (
            Path(work_root)
            if work_root is not None
            else getattr(self.settings, "fmriprep_work_root", self.settings.work_root)
        )
        resolved_license = (
            Path(fs_license_file)
            if fs_license_file is not None
            else getattr(self.settings, "freesurfer_license_file", None) or self.settings.fs_license_file
        )
        config = FMRIPrepRunConfig(
            bids_root=resolved_bids_root,
            output_root=resolved_output_root,
            work_root=resolved_work_root,
            subject_id=subject_id,
            session_id=session_id,
            fs_license_file=resolved_license,
            image=image or getattr(self.settings, "fmriprep_docker_image", "nipreps/fmriprep:latest"),
            threads=threads or self.settings.fmri_threads,
            mem_mb=mem_mb,
            use_freesurfer=use_freesurfer,
            output_spaces=list(output_spaces or ["MNI152NLin2009cAsym:res-2", "T1w"]),
            skip_bids_validation=skip_bids_validation,
            clean_workdir=clean_workdir,
            extra_args=list(extra_args or []),
        )
        return FMRIPrepRunner(docker_executable=docker_executable).run(config)

    def run_structural(
        self,
        t1w_path: str | Path,
        subject_id: str,
        subjects_dir: str | Path,
        execute: bool = False,
        extra_args: Sequence[str] | None = None,
    ) -> FastSurferRunResult:
        """Plan or run FastSurfer structural segmentation."""

        return run_fastsurfer(
            settings=self.settings,
            t1w_path=Path(t1w_path),
            subject_id=subject_id,
            subjects_dir=Path(subjects_dir),
            extra_args=extra_args,
            execute=execute,
        )

    def run_fastsurfer(
        self,
        subject_id: str,
        session_id: str | None = None,
        *,
        bids_root: str | Path | None = None,
        output_root: str | Path | None = None,
        fs_license_file: str | Path | None = None,
        docker_image: str | None = None,
        docker_executable: str = "docker",
        threads: int | None = None,
        use_gpu: bool = True,
        device: str | None = None,
        view_agg_device: str | None = None,
        t1_relpath: str | Path | None = None,
        seg_only: bool = False,
        py: str = "python3.11",
        extra_args: Sequence[str] | None = None,
    ) -> Path:
        """Execute FastSurfer for one subject/session and return the subject output path."""

        resolved_bids_root = Path(bids_root) if bids_root is not None else self.settings.bids_root
        resolved_output_root = (
            Path(output_root)
            if output_root is not None
            else getattr(
                self.settings,
                "fastsurfer_output_root",
                self.settings.output_root / "fastsurfer",
            )
        )
        resolved_license = (
            Path(fs_license_file)
            if fs_license_file is not None
            else getattr(self.settings, "freesurfer_license_file", None) or self.settings.fs_license_file
        )
        if resolved_license is None:
            raise FastSurferExecutionError(
                "FastSurfer requires a FreeSurfer license file. Provide fs_license_file "
                "or set DEEPSYNAPS_NEURO_ENGINE_FREESURFER_LICENSE_FILE."
            )
        resolved_device = device
        if resolved_device is None and getattr(self.settings, "device", "").lower() not in {"", "cpu"}:
            resolved_device = self.settings.device

        config = FastSurferRunConfig(
            bids_root=resolved_bids_root,
            output_root=resolved_output_root,
            subject_id=subject_id,
            session_id=session_id,
            fs_license_file=resolved_license,
            docker_image=docker_image
            or getattr(self.settings, "fastsurfer_docker_image", "deepmi/fastsurfer:latest"),
            docker_executable=docker_executable,
            threads=threads or self.settings.fmri_threads,
            use_gpu=use_gpu,
            device=resolved_device,
            view_agg_device=view_agg_device,
            t1_relpath=Path(t1_relpath) if t1_relpath is not None else None,
            seg_only=seg_only,
            py=py,
            extra_args=list(extra_args or []),
        )
        return FastSurferRunner(docker_executable=docker_executable).run(config)

    def extract_structural_biomarkers(
        self,
        subject_output_dir: Path,
        subject_id: str,
        session_id: str | None = None,
    ) -> StructuralBiomarkerBundle:
        """Extract structural biomarker records from one FastSurfer output directory."""

        return FastSurferBiomarkerExtractor().extract(
            subject_output_dir=Path(subject_output_dir),
            subject_id=subject_id,
            session_id=session_id,
        )

    def normalize_structural_biomarkers(
        self,
        bundle: StructuralBiomarkerBundle,
    ) -> list[NormalizedStructuralRecord]:
        """Compute normalized and derived structural records from a biomarker bundle."""

        return StructuralNormalizer().normalize(bundle)

    def analyze_functional_connectivity(
        self,
        timeseries: Sequence[Sequence[float]] | None = None,
        bold_path: str | Path | None = None,
        labels: Sequence[str] | None = None,
    ) -> ConnectivityResult:
        """Run the functional connectivity analysis stage."""

        return compute_functional_connectivity(timeseries=timeseries, bold_path=bold_path, labels=labels)

    def extract_functional_connectivity(
        self,
        derivatives_root: Path,
        subject_id: str,
        session_id: str | None = None,
        aggregate: bool = True,
        *,
        atlas_img: Path,
        atlas_labels: Sequence[str],
        atlas_name: str,
        space: str = "MNI152NLin2009cAsym",
        connectivity_kind: str = "correlation",
        confounds_strategy: str = "simple",
        low_pass: float | None = 0.1,
        high_pass: float | None = 0.01,
        t_r: float | None = None,
    ) -> ConnectivityBundle:
        """Extract fMRIPrep-based functional connectivity for one subject/session."""

        extractor = FunctionalConnectivityExtractor(
            atlas_img=Path(atlas_img),
            atlas_labels=list(atlas_labels),
            atlas_name=atlas_name,
            space=space,
            connectivity_kind=connectivity_kind,
            confounds_strategy=confounds_strategy,
            low_pass=low_pass,
            high_pass=high_pass,
            t_r=t_r,
        )
        return extractor.extract_subject_connectivity(
            derivatives_root=Path(derivatives_root),
            subject_id=subject_id,
            session_id=session_id,
            aggregate=aggregate,
        )

    def prepare_segmentation_model(
        self,
        model_path: str | Path | None = None,
        model_name: str | None = None,
    ) -> SegmentationModelBundle:
        """Load or plan the segmentation model bundle."""

        return load_segmentation_model(settings=self.settings, model_path=model_path, model_name=model_name)

    def run_segmentation(
        self,
        volume_path: str | Path,
        output_dir: str | Path | None = None,
        bundle: SegmentationModelBundle | None = None,
    ) -> SegmentationInferenceResult:
        """Run the segmentation stage using the configured model bundle."""

        active_bundle = bundle or self.prepare_segmentation_model()
        return run_segmentation(
            settings=self.settings,
            volume_path=volume_path,
            output_dir=output_dir,
            bundle=active_bundle,
        )

    def orchestrate(
        self,
        bids_root: str | Path | None = None,
        dicom_input_dir: str | Path | None = None,
        conversion_output_dir: str | Path | None = None,
        preprocessing_output_root: str | Path | None = None,
        preprocessing_work_root: str | Path | None = None,
        participant_label: str | None = None,
        structural_t1w_path: str | Path | None = None,
        structural_subject_id: str | None = None,
        structural_subjects_dir: str | Path | None = None,
        connectivity_timeseries: Sequence[Sequence[float]] | None = None,
        connectivity_bold_path: str | Path | None = None,
        segmentation_volume_path: str | Path | None = None,
        segmentation_output_dir: str | Path | None = None,
        execute_external: bool = False,
    ) -> NeuroEngineRunResult:
        """Orchestrate the major neuroimaging stages behind a single façade."""

        result = NeuroEngineRunResult()
        if bids_root is not None:
            result.validation = self.validate_bids_dataset(bids_root)
        if dicom_input_dir is not None:
            output_dir = Path(conversion_output_dir) if conversion_output_dir else self.settings.output_root / "converted"
            result.conversion = self.convert_dicom_series(dicom_input_dir, output_dir)
        if bids_root is not None and preprocessing_output_root is not None and preprocessing_work_root is not None:
            result.preprocessing = self.run_preprocessing(
                bids_root=bids_root,
                output_root=preprocessing_output_root,
                work_root=preprocessing_work_root,
                participant_label=participant_label,
                execute=execute_external,
            )
        if structural_t1w_path is not None and structural_subject_id is not None and structural_subjects_dir is not None:
            result.structural = self.run_structural(
                t1w_path=structural_t1w_path,
                subject_id=structural_subject_id,
                subjects_dir=structural_subjects_dir,
                execute=execute_external,
            )
        if connectivity_timeseries is not None or connectivity_bold_path is not None:
            result.connectivity = self.analyze_functional_connectivity(
                timeseries=connectivity_timeseries,
                bold_path=connectivity_bold_path,
            )
        if segmentation_volume_path is not None:
            result.segmentation_bundle = self.prepare_segmentation_model()
            result.segmentation = self.run_segmentation(
                volume_path=segmentation_volume_path,
                output_dir=segmentation_output_dir,
                bundle=result.segmentation_bundle,
            )
        return result


__all__ = [
    "BIDSValidationResult",
    "ConnectivityBundle",
    "ConnectivityExtractionError",
    "ConnectivityResult",
    "ConnectivityRunResult",
    "DICOMConversionResult",
    "FMRIPrepExecutionError",
    "FMRIPrepRunConfig",
    "FMRIPrepRunResult",
    "FMRIPrepRunner",
    "FastSurferBiomarkerExtractor",
    "FastSurferExecutionError",
    "FastSurferRunConfig",
    "FastSurferRunResult",
    "FastSurferRunner",
    "FunctionalConnectivityExtractor",
    "NeuroEngine",
    "NeuroEngineRunResult",
    "NeuroEngineSettings",
    "NormalizedStructuralRecord",
    "SegmentationInferenceResult",
    "SegmentationModelBundle",
    "StructuralBiomarkerBundle",
    "StructuralBiomarkerError",
    "StructuralNormalizationError",
    "StructuralNormalizer",
    "load_settings",
]
