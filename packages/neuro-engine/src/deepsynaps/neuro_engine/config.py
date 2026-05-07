"""Runtime configuration for the DeepSynaps Neuro Engine."""

from __future__ import annotations

from dataclasses import asdict, dataclass
import os
from pathlib import Path
from typing import Any, Dict

try:
    from pydantic import Field
except ImportError:  # pragma: no cover - exercised when pydantic is unavailable.
    def Field(  # type: ignore[misc]
        default: Any = None,
        default_factory: Any | None = None,
        description: str | None = None,
    ) -> Any:
        """Return a default value when Pydantic is unavailable."""

        if default_factory is not None:
            return default_factory()
        return default


try:
    from pydantic_settings import BaseSettings, SettingsConfigDict
except ImportError:  # pragma: no cover - exercised when pydantic-settings is unavailable.
    try:
        from pydantic import BaseSettings  # type: ignore[attr-defined]

        SettingsConfigDict = None  # type: ignore[assignment]
    except ImportError:  # pragma: no cover - exercised in the local sandbox.
        BaseSettings = None  # type: ignore[assignment]
        SettingsConfigDict = None  # type: ignore[assignment]


def _default_root() -> Path:
    """Return the default writable data root for the neuro engine."""

    return Path("/tmp/deepsynaps/neuro_engine")


def _coerce_path(value: str | Path) -> Path:
    """Convert arbitrary path-like input into a resolved :class:`Path`."""

    return Path(value).expanduser()


BIDS_ROOT = _coerce_path(os.getenv("DEEPSYNAPS_NEURO_ENGINE_BIDS_ROOT", _default_root() / "bids"))
FASTSURFER_OUTPUT_ROOT = _coerce_path(
    os.getenv(
        "DEEPSYNAPS_NEURO_ENGINE_FASTSURFER_OUTPUT_ROOT",
        _default_root() / "outputs" / "fastsurfer",
    )
)
FASTSURFER_DOCKER_IMAGE = os.getenv(
    "DEEPSYNAPS_NEURO_ENGINE_FASTSURFER_DOCKER_IMAGE",
    "deepmi/fastsurfer:latest",
)


if BaseSettings is not None:

    class NeuroEngineSettings(BaseSettings):
        """Environment-driven runtime settings for the neuro engine."""

        if SettingsConfigDict is not None:
            model_config = SettingsConfigDict(
                env_prefix="DEEPSYNAPS_NEURO_ENGINE_",
                case_sensitive=False,
                extra="ignore",
            )
        else:

            class Config:
                """Compatibility configuration for Pydantic v1."""

                env_prefix = "DEEPSYNAPS_NEURO_ENGINE_"
                case_sensitive = False

        data_root: Path = Field(default_factory=_default_root)
        bids_root: Path = Field(default_factory=lambda: _default_root() / "bids")
        work_root: Path = Field(default_factory=lambda: _default_root() / "work")
        output_root: Path = Field(default_factory=lambda: _default_root() / "outputs")
        fmriprep_output_root: Path = Field(default_factory=lambda: _default_root() / "outputs" / "fmriprep")
        fmriprep_work_root: Path = Field(default_factory=lambda: _default_root() / "work" / "fmriprep")
        fastsurfer_output_root: Path = Field(
            default_factory=lambda: _default_root() / "outputs" / "fastsurfer"
        )
        model_root: Path = Field(default_factory=lambda: _default_root() / "models")
        temp_root: Path = Field(default_factory=lambda: _default_root() / "tmp")
        device: str = Field(default="cpu")
        default_atlas: str = Field(default="aal")
        default_tr_seconds: float = Field(default=2.0)
        fmri_threads: int = Field(default=4)
        default_participant_label: str = Field(default="01")
        fastsurfer_subject_prefix: str = Field(default="subject")
        fs_license_file: Path | None = Field(default=None)
        freesurfer_license_file: Path | None = Field(default=None)
        fmriprep_executable: str = Field(default="fmriprep")
        fmriprep_docker_image: str = Field(default="nipreps/fmriprep:latest")
        fastsurfer_executable: str = Field(default="run_fastsurfer.sh")
        fastsurfer_docker_image: str = Field(default="deepmi/fastsurfer:latest")
        segmentation_model_name: str = Field(default="dynunet")
        segmentation_weights: Path | None = Field(default=None)

        def ensure_directories(self) -> "NeuroEngineSettings":
            """Create known writable directories and return ``self``."""

            for path in (
                self.data_root,
                self.bids_root,
                self.work_root,
                self.output_root,
                self.fmriprep_output_root,
                self.fmriprep_work_root,
                self.fastsurfer_output_root,
                self.model_root,
                self.temp_root,
            ):
                _coerce_path(path).mkdir(parents=True, exist_ok=True)
            return self

        def model_dump(self) -> Dict[str, Any]:
            """Return a dict representation across Pydantic versions."""

            dump_method = getattr(super(), "model_dump", None)
            if callable(dump_method):
                return dump_method()
            return dict(self.dict())  # type: ignore[attr-defined]


else:

    @dataclass(slots=True)
    class NeuroEngineSettings:
        """Fallback settings implementation when Pydantic is unavailable."""

        data_root: Path = _default_root()
        bids_root: Path = _default_root() / "bids"
        work_root: Path = _default_root() / "work"
        output_root: Path = _default_root() / "outputs"
        fmriprep_output_root: Path = _default_root() / "outputs" / "fmriprep"
        fmriprep_work_root: Path = _default_root() / "work" / "fmriprep"
        fastsurfer_output_root: Path = _default_root() / "outputs" / "fastsurfer"
        model_root: Path = _default_root() / "models"
        temp_root: Path = _default_root() / "tmp"
        device: str = "cpu"
        default_atlas: str = "aal"
        default_tr_seconds: float = 2.0
        fmri_threads: int = 4
        default_participant_label: str = "01"
        fastsurfer_subject_prefix: str = "subject"
        fs_license_file: Path | None = None
        freesurfer_license_file: Path | None = None
        fmriprep_executable: str = "fmriprep"
        fmriprep_docker_image: str = "nipreps/fmriprep:latest"
        fastsurfer_executable: str = "run_fastsurfer.sh"
        fastsurfer_docker_image: str = "deepmi/fastsurfer:latest"
        segmentation_model_name: str = "dynunet"
        segmentation_weights: Path | None = None

        @classmethod
        def from_env(cls, **overrides: Any) -> "NeuroEngineSettings":
            """Construct settings from environment variables plus overrides."""

            mapping: Dict[str, tuple[str, Any]] = {
                "data_root": ("DEEPSYNAPS_NEURO_ENGINE_DATA_ROOT", _default_root()),
                "bids_root": ("DEEPSYNAPS_NEURO_ENGINE_BIDS_ROOT", _default_root() / "bids"),
                "work_root": ("DEEPSYNAPS_NEURO_ENGINE_WORK_ROOT", _default_root() / "work"),
                "output_root": ("DEEPSYNAPS_NEURO_ENGINE_OUTPUT_ROOT", _default_root() / "outputs"),
                "fmriprep_output_root": (
                    "DEEPSYNAPS_NEURO_ENGINE_FMRIPREP_OUTPUT_ROOT",
                    _default_root() / "outputs" / "fmriprep",
                ),
                "fmriprep_work_root": (
                    "DEEPSYNAPS_NEURO_ENGINE_FMRIPREP_WORK_ROOT",
                    _default_root() / "work" / "fmriprep",
                ),
                "fastsurfer_output_root": (
                    "DEEPSYNAPS_NEURO_ENGINE_FASTSURFER_OUTPUT_ROOT",
                    _default_root() / "outputs" / "fastsurfer",
                ),
                "model_root": ("DEEPSYNAPS_NEURO_ENGINE_MODEL_ROOT", _default_root() / "models"),
                "temp_root": ("DEEPSYNAPS_NEURO_ENGINE_TEMP_ROOT", _default_root() / "tmp"),
                "device": ("DEEPSYNAPS_NEURO_ENGINE_DEVICE", "cpu"),
                "default_atlas": ("DEEPSYNAPS_NEURO_ENGINE_DEFAULT_ATLAS", "aal"),
                "default_tr_seconds": ("DEEPSYNAPS_NEURO_ENGINE_DEFAULT_TR_SECONDS", 2.0),
                "fmri_threads": ("DEEPSYNAPS_NEURO_ENGINE_FMRI_THREADS", 4),
                "default_participant_label": (
                    "DEEPSYNAPS_NEURO_ENGINE_DEFAULT_PARTICIPANT_LABEL",
                    "01",
                ),
                "fastsurfer_subject_prefix": (
                    "DEEPSYNAPS_NEURO_ENGINE_FASTSURFER_SUBJECT_PREFIX",
                    "subject",
                ),
                "fs_license_file": ("DEEPSYNAPS_NEURO_ENGINE_FS_LICENSE_FILE", None),
                "freesurfer_license_file": (
                    "DEEPSYNAPS_NEURO_ENGINE_FREESURFER_LICENSE_FILE",
                    None,
                ),
                "fmriprep_executable": ("DEEPSYNAPS_NEURO_ENGINE_FMRIPREP_EXECUTABLE", "fmriprep"),
                "fmriprep_docker_image": (
                    "DEEPSYNAPS_NEURO_ENGINE_FMRIPREP_DOCKER_IMAGE",
                    "nipreps/fmriprep:latest",
                ),
                "fastsurfer_executable": (
                    "DEEPSYNAPS_NEURO_ENGINE_FASTSURFER_EXECUTABLE",
                    "run_fastsurfer.sh",
                ),
                "fastsurfer_docker_image": (
                    "DEEPSYNAPS_NEURO_ENGINE_FASTSURFER_DOCKER_IMAGE",
                    "deepmi/fastsurfer:latest",
                ),
                "segmentation_model_name": (
                    "DEEPSYNAPS_NEURO_ENGINE_SEGMENTATION_MODEL_NAME",
                    "dynunet",
                ),
                "segmentation_weights": (
                    "DEEPSYNAPS_NEURO_ENGINE_SEGMENTATION_WEIGHTS",
                    None,
                ),
            }
            values: Dict[str, Any] = {}
            for field_name, (env_name, default) in mapping.items():
                raw = os.getenv(env_name)
                if raw is None:
                    values[field_name] = default
                    continue
                if field_name.endswith("_root") or field_name.endswith("_file") or field_name == "segmentation_weights":
                    values[field_name] = _coerce_path(raw)
                elif field_name == "default_tr_seconds":
                    values[field_name] = float(raw)
                elif field_name == "fmri_threads":
                    values[field_name] = int(raw)
                else:
                    values[field_name] = raw
            values.update(overrides)
            for field_name in (
                "data_root",
                "bids_root",
                "work_root",
                "output_root",
                "fmriprep_output_root",
                "fmriprep_work_root",
                "fastsurfer_output_root",
                "model_root",
                "temp_root",
                "fs_license_file",
                "freesurfer_license_file",
                "segmentation_weights",
            ):
                value = values.get(field_name)
                if value is not None:
                    values[field_name] = _coerce_path(value)
            return cls(**values)

        def ensure_directories(self) -> "NeuroEngineSettings":
            """Create known writable directories and return ``self``."""

            for path in (
                self.data_root,
                self.bids_root,
                self.work_root,
                self.output_root,
                self.fmriprep_output_root,
                self.fmriprep_work_root,
                self.fastsurfer_output_root,
                self.model_root,
                self.temp_root,
            ):
                _coerce_path(path).mkdir(parents=True, exist_ok=True)
            return self

        def model_dump(self) -> Dict[str, Any]:
            """Return a dict representation compatible with Pydantic models."""

            return asdict(self)


def load_settings(**overrides: Any) -> NeuroEngineSettings:
    """Load settings from the process environment and apply overrides."""

    if BaseSettings is not None:
        settings = NeuroEngineSettings(**overrides)
    else:
        settings = NeuroEngineSettings.from_env(**overrides)
    return settings.ensure_directories()
