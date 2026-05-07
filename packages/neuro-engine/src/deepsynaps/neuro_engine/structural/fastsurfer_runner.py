"""Docker-based FastSurfer orchestration for DeepSynaps Neuro Engine.

This wrapper assumes the input structural MRI is already organized inside a
BIDS-like dataset tree. It runs FastSurfer through Docker against a
T1-weighted scan and stores outputs in a DeepSynaps-controlled, stable output
directory per subject or subject/session. The module is intentionally limited
to infrastructure orchestration: it does not interpret structural biomarkers or
perform downstream clinical analysis.
"""

from __future__ import annotations

from dataclasses import dataclass, field
import logging
import os
from pathlib import Path
import shlex
import shutil
import subprocess
from typing import Sequence

from ..config import NeuroEngineSettings

logger = logging.getLogger(__name__)


class FastSurferExecutionError(RuntimeError):
    """Raised when a Docker-backed FastSurfer run cannot be completed safely."""


def _normalize_identifier(value: str, field_name: str, prefix: str) -> str:
    """Return a validated identifier without a BIDS prefix."""

    text = value.strip()
    if not text:
        raise ValueError(f"{field_name} must not be empty")
    if text.startswith(prefix):
        text = text[len(prefix) :]
    if not text or any(character.isspace() for character in text):
        raise ValueError(f"{field_name} must be a non-empty identifier without whitespace")
    return text


def _truncate_output(value: str, limit: int = 2000) -> str:
    """Return a bounded subprocess diagnostic string."""

    text = value.strip()
    if len(text) <= limit:
        return text
    return f"{text[:limit]}...<truncated>"


@dataclass(slots=True)
class FastSurferRunConfig:
    """Configuration for one subject/session FastSurfer execution."""

    bids_root: Path
    output_root: Path
    subject_id: str
    fs_license_file: Path
    session_id: str | None = None
    docker_image: str = "deepmi/fastsurfer:latest"
    docker_executable: str = "docker"
    threads: int = 8
    use_gpu: bool = True
    device: str | None = None
    view_agg_device: str | None = None
    t1_relpath: Path | None = None
    seg_only: bool = False
    py: str = "python3.11"
    extra_args: list[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        """Normalize path-like inputs and validate obvious bad inputs."""

        self.bids_root = Path(self.bids_root)
        self.output_root = Path(self.output_root)
        self.fs_license_file = Path(self.fs_license_file)
        if self.t1_relpath is not None:
            self.t1_relpath = Path(self.t1_relpath)

        self.subject_id = _normalize_identifier(self.subject_id, "subject_id", "sub-")
        if self.session_id is not None:
            self.session_id = _normalize_identifier(self.session_id, "session_id", "ses-")

        if not self.docker_image.strip():
            raise ValueError("docker_image must not be empty")
        if not self.docker_executable.strip():
            raise ValueError("docker_executable must not be empty")
        if self.threads <= 0:
            raise ValueError("threads must be a positive integer")
        if not self.py.strip():
            raise ValueError("py must not be empty")
        if self.device is not None and not self.device.strip():
            raise ValueError("device cannot be blank")
        if self.view_agg_device is not None and not self.view_agg_device.strip():
            raise ValueError("view_agg_device cannot be blank")
        if any(not str(arg).strip() for arg in self.extra_args):
            raise ValueError("extra_args cannot contain blank values")

    @property
    def fastsurfer_sid(self) -> str:
        """Return the stable subject identifier used for FastSurfer outputs."""

        if self.session_id is None:
            return f"sub-{self.subject_id}"
        return f"sub-{self.subject_id}_ses-{self.session_id}"


@dataclass(slots=True)
class FastSurferRunResult:
    """Structured result for a planned or executed FastSurfer run."""

    status: str
    command: list[str]
    command_line: str
    command_available: bool
    executed: bool
    t1w_path: Path
    subject_id: str
    subjects_dir: Path
    expected_outputs: list[Path]
    returncode: int | None = None
    stdout: str = ""
    stderr: str = ""
    notes: list[str] = field(default_factory=list)


class FastSurferRunner:
    """Construct and execute Docker commands for FastSurfer runs."""

    def __init__(self, docker_executable: str = "docker") -> None:
        """Store the default Docker executable name or absolute path."""

        self.docker_executable = docker_executable

    def find_t1_image(
        self,
        bids_root: Path,
        subject_id: str,
        session_id: str | None = None,
    ) -> Path:
        """Locate one deterministic T1-weighted image inside a BIDS tree."""

        resolved_bids_root = Path(bids_root).resolve()
        normalized_subject = _normalize_identifier(subject_id, "subject_id", "sub-")
        normalized_session = (
            _normalize_identifier(session_id, "session_id", "ses-")
            if session_id is not None
            else None
        )

        if normalized_session is not None:
            session_anat_dir = (
                resolved_bids_root
                / f"sub-{normalized_subject}"
                / f"ses-{normalized_session}"
                / "anat"
            )
            session_candidates = sorted(session_anat_dir.glob("*_T1w.nii.gz"))
            if len(session_candidates) == 1:
                return session_candidates[0]
            if len(session_candidates) > 1:
                raise FastSurferExecutionError(
                    "Multiple session-specific T1w images were found for "
                    f"sub-{normalized_subject} ses-{normalized_session}: "
                    f"{', '.join(str(path) for path in session_candidates)}"
                )

        subject_anat_dir = resolved_bids_root / f"sub-{normalized_subject}" / "anat"
        subject_candidates = sorted(subject_anat_dir.glob("*_T1w.nii.gz"))
        if len(subject_candidates) == 1:
            return subject_candidates[0]
        if len(subject_candidates) > 1:
            raise FastSurferExecutionError(
                "Multiple subject-level T1w images were found for "
                f"sub-{normalized_subject}: "
                f"{', '.join(str(path) for path in subject_candidates)}"
            )

        searched_locations = [
            str(resolved_bids_root / f"sub-{normalized_subject}" / "anat"),
        ]
        if normalized_session is not None:
            searched_locations.insert(
                0,
                str(
                    resolved_bids_root
                    / f"sub-{normalized_subject}"
                    / f"ses-{normalized_session}"
                    / "anat"
                ),
            )
        raise FastSurferExecutionError(
            "No T1w image was found for FastSurfer. Searched: "
            + ", ".join(searched_locations)
        )

    def build_command(self, config: FastSurferRunConfig) -> list[str]:
        """Build a Docker command for one FastSurfer subject/session run."""

        if not config.fs_license_file.exists():
            raise FastSurferExecutionError(
                f"FreeSurfer license file does not exist: {config.fs_license_file}"
            )

        bids_root = config.bids_root.resolve()
        output_root = config.output_root.resolve()
        license_dir = config.fs_license_file.resolve().parent
        t1_path = self._resolve_t1_path(config)
        try:
            relative_t1 = t1_path.relative_to(bids_root)
        except ValueError as exc:
            raise FastSurferExecutionError(
                f"T1w image must be located under the mounted bids_root: {t1_path}"
            ) from exc

        docker_executable = config.docker_executable or self.docker_executable
        command = [docker_executable, "run", "--rm"]
        if config.use_gpu:
            command.extend(["--gpus", "all"])
        command.extend(
            [
                "-v",
                f"{bids_root}:/data:ro",
                "-v",
                f"{output_root}:/output",
                "-v",
                f"{license_dir}:/fs_license:ro",
            ]
        )

        uid = getattr(os, "getuid", None)
        gid = getattr(os, "getgid", None)
        if callable(uid) and callable(gid):
            command.extend(["--user", f"{uid()}:{gid()}"])

        command.extend(
            [
                config.docker_image,
                "--fs_license",
                f"/fs_license/{config.fs_license_file.name}",
                "--t1",
                f"/data/{relative_t1.as_posix()}",
                "--sid",
                config.fastsurfer_sid,
                "--sd",
                "/output",
                "--threads",
                str(config.threads),
                "--py",
                config.py,
            ]
        )
        if config.device is not None:
            command.extend(["--device", config.device])
        if config.view_agg_device is not None:
            command.extend(["--viewagg_device", config.view_agg_device])
        if config.seg_only:
            command.append("--seg_only")
        command.extend(config.extra_args)
        return command

    def run(self, config: FastSurferRunConfig) -> Path:
        """Execute FastSurfer through Docker and return the subject output path."""

        docker_executable = config.docker_executable or self.docker_executable
        if shutil.which(docker_executable) is None:
            raise FastSurferExecutionError(
                f"Docker executable was not found on PATH: {docker_executable}"
            )
        if not config.bids_root.exists():
            raise FastSurferExecutionError(f"BIDS root does not exist: {config.bids_root}")
        if not config.fs_license_file.exists():
            raise FastSurferExecutionError(
                f"FreeSurfer license file does not exist: {config.fs_license_file}"
            )

        t1_path = self._resolve_t1_path(config)
        logger.info(
            "Resolved FastSurfer T1w input for %s: %s",
            config.fastsurfer_sid,
            t1_path,
        )
        config.output_root.mkdir(parents=True, exist_ok=True)

        command = self.build_command(config)
        logger.info("Running FastSurfer command: %s", shlex.join(command))
        completed = subprocess.run(
            command,
            check=False,
            capture_output=True,
            text=True,
        )
        if completed.returncode != 0:
            stdout = _truncate_output(completed.stdout)
            stderr = _truncate_output(completed.stderr)
            raise FastSurferExecutionError(
                "FastSurfer failed with exit code "
                f"{completed.returncode}. stdout={stdout!r} stderr={stderr!r}"
            )

        subject_output_dir = self.get_subject_output_dir(config)
        if not subject_output_dir.exists() or not any(subject_output_dir.iterdir()):
            raise FastSurferExecutionError(
                "FastSurfer completed but no plausible subject output directory was found at "
                f"{subject_output_dir}."
            )
        return subject_output_dir

    def get_subject_output_dir(self, config: FastSurferRunConfig) -> Path:
        """Return the stable output directory for one FastSurfer run."""

        return config.output_root / config.fastsurfer_sid

    def _resolve_t1_path(self, config: FastSurferRunConfig) -> Path:
        """Resolve the host-path T1w input for the configured run."""

        if config.t1_relpath is None:
            return self.find_t1_image(
                bids_root=config.bids_root,
                subject_id=config.subject_id,
                session_id=config.session_id,
            ).resolve()

        if config.t1_relpath.is_absolute():
            resolved = config.t1_relpath.resolve()
        else:
            resolved = (config.bids_root / config.t1_relpath).resolve()
        if not resolved.exists():
            raise FastSurferExecutionError(f"T1w image does not exist: {resolved}")
        return resolved


def _config_from_settings(
    settings: NeuroEngineSettings,
    t1w_path: Path,
    subject_id: str,
    subjects_dir: Path,
    extra_args: Sequence[str] | None = None,
) -> FastSurferRunConfig:
    """Build a FastSurfer execution config from the Neuro Engine settings."""

    license_path = (
        settings.freesurfer_license_file
        if getattr(settings, "freesurfer_license_file", None) is not None
        else settings.fs_license_file
    )
    if license_path is None:
        raise FastSurferExecutionError(
            "FastSurfer requires a FreeSurfer license file. Set "
            "DEEPSYNAPS_NEURO_ENGINE_FREESURFER_LICENSE_FILE or "
            "DEEPSYNAPS_NEURO_ENGINE_FS_LICENSE_FILE."
        )

    return FastSurferRunConfig(
        bids_root=t1w_path.parent,
        output_root=subjects_dir,
        subject_id=subject_id,
        fs_license_file=license_path,
        docker_image=getattr(settings, "fastsurfer_docker_image", "deepmi/fastsurfer:latest"),
        docker_executable="docker",
        threads=settings.fmri_threads,
        use_gpu=settings.device.lower() != "cpu",
        device=settings.device,
        t1_relpath=Path(t1w_path.name),
        seg_only=False,
        py="python3.11",
        extra_args=list(extra_args or []),
    )


def build_fastsurfer_command(
    settings: NeuroEngineSettings,
    t1w_path: Path,
    subject_id: str,
    subjects_dir: Path,
    extra_args: Sequence[str] | None = None,
) -> list[str]:
    """Build a deterministic Docker-backed FastSurfer command for compatibility."""

    config = _config_from_settings(
        settings=settings,
        t1w_path=Path(t1w_path),
        subject_id=subject_id,
        subjects_dir=Path(subjects_dir),
        extra_args=extra_args,
    )
    return FastSurferRunner(docker_executable=config.docker_executable).build_command(config)


def run_fastsurfer(
    settings: NeuroEngineSettings,
    t1w_path: Path,
    subject_id: str,
    subjects_dir: Path,
    extra_args: Sequence[str] | None = None,
    execute: bool = False,
) -> FastSurferRunResult:
    """Plan or execute a Docker-backed FastSurfer run for compatibility."""

    notes = [
        "FastSurfer expects a T1-weighted structural MRI input.",
        "Execution uses Docker and writes outputs into a stable subject directory.",
    ]
    try:
        config = _config_from_settings(
            settings=settings,
            t1w_path=Path(t1w_path),
            subject_id=subject_id,
            subjects_dir=Path(subjects_dir),
            extra_args=extra_args,
        )
        runner = FastSurferRunner(docker_executable=config.docker_executable)
        command = runner.build_command(config)
        command_available = shutil.which(config.docker_executable) is not None
    except FastSurferExecutionError as exc:
        return FastSurferRunResult(
            status="failed",
            command=[],
            command_line="",
            command_available=False,
            executed=False,
            t1w_path=Path(t1w_path),
            subject_id=subject_id,
            subjects_dir=Path(subjects_dir),
            expected_outputs=[Path(subjects_dir) / f"sub-{_normalize_identifier(subject_id, 'subject_id', 'sub-')}"],
            stderr=str(exc),
            notes=notes,
        )

    expected_root = runner.get_subject_output_dir(config)
    expected_outputs = [
        expected_root,
        expected_root / "mri",
        expected_root / "stats",
        expected_root / "scripts",
    ]
    if not execute:
        return FastSurferRunResult(
            status="planned",
            command=command,
            command_line=shlex.join(command),
            command_available=command_available,
            executed=False,
            t1w_path=Path(t1w_path),
            subject_id=config.fastsurfer_sid,
            subjects_dir=Path(subjects_dir),
            expected_outputs=expected_outputs,
            notes=notes,
        )

    try:
        output_dir = runner.run(config)
    except FastSurferExecutionError as exc:
        return FastSurferRunResult(
            status="failed",
            command=command,
            command_line=shlex.join(command),
            command_available=command_available,
            executed=True,
            t1w_path=Path(t1w_path),
            subject_id=config.fastsurfer_sid,
            subjects_dir=Path(subjects_dir),
            expected_outputs=expected_outputs,
            returncode=1,
            stderr=str(exc),
            notes=notes,
        )

    notes.append(f"FastSurfer outputs verified under {output_dir}.")
    return FastSurferRunResult(
        status="completed",
        command=command,
        command_line=shlex.join(command),
        command_available=command_available,
        executed=True,
        t1w_path=Path(t1w_path),
        subject_id=config.fastsurfer_sid,
        subjects_dir=Path(subjects_dir),
        expected_outputs=expected_outputs,
        returncode=0,
        stdout=str(output_dir),
        notes=notes,
    )


__all__ = [
    "FastSurferExecutionError",
    "FastSurferRunConfig",
    "FastSurferRunResult",
    "FastSurferRunner",
    "build_fastsurfer_command",
    "run_fastsurfer",
]
