"""Curated atlas — task taxonomy, biomarker definitions, monitoring events.

Every entry is evidence-anchored. No biomarker, score, or alert may ship to a
report without at least one DOI in this file. Treat ``constants.py`` as the
clinical heart of the module — analytics implementations key off these IDs.

DOIs listed here are placeholder anchors derived from the spec. Authoritative
citations live in the shared 87k-paper DB and are bridged via MedRAG; the IDs
in this module are only used as deterministic lookup keys.
"""

from __future__ import annotations

from dataclasses import dataclass, field


# ---------------------------------------------------------------------------
# Structured task atlas (subset of MDS-UPDRS Part III + standard scales)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class TaskDefinition:
    """One structured clinical task we know how to score from video."""

    task_id: str
    body_parts: tuple[str, ...]
    primary_biomarkers: tuple[str, ...]
    reference_instrument: str
    method_reference_dois: tuple[str, ...]
    notes: str = ""


TASK_ATLAS: dict[str, TaskDefinition] = {
    "mds_updrs_3_4_finger_tap": TaskDefinition(
        task_id="mds_updrs_3_4_finger_tap",
        body_parts=("index_finger", "thumb"),
        primary_biomarkers=("tap_rate_hz", "amplitude_norm", "decrement_pct", "hesitation_count"),
        reference_instrument="MDS-UPDRS 3.4",
        method_reference_dois=("10.1002/mds.22340",),
        notes="Standard MDS-UPDRS finger-tap, 10 reps each side.",
    ),
    "mds_updrs_3_5_hand_open_close": TaskDefinition(
        task_id="mds_updrs_3_5_hand_open_close",
        body_parts=("wrist", "fingers"),
        primary_biomarkers=("cycle_rate_hz", "amplitude_decrement_pct"),
        reference_instrument="MDS-UPDRS 3.5",
        method_reference_dois=("10.1002/mds.22340",),
    ),
    "mds_updrs_3_6_pronation_sup": TaskDefinition(
        task_id="mds_updrs_3_6_pronation_sup",
        body_parts=("forearm",),
        primary_biomarkers=("cycle_rate_hz", "amplitude_decrement_pct", "regularity_index"),
        reference_instrument="MDS-UPDRS 3.6",
        method_reference_dois=("10.1002/mds.22340",),
    ),
    "mds_updrs_3_7_toe_tap": TaskDefinition(
        task_id="mds_updrs_3_7_toe_tap",
        body_parts=("ankle", "toe"),
        primary_biomarkers=("tap_rate_hz", "amplitude_decrement_pct"),
        reference_instrument="MDS-UPDRS 3.7",
        method_reference_dois=("10.1002/mds.22340",),
    ),
    "mds_updrs_3_8_leg_agility": TaskDefinition(
        task_id="mds_updrs_3_8_leg_agility",
        body_parts=("hip", "knee"),
        primary_biomarkers=("cycle_rate_hz", "amplitude_norm"),
        reference_instrument="MDS-UPDRS 3.8",
        method_reference_dois=("10.1002/mds.22340",),
    ),
    "mds_updrs_3_10_gait": TaskDefinition(
        task_id="mds_updrs_3_10_gait",
        body_parts=("whole_body",),
        primary_biomarkers=(
            "cadence_steps_per_min",
            "stride_length_m",
            "step_time_asymmetry",
            "double_support_pct",
            "freezing_index",
            "turn_time_s",
        ),
        reference_instrument="MDS-UPDRS 3.10",
        method_reference_dois=("10.1002/mds.22340",),
    ),
    "mds_updrs_3_11_freezing": TaskDefinition(
        task_id="mds_updrs_3_11_freezing",
        body_parts=("lower_limbs",),
        primary_biomarkers=("freezing_episode_count", "freezing_duration_s"),
        reference_instrument="MDS-UPDRS 3.11",
        method_reference_dois=("10.1002/mds.22340",),
    ),
    "mds_updrs_3_12_postural_stab": TaskDefinition(
        task_id="mds_updrs_3_12_postural_stab",
        body_parts=("whole_body",),
        primary_biomarkers=("recovery_steps", "fall_likelihood"),
        reference_instrument="MDS-UPDRS 3.12",
        method_reference_dois=("10.1002/mds.22340",),
    ),
    "mds_updrs_3_13_posture": TaskDefinition(
        task_id="mds_updrs_3_13_posture",
        body_parts=("trunk",),
        primary_biomarkers=("trunk_flexion_deg",),
        reference_instrument="MDS-UPDRS 3.13",
        method_reference_dois=("10.1002/mds.22340",),
    ),
    "mds_updrs_3_15_tremor_postural": TaskDefinition(
        task_id="mds_updrs_3_15_tremor_postural",
        body_parts=("hands",),
        primary_biomarkers=("dominant_freq_hz", "amplitude_mm", "asymmetry_index"),
        reference_instrument="MDS-UPDRS 3.15",
        method_reference_dois=("10.1002/mds.22340",),
    ),
    "mds_updrs_3_17_tremor_rest": TaskDefinition(
        task_id="mds_updrs_3_17_tremor_rest",
        body_parts=("hands", "chin"),
        primary_biomarkers=("dominant_freq_hz", "amplitude_mm", "asymmetry_index"),
        reference_instrument="MDS-UPDRS 3.17",
        method_reference_dois=("10.1002/mds.22340",),
    ),
    "tinetti_pom": TaskDefinition(
        task_id="tinetti_pom",
        body_parts=("whole_body",),
        primary_biomarkers=("composite_balance", "composite_gait"),
        reference_instrument="Tinetti POMA",
        method_reference_dois=("10.1111/j.1532-5415.1986.tb04336.x",),
    ),
    "timed_up_and_go": TaskDefinition(
        task_id="timed_up_and_go",
        body_parts=("whole_body",),
        primary_biomarkers=("total_time_s", "sit_to_stand_time_s", "turn_time_s"),
        reference_instrument="TUG",
        method_reference_dois=("10.1111/j.1532-5415.1991.tb01616.x",),
    ),
    "sit_to_stand_5x": TaskDefinition(
        task_id="sit_to_stand_5x",
        body_parts=("whole_body",),
        primary_biomarkers=("total_time_s", "asymmetry_index"),
        reference_instrument="5xSTS",
        method_reference_dois=("10.1093/ageing/afl024",),
    ),
    "facial_expression_battery": TaskDefinition(
        task_id="facial_expression_battery",
        body_parts=("face",),
        primary_biomarkers=(
            "expression_amplitude",
            "asymmetry_index",
            "blink_rate_per_min",
            "hypomimia_score",
        ),
        reference_instrument="MDS-UPDRS 3.2 + FAB",
        method_reference_dois=("10.1002/mds.22340", "10.1109/TAFFC.2017.2768026"),
    ),
}


# ---------------------------------------------------------------------------
# Movement biomarker definitions (MedRAG entity bridge)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class BiomarkerDefinition:
    """A movement biomarker we expose to the MedRAG hypergraph."""

    biomarker_id: str
    description: str
    unit: str
    related_task_ids: tuple[str, ...] = ()
    norm_cohort_id: str | None = None
    proxy_validation_dois: tuple[str, ...] = field(default_factory=tuple)


MOVEMENT_BIOMARKERS: dict[str, BiomarkerDefinition] = {
    "cadence_low": BiomarkerDefinition(
        biomarker_id="cadence_low",
        description="Walking cadence below age-adjusted norm.",
        unit="steps_per_min",
        related_task_ids=("mds_updrs_3_10_gait", "timed_up_and_go"),
        norm_cohort_id="hollman_2011",
    ),
    "stride_length_low": BiomarkerDefinition(
        biomarker_id="stride_length_low",
        description="Short stride length adjusted for height.",
        unit="m",
        related_task_ids=("mds_updrs_3_10_gait",),
        norm_cohort_id="hollman_2011",
    ),
    "step_asymmetry_high": BiomarkerDefinition(
        biomarker_id="step_asymmetry_high",
        description="Elevated step-time asymmetry between sides.",
        unit="ratio",
        related_task_ids=("mds_updrs_3_10_gait",),
    ),
    "freezing_of_gait": BiomarkerDefinition(
        biomarker_id="freezing_of_gait",
        description="Freezing-of-gait flag (Moore-Bachlin spectral index).",
        unit="boolean",
        related_task_ids=("mds_updrs_3_10_gait", "mds_updrs_3_11_freezing"),
        proxy_validation_dois=("10.1109/TBME.2009.2036731",),
    ),
    "tap_rate_decrement": BiomarkerDefinition(
        biomarker_id="tap_rate_decrement",
        description="Decrement in finger-tap rate across a 10-rep sequence.",
        unit="pct",
        related_task_ids=("mds_updrs_3_4_finger_tap",),
    ),
    "tremor_rest_4_6hz": BiomarkerDefinition(
        biomarker_id="tremor_rest_4_6hz",
        description="Rest tremor with dominant frequency in 4–6 Hz band.",
        unit="Hz",
        related_task_ids=("mds_updrs_3_17_tremor_rest",),
    ),
    "hypomimia": BiomarkerDefinition(
        biomarker_id="hypomimia",
        description="Reduced facial-expression amplitude vs. cohort norm.",
        unit="z_score",
        related_task_ids=("facial_expression_battery",),
        proxy_validation_dois=("10.1109/TAFFC.2017.2768026",),
    ),
    "tug_slow": BiomarkerDefinition(
        biomarker_id="tug_slow",
        description="Timed-Up-and-Go above age-banded threshold.",
        unit="s",
        related_task_ids=("timed_up_and_go",),
    ),
}


# ---------------------------------------------------------------------------
# Continuous-monitoring event taxonomy (v2)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class MonitoringEventDefinition:
    event_id: str
    description: str
    notification_policy: str
    requires_alert_review: bool = True
    reference_dois: tuple[str, ...] = field(default_factory=tuple)


MONITORING_EVENTS: dict[str, MonitoringEventDefinition] = {
    "bed_exit": MonitoringEventDefinition(
        event_id="bed_exit",
        description="Patient bbox center leaves bed-zone polygon for > N frames.",
        notification_policy="real_time_push",
    ),
    "fall": MonitoringEventDefinition(
        event_id="fall",
        description="Pose-velocity spike + ground-plane proximity + post-event stillness.",
        notification_policy="real_time_push",
    ),
    "prolonged_inactivity": MonitoringEventDefinition(
        event_id="prolonged_inactivity",
        description="No keypoint motion above threshold for > T minutes.",
        notification_policy="periodic_digest",
    ),
    "out_of_zone": MonitoringEventDefinition(
        event_id="out_of_zone",
        description="Patient bbox enters restricted zone (door, hallway).",
        notification_policy="real_time_push",
    ),
    "staff_interaction": MonitoringEventDefinition(
        event_id="staff_interaction",
        description="Two or more tracked persons within proximity threshold for > T seconds.",
        notification_policy="periodic_digest",
        requires_alert_review=False,
    ),
    "restraint_presence": MonitoringEventDefinition(
        event_id="restraint_presence",
        description="Object detector hits a restraint class with confidence > tau.",
        notification_policy="audit_log",
    ),
    "agitation_spike": MonitoringEventDefinition(
        event_id="agitation_spike",
        description="High-amplitude motion sustained over a window inside patient zone.",
        notification_policy="real_time_push",
    ),
}


# ---------------------------------------------------------------------------
# Reference cohorts for normative z-scores
# ---------------------------------------------------------------------------


REFERENCE_COHORTS: dict[str, dict[str, str]] = {
    "hollman_2011": {
        "name": "Hollman et al. 2011 healthy-adult gait norms",
        "n": "300",
        "doi": "10.1016/j.gaitpost.2011.03.024",
    },
    "elble_deuschl_2011": {
        "name": "Elble & Deuschl 2011 tremor reference",
        "doi": "10.1002/mds.23574",
    },
    "bohannon_2006_5xsts": {
        "name": "Bohannon 2006 five-times sit-to-stand norms",
        "doi": "10.1093/ageing/afl024",
    },
    "bohannon_1995_tug": {
        "name": "Bohannon 1995 TUG norms",
        "doi": "10.1111/j.1532-5415.1991.tb01616.x",
    },
    "bandini_2017_facspd": {
        "name": "Bandini et al. 2017 hypomimia / FACS-PD",
        "doi": "10.1109/TAFFC.2017.2768026",
    },
}


# ---------------------------------------------------------------------------
# Pose-backend catalog
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class PoseBackendSpec:
    backend_id: str
    runs_on_device: bool
    output_dim: int  # 2 or 3
    model_version: str
    notes: str = ""


POSE_BACKENDS: dict[str, PoseBackendSpec] = {
    "mediapipe-pose-cpu": PoseBackendSpec(
        backend_id="mediapipe-pose-cpu",
        runs_on_device=True,
        output_dim=2,
        model_version="mediapipe-0.10",
        notes="Default for smartphone capture and patient self-record flows.",
    ),
    "mediapipe-holistic-cpu": PoseBackendSpec(
        backend_id="mediapipe-holistic-cpu",
        runs_on_device=True,
        output_dim=2,
        model_version="mediapipe-holistic-0.10",
        notes="Adds face mesh + hand keypoints; used for facial-motor and tremor.",
    ),
    "rtmpose-l-2d-server": PoseBackendSpec(
        backend_id="rtmpose-l-2d-server",
        runs_on_device=False,
        output_dim=2,
        model_version="rtmpose-l-2024-coco",
        notes="Server-side high-accuracy 2D pose (MMPose).",
    ),
    "rtmpose-x-3d-server": PoseBackendSpec(
        backend_id="rtmpose-x-3d-server",
        runs_on_device=False,
        output_dim=3,
        model_version="rtmpose-x3d-2024",
    ),
    "vitpose-3d-server": PoseBackendSpec(
        backend_id="vitpose-3d-server",
        runs_on_device=False,
        output_dim=3,
        model_version="vitpose-h-2023",
    ),
    "openpose-server": PoseBackendSpec(
        backend_id="openpose-server",
        runs_on_device=False,
        output_dim=2,
        model_version="openpose-1.7",
        notes="Legacy backend kept for cross-validation against published baselines.",
    ),
}


__all__ = [
    "BiomarkerDefinition",
    "MONITORING_EVENTS",
    "MOVEMENT_BIOMARKERS",
    "MonitoringEventDefinition",
    "POSE_BACKENDS",
    "PoseBackendSpec",
    "REFERENCE_COHORTS",
    "TASK_ATLAS",
    "TaskDefinition",
]
