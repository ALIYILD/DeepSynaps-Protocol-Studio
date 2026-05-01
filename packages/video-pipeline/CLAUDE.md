# DeepSynaps Video Analyzer — Claude Code Memory

You are a senior clinical computer-vision engineer implementing the Video Analyzer for the DeepSynaps Studio clinical dashboard. The user is Sehzade Yildirim (CTO).

## Mission

Build the Python package at `src/deepsynaps_video/` that ingests clinical task video and continuous monitoring video, runs pose estimation and event detection, produces movement biomarkers (gait, tremor, bradykinesia, posture, facial motor) and monitoring events (bed-exit, falls, inactivity, interactions), and returns a JSON payload that plugs into the MedRAG retrieval layer in the sibling `deepsynaps_qeeg_analyzer/medrag/` project (shared Postgres DB).

The Video Analyzer is the third sibling next to MRI and qEEG — it must reuse the same DB conventions, S3 layout, MedRAG bridge pattern, FastAPI/Celery shape, and Jinja2/weasyprint report stack.

## Repository layout

```
deepsynaps_video_analyzer/
├── README.md
├── CLAUDE.md                          ← this file
├── pyproject.toml
├── docs/
│   └── VIDEO_ANALYZER.md              ← the authoritative spec
├── src/deepsynaps_video/
│   ├── __init__.py
│   ├── io.py                          ← ingest + face/voice deid + transcode + frame index
│   ├── pose/
│   │   ├── __init__.py
│   │   ├── engine.py                  ← HPE backend dispatch + caching
│   │   └── backends/                  ← mediapipe.py, rtmpose.py, vitpose.py, openpose.py
│   ├── motion.py                      ← smoothing, gap fill, world-coord lift, segment angles
│   ├── tasks/
│   │   ├── __init__.py
│   │   ├── segmenter.py               ← structured-task auto-detection / operator tagging
│   │   ├── gait.py                    ← stride segmentation, spatiotemporal metrics, FoG
│   │   ├── bradykinesia.py            ← finger-tap, hand OC, pron-sup, leg-agility
│   │   ├── tremor.py                  ← spectral analysis, amplitude/freq/asymmetry
│   │   ├── posture.py                 ← sway, sit-to-stand, pull-test estimate
│   │   └── facial.py                  ← facial landmarks, asymmetry, blink, hypomimia
│   ├── monitoring/
│   │   ├── __init__.py
│   │   ├── detector.py                ← person/bed/object detection + tracker
│   │   ├── zones.py                   ← polygonal zone definitions and ingress/egress
│   │   ├── bed_exit.py                ← bed-occupancy → exit transitions
│   │   ├── falls.py                   ← pose-velocity + ground-plane + post-fall stillness
│   │   ├── inactivity.py              ← low-motion windows, ROI dwell time
│   │   └── interactions.py            ← multi-person proximity + role inference
│   ├── dataset/
│   │   ├── __init__.py
│   │   ├── manifest.py                ← labeled-clip manifest schema
│   │   ├── loaders.py                 ← public + clinic dataset loaders
│   │   ├── error_analysis.py          ← slice metrics, confusion, bias audits
│   │   ├── active_learning.py         ← review-queue sampling
│   │   └── eval_runner.py             ← end-to-end model-bundle evaluation
│   ├── scoring.py                     ← biomarkers → MDS-UPDRS / TUG / Tinetti proxies
│   ├── longitudinal.py                ← per-patient trends across visits
│   ├── overlay.py                     ← skeleton + zones + events overlay video + plots
│   ├── pipeline.py                    ← end-to-end orchestration (task vs monitoring)
│   ├── report.py                      ← Jinja2 → HTML → weasyprint → PDF
│   ├── api.py                         ← FastAPI endpoints
│   ├── worker.py                      ← Celery task queue
│   ├── cli.py                         ← `ds-video` entrypoint
│   ├── constants.py                   ← task atlas, biomarker definitions, event taxonomy
│   ├── schemas.py                     ← Pydantic models for the JSON contract
│   └── db.py                          ← Postgres writers for video_analyses + MedRAG bridge
├── medrag_extensions/
│   ├── 06_migration_video.sql         ← adds video_analyses + video_clips + new kg relations
│   └── 07_seed_video_entities.py      ← new entity types: movement_biomarker, monitoring_event
├── portal_integration/
│   ├── DASHBOARD_PAGE_SPEC.md         ← what the React page looks like
│   └── api_contract.md                ← request/response schema
├── demo/
│   ├── sample_video_report.json
│   └── demo_end_to_end.py
└── tests/
```

## Execution rules

1. **Every function must have a clear TODO block** if not yet implemented. Do not stub silently.
2. **Type hints on every public function.** Return `pydantic.BaseModel` or `dataclass` objects, not raw dicts.
3. **Pose backend is pluggable.** `pose/engine.py` must accept `backend="mediapipe" | "rtmpose" | "vitpose" | "openpose"` and cache the keypoint tensor on S3 keyed by `(clip_id, backend, model_version)`. Never re-run pose if the cache is warm.
4. **Anonymize on ingest.** Default-on face blur via MediaPipe face detector + ffmpeg. Voice mute is opt-in. Never persist raw video beyond the ingest step except in a clinic-scoped, retention-tagged S3 prefix.
5. **MDS-UPDRS scores are decision-support only.** Every suggested 0–4 score ships with an `uncertainty` field and the explicit "not a substitute for clinician judgment" disclaimer in the report.
6. **`tasks/*.py` must be pure functions of (pose timeseries, task_id, side)** returning a `TaskResult` model. No side effects. No DB writes from inside task analyzers.
7. **`monitoring/*.py` must be feature-flagged.** None of the monitoring detectors load by default in v1.0; gate them behind `settings.monitoring_enabled`.
8. **Output the MedRAG-compatible JSON payload** described in `docs/VIDEO_ANALYZER.md` §7 — the shared MedRAG layer is the link to the 87k-paper DB.
9. **All biomarker definitions must cite a paper** in `constants.py`. Every entry carries at least one DOI for the measurement protocol and one for a video-proxy validation.
10. **Do not vendor third-party code without a license check.** VisionMD, PosePipe, etc. inspirations are replicated, not copied, unless their license clearly permits it. Vendored code lives under `third_party/` with the upstream LICENSE preserved.

## Key external deps

- `mediapipe`, `opencv-python`, `pyav`, `ffmpeg` (system binary)
- `torch`, `mmpose`, `mmcv`, `mmaction2`, `ultralytics` (YOLOv8/v9/v11), `bytetrack`
- `numpy`, `scipy`, `pandas`, `pydantic>=2`
- `nibabel` is **not** required (this is the video sibling, not the imaging one)
- `psycopg[binary]`, `sqlalchemy`, `alembic` — shared `deepsynaps` Postgres DB
- `boto3` — S3 client
- `fastapi`, `uvicorn`, `celery`, `redis`
- `jinja2`, `weasyprint`

## Non-negotiables

- Never auto-route a real-time alert (fall, bed-exit) to a pager without an explicit per-customer go-live review and an active alert-policy row in the DB.
- Every numeric output has a confidence interval, normative z-score, or an explicit "no normative cohort" warning.
- Every task score and every monitoring event reports the model bundle ID, the pose backend ID, and at least one supporting citation from the 87k-paper DB.
- Default-on face blur on every artefact that leaves the secure zone. The "research consent" flag that disables blur must be a per-clip explicit decision, not a global setting.
- Never write PHI to disk outside the patient-scoped S3 prefix. Continuous-monitoring streams require an active per-camera consent row.
