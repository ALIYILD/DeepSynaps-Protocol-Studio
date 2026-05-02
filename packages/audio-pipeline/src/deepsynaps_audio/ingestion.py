"""Audio ingestion: file → normalised :class:`Recording`, session bundling, BIDS-Audio export.

Heavy I/O imports (``soundfile``, ``librosa``, ``ffmpeg``) are guarded
inside the implementation bodies — see ``CLAUDE.md`` for the slim-import
rule shared with ``deepsynaps_qeeg`` and ``deepsynaps_mri``.
"""

from __future__ import annotations

from pathlib import Path
from typing import Iterable, Optional
from uuid import UUID

from .schemas import Recording, Session


def load_recording(
    path: str | Path,
    task_protocol: str,
    *,
    target_sr: Optional[int] = None,
    recording_id: Optional[UUID] = None,
) -> Recording:
    """Load any supported audio file and normalise it to the target sample rate.

    TODO: implement in PR #1 of the rollout (task 1 in
    ``AUDIO_ANALYZER_STACK.md §9``). Use ``soundfile`` for WAV/FLAC/OGG,
    ``librosa.load`` (which delegates to ``audioread``/``ffmpeg``) for
    MP3/M4A/WebM. Resample to ``target_sr`` (defaults to the value
    declared in :data:`constants.TASK_PROTOCOLS` for this task), force
    mono float32, hash the original bytes (sha256) into ``file_hash``,
    populate ``recorder_fingerprint`` from any embedded metadata.
    """

    raise NotImplementedError(
        "ingestion.load_recording: implement in PR #1 (see AUDIO_ANALYZER_STACK.md §9)."
    )


def import_session(
    files: Iterable[tuple[str, str | Path]],
    *,
    session_id: UUID,
    patient_id: UUID,
    tenant_id: UUID,
) -> Session:
    """Bundle multiple per-task recordings into a clinical :class:`Session`.

    ``files`` is an iterable of ``(task_protocol, path)`` pairs.

    TODO: implement in PR #1 — call :func:`load_recording` for each file
    and assemble the session map. Reject duplicate task protocols.
    """

    raise NotImplementedError(
        "ingestion.import_session: implement in PR #1 (see AUDIO_ANALYZER_STACK.md §9)."
    )


def to_bids(session: Session, root: str | Path) -> Path:
    """Write a BIDS-Audio derivative tree for the session.

    TODO: implement in PR #4 — follow the BIDS-Audio proposal layout,
    write WAVs + sidecar JSON + ``participants.tsv`` + ``scans.tsv``.
    """

    raise NotImplementedError(
        "ingestion.to_bids: implement in PR #4 (see AUDIO_ANALYZER_STACK.md §9)."
    )
