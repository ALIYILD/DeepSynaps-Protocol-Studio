# Demo Mode Audit Report

**Auditor:** Clinical AI Safety Engineering
**Date:** 2025-01-21
**Scope:** All frontend and backend source files
**Status:** ACTION REQUIRED -- Demo mode not explicitly labeled

---

## 1. Executive Summary

The DeepSynaps Protocol Studio codebase contains **hardcoded demo/synthetic data** and **fake API call simulations** that are not explicitly labeled as "DEMO MODE" to the user. While the data itself is clinically realistic (based on standard patterns), the lack of explicit demo labeling could mislead users into believing they are viewing real patient data.

**Risk Level: MEDIUM** -- No clinical harm from demo data itself, but UI honesty principle is violated.

---

## 2. Findings

### 2.1 Hardcoded Demo Data in Frontend

#### Finding DM-001: DeepTwinPage.jsx -- Hardcoded Snapshot
**File:** `apps/web/src/pages-deeptwin/DeepTwinPage.jsx`
**Lines:** 45-91
**Severity:** MEDIUM

```jsx
setTimeout(() => {
  setSnapshot({
    patient_id: patientId,
    snapshot_id: "dts_demo_001",  // <-- Hardcoded demo ID
    generated_at: new Date().toISOString(),
    modality_coverage: { ... },  // <-- Hardcoded coverage data
    correlation_findings: [ ... ],  // <-- Hardcoded correlation
    confounders: [ ... ],  // <-- Hardcoded confounder
    ranked_hypotheses: [ ... ],  // <-- Hardcoded hypothesis
    forecast_status: "unavailable: no calibrated model",
    ...
  });
  setLoading(false);
}, 300);
```

**Issue:** The entire DeepTwin snapshot is hardcoded with synthetic data. The `snapshot_id` even contains "demo" in its name (`dts_demo_001`), but this is not surfaced to the user in the UI. The `setTimeout` simulates a network request without actually calling the API.

---

#### Finding DM-002: SynthesisDashboard.jsx -- Default Demo Patient
**File:** `apps/web/src/pages-deeptwin/SynthesisDashboard.jsx`
**Lines:** 48-51
**Severity:** LOW

```jsx
export default function SynthesisDashboard({
  patientId = "demo-patient-001",
  clinicianId = "clinician-001",
}) {
```

**Issue:** Default patient ID contains "demo" but this is not displayed as a demo mode banner.

---

### 2.2 Fake API Call Simulations (setTimeout)

#### Finding DM-003: ReportHandoff.jsx -- Fake Async Operations
**File:** `apps/web/src/pages-deeptwin/ReportHandoff.jsx`
**Lines:** 23, 39, 47
**Severity:** LOW

```jsx
const handleExport = async () => {
  setBusy(true);
  await new Promise((r) => setTimeout(r, 500));  // <-- Fake delay
  ...
};

const handleReportHandoff = async () => {
  setBusy(true);
  await new Promise((r) => setTimeout(r, 500));  // <-- Fake delay
  ...
};

const handleProtocolHandoff = async () => {
  setBusy(true);
  await new Promise((r) => setTimeout(r, 500));  // <-- Fake delay
  ...
};
```

**Issue:** These functions simulate async API calls with `setTimeout` but never actually call the backend. The "Export" button triggers a client-side JSON download of the current snapshot data only.

---

#### Finding DM-004: ClinicianReview.jsx -- setTimeout for Success Messages
**File:** `apps/web/src/pages-deeptwin/ClinicianReview.jsx`
**Lines:** 30, 47, 62
**Severity:** INFO

```jsx
setTimeout(() => setSuccess(null), 3000);
```

**Assessment:** **ACCEPTABLE** -- These `setTimeout` calls are for auto-dismissing success toast messages (standard UX pattern), not for faking API calls. The review actions are correctly implemented as local state updates since the demo doesn't persist to a backend.

---

#### Finding DM-005: DeepTwinPage.jsx -- setTimeout for Fake Loading
**File:** `apps/web/src/pages-deeptwin/DeepTwinPage.jsx`
**Line:** 45
**Severity:** MEDIUM

```jsx
setTimeout(() => {
  // set hardcoded snapshot data
}, 300);
```

**Issue:** Simulates a 300ms API loading delay but serves hardcoded data instead of calling the real API.

---

### 2.3 Missing DEMO_MODE Environment Variable

#### Finding DM-006: No Environment Variable for Demo Mode
**Severity:** MEDIUM

**Current State:**
- No `DEMO_MODE` or `VITE_DEMO_MODE` environment variable exists
- No conditional rendering based on demo mode
- No visual "DEMO MODE" banner or badge
- The comment `// In production, this calls the API` (DeepTwinPage.jsx:43) is the only hint

---

## 3. Backend Assessment

### Finding DM-007: Backend Timeline Engine -- seed_sample_events
**File:** `apps/api/src/deepsynaps/timeline_engine.py`
**Lines:** 43-386
**Severity:** LOW

The `seed_sample_events()` method generates realistic sample patient data for testing. This is a legitimate testing utility. **No issue** -- test data generators are standard practice and the data is never labeled as real.

### Finding DM-008: Backend -- No Demo Mode Flag
**Severity:** LOW

The backend API does not have a `demo_mode` configuration flag. All endpoints are production-ready with proper auth, consent checks, and audit logging.

---

## 4. Recommendations

### Immediate Actions

| Priority | ID | Action | Files to Modify |
|----------|----|--------|----------------|
| HIGH | R1 | Add `DEMO_MODE` environment variable support | `.env`, `api.js`, all page components |
| HIGH | R2 | Add visible "DEMO MODE" banner when in demo mode | `DeepTwinPage.jsx`, `SynthesisDashboard.jsx` |
| MEDIUM | R3 | Replace `setTimeout` fake calls with actual API calls behind demo guard | `DeepTwinPage.jsx`, `ReportHandoff.jsx` |
| MEDIUM | R4 | Add demo data watermark/badge to snapshot ID display | `DeepTwinPage.jsx` |
| LOW | R5 | Document demo mode in README | `README.md` |

### Implementation Guide

#### R1: Environment Variable Setup

```env
# .env
VITE_DEMO_MODE=true
```

```javascript
// apps/web/src/api.js
export const IS_DEMO_MODE = import.meta.env?.VITE_DEMO_MODE === "true";
```

#### R2: Demo Mode Banner Component

```jsx
// Add to DeepTwinPage.jsx header section
{IS_DEMO_MODE && (
  <div className="bg-orange-100 border-b border-orange-300 px-6 py-2">
    <div className="max-w-7xl mx-auto flex items-center gap-2">
      <span className="text-orange-600 font-bold text-sm">DEMO MODE</span>
      <span className="text-orange-700 text-xs">
        Displaying synthetic patient data for demonstration purposes only.
      </span>
    </div>
  </div>
)}
```

#### R3: API Call with Demo Fallback

```jsx
// DeepTwinPage.jsx useEffect
useEffect(() => {
  if (!patientId) return;
  setLoading(true);
  
  if (IS_DEMO_MODE) {
    // Use demo data with slight delay for UX
    setTimeout(() => {
      setSnapshot(getDemoSnapshot(patientId));
      setLoading(false);
    }, 300);
  } else {
    // Real API call
    fetch(`/api/v1/deeptwin/patients/${patientId}/snapshot?clinician_id=${clinicianId}`, {
      headers: getAuthHeaders(),
    })
      .then(handleResponse)
      .then(data => setSnapshot(data.snapshot))
      .catch(setError)
      .finally(() => setLoading(false));
  }
}, [patientId]);
```

---

## 5. Compliance Checklist

| # | Requirement | Status | Notes |
|---|-------------|--------|-------|
| 1 | Demo mode clearly labeled | FAIL | No visual demo indicator |
| 2 | `DEMO_MODE` env var exists | FAIL | Not implemented |
| 3 | Demo data uses "demo" prefix | PASS | `demo-patient-001`, `dts_demo_001` |
| 4 | No demo data in production builds | PASS | Only in frontend fallback |
| 5 | Backend does not serve demo data | PASS | API is production-ready |
| 6 | Comments indicate demo status | PARTIAL | One comment at line 43 |
| 7 | Export includes demo watermark | FAIL | Not implemented |

---

## 6. Final Verdict

**ACTION REQUIRED** (3 items)

The demo mode implementation needs explicit labeling to maintain "demo mode honesty." The hardcoded data itself is not a clinical safety risk (it carries all proper safety labels and disclaimers), but users should be explicitly informed when viewing synthetic data.

**Required Actions:**
1. Add `VITE_DEMO_MODE` environment variable (HIGH)
2. Add visible "DEMO MODE" banner to all pages showing synthetic data (HIGH)
3. Gate all `setTimeout` fake calls behind `IS_DEMO_MODE` check (MEDIUM)
