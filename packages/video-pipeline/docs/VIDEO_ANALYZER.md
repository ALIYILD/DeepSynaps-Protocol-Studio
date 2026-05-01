# DeepSynaps Video Analyzer — Full Specification

**Module:** `deepsynaps_video_analyzer`
**Dashboard page:** Video Analyzer (sidebar: **Movement & Behavior → Video**)
**Status:** Scaffold + spec (v0.1.0)
**Sibling modules:** `deepsynaps_mri_analyzer/`, `deepsynaps_qeeg_analyzer/`, `deepsynaps_db/`
**Companion:** `docs/FUNCTION_TABLE.md` is the authoritative function table that agents pick up tasks from.

---

## 0. Executive summary

The Video Analyzer is the third clinical-modality sibling in DeepSynaps Studio (alongside MRI and qEEG). It accepts two kinds of input and produces one kind of output:

- **Inputs.**
  - *Clinical task videos* — smartphone or clinic camera, often patient-self-recorded — covering the MDS-UPDRS Part III motor exam (gait, tremor, bradykinesia, posture, facial-motor) plus standard scales (TUG, 5xSTS, Tinetti).
  - *Room / bed monitoring videos* — clinic, ICU, or home camera streams — for bed-exit, falls, prolonged inactivity, out-of-zone wandering, patient-staff interactions.
- **Output.** A single MedRAG-compatible JSON `VideoAnalysisReport` plus an annotated overlay video, per-task plots, and a clinician-ready PDF/HTML report. Every numeric output ships with a normative z-score (where a cohort is published) and at least one citation from the shared 87k-paper DB.
- **v1 scope (neurology decision-support).** Operator-tagged structured tasks → pose → per-task analyzers → suggested 0–4 scores with explicit uncertainty → report. Continuous monitoring is a v2 add-on, feature-flagged behind `settings.monitoring_enabled` and gated on a per-customer go-live review.
- **Architecture.** Pluggable HPE backends (MediaPipe / RTMPose / ViTPose / OpenPose) behind a cache-aware engine inspired by PosePipe; per-task analyzers inspired by VisionMD; gait metrics inspired by VIGMA / gait-analyzer family; YOLOv8-class detection + ByteTrack tracking for monitoring inspired by TeleICU; review-workflow + event taxonomy inspired by LookDeep-style continuous monitoring. We **replicate** designs and cite the originals.
- **Privacy posture.** Default-on face blur on every artefact that leaves the secure zone, opt-in voice mute, 24 h hot-storage retention for raw video, full audit trail on every PHI access. Continuous monitoring streams require explicit per-camera consent rows.

The rest of this document is the authoritative spec; the function table that agents implement against lives in `docs/FUNCTION_TABLE.md`.

---

## 1. Purpose

Clinicians (or care-team operators) submit video — either a **structured clinical task** (e.g. an MDS-UPDRS finger-tap task, a 10-meter gait walk, a facial-expression task, a rehab exercise) or a **continuous monitoring feed** (room camera over a hospital bed, an ICU bay, a home-monitoring camera). The portal returns:

1. A **structured movement biomarker report** — gait metrics (cadence, stride length, step variability, double-support time), tremor (frequency, amplitude, asymmetry), bradykinesia (tap rate, decrement, hesitations), postural sway, facial-motor metrics (asymmetry, blink rate, expression amplitude), with normative z-scores and condition priors.
2. **Per-task scores** — automated MDS-UPDRS Part III item suggestions, Tinetti / Berg-Balance proxies, FAB facial scoring proxies, with explicit "decision-support, not diagnosis" caveats.
3. **Continuous monitoring events** — bed-exit, fall, prolonged inactivity, wandering / out-of-zone, patient-staff interactions, restraint compliance, with timestamps and clip provenance.
4. **Annotated overlay videos** — pose skeleton + zone polygons + event markers, downsampled and face-blurred for review.
5. **MedRAG evidence chain** — cited measurement protocols and validation papers from the shared 87k-paper DB, retrieved via the hypergraph layer (`kg_hyperedges`) with new `movement_biomarker_for` and `monitoring_event_for` relations.
6. **PDF + HTML report** — clinician-ready, with longitudinal trend lines for repeated visits.

The module is designed to **drop into the existing DeepSynaps Studio clinical dashboard** as a sibling to the MRI and qEEG analyzers, sharing the same Postgres DB, MedRAG layer, user accounts, and S3 storage.

---

## 2. Scope — Tiers 1 – 4

| Tier | Use case                          | What we produce                                                                                                                     | v1.0? |
|------|-----------------------------------|-------------------------------------------------------------------------------------------------------------------------------------|-------|
| 1    | **Clinical task — gait**          | 2D/3D pose timeseries, gait events (heel-strike / toe-off), spatiotemporal gait metrics, asymmetry, freezing-of-gait flags          | ✅    |
| 1    | **Clinical task — bradykinesia**  | Finger-tap, hand open-close, pronation-supination, leg-agility — rate, amplitude, decrement, hesitation, MDS-UPDRS-style 0–4 score  | ✅    |
| 2    | **Clinical task — tremor**        | Spectral analysis of joint trajectories (rest, postural, kinetic), peak frequency, amplitude, dominant body part, asymmetry         | ✅    |
| 2    | **Clinical task — posture**       | Sway envelope from pose + center-of-mass proxy, pull-test outcome estimation, sit-to-stand time                                     | ✅    |
| 2    | **Clinical task — facial motor**  | Facial landmark-based expression amplitude, asymmetry index, blink rate, hypomimia score                                            | ✅    |
| 3    | **Continuous monitoring — safety**| Bed-exit detection, fall detection (impact + post-fall stillness), prolonged inactivity, out-of-zone wandering                      | ❌ v2 |
| 3    | **Continuous monitoring — care**  | Patient-staff interaction logging, hand-hygiene events, restraint-presence inference, sedation-level proxies                        | ❌ v2 |
| 4    | **Rehab compliance**              | Repetition counting, range-of-motion estimation against a prescribed exercise template, adherence streaks                           | ❌ v2 |
| 5    | **Multimodal fusion**             | Co-register video metrics with qEEG/MRI biomarkers via `deepsynaps_db` for joint reporting                                          | ❌ v2 |

---

## 3. Pipeline

```
  Video upload (mp4/mov/webm) or RTSP/WebRTC stream
       │
       ▼
  io.py                          [ingest, deid (face/voice blur if requested), transcode, frame index]
       │
       ├──► pose/engine.py       [HPE backend dispatch: MediaPipe (CPU realtime),
       │                          MMPose / RTMPose (server), ViTPose (3D), HRNet, OpenPose]
       │
       ├──► motion.py            [smoothing, gap fill, world-coord lift, segment angles, COM proxy]
       │
       ├──► tasks/segmenter.py   [structured-task auto-detection or operator-tagged epochs]
       │
       │ ┌──► tasks/gait.py            [stride segmentation, spatiotemporal metrics, FoG flag]
       │ ├──► tasks/bradykinesia.py    [finger-tap, hand OC, pron-sup, leg-agility]
       │ ├──► tasks/tremor.py          [spectral analysis, amplitude/freq/asymmetry]
       │ ├──► tasks/posture.py         [sway, sit-to-stand, pull-test estimate]
       │ └──► tasks/facial.py          [facial landmark engine, asymmetry, blink, hypomimia]
       │
       ├──► monitoring/detector.py     [person/object/bed/staff detection — YOLO family]
       │ ├──► monitoring/zones.py      [room-zone polygons, ingress/egress events]
       │ ├──► monitoring/bed_exit.py   [bed occupancy → exit transitions]
       │ ├──► monitoring/falls.py      [pose-derived fall heuristic + post-fall stillness]
       │ ├──► monitoring/inactivity.py [low-motion windows, ROI dwell time]
       │ └──► monitoring/interactions.py [multi-person proximity + role inference]
       │
       ├──► dataset/error_analysis.py  [confusion + slice analysis on labeled clips]
       │
       ▼
  scoring.py                     [task → continuous biomarkers → suggested clinical scale items]
       │
       ▼
  longitudinal.py                [per-patient trend across visits; mixed-effects ready]
       │
       ▼
  overlay.py                     [skeleton + zones + events overlay → mp4 + HTML player]
       │
       ▼
  db.py                          [INSERT video_analyses row; bridge to MedRAG kg_entities]
       │
       ▼
  MedRAG retrieval               [evidence chain from 87k papers per metric / event]
       │
       ▼
  report.py                      [Jinja2 → HTML → weasyprint PDF]
       │
       ▼
  api.py returns JSON + signed S3 URLs
```

---

## 4. Stack — library choices and rationale

| Task                              | Primary                                | Fallback                       | Why |
|-----------------------------------|----------------------------------------|--------------------------------|-----|
| Video transcode / frame I/O       | `ffmpeg` subprocess + `pyav`           | `opencv-python`                | ffmpeg is the only thing that handles every clinic camera codec; pyav exposes precise PTS/keyframe control we need for event clips. |
| Face blur / voice mute (deid)     | `mediapipe` face detector + `ffmpeg`   | `retinaface` + manual mask     | Default-on for any clip leaving the secure zone. Tunable per-clinic. |
| 2D pose (real-time, on-device)    | **MediaPipe Pose / Holistic**          | `RTMPose` lite                 | MediaPipe runs in a phone or laptop browser — essential for the patient self-capture flow used by VisionMD. |
| 2D pose (server, high accuracy)   | **MMPose (RTMPose / HRNet)**           | `OpenPose`                     | RTMPose is the current SOTA on COCO + AIST and ships well-supported PyTorch weights. |
| 3D pose (research / gait)         | **ViTPose-3D / MotionBERT**            | `MediaPipe World Landmarks`    | Required for cadence/stride asymmetry and tremor amplitude in metric units. |
| Facial landmarks                  | `mediapipe FaceMesh` (468 pts) + `dlib`| `OpenFace 2.x`                 | OpenFace adds AU intensities (validated for hypomimia). |
| Person / bed / object detection   | **YOLOv8 / YOLOv9 / YOLOv11**          | `Detectron2`                   | YOLOv8-class models drive the existing TeleICU / LookDeep-style stacks; ~30 fps on a single GPU. |
| Multi-object tracking             | `ByteTrack` / `BoT-SORT`               | `DeepSORT`                     | Needed to keep "the patient" stable across long monitoring clips without re-IDing staff as patient. |
| Action / activity recognition     | `MMAction2` (SlowFast, VideoMAE-v2)    | rule-based on pose             | For interaction classes and sedation-level proxies. |
| Gait segmentation / metrics       | `gaitmap` (Mad-Lab) inspired heuristics| custom                         | Wraps an event-based step segmentation similar to the gait analyzer / VIGMA family. |
| Spectral analysis (tremor)        | `scipy.signal` + `numpy`               | `pyts`                         | Welch + multitaper PSD on smoothed joint trajectories. |
| Storage / streaming               | S3 + signed URLs; HLS for review       | local filesystem               | Same pattern as MRI/qEEG. |
| Report                            | Jinja2 + weasyprint                    | —                              | Matches MRI/qEEG analyzer stack. |

---

## 5. Movement biomarker atlas — the clinical heart of the module

The file `src/deepsynaps_video/constants.py` contains the curated task atlas. Every entry is evidence-anchored to a peer-reviewed protocol or instrument.

### 5.1 Structured task taxonomy (subset of MDS-UPDRS Part III)

| Task ID                  | Body part(s)            | Primary biomarkers                                             | Reference instrument |
|--------------------------|-------------------------|----------------------------------------------------------------|----------------------|
| `mds_updrs_3_4_finger_tap`     | Index + thumb     | tap rate, amplitude, decrement, hesitations, asymmetry         | MDS-UPDRS 3.4        |
| `mds_updrs_3_5_hand_open_close`| Wrist + fingers   | cycle rate, amplitude decrement                                | MDS-UPDRS 3.5        |
| `mds_updrs_3_6_pronation_sup`  | Forearm           | cycle rate, amplitude, regularity                              | MDS-UPDRS 3.6        |
| `mds_updrs_3_7_toe_tap`        | Ankle + toe       | tap rate, amplitude decrement                                  | MDS-UPDRS 3.7        |
| `mds_updrs_3_8_leg_agility`    | Hip + knee        | cycle rate, amplitude                                          | MDS-UPDRS 3.8        |
| `mds_updrs_3_10_gait`          | Whole body        | cadence, stride, asymmetry, FoG flag, turn-time                | MDS-UPDRS 3.10       |
| `mds_updrs_3_11_freezing`      | Lower limbs       | freezing episode count + duration                              | MDS-UPDRS 3.11       |
| `mds_updrs_3_12_postural_stab` | Pull-test         | recovery steps, fall-likelihood proxy                          | MDS-UPDRS 3.12       |
| `mds_updrs_3_13_posture`       | Trunk             | flexion angles                                                 | MDS-UPDRS 3.13       |
| `mds_updrs_3_15_tremor_postural` | Hands           | dominant frequency (Hz), amplitude (mm), asymmetry             | MDS-UPDRS 3.15       |
| `mds_updrs_3_17_tremor_rest`   | Hands / chin      | dominant frequency, amplitude, asymmetry                       | MDS-UPDRS 3.17       |
| `tinetti_pom`                  | Whole body        | composite gait/balance proxy                                   | Tinetti POMA         |
| `timed_up_and_go`              | Whole body        | total time, sit-to-stand time, turn time                       | TUG                  |
| `sit_to_stand_5x`              | Whole body        | total time, asymmetry                                          | 5xSTS                |
| `facial_expression_battery`    | Face              | expression amplitude, asymmetry index, blink rate, hypomimia   | UPDRS 3.2 + FAB      |

Each entry ships with at least 2 DOIs from the 87k-paper DB — measurement protocol + a validation paper for video-based proxies.

### 5.2 Continuous monitoring event taxonomy

| Event ID            | Trigger                                                                  | Notification policy | v1.0? |
|---------------------|--------------------------------------------------------------------------|---------------------|-------|
| `bed_exit`          | Patient bbox center leaves bed-zone polygon for > N frames               | Real-time push      | v2    |
| `fall`              | Pose-velocity spike + ground-plane proximity + post-event stillness       | Real-time push      | v2    |
| `prolonged_inactivity` | No keypoint motion above ε for > T minutes                            | Periodic digest     | v2    |
| `out_of_zone`       | Patient bbox enters restricted zone (door, hallway)                      | Real-time push      | v2    |
| `staff_interaction` | ≥2 tracked persons within proximity ε for > T seconds                    | Periodic digest     | v2    |
| `restraint_presence`| Object detector hits a restraint class with confidence > τ               | Audit log           | v2    |
| `agitation_spike`   | High-amplitude motion sustained over a window, in patient-zone only      | Real-time push      | v2    |

Every event is stored with: `(camera_id, timestamp_range, clip_s3_uri, score, model_version, reviewer_state)`.

### 5.3 Gait metric definitions

| Metric                 | Definition                                                                              | Source of inspiration            |
|------------------------|-----------------------------------------------------------------------------------------|----------------------------------|
| `cadence_steps_per_min`| Steps detected per minute over the level-walking epoch                                  | Mad-Lab `gaitmap`, VIGMA         |
| `stride_length_m`      | Heel-strike to next-ipsilateral heel-strike, lifted to world coords via 3D pose         | gait analyzer family             |
| `step_time_asymmetry`  | abs(L_step_time − R_step_time) / mean                                                    | classical gait literature        |
| `double_support_pct`   | % of cycle with both feet on the ground                                                 | classical gait literature        |
| `step_variability_cv`  | Coefficient of variation of step time                                                   | classical gait literature        |
| `freezing_index`       | Power ratio in the 3–8 Hz band over 0.5–3 Hz band, on shank-segment vertical motion     | Moore-Bachlin freezing index     |
| `turn_time_s`          | Time to complete a 180° turn in TUG                                                     | TUG / iTUG protocols             |
| `arm_swing_amplitude`  | Wrist trajectory amplitude, normalized by limb length, asymmetric flag                  | classical gait literature        |

---

## 6. Movement biomarkers — normative z-scores

| Biomarker bucket                 | Reference cohort               | Notes |
|----------------------------------|--------------------------------|-------|
| Cadence / stride                 | Hollman et al. 2011 norms (N≈300 healthy adults) | Age + height adjusted |
| Tremor frequency / amplitude     | Elble & Deuschl 2011 reference | Distinguishes essential vs Parkinsonian profiles |
| Bradykinesia tap-rate decrement  | Goetz et al. 2008 (MDS-UPDRS validation)         | Used for the 0–4 anchor scoring |
| Sit-to-stand / TUG               | Bohannon 2006 (5xSTS), Bohannon 1995 (TUG)        | Age-banded |
| Facial expression / hypomimia    | Bandini et al. 2017 (FACS-PD)  | Per-AU intensity z-score |
| Postural sway envelope           | Maki & McIlroy 1996            | Eyes-open standing reference |

All z-scores are computed from age + sex + height-adjusted normative curves where available; otherwise the report shows raw values with a "no normative cohort" warning.

---

## 7. Output JSON contract (MedRAG-compatible)

```jsonc
{
  "analysis_id": "uuid",
  "patient": { "age": 68, "sex": "M", "handedness": "R", "height_m": 1.78 },
  "capture": {
    "source": "smartphone | clinic_camera | rtsp",
    "fps": 30,
    "duration_s": 92.4,
    "resolution": [1920, 1080],
    "consent_id": "uuid"
  },
  "modalities_present": ["task_video", "facial_video"],
  "pose_engine": "rtmpose-l-2d-server",   // or "mediapipe-pose-cpu"
  "qc": {
    "mean_keypoint_visibility": 0.94,
    "frame_drop_pct": 0.7,
    "ambient_lux_estimate": 280,
    "occlusion_flags": []
  },
  "tasks": [
    {
      "task_id": "mds_updrs_3_4_finger_tap",
      "epoch_s": [12.0, 27.0],
      "side": "right",
      "metrics": {
        "tap_rate_hz":       { "value": 2.6,  "z": -1.4 },
        "amplitude_norm":    { "value": 0.31, "z": -1.7 },
        "decrement_pct":     { "value": 18.2, "z": -2.1 },
        "hesitation_count":  { "value": 3 }
      },
      "suggested_score_0_4": { "value": 2, "uncertainty": 0.4 },
      "method_reference_dois": ["10.1002/mds.22340"]
    },
    {
      "task_id": "mds_updrs_3_10_gait",
      "epoch_s": [40.0, 78.0],
      "metrics": {
        "cadence_steps_per_min": { "value": 96.1, "z": -1.2 },
        "stride_length_m":       { "value": 1.05, "z": -1.6 },
        "step_time_asymmetry":   { "value": 0.09, "z":  1.1 },
        "double_support_pct":    { "value": 28.4, "z":  1.4 },
        "freezing_index":        { "value": 0.38, "z":  0.6 },
        "turn_time_s":           { "value": 4.1,  "z":  1.8 }
      },
      "suggested_score_0_4": { "value": 1, "uncertainty": 0.5 }
    },
    {
      "task_id": "mds_updrs_3_17_tremor_rest",
      "epoch_s": [80.0, 92.0],
      "metrics": {
        "dominant_freq_hz":  { "value": 5.2, "z": 1.6 },
        "amplitude_mm":      { "value": 4.8, "z": 2.2 },
        "asymmetry_index":   { "value": 0.41 }
      }
    }
  ],
  "monitoring_events": [],
  "longitudinal": {
    "prior_visit_ids": ["uuid-prev-1", "uuid-prev-2"],
    "trend": {
      "cadence_steps_per_min": [98.7, 97.2, 96.1],
      "tap_rate_hz_right":     [3.1, 2.9, 2.6]
    }
  },
  "medrag_query": {
    "findings": [
      { "type": "movement_biomarker", "value": "cadence_low", "zscore": -1.2 },
      { "type": "movement_biomarker", "value": "bradykinesia_decrement", "zscore": -2.1 },
      { "type": "movement_biomarker", "value": "tremor_rest_4_6hz", "zscore": 1.6 },
      { "type": "condition_prior", "value": "parkinsons_disease" }
    ]
  }
}
```

This JSON is consumed by `deepsynaps_qeeg_analyzer/medrag/src/retrieval.py` — the same `MedRAG.retrieve()` call path as the qEEG and MRI pipelines. The Video Analyzer adds two new finding types: `movement_biomarker` and `monitoring_event`.

---

## 8. MedRAG extensions

The Video module adds these to the existing hypergraph schema:

### New entity types in `kg_entities`
- `movement_biomarker` — e.g. `tap_rate_decrement`, `cadence_low`, `tremor_rest_4_6hz`, `hypomimia`
- `monitoring_event`   — e.g. `bed_exit`, `fall`, `prolonged_inactivity`

### New relations in `kg_relations`
- `movement_biomarker_for` — (condition, movement_biomarker) — e.g. PD ⟷ tap_rate_decrement
- `task_validates_biomarker` — (task_id, movement_biomarker, validation_DOI)
- `monitoring_event_for`   — (clinical_setting, monitoring_event, action_protocol)
- `video_proxy_of`         — (movement_biomarker, gold_standard_metric, agreement_metric)

### Migration
`medrag_extensions/06_migration_video.sql` adds:
- `video_analyses` table (mirrors `mri_analyses` shape; UUID PK, JSONB `tasks`, `monitoring_events`, `longitudinal`; `embedding vector(256)` for an eventual video foundation-model embedding)
- `video_clips` table — tracks every clip artefact with retention policy + face-blur status
- New row types in `kg_entities`
- New relations in `kg_relations`

Seed via `medrag_extensions/07_seed_video_entities.py`.

---

## 9. Annotated overlay rendering

`overlay.py` produces three artefacts per analysis:

1. **Annotated MP4** — pose skeleton (color-coded by uncertainty), task epoch banners, event markers; face is automatically blurred unless an explicit "research consent" flag is set.
2. **Trajectory plots** — per-task small-multiples (e.g. tap angle vs time, vertical heel position vs time, tremor PSD), saved as PNG and embedded in the report.
3. **Interactive HTML player** — HLS or fragmented MP4 with a sidecar JSON of timestamped events, plus a Plotly timeline.

For each task or event, the legend includes:
- Task / event ID and clinical instrument it maps to
- Numeric value + normative z-score (if available)
- Evidence chain summary (paper IDs + 1-line provenance)

---

## 10. Dashboard integration — the Video Analyzer page

### Sidebar location
`Movement & Behavior → Video Analyzer` (sibling to `Neuroimaging → MRI Analyzer` and `Neuroimaging → qEEG Analyzer`).

### Page layout
```
┌──────────────────────────────────────────────────────────────────────────┐
│ Upload / Stream panel    │ Patient info + consent + capture context       │
│ (mp4/mov, RTSP url,      │ (lighting, camera distance, instructed task)   │
│  smartphone QR-link)     │                                                │
├──────────────────────────────────────────────────────────────────────────┤
│ QC panel                 │ keypoint visibility, frame drops, occlusion    │
├──────────────────────────────────────────────────────────────────────────┤
│ Tasks tab │ Monitoring tab │ Longitudinal tab │ Dataset / Errors │ Report │
└──────────────────────────────────────────────────────────────────────────┘

Tasks tab (the money shot):
 ┌──────────────────────────────────────┬───────────────────────────────────┐
 │ Annotated video player               │ Task list (scrollable):           │
 │ (skeleton + zone + epoch markers)    │ ● Finger tap — right              │
 │                                      │   tap rate 2.6 Hz  z = -1.4       │
 │                                      │   suggested score: 2 (low conf.)  │
 │                                      │   ▸ 3 cited protocols             │
 │                                      │ ● Gait — 10 m walk                │
 │                                      │ ● Rest tremor                     │
 └──────────────────────────────────────┴───────────────────────────────────┘
 ┌──────────────────────────────────────────────────────────────────────────┐
 │ MedRAG evidence for selected task                                        │
 │ [paper #54321] Video-based MDS-UPDRS finger-tap (Lu et al. 2021)         │
 │   └─ task_validates_biomarker: tap_rate_decrement (agreement κ=0.71)     │
 │   doi: 10.1002/... → [Open PDF]                                          │
 └──────────────────────────────────────────────────────────────────────────┘
```

### API endpoints (FastAPI)
- `POST /api/video/upload` — multipart mp4/mov OR JSON `{rtsp_url}` for stream registration; returns `analysis_id`
- `POST /api/video/{analysis_id}/tag` — operator marks task epochs (start_s, end_s, task_id, side)
- `GET  /api/video/{analysis_id}` — poll status
- `GET  /api/video/{analysis_id}/report.json` — full report
- `GET  /api/video/{analysis_id}/report.pdf` — signed S3 URL
- `GET  /api/video/{analysis_id}/overlay.mp4` — annotated overlay (face-blurred unless flagged)
- `GET  /api/video/{analysis_id}/clip/{event_id}.mp4` — per-event clip
- `GET  /api/video/{analysis_id}/evidence/{task_id}` — MedRAG chain
- `GET  /api/video/patient/{patient_id}/longitudinal` — visit-over-visit trend

See `portal_integration/api_contract.md` for full schemas.

---

## 11. Reference-project mapping (what we copy / wrap)

| Reference project | What it gives us | DeepSynaps Video module(s) it maps to | Copy / wrap / replicate |
|-------------------|------------------|---------------------------------------|--------------------------|
| **VisionMD** — open-source video analysis for MDS-UPDRS Part III tasks (Parkinson's) | task taxonomy aligned with MDS-UPDRS Part III, smartphone-friendly capture flow, per-task feature extractors (finger-tap rate, hand open-close, leg-agility, gait), 0–4 score suggestions | `tasks/segmenter.py`, `tasks/bradykinesia.py`, `tasks/gait.py`, `scoring.py`, `constants.py` (task atlas) | **Wrap + replicate task definitions.** Mirror the task IDs and feature names, keep our own implementation so we own the IP and the licensing path. License-check before vendoring any code. |
| **PosePipe / PosePipeline** — pipeline for HPE on home/clinic videos with multiple HPE backends and a DataJoint-style schema | A clean abstraction for "ingest video → run pose backend → cache outputs → downstream analytics", with backend swap (MediaPipe / OpenPose / MMPose / ViTPose) | `pose/engine.py`, `pose/backends/*`, `io.py`, `dataset/manifest.py` | **Copy the architectural pattern** of pluggable HPE backends and cached intermediates; do not depend on DataJoint. Re-implement on top of our Postgres + S3 stack. |
| **VIGMA / gaitXplorer / open gait analyzers** — visual gait/motion analytics frameworks with stride segmentation and clinician-facing visualizations | gait event segmentation logic (heel-strike / toe-off), spatiotemporal metrics, freezing-of-gait flags, clinician UI patterns for stride small-multiples | `tasks/gait.py`, `motion.py`, `overlay.py`, dashboard "Gait" subtab | **Replicate algorithms with citations.** Implement Moore-Bachlin freezing index and standard heel-strike segmentation in our own code; borrow UI ideas for the gait subtab. |
| **TeleICU YOLOv8 monitoring** — patient/staff/object detection on ICU video feeds with movement classification | YOLOv8 person + bed + medical-equipment detection, multi-object tracking, real-time monitoring loop | `monitoring/detector.py`, `monitoring/zones.py`, `monitoring/bed_exit.py`, `monitoring/falls.py` | **Wrap the detector stack.** Adopt YOLOv8/v9/v11 weights via Ultralytics with our model registry, build our own event logic on top so we control alert policy, retention and audit. |
| **LookDeep-style continuous monitoring** — production patient-behavior monitoring from in-room cameras (interactions, agitation, fall risk, hand hygiene), with alert routing and clinician-facing review | event taxonomy (bed exit, fall, agitation, interaction), face-blurred clip review workflow, alert routing policy | `monitoring/interactions.py`, `monitoring/inactivity.py`, `monitoring/falls.py`, `clip review UI`, `db.py` (event store + audit) | **Replicate event taxonomy and review workflow.** Treat as a product blueprint; build our own detectors and alert policy. Keep all PHI handling explicit in `io.py` (face/voice blur, retention windows). |

For each reference, our default is **replicate the design and cite the paper or repo**, not copy the code, unless a license clearly permits it. Vendored code lives under `third_party/` with the upstream license file preserved.

---

## 12. Dataset & error analysis

`dataset/` is a first-class module — video models drift hard across cameras, lighting, and patient phenotypes, so we treat dataset/error analysis as a permanent surface, not a one-off notebook.

| File                           | Purpose |
|--------------------------------|---------|
| `dataset/manifest.py`          | Manifest schema for labeled clips: `(clip_id, task_id, side, ground_truth_score, capture_context, splits)` |
| `dataset/loaders.py`           | Loaders for public datasets (PD4T, Kinetics-400 subsets) and our own labeled clinic data, with strict patient-level splits |
| `dataset/error_analysis.py`    | Slice metrics: per-task accuracy, per-camera bias, per-skin-tone bias, per-lighting-bin bias; confusion matrices for 0–4 score predictions |
| `dataset/active_learning.py`   | Sampling strategies (uncertainty, disagreement, diversity) for clinician review queues |
| `dataset/eval_runner.py`       | One command to run a model bundle against a held-out manifest and produce `eval_report.json` consumed by the dashboard "Errors" tab |

Outputs are written to `video_eval_runs` (new table) and surfaced in the dashboard so a clinician-engineer can ask "where is the model failing?" before signing off a model bundle for production.

---

## 13. Regulatory positioning

Automated video movement analysis that informs clinical scoring is a **regulated activity**:

- **EU (MDR 2017/745):** Likely Class IIa (decision support, no patient-actuating output).
- **US (FDA):** Software as a Medical Device (SaMD); 510(k) pathway with predicates such as Linus Health (cognitive video tasks) or BeCare Link (remote neurology tasks). VisionMD is a research tool, not a cleared device.
- **Continuous monitoring / fall detection** carries additional risk class because it can drive a clinical alert. v2 monitoring features ship behind a feature flag (`monitoring.alerts_enabled`) and require a per-customer go-live review.

**For v1.0 — decision-support-only positioning:**

Every task score and every monitoring event ships with the label:

> *"Decision-support output derived from peer-reviewed measurement protocols. Not a substitute for clinician judgment. No therapy is delivered or actuated by this report. Scores are for clinician review only."*

**Privacy and data-handling defaults (HIPAA / GDPR friendly):**
- Default-on face blur on every artefact that leaves the secure zone.
- Voice mute / transcript-only export option for monitoring clips.
- Hot retention: 24 h for raw video; analytic features and downsampled annotated overlays retained per clinic policy.
- Full audit trail for every PHI access on the `video_analyses` and `video_clips` rows.
- Continuous-monitoring streams require explicit per-camera consent rows with an active-from / active-to interval.

---

## 14. Runtime estimates

| Step | GPU (A100) | CPU (16-core) |
|------|------------|----------------|
| Ingest + transcode + face-blur (90 s clip, 1080p30) | 8 s  | 18 s |
| 2D pose (RTMPose-l, 90 s @ 30 fps)                  | 12 s | 80 s |
| 3D pose lift (MotionBERT, 90 s)                     | 25 s | 6 min |
| Task segmentation + per-task metrics (5 tasks)      | 5 s  | 15 s |
| Person/bed YOLOv8 monitoring (10 min clip @ 15 fps) | 35 s | 8 min |
| Tracker (ByteTrack, 10 min)                         | 8 s  | 1 min |
| Overlay render + HLS pack                           | 20 s | 90 s |
| Report (PDF) + MedRAG retrieval                     | 4 s  | 4 s  |
| **Total — single 90 s task clip end-to-end**        | **~75 s** | **~9 min** |
| **Total — 10 min monitoring clip end-to-end**       | **~90 s** | **~12 min** |

Without 3D pose lift, the task-clip total drops to ~50 s on GPU.

---

## 15. Roadmap

- **v1.1** — facial AU intensities via OpenFace; full hypomimia score with cohort norms.
- **v1.2** — multi-camera fusion in clinic suites (synced cameras → robust 3D).
- **v1.3** — video foundation-model embedding (replace the 256-d placeholder in `video_analyses.embedding` with a real video FM embedding to match the qEEG / MRI side).
- **v2.0** — continuous monitoring features GA: bed-exit, falls, inactivity, interactions, with audit-grade alert routing.
- **v2.1** — rehab compliance (rep counting, ROM scoring against an exercise template).
- **v2.2** — joint reporting with qEEG + MRI ("multimodal patient page") via `deepsynaps_db`.
- **v2.3** — 510(k) submission for the MDS-UPDRS Part III decision-support sub-module.
