# 4-Phase Implementation Plan — Video/Movement Analyzer

## Wave 1 (Parallel) — Core Pipelines

### P1A: MediaPipe Backend (Phase 1)
- Install mediapipe package
- Implement live pose estimation in video_pose_backend.py
- Wire to router: upload → extract frames → pose → store
- Support both video files and webcam frames

### P1B: Gait Pipeline (Phase 2)
- Stride length, cadence, step time, variability
- Dual-task gait cost
- Arm swing amplitude
- Asymmetry index
- Consume pose sequence → gait metrics

### P1C: Tremor Pipeline (Phase 2)
- 4-6 Hz band power (PD) vs 8-12 Hz (ET)
- Amplitude estimation
- Frequency peak detection
- Contactless tremor quantification

### P1D: Finger Tapping Pipeline (Phase 2)
- Tapping speed (taps/10s)
- Amplitude decay
- Rhythm variability (CV of ISI)
- Bradykinesia proxy metrics

### P1E: Posture Pipeline (Phase 2)
- Postural sway area
- Romberg proxy (eyes open vs closed)
- Center of mass trajectory
- Balance confidence score

### P1F: Regulatory Docs (Phase 4)
- FDA SaMD classification document
- Bias testing protocol
- Explainability requirements doc
- Clinical validation plan

## Wave 2 (Parallel) — Frontend + Integration

### P2A: Skeleton Overlay Frontend (Phase 1)
- Canvas-based skeleton rendering on video
- Keypoint confidence visualization
- Real-time pose overlay for webcam
- Playback with skeleton animation

### P2B: Multimodal Fusion (Phase 3)
- Video+voice correlation endpoint
- Video → biomarker dashboard data flow
- Risk analyzer integration (fall risk)
- Longitudinal progression tracking

### P2C: Cross-Page Integration (Phase 3)
- Virtual Care session → video analysis
- Protocol Studio ← movement findings
- Assessments V2 ← video task results
- Reports ← video findings export

### P2D: Bias + Explainability (Phase 4)
- Demographic bias testing framework
- Confidence attribution per keypoint
- Movement feature explainability
- SHAP-style importance scoring

## Pose Sequence Contract (shared by all agents)

```json
{
  "backend": "mediapipe",
  "version": "0.10.0",
  "frames": [
    {
      "frame_idx": 0,
      "timestamp_ms": 0.0,
      "keypoints": [
        {"id": "nose", "x": 0.5, "y": 0.3, "z": 0.0, "confidence": 0.97, "visibility": 0.95},
        {"id": "left_shoulder", "x": 0.4, "y": 0.5, "z": 0.0, "confidence": 0.98, "visibility": 0.96}
      ],
      "confidence": 0.92
    }
  ],
  "summary": {"total_frames": 100, "fps": 30, "duration_ms": 3333, "avg_confidence": 0.91}
}
```

33 keypoints: nose(0), left_eye_inner(1), left_eye(2), left_eye_outer(3),
right_eye_inner(4), right_eye(5), right_eye_outer(6), left_ear(7), right_ear(8),
mouth_left(9), mouth_right(10), left_shoulder(11), right_shoulder(12),
left_elbow(13), right_elbow(14), left_wrist(15), right_wrist(16),
left_pinky(17), right_pinky(18), left_index(19), right_index(20),
left_thumb(21), right_thumb(22), left_hip(23), right_hip(24),
left_knee(25), right_knee(26), left_ankle(27), right_ankle(28),
left_heel(29), right_heel(30), left_foot_index(31), right_foot_index(32)
