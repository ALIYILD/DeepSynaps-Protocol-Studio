"""Docker-based fMRIPrep execution helpers for DeepSynaps Neuro Engine.

This wrapper assumes the input dataset is already organized as a valid BIDS
tree. It runs fMRIPrep through Docker and expects outputs to follow a
BIDS-derivatives-style layout under the configured output directory. The
preprocessing stage is infrastructure-oriented only: it does not perform
confound regression, first-level modeling, or any downstream statistical
analysis.
"""

from __future__ import annotations

from dataclasses import dataclass, field
import json
import logging
from pathlib import Path
import shlex
import shutil
import subprocess
from typing import Any, Sequence

from ..config import NeuroEngineSettings

logger = logging.getLogger(__name__)


class FMRIPrepExecutionError(RuntimeError):
    """Raised when a Docker-backed fMRIPrep run cannot be completed safely."""


@dataclass(slots=True)
class FMRIPrepRunConfig:
    """Configuration for one subject/session fMRIPrep execution."""

    bids_root: Path
    output_root: Path
    work_root: Path
    subject_id: str
    session_id: str | None = None
    fs_license_file: Path | None = None
    image: str = "nipreps/fmriprep:latest"
    threads: int = 8
    mem_mb: int = 32000
    use_freesurfer: bool = True
    output_spaces: list[str] = field(
        default_factory=lambda: ["MNI152NLin2009cAsym:res-2", "T1w"]
    )
    skip_bids_validation: bool = False
    clean_workdir: bool = False
    extra_args: list[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        """Normalize path-like inputs and validate basic invariants."""

        self.bids_root = Path(self.bids_root)
        self.output_root = Path(self.output_root)
        self.work_root = Path(self.work_root)
        if self.fs_license_file is not None:
            self.fs_license_file = Path(self.fs_license_file)

        self.subject_id = self._normalize_identifier(self.subject_id, "subject_id", "sub-")
        if self.session_id is not None:
            self.session_id = self._normalize_identifier(self.session_id, "session_id", "ses-")

        if not self.image.strip():
            raise ValueError("image must not be empty")
        if self.threads <= 0:
            raise ValueError("threads must be a positive integer")
        if self.mem_mb <= 0:
            raise ValueError("mem_mb must be a positive integer")
        if not self.output_spaces:
            raise ValueError("output_spaces must contain at least one entry")
        if any(not str(space).strip() for space in self.output_spaces):
            raise ValueError("output_spaces cannot contain blank values")
        if any(not str(arg).strip() for arg in self.extra_args):
            raise ValueError("extra_args cannot contain blank values")

    @property
    def subject_label(self) -> str:
        """Return the BIDS participant label without the ``sub-`` prefix."""

        return self.subject_id

    @property
    def session_label(self) -> str | None:
        """Return the BIDS session label without the ``ses-`` prefix."""

        return self.session_id

    @staticmethod
    def _normalize_identifier(value: str, field_name: str, prefix: str) -> str:
        """Return an identifier without a BIDS prefix while validating content."""

        text = value.strip()
        if not text:
            raise ValueError(f"{field_name} must not be empty")
        if text.startswith(prefix):
            text = text[len(prefix) :]
        if not text or any(character.isspace() for character in text):
            raise ValueError(f"{field_name} must be a non-empty identifier without whitespace")
        return text


@dataclass(slots=True)
class FMRIPrepRunResult:
    """Structured result for a planned or executed fMRIPrep run."""

    status: str
    command: list[str]
    command_line: str
    command_available: bool
    executed: bool
    input_bids_root: Path
    output_root: Path
    work_root: Path
    participant_label: str | None
    expected_outputs: list[Path]
    returncode: int | None = None
    stdout: str = ""
    stderr: str = ""
    notes: list[str] = field(default_factory=list)


def _derive_omp_threads(total_threads: int) -> int:
    """Choose a conservative OpenMP thread count from the total thread budget."""

    return max(1, min(total_threads, 8, max(1, total_threads // 2)))


def _truncate_output(value: str, limit: int = 2000) -> str:
    """Return a bounded diagnostic string suitable for exception messages."""

    text = value.strip()
    if len(text) <= limit:
        return text
    return f"{text[:limit]}...<truncated>"


class FMRIPrepRunner:
    """Construct and execute Docker commands for subject-level fMRIPrep runs."""

    def __init__(self, docker_executable: str = "docker") -> None:
        """Store the Docker executable name or absolute path."""

        self.docker_executable = docker_executable

    def build_command(self, config: FMRIPrepRunConfig) -> list[str]:
        """Build a Docker command for one subject/session fMRIPrep run."""

        if config.use_freesurfer and config.fs_license_file is None:
            raise FMRIPrepExecutionError(
                "FreeSurfer is enabled but no fs_license_file was provided."
            )

        bids_root = config.bids_root.resolve()
        output_root = config.output_root.resolve()
        work_root = config.work_root.resolve()
        command = [
            self.docker_executable,
            "run",
            "--rm",
            "-v",
            f"{bids_root}:/data:ro",
            "-v",
            f"{output_root}:/out",
            "-v",
            f"{work_root}:/work",
        ]
        if config.use_freesurfer and config.fs_license_file is not None:
            command.extend(
                [
                    "-v",
                    f"{config.fs_license_file.resolve()}:/opt/freesurfer/license.txt:ro",
                ]
            )

        command.extend(
            [
                config.image,
                "/data",
                "/out",
                "participant",
                "--participant-label",
                config.subject_label,
            ]
        )
        if config.session_label is not None:
            command.extend(["--session-label", config.session_label])
        command.extend(
            [
                "--nthreads",
                str(config.threads),
                "--omp-nthreads",
                str(_derive_omp_threads(config.threads)),
                "--mem_mb",
                str(config.mem_mb),
                "--output-layout",
                "bids",
                "--output-spaces",
                *config.output_spaces,
                "-w",
                "/work",
                "--stop-on-first-crash",
                "--notrack",
            ]
        )
        if config.skip_bids_validation:
            command.append("--skip-bids-validation")
        if not config.use_freesurfer:
            command.append("--fs-no-reconall")
        command.extend(config.extra_args)
        return command

    def get_derivatives_dir(self, config: FMRIPrepRunConfig) -> Path:
        """Return the expected derivatives root for a BIDS-layout fMRIPrep run."""

        subject_dir = config.output_root / f"sub-{config.subject_label}"
        if subject_dir.exists():
            if config.session_label is None:
                return config.output_root
            session_dir = subject_dir / f"ses-{config.session_label}"
            if session_dir.exists() or any(subject_dir.rglob(f"*ses-{config.session_label}*")):
                return config.output_root

        for candidate in config.output_root.rglob(f"sub-{config.subject_label}*"):
            if config.session_label is not None and f"ses-{config.session_label}" not in str(candidate):
                continue
            return config.output_root

        raise FMRIPrepExecutionError(
            "fMRIPrep completed but no plausible derivative outputs were found for "
            f"sub-{config.subject_label} under {config.output_root}."
        )

    def run(self, config: FMRIPrepRunConfig) -> Path:
        """Execute fMRIPrep through Docker and return the derivatives root."""

        if shutil.which(self.docker_executable) is None:
            raise FMRIPrepExecutionError(
                f"Docker executable was not found on PATH: {self.docker_executable}"
            )
        if not config.bids_root.exists():
            raise FMRIPrepExecutionError(
                f"BIDS root does not exist: {config.bids_root}"
            )

        config.output_root.mkdir(parents=True, exist_ok=True)
        if config.clean_workdir and config.work_root.exists():
            logger.info("Cleaning existing fMRIPrep work directory %s", config.work_root)
            shutil.rmtree(config.work_root)
        config.work_root.mkdir(parents=True, exist_ok=True)

        command = self.build_command(config)
        logger.info("Running fMRIPrep command: %s", shlex.join(command))
        completed = subprocess.run(
            command,
            check=False,
            capture_output=True,
            text=True,
        )
        if completed.returncode != 0:
            stdout = _truncate_output(completed.stdout)
            stderr = _truncate_output(completed.stderr)
            raise FMRIPrepExecutionError(
                "fMRIPrep failed with exit code "
                f"{completed.returncode}. stdout={stdout!r} stderr={stderr!r}"
            )
        return self.get_derivatives_dir(config)


def _config_from_settings(
    settings: NeuroEngineSettings,
    bids_root: Path,
    output_root: Path,
    work_root: Path,
    participant_label: str | None = None,
    session_id: str | None = None,
    extra_args: Sequence[str] | None = None,
) -> FMRIPrepRunConfig:
    """Build an execution config from the Neuro Engine settings model."""

    license_path = (
        settings.freesurfer_license_file
        if getattr(settings, "freesurfer_license_file", None) is not None
        else settings.fs_license_file
    )
    use_freesurfer = license_path is not None
    return FMRIPrepRunConfig(
        bids_root=bids_root,
        output_root=output_root,
        work_root=work_root,
        subject_id=participant_label or settings.default_participant_label,
        session_id=session_id,
        fs_license_file=license_path,
        image=getattr(settings, "fmriprep_docker_image", "nipreps/fmriprep:latest"),
        threads=settings.fmri_threads,
        mem_mb=32000,
        use_freesurfer=use_freesurfer,
        skip_bids_validation=False,
        extra_args=list(extra_args or []),
    )


def build_fmriprep_command(
    settings: NeuroEngineSettings,
    bids_root: Path,
    output_root: Path,
    work_root: Path,
    participant_label: str | None = None,
    extra_args: Sequence[str] | None = None,
    session_id: str | None = None,
) -> list[str]:
    """Build a deterministic Docker-backed fMRIPrep command for compatibility."""

    config = _config_from_settings(
        settings=settings,
        bids_root=bids_root,
        output_root=output_root,
        work_root=work_root,
        participant_label=participant_label,
        session_id=session_id,
        extra_args=extra_args,
    )
    return FMRIPrepRunner().build_command(config)


def run_fmriprep(
    settings: NeuroEngineSettings,
    bids_root: Path,
    output_root: Path,
    work_root: Path,
    participant_label: str | None = None,
    extra_args: Sequence[str] | None = None,
    execute: bool = False,
    session_id: str | None = None,
) -> FMRIPrepRunResult:
    """Plan or execute a Docker-backed fMRIPrep run for compatibility."""

    config = _config_from_settings(
        settings=settings,
        bids_root=bids_root,
        output_root=output_root,
        work_root=work_root,
        participant_label=participant_label,
        session_id=session_id,
        extra_args=extra_args,
    )
    runner = FMRIPrepRunner()
    command = runner.build_command(config)
    command_available = shutil.which(runner.docker_executable) is not None
    expected_outputs = [
        output_root / f"sub-{config.subject_label}",
        output_root / "logs",
        output_root / "sourcedata" / "freesurfer",
    ]
    notes = [
        "fMRIPrep expects a BIDS-organized dataset as input.",
        "Execution uses Docker and writes BIDS-derivatives style outputs.",
    ]
    if not execute:
        return FMRIPrepRunResult(
            status="planned",
            command=command,
            command_line=shlex.join(command),
            command_available=command_available,
            executed=False,
            input_bids_root=bids_root,
            output_root=output_root,
            work_root=work_root,
            participant_label=config.subject_label,
            expected_outputs=expected_outputs,
            notes=notes,
        )

    try:
        derivatives_dir = runner.run(config)
    except FMRIPrepExecutionError as exc:
        return FMRIPrepRunResult(
            status="failed",
            command=command,
            command_line=shlex.join(command),
            command_available=command_available,
            executed=True,
            input_bids_root=bids_root,
            output_root=output_root,
            work_root=work_root,
            participant_label=config.subject_label,
            expected_outputs=expected_outputs,
            returncode=1,
            stderr=str(exc),
            notes=notes,
        )

    notes.append(f"Derivatives verified under {derivatives_dir}.")
    return FMRIPrepRunResult(
        status="completed",
        command=command,
        command_line=shlex.join(command),
        command_available=command_available,
        executed=True,
        input_bids_root=bids_root,
        output_root=output_root,
        work_root=work_root,
        participant_label=config.subject_label,
        expected_outputs=expected_outputs,
        returncode=0,
        stdout=str(derivatives_dir),
        notes=notes,
    )
