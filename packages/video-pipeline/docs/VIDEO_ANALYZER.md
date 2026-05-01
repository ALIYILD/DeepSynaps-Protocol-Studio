# DeepSynaps Video Analyzer - Full Specification

**Module:** `deepsynaps_video_analyzer`
**Dashboard page:** Video Analyzer (sidebar: **Clinical AI -> Video**)
**Status:** Architecture and function plan (v0.1.0)
**Sibling modules:** `deepsynaps_mri_analyzer`, `deepsynaps_qeeg_analyzer`, `deepsynaps_features`

---

## 1. Executive summary

DeepSynaps Video Analyzer is a modular clinical computer-vision system for two related but distinct product lines:

1. **Clinical task videos** - smartphone, tablet, webcam, or clinic-camera recordings of structured movement tasks such as gait, finger tapping, hand opening/closing, toe tapping, leg agility, tremor, postural stability, facial motor tasks, and rehabilitation exercises.
2. **Room/bed monitoring videos** - continuous or event-triggered patient-room streams for bed exit risk, falls, prolonged inactivity, wandering, staff/patient interactions, room-zone occupancy, and other safety events.

The neurology-focused v1 should implement the clinical-task path first. It should quantify gait and bradykinesia from standardized task videos using markerless pose estimation, transparent kinematic features, task-level quality control, and longitudinal reporting. Continuous room monitoring should be designed in the same architecture but implemented later because it introduces real-time operations, higher privacy risk, more deployment variability, and more complex alert governance.

The design borrows from:

- **VisionMD** - subject selection, task selection with frame-accurate boundaries, MediaPipe-style landmark extraction, task-specific movement signals, peak/start/end detection, kinematic features, CSV export, local-first privacy, and longitudinal movement-disorder focus.
- **PosePipe / PosePipeline** - backend-agnostic pose-estimation wrappers, algorithm/video/intermediate-output provenance, tracking, 2D and 3D keypoint support, visualization overlays, and privacy-preserving face obscuration.
- **Gait analytics tools such as VIGMA and gaitXplorer** - visual analytics for multivariate gait data, spatiotemporal parameters, disease progression, group comparison, and explainable review of gait classifications.
- **TeleICU and LookDeep-style monitoring systems** - multi-source video ingestion, patient/person detection, staff interaction detection, movement/inactivity analysis, bed/room-zone events, fall alerts, and real-time event logging.

DeepSynaps should wrap useful open algorithms where licenses and deployment constraints allow, but keep the clinical contract, safety governance, provenance, and report schema inside DeepSynaps-owned modules.

---

## 2. Main product use cases

### 2.1 Clinical task videos

Clinical task videos are short, patient-scoped recordings collected in clinic or remotely. The output is a clinician-reviewable movement report, not an autonomous diagnosis.

Primary tasks:

- **Gait:** walking speed, cadence, step/stride time, stance/swing proxy, arm swing symmetry, turning time, path instability, freezing or hesitation candidates, assistive-device flags.
- **Tremor:** rest, postural, and kinetic tremor amplitude/frequency from hand, wrist, finger, head, jaw, or leg landmarks where visible.
- **Bradykinesia:** finger tapping, hand opening/closing, pronation/supination, toe tapping, and leg agility with amplitude, speed, rhythm, decrement, pauses, and hesitations.
- **Posture and postural stability:** stooped posture, shoulder/pelvis alignment, sway proxy, sit-to-stand, pull-test-like task candidates when protocolized.
- **Facial motor tasks:** smile, eyebrow raise, eye closure, speech/phonation-facing videos, hypomimia proxies, facial symmetry, blink rate if quality supports it.
- **Rehabilitation movements:** range of motion, repetitions, symmetry, adherence, compensation patterns, and home-program trend summaries.

Operational requirements:

- Accept smartphone, browser, clinic camera, and uploaded MP4/MOV/AVI sources.
- Support structured task metadata from the UI and manual boundary correction.
- Produce feature-level confidence and task-level QC.
- Store derived features separately from raw video to support privacy-preserving longitudinal tracking.
- Make every score traceable to a video segment, pose backend, model version, and feature algorithm version.

### 2.2 Room/bed monitoring videos

Room/bed monitoring uses fixed cameras or streaming sources for safety surveillance and retrospective review.

Primary events:

- **Bed exit / edge-of-bed:** patient moves from lying/sitting in bed toward edge, standing, or leaving bed-zone.
- **Falls:** fall candidate, on-floor posture, sudden vertical displacement, post-fall inactivity.
- **Prolonged inactivity:** no meaningful motion for patient-specific duration, possibly combined with posture state.
- **Wandering / elopement risk:** movement into restricted zones or doorway exit.
- **Room zones:** bed, chair, bathroom/door, equipment, staff area, fall-risk floor zone.
- **Interactions:** nurse/doctor/family presence, unattended patient, staff response latency, bedside interaction summaries.

Operational requirements:

- Support live RTSP/CCTV, local files, and cloud storage inputs.
- Use configurable zone maps per room and camera calibration.
- Emit event logs with severity, timestamps, evidence clips, and suppression/de-duplication.
- Keep alerting human-in-the-loop with configurable escalation policies.
- Apply privacy controls: face blurring, derived-skeleton storage, minimum-necessary retention, and audit trails.

---

## 3. Target module architecture

```text
  Video upload / stream / device connector
       |
       v
  ingestion.py                 [source adapters, metadata, de-identification, transcode]
       |
       v
  normalization.py             [fps/codec/resolution, frame sampling, orientation, timebase]
       |
       +--> privacy.py         [face/person redaction, derived-only retention policies]
       |
       v
  segmentation.py              [subject selection, task boundaries, room zone definitions]
       |
       v
  pose_engine/
       |                       [MediaPipe, RTMPose, ViTPose, HRNet, YOLO, 3D pose backends]
       +--> tracking.py        [subject identity, multi-person tracking, staff/patient roles]
       +--> landmarks.py       [body, hand, face, whole-body schemas]
       +--> overlays.py        [pose overlays, redacted review videos, QC visualizations]
       |
       v
  motion.py                    [trajectory smoothing, normalization, cycles, peaks, spectra]
       |
       +--> analyzers/clinical/
       |       gait.py
       |       bradykinesia.py
       |       tremor.py
       |       posture.py
       |       facial.py
       |       rehab.py
       |
       +--> analyzers/monitoring/
       |       bed_exit.py
       |       falls.py
       |       inactivity.py
       |       room_zones.py
       |       interactions.py
       |
       +--> evaluation/
       |       datasets.py
       |       metrics.py
       |       error_analysis.py
       |
       v
  reporting.py                 [clinical summary, feature tables, plots, evidence clips]
       |
       v
  longitudinal.py              [per-patient trajectories, on/off therapy comparisons, rehab progress]
       |
       v
  provenance.py + orchestration.py
                               [workflow DAG, model versions, parameters, audit trail]
       |
       v
  api.py / worker.py / cli.py  [FastAPI, queue jobs, batch CLI]
```

### 3.1 Video ingestion and normalization

Responsibilities:

- Accept uploaded files, browser recordings, mobile uploads, local batch paths, RTSP streams, and future device-registry camera sources.
- Extract container metadata, frame rate, resolution, duration, timestamps, audio presence, orientation, camera hints, and patient/task metadata.
- Normalize to analysis-ready assets: stable timebase, requested frame rate, corrected rotation, optional crop, and standard codec for evidence clips.
- Generate immutable `VideoAsset`, `VideoSegment`, and `FrameIndex` records.
- Apply PHI and privacy policy early: raw video retention tier, redaction requirements, consent state, and audit records.

### 3.2 Pose and motion engine

Responsibilities:

- Provide a pluggable backend interface for pose, hand, face, object, and patient/staff detection models.
- Support at least one lightweight local v1 backend for clinical tasks and a path to heavier backends for higher accuracy.
- Track subject identity across frames; represent multi-person streams explicitly.
- Convert raw landmarks into normalized kinematic signals: distances, angles, velocities, cycle candidates, frequency spectra, smoothness, and missingness.
- Produce QC: landmark confidence, occlusion, out-of-frame, lighting/blur, camera angle suitability, task visibility, and signal quality.

### 3.3 Clinical movement analyzers

Responsibilities:

- Convert task segments into feature vectors and clinician-facing interpretations.
- Keep analyzers task-specific and transparent: each feature should have a visible signal definition and unit.
- Provide MDS-UPDRS-inspired task support without claiming automated official scoring until validated.
- Generate longitudinal deltas and therapy state comparisons, for example ON vs OFF levodopa or pre/post DBS programming.

### 3.4 Continuous monitoring analyzers

Responsibilities:

- Convert live or stored room video into patient safety events with timestamps and confidence.
- Use room calibration and zone maps to reduce false positives.
- Combine object detection, pose state, motion energy, and temporal rules.
- Produce alert logs and evidence clips, but require clinical governance before direct paging or alarm integration.

### 3.5 Dataset and error analysis

Responsibilities:

- Maintain dataset manifests, labels, splits, demographic/task stratification, camera/device metadata, and ground truth provenance.
- Evaluate pose quality, feature reliability, event detection performance, and report stability.
- Track failure modes: occlusion, assistive devices, bed rails, blankets, multiple people, dark rooms, unusual camera angles, non-standard task execution, tremor aliasing, and frame-rate artifacts.
- Support review queues for false positives/negatives and clinician corrections.

### 3.6 Clinical reporting and longitudinal tracking

Responsibilities:

- Produce HTML/PDF/JSON reports with task summaries, QC banners, plots, video thumbnails, evidence clips, and limitations.
- Track patient-level trends in gait, bradykinesia, tremor, posture, facial motor features, and rehab adherence.
- Enable cohort and therapy-state comparisons when consent and dataset governance permit.
- Avoid diagnostic claims; report observations, confidence, and recommended clinician review items.

### 3.7 Workflow orchestration and provenance

Responsibilities:

- Run reproducible pipelines with immutable inputs, model versions, parameters, and outputs.
- Support batch jobs, async API jobs, and future streaming workers.
- Record every derived artifact in a provenance graph: source video, segment, model, feature algorithm, QC, report, reviewer edits.
- Enforce data governance: retention, redaction, access logs, consent, PHI boundaries, and export policy.

---

## 4. Reference ecosystem mapping

| Reference | What to copy or wrap | DeepSynaps module mapping | Notes |
|---|---|---|---|
| VisionMD | Subject selection, task selection, frame-accurate task boundaries, MediaPipe-style landmark extraction, task-specific time-series signals, movement start/peak/end detection, amplitude/speed/rhythm/decrement features, CSV export, local-first processing | `segmentation.py`, `pose_engine/mediapipe_backend.py`, `motion.py`, `analyzers/clinical/bradykinesia.py`, `analyzers/clinical/tremor.py`, `reporting.py` | Use as the v1 mental model for MDS-UPDRS Part III-like task videos. Keep DeepSynaps validation labels separate from official clinical scales. |
| PosePipe / PosePipeline | Modular HPE wrappers, tracking backends, 2D body/hand keypoints, 3D pose path, database-managed intermediate outputs, comparison overlays, face obscuration | `pose_engine/base.py`, `pose_engine/backends/*`, `tracking.py`, `overlays.py`, `provenance.py`, `evaluation/datasets.py` | Copy the backend-agnostic design and provenance concepts. Do not bind DeepSynaps to DataJoint unless chosen later; use existing DeepSynaps storage/contracts. |
| Gait tools: VIGMA | Multivariate gait visual analytics, spatiotemporal parameters, progression tracking, group comparison, computational notebooks plus visual frontend | `analyzers/clinical/gait.py`, `longitudinal.py`, `reporting.py`, `evaluation/metrics.py`, future dashboard page | Use for gait report design: synchronized plots, phase/cycle views, side-by-side visits, and cohort context. |
| Gait tools: gaitXplorer | Explainable gait classification review, clinician override, relevant time-region highlighting, patient list review workflow | `evaluation/error_analysis.py`, `reporting.py`, `workflow/review.py` | Useful later for model explanations and review queues if gait classifiers are introduced. |
| TeleICU YOLOv8 systems | Multi-source video input, YOLO person/patient/staff detection, fall detection, head/hand/leg/chest movement heuristics, color-coded alerts, movement logs | `analyzers/monitoring/falls.py`, `bed_exit.py`, `interactions.py`, `inactivity.py`, `api.py`, `worker.py` | Treat as v2/v3 monitoring inspiration. Strong event governance and local validation are required before alert deployment. |
| LookDeep-style continuous monitoring | Continuous patient behavior analysis, interaction awareness, patient safety workflows, bedside event summaries | `analyzers/monitoring/*`, `eventing.py`, `reporting.py`, `privacy.py` | Copy product patterns: ambient monitoring, staff interaction context, safety dashboard. Build with privacy and consent by design. |

---

## 5. Function table

| Module | Function / API name | Purpose | Expected inputs | Expected outputs | Source of inspiration |
|---|---|---|---|---|---|
| Ingestion | `create_video_asset()` | Register uploaded or referenced video with metadata and governance policy | File path/blob URI/stream URI, patient/session/task metadata, consent policy | `VideoAsset` with IDs, metadata, storage URIs, retention tier | MRI ingest pattern, TeleICU multi-source input |
| Ingestion | `probe_video_metadata()` | Extract fps, resolution, duration, codec, orientation, audio presence, timebase | Video URI or local path | `VideoMetadata` | FFmpeg/OpenCV common pattern |
| Ingestion | `normalize_video()` | Produce analysis-ready proxy video and frame index | `VideoAsset`, target fps/resolution/codec, rotation policy | `NormalizedVideo`, `FrameIndex` | PosePipe video management |
| Ingestion | `extract_frame_sample()` | Generate representative frames for QC, annotation, and thumbnails | `NormalizedVideo`, sampling policy | List of `FrameSample` records | Dataset tooling, TeleICU frame workflows |
| Privacy | `redact_video()` | Blur faces or regions and create review-safe videos | `NormalizedVideo`, redaction policy, face/person detections | Redacted video URI, redaction audit | PosePipe face obscuration, monitoring privacy |
| Privacy | `derive_skeleton_only_asset()` | Store landmark-derived asset without raw imagery | Landmark tracks, retention policy | `SkeletonAsset`, deletion schedule | Clinical privacy design |
| Segmentation | `select_primary_subject()` | Identify target patient when multiple people are present | Video frames, detections/tracks, optional user selection | `SubjectTrack` | VisionMD subject selection, TeleICU patient detection |
| Segmentation | `define_task_segments()` | Store structured task boundaries and task labels | Video asset, manual or automatic boundaries, task labels | List of `TaskSegment` | VisionMD task selection |
| Segmentation | `auto_detect_task_boundaries()` | Suggest task start/end from motion and UI prompts | Landmark tracks, audio/metadata cues, protocol definition | Candidate `TaskSegment` list with confidence | VisionMD waveform/task workflow |
| Segmentation | `define_room_zones()` | Store camera-specific bed, chair, doorway, floor, and restricted zones | Calibration frame, user polygons, room metadata | `RoomZoneMap` | TeleICU/LookDeep room monitoring |
| Pose engine | `run_pose_estimation()` | Produce body landmarks for selected video/segment | `NormalizedVideo` or `TaskSegment`, backend config | `PoseTrackSet` | PosePipe, VisionMD |
| Pose engine | `run_hand_pose_estimation()` | Produce hand/finger landmarks for bradykinesia/tremor tasks | Task segment, hand backend config | `HandTrackSet` | VisionMD, PosePipe hand keypoints |
| Pose engine | `run_face_landmark_estimation()` | Produce facial landmarks for hypomimia/facial symmetry tasks | Face task segment, face backend config | `FaceTrackSet` | Facial motor CV tools |
| Pose engine | `run_object_detection()` | Detect patient, staff, bed, chair, equipment, floor state, assistive devices | Video frames/stream, detector config | `ObjectDetectionTrackSet` | TeleICU YOLOv8 systems |
| Pose engine | `track_subjects()` | Maintain identity across frames and classify patient/staff roles when possible | Detections, landmarks, room context | `TrackSet` with identity confidence | PosePipe tracking, TeleICU |
| Pose engine | `render_pose_overlay()` | Create visual QC overlay of landmarks and tracks | Video/segment, tracks, redaction policy | Overlay video/image URIs | PosePipe visualizations |
| Motion | `smooth_landmark_tracks()` | Reduce jitter while preserving clinically relevant movement | Landmark tracks, smoothing parameters | Smoothed tracks, smoothing provenance | VisionMD kinematic preprocessing |
| Motion | `compute_joint_angles()` | Compute angle time series for gait, posture, rehab, facial tasks | Landmark tracks, joint definitions | `KinematicSignalSet` | Pose/gait analytics |
| Motion | `compute_distance_signal()` | Compute normalized distances such as finger-to-thumb or toe-to-shoulder | Landmark tracks, landmark pair, normalization reference | `KinematicSignal` | VisionMD movement signals |
| Motion | `detect_movement_cycles()` | Find repetitions, starts, peaks, ends, pauses, and hesitations | Kinematic signal, task protocol | `MovementCycleSet` | VisionMD peak/start/end detection |
| Motion | `compute_frequency_spectrum()` | Estimate tremor frequency and power from trajectories | Kinematic signal, fps, bandpass config | `FrequencyFeatureSet` | Tremor video analytics |
| Clinical gait | `analyze_gait_task()` | Quantify walking task features and QC | Task segment, pose tracks, camera/task protocol | `GaitAnalysisResult` | Gait repos, VIGMA |
| Clinical gait | `compute_spatiotemporal_gait_metrics()` | Estimate cadence, step time, stride proxy, speed proxy, symmetry, turn time | Pose tracks, calibration if available | `GaitMetricSet` | VIGMA, gait analyzer tools |
| Clinical gait | `detect_gait_events()` | Detect heel-strike/toe-off proxies and turn segments | Pose tracks, foot trajectories | `GaitEventSet` | Gait analytics |
| Clinical gait | `compare_gait_visits()` | Summarize longitudinal change between visits or therapy states | Two or more `GaitAnalysisResult` objects | `LongitudinalComparison` | VIGMA progression tracking |
| Bradykinesia | `analyze_finger_tapping()` | Quantify finger tapping amplitude, speed, rhythm, decrement, pauses | Hand landmarks, task segment | `BradykinesiaTaskResult` | VisionMD |
| Bradykinesia | `analyze_hand_open_close()` | Quantify hand movement task features | Hand/body landmarks, task segment | `BradykinesiaTaskResult` | VisionMD hand movement |
| Bradykinesia | `analyze_toe_tapping()` | Quantify toe tapping amplitude, speed, rhythm, decrement | Body/foot landmarks, task segment | `BradykinesiaTaskResult` | VisionMD |
| Bradykinesia | `analyze_leg_agility()` | Quantify leg agility cycles and amplitude/speed | Body landmarks, task segment | `BradykinesiaTaskResult` | VisionMD |
| Tremor | `analyze_rest_tremor()` | Estimate rest tremor amplitude/frequency and visible limb involvement | Pose/hand landmarks, rest task segment | `TremorAnalysisResult` | VisionMD future tremor tasks |
| Tremor | `analyze_postural_tremor()` | Estimate postural tremor during outstretched-hands task | Hand/body landmarks, task segment | `TremorAnalysisResult` | MDS-UPDRS task ecosystem |
| Tremor | `analyze_kinetic_tremor()` | Estimate tremor during finger-nose or reaching task | Hand/body landmarks, task protocol | `TremorAnalysisResult` | Movement-disorder video analytics |
| Posture | `analyze_posture_task()` | Quantify stoop, asymmetry, head/trunk angle, shoulder/pelvis alignment | Pose tracks, posture segment | `PostureAnalysisResult` | Clinical pose analytics |
| Posture | `analyze_sit_to_stand()` | Measure sit-to-stand duration, smoothness, instability, retries | Pose tracks, chair/seat context | `FunctionalMobilityResult` | Rehab/gait analytics |
| Facial | `analyze_facial_motor_task()` | Quantify facial symmetry, expression amplitude, blink rate candidates | Face landmarks, task segment | `FacialMotorResult` | Facial landmark CV |
| Rehab | `analyze_rehab_repetitions()` | Count reps, range of motion, compensation, adherence | Pose tracks, exercise protocol | `RehabExerciseResult` | Home movement analysis |
| Monitoring | `analyze_bed_exit_risk()` | Detect bed-edge sitting, standing from bed, or leaving bed zone | Stream frames, pose/object tracks, room zones | `MonitoringEvent` list | TeleICU, LookDeep |
| Monitoring | `detect_fall_event()` | Detect fall candidates and on-floor states | Pose/object tracks, motion features, zone map | Fall `MonitoringEvent`, evidence clip | TeleICU YOLO fall detection |
| Monitoring | `detect_prolonged_inactivity()` | Flag lack of patient motion beyond configured threshold | Patient track, motion energy, posture state, time threshold | Inactivity `MonitoringEvent` | TeleICU movement logs |
| Monitoring | `detect_wandering_or_exit()` | Flag restricted-zone or doorway transitions | Track set, room zone map, policy | Wandering/exit `MonitoringEvent` | LookDeep-style monitoring |
| Monitoring | `summarize_staff_interactions()` | Detect staff presence, unattended intervals, bedside interaction windows | Person tracks, role classifier, zone map | Interaction summary, event log | TeleICU patient/staff detection |
| Monitoring | `run_monitoring_stream()` | Process live stream into rolling events and evidence clips | RTSP/source URI, room config, event policy | Event stream, health metrics | TeleICU/LookDeep |
| Evaluation | `register_video_dataset()` | Register datasets, labels, splits, and governance metadata | Dataset manifest, label schema, source policy | `DatasetRecord` | PosePipe data management, VIGMA |
| Evaluation | `score_pose_quality()` | Quantify pose reliability across frames and subjects | Landmark tracks, video QC | `PoseQualityReport` | PosePipe evaluation needs |
| Evaluation | `evaluate_clinical_features()` | Compare feature extraction against annotated cycles or reference devices | Predictions, labels/reference data, stratification | Reliability and error metrics | VisionMD validation approach |
| Evaluation | `evaluate_monitoring_events()` | Measure event precision/recall, latency, false alarm burden | Event predictions, annotated intervals | `EventEvaluationReport` | TeleICU safety evaluation |
| Evaluation | `generate_error_analysis_report()` | Summarize failure modes and examples for model improvement | Predictions, labels, QC, demographics/device metadata | Error report, review queue | gaitXplorer/VIGMA visual analytics |
| Reporting | `build_video_clinical_report()` | Produce clinician-facing report for task videos | Analysis results, QC, patient/session metadata | HTML/PDF/JSON report | MRI report pattern, VisionMD |
| Reporting | `build_monitoring_event_report()` | Produce safety event timeline and evidence review | Monitoring events, clips, room context | Event report | TeleICU/LookDeep |
| Reporting | `export_feature_table()` | Export derived features for research or downstream modeling | Analysis results, export policy | CSV/Parquet/JSON | VisionMD CSV export, VIGMA |
| Longitudinal | `update_patient_video_timeline()` | Store per-patient video-derived metrics over time | Analysis result, patient/session metadata | `VideoTimelineEntry` | VisionMD longitudinal monitoring |
| Longitudinal | `compare_therapy_states()` | Compare ON/OFF medication, pre/post DBS, pre/post rehab states | Labeled visit results | `TherapyStateComparison` | VisionMD ON/OFF analyses |
| Orchestration | `run_clinical_task_pipeline()` | End-to-end batch/API job for structured task videos | Video asset, protocol, backend config | `ClinicalVideoAnalysis` | MRI pipeline pattern |
| Orchestration | `run_monitoring_pipeline()` | End-to-end streaming or retrospective monitoring job | Stream/video asset, room config, event policy | `MonitoringAnalysis` | TeleICU systems |
| Provenance | `record_video_provenance()` | Persist source, model, parameter, artifact, and reviewer lineage | Pipeline run records | `ProvenanceGraph` entries | PosePipe DataJoint concept, MRI provenance |
| API | `POST /video/clinical/analyze` | Start clinical task analysis | Upload/asset ID, protocol, patient/session metadata | Job ID, analysis status URL | DeepSynaps analyzer API pattern |
| API | `GET /video/clinical/{analysis_id}` | Retrieve clinical task result | Analysis ID | JSON result and signed artifact URLs | DeepSynaps analyzer API pattern |
| API | `POST /video/monitoring/start` | Start or register monitoring stream | Stream URI/device ID, room config, policy | Monitoring session ID | TeleICU/LookDeep |
| API | `GET /video/monitoring/{session_id}/events` | Retrieve monitoring events | Session ID, time range, severity filter | Event list and evidence URLs | TeleICU/LookDeep |

---

## 6. MVP v1 vs v2 split

### MVP v1 - neurology-focused structured task analyzer

Implement first:

1. `create_video_asset()`, `probe_video_metadata()`, `normalize_video()`, and task-video storage contracts.
2. `define_task_segments()` with manual task boundaries from the UI/API and a simple protocol registry.
3. A single local pose path for body and hand landmarks, exposed behind `run_pose_estimation()` and `run_hand_pose_estimation()`.
4. Core motion utilities: smoothing, normalized distance signals, cycle detection, and signal QC.
5. Bradykinesia analyzers for:
   - `analyze_finger_tapping()`
   - `analyze_hand_open_close()`
   - `analyze_toe_tapping()`
   - `analyze_leg_agility()`
6. Initial gait analyzer:
   - `analyze_gait_task()`
   - `compute_spatiotemporal_gait_metrics()`
   - `detect_gait_events()` as proxy events with explicit limitations.
7. Clinical report:
   - task summaries
   - feature tables
   - QC banners
   - plots of movement signals/cycles
   - evidence thumbnails or redacted short clips
8. Longitudinal table for repeat visits and ON/OFF therapy labels.
9. Dataset/evaluation scaffolding for cycle labels, feature reproducibility, and pose-quality reports.

Do not implement in v1:

- Automated official MDS-UPDRS scoring claims.
- Real-time room alerts.
- Bed-exit/fall paging.
- Facial motor scoring unless a validated task protocol and quality thresholds are available.
- 3D pose requirements unless a calibrated camera workflow is selected.

### v2 - expanded clinical and monitoring platform

Implement after v1 validation:

1. Tremor analyzers for rest, postural, and kinetic tremor with aliasing/frame-rate safeguards.
2. Posture, sit-to-stand, turning, freezing-of-gait candidates, and rehab exercise analyzers.
3. Facial motor tasks and hypomimia proxies.
4. More pose backends: RTMPose, ViTPose, HRNet, 3D pose, and model comparison tools.
5. Room monitoring:
   - bed exit
   - falls
   - prolonged inactivity
   - wandering/doorway exit
   - room-zone occupancy
   - staff interaction summaries
6. Streaming workers, event de-duplication, alert severity policy, evidence clips, and audit logs.
7. Cohort dashboards, group comparisons, explainable gait classifiers, and clinician override workflows.

### v3 - regulated deployment hardening

Future hardening before high-stakes deployment:

- Prospective validation across devices, lighting, body habitus, assistive devices, and care settings.
- Formal safety case, hazard log, alert fatigue analysis, and clinical governance.
- Model monitoring, drift detection, and post-market surveillance workflow.
- EHR/device integration and alarm-routing integration only after validated operating envelopes.

---

## 7. Suggested file and folder structure

```text
packages/video-pipeline/
|-- README.md
|-- pyproject.toml
|-- CLAUDE.md
|-- docs/
|   `-- VIDEO_ANALYZER.md
|-- src/
|   `-- deepsynaps_video/
|       |-- __init__.py
|       |-- schemas.py
|       |-- constants.py
|       |-- ingestion.py
|       |-- normalization.py
|       |-- privacy.py
|       |-- segmentation.py
|       |-- motion.py
|       |-- qc.py
|       |-- provenance.py
|       |-- orchestration.py
|       |-- reporting.py
|       |-- longitudinal.py
|       |-- api.py
|       |-- worker.py
|       |-- cli.py
|       |-- pose_engine/
|       |   |-- __init__.py
|       |   |-- base.py
|       |   |-- schemas.py
|       |   |-- tracking.py
|       |   |-- overlays.py
|       |   `-- backends/
|       |       |-- __init__.py
|       |       |-- mediapipe_backend.py
|       |       |-- rtmpose_backend.py
|       |       |-- vitpose_backend.py
|       |       |-- yolo_backend.py
|       |       `-- noop_backend.py
|       |-- analyzers/
|       |   |-- __init__.py
|       |   |-- clinical/
|       |   |   |-- __init__.py
|       |   |   |-- gait.py
|       |   |   |-- bradykinesia.py
|       |   |   |-- tremor.py
|       |   |   |-- posture.py
|       |   |   |-- facial.py
|       |   |   `-- rehab.py
|       |   `-- monitoring/
|       |       |-- __init__.py
|       |       |-- bed_exit.py
|       |       |-- falls.py
|       |       |-- inactivity.py
|       |       |-- room_zones.py
|       |       `-- interactions.py
|       |-- evaluation/
|       |   |-- __init__.py
|       |   |-- datasets.py
|       |   |-- labels.py
|       |   |-- metrics.py
|       |   `-- error_analysis.py
|       `-- protocols/
|           |-- __init__.py
|           |-- mds_updrs_part_iii.py
|           |-- gait.py
|           |-- rehab.py
|           `-- room_monitoring.py
|-- portal_integration/
|   |-- DASHBOARD_PAGE_SPEC.md
|   `-- api_contract.md
|-- demo/
|   |-- sample_clinical_task_report.json
|   `-- demo_clinical_task.py
`-- tests/
    |-- test_motion.py
    |-- test_bradykinesia.py
    |-- test_gait.py
    `-- fixtures/
```

---

## 8. Recommended first 5 implementation tasks for agents

1. **Create the package scaffold and typed schemas.**
   - Add `packages/video-pipeline/pyproject.toml`, `README.md`, `src/deepsynaps_video/schemas.py`, and dataclasses/Pydantic models for `VideoAsset`, `TaskSegment`, `PoseTrackSet`, `KinematicSignal`, `ClinicalVideoAnalysis`, and QC/provenance records.

2. **Implement ingestion and normalization without clinical algorithms.**
   - Implement `probe_video_metadata()`, `normalize_video()`, frame sampling, asset IDs, and deterministic fixture tests using a tiny synthetic video.

3. **Implement motion primitives with synthetic landmark tests.**
   - Implement smoothing, normalized distance signals, cycle detection, velocity/amplitude/rhythm features, and signal QC using generated landmark sequences with known repetitions and missingness.

4. **Build the v1 bradykinesia analyzer.**
   - Implement finger tapping, hand open/close, toe tapping, and leg agility feature extraction over landmark tracks. Return transparent features and confidence, not official MDS-UPDRS scores.

5. **Build the v1 clinical report contract and API facade.**
   - Implement `run_clinical_task_pipeline()` with a noop or fixture pose backend, JSON report generation, and `POST /video/clinical/analyze` / `GET /video/clinical/{analysis_id}` contracts that match the DeepSynaps analyzer pattern.

---

## 9. Clinical and safety guardrails

- Video Analyzer outputs are clinical decision support and require clinician review.
- v1 should report movement features and longitudinal changes, not autonomous diagnoses or official scale scores.
- Every result should include QC, confidence, limitations, and source segment references.
- Raw video retention should be minimized; derived landmark and feature storage should be preferred when clinically acceptable.
- Monitoring events should not directly page staff until validated in the target environment and governed by an alert policy.
- Model/version/provenance records are mandatory for reproducibility and audit.
