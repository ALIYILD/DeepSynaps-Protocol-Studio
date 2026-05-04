"""Video ingest, deidentification, transcoding, and frame indexing.

The first stage of the pipeline. ``ingest`` is the only entry point that the
Celery worker calls; everything else is a private helper. Default-on face blur
is enforced here — the spec is explicit that no artefact may leave the secure
zone with raw faces visible unless an explicit per-clip ``research_consent``
flag is set.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal


@dataclass
class IngestRequest:
    source_uri: str
    analysis_id: str
    consent_id: str | None = None
    research_consent: bool = False
    voice_mute: bool = False
    target_fps: float | None = None  # if set, transcode to this fps
    target_resolution: tuple[int, int] | None = None


@dataclass
class IngestResult:
    analysis_id: str
    transcoded_uri: str
    frame_index_uri: str
    duration_s: float
    fps: float
    resolution: tuple[int, int]
    deid_applied: list[Literal["face_blur", "voice_mute"]] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def ingest(request: IngestRequest, *, output_root: Path) -> IngestResult:
    """Ingest a video clip and produce a deidentified working copy.

    Steps (order matters):

    1. Download / open the source via ``pyav`` or ``opencv``.
    2. Probe codec / fps / duration / resolution.
    3. Run face-blur unless ``research_consent`` is explicitly set.
    4. Optionally mute audio if ``voice_mute`` is set.
    5. Transcode to a normalized H.264 mp4 at the target fps/resolution.
    6. Write a ``frame_index.parquet`` with ``(frame_idx, pts_ms, keyframe)``.

    TODO(impl): Wire ffmpeg subprocess, mediapipe face detector, and parquet
        writer. The implementation must never write the raw source past step 1
        — the deidentified mp4 is the only artefact retained on S3.
    """

    raise NotImplementedError("io.ingest is not yet implemented — see docstring")


def probe(source_uri: str) -> dict[str, object]:
    """Return codec/fps/duration/resolution metadata for a clip.

    TODO(impl): use ffprobe or pyav.
    """

    raise NotImplementedError


def face_blur(input_path: Path, output_path: Path) -> None:
    """Apply per-frame face blur using mediapipe face detector + ffmpeg.

    TODO(impl): batch detect faces, build a sidecar polygon track, then run
    ffmpeg with the boxblur filter applied per timestamp range.
    """

    raise NotImplementedError


__all__ = ["IngestRequest", "IngestResult", "face_blur", "ingest", "probe"]
