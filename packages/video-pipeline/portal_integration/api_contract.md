# Video Analyzer — API Contract

This is the request/response schema for the `/api/video/...` surface in the
DeepSynaps Studio API gateway. It mirrors the MRI Analyzer's contract shape so
the frontend can reuse the same upload / poll / download primitives.

## POST /api/video/upload

**Request — multipart form (clinical task clip)**

| Field           | Type   | Required | Notes                                              |
|-----------------|--------|----------|----------------------------------------------------|
| `file`          | binary | yes      | mp4 / mov / webm                                   |
| `patient_id`    | string | yes      | Existing DeepSynaps patient row UUID                |
| `consent_id`    | string | yes      | Active consent row covering this capture            |
| `capture_source`| string | yes      | `smartphone` / `clinic_camera`                      |
| `task_id`       | string | optional | If known; otherwise operator tags later             |
| `side`          | string | optional | `left` / `right` / `bilateral`                      |
| `research_consent` | bool | optional | Default `false` — disables face blur on artefacts |

**Request — JSON (RTSP stream registration)**

```json
{
  "rtsp_url": "rtsp://camera-7.icu",
  "camera_id": "icu-bay-3",
  "patient_id": "uuid",
  "consent_id": "uuid",
  "duration_s": 28800
}
```

**Response — 202**

```json
{ "analysis_id": "uuid", "status": "queued" }
```

## POST /api/video/{analysis_id}/tag

```json
{
  "epochs": [
    { "task_id": "mds_updrs_3_4_finger_tap", "side": "right",
      "start_s": 12.0, "end_s": 27.0 },
    { "task_id": "mds_updrs_3_10_gait", "side": "bilateral",
      "start_s": 40.0, "end_s": 78.0 }
  ]
}
```

## GET /api/video/{analysis_id}

```json
{
  "analysis_id": "uuid",
  "status": "queued | running | done | failed",
  "progress_pct": 64.2,
  "stage": "pose | tasks | overlay | report",
  "warnings": []
}
```

## GET /api/video/{analysis_id}/report.json

Returns the full `VideoAnalysisReport` payload — see
`docs/VIDEO_ANALYZER.md` §7.

## GET /api/video/{analysis_id}/report.pdf

Signed S3 URL.

## GET /api/video/{analysis_id}/overlay.mp4

Signed S3 URL for the annotated overlay video. Face-blurred unless
`research_consent` was set on upload.

## GET /api/video/{analysis_id}/clip/{event_id}.mp4

Signed S3 URL for an individual monitoring-event clip (±10 s window).

## GET /api/video/{analysis_id}/evidence/{task_id}

```json
{
  "task_id": "mds_updrs_3_4_finger_tap",
  "evidence_chain": [
    {
      "paper_id": 54321,
      "doi": "10.1002/...",
      "title": "Video-based MDS-UPDRS finger-tap (Lu et al. 2021)",
      "relations": [
        { "type": "task_validates_biomarker",
          "value": "tap_rate_decrement",
          "agreement_kappa": 0.71 }
      ]
    }
  ]
}
```

## GET /api/video/patient/{patient_id}/longitudinal

```json
{
  "patient_id": "uuid",
  "trend": {
    "cadence_steps_per_min": [ { "visit_id": "uuid", "value": 98.7, "captured_at": "..." } ]
  }
}
```
