# DeepSynaps Video Analyzer — Function Table

Companion to `docs/VIDEO_ANALYZER.md`. The cells below name the public
function or API entry point that each agent implements, plus the upstream
project that inspired the design (we replicate, we do not vendor without an
explicit license check).

## 1. Ingestion & normalization

| Module | Function / API name | Purpose | Expected inputs | Expected outputs | Source of inspiration |
|--------|---------------------|---------|-----------------|------------------|------------------------|
| `io` | `ingest(IngestRequest, *, output_root)` | Download / open clip, probe metadata, default-on face blur, optional voice mute, transcode to normalized mp4, write frame index | `source_uri`, `analysis_id`, `consent_id`, `research_consent`, `voice_mute`, `target_fps`, `target_resolution` | `IngestResult { transcoded_uri, frame_index_uri, duration_s, fps, resolution, deid_applied[] }` | PosePipe (ingest layer); LookDeep (deid defaults) |
| `io` | `probe(source_uri)` | Read codec / fps / duration / resolution from a clip | `source_uri` | dict of probe metadata | ffmpeg / pyav |
| `io` | `face_blur(input, output)` | Per-frame face blur using mediapipe + ffmpeg | input + output paths | side-effect: blurred mp4 written | LookDeep (deid defaults) |

## 2. Pose & motion engine

| Module | Function / API name | Purpose | Expected inputs | Expected outputs | Source of inspiration |
|--------|---------------------|---------|-----------------|------------------|------------------------|
| `pose.engine` | `run_pose(PoseRequest)` | Pluggable HPE backend dispatch with cached intermediates | `clip_path`, `clip_id`, `backend`, `cache_root` | `PoseResult { keypoints_uri, n_frames, n_persons, keypoint_layout, fps, visibility }` | PosePipe / PosePipeline |
| `pose.engine` | `list_available_backends()` | Return the set of HPE backends installed in the current env | none | `list[PoseBackend]` | PosePipe |
| `pose.backends.mediapipe` | `run(clip_path)` | MediaPipe Pose / Holistic backend (CPU realtime, smartphone) | clip path | keypoint tensor + metadata | MediaPipe |
| `pose.backends.rtmpose` | `run_2d / run_3d` | RTMPose backends (server-side, MMPose) | clip path | keypoint tensor | MMPose |
| `pose.backends.vitpose` | `run` | ViTPose-3D / MotionBERT backend | clip path | keypoint tensor (3D) | ViTPose / MotionBERT |
| `pose.backends.openpose` | `run` | OpenPose backend (legacy / cross-validation) | clip path | keypoint tensor | OpenPose |
| `motion` | `smooth_track(track, *, window_s)` | Savitzky-Golay smoothing on each keypoint trajectory | `MotionTrack` | smoothed `MotionTrack` | classical signal processing |
| `motion` | `fill_gaps(track, *, max_gap_frames)` | Linear interpolation across short visibility gaps | `MotionTrack` | gap-filled `MotionTrack` | PosePipe |
| `motion` | `lift_to_world(track, *, height_m)` | Scale keypoints to world coords via anthropometric priors | `MotionTrack`, optional `height_m` | world-coord `MotionTrack` | classical biomechanics |
| `motion` | `compute_segment_angles(track)` | Populate elbow / knee / hip / shoulder / ankle angles | `MotionTrack` | `MotionTrack` with angle dict | gait analyzer family |

## 3. Clinical task analyzers

| Module | Function / API name | Purpose | Expected inputs | Expected outputs | Source of inspiration |
|--------|---------------------|---------|-----------------|------------------|------------------------|
| `tasks.segmenter` | `segment_operator(epochs)` | Validate operator-tagged epochs (no overlap, in-bounds) | `list[TaskEpoch]` | validated `list[TaskEpoch]` | VisionMD (operator-tag flow) |
| `tasks.segmenter` | `segment_auto(track)` | Auto-detect MDS-UPDRS task epochs from pose timeseries | `MotionTrack` | `list[TaskEpoch]` | VisionMD; MMAction2 |
| `tasks.gait` | `analyze_gait(track, *, epoch_s, side)` | Stride segmentation, spatiotemporal gait metrics, FoG flag | `MotionTrack`, `epoch_s`, `side` | `TaskResult (mds_updrs_3_10_gait)` | VIGMA / gaitXplorer / Mad-Lab gaitmap |
| `tasks.gait` | `detect_freezing(track)` | Moore-Bachlin freezing-of-gait spectral index | `MotionTrack` | `list[(start_s, end_s)]` | Bachlin et al. 2009 |
| `tasks.bradykinesia` | `analyze_bradykinesia(track, *, task_id, epoch_s, side)` | Finger tap / hand OC / pron-sup / leg agility / toe tap | `MotionTrack`, `task_id`, `epoch_s`, `side` | `TaskResult` with rate / amplitude / decrement / hesitation | VisionMD |
| `tasks.tremor` | `analyze_tremor(track, *, task_id, epoch_s, side)` | Spectral tremor metrics (rest, postural) | `MotionTrack`, `task_id`, `epoch_s`, `side` | `TaskResult (3.15 / 3.17)` | Elble & Deuschl 2011; VisionMD |
| `tasks.posture` | `analyze_posture(track, *, task_id, epoch_s, side)` | Sway, sit-to-stand, pull-test, trunk flexion | `MotionTrack`, `task_id`, `epoch_s`, `side` | `TaskResult (3.12 / 3.13 / TUG / 5xSTS)` | Tinetti / Bohannon norms |
| `tasks.facial` | `analyze_facial_battery(clip_path, *, task_id, epoch_s, side)` | Expression amplitude, asymmetry, blink rate, hypomimia | clip path, task_id, epoch_s, side | `TaskResult (facial_expression_battery)` | OpenFace; Bandini 2017 |

## 4. Continuous monitoring (v2, feature-flagged)

| Module | Function / API name | Purpose | Expected inputs | Expected outputs | Source of inspiration |
|--------|---------------------|---------|-----------------|------------------|------------------------|
| `monitoring.detector` | `detect_and_track(clip_path, *, weights, classes, tracker)` | YOLOv8/v9/v11 + ByteTrack person/bed/object detection + tracking | clip path, weights, class list, tracker name | `list[DetectionTrack]` | TeleICU YOLOv8 |
| `monitoring.zones` | `compute_transitions(track, *, zones, fps)` | Polygonal zone ingress/egress events | `DetectionTrack`, `list[ZonePolygon]`, fps | `list[ZoneTransition]` | LookDeep |
| `monitoring.bed_exit` | `detect_bed_exits(...)` | Bed-zone occupancy → exit transitions | `DetectionTrack`, bed zone, fps, threshold | `list[MonitoringEvent (bed_exit)]` | TeleICU; LookDeep |
| `monitoring.falls` | `detect_falls(track, *, ...)` | Pose-velocity + ground-plane + post-fall stillness | `MotionTrack`, thresholds | `list[MonitoringEvent (fall)]` | TeleICU; LookDeep |
| `monitoring.inactivity` | `detect_inactivity(track, *, ...)` | Sustained low-motion windows in patient zone | `MotionTrack`, thresholds | `list[MonitoringEvent (prolonged_inactivity)]` | LookDeep |
| `monitoring.interactions` | `detect_interactions(tracks, *, ...)` | Multi-person proximity → patient-staff interaction | `list[DetectionTrack]`, thresholds | `list[MonitoringEvent (staff_interaction)]` | LookDeep |

## 5. Scoring, longitudinal, overlay

| Module | Function / API name | Purpose | Expected inputs | Expected outputs | Source of inspiration |
|--------|---------------------|---------|-----------------|------------------|------------------------|
| `scoring` | `suggest_mds_updrs_score(task_id, metrics)` | Map continuous biomarkers to a 0–4 MDS-UPDRS score (decision support) | `task_id`, metrics dict | `SuggestedScore` with uncertainty | MDS-UPDRS Goetz 2008 |
| `longitudinal` | `build_trend(patient_id, *, current_analysis_id)` | Per-patient trend across visits | `patient_id`, current analysis_id | `LongitudinalTrend` | DeepSynaps qEEG/MRI longitudinal pattern |
| `overlay` | `render_overlay(deid_clip_uri, *, keypoints_uri, tasks, events, output_dir)` | Annotated mp4 + per-task plots + interactive HTML | deid clip URI, keypoint URI, tasks, events | `OverlayArtefacts` | VisionMD UI; gait analyzer UIs |

## 6. Dataset & error analysis

| Module | Function / API name | Purpose | Expected inputs | Expected outputs | Source of inspiration |
|--------|---------------------|---------|-----------------|------------------|------------------------|
| `dataset.manifest` | `write_manifest(rows, path)` / `load_manifest(path)` | Strict patient-level-split manifest IO | rows / path | parquet write / `list[ManifestRow]` | classical ML hygiene |
| `dataset.loaders` | `load_pd4t(root)` / `load_internal_clinic(root, *, clinic_id)` | Dataset loaders for public + internal labeled sets | dataset root | `list[ManifestRow]` | PD4T; clinic data |
| `dataset.error_analysis` | `evaluate(predictions, manifest)` | Slice metrics, confusion, bias audits | predictions + manifest | `list[SliceMetric]` | classical ML hygiene |
| `dataset.active_learning` | `sample_uncertainty / sample_disagreement` | Review-queue sampling | predictions + k | `list[clip_id]` | classical AL literature |
| `dataset.eval_runner` | `run_eval(manifest_path, *, bundle_id, output_path)` | One-shot evaluation → `eval_report.json` | manifest path, bundle id | dict (also written to disk) | classical ML hygiene |

## 7. Pipeline, report, API, CLI, DB

| Module | Function / API name | Purpose | Expected inputs | Expected outputs | Source of inspiration |
|--------|---------------------|---------|-----------------|------------------|------------------------|
| `pipeline` | `run_task(TaskRunRequest)` | End-to-end structured-task pipeline | `TaskRunRequest` | `VideoAnalysisReport` | DeepSynaps MRI/qEEG |
| `pipeline` | `run_monitor(MonitorRunRequest)` | End-to-end monitoring pipeline (v2) | `MonitorRunRequest` | `VideoAnalysisReport` | TeleICU; LookDeep |
| `report` | `render_report(VideoAnalysisReport)` | Jinja2 → HTML → weasyprint PDF | `VideoAnalysisReport` | `ReportArtefacts { html_uri, pdf_uri }` | DeepSynaps MRI/qEEG |
| `api` | `build_router()` | FastAPI router for `/api/video/...` | none | FastAPI router | DeepSynaps MRI/qEEG |
| `worker` | `queue_task_run / queue_monitor_run` | Celery task enqueue | payload dict | task_id | DeepSynaps MRI/qEEG |
| `cli` | `main(argv)` | `ds-video analyze | monitor | eval` | argv | exit code | DeepSynaps MRI/qEEG |
| `db` | `save_video_analysis(report)` / `bridge_to_medrag(report)` | Persist to Postgres + MedRAG bridge | `VideoAnalysisReport` | UUID / side-effect | DeepSynaps MRI/qEEG |

## MVP v1 vs v2

**v1 (neurology focus):**

- `io.ingest` (face-blur on; voice mute opt-in)
- `pose.engine.run_pose` with the MediaPipe + RTMPose backends
- `motion.*`
- `tasks.segmenter.segment_operator`
- `tasks.bradykinesia.analyze_bradykinesia` for `mds_updrs_3_4_finger_tap`
- `tasks.gait.analyze_gait` for `mds_updrs_3_10_gait`
- `tasks.tremor.analyze_tremor` for `mds_updrs_3_15` and `3_17`
- `tasks.posture.analyze_posture` for `timed_up_and_go` + `5xSTS`
- `tasks.facial.analyze_facial_battery` (basic)
- `scoring.suggest_mds_updrs_score`
- `overlay.render_overlay`
- `report.render_report`
- `db.save_video_analysis` + `bridge_to_medrag`
- `dataset.manifest` + `dataset.error_analysis` (foundational hygiene)

**v2 (continuous monitoring):**

- `monitoring.detector.detect_and_track` (YOLOv8/v9/v11)
- `monitoring.zones.compute_transitions`
- `monitoring.bed_exit.detect_bed_exits`
- `monitoring.falls.detect_falls`
- `monitoring.inactivity.detect_inactivity`
- `monitoring.interactions.detect_interactions`
- Real-time alert routing + per-customer go-live policy
- `tasks.segmenter.segment_auto` (auto task detection)
- Rehab-compliance task family
- Multi-camera fusion
- Video foundation-model embedding (256-d column)
- 510(k) submission for MDS-UPDRS Part III decision-support sub-module

## Recommended first 5 implementation tasks for agents

1. **Ingest + deid stub** (`io.ingest` real; ffmpeg subprocess, mediapipe face blur, frame-index parquet). Acceptance: round-trip a 90 s 1080p mp4 through ingest with face blur on and produce a normalized mp4 + frame index in < 30 s on CPU.
2. **Pose engine with MediaPipe backend** (`pose.engine.run_pose` real; `pose.backends.mediapipe.run` real; cache-aware). Acceptance: produce a parquet keypoint tensor for the same 90 s clip, deterministic across two runs (cache hit on the second).
3. **Bradykinesia finger-tap analyzer** (`tasks.bradykinesia.analyze_bradykinesia` for `mds_updrs_3_4_finger_tap`). Acceptance: tap rate within 0.2 Hz of a reference IMU on a 10-clip held-out set; suggested 0–4 score MAE ≤ 1.0 vs operator labels.
4. **Gait analyzer** (`tasks.gait.analyze_gait` for `mds_updrs_3_10_gait`, plus `detect_freezing`). Acceptance: cadence within 5 % of a reference walkway on the Hollman validation clips; FoG sensitivity ≥ 0.7 on PD4T-style holdout.
5. **Pipeline + DB + report** (`pipeline.run_task`, `db.save_video_analysis`, `report.render_report`). Acceptance: end-to-end run of the demo clip produces a valid `VideoAnalysisReport`, persists to `video_analyses`, and renders a PDF that matches the `sample_video_report.json` shape.
