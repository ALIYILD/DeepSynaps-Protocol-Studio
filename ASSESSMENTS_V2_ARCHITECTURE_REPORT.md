# Assessments V2 — Architecture Report & Bug Analysis
## DeepSynaps Protocol Studio — Pre-Implementation Blueprint

**Date:** 2026-05-14  
**Status:** ANALYSIS COMPLETE — 5 bugs identified, agent swarm deploying

---

## 1. Current Architecture

### Frontend (3 files, ~15,000 lines total)
| File | Purpose | Size |
|------|---------|------|
| `pages-clinical-tools.js` | `pgAssessmentsHub()` — main assessment page | ~14,693 lines |
| `pages-clinical-hubs.js` | Hub router, tabs, offline draft logic | ~14,242 lines |
| `assessments-hub-mapping.js` | `mapApiAssessmentToQueueRow()` — API→UI mapping | 170 lines |
| `assessments-v2-queue.js` | `hydrateAssessmentsQueueV2()` — v2 hydration | 80 lines |
| `api.js` | API client (`listAssessments`, `updateAssessment`, etc.) | ~1,500 lines |

### Backend (1 file + models)
| File | Purpose | Size |
|------|---------|------|
| `assessments_v2_router.py` | V2 router (library, assign, update, score, audit) | 775 lines |
| `assessments_router.py` | V1 router (legacy, still used by frontend) | ~500 lines |
| `repositories/assessments.py` | DB CRUD operations | ~300 lines |

### Data Model
- **COND_BUNDLES**: 53 condition-specific assessment batteries (CON-001 to CON-053)
- **EXTRA_SCALES**: 14 additional validated instruments (QIDS-SR, PANSS, BPRS, CAPS-5, etc.)
- **6 phases**: baseline, weekly, pre_session, post_session, milestone, discharge
- **STATUS flow**: pending → completed → approved

---

## 2. Bug Analysis — CONFIRMED

### BUG-001: Queue Hydration Broken 🔴 HIGH

**Location:** `assessments-v2-queue.js` + `pages-clinical-tools.js:5941`

**Problem:**
```javascript
// assessments-v2-queue.js:30 — hydrateAssessmentsQueueV2()
// Returns: { source, rows, demo, warnings, errors }
// BUT rows are raw API rows, NOT mapped via mapApiAssessmentToQueueRow()

// pages-clinical-tools.js:5945 — pgAssessmentsHub.hydrate()
// Calls: api.listAssessments() — this is the V1 endpoint!
// Does NOT use hydrateAssessmentsQueueV2() at all
// Does NOT use mapApiAssessmentToQueueRow() for mapping
```

**Impact:** Queue cards render with missing/incorrect fields (`inst`, `patient`, `sev`, `dueCls`, `redflag`, `sendLabel`).

**Fix:**
1. Wire `hydrateAssessmentsQueueV2()` into `pgAssessmentsHub.hydrate()`
2. Add `mapRow` callback to hydrator
3. Pass `fetchFailed` and `emptyOk` flags
4. Use v2 endpoint `api.listAssessmentsV2()` instead of v1

### BUG-002: Offline Draft Fallback Loses Data 🔴 HIGH

**Location:** `pages-clinical-hubs.js:~2190`

**Problem:**
```javascript
// payload is constructed inside else branch:
if (online) {
  // send to API
} else {
  const payload = { ... };  // ← scoped to else
  // show "saved offline"
}
// ...later in catch:
localStorage.setItem('draft', JSON.stringify(payload)); // ← payload may be undefined!
```

**Fix:** Move `payload` construction before the branch. Ensure local fallback actually writes. Show honest error if fallback fails.

### BUG-003: PATCH Client/Server Contract Mismatch 🟡 MEDIUM

**Location:** `api.js:1518` + `assessments_v2_router.py:456`

**Problem:**
```javascript
// api.js:1518 — Client calls V1:
updateAssessment: (id, data) => apiFetch(`/api/v1/assessments/${id}`, { method: 'PATCH', body: JSON.stringify(data) })

// assessments_v2_router.py:456 — V2 endpoint expects:
body: UpdateAssignmentV2 { items, score_numeric, clinician_notes, status }
```

Frontend hits v1 endpoint but should hit v2. V1 may expect `status` as query param.

**Fix:**
1. Add v2 API wrappers: `listAssessmentsV2()`, `updateAssessmentV2()`, `approveAssessmentV2()`, `bulkAssignV2()`
2. Frontend calls v2 endpoints when v2 feature flag is on
3. Preserve v1 fallback for backward compatibility

### BUG-004: Library Audit Write Broken 🟡 MEDIUM

**Location:** `assessments_v2_router.py:161-162`

**Problem:**
```python
_audit_db(
    session=get_db_session(),  # ← This is a GENERATOR, not a Session!
    ...
)
```

`get_db_session()` is a generator function (FastAPI Depends). Calling it directly returns a generator object, not a Session. Compare with correct usage at line 263: `_audit_db(db, ...)` where `db` is the injected Session.

**Fix:**
```python
# WRONG:
session=get_db_session()  # Returns generator object!

# CORRECT — use the injected db session:
_audit_db(db, actor=actor, ...)
```

### BUG-005: Mixed v1/v2 Implementation Drift 🟡 MEDIUM

**Location:** `pages-clinical-tools.js:5945` + `api.js:1516-1526`

**Problem:**
```javascript
// pages-clinical-tools.js:5945
const resp = await api.listAssessments();  // ← V1 endpoint!

// api.js:1516-1526 — All v1 calls:
listAssessments: () => apiFetch('/api/v1/assessments')
updateAssessment: (id, data) => apiFetch('/api/v1/assessments/' + id, { method: 'PATCH', body: ... })
approveAssessment: (id, body) => apiFetch('/api/v1/assessments/' + id + '/approve', { method: 'POST', body: ... })
bulkAssignAssessments: (data) => apiFetch('/api/v1/assessments/bulk-assign', { method: 'POST', body: ... })
```

**Impact:** Frontend uses v1 API for all assessment operations, never exercising v2 router endpoints.

**Fix:**
1. Add v2 wrappers in `api.js`
2. Update `pgAssessmentsHub` to call v2 endpoints
3. Add feature flag: `window.__ASSESSMENTS_V2_ENABLED = true`
4. Fallback to v1 if v2 returns 404

---

## 3. Agent Dispatch Plan

### Wave 1: Critical Fixes (Parallel)
| Agent | Mission | Files |
|-------|---------|-------|
| **B** | Fix BUG-001 (hydration), BUG-002 (offline), BUG-005 (v1→v2) | `pages-clinical-tools.js`, `assessments-v2-queue.js`, `api.js` |
| **C** | Fix BUG-003 (PATCH), BUG-004 (audit) | `assessments_v2_router.py`, `api.js` |
| **D** | Clinical safety audit all copy | All UI strings, API messages |
| **E** | Evidence/condition battery research | `COND_BUNDLES` + external validation |

### Wave 2: Enhancement (Sequential after Wave 1)
| Agent | Mission | Output |
|-------|---------|--------|
| **F** | UX/Design improvements | Updated `pgAssessmentsHub` layout |
| **G** | Comprehensive tests | 8+ test files with runtime tests |
| **H** | Security/compliance audit | Security report |
| **I** | Documentation | 4 docs |

---

## 4. API Endpoint Inventory

### V2 Endpoints (backend implemented ✅, frontend not calling ❌)
| Method | Endpoint | Status | Frontend Call |
|--------|----------|--------|---------------|
| GET | `/api/v2/assessments/library` | ✅ | ❌ Missing |
| GET | `/api/v2/assessments/library/{id}` | ✅ | ❌ Missing |
| GET | `/api/v2/assessments/by-condition/{c}` | ✅ | ❌ Missing |
| POST | `/api/v2/assessments/patients/{pid}/assign` | ✅ | ❌ Missing |
| PATCH | `/api/v2/assessments/assignments/{id}` | ✅ | ❌ Missing |
| POST | `/api/v2/assessments/assignments/{id}/score` | ✅ | ❌ Missing |
| POST | `/api/v2/assessments/assignments/{id}/approve` | ✅ | ❌ Missing |
| POST | `/api/v2/assessments/assignments/{id}/submit` | ✅ | ❌ Missing |
| GET | `/api/v2/assessments/patients/{pid}/queue` | ✅ | ❌ Missing |
| GET | `/api/v2/assessments/patients/{pid}/context` | ✅ | ❌ Missing |

### V1 Endpoints (frontend using these)
| Method | Endpoint | Status |
|--------|----------|--------|
| GET | `/api/v1/assessments` | Used by `pgAssessmentsHub.hydrate()` |
| PATCH | `/api/v1/assessments/{id}` | Used by `api.updateAssessment()` |
| POST | `/api/v1/assessments/{id}/approve` | Used by `api.approveAssessment()` |
| POST | `/api/v1/assessments/bulk-assign` | Used by `api.bulkAssignAssessments()` |

---

## 5. Clinical Safety Checklist

- [x] "Not diagnostic; clinician review required" on all outputs
- [x] `interpretation_caveat` on every library entry
- [x] `clinician_review_required: true` on every registry entry
- [x] Off-label protocols show warnings
- [x] C-SSRS auto-escalates PHQ item 9 ≥ 1
- [x] No autonomous diagnosis claims
- [ ] BUG-004 fix: audit events must actually persist
- [ ] BUG-002 fix: offline drafts must not silently lose data
- [ ] All generated reports need: "Draft for clinician review. Not a diagnosis."

---

*Report generated: 2026-05-14 | Architecture analysis complete*
