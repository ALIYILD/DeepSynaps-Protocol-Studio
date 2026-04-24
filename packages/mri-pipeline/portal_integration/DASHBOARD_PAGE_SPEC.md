# DeepSynaps Clinical Portal — "MRI Analyzer" page spec

## Location

Sidebar → **Clinical** → **MRI Analyzer** (sits next to **qEEG Analyzer**).

Sidebar icon: `lucide-react: Brain`, accent color `--accent-mri: #2563eb` (distinct from qEEG's purple).

Route: `/clinical/mri-analyzer`
Feature flag: `flags.mri_analyzer` (default on for clinician role).

## Page layout

```
┌───────────────────────────────────────────────────────────────────────┐
│  MRI Analyzer                                   [ New analysis ▸ ]    │
├───────────────────────────────────────────────────────────────────────┤
│  Left column                 │  Right column                           │
│  ─────────────               │  ─────────────                          │
│  1. Session uploader (DnD)   │  5. Targets list (cards)                │
│  2. Patient meta form        │     - per-target: colored MNI badge     │
│  3. Condition + protocol     │     - "Send to neuronav" CTA            │
│     selector                 │     - evidence DOIs inline              │
│  4. Pipeline progress        │  6. 3-plane slice viewer                │
│     (per-stage pills)        │     (reuses qEEG's NiftiViewer widget)  │
│                              │  7. Glass-brain summary                 │
│                              │  8. MedRAG literature panel             │
│                              │     (top-20 papers, tanh-weighted)      │
└───────────────────────────────────────────────────────────────────────┘
```

Bottom strip: **Download report** [PDF] [HTML] [JSON]  ·  **Share with referring provider**  ·  **Open in Neuronav**.

## Components (Next.js 14 / shadcn/ui + React)

| Component                       | File                                              | Consumes                        |
|---------------------------------|---------------------------------------------------|---------------------------------|
| `<MRIUploader />`               | `components/clinical/mri/MRIUploader.tsx`         | `POST /mri/upload`              |
| `<PipelineProgress />`          | `components/clinical/mri/PipelineProgress.tsx`    | SSE `/mri/status/{job_id}`      |
| `<StimTargetCard />`            | `components/clinical/mri/StimTargetCard.tsx`      | `StimTarget` JSON               |
| `<OverlayIframe />`             | `components/clinical/mri/OverlayIframe.tsx`       | `/mri/overlay/{aid}/{tid}`      |
| `<GlassBrainPanel />`           | `components/clinical/mri/GlassBrainPanel.tsx`     | static PNG from `/report/.../glass.png` |
| `<MedRAGPanel />` (shared)      | `components/clinical/shared/MedRAGPanel.tsx`      | `/mri/medrag/{aid}`             |
| `<NiftiSliceViewer />` (shared) | `components/clinical/shared/NiftiSliceViewer.tsx` | static T1 MNI URL               |

Color mapping for target badges (Tailwind palette):

| Modality      | BG       | FG       |
|---------------|----------|----------|
| rtms          | amber-100 | amber-900 |
| tps           | fuchsia-100 | fuchsia-900 |
| tfus          | cyan-100 | cyan-900 |
| tdcs          | green-100 | green-900 |
| tacs          | yellow-100 | yellow-900 |
| *personalised* | rose-100 | rose-900 (with pulsing dot) |

## Data flow

1. Clinician drops session zip → `POST /mri/upload` → `{upload_id}`.
2. Clinician selects condition (MDD / AD / PTSD / …) → `POST /mri/analyze` → `{job_id}`.
3. `<PipelineProgress />` subscribes to `GET /mri/status/{job_id}` (polling or SSE).
4. On `state=done`, page calls `GET /mri/report/{analysis_id}` for JSON, and renders cards + overlays (iframe HTML + glass PNG).
5. `<MedRAGPanel />` calls `GET /mri/medrag/{analysis_id}?top_k=20` which internally delegates to the qEEG MedRAG retrieval module.

## Permissions + audit

- Only users with role `clinician` or `neurotech_admin`.
- Every `POST /mri/analyze` writes an `audit_events` row (user_id, patient_id, analysis_id).
- PHI is stripped at ingest (`deepsynaps_mri.io.deidentify_dicom_dir`); no names/DOBs persist.

## Regulatory

The page ships with a persistent footer:

> **Decision-support tool. Not a medical device.** Coordinates and suggested parameters are derived from peer-reviewed literature. Not a substitute for clinician judgment. For neuronavigation planning only.

See `docs/MRI_ANALYZER.md` §11 for the full EU MDR / FDA positioning.
