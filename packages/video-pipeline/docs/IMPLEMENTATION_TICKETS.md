# DeepSynaps Video Analyzer - Implementation Tickets

This backlog is scoped to `packages/video-pipeline/src/deepsynaps_video/` and follows the Video Analyzer architecture in `VIDEO_ANALYZER.md` plus the agent rules in `../AGENTS.md`.

Priority labels:

- **P0:** v1 neurology MVP.
- **P1:** follow-up after MVP foundation is stable.
- **P2:** later monitoring/regulated expansion.

---

## video_ingestion

### [P0] Ticket VI-01 - Scaffold video pipeline package and core schemas

**Goal:** Create the typed package foundation used by all video modules.

**Files/directories likely touched or created:**

- `packages/video-pipeline/pyproject.toml`
- `packages/video-pipeline/README.md`
- `packages/video-pipeline/src/deepsynaps_video/__init__.py`
- `packages/video-pipeline/src/deepsynaps_video/schemas.py`
- `packages/video-pipeline/src/deepsynaps_video/constants.py`
- `packages/video-pipeline/tests/test_schemas.py`

**Dependencies:**

- Internal: Video Analyzer spec, AGENTS.md.
- External: Python packaging, Pydantic or dataclasses, pytest.

**Acceptance criteria:**

- Package imports successfully as `deepsynaps_video`.
- Typed schemas exist for `VideoAsset`, `VideoMetadata`, `NormalizedVideo`, `FrameIndex`, `TaskSegment`, `RoomZoneMap`, `PoseTrackSet`, `KinematicSignal`, `MovementCycleSet`, `ClinicalVideoAnalysis`, `MonitoringEvent`, `QCResult`, and `ProvenanceRecord`.
- Schemas include IDs, timestamps/time ranges, confidence/QC fields where applicable, provenance hooks, and no MRI-specific fields.
- Heavy CV/ML dependencies are not required for base install.

**Tests required:**

- Pytest schema construction and serialization tests.
- Validation tests for invalid time ranges, invalid confidence values, and missing required provenance IDs.

**Risk level:** Low

---

### [P0] Ticket VI-02 - Implement video asset creation and metadata probing

**Goal:** Register videos and extract metadata without running clinical analysis.

**Files/directories likely touched or created:**

- `src/deepsynaps_video/ingestion.py`
- `src/deepsynaps_video/storage.py` or storage adapter module if needed
- `src/deepsynaps_video/provenance.py`
- `tests/test_ingestion.py`
- `tests/fixtures/`

**Dependencies:**

- Internal: VI-01 schemas.
- External: stdlib path/URI handling; optional `ffprobe`/OpenCV adapters kept behind extras or mocks.

**Acceptance criteria:**

- `create_video_asset()` returns a `VideoAsset` with stable IDs, source URI/path, consent/retention policy, and source metadata.
- `probe_video_metadata()` returns fps, duration, resolution, codec/container if available, orientation, audio presence, and timebase.
- Metadata probing is adapter-based and testable without requiring FFmpeg in default tests.
- Per-video provenance record is emitted for source registration and probing.

**Tests required:**

- Unit tests for local fixture paths and mocked probe results.
- Tests for unsupported source, missing file, malformed URI, and probe failure.
- Provenance emission test.

**Risk level:** Medium

---

### [P0] Ticket VI-03 - Implement normalization, frame indexing, and frame sampling

**Goal:** Produce analysis-ready video references and deterministic frame/time indexes.

**Files/directories likely touched or created:**

- `src/deepsynaps_video/normalization.py`
- `src/deepsynaps_video/ingestion.py`
- `src/deepsynaps_video/schemas.py`
- `tests/test_normalization.py`

**Dependencies:**

- Internal: VI-01, VI-02.
- External: optional FFmpeg/OpenCV backend through adapter/mocks.

**Acceptance criteria:**

- `normalize_video()` returns `NormalizedVideo` and `FrameIndex` records with target fps/resolution/rotation policy captured.
- `extract_frame_sample()` returns representative frame references for QC and thumbnails.
- The module can run in noop/mock mode for tests and future cloud environments without video codecs.
- Normalization outputs are linked to source assets and provenance.

**Tests required:**

- Tests for target fps/timebase mapping, rotation metadata handling, and frame-sample intervals.
- Mock backend tests for normalization success/failure.
- Provenance and schema serialization tests.

**Risk level:** Medium

---

### [P1] Ticket VI-04 - Add privacy/redaction and skeleton-only asset policies

**Goal:** Create privacy controls for redacted review assets and derived-only storage.

**Files/directories likely touched or created:**

- `src/deepsynaps_video/privacy.py`
- `src/deepsynaps_video/schemas.py`
- `tests/test_privacy.py`

**Dependencies:**

- Internal: VI-01, VI-03, pose/object track schemas from PME-01/PME-02.
- External: optional face/person detection backend via adapter.

**Acceptance criteria:**

- `redact_video()` accepts redaction policy and detection tracks and returns redacted asset references plus audit metadata.
- `derive_skeleton_only_asset()` stores derived landmark references with retention/deletion policy.
- No raw frames or PHI are logged.
- Redaction and retention decisions are represented in provenance.

**Tests required:**

- Unit tests with mocked detection tracks.
- Tests for retention policy serialization and redaction audit records.
- Logging test to ensure sensitive fields are not included.

**Risk level:** Medium

---

### [P0] Ticket VI-05 - Implement task and room segmentation primitives

**Goal:** Store structured task boundaries for v1 and define minimal room-zone primitives for later monitoring.

**Files/directories likely touched or created:**

- `src/deepsynaps_video/segmentation.py`
- `src/deepsynaps_video/protocols/mds_updrs_part_iii.py`
- `src/deepsynaps_video/protocols/gait.py`
- `src/deepsynaps_video/protocols/room_monitoring.py`
- `tests/test_segmentation.py`

**Dependencies:**

- Internal: VI-01, VI-03.
- External: none required.

**Acceptance criteria:**

- `define_task_segments()` validates task labels, start/end times, side labels, and protocol IDs.
- `select_primary_subject()` accepts optional user-selected track IDs and returns a typed subject selection record.
- `define_room_zones()` validates zone polygons and zone names.
- `auto_detect_task_boundaries()` exists as an explicit future/heuristic interface with clear QC/confidence output if implemented.

**Tests required:**

- Unit tests for overlapping segments, invalid time ranges, invalid labels, and valid multi-task videos.
- Room-zone polygon validation tests.
- Subject-selection tests with mocked tracks.

**Risk level:** Low

---

## pose_motion_engine

### [P0] Ticket PME-01 - Define pose backend adapter interfaces and fixture backend

**Goal:** Establish PosePipe-style adapters for body, hand, face, object, and tracking backends.

**Files/directories likely touched or created:**

- `src/deepsynaps_video/pose_engine/base.py`
- `src/deepsynaps_video/pose_engine/schemas.py`
- `src/deepsynaps_video/pose_engine/backends/noop_backend.py`
- `tests/test_pose_engine_base.py`

**Dependencies:**

- Internal: VI-01 schemas.
- External: none for fixture/noop backend.

**Acceptance criteria:**

- Adapter interfaces expose backend name, version, model/config provenance, supported modalities, and confidence metadata.
- `run_pose_estimation()`, `run_hand_pose_estimation()`, `run_face_landmark_estimation()`, and `run_object_detection()` have stable typed contracts.
- No backend-specific APIs leak into analyzers.
- Fixture/noop backend supports deterministic tests.

**Tests required:**

- Interface conformance tests.
- Fixture backend deterministic output tests.
- Tests verifying backend/version provenance is attached to tracks.

**Risk level:** Low

---

### [P0] Ticket PME-02 - Implement core landmark motion primitives

**Goal:** Convert landmark tracks into reliable kinematic signals and cycles.

**Files/directories likely touched or created:**

- `src/deepsynaps_video/motion.py`
- `src/deepsynaps_video/qc.py`
- `tests/test_motion.py`
- `tests/fixtures/landmarks.py`

**Dependencies:**

- Internal: VI-01, PME-01.
- External: NumPy/SciPy if accepted by packaging; otherwise pure Python for MVP.

**Acceptance criteria:**

- `smooth_landmark_tracks()` handles jitter and missing landmarks while preserving provenance.
- `compute_distance_signal()` supports normalized landmark distances for VisionMD-like task signals.
- `compute_joint_angles()` creates typed angle signals where landmark geometry is available.
- `detect_movement_cycles()` returns starts, peaks, ends, amplitudes, durations, pauses, and confidence.
- `compute_frequency_spectrum()` is scaffolded or implemented with explicit fps/aliasing limits.

**Tests required:**

- Synthetic sine/repetition landmark tests with known cycle counts.
- Missing-landmark, low-fps, jitter, and no-movement tests.
- QC tests for signal completeness and low-confidence landmarks.

**Risk level:** Medium

---

### [P0] Ticket PME-03 - Add task-level pose and signal QC

**Goal:** Make every analyzer result explainable with pose and signal quality flags.

**Files/directories likely touched or created:**

- `src/deepsynaps_video/qc.py`
- `src/deepsynaps_video/schemas.py`
- `tests/test_qc.py`

**Dependencies:**

- Internal: PME-01, PME-02.
- External: none required.

**Acceptance criteria:**

- QC includes landmark missingness, confidence summary, out-of-frame indicators, task visibility, signal amplitude floor, frame-rate suitability, and limitation text.
- QC records are attachable to task results and reports.
- Failed QC returns structured limitations, not silent success.

**Tests required:**

- Unit tests for each QC rule using fixture tracks.
- Tests for low-quality videos producing warnings/limitations.
- Serialization tests for QC records.

**Risk level:** Medium

---

### [P1] Ticket PME-04 - Implement local MediaPipe-style body/hand adapter

**Goal:** Add the first real lightweight local pose backend behind the adapter interface.

**Files/directories likely touched or created:**

- `src/deepsynaps_video/pose_engine/backends/mediapipe_backend.py`
- `pyproject.toml` extras
- `tests/test_mediapipe_backend.py`

**Dependencies:**

- Internal: PME-01.
- External: MediaPipe or equivalent local pose package in optional extra only.

**Acceptance criteria:**

- Backend is optional and unavailable dependency errors are clear.
- Body and hand landmarks map into DeepSynaps schemas.
- Backend name/version/model configuration is captured in provenance.
- Default tests can skip if optional dependency is absent.

**Tests required:**

- Mocked adapter tests.
- Optional integration test gated by dependency marker.
- Landmark schema mapping tests.

**Risk level:** Medium

---

### [P2] Ticket PME-05 - Add advanced pose/object/tracking backends

**Goal:** Support higher-accuracy or monitoring-focused backends.

**Files/directories likely touched or created:**

- `src/deepsynaps_video/pose_engine/backends/rtmpose_backend.py`
- `src/deepsynaps_video/pose_engine/backends/vitpose_backend.py`
- `src/deepsynaps_video/pose_engine/backends/yolo_backend.py`
- `src/deepsynaps_video/pose_engine/tracking.py`
- `tests/test_advanced_backends.py`

**Dependencies:**

- Internal: PME-01, PME-04.
- External: optional OpenMMLab, YOLO/Ultralytics, PyTorch, tracking libraries.

**Acceptance criteria:**

- Backends remain optional extras.
- Object detections and tracks map to typed patient/staff/object schemas.
- Multi-person tracking preserves identity confidence and role labels when available.
- Backend comparison metadata is available for evaluation.

**Tests required:**

- Mocked backend conformance tests.
- Optional integration tests gated by extras.
- Multi-person tracking fixture tests.

**Risk level:** High

---

## clinical_task_analyzers

### [P0] Ticket CTA-01 - Implement bradykinesia analyzers for structured tasks

**Goal:** Quantify finger tapping, hand open/close, toe tapping, and leg agility without official scale claims.

**Files/directories likely touched or created:**

- `src/deepsynaps_video/analyzers/clinical/bradykinesia.py`
- `src/deepsynaps_video/protocols/mds_updrs_part_iii.py`
- `tests/test_bradykinesia.py`

**Dependencies:**

- Internal: VI-05, PME-01, PME-02, PME-03.
- External: none required beyond numerical helpers.

**Acceptance criteria:**

- `analyze_finger_tapping()`, `analyze_hand_open_close()`, `analyze_toe_tapping()`, and `analyze_leg_agility()` return typed `BradykinesiaTaskResult` records.
- Outputs include amplitude, speed/rate, rhythm variability, decrement, pauses/hesitations, repetition count, side label, units, confidence, QC, and limitations.
- Function names and result fields avoid diagnostic or official rating-score claims.
- Results link to source task segment and motion-signal provenance.

**Tests required:**

- Synthetic repeated-movement tests with expected count/amplitude/decrement.
- Missing landmarks, no movement, unilateral side-label, and short-segment tests.
- Snapshot/serialization tests for result schemas.

**Risk level:** Medium

---

### [P0] Ticket CTA-02 - Implement initial gait task analyzer

**Goal:** Provide transparent v1 gait metrics from structured walking videos.

**Files/directories likely touched or created:**

- `src/deepsynaps_video/analyzers/clinical/gait.py`
- `src/deepsynaps_video/protocols/gait.py`
- `tests/test_gait.py`

**Dependencies:**

- Internal: VI-05, PME-01, PME-02, PME-03.
- External: none required for proxy metrics.

**Acceptance criteria:**

- `analyze_gait_task()` returns `GaitAnalysisResult` with step/cycle proxies, cadence, step-time variability, symmetry proxies, turn duration when detectable, arm-swing symmetry proxy, and QC.
- `compute_spatiotemporal_gait_metrics()` and `detect_gait_events()` are explicit about monocular/proxy limitations.
- Metrics include units, confidence, task protocol, camera assumptions, and source segment links.
- No unsupported claims about instrumented gait-lab equivalence.

**Tests required:**

- Synthetic foot trajectory tests for cadence/event proxies.
- Tests for low frame rate, occluded feet, assistive-device flag input, and non-walking segment.
- Serialization and limitation-text tests.

**Risk level:** Medium

---

### [P1] Ticket CTA-03 - Add tremor analyzers with aliasing safeguards

**Goal:** Estimate rest, postural, and kinetic tremor features when video quality supports it.

**Files/directories likely touched or created:**

- `src/deepsynaps_video/analyzers/clinical/tremor.py`
- `tests/test_tremor.py`

**Dependencies:**

- Internal: PME-02 frequency spectrum, PME-03 QC, VI-05 protocols.
- External: optional SciPy signal processing.

**Acceptance criteria:**

- `analyze_rest_tremor()`, `analyze_postural_tremor()`, and `analyze_kinetic_tremor()` return amplitude/frequency/power features with confidence.
- Analyzer rejects or downgrades confidence for fps too low for target tremor band.
- Results include visible body part, segment, bandpass configuration, limitations, and no diagnostic claims.

**Tests required:**

- Synthetic oscillation tests at known frequencies.
- Aliasing/low-fps tests.
- Noisy signal and missing landmarks tests.

**Risk level:** High

---

### [P1] Ticket CTA-04 - Add posture and sit-to-stand analyzers

**Goal:** Quantify posture, asymmetry, and simple functional mobility tasks.

**Files/directories likely touched or created:**

- `src/deepsynaps_video/analyzers/clinical/posture.py`
- `tests/test_posture.py`

**Dependencies:**

- Internal: PME-02 joint angles, PME-03 QC, VI-05 protocols.
- External: none required.

**Acceptance criteria:**

- `analyze_posture_task()` returns trunk/head angle proxies, shoulder/pelvis alignment, and symmetry metrics.
- `analyze_sit_to_stand()` returns duration, smoothness proxy, retries, and instability flags when task context is present.
- Outputs include camera-angle limitations and confidence.

**Tests required:**

- Synthetic pose-angle tests.
- Sit-to-stand transition fixture tests.
- Out-of-plane/camera suitability QC tests.

**Risk level:** Medium

---

### [P2] Ticket CTA-05 - Add facial motor task analyzer

**Goal:** Support facial motor tasks after quality thresholds and protocols are defined.

**Files/directories likely touched or created:**

- `src/deepsynaps_video/analyzers/clinical/facial.py`
- `src/deepsynaps_video/protocols/mds_updrs_part_iii.py`
- `tests/test_facial.py`

**Dependencies:**

- Internal: face landmark adapter in PME-01/PME-04, PME-03 QC.
- External: optional face landmark backend.

**Acceptance criteria:**

- `analyze_facial_motor_task()` returns facial symmetry, expression amplitude, blink-rate candidates, confidence, QC, and limitations.
- Analyzer rejects poor face visibility and avoids hypomimia diagnosis.
- Reports link facial metrics to task segment and face landmark provenance.

**Tests required:**

- Mocked face landmark tests.
- Low-visibility and missing-face tests.
- Serialization tests.

**Risk level:** High

---

## monitoring_analyzers

### [P1] Ticket MA-01 - Implement room-zone data model and validation

**Goal:** Create zone primitives needed before monitoring event detection.

**Files/directories likely touched or created:**

- `src/deepsynaps_video/analyzers/monitoring/room_zones.py`
- `src/deepsynaps_video/protocols/room_monitoring.py`
- `tests/test_room_zones.py`

**Dependencies:**

- Internal: VI-05 segmentation schemas.
- External: none required.

**Acceptance criteria:**

- Zone maps support bed, chair, doorway, bathroom, floor-risk, staff area, and restricted zones.
- Point-in-polygon and track-zone transition helpers are deterministic and typed.
- Invalid or overlapping zones produce structured validation errors/warnings.

**Tests required:**

- Polygon validation tests.
- Track-zone transition tests.
- Edge/corner boundary tests.

**Risk level:** Medium

---

### [P2] Ticket MA-02 - Implement bed-exit event analyzer

**Goal:** Detect bed-exit candidates from patient tracks and room zones.

**Files/directories likely touched or created:**

- `src/deepsynaps_video/analyzers/monitoring/bed_exit.py`
- `tests/test_bed_exit.py`

**Dependencies:**

- Internal: MA-01, PME-05 object/tracking backend, PME-03 QC.
- External: optional detection/tracking models.

**Acceptance criteria:**

- `analyze_bed_exit_risk()` emits `MonitoringEvent` records for edge-of-bed, standing-from-bed, and left-bed-zone candidates.
- Events include severity, confidence, start/end time, zone IDs, evidence clip/frame links, and suppression hints.
- Analyzer does not trigger paging or alarm routing directly.

**Tests required:**

- Mock track transition tests.
- Event de-duplication and threshold tests.
- Missing/invalid zone map tests.

**Risk level:** High

---

### [P2] Ticket MA-03 - Implement fall event analyzer

**Goal:** Detect fall candidates and on-floor states with explicit limitations.

**Files/directories likely touched or created:**

- `src/deepsynaps_video/analyzers/monitoring/falls.py`
- `tests/test_falls.py`

**Dependencies:**

- Internal: MA-01, PME-05, PME-03.
- External: optional YOLO/fall detector backend.

**Acceptance criteria:**

- `detect_fall_event()` emits fall candidate events with confidence, time range, evidence links, posture/zone context, and post-fall inactivity marker when available.
- False-positive mitigation includes minimum duration, zone context, and de-duplication hooks.
- Output language is "fall candidate" unless validated event labels are available.

**Tests required:**

- Mock sudden-transition and on-floor-state tests.
- False-positive tests for sitting/lying in bed.
- Event serialization and evidence-link tests.

**Risk level:** High

---

### [P2] Ticket MA-04 - Implement prolonged inactivity and wandering analyzers

**Goal:** Detect inactivity and restricted-zone/doorway movement from patient tracks.

**Files/directories likely touched or created:**

- `src/deepsynaps_video/analyzers/monitoring/inactivity.py`
- `src/deepsynaps_video/analyzers/monitoring/room_zones.py`
- `tests/test_inactivity.py`
- `tests/test_wandering.py`

**Dependencies:**

- Internal: MA-01, PME-05.
- External: optional tracking backend.

**Acceptance criteria:**

- `detect_prolonged_inactivity()` emits inactivity events based on configured threshold, motion energy, and posture/zone context.
- `detect_wandering_or_exit()` emits restricted-zone or doorway transition events.
- Event policy is configurable and stored in provenance.

**Tests required:**

- Threshold and time-window tests.
- Zone transition tests.
- Suppression/de-duplication tests.

**Risk level:** High

---

### [P2] Ticket MA-05 - Implement staff interaction summaries

**Goal:** Summarize staff/patient presence and unattended intervals.

**Files/directories likely touched or created:**

- `src/deepsynaps_video/analyzers/monitoring/interactions.py`
- `tests/test_interactions.py`

**Dependencies:**

- Internal: PME-05 person/object tracking, MA-01 zones.
- External: optional role/person detector.

**Acceptance criteria:**

- `summarize_staff_interactions()` returns bedside interaction windows, staff-present intervals, and unattended intervals.
- Role labels include confidence and uncertainty.
- Summary is suitable for review dashboards but not staffing compliance claims without governance.

**Tests required:**

- Mock patient/staff track tests.
- Role-uncertainty tests.
- Timeline merge/split tests.

**Risk level:** Medium

---

## dataset_and_error_analysis

### [P0] Ticket DEA-01 - Add dataset manifest and fixture registry

**Goal:** Enable reproducible tests and future validation datasets.

**Files/directories likely touched or created:**

- `src/deepsynaps_video/evaluation/datasets.py`
- `src/deepsynaps_video/evaluation/labels.py`
- `tests/test_datasets.py`
- `tests/fixtures/`

**Dependencies:**

- Internal: VI-01 schemas.
- External: pytest.

**Acceptance criteria:**

- `register_video_dataset()` stores dataset ID, source policy, label schema, splits, device/camera metadata, demographic/task stratification fields, and governance metadata.
- Fixture registry supports synthetic landmark and tiny video references without PHI.
- Dataset records serialize deterministically.

**Tests required:**

- Dataset manifest validation tests.
- Split integrity tests.
- Fixture registry tests.

**Risk level:** Low

---

### [P0] Ticket DEA-02 - Implement pose quality and clinical feature evaluation

**Goal:** Evaluate v1 pose reliability and movement feature extraction.

**Files/directories likely touched or created:**

- `src/deepsynaps_video/evaluation/metrics.py`
- `src/deepsynaps_video/evaluation/error_analysis.py`
- `tests/test_evaluation_metrics.py`

**Dependencies:**

- Internal: PME-03 QC, CTA-01, CTA-02, DEA-01.
- External: optional NumPy/Pandas in dev/test extras if needed.

**Acceptance criteria:**

- `score_pose_quality()` produces aggregate and per-segment pose quality metrics.
- `evaluate_clinical_features()` compares cycle labels/reference features against predictions and reports error metrics.
- Reports stratify by task type, side, camera/device metadata, and QC bins when metadata is available.

**Tests required:**

- Known-label synthetic cycle tests.
- Pose missingness quality tests.
- Error report serialization tests.

**Risk level:** Medium

---

### [P1] Ticket DEA-03 - Add monitoring event evaluation and error queues

**Goal:** Support validation of v2 monitoring events.

**Files/directories likely touched or created:**

- `src/deepsynaps_video/evaluation/metrics.py`
- `src/deepsynaps_video/evaluation/error_analysis.py`
- `tests/test_monitoring_evaluation.py`

**Dependencies:**

- Internal: monitoring event schemas, MA-02/MA-03/MA-04.
- External: none required.

**Acceptance criteria:**

- `evaluate_monitoring_events()` computes precision/recall, latency, false-alarm burden, and missed-event summaries.
- `generate_error_analysis_report()` returns review queues with example event links and failure-mode tags.
- Reports do not contain PHI or raw frame payloads.

**Tests required:**

- Interval-overlap event matching tests.
- Latency and false alarm tests.
- Failure-mode grouping tests.

**Risk level:** Medium

---

## clinical_reporting

### [P0] Ticket CR-01 - Build clinical task report schema and JSON renderer

**Goal:** Generate clinician-reviewable v1 reports for structured task videos.

**Files/directories likely touched or created:**

- `src/deepsynaps_video/reporting.py`
- `src/deepsynaps_video/schemas.py`
- `tests/test_reporting.py`
- `demo/sample_clinical_task_report.json`

**Dependencies:**

- Internal: CTA-01, CTA-02, PME-03, DEA-02.
- External: none required for JSON renderer.

**Acceptance criteria:**

- `build_video_clinical_report()` returns JSON with patient/session metadata, task summaries, feature tables, QC banners, limitation text, provenance, and evidence references.
- Report explicitly avoids diagnosis, official rating-score, or treatment claims.
- Bradykinesia and gait results render consistently with units/confidence.

**Tests required:**

- Snapshot tests for sample report JSON.
- Tests for low-QC warning rendering.
- Tests ensuring source segment/provenance links are present.

**Risk level:** Medium

---

### [P1] Ticket CR-02 - Add HTML/PDF report rendering and feature export

**Goal:** Provide clinician and research outputs beyond JSON.

**Files/directories likely touched or created:**

- `src/deepsynaps_video/reporting.py`
- `src/deepsynaps_video/templates/`
- `tests/test_report_exports.py`

**Dependencies:**

- Internal: CR-01.
- External: optional Jinja2/WeasyPrint or existing DeepSynaps render tooling.

**Acceptance criteria:**

- HTML report includes task summaries, plots/placeholders, QC, limitations, and evidence clip links.
- `export_feature_table()` supports CSV/JSON/Parquet where dependencies are available.
- PDF generation is optional/gated if renderer dependencies are not installed.

**Tests required:**

- HTML rendering tests.
- Feature export tests.
- Optional PDF test gated by dependency marker.

**Risk level:** Medium

---

### [P1] Ticket CR-03 - Add longitudinal and therapy-state comparisons

**Goal:** Track repeat video assessments over time.

**Files/directories likely touched or created:**

- `src/deepsynaps_video/longitudinal.py`
- `src/deepsynaps_video/reporting.py`
- `tests/test_longitudinal.py`

**Dependencies:**

- Internal: CR-01, CTA-01, CTA-02.
- External: none required.

**Acceptance criteria:**

- `update_patient_video_timeline()` creates timeline entries for derived metrics, QC, and visit labels.
- `compare_therapy_states()` compares ON/OFF medication, pre/post DBS, or pre/post rehab labels without causal claims.
- Comparison output includes confidence, missingness, and same-protocol checks.

**Tests required:**

- Repeat-visit timeline tests.
- ON/OFF comparison tests.
- Protocol mismatch and missing-data tests.

**Risk level:** Medium

---

### [P2] Ticket CR-04 - Build monitoring event report

**Goal:** Summarize safety monitoring events and evidence links.

**Files/directories likely touched or created:**

- `src/deepsynaps_video/reporting.py`
- `tests/test_monitoring_report.py`

**Dependencies:**

- Internal: MA-02, MA-03, MA-04, MA-05.
- External: optional templating.

**Acceptance criteria:**

- `build_monitoring_event_report()` renders event timeline, severity, confidence, room-zone context, suppression/de-duplication status, and evidence links.
- Report avoids alarm-routing claims and includes validation limitations.

**Tests required:**

- Timeline ordering tests.
- Event severity/filter tests.
- Evidence-link and limitation rendering tests.

**Risk level:** Medium

---

## workflow_orchestration

### [P0] Ticket WO-01 - Implement clinical task pipeline orchestrator

**Goal:** Connect v1 ingestion, segmentation, pose fixture backend, analyzers, evaluation hooks, and reporting.

**Files/directories likely touched or created:**

- `src/deepsynaps_video/orchestration.py`
- `src/deepsynaps_video/provenance.py`
- `src/deepsynaps_video/cli.py`
- `tests/test_orchestration.py`

**Dependencies:**

- Internal: VI-01/02/03/05, PME-01/02/03, CTA-01/02, DEA-01/02, CR-01.
- External: pytest; optional CLI helper package if used.

**Acceptance criteria:**

- `run_clinical_task_pipeline()` accepts a video asset or normalized video plus protocol/task segments and backend config.
- Pipeline returns `ClinicalVideoAnalysis` with bradykinesia/gait results, QC, report JSON, and provenance graph.
- Pipeline can run fully with fixture/noop pose backend in tests.
- CLI entry point can run a fixture analysis without real video dependencies.

**Tests required:**

- End-to-end fixture pipeline test.
- Failure-path tests for invalid segments, failed pose backend, and low QC.
- Provenance graph completeness test.

**Risk level:** High

---

### [P0] Ticket WO-02 - Add thin API facade for clinical task analysis

**Goal:** Expose v1 clinical pipeline through API contracts without placing processing logic in routes.

**Files/directories likely touched or created:**

- `src/deepsynaps_video/api.py`
- `portal_integration/api_contract.md`
- `tests/test_api_contract.py`

**Dependencies:**

- Internal: WO-01.
- External: FastAPI or existing DeepSynaps API framework.

**Acceptance criteria:**

- `POST /video/clinical/analyze` validates request and delegates to orchestration/job layer.
- `GET /video/clinical/{analysis_id}` returns result status and signed/reference artifact links.
- API routes are thin and contain no video-processing logic.
- API contract document includes request/response schemas and limitation language.

**Tests required:**

- Route/request validation tests.
- Mocked orchestrator tests.
- Contract snapshot tests.

**Risk level:** Medium

---

### [P0] Ticket WO-03 - Implement provenance graph and structured logging utilities

**Goal:** Make every v1 output auditable and traceable.

**Files/directories likely touched or created:**

- `src/deepsynaps_video/provenance.py`
- `src/deepsynaps_video/logging.py`
- `tests/test_provenance.py`
- `tests/test_logging.py`

**Dependencies:**

- Internal: VI-01 schemas.
- External: Python logging/structlog if already used; otherwise stdlib logging.

**Acceptance criteria:**

- `record_video_provenance()` records source asset, normalized asset, segments, backend runs, analyzer outputs, report generation, parameters, and reviewer edits when present.
- Structured logs include stable event names, IDs, backend versions, job/correlation IDs, and no PHI/secrets/raw frames.
- Provenance records serialize and link to outputs.

**Tests required:**

- Provenance completeness tests.
- Log redaction/sensitive-field tests.
- Serialization tests.

**Risk level:** Medium

---

### [P1] Ticket WO-04 - Add async worker/job status integration

**Goal:** Run longer clinical video analyses asynchronously.

**Files/directories likely touched or created:**

- `src/deepsynaps_video/worker.py`
- `src/deepsynaps_video/orchestration.py`
- `tests/test_worker.py`

**Dependencies:**

- Internal: WO-01, WO-03.
- External: existing queue/job framework or Celery/RQ equivalent.

**Acceptance criteria:**

- Worker can enqueue, run, retry, and report status for clinical task jobs.
- Job status includes provenance, error type, and user-safe failure messages.
- Default tests use mocked queue/backend.

**Tests required:**

- Mock worker success/failure/retry tests.
- Job status serialization tests.

**Risk level:** Medium

---

### [P2] Ticket WO-05 - Implement monitoring pipeline and stream runner

**Goal:** Orchestrate v2 room/bed monitoring analyzers for retrospective or stream input.

**Files/directories likely touched or created:**

- `src/deepsynaps_video/orchestration.py`
- `src/deepsynaps_video/worker.py`
- `src/deepsynaps_video/api.py`
- `tests/test_monitoring_pipeline.py`

**Dependencies:**

- Internal: MA-01 through MA-05, PME-05, CR-04, WO-03.
- External: optional RTSP/streaming and object detection dependencies.

**Acceptance criteria:**

- `run_monitoring_pipeline()` and `run_monitoring_stream()` emit event streams with provenance and evidence links.
- Event suppression/de-duplication and policy configuration are explicit.
- API endpoints register sessions and retrieve events without direct alarm routing.

**Tests required:**

- Mock stream event tests.
- Event de-duplication tests.
- API session/event retrieval tests.

**Risk level:** High

---

## Recommended execution order for P0 tickets

1. **VI-01 - Scaffold video pipeline package and core schemas**
2. **WO-03 - Implement provenance graph and structured logging utilities**
3. **VI-02 - Implement video asset creation and metadata probing**
4. **VI-03 - Implement normalization, frame indexing, and frame sampling**
5. **VI-05 - Implement task and room segmentation primitives** *(task segmentation is required for v1; room-zone pieces can remain minimal)*
6. **PME-01 - Define pose backend adapter interfaces and fixture backend**
7. **PME-02 - Implement core landmark motion primitives**
8. **PME-03 - Add task-level pose and signal QC**
9. **CTA-01 - Implement bradykinesia analyzers for structured tasks**
10. **CTA-02 - Implement initial gait task analyzer**
11. **DEA-01 - Add dataset manifest and fixture registry**
12. **DEA-02 - Implement pose quality and clinical feature evaluation**
13. **CR-01 - Build clinical task report schema and JSON renderer**
14. **WO-01 - Implement clinical task pipeline orchestrator**
15. **WO-02 - Add thin API facade for clinical task analysis**
