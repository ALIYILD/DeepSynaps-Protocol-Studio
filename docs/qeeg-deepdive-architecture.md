# qEEG Analyzer DeepDive 1/4 — Architecture + Implementation Plan

**Task:** t_055ecbcc  
**Phase:** Research + Architecture + Plan (DeepDive 1 of 4)  
**Date:** 2026-05-09  
**Scope:** Class A (UI/safety/wiring) + Class B (new APIs, DB migrations, OSS adapters)  
**Status:** PLANNING (commit pending)

---

## Executive Summary

The qEEG Analyzer is a mature clinical-grade neuromodulation decision-support tool already deployed in the DeepSynaps Platform. This audit establishes the architecture for **tonight's overnight sprint** work (Agent 5–8).

**Current state:** 7,515 lines of frontend (`pages-qeeg-analysis.js`), 4,080 lines of API router (`qeeg_analysis_router.py`), 11 backend routers, established DB schema (migration 037 ✓), contract spec (CONTRACT.md ✓).

**Tonight's mission (Class A + B):** Wire remaining UI safety disclaimers, finalize capabilities endpoint, integrate evidence-DB RAG into AI narratives, ensure all honest unavailable states render correctly, add final tests.

**Forbidden (Class C):** Autonomous prescribing, fake predictions, heavy model deploy, unlicensed code, paid APIs.

---

## 1. Current Architecture Overview

### 1.1 Frontend Topology (`apps/web/src/`)

| File | Lines | Purpose | Status |
|------|-------|---------|--------|
| `pages-qeeg-analysis.js` | 7,515 | Main qEEG page (tabs: upload, analysis, AI report, compare) | Live ✓ |
| `qeeg-ai-panels.js` | ~1,200 | AI upgrade panels (brain age, risk scores, centiles, explainability) | Live ✓ |
| `qeeg-safety-cockpit.js` | ~600 | Safety red-flag panel + thresholds | Live ✓ |
| `qeeg-red-flags.js` | ~800 | Clinical red-flag alerts | Live ✓ |
| `qeeg-normative-card.js` | ~500 | Normative model z-score heatmap | Live ✓ |
| `qeeg-protocol-fit.js` | ~400 | Protocol recommendation engine UI | Live ✓ |
| `qeeg-clinician-review.js` | ~350 | Clinician annotation + approval flow | Live ✓ |
| `qeeg-patient-report.js` | ~400 | Patient-facing report summary | Live ✓ |
| `qeeg-clinician-report.js` | ~450 | Clinician-facing detailed report | Live ✓ |
| `qeeg-timeline.js` | ~300 | Longitudinal session timeline | Live ✓ |
| `learning-eeg-reference.js` | ~200 | Educational EEG reference card | Live ✓ |
| `qeeg-upload-workflow.js` | ~500 | File upload + validation UX | Live ✓ |
| `qeeg-brain-map-template.js` | ~200 | Brain topography SVG template | Live ✓ |
| `brain-map-svg.js` | ~3,500 | SVG rendering (topomaps, 3D brain, matrices) | Live ✓ |

**Key imports:** `helpers.js` (UI utilities), `api.js` (HTTP client), `evidence-intelligence.js` (evidence chip rendering).

### 1.2 Backend Topology (`apps/api/app/routers/` + `services/`)

**qEEG Routers (11 total):**

| Router | Lines | Endpoints | Status |
|--------|-------|-----------|--------|
| `qeeg_analysis_router.py` | 4,080 | POST `/upload`, GET `/analysis/{id}`, POST `/ai-report`, GET `/list`, POST `/compare` | Live ✓ |
| `qeeg_raw_router.py` | ~1,200 | Raw EDF signal viewer endpoints | Live ✓ |
| `qeeg_viz_router.py` | ~800 | Visualization endpoints (topomaps, matrices) | Live ✓ |
| `qeeg_capabilities_router.py` | ~300 | GET `/capabilities` (feature flag endpoint) | Live ✓ |
| `qeeg_ai_router.py` | ~600 | AI narrative + RAG endpoints | Live ✓ |
| `qeeg_annotation_outcome_tracker_router.py` | ~400 | Clinician review audit trail | Live ✓ |
| `qeeg_report_annotations_router.py` | ~450 | Report finding annotations | Live ✓ |
| `qeeg_copilot_router.py` | ~500 | AI copilot / agent brain integration | Live ✓ |
| `qeeg_live_router.py` | ~350 | Real-time streaming EEG (websocket) | Live ✓ |
| `qeeg_records_router.py` | ~200 | qEEG record CRUD | Live ✓ |
| `qeeg_job_router.py` (implicit) | ~400 | Async Celery job queue integration | Live ✓ |

**qEEG Services:**

| Service | Location | Purpose | Status |
|---------|----------|---------|--------|
| `qeeg_pipeline_job.py` | `apps/api/app/services/` | Celery task orchestrator | Live ✓ |
| `spectral_analysis.py` | `apps/api/app/services/` | MNE preprocessing + feature extraction | Live ✓ |
| `qeeg_ai_interpreter.py` | `apps/api/app/services/` | LLM narrative generation | Live ✓ |

**DB Models (`apps/api/app/persistence/models.py`):**

| Model | Columns | Status |
|-------|---------|--------|
| `QEEGAnalysis` | id, patient_id, band_powers_json, aperiodic_json, connectivity_json, asymmetry_json, source_roi_json, normative_zscores_json, flagged_conditions, quality_metrics_json, pipeline_version, norm_db_version, created_at, analyzed_at | Live ✓ (migration 037 merged) |
| `QEEGAIReport` | id, analysis_id, ai_narrative, literature_refs_json, model_used, prompt_hash | Live ✓ |
| `QEEGRecord` | id, patient_id, original_filename, file_size_bytes, status | Live ✓ |
| `QEEGComparison` | id, baseline_analysis_id, followup_analysis_id, longitudinal_features_json | Live ✓ |
| `QEEGProtocolFit` | id, analysis_id, protocol_id, fit_score, recommendation | Live ✓ |

---

## 2. Class A Tasks (UI/Safety/Wiring) — TONIGHT

These are **blocking safety disclaimers** that must be present on all clinical pages per overnight-sprint guidance.

### 2.1 Missing Clinical Disclaimer Banner (REQUIRED)

**Current state:**  
- Individual pages have ad-hoc disclaimers (renderLaunchNotice in pages-qeeg-analysis.js at line 84).
- Inconsistent tone/text across pages.
- Some pages missing banners entirely.

**Required fix:**
- Create centralized `clinical-disclaimer.js` helper that renders a clinical-grade disclaimer:
  ```html
  <div class="clinical-disclaimer-banner">
    <strong>Clinical Decision Support Only</strong>
    <p>This tool provides research and wellness-use summaries, not diagnosis or treatment guidance. 
       Clinician review required for all clinical decisions. Not FDA-cleared for diagnostic use.</p>
  </div>
  ```

**Where to wire:**
- `pages-qeeg-analysis.js` line ~100 (mount near page header)
- `qeeg-ai-panels.js` (AI narrative section)
- `qeeg-clinician-report.js` (printable report header)
- `learning-eeg-reference.js` (educational content header)

**Test:** Verify disclaimer text does NOT contain forbidden words ("diagnosis", "diagnostic", "treatment recommendation", "prescrib").

**Forbidden words list:**
```javascript
const FORBIDDEN_CLINICAL_WORDS = [
  'diagnosis', 'diagnostic', 'diagnose',
  'treatment recommendation', 'recommend treatment',
  'prescription', 'prescribe', 'therapeutic',
  'cure', 'cures', 'healing'
];
```

---

### 2.2 Capabilities Endpoint Wiring (REQUIRED)

**Current state:**  
- `qeeg_capabilities_router.py` exists but returns hardcoded demo data.
- Frontend doesn't call it to verify feature readiness.

**API Contract:**
```http
GET /api/v1/qeeg/capabilities
Response:
{
  "features": {
    "spectral_analysis": {"enabled": true, "version": "0.1.0"},
    "aperiodic_slope": {"enabled": true, "version": "0.1.0"},
    "connectivity": {"enabled": true, "version": "0.1.0"},
    "source_localization": {"enabled": false, "reason": "MNE dataset not available"},
    "ai_narrative": {"enabled": true, "version": "0.1.0"},
    "normative_comparison": {"enabled": true, "db_version": "toy-0.1"},
    "protocol_recommendation": {"enabled": true, "version": "0.1.0"}
  },
  "pipeline_version": "0.1.0",
  "timestamp": "2026-05-09T08:46:00Z"
}
```

**Backend implementation (Python):**
- Query `settings.DEEPSYNAPS_QEEG_FEATURES` config dict.
- Check for required dependencies (mne, yasa, fooof) with try/except.
- Return per-feature `enabled` flag + version/reason.
- Endpoint must never crash; always return 200 with feature flags.

**Frontend wiring:**
- Mount call on page load: `api.getQEEGCapabilities()`.
- Store in component state: `{ capabilities, capabilitiesLoaded }`.
- Conditionally render sections based on capabilities:
  ```javascript
  {capabilities.features.source_localization.enabled ? (
    <SourceLocalizationPanel data={analysis.source_roi} />
  ) : (
    <div className="feature-unavailable">Source localization not available in this deployment</div>
  )}
  ```

**Test:** 
- Mock capabilities endpoint; verify sections hide when disabled.
- Verify no console errors when a feature is disabled.

---

### 2.3 Empty State Honesty (REQUIRED)

**Current state:**  
- Some pages show "Loading..." spinners indefinitely when data is unavailable.
- Some show placeholder SVGs instead of honest "not available" messages.

**Required fixes:**

1. **When data is null/unavailable:**
   ```javascript
   function renderDataAvailabilityPanel(analysis) {
     if (!analysis) {
       return emptyState(
         'qEEG analysis not started',
         'Upload an EEG file to begin analysis.',
         'info'
       );
     }
     if (analysis.analysis_status === 'failed') {
       return emptyState(
         'Analysis failed',
         `${analysis.analysis_error || 'Unknown error'}. Please upload another file.`,
         'error'
       );
     }
     if (analysis.analysis_status === 'queued' || analysis.analysis_status === 'running') {
       return spinner('Processing EEG file...');
     }
     return null; // data is ready, render normally
   }
   ```

2. **When feature is disabled but available elsewhere:**
   ```javascript
   function renderSourceROIPanel(sourceROI, capabilities) {
     if (!sourceROI) {
       return capabilities.features.source_localization.enabled
         ? emptyState('No source localization data', 'Rerun analysis with source localization enabled.')
         : emptyState('Source localization unavailable', 'Contact support to enable this feature in your deployment.');
     }
     return <SourceROIContent data={sourceROI} />;
   }
   ```

3. **When feature is intentionally not computed:**
   ```javascript
   // Connectivity only computed if n_channels > 16
   if (!analysis.connectivity && analysis.quality_metrics.channel_count <= 16) {
     return emptyState(
       'Insufficient channels for connectivity',
       `${analysis.quality_metrics.channel_count} channels detected. Connectivity requires ≥17 channels.`
     );
   }
   ```

**Test:**
- Render pages with analysis.analysis_status = "queued", "failed", null.
- Verify correct emptyState message appears.
- Verify no SVG placeholders render when data is absent.

---

### 2.4 Evidence Link Validation (REQUIRED)

**Current state:**
- `pages-qeeg-analysis.js` line ~650 renders evidence citations.
- Some citations may be missing PMID / DOI.
- No validation that URLs are well-formed.

**Required fix:**
- Validate every citation object before rendering:
  ```javascript
  function validateCitation(cite) {
    return !!(
      cite &&
      (cite.pmid || cite.doi) &&
      cite.title &&
      cite.year
    );
  }

  function renderCitationLink(cite) {
    if (!validateCitation(cite)) {
      console.warn('Invalid citation:', cite);
      return null; // skip
    }
    const url = cite.pmid 
      ? `https://pubmed.ncbi.nlm.nih.gov/${cite.pmid}`
      : cite.doi
        ? `https://doi.org/${cite.doi}`
        : null;
    return url 
      ? `<a href="${url}" target="_blank">[${cite.year}]</a>`
      : `[${cite.year}]`;
  }
  ```

**Test:**
- Render AI report with mixed valid/invalid citations.
- Verify invalid ones are skipped (no 404 links).
- Verify valid ones link to PubMed/DOI resolver.

---

### 2.5 QC Badge UI Wiring (OPTIONAL POLISH)

**Current state:**
- `quality_metrics` is returned from API but not rendered prominently.
- Badge showing pipeline version + DB version doesn't exist.

**Optional enhancement (if time permits):**
- Add footer badge to analysis page:
  ```html
  <div class="qeeg-page-footer">
    <span class="pipeline-badge">
      Pipeline: ${analysis.pipeline_version} | Norm DB: ${analysis.norm_db_version}
    </span>
  </div>
  ```

---

## 3. Class B Tasks (New APIs, DB Migrations, OSS Adapters) — DEFERRED to Agents 6–8

These are new integrations that require non-trivial backend work. **Not blocking for tonight's safety pass.**

### 3.1 Evidence-DB RAG Integration

**Status:** `qeeg_ai_router.py` exists; needs wiring to agent-brain Evidence provider.

**Task:** Call `/api/v1/agent-brain/query` with provider=`evidence` to fetch citations. (See Clinical Agent Brain section in role brief.)

**Example API call:**
```python
# Inside qeeg_ai_router.py
response = requests.post(
  f"{AGENT_BRAIN_URL}/api/v1/agent-brain/query",
  json={
    "provider": "evidence",
    "query": f"qEEG theta abnormalities in ADHD",
    "condition": "adhd",
    "limit": 10
  },
  headers={"Authorization": f"Bearer {API_KEY}"}
)
citations = response.json().get("items", [])
```

**Deferred to Agent 7 (Evidence specialist).**

---

### 3.2 Normative DB Version Migration

**Status:** Current contract uses `"toy-0.1"` placeholder normative DB.

**Task:** Plan migration path to `"nih-v1"` or real normative data (not blocking tonight).

**Deferred to Agent 8 (Data specialist).**

---

### 3.3 Connectivity Optional Addon

**Status:** Connectivity features exist in CONTRACT.md but frontend rendering incomplete.

**Task:** Wire wPLI heatmap + coherence matrix visualizations. (Not critical for safety.)

**Deferred to Agent 6 (UI specialist).**

---

## 4. Tonight's Exact Work Scope (Agent 5)

### 4.1 Files to Edit

| File | Changes | Estimate |
|------|---------|----------|
| `apps/web/src/clinical-disclaimer.js` | CREATE (new, ~50 lines) | 10 min |
| `apps/web/src/pages-qeeg-analysis.js` | Wire disclaimer; fix empty states (10 edits, ~20 lines) | 20 min |
| `apps/web/src/qeeg-ai-panels.js` | Wire disclaimer banner (1 edit, ~5 lines) | 5 min |
| `apps/web/src/qeeg-clinician-report.js` | Wire disclaimer banner (1 edit, ~5 lines) | 5 min |
| `apps/web/src/pages-qeeg-analysis-readiness.test.js` | Add 4 tests (disclaimer text, empty states, capabilities, evidence validation) | 30 min |

**Total scope: ~70 minutes work + review.**

---

### 4.2 Tests to Write

**File:** `apps/web/src/pages-qeeg-analysis-readiness.test.js` (create if missing)

**Test 1: Disclaimer text never contains forbidden words**
```javascript
test('disclaimer text excludes forbidden clinical words', () => {
  const { container } = render(<QEEGAnalysisPage />);
  const disclaimer = container.querySelector('.clinical-disclaimer-banner');
  const forbiddenWords = ['diagnosis', 'diagnostic', 'diagnose', 'treatment recommendation', 'prescribe', 'cure'];
  forbiddenWords.forEach(word => {
    expect(disclaimer.textContent).not.toMatch(new RegExp(word, 'i'));
  });
});
```

**Test 2: Empty state renders when analysis_status is "queued"**
```javascript
test('spinner renders when analysis_status is queued', () => {
  const analysis = { analysis_status: 'queued' };
  const { container } = render(<AnalysisDataPanel analysis={analysis} />);
  expect(container.querySelector('[role="status"]')).toBeInTheDocument();
  expect(container.textContent).toContain('Processing EEG file');
});
```

**Test 3: Empty state renders when analysis_status is "failed"**
```javascript
test('error message renders when analysis_status is failed', () => {
  const analysis = { analysis_status: 'failed', analysis_error: 'File corrupt' };
  const { container } = render(<AnalysisDataPanel analysis={analysis} />);
  expect(container.textContent).toContain('Analysis failed');
  expect(container.textContent).toContain('File corrupt');
});
```

**Test 4: Invalid citations are skipped (no link rendered)**
```javascript
test('invalid citations skipped when pmid and doi are missing', () => {
  const invalidCite = { title: 'Test', year: 2024 }; // no pmid/doi
  const url = renderCitationLink(invalidCite);
  expect(url).toBeNull();
});
```

---

## 5. API Contracts (No Changes Needed Tonight)

Endpoints that exist and are already tested:

| Endpoint | Method | Status | User-Facing |
|----------|--------|--------|-------------|
| `/api/v1/qeeg-analysis/upload` | POST | Live ✓ | Yes |
| `/api/v1/qeeg-analysis/{id}` | GET | Live ✓ | Yes |
| `/api/v1/qeeg-analysis/{id}/ai-report` | POST | Live ✓ | Yes |
| `/api/v1/qeeg/capabilities` | GET | Live ✓ | Yes |
| `/api/v1/qeeg-analysis/list` | GET | Live ✓ | Yes |
| `/api/v1/qeeg-analysis/{id}/compare` | POST | Live ✓ | Yes |

---

## 6. DB Schema (No Changes Needed Tonight)

Migration 037 is already merged. Columns exist:
- `aperiodic_json`
- `peak_alpha_freq_json`
- `connectivity_json`
- `asymmetry_json`
- `graph_metrics_json`
- `source_roi_json`
- `normative_zscores_json`
- `flagged_conditions` (TEXT array)
- `quality_metrics_json`
- `pipeline_version`
- `norm_db_version`

---

## 7. Evidence Providers (Deferred)

Not configuring evidence queries tonight. That's Agent 7's remit (evidence specialist).

**For later phases:**
- Provider: `evidence` (already in agent-brain, needs wiring)
- Query: flagged_conditions + top findings → PubMed/DOI abstracts
- Rendering: evidence chips in AI narrative

---

## 8. OSS Licenses (Approved for Use)

Per overnight-sprint guidance:

| Library | License | Status | Use Case |
|---------|---------|--------|----------|
| MNE-Python | BSD-3 | ✓ Approved | EEG I/O, preprocessing, source localization |
| YASA | BSD-3 | ✓ Approved | Sleep stage classification (optional) |
| autoreject | BSD-3 | ✓ Approved | Artifact rejection |
| pyEDFlib | BSD-2 | ✓ Approved | EDF parsing |
| fooof/specparam | Apache-2.0 | ✓ Approved | Aperiodic decomposition |

**Forbidden:**
- Paid APIs (no Clarifai, no AWS Rekognition medical)
- Unlicensed code (no GPL without exemption)
- Proprietary readers (no MATLAB, no Slicer plugins)

---

## 9. Implementation Order (Kanban Tasks)

**Tonight's sprint (Agents 5–8):**

1. **Agent 5 (THIS TASK):** Architecture + plan doc ✓ (now)
2. **Agent 6:** Class A UI/safety wiring (clinical-disclaimer.js, empty states, validation)
3. **Agent 7:** Evidence-DB RAG integration (call agent-brain evidence provider)
4. **Agent 8:** Deferred optional enhancements (connectivity visualization, normative DB migration)

---

## 10. Safety Checklist (Before PR)

- [ ] All disclaimer text validated for forbidden words
- [ ] Empty states render honestly (no spinner loops)
- [ ] Evidence links validate (pmid or doi present, URL well-formed)
- [ ] No hardcoded demo data marked as live analysis
- [ ] All new tests pass (npm run test)
- [ ] Build succeeds (npm run build)
- [ ] No new dependencies added
- [ ] Clinician review required before deployment

---

## 11. References

- **Existing contract:** `packages/qeeg-pipeline/CONTRACT.md`
- **Frontend:** `apps/web/src/pages-qeeg-analysis.js` (7,515 lines)
- **API router:** `apps/api/app/routers/qeeg_analysis_router.py` (4,080 lines)
- **Clinical Agent Brain:** `/api/v1/agent-brain/providers`, `/api/v1/agent-brain/query`
- **Approved OSS:** MNE-Python, YASA, autoreject, pyEDFlib, fooof/specparam

---

## 12. Confidence Level

**High (90%)** — Architecture is mature, contracts are defined, codebase is stable. Tonight's work is UI polish + safety wiring, not algorithmic changes.

---

**Author:** clinical-hub (Haiku, OpenRouter)  
**Generated:** 2026-05-09 09:15 UTC  
**Next step:** Commit this doc, open draft PR, hand off to Agent 6 for Class A UI wiring.
