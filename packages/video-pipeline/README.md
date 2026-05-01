# DeepSynaps Video Analyzer

Clinical computer-vision sibling to the MRI and qEEG analyzers in DeepSynaps Studio.

## What it does

Takes a clinical task video (smartphone or clinic camera) **or** a continuous monitoring feed (room / bed / ICU camera) and returns:

- Movement biomarkers — gait, tremor, bradykinesia, posture, facial-motor.
- Suggested clinical scale items (MDS-UPDRS Part III, TUG, 5xSTS, Tinetti) as **decision support only**.
- Continuous-monitoring events — bed exit, fall, prolonged inactivity, out-of-zone, staff interactions (v2).
- Annotated overlay video, MedRAG evidence chain, and a clinician-ready PDF/HTML report.

## Reference projects we draw from

| Reference                      | What we take                                                                                          |
|--------------------------------|-------------------------------------------------------------------------------------------------------|
| **VisionMD**                   | Task taxonomy aligned with MDS-UPDRS Part III, smartphone-friendly capture flow, per-task feature extractors. |
| **PosePipe / PosePipeline**    | Architectural pattern for pluggable HPE backends with cached intermediates.                           |
| **VIGMA / gait analyzers**     | Stride segmentation, spatiotemporal gait metrics, freezing-of-gait flags, clinician UI patterns.      |
| **TeleICU YOLOv8 monitoring**  | YOLOv8-class person/bed/object detection + tracking for room monitoring.                              |
| **LookDeep-style monitoring**  | Event taxonomy and clinician-facing review workflow for continuous patient monitoring.                |

We **replicate** designs and cite the originals. We do not vendor third-party code without an explicit license check.

## Quick start

```bash
uv sync                                # install Python deps
ds-video analyze tests/data/sample_finger_tap.mp4 --task mds_updrs_3_4_finger_tap
ds-video analyze tests/data/sample_walk.mp4 --task mds_updrs_3_10_gait
ds-video monitor rtsp://camera-7 --camera-id icu-bay-3   # v2, feature-flagged
```

## Layout

See `docs/VIDEO_ANALYZER.md` for the authoritative spec and `CLAUDE.md` for agent execution rules.

```
src/deepsynaps_video/
  io.py             pose/             tasks/        monitoring/
  motion.py         scoring.py        longitudinal.py
  overlay.py        pipeline.py       report.py
  api.py            worker.py         cli.py
  constants.py      schemas.py        db.py
medrag_extensions/  portal_integration/  demo/  tests/
```

## Status

**v0.1.0 — scaffold + spec.** Module skeletons are TODO-stubbed; the spec, schemas, and constants atlas are the authoritative contracts that the agent fleet builds against.

## Regulatory positioning

Decision-support only in v1.0. Continuous-monitoring alerts are feature-flagged behind `settings.monitoring_enabled` and require a per-customer go-live review. See spec §13.
