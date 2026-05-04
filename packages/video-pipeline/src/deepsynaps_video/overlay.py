"""Annotated overlay rendering — skeleton + zones + events on a deid'd video.

Three artefacts per analysis (see spec §9):

1. Annotated MP4 with skeleton + epoch banners + event markers.
2. Per-task small-multiples PNG (e.g. tap-angle vs time, tremor PSD).
3. Interactive HTML player with sidecar JSON of timestamped events.

Face-blur is preserved on every artefact unless ``research_consent`` is set.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from .schemas import MonitoringEvent, TaskResult


@dataclass
class OverlayArtefacts:
    annotated_mp4_uri: str
    plots_zip_uri: str
    interactive_html_uri: str


def render_overlay(
    deid_clip_uri: str,
    *,
    keypoints_uri: str,
    tasks: list[TaskResult],
    events: list[MonitoringEvent] | None = None,
    output_dir: Path,
) -> OverlayArtefacts:
    """Compose the three overlay artefacts for an analysis.

    TODO(impl): cv2 / pyav frame loop with skeleton draw, ffmpeg mux for
    the final mp4, matplotlib for the small-multiples, plotly for the
    interactive timeline.
    """

    _ = (deid_clip_uri, keypoints_uri, tasks, events, output_dir)
    raise NotImplementedError


__all__ = ["OverlayArtefacts", "render_overlay"]
