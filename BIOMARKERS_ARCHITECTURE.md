# Biomarkers — Architecture Report & Bug Analysis
## DeepSynaps Protocol Studio — Clinical Biomarker Intelligence Workspace

**Date:** 2026-05-14  
**Status:** ANALYSIS COMPLETE — 4 bugs confirmed, agent swarm deploying

---

## 1. Current Architecture

### Frontend (2 files, ~1,910 lines)
| File | Purpose | Size |
|------|---------|------|
| `pages-biomarkers.js` | Main biomarkers page — Reference tab + Patient Workspace | 1,003 lines |
| `pages-biomarkers-mri.js` | MRI Neuromarkers tab — signs library, evidence, viewer | 907 lines |

### Backend (16 router files, ~600KB)
| Module | Router | Size |
|--------|--------|------|
| MRI | `mri_analysis_router.py` | 79,478 bytes |
| qEEG | `qeeg_analysis_router.py` | 187,328 bytes |
| Wearables | `wearable_router.py` + `wearables_workbench_router.py` | 59,171 bytes |
| Evidence | `evidence_router.py` | 124,001 bytes |
| qEEG AI | `qeeg_ai_router.py` | 10,777 bytes |
| qEEG Copilot | `qeeg_copilot_router.py` | 22,706 bytes |

### 3 Frontend Tabs
| Tab | ID | Status |
|-----|-----|--------|
| Reference | `reference` | ✅ Neuro-biomarker catalog with 6,753 curated anchors |
| MRI Neuromarkers | `mri` | ⚠️ BUG-001, BUG-003: API contract broken, demo fallback |
| Patient Workspace | `workspace` | ⚠️ BUG-002, BUG-004: Wrong response shape, errors swallowed |

---

## 2. Bug Analysis — CONFIRMED

### BUG-001: MRI tab uses wrong API contract 🔴 HIGH

**File:** `pages-biomarkers-mri.js:525-526`

**Current broken code:**
```javascript
const res = await api.get(`/api/neuro-signs/?${params}`);  // ← api.get DOES NOT EXIST
allSigns = res.data?.items || [];  // ← Axios-style .data, client returns JSON directly
```

**API client exports:** `apiFetch`, `apiFetchWithRetry`, `apiPost`, `apiPatch`, `apiDelete` — NO `api.get`  
**Client returns:** Parsed JSON directly (not `{data: ...}` wrapper)

**Impact:** Signs never load from API. Falls through to catch → DEMO_SIGNS.

**Fix:**
```javascript
// Use apiFetch (the real exported function):
const data = await apiFetch(`/api/v1/neuro-signs/?${params}`);
allSigns = data?.items || [];
```

### BUG-002: Patient workspace expects wrong MRI shape 🔴 HIGH

**Frontend:** `pages-biomarkers.js:665`
```javascript
mriItems = mriRes?.items || (Array.isArray(mriRes) ? mriRes : []) || [];
// ← expects .items
```

**Backend:** `mri_analysis_router.py:1211`
```python
return {"patient_id": patient_id, "analyses": analyses}
# ← returns .analyses, NOT .items
```

**Impact:** MRI count always shows 0. Patient workspace shows "No MRI data" even when analyses exist.

**Fix (frontend):**
```javascript
// Normalize: support both .analyses (backend) and .items (legacy/demo):
const raw = mriRes?.analyses || mriRes?.items || (Array.isArray(mriRes) ? mriRes : []) || [];
mriItems = raw;
```

### BUG-003: MRI tab silently substitutes demo signs 🔴 HIGH

**File:** `pages-biomarkers-mri.js:516-530`

**Current broken code:**
```javascript
async function loadSigns() {
    if (isDemoSession()) { allSigns = DEMO_SIGNS; renderList(allSigns); return; }
    try {
        const res = await api.get(`/api/neuro-signs/?${params}`);  // ← fails (BUG-001)
        allSigns = res.data?.items || [];
    } catch (err) {
        allSigns = DEMO_SIGNS;  // ← SILENT fallback for ANY error!
        console.warn('[mri] failed to load signs, using demo fallback:', err);
    }
}
```

**Impact:** Production users see fake demo signs (hummingbird, Mickey Mouse, hot cross bun) as if they were real clinical data.

**Fix:**
```javascript
catch (err) {
    if (isDemoSession()) {
        allSigns = DEMO_SIGNS;
        container.innerHTML = '<div class="mri-demo-banner">Demo mode — showing sample signs</div>' + renderList(allSigns);
    } else {
        container.innerHTML = '<div class="mri-error">Neuromarker library unavailable. ' + 
            (err?.message || 'Please try again later.') + '</div>';
    }
}
```

### BUG-004: Patient workspace hides all modality failures 🟡 MEDIUM

**File:** `pages-biomarkers.js:658-665`

**Current broken code:**
```javascript
const [wearRes, qeegRes, mriRes] = await Promise.all([
    api.getPatientWearableSummary(selectedId, 30).catch(() => null),  // ← swallows error
    api.listPatientQEEGAnalyses(selectedId, { limit: 20 }).catch(() => null),  // ← swallows error
    api.listPatientMRIAnalyses(selectedId).catch(() => null),  // ← swallows error
]);
qeegItems = qeegRes?.items || ... || [];  // ← null → empty array → "No data"
mriItems = mriRes?.items || ... || [];  // ← null → empty array → "No data"
```

**Impact:** Can't distinguish between:
- No data (patient has no analyses)
- API failed (server error)
- Permission denied
- Consent missing
- Loading still in progress

**Fix:**
```javascript
const results = { wearable: { status: 'loading' }, qeeg: { status: 'loading' }, mri: { status: 'loading' } };

try {
    const wearRes = await api.getPatientWearableSummary(selectedId, 30);
    results.wearable = { status: 'loaded', data: wearRes, items: wearRes?.items || [] };
} catch (err) {
    results.wearable = { status: 'error', error: err?.message || 'Failed to load', code: err?.status };
}
// ... same pattern for qeeg and mri

// In render: show different UI per status
// 'loading' → spinner
// 'loaded' + empty → "No data recorded"
// 'loaded' + data → show items
// 'error' + 403 → "Permission denied"
// 'error' + 401 → "Consent required"
// 'error' + 5xx → "Service temporarily unavailable"
```

---

## 3. API Contract Normalization Required

| Endpoint | Current Return | Frontend Expects | Fix |
|----------|---------------|-----------------|-----|
| `GET /api/v1/mri/patients/{id}/analyses` | `{patient_id, analyses:[]}` | `.items` | Normalize to `.analyses` in frontend |
| `GET /api/v1/neuro-signs` | `{items:[]}` (presumed) | `res.data.items` | Use `apiFetch`, read `.items` |
| `GET /api/v1/wearable/patients/{id}/summary` | `{items:[]}` (presumed) | `.items` | Verify contract |
| `GET /api/v1/qeeg/patients/{id}/analyses` | `{items:[]}` (presumed) | `.items` | Verify contract |

---

## 4. Honest Degraded States Matrix

| State | Visual | Message |
|-------|--------|---------|
| Loading | Spinner | "Loading biomarkers..." |
| Loaded + data | Cards | Show data with provenance labels |
| Loaded + empty | Gray icon | "No [modality] data recorded for this patient" |
| API failed | Red banner | "[Modality] service temporarily unavailable" |
| 403 Forbidden | Yellow lock | "Permission denied — contact administrator" |
| 401 Consent missing | Blue info | "Patient consent required for [modality]" |
| 404 Not found | Gray info | "[Modality] module not enabled for this clinic" |
| Demo fallback | Orange banner | "Demo mode — sample data only" |

*Report generated: 2026-05-14*
