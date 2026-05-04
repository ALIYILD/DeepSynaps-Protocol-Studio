# Video Analyzer — Dashboard Page Spec

Sidebar location: **Movement & Behavior → Video Analyzer**, sibling to
**Neuroimaging → MRI Analyzer** and **Neuroimaging → qEEG Analyzer**.

## Layout

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
```

### Tasks tab — primary v1 surface

Left half: annotated video player (skeleton + zone + epoch markers, face
blurred). Right half: task list with per-task biomarker values, normative
z-scores, suggested 0–4 score with uncertainty, MedRAG-cited evidence chain.

### Monitoring tab — v2 surface, feature-flagged

Per-camera live tile + event timeline. Each event opens a ±10 s clip review
modal with confirm / dismiss actions; clinician decisions are written back
to the `MonitoringEvent.reviewer_state` column.

### Longitudinal tab

Per-patient sparkline grid (cadence, tap rate, tremor freq, etc.) across
recent visits. Visit selection cross-filters all the other tabs.

### Dataset / Errors tab

Surfaces `video_eval_runs` rows: per-task accuracy, per-camera bias,
per-skin-tone bias, per-lighting bias, plus an active-learning queue link.

### Report tab

Inline PDF viewer + download. PDF is rendered by `report.render_report`
from a Jinja2 template; failure to render PDF (no weasyprint in slim image)
shows a styled HTML fallback.
