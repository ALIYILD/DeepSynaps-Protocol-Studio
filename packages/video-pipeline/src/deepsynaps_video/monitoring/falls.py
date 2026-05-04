"""Fall detector — pose-velocity spike + ground-plane proximity + post-fall stillness.

Pose-driven (not just bbox-aspect-ratio) so it generalizes across camera
angles. Integrates with the alert-policy engine; never fires a real-time
alert without the per-customer ``monitoring.alerts_enabled`` flag.
"""

from __future__ import annotations

from ..motion import MotionTrack
from ..schemas import MonitoringEvent


def detect_falls(
    track: MotionTrack,
    *,
    camera_id: str,
    model_version: str = "v0.1",
    velocity_threshold: float = 1.6,  # m/s on COM
    stillness_window_s: float = 4.0,
) -> list[MonitoringEvent]:
    """Emit ``fall`` events from a pose track.

    Heuristic (kept simple in v1.0; replace with a learned model in v2):

    1. Compute COM vertical velocity ``v_z(t)``.
    2. Find moments where ``v_z`` exceeds ``velocity_threshold`` AND the
       COM ends up within 0.4 m of the ground plane.
    3. Confirm with a ``stillness_window_s``-second window of low motion
       afterward (post-fall stillness).
    4. Emit one ``MonitoringEvent`` per confirmed fall.

    TODO(impl): all of the above, with a clip extractor that writes the
    surrounding ±10 s clip to S3 for clinician review.
    """

    _ = (track, camera_id, model_version, velocity_threshold, stillness_window_s)
    raise NotImplementedError


__all__ = ["detect_falls"]
