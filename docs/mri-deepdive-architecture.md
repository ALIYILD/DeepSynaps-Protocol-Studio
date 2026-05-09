# MRI Analyzer — DeepDive Architecture Plan (Phase 1/4)

**Date:** 2026-05-09  
**Scope:** Research + Architecture + Planning for Class A (UI/safety/wiring) + Class B (new APIs, DB migrations, OSS adapters)  
**Task:** t_34d6ef0f — DeepDive 1/4  
**Audience:** Clinical-hub team, QA, fusion stream coordinator  
**Status:** Architecture Plan (no implementation)

---

## 1. Executive Summary

The MRI Analyzer has robust backend infrastructure (API router, pipeline services, schema validation, safety wrappers, demo fixtures) after overnight sprint (2026-04-26). The DeepDive 1/4 plan outlines:

- **Class A (UI + safety wiring):** Clinical disclaimer banner on all pages, capabilities endpoint pattern (like qEEG), empty-state honesty fixes, citation rendering verification.
- **Class B (new APIs + DB migrations):** Viewer state persistence, advanced ROI extraction (real FastSurfer/SynthSeg outputs, not demo data), functional connectivity filtering, DTI/tractography integration, longitudinal QC flags.
- **Scope guardrails:** No new ML models deployed, no paid APIs, no autonomous prescribing, only license-approved OSS (NiBabel MIT, Nilearn BSD-3, dcm2niix BSD-2).

### Key gaps from overnight audit

1. **Upload validation:** ✓ Completed (validation.py, 26 tests pass). NIfTI magic bytes, ZIP integrity, extension whitelist.
2. **Brain-age safety:** ✓ Completed (safety.py, 18 tests pass). Confidence bands, out-of-range rejection, calibration provenance.
3. **Findings array:** ✓ Completed (safer language, requires_clinical_correlation guard).
4. **Fusion payload:** ✓ Completed (narrow schema v1, ready for qEEG fusion stream).
5. **Clinical disclaimer banner:** ⚠️ **Missing on MRI page** — all 12 clinical surfaces need "Decision-support only, requires clinician review."
6. **Capabilities endpoint:** ⚠️ **Missing** — qEEG has `/api/v1/qeeg/capabilities`; MRI should expose pipeline module versions, FSL/FreeSurfer presence, GPU availability.
7. **Viewer state persistence:** ⚠️ **Missing** — slice position, ROI visibility, overlay alpha not saved across sessions.
8. **Real ROI extraction:** ⚠️ **Demo-driven** — `extract_structural_metrics` returns empty `StructuralMetrics`; needs FastSurfer/SynthSeg wiring in pipeline.
9. **Functional + DTI fusion blocks:** ⚠️ **Stubbed** — networks, tracts, FA/MD maps not in fusion_payload yet.
10. **Longitudinal QC:** ⚠️ **Partial** — endpoint exists but `compare()` needs QC flags for follow-up scans (motion, head size drift).

---

## 2. Architecture — Current State

### 2.1 Backend Stack

| Layer | Component | Status | Remarks |
|-------|-----------|--------|---------|
| **Router** | `mri_analysis_router.py` (1898 LOC) | ✓ Live | 8 endpoints per contract; demo mode short-circuit |
| **Services** | `mri_pipeline.py` | ✓ Live | Facade + demo report injection |
| **Pipeline** | `packages/mri-pipeline/` | ⚠️ Partial | Schemas solid; structural/fmri/dmri extractors stubbed |
| **DB models** | `models/mri.py` | ✓ Live | `MriAnalysis`, `MriUpload`, `MriTargetPlan`, `MriReportFinding`, `MriTimelineEvent` |
| **Validation** | `validation.py` | ✓ Live | Magic bytes, ZIP integrity, extension whitelist (26 tests) |
| **Safety** | `safety.py` | ✓ Live | Brain-age wrapper, findings formatter, fusion payload (18 tests) |

### 2.2 Frontend Stack

| Component | Status | Remarks |
|-----------|--------|---------|
| `pages-mri-analysis.js` (3685 LOC) | ✓ Live | Uploader, progress pills, viewer, brain-age card, stim targets |
| `mri-viewer-cs3d.js` | ✓ Live | NiiVue + Cornerstone3D optional mount |
| `mri-quick-preview-section.js` | ✓ Live | Thumbnail + metadata stub |
| `medical-image-card.js` | ✓ Live | Card layout (used in listing) |
| Medical image tests (4 files, 800+ LOC) | ✓ Live | Coverage for upload, viewer, comparison |

### 2.3 API Contract (8 endpoints)

```
POST   /api/v1/mri/upload                          → upload_id
POST   /api/v1/mri/analyze                         → job_id, state
GET    /api/v1/mri/status/{job_id}                 → state, info
GET    /api/v1/mri/report/{analysis_id}            → MRIReport JSON
GET    /api/v1/mri/report/{analysis_id}/pdf        → PDF (503 if unavailable)
GET    /api/v1/mri/report/{analysis_id}/html       → HTML report
GET    /api/v1/mri/overlay/{analysis_id}/{tid}     → iframe-ready HTML (viewer)
GET    /api/v1/mri/medrag/{analysis_id}?top_k=20   → evidence retrieval
```

**Phase 2 (not in scope):** WebSocket `/ws/mri/status/{job_id}` for real-time stage events.

### 2.4 DB Schema

**Key tables (Alembic migrations):**
- `mri_uploads` (upload_id, patient_id, size_bytes, path, created_at)
- `mri_analyses` (analysis_id, upload_id, patient_id, job_id, qc_json, findings_json, report_json, state, run_mode, created_at)
- `mri_report_findings` (finding_id, analysis_id, region, severity, finding_text, requires_clinical_correlation)
- `mri_target_plans` (target_id, analysis_id, modality, region_name, mni_xyz, patient_xyz, confidence)
- `mri_timeline_events` (event_id, analysis_id, stage, ts, log_line) — new, for audit trail

---

## 3. Class A Tasks (UI + Safety Wiring)

### 3.1 Clinical Disclaimer Banner (UI)

**Goal:** All 12 clinical surfaces (qEEG, MRI, deeptwin, scoring, etc.) display disclaimer.

**Scope for MRI:**
- File: `apps/web/src/pages-mri-analysis.js` + sibling MRI pages
- Existing pattern: `pages-qeeg-analysis.js` has sprint disclaimer at line 3058 (footer slot)
- Implementation: Create `clinical-disclaimer.js` helper (React component or IIFE)
  - Returns HTML: `"MRI Analyzer is a decision-support tool. Not a medical device. Clinician review required."`
  - Mount on page load, not hidden behind warning/error states
  - Persist across navigation (mount once at top-level)

**Tests:**
- Page loads → banner renders
- Banner text contains no forbidden words ("diagnosis", "treatment", "device")
- Banner is **always** present (not conditional on warnings)

**Acceptance:** All 12 pages pass; no banner missing any page.

**Effort:** 20 min (component + 3 test cases).

---

### 3.2 Capabilities Endpoint (API)

**Goal:** Clients can query pipeline module availability, tool versions, GPU status.

**Scope:**
- Endpoint: `GET /api/v1/mri/capabilities` → JSON response
- Pattern: Copy `qEEG` implementation (endpoint already exists; find reference)
- Response shape:
  ```json
  {
    "status": "ok|unavailable|degraded",
    "pipeline_version": "0.4.2",
    "modules": {
      "structural": {"available": bool, "engine": "FastSurfer|SynthSeg", "gpu": bool},
      "fmri": {"available": bool, "networks_count": 17},
      "dmri": {"available": bool, "tracking_method": "deterministic|probabilistic"},
      "registration": {"available": bool, "tool": "antspyx", "version": "0.3.24"},
      "targeting": {"available": bool, "conditions_supported": ["mdd", "ptsd", ...]}
    },
    "warnings": ["FreeSurfer not installed", "GPU unavailable"],
    "last_checked_at": "2026-05-09T14:23:00Z"
  }
  ```
- Implementation: Check environment, import guards, tool availability (subprocess probe for dcm2niix, nibabel version, etc.)

**Tests:**
- Endpoint returns 200 + valid schema
- "degraded" status when optional deps missing (but pipeline still works)
- GPU detection correct on CI vs. local dev

**Acceptance:** Frontend can call before attempting analysis; graceful degradation UI updates based on response.

**Effort:** 45 min (endpoint + environment probe + 4 tests).

---

### 3.3 Empty-State Honesty (UI + Backend)

**Goal:** When features unavailable (e.g., DTI not in upload, brain-age model failed), UI shows honest placeholder, not fake data.

**Current issues:**
- Demo mode auto-injects demo report; if real run fails, page can confuse cache + failure
- Brain-age card guards against impossible ages (lines 1702-1707) — good; verify no similar gaps elsewhere
- Viewer placeholder when no overlay available — check for placeholder text "No overlay computed" (should exist, verify)

**Scope:**
- Audit pages for localStorage cache confusion (if demo data cached, don't auto-serve on real-run failure)
- Add explicit empty-state text for:
  - Viewer (no segmentation yet) → "Segmentation in progress or unavailable"
  - Stim targets (no networks computed) → "Connectivity analysis required; check QC flags"
  - Brain age (model failed) → "Brain-age model unavailable; see QC flags"
  - Comparison (no baseline) → "Select a baseline scan for longitudinal analysis"

**Tests:**
- Real failure path (simulate backend 503) → page does NOT show demo data
- No placeholder text contains forbidden words ("accurate", "diagnosis")
- localStorage isolation: demo data never leaks to real session

**Acceptance:** Every empty state honest + non-scary language.

**Effort:** 30 min (audit + text fixes + 3 tests).

---

### 3.4 Citation Rendering Verification (UI)

**Goal:** Evidence links from MedRAG render correctly; no broken PMIDs or DOIs.

**Current:** Evidence intelligence wired on qEEG; MRI should use same pattern.

**Scope:**
- File: `pages-mri-analysis.js` — evidence drawer integration (already has `initEvidenceDrawer`, `openEvidenceDrawer`)
- Verify PMID/DOI links:
  - Callback `createEvidenceQueryForTarget(target)` should build query for target region + condition
  - Verify MedRAG returns valid paper_ids (exists in DB)
  - Verify UI does not hard-code broken PMID (e.g. "12345" placeholder)

**Tests:**
- Evidence drawer opens for a stim target
- Retrieved papers have valid PMIDs (not "0" or placeholder)
- UI renders clickable DOI link correctly

**Acceptance:** Click evidence link → PubMed/DOI resolver opens; no 404s.

**Effort:** 20 min (verify + 2 tests).

---

## 4. Class B Tasks (New APIs + DB Migrations)

### 4.1 Viewer State Persistence

**Goal:** Slice position, ROI visibility, overlay alpha saved per user × patient.

**Current:** NiiVue state is ephemeral (browser memory only).

**Scope:**
- New DB table: `mri_viewer_state` (user_id, analysis_id, slice_xyz, roi_visibility, overlay_alpha, updated_at)
- New endpoint: `GET /api/v1/mri/{analysis_id}/viewer_state` → restore state on page load
- New endpoint: `POST /api/v1/mri/{analysis_id}/viewer_state` → save state (debounced, <1s from frontend)
- Frontend: On viewer mount, fetch state; on slice/overlay change, POST (debounced)

**Alembic migration:**
```python
def upgrade():
    op.create_table(
        'mri_viewer_state',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('user_id', sa.String, sa.ForeignKey('users.id')),
        sa.Column('analysis_id', sa.String, sa.ForeignKey('mri_analyses.analysis_id')),
        sa.Column('viewer_config', sa.JSON),  # {slice_xyz, roi_visibility, overlay_alpha, overlay_layers}
        sa.Column('updated_at', sa.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow),
        sa.Index('ix_mri_viewer_state_user_analysis', 'user_id', 'analysis_id'),
    )

def downgrade():
    op.drop_table('mri_viewer_state')
```

**Tests:**
- State persists across page reload
- Multiple users have independent state
- Concurrent saves don't corrupt (last-write-wins or optimistic lock)

**Acceptance:** Reviewer navigates away, returns, slice position + overlay state restored.

**Effort:** 2h (endpoints + migration + frontend wiring + 5 tests).

---

### 4.2 Real ROI Extraction (Pipeline)

**Goal:** `extract_structural_metrics()` returns actual FastSurfer/SynthSeg outputs, not demo data.

**Current:** Stubbed — returns empty `StructuralMetrics`.

**Scope:**
- File: `packages/mri-pipeline/src/deepsynaps_mri/structural.py:234` — implement `extract_structural_metrics()`
- Inputs: segmentation label map (Desikan-Killiany or Schaefer-400), T1 img, registration affine
- Outputs:
  - `cortical_thickness_mm: dict[str, NormedValue]` (per region)
  - `subcortical_volume_mm3: dict[str, NormedValue]` (hippocampus, amygdala, thalamus, putamen, caudate, nucleus accumbens, globus pallidus)
  - `wmh_volume_ml: float` (if FLAIR present; else None)
- Libraries: `nibabel` (load), `scipy.ndimage` (volume calc), `np` (z-score vs. normative)
- Normative reference: Use ICV-corrected Desikan-Killiany norms (e.g., ADNI or HCP, per CLAUDE.md)

**Dependency check:** Requires nibabel, scipy. Both already declared; ensure not missing from slim image.

**Tests:**
- Real segmentation label map (2mm Desikan-Killiany) → metrics extracted
- Z-scores ± 1.5 SD within plausible range (mock normative data)
- Volume calc correct (simple cube volume test)
- Graceful fallback if normative reference missing (return z=None, confidence="unknown")

**Acceptance:** Real pipeline runs produce per-region cortical thickness + volumes, not zeros.

**Effort:** 4h (extract + normative ref + tests + integration).

---

### 4.3 Functional Connectivity Filtering (Pipeline)

**Goal:** Extract DMN/Salience/CEN/Language networks from rs-fMRI with motion/confound filtering.

**Current:** fMRI timeseries and confound regression exist in `fmri.py`; network extraction needs finalization.

**Scope:**
- File: `packages/mri-pipeline/src/deepsynaps_mri/fmri.py` — `extract_networks()`
- Input: 4D rs-fMRI (motion corrected, confound regressed)
- Atlases: Yeo-17 (canonical networks) + DiFuMo-1024 (soft assignment)
- Outputs per network:
  - `network_id` (e.g., "DMN_1")
  - `nodes: dict[str, ROI]` (MNI coords, region names)
  - `connectivity_matrix: list[list[float]]` (Pearson r, Fisher z-transformed)
  - `motion_flags: {mean_fd, max_fd, scrub_count}` — if motion too high (mean_fd > 0.5), flag network as "poor_quality"
- Libraries: `nilearn` (atlas, signal extraction, connectivity), `scipy.stats` (Fisher z)

**Tests:**
- Network extraction runs on synthetic fMRI
- Motion flags trigger when mean_fd > 0.5
- Connectivity matrix is symmetric
- Z-scores plausible (-3 to +3 range typical)

**Acceptance:** qEEG-MRI fusion stream can consume network QC flags + connectivity without walking full report.

**Effort:** 3h (extract + motion flags + tests + integration).

---

### 4.4 DTI/Tractography Integration (Pipeline)

**Goal:** FA/MD maps, deterministic tract bundles (arcuate, corticospinal, IFOF, ILF).

**Current:** Schema exists; `dmri.py:~100` lines mostly skeleton.

**Scope:**
- File: `packages/mri-pipeline/src/deepsynaps_mri/dmri.py` — `extract_dti_maps()` + `extract_bundles()`
- Input: Eddy-corrected DWI, bvals, bvecs
- Outputs:
  - FA/MD/RD/AD maps (NIfTI + MNI-registered)
  - Tract bundles (`arcuate`, `corticospinal`, `uncinate`, `IFOF`, `ILF`) — one NIfTI per tract
  - Bundle stats: mean_fa, mean_md, voxel_count per tract
- Libraries: `dipy` (tensor fit, deterministic tracking), `scilpy` (Recobundles for bundle seg)
- Fallback: If scilpy unavailable, skip Recobundles; return raw tract count + mean FA only

**Tests:**
- Tensor fit on synthetic DWI → FA/MD plausible
- Tract bundles extracted (voxel counts > 0)
- Graceful fallback if scilpy missing

**Acceptance:** API returns DTI maps + bundle stats; ready for fusion stream.

**Effort:** 5h (tensor + tracking + bundle seg + tests + integration).

---

### 4.5 Longitudinal QC Flags (Pipeline)

**Goal:** Detect head size drift, motion increase, segmentation mismatch between baseline and follow-up.

**Current:** `longitudinal.py:440` lines exist; needs QC flag wiring.

**Scope:**
- File: `packages/mri-pipeline/src/deepsynaps_mri/longitudinal.py` — add `compute_qc_flags(baseline_report, followup_report)`
- Flags:
  - `head_size_drift_pct: float` (ICV change > ±3% → flag "unusual")
  - `motion_increase: bool` (followup mean_fd > baseline + 0.2 mm)
  - `segmentation_mismatch: bool` (Desikan labels inconsistent; e.g., missing region in followup)
  - `registration_confidence: float` (0-1, ANTs SyN correlation metric)
- Outputs: Add `longitudinal_qc` field to `MRIReport` schema
- Router: `/api/v1/mri/compare/{baseline_id}/{followup_id}` includes `longitudinal_qc`

**Tests:**
- Simulate head size +5% → flag set
- Simulate motion increase → flag set
- Simulate missing region → flag set

**Acceptance:** Clinician sees QC flags before interpreting longitudinal changes; no false alerts on expected drift.

**Effort:** 2h (flags + tests + schema + router integration).

---

## 5. Class B Tasks — Database Migrations

### 5.1 Alembic Migrations

**New tables:**
1. `mri_viewer_state` (user state persistence) — *see 4.1 above*
2. `mri_timeline_events` (audit trail — optional, can defer)
   ```python
   sa.Column('analysis_id', sa.ForeignKey('mri_analyses.analysis_id')),
   sa.Column('stage', sa.String),  # "upload", "structural", "fmri", "dmri", "targeting", "report"
   sa.Column('ts', sa.DateTime),
   sa.Column('log_line', sa.Text),  # pipeline log snippet
   ```

**Schema extensions:**
1. `MRIReport` — add `longitudinal_qc` (optional dict)
2. `StructuralMetrics` — add `icc_corrected: bool` field (already has cortical_thickness, subcortical_volume)
3. `NetworkAnalysis` (new Pydantic model for functional connectivity)
   ```python
   class NetworkAnalysis(BaseModel):
       network_id: str
       nodes: dict[str, ROI]
       connectivity_matrix: list[list[float]]
       motion_flags: QCMotionFlags
       confidence: Literal["high", "medium", "low"]
   ```
4. `DTIAnalysis` (new Pydantic model)
   ```python
   class DTIAnalysis(BaseModel):
       fa_map_path: str  # S3 signed URL
       md_map_path: str
       bundles: dict[str, BundleStats]  # {"arcuate": {...}, "corticospinal": {...}}
       confidence: Literal["high", "medium", "low"]
   ```

**Migration files (to create):**
- `apps/api/alembic/versions/XXX_add_mri_viewer_state.py`
- `apps/api/alembic/versions/XXX_extend_mri_schema_dti_networks.py` (if large; else combine)

**Effort:** 1h (schema + 2 migrations + alembic generate).

---

## 6. Dependencies + Environment

### 6.1 OSS Libraries (Approved)

| Library | License | Status | Usage |
|---------|---------|--------|-------|
| `nibabel` (0.10+) | BSD-3 | Required | NIfTI I/O, header parsing |
| `nilearn` (0.9+) | BSD-3 | Required | Atlas-based timeseries, plotting, connectivity |
| `dipy` (1.7+) | BSD-3 | Required | DTI tensor fit, tractography |
| `antspyx` (0.3+) | Apache-2.0 | Required | Registration (non-linear SyN) |
| `pydicom` (2.4+) | MIT | Required | DICOM parsing |
| `dcm2niix` (system) | BSD-2 | Required | DICOM → NIfTI conversion (subprocess) |
| `deid` (0.3+) | MIT | Required | HIPAA de-identification |
| `scilpy` (1.3+) | MIT | Optional | Recobundles (tractography post-proc) — graceful fallback if missing |
| `scipy` (1.10+) | BSD | Required | ndimage (volume calc), stats (z-score) |
| `numpy` (1.24+) | BSD | Required | Array ops |

### 6.2 System Dependencies (DevOps scope)

- FreeSurfer 7.4+ (for `mri_synthseg`)
- FastSurfer Docker image (GPU path optional)
- FSL (optional, for eddy correction; DIPY fallback available)
- dcm2niix binary (e.g., `brew install dcm2niix` macOS, `apt install dcm2niix` Ubuntu)

### 6.3 Image/Container Setup

- **Slim deployment:** nibabel, scipy, numpy, pydicom, deid only → brain-age + upload validation works; ROI extraction / tractography / networks stubbed (graceful)
- **Full deployment:** Add nilearn, dipy, antspyx, scilpy, FreeSurfer → all pipelines available
- CI should test both paths; API should not crash on slim.

**Effort:** 30 min (environment probe in capabilities endpoint).

---

## 7. Testing Strategy

### 7.1 Pytest (Python)

| Module | # Tests | Scope |
|--------|---------|-------|
| `test_validation.py` | 26 | Extension/magic-byte/zip checks ✓ Done |
| `test_safety.py` | 18 | Brain-age wrapper, findings format, fusion payload ✓ Done |
| `test_structural.py` | 10 | ROI extraction (volume calc, z-score correctness) — *to add* |
| `test_fmri.py` | 12 | Network extraction, motion flags — *to add* |
| `test_dmri.py` | 10 | Tensor fit, bundle extraction — *to add* |
| `test_longitudinal.py` | 8 | QC flags, head-size drift detection — *to add* |
| `test_mri_analysis_router.py` | 25+ | API endpoints, capabilities, viewer state, fusion payload — *to extend* |

**Target:** 120+ pytest passing before Phase 2 begins.

### 7.2 Jest/Node (Frontend)

| Test File | # Tests | Scope |
|-----------|---------|-------|
| `pages-mri-analysis.test.js` | 12 | Disclaimer render, empty states, evidence drawer — *to add* |
| `medical-image-card.test.js` | 8 | Existing + verify no localStorage confusion — *to extend* |
| `mri-viewer-cs3d.test.js` | 6 | Viewer state save/restore — *to add* |

**Target:** 30+ tests passing.

### 7.3 Integration

- API test: `/api/v1/mri/capabilities` responds before analysis
- API test: Viewer state persists across request boundary
- Frontend test: Upload → analyze → poll status → report render (full flow, mocked API)
- Fusion integration: `/api/v1/mri/report/{id}/fusion_payload` consumed by qEEG-MRI router

---

## 8. Implementation Sequence (Week 1–4)

### Sprint 1 (Days 1–3): Class A UI + Safety

1. **Clinical disclaimer banner** (3 agent-turns + 20 tests) — Days 1–2
2. **Capabilities endpoint** (45 min + 4 tests) — Day 2
3. **Empty-state honesty audit** (30 min + 3 tests) — Day 2
4. **Citation verification** (20 min + 2 tests) — Day 3

**Output:** Draft PR, 29 tests, all pages safe + honest.

### Sprint 2 (Days 4–8): Class B Core Pipeline

5. **ROI extraction** (4h + tests) — Days 4–5
6. **Functional connectivity** (3h + tests) — Days 6–7
7. **DTI/tractography** (5h + tests) — Days 7–8

**Output:** Real structural/functional/diffusion metrics in reports; 40+ new tests.

### Sprint 3 (Days 9–12): Advanced Features

8. **Viewer state persistence** (2h + 5 tests) — Days 9–10
9. **Longitudinal QC flags** (2h + 8 tests) — Days 11–12

**Output:** Stateful viewer, QC-aware comparisons; 13 new tests.

### Sprint 4 (Days 13–14): Integration + PR Review

10. **Fusion payload tests** (extended) — Day 13
11. **Full end-to-end flow test** — Day 13
12. **PR review + fixes** — Days 13–14

**Output:** Ready for QA, demo, go-live candidate.

---

## 9. Risks + Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **nibabel/scipy missing from slim image** | ROI extraction fails on production | Graceful fallback; capabilities endpoint reports missing deps; ✓ guards in code |
| **FreeSurfer/FastSurfer not available** | Structural metrics stubbed | Test both paths (CPU SynthSeg fallback); containerize GPU path separately |
| **Brain-age model misbehaves** (returns age >120 or <0) | Fake outputs in reports | ✓ Already wrapped by `safe_brain_age`; confidence_band_years clamped |
| **Viewer state corruption** (concurrent saves) | User frustration, stale overlays | Last-write-wins + add unique token per save; test concurrent POSTs |
| **Fusion stream expects different DTI/network shape** | Integration blocker | Align schema early; fusion team reviews `to_fusion_payload` output **before** Phase 2 ends |
| **Registration fails** (ANTs SyN diverges) | MNI coords invalid | Test with synthetic fixed reference; error code in report (not silent) |

---

## 10. Dependencies on Other Agents

### Fusion Stream (Orchestrator)

- Review `to_fusion_payload` schema (`safety.py`) before Phase 2 DTI/network work starts
- Confirm `schema_version: "mri.v1"` and expected field shapes
- Feedback on `motion_flags` + `connectivity_matrix` JSON structure

### DevOps

- Verify nibabel, scipy, antspyx in both slim and full images
- Install FreeSurfer 7.4+ or FastSurfer Docker image on worker
- Ensure dcm2niix system binary available

### QA

- Validate clinical-disclaimer text (legal + medical review)
- Spot-check ROI extraction against known MRI cohort
- Validate registration output (ANTs SyN alignment plausibility)

### Frontend (qEEG page)

- Share `clinical-disclaimer.js` implementation so both pages use identical banner
- Coordinate evidence drawer UI (ensure MRI evidence rendering matches qEEG)

---

## 11. Deliverables Checklist

### Phase 1/4 (This Task)

- [x] Architecture plan document (this file)
- [x] Scope: Class A + Class B mapped to 10 sub-tasks
- [x] Risk register
- [ ] Opening draft PR (to follow)
- [ ] Commit on `agent/clinical-hub/t_34d6ef0f` (to follow)
- [ ] Memory save to `hermes:clinical-hub:6page-deepdive-2026-05-09:mri:architecture` (to follow)

### Phase 2–4 (Future Tasks)

- UI + safety wiring (Phase 1/4)
- ROI extraction + network filtering (Phase 2/4)
- DTI + viewer persistence (Phase 3/4)
- Integration + PR ready (Phase 4/4)

---

## 12. Appendix: API Examples

### 12.1 Capabilities Endpoint

**Request:**
```bash
curl -H "Authorization: Bearer $TOKEN" https://api.deepsynaps.studio/api/v1/mri/capabilities
```

**Response (full GPU):**
```json
{
  "status": "ok",
  "pipeline_version": "0.4.2",
  "modules": {
    "structural": {"available": true, "engine": "FastSurfer", "gpu": true, "version": "1.2.3"},
    "fmri": {"available": true, "networks_count": 17},
    "dmri": {"available": true, "tracking_method": "deterministic_and_probabilistic"},
    "registration": {"available": true, "tool": "antspyx", "version": "0.3.24"},
    "targeting": {"available": true, "conditions_supported": ["mdd", "ptsd", "ocd", "adhd", "tbi"]}
  },
  "warnings": [],
  "last_checked_at": "2026-05-09T14:23:00Z"
}
```

**Response (slim, no GPU):**
```json
{
  "status": "degraded",
  "pipeline_version": "0.4.2",
  "modules": {
    "structural": {"available": true, "engine": "SynthSeg", "gpu": false},
    "fmri": {"available": false, "reason": "nilearn not installed"},
    "dmri": {"available": false, "reason": "dipy not installed"},
    "registration": {"available": true, "tool": "antspyx", "version": "0.3.24"},
    "targeting": {"available": true, "conditions_supported": ["mdd", "ptsd"]}
  },
  "warnings": ["nilearn, dipy missing — functional/diffusion analysis unavailable. Structural metrics only."],
  "last_checked_at": "2026-05-09T14:23:00Z"
}
```

### 12.2 Fusion Payload

**Request:**
```bash
curl -H "Authorization: Bearer $TOKEN" https://api.deepsynaps.studio/api/v1/mri/report/{analysis_id}/fusion_payload
```

**Response:**
```json
{
  "schema_version": "mri.v1",
  "subject_id": "DS-2026-001234",
  "modality": "mri",
  "qc": {
    "passed": true,
    "warnings": [],
    "mriqc_status": "ok",
    "incidental_status": "flagged",
    "any_incidental_flagged": true
  },
  "findings": [
    {
      "region": "left_middle_prefrontal_cortex",
      "metric": "cortical_thickness",
      "value_mm": 2.31,
      "z_score": -0.9,
      "severity": "mild",
      "finding_text": "Mild cortical thinning in left middle prefrontal cortex (z = -0.9, normative mean 2.51 mm) requires clinical correlation with structural MRI history.",
      "requires_clinical_correlation": true
    }
  ],
  "brain_age": {
    "status": "ok",
    "predicted_age_years": 52.3,
    "actual_age_years": 45,
    "brain_age_gap_years": 7.3,
    "confidence_band_years": [50.2, 54.4],
    "calibration_provenance": "Model trained on 1200-subject HCP cohort (age 22-60); MAE 3.2 years; not validated outside age range.",
    "model_id": "brain_age_v0.2"
  },
  "stim_targets": [
    {
      "target_id": "sgacc_dlpfc_rTMS",
      "modality": "rTMS",
      "region_name": "right_dorsolateral_prefrontal_cortex",
      "mni_xyz": [41, 49, 25],
      "patient_xyz": [40.2, 48.9, 26.1],
      "confidence": "high",
      "method": "resting_sgacc_anticorrelation",
      "requires_clinician_review": true
    }
  ],
  "provenance": {
    "pipeline_version": "0.4.2",
    "norm_db_version": "HCP_ADNI_2023",
    "disclaimer": "Decision-support tool. Not a medical device. Clinician review required."
  }
}
```

---

## 13. References

- **MRI Analyzer spec:** `packages/mri-pipeline/docs/MRI_ANALYZER.md`
- **API contract:** `packages/mri-pipeline/portal_integration/api_contract.md`
- **CLAUDE.md:** `packages/mri-pipeline/CLAUDE.md` (execution rules + context)
- **AGENTS.md:** Root `AGENTS.md` (coding rules, module boundaries)
- **Overnight audit:** `docs/overnight/2026-04-26-night/mri_current_state.md`
- **Overnight upgrades:** `docs/overnight/2026-04-26-night/mri_upgrades_applied.md`
- **Previous sprint:** `docs/overnight/2026-04-26-night/launch_readiness.md` (go-live checklist — MRI pass status)

---

**Document Status:** Architecture Plan (v1.0) — Ready for team review + Phase 1 agent assignment.  
**Next Step:** Clinical-hub agent reviews; opens draft PR; child tasks spawned for Phases 2–4.
