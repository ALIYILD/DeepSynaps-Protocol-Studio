# DeepSynaps Video Analyzer - Agent Guide

## Scope

This guide applies to future Cursor agents working on the DeepSynaps Video Analyzer, especially code under:

```text
packages/video-pipeline/src/deepsynaps_video/
```

The scope is healthcare video analysis for patient use only:

- Clinical movement assessment from structured patient videos.
- Continuous patient monitoring from room, bed, or care-environment video.

This is not an MRI, fMRI, DTI, qEEG, or stimulation-targeting module. Do not import MRI-specific assumptions, neuroimaging coordinate systems, scanner workflows, or stimulation target logic into this package.

## Project purpose

DeepSynaps Video Analyzer turns patient video into clinician-reviewable observations, metrics, events, and reports.

Primary product lines:

1. **Clinical movement assessment from video**
   - Structured smartphone, webcam, tablet, or clinic-camera videos.
   - Gait, bradykinesia, tremor, posture, facial motor tasks, and rehabilitation movements.
   - Output transparent kinematic metrics, quality-control flags, longitudinal trends, and reviewable evidence segments.

2. **Continuous patient monitoring from video**
   - Fixed room, bedside, ward, ICU, or home monitoring streams.
   - Bed exit, falls, inactivity, wandering, room-zone occupancy, staff/patient interactions, and safety event timelines.
   - Output event records, confidence, timestamps, evidence links, and audit trails for human review.

Outputs are clinical decision-support observations. They are not autonomous diagnoses, official rating-scale scores, or automated alarm-routing decisions unless validated and explicitly governed elsewhere.

## Architecture principles

Keep the package modular and pipeline-oriented:

- `ingestion.py` / `normalization.py`: video source registration, metadata probing, transcoding, frame indexing, and source normalization.
- `privacy.py`: redaction, derived-only storage policies, and retention helpers.
- `segmentation.py`: subject selection, task boundaries, and room-zone definitions.
- `pose_engine/`: pose, hand, face, object, and tracking adapters.
- `motion.py` / `qc.py`: landmark smoothing, kinematic signals, movement cycles, spectra, and quality metrics.
- `analyzers/clinical/`: gait, bradykinesia, tremor, posture, facial, and rehab task analyzers.
- `analyzers/monitoring/`: bed exit, falls, inactivity, room zones, wandering, and interactions.
- `reporting.py`: clinical reports, event timelines, plots, evidence clips, and export tables.
- `longitudinal.py`: per-patient trends, repeat visits, therapy-state comparisons, and rehab progress.
- `orchestration.py` / `worker.py` / `cli.py`: batch, async, and streaming workflow entry points.
- `api.py`: thin HTTP facade only; keep video-processing logic outside API routes.
- `provenance.py`: source, model, parameter, artifact, reviewer, and report lineage.

Use a wrap-first, reimplement-second strategy:

- Prefer wrapping validated external video, pose, tracking, or task-analysis tools behind stable DeepSynaps adapters.
- Reimplement only when wrapping would create licensing, deployment, reliability, privacy, performance, or schema-control problems.
- Keep DeepSynaps-owned schemas, provenance, quality-control, reporting, safety language, and API contracts stable even if backend tools change.

Strong provenance and auditability are mandatory:

- Every result must be traceable to a video asset, time segment, task protocol, pose/detection backend, model version, algorithm version, parameters, and reviewer edits.
- Derived metrics should link back to original video or redacted evidence clips without requiring raw video to be retained forever.
- Keep patient privacy, consent state, and retention policy visible in schemas and pipeline outputs.

## Coding rules

- Use typed Python for public functions, class attributes, and schema fields.
- Prefer Pydantic models or dataclasses for metrics, events, provenance records, and report contracts.
- Keep modules small and testable. Split clinical analyzers, monitoring analyzers, adapters, and reporting into focused files.
- Do not use hidden global state for model instances, patient context, configuration, thresholds, or storage clients.
- Pass configuration explicitly through typed config objects or dependency-injected services.
- Keep pure feature computation separate from IO, storage, API routing, and UI concerns.
- Define clear schemas for:
  - video assets and normalized videos
  - task segments and room zones
  - pose, hand, face, and object tracks
  - kinematic signals and movement cycles
  - clinical metrics
  - monitoring events
  - QC results
  - provenance records
  - report outputs
- Include confidence, units, timestamps, time ranges, and quality/limitation fields wherever applicable.
- Use clinical terminology carefully. Name features descriptively, for example `finger_tap_amplitude_decrement`, not `parkinson_score`.

## Dependency rules

- Use pose-estimation and detection backends through adapters, PosePipe-style.
- Adapter interfaces should hide backend-specific model APIs while preserving backend identity, version, and confidence metadata.
- Keep heavy CV/ML dependencies in optional extras such as `[video]`, `[cv]`, `[pose]`, or backend-specific extras.
- Do not make base package installation require heavyweight GPU stacks, OpenMMLab, MediaPipe, YOLO, PyTorch, CUDA, FFmpeg wrappers, or streaming dependencies unless the project packaging explicitly makes them optional.
- Provide noop, fixture, or mock backends for tests and local development.
- Avoid hard-coding model weights, download URLs, credentials, or device-specific paths in code. Use config, environment variables, or documented setup scripts.
- Check licenses before wrapping external tools or copying code. Prefer adapter subprocess/API boundaries when license compatibility is uncertain.

## Testing rules

- Add pytest coverage for each new module.
- Every analyzer should have deterministic tests using synthetic landmarks, fixture tracks, or tiny generated videos.
- Use fixtures or mocks for video files, pose backends, object detectors, tracking models, storage clients, and report renderers.
- Do not require GPU, webcam, RTSP camera, cloud storage, or external model downloads for default tests.
- Test schema serialization and deserialization for metrics, events, QC, and provenance records.
- Test edge cases:
  - low frame rate
  - missing landmarks
  - occlusion
  - multiple people
  - task boundaries with no movement
  - noisy/jittery landmarks
  - out-of-frame body parts
  - invalid room-zone maps
- For monitoring analyzers, test event de-duplication, threshold behavior, timestamps, and evidence-link generation with mocked inputs.

## Logging and provenance

- Use structured logs with stable event names and fields.
- Include analysis IDs, video asset IDs, segment IDs, task IDs, backend names, model versions, and correlation/job IDs in logs.
- Never log PHI, raw frame payloads, signed URLs, access tokens, or full local paths containing patient identifiers.
- Emit per-video provenance records for:
  - source registration
  - metadata probing
  - normalization/transcoding
  - redaction
  - pose/detection/tracking backend runs
  - task or room-zone segmentation
  - clinical or monitoring analyzer runs
  - report generation
  - clinician edits or overrides
- Store derived metrics and events with links to original video assets, normalized proxies, redacted evidence clips, or frame/time ranges.
- Make retention and redaction policy explicit on video and derived assets.

## External tool wrapping

### VisionMD-like task analyzers

Wrap VisionMD-like workflows as clinical task analyzers, not as generic black boxes:

- Map subject selection to `select_primary_subject()`.
- Map task start/end labeling to `define_task_segments()`.
- Map landmark extraction to `pose_engine` adapters.
- Map movement signals to `motion.compute_distance_signal()` or task-specific signal builders.
- Map repetition start/peak/end detection to `motion.detect_movement_cycles()`.
- Map kinematic features to typed `BradykinesiaTaskResult`, `TremorAnalysisResult`, or related schemas.
- Preserve exported feature tables, units, confidence, task protocol, and source segment references.
- Do not claim official MDS-UPDRS scoring unless separately validated and approved.

### TeleICU-style detection and tracking models

Wrap TeleICU-style systems as monitoring analyzers and detection adapters:

- Map person, patient, staff, bed, chair, floor, equipment, and fall detections to typed detection tracks.
- Map room calibration and polygons to `RoomZoneMap`.
- Map movement/inactivity/fall/bed-exit heuristics to `MonitoringEvent` records with severity, confidence, timestamp, time range, and evidence links.
- Keep alert suppression, de-duplication, escalation policy, and event governance explicit.
- Treat live alerting as a governed integration layer, not as default analyzer behavior.
- Require local validation for each camera position, room type, patient population, and care setting before high-stakes use.

## DO NOT

- Do not bake clinical claims, diagnoses, official scale scores, or treatment recommendations into code.
- Do not put video-processing, pose-estimation, analyzer, or report-generation logic inside API routes or UI code.
- Do not add speculative features beyond the documented architecture without updating the spec and tests.
- Do not couple analyzers to one pose backend, model checkpoint, cloud service, or camera vendor.
- Do not persist raw video by default when derived landmarks, metrics, redacted clips, or time-linked references are sufficient.
- Do not log PHI, secrets, raw frames, or sensitive signed URLs.
- Do not silently swallow low-quality video, missing landmarks, or failed model runs. Return explicit QC and limitations.
- Do not make monitoring alerts page staff or trigger clinical workflows without validation, configuration, and governance.
- Do not import MRI-specific concepts or dependencies into this package.

## How future agents should use this file

Before editing `packages/video-pipeline/src/deepsynaps_video` or related video-pipeline docs/tests, read this file and align your implementation with these constraints. If a task conflicts with this guide, update the architecture/spec first or call out the conflict clearly in your change summary.
