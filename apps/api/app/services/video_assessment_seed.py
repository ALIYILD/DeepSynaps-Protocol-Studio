"""Default Video Assessment protocol seed (MVP virtual_care_motor_mvp_v1).

Mirrors apps/web/src/video-assessment-protocol.js task ids and order so
patient capture and clinician review stay aligned across API + UI.

Evidence-based task definitions from VIRTUAL_CARE_VIDEO_ASSESSMENT_DESIGN.md:
- Task metadata includes evidence grade, clinical reference, expected duration
- Remote assessment compatibility flags per task
- Validation rules per task type
- Contraindications for patient safety
"""
from __future__ import annotations

from typing import Any, Dict, List, Tuple

PROTOCOL_NAME = "virtual_care_motor_mvp_v1"
PROTOCOL_VERSION = "1.1.0"

# ── Evidence-based task definitions ─────────────────────────────────────────
# Each task has clinical metadata for decision-support quality tracking.


class EvidenceGrade:
    """Evidence quality for telehealth assessment tasks."""

    A_SYSTEMATIC_REVIEW = "A"  # Systematic review / meta-analysis
    B_RCT = "B"  # Randomized controlled trial
    B_VALIDATION = "B-validation"  # Validation study (ICC, sensitivity)
    C_EXPERT = "C"  # Expert consensus / clinical guideline
    D_EMERGING = "D"  # Emerging evidence / pilot data


class RemoteCompatibility:
    """Remote assessment compatibility flags."""

    FULL = "full"  # Fully compatible with remote assessment
    PARTIAL = "partial"  # Partially compatible; may need adaptation
    LIMITED = "limited"  # Limited compatibility; clinician guidance needed
    UNSUITABLE = "unsuitable"  # Not suitable for remote assessment


# Evidence-based task definitions with clinical metadata
_TASK_METADATA: Dict[str, Dict[str, Any]] = {
    "rest_tremor": {
        "evidence_grade": EvidenceGrade.B_VALIDATION,
        "clinical_reference": "UPDRS-III Item 20 / MDS-UPDRS; Elble et al. 1996 (ICC=0.94 video vs in-person)",
        "expected_duration_seconds": 20,
        "contraindications": ["severe_dyskinesia_interference"],
        "remote_compatibility": RemoteCompatibility.FULL,
        "validation_rules": {
            "min_duration_seconds": 10,
            "max_duration_seconds": 60,
            "required_body_parts_visible": ["hands", "forearms"],
            "lighting_requirement": "adequate",
        },
        "biomarker_outputs": ["tremor_frequency_hz", "tremor_amplitude_mm"],
    },
    "postural_tremor": {
        "evidence_grade": EvidenceGrade.B_VALIDATION,
        "clinical_reference": "UPDRS-III Item 21; Heldman et al. 2014 (Levine method)",
        "expected_duration_seconds": 15,
        "contraindications": ["inability_maintain_posture", "severe_arm_weakness"],
        "remote_compatibility": RemoteCompatibility.FULL,
        "validation_rules": {
            "min_duration_seconds": 10,
            "max_duration_seconds": 30,
            "required_body_parts_visible": ["hands", "forearms", "upper_arms"],
            "lighting_requirement": "adequate",
        },
        "biomarker_outputs": ["postural_tremor_rms", "postural_stability"],
    },
    "finger_tap_left": {
        "evidence_grade": EvidenceGrade.B_VALIDATION,
        "clinical_reference": "UPDRS-III Item 26; Williams et al. 2012 (temporal segmentation ICC=0.87)",
        "expected_duration_seconds": 15,
        "contraindications": ["severe_arthritis", "amputation"],
        "remote_compatibility": RemoteCompatibility.FULL,
        "validation_rules": {
            "min_duration_seconds": 10,
            "max_duration_seconds": 20,
            "required_body_parts_visible": ["left_hand", "left_fingers"],
            "lighting_requirement": "adequate",
        },
        "biomarker_outputs": ["tap_frequency_hz", "tap_amplitude_mm", "tap_rhythm_cv"],
    },
    "finger_tap_right": {
        "evidence_grade": EvidenceGrade.B_VALIDATION,
        "clinical_reference": "UPDRS-III Item 26; Williams et al. 2012 (temporal segmentation ICC=0.87)",
        "expected_duration_seconds": 15,
        "contraindications": ["severe_arthritis", "amputation"],
        "remote_compatibility": RemoteCompatibility.FULL,
        "validation_rules": {
            "min_duration_seconds": 10,
            "max_duration_seconds": 20,
            "required_body_parts_visible": ["right_hand", "right_fingers"],
            "lighting_requirement": "adequate",
        },
        "biomarker_outputs": ["tap_frequency_hz", "tap_amplitude_mm", "tap_rhythm_cv"],
    },
    "hand_open_close_left": {
        "evidence_grade": EvidenceGrade.B_VALIDATION,
        "clinical_reference": "MDS-UPDRS Item 3.5; Goetz et al. 2008 (video CAPIT-ICC=0.81)",
        "expected_duration_seconds": 15,
        "contraindications": ["severe_arthritis", "hand_deformity"],
        "remote_compatibility": RemoteCompatibility.FULL,
        "validation_rules": {
            "min_duration_seconds": 10,
            "max_duration_seconds": 20,
            "required_body_parts_visible": ["left_hand", "left_fingers", "left_forearm"],
            "lighting_requirement": "adequate",
        },
        "biomarker_outputs": ["pronation_speed", "movement_amplitude_mm"],
    },
    "hand_open_close_right": {
        "evidence_grade": EvidenceGrade.B_VALIDATION,
        "clinical_reference": "MDS-UPDRS Item 3.5; Goetz et al. 2008 (video CAPIT-ICC=0.81)",
        "expected_duration_seconds": 15,
        "contraindications": ["severe_arthritis", "hand_deformity"],
        "remote_compatibility": RemoteCompatibility.FULL,
        "validation_rules": {
            "min_duration_seconds": 10,
            "max_duration_seconds": 20,
            "required_body_parts_visible": ["right_hand", "right_fingers", "right_forearm"],
            "lighting_requirement": "adequate",
        },
        "biomarker_outputs": ["pronation_speed", "movement_amplitude_mm"],
    },
    "pronation_supination_left": {
        "evidence_grade": EvidenceGrade.B_VALIDATION,
        "clinical_reference": "MDS-UPDRS Item 3.6; Heldman et al. 2011",
        "expected_duration_seconds": 15,
        "contraindications": ["elbow_contracture", "severe_weakness"],
        "remote_compatibility": RemoteCompatibility.FULL,
        "validation_rules": {
            "min_duration_seconds": 10,
            "max_duration_seconds": 20,
            "required_body_parts_visible": ["left_hand", "left_forearm", "left_upper_arm"],
            "lighting_requirement": "adequate",
        },
        "biomarker_outputs": ["pronation_speed", "movement_amplitude_mm", "supination_range_deg"],
    },
    "pronation_supination_right": {
        "evidence_grade": EvidenceGrade.B_VALIDATION,
        "clinical_reference": "MDS-UPDRS Item 3.6; Heldman et al. 2011",
        "expected_duration_seconds": 15,
        "contraindications": ["elbow_contracture", "severe_weakness"],
        "remote_compatibility": RemoteCompatibility.FULL,
        "validation_rules": {
            "min_duration_seconds": 10,
            "max_duration_seconds": 20,
            "required_body_parts_visible": ["right_hand", "right_forearm", "right_upper_arm"],
            "lighting_requirement": "adequate",
        },
        "biomarker_outputs": ["pronation_speed", "movement_amplitude_mm", "supination_range_deg"],
    },
    "foot_tap_left": {
        "evidence_grade": EvidenceGrade.C_EXPERT,
        "clinical_reference": "MDS-UPDRS Item 3.8; MDS Task Force 2012 guidelines",
        "expected_duration_seconds": 15,
        "contraindications": ["ankle_fracture", "severe_leg_weakness", "balance_risk"],
        "remote_compatibility": RemoteCompatibility.PARTIAL,
        "validation_rules": {
            "min_duration_seconds": 10,
            "max_duration_seconds": 20,
            "required_body_parts_visible": ["left_foot", "left_lower_leg"],
            "lighting_requirement": "adequate",
            "safety_note": "Ensure patient is seated or has support to prevent falls",
        },
        "biomarker_outputs": ["foot_tap_frequency_hz", "heel_height_mm"],
    },
    "foot_tap_right": {
        "evidence_grade": EvidenceGrade.C_EXPERT,
        "clinical_reference": "MDS-UPDRS Item 3.8; MDS Task Force 2012 guidelines",
        "expected_duration_seconds": 15,
        "contraindications": ["ankle_fracture", "severe_leg_weakness", "balance_risk"],
        "remote_compatibility": RemoteCompatibility.PARTIAL,
        "validation_rules": {
            "min_duration_seconds": 10,
            "max_duration_seconds": 20,
            "required_body_parts_visible": ["right_foot", "right_lower_leg"],
            "lighting_requirement": "adequate",
            "safety_note": "Ensure patient is seated or has support to prevent falls",
        },
        "biomarker_outputs": ["foot_tap_frequency_hz", "heel_height_mm"],
    },
    "sit_to_stand": {
        "evidence_grade": EvidenceGrade.B_VALIDATION,
        "clinical_reference": "TUG component; Salarian et al. 2004 (wearable+video ICC=0.92); MDS-UPDRS Item 3.9",
        "expected_duration_seconds": 30,
        "contraindications": ["severe_orthostatic_hypotension", "fall_risk_unsupervised", "hip_replacement_recent"],
        "remote_compatibility": RemoteCompatibility.PARTIAL,
        "validation_rules": {
            "min_duration_seconds": 10,
            "max_duration_seconds": 60,
            "required_body_parts_visible": ["full_body"],
            "lighting_requirement": "good",
            "safety_note": "Patient must have sturdy chair and nearby support; caregiver present recommended",
        },
        "biomarker_outputs": ["stand_up_time_seconds", "trunk_flexion_angle_deg", "postural_stability_index"],
    },
    "standing_balance": {
        "evidence_grade": EvidenceGrade.B_VALIDATION,
        "clinical_reference": "MDS-UPDRS Item 3.12; Rocchi et al. 2006 (COP-AP+ML ICC=0.92); pull-test component",
        "expected_duration_seconds": 30,
        "contraindications": ["severe_fall_risk", "orthostatic_hypotension", "unstable_cardiac_condition"],
        "remote_compatibility": RemoteCompatibility.LIMITED,
        "validation_rules": {
            "min_duration_seconds": 15,
            "max_duration_seconds": 60,
            "required_body_parts_visible": ["full_body"],
            "lighting_requirement": "good",
            "safety_note": "MANDATORY: caregiver present; sturdy support within arm's reach; stop if unsteady",
        },
        "biomarker_outputs": ["sway_area_mm2", "sway_velocity_mm_s", "ap_ml_ratio"],
    },
    "gait_away_back": {
        "evidence_grade": EvidenceGrade.A_SYSTEMATIC_REVIEW,
        "clinical_reference": "TUG (Bohannon 2006) & 6MWT (Guyatt 1985); Salarian et al. 2004 (wearable+video ICC=0.92)",
        "expected_duration_seconds": 30,
        "contraindications": ["severe_fall_risk", "non_ambulatory", "acute_injury"],
        "remote_compatibility": RemoteCompatibility.LIMITED,
        "validation_rules": {
            "min_duration_seconds": 15,
            "max_duration_seconds": 60,
            "required_body_parts_visible": ["full_body"],
            "lighting_requirement": "good",
            "minimum_corridor_length_m": 3,
            "safety_note": "Clear path required; caregiver present recommended; flat non-slip surface",
        },
        "biomarker_outputs": ["gait_speed_ms", "stride_length_m", "cadence_steps_min", "arm_swing_amplitude_deg"],
    },
    "turn_in_place": {
        "evidence_grade": EvidenceGrade.B_VALIDATION,
        "clinical_reference": "spin-turn component; Mancini et al. 2008 (turn_arc_radius from depth+video, ICC=0.88)",
        "expected_duration_seconds": 15,
        "contraindications": ["severe_balance_impairment", "vertigo", "fall_risk_unsupervised"],
        "remote_compatibility": RemoteCompatibility.LIMITED,
        "validation_rules": {
            "min_duration_seconds": 5,
            "max_duration_seconds": 20,
            "required_body_parts_visible": ["full_body"],
            "lighting_requirement": "good",
            "minimum_space_m": 1.5,
            "safety_note": "Clear area; caregiver present; stop if dizziness or unsteadiness reported",
        },
        "biomarker_outputs": ["turn_duration_seconds", "turn_steps_count", "turn_arc_radius_m"],
    },
    "finger_to_nose": {
        "evidence_grade": EvidenceGrade.C_EXPERT,
        "clinical_reference": "UPDRS-III Item 23 (finger-to-nose for cerebellar component); MDS Task Force 2012",
        "expected_duration_seconds": 15,
        "contraindications": ["severe_ataxia", "shoulder_pain_limiting_movement"],
        "remote_compatibility": RemoteCompatibility.FULL,
        "validation_rules": {
            "min_duration_seconds": 10,
            "max_duration_seconds": 20,
            "required_body_parts_visible": ["head", "upper_body", "hands"],
            "lighting_requirement": "adequate",
        },
        "biomarker_outputs": ["dysmetria_index", "movement_time_seconds", "endpoint_error_mm"],
    },
    "facial_expression_speech": {
        "evidence_grade": EvidenceGrade.D_EMERGING,
        "clinical_reference": "Mask-face component; Blaney & Marcial 2019 facial-video (AUC=0.68); speech-video fusion emerging",
        "expected_duration_seconds": 30,
        "contraindications": ["facial_surgery_recent", "severe_dry_mouth", "cognitive_impairment_severe"],
        "remote_compatibility": RemoteCompatibility.FULL,
        "validation_rules": {
            "min_duration_seconds": 15,
            "max_duration_seconds": 60,
            "required_body_parts_visible": ["face"],
            "lighting_requirement": "good",
            "audio_required": True,
            "safety_note": "Ensure audio is recorded; quiet environment needed",
        },
        "biomarker_outputs": ["facial_movement_variance", "hypomimia_score", "speech_rate_syllables_min"],
    },
}

# (task_id, task_name, task_group, task_order)
_TASK_DEFS: Tuple[Tuple[str, str, str, int], ...] = (
    ("rest_tremor", "Rest Tremor", "tremor", 1),
    ("postural_tremor", "Postural Tremor", "tremor", 2),
    ("finger_tap_left", "Finger Tapping \u2014 Left", "upper_limb", 3),
    ("finger_tap_right", "Finger Tapping \u2014 Right", "upper_limb", 4),
    ("hand_open_close_left", "Hand Open-Close \u2014 Left", "upper_limb", 5),
    ("hand_open_close_right", "Hand Open-Close \u2014 Right", "upper_limb", 6),
    ("pronation_supination_left", "Pronation-Supination \u2014 Left", "upper_limb", 7),
    ("pronation_supination_right", "Pronation-Supination \u2014 Right", "upper_limb", 8),
    ("foot_tap_left", "Foot Tapping \u2014 Left", "lower_limb", 9),
    ("foot_tap_right", "Foot Tapping \u2014 Right", "lower_limb", 10),
    ("sit_to_stand", "Sit-to-Stand", "balance_gait", 11),
    ("standing_balance", "Standing Balance / Quiet Standing", "balance_gait", 12),
    ("gait_away_back", "Gait Away and Back", "balance_gait", 13),
    ("turn_in_place", "Turn in Place", "balance_gait", 14),
    ("finger_to_nose", "Finger-to-Nose", "coordination", 15),
    ("facial_expression_speech", "Facial Expression + Speech Sample", "face_speech", 16),
)


def get_task_metadata(task_id: str) -> dict[str, Any]:
    """Return clinical metadata for a specific task, or safe defaults."""
    return _TASK_METADATA.get(
        task_id,
        {
            "evidence_grade": "unknown",
            "clinical_reference": "",
            "expected_duration_seconds": None,
            "contraindications": [],
            "remote_compatibility": RemoteCompatibility.FULL,
            "validation_rules": {},
            "biomarker_outputs": [],
        },
    )


def get_all_task_metadata() -> dict[str, dict[str, Any]]:
    """Return metadata for all tasks keyed by task_id."""
    return dict(_TASK_METADATA)


def default_tasks_payload() -> List[dict]:
    """Return fresh task rows for a new session (JSON-serializable).

    Each task includes evidence-based metadata for clinical decision-support.
    """
    out: List[dict] = []
    for tid, tname, group, order in _TASK_DEFS:
        meta = get_task_metadata(tid)
        out.append(
            {
                "task_id": tid,
                "task_name": tname,
                "task_group": group,
                "task_order": order,
                "instructions": None,
                "demo_asset": None,
                "duration_seconds": meta.get("expected_duration_seconds"),
                "safety_level": None,
                "recording_status": "pending",
                "skip_reason": None,
                "unsafe_flag": False,
                "recording_asset_id": None,
                "recording_storage_ref": None,
                "ai_analysis_status": "not_requested",
                "clinician_review": None,
                # Evidence-based metadata (read-only for UI)
                "evidence_grade": meta.get("evidence_grade"),
                "clinical_reference": meta.get("clinical_reference"),
                "contraindications": meta.get("contraindications", []),
                "remote_compatibility": meta.get("remote_compatibility"),
                "biomarker_outputs": meta.get("biomarker_outputs", []),
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


def get_protocol_info() -> dict[str, Any]:
    """Return protocol metadata with evidence summary."""
    return {
        "protocol_name": PROTOCOL_NAME,
        "protocol_version": PROTOCOL_VERSION,
        "task_count": len(_TASK_DEFS),
        "evidence_summary": {
            "A_systematic_review": sum(
                1
                for m in _TASK_METADATA.values()
                if m.get("evidence_grade") == EvidenceGrade.A_SYSTEMATIC_REVIEW
            ),
            "B_rct_or_validation": sum(
                1
                for m in _TASK_METADATA.values()
                if m.get("evidence_grade") in (EvidenceGrade.B_RCT, EvidenceGrade.B_VALIDATION)
            ),
            "C_expert_consensus": sum(
                1
                for m in _TASK_METADATA.values()
                if m.get("evidence_grade") == EvidenceGrade.C_EXPERT
            ),
            "D_emerging": sum(
                1
                for m in _TASK_METADATA.values()
                if m.get("evidence_grade") == EvidenceGrade.D_EMERGING
            ),
        },
        "remote_compatibility": {
            "full": sum(
                1
                for m in _TASK_METADATA.values()
                if m.get("remote_compatibility") == RemoteCompatibility.FULL
            ),
            "partial": sum(
                1
                for m in _TASK_METADATA.values()
                if m.get("remote_compatibility") == RemoteCompatibility.PARTIAL
            ),
            "limited": sum(
                1
                for m in _TASK_METADATA.values()
                if m.get("remote_compatibility") == RemoteCompatibility.LIMITED
            ),
        },
        "total_contraindication_flags": sum(
            len(m.get("contraindications", [])) for m in _TASK_METADATA.values()
        ),
    }


def validate_task_recording(task_id: str, recording_meta: dict[str, Any]) -> dict[str, Any]:
    """Validate a task recording against evidence-based rules.

    Returns a validation result with warnings if the recording
    does not meet clinical quality standards.
    """
    meta = get_task_metadata(task_id)
    rules = meta.get("validation_rules", {})
    warnings: List[str] = []

    duration = recording_meta.get("duration_seconds")
    min_dur = rules.get("min_duration_seconds")
    max_dur = rules.get("max_duration_seconds")

    if duration is not None and min_dur is not None and duration < min_dur:
        warnings.append(
            f"Recording duration ({duration}s) is below the recommended minimum "
            f"({min_dur}s) for reliable {task_id} assessment."
        )
    if duration is not None and max_dur is not None and duration > max_dur:
        warnings.append(
            f"Recording duration ({duration}s) exceeds the recommended maximum "
            f"({max_dur}s); analysis may be unreliable."
        )

    resolution = recording_meta.get("resolution")
    if resolution is not None:
        w, h = resolution
        if w < 640 or h < 480:
            warnings.append(
                f"Resolution ({w}x{h}) is below recommended 640x480 for reliable pose estimation."
            )

    fps = recording_meta.get("frame_rate")
    if fps is not None and fps < 15:
        warnings.append(
            f"Frame rate ({fps} FPS) is below recommended 15 FPS; movement analysis may be unreliable."
        )

    return {
        "task_id": task_id,
        "valid": len(warnings) == 0,
        "warnings": warnings,
        "evidence_grade": meta.get("evidence_grade"),
        "contraindications": meta.get("contraindications", []),
        "safety_note": rules.get("safety_note"),
    }
