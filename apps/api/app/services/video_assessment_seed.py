"""Default Video Assessment protocol seed (MVP virtual_care_motor_mvp_v1).

Mirrors apps/web/src/video-assessment-protocol.js task ids and order so
patient capture and clinician review stay aligned across API + UI.
"""
from __future__ import annotations

from typing import List, Tuple

PROTOCOL_NAME = "virtual_care_motor_mvp_v1"
PROTOCOL_VERSION = "1.0.0"

# (task_id, task_name, task_group, task_order)
_TASK_DEFS: Tuple[Tuple[str, str, str, int], ...] = (
    ("rest_tremor", "Rest Tremor", "tremor", 1),
    ("postural_tremor", "Postural Tremor", "tremor", 2),
    ("finger_tap_left", "Finger Tapping — Left", "upper_limb", 3),
    ("finger_tap_right", "Finger Tapping — Right", "upper_limb", 4),
    ("hand_open_close_left", "Hand Open-Close — Left", "upper_limb", 5),
    ("hand_open_close_right", "Hand Open-Close — Right", "upper_limb", 6),
    ("pronation_supination_left", "Pronation-Supination — Left", "upper_limb", 7),
    ("pronation_supination_right", "Pronation-Supination — Right", "upper_limb", 8),
    ("foot_tap_left", "Foot Tapping — Left", "lower_limb", 9),
    ("foot_tap_right", "Foot Tapping — Right", "lower_limb", 10),
    ("sit_to_stand", "Sit-to-Stand", "balance_gait", 11),
    ("standing_balance", "Standing Balance / Quiet Standing", "balance_gait", 12),
    ("gait_away_back", "Gait Away and Back", "balance_gait", 13),
    ("turn_in_place", "Turn in Place", "balance_gait", 14),
    ("finger_to_nose", "Finger-to-Nose", "coordination", 15),
    ("facial_expression_speech", "Facial Expression + Speech Sample", "face_speech", 16),
)


def default_tasks_payload() -> List[dict]:
    """Return fresh task rows for a new session (JSON-serializable)."""
    out: List[dict] = []
    for tid, tname, group, order in _TASK_DEFS:
        out.append(
            {
                "task_id": tid,
                "task_name": tname,
                "task_group": group,
                "task_order": order,
                "instructions": None,
                "demo_asset": None,
                "duration_seconds": None,
                "safety_level": None,
                "recording_status": "pending",
                "skip_reason": None,
                "unsafe_flag": False,
                "recording_asset_id": None,
                "recording_storage_ref": None,
                "ai_analysis_status": "not_requested",
                "clinician_review": None,
            }
        )
    return out


def default_summary() -> dict:
    return {
        "tasks_completed": 0,
        "tasks_skipped": 0,
        "tasks_needing_repeat": 0,
        "review_completion_percent": 0,
        "clinician_impression": None,
        "recommended_followup": None,
    }


def default_future_ai_placeholder() -> dict:
    return {
        "pose_metrics": None,
        "movement_counts": None,
        "speed_metrics": None,
        "amplitude_metrics": None,
        "symmetry_metrics": None,
        "longitudinal_comparison": None,
    }
