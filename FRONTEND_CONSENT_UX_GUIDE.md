# Frontend Consent UX Fixes - Implementation Guide
## DeepSynaps Protocol Studio Staging

**Objective:** Replace raw HTTP 403 errors with user-friendly consent guidance

**Timeline:** 1-2 days  
**Impact:** Improved UX for clinicians and patients when consent is missing

---

## Problem Statement

**Current behavior:**
- User clicks "Run Analysis" on qEEG/MRI/DeepTwin page
- API returns 403 (Forbidden) due to missing/denied patient consent
- Frontend shows raw error: "API error 403" or generic "Unknown error"
- Clinician is confused about what to do

**Required behavior:**
- User clicks "Run Analysis"
- API returns 403
- Frontend shows clear message:
  ```
  🔒 Consent Required
  Patient consent is required before this workflow can run.
  Please review or request consent before continuing.
  ```
- Clinician knows exactly what to do next

---

## Solution Overview

1. **Create consent-error-handler.js** — Utility module for consent error detection and messaging ✅ DONE
2. **Update error handlers** in each page (qEEG, MRI, DeepTwin, biometrics, device sync, document generation)
3. **Disable run buttons** when consent is missing
4. **Add consent status badges** to page headers
5. **Test in staging** with missing/valid consent scenarios

---

## Component: consent-error-handler.js

**Location:** `apps/web/src/consent-error-handler.js`  
**Status:** ✅ Created

**Exports:**
- `isConsentDenialError(err)` — Detects if error is 403 consent denial
- `getConsentDenialMessage(workflowName)` — Returns HTML message for user
- `handleAPIError(err, workflowName)` — Wraps error handling with consent detection
- `renderConsentStatusBadge(consentGranted)` — Renders ✓/⚠ badge
- `disableRunButton(btn, reason, tooltip)` — Disables button with reason
- `enableRunButton(btn)` — Enables button

**Usage in pages:**
```javascript
import { handleAPIError, disableRunButton } from './consent-error-handler.js';

try {
  const result = await api.uploadQEEGAnalysis(fd);
  // ... success
} catch (err) {
  const { isConsent, html, message } = handleAPIError(err, 'qEEG Analysis');
  statusEl.innerHTML = html;  // Shows consent message if applicable
  showToast(message, 'error');
}
```

---

## Implementation Checklist

### qEEG Page (`pages-qeeg-analysis.js`)

**Tasks:**
- [ ] Import `consent-error-handler.js`
- [ ] Update `uploadQEEGAnalysis()` error handler (line ~4750)
  - Replace generic error message with `handleAPIError(err, 'qEEG Analysis')`
- [ ] Update `runQEEGQualityCheck()` error handler
- [ ] Add consent status badge to page header
- [ ] Disable "Run Analysis" button until consent verified

**Files to modify:**
- `apps/web/src/pages-qeeg-analysis.js` (lines 4750-4761 for upload error handler)

**Expected change:**
```javascript
// BEFORE:
statusEl.innerHTML = '<div style="color:var(--red);...>' + esc(msg) + '</div>';

// AFTER:
const { html } = handleAPIError(err, 'qEEG Analysis');
statusEl.innerHTML = html;
```

### MRI Page (`pages-mri-analysis.js`)

**Tasks:**
- [ ] Import `consent-error-handler.js`
- [ ] Update MRI upload/analysis error handlers
  - `api.uploadMRIAnalysis()`
  - `api.runMRIProcessing()`
  - `api.generateMRIReport()`
- [ ] Add consent status badge
- [ ] Disable "Upload" and "Process" buttons until consent verified

**Files to modify:**
- `apps/web/src/pages-mri-analysis.js`

### DeepTwin Page (`pages-deeptwin.js`)

**Tasks:**
- [ ] Import `consent-error-handler.js`
- [ ] Update simulation/generation error handlers
  - `api.runDeepTwinSimulation()`
  - `api.generateDeepTwinReport()`
- [ ] Add consent status badge
- [ ] Disable "Simulate" and "Generate" buttons

**Files to modify:**
- `apps/web/src/pages-deeptwin.js`

### Biometrics Page (`pages-biometrics.js`)

**Tasks:**
- [ ] Import `consent-error-handler.js`
- [ ] Update biometric analysis error handlers
  - `api.startBiometricAnalysis()`
- [ ] Add consent status badge
- [ ] Disable "Analyze" button

**Files to modify:**
- `apps/web/src/pages-biometrics.js` (or equivalent)

### Device Sync Page (`pages-device-sync.js`)

**Tasks:**
- [ ] Import `consent-error-handler.js`
- [ ] Update device sync error handlers
  - `api.syncDeviceData()`
- [ ] Add consent status badge
- [ ] Disable "Sync" button

**Files to modify:**
- `apps/web/src/pages-device-sync.js` (or equivalent)

### Document/Protocol/Report Generation

**Tasks:**
- [ ] Find document generation endpoints
- [ ] Update error handlers
  - `api.generateProtocol()`
  - `api.generateReport()`
  - `api.generateDocument()`
- [ ] Add consent status badge
- [ ] Disable "Generate" button

**Files to modify:**
- Depends on which page(s) handle document generation

---

## Copy Text (Required)

### When Consent Denied

**Title:** Patient consent is required before this workflow can run.  
**Body:** Please review or request consent before continuing.  
**Tone:** Clear, action-oriented, not alarming

### Button Tooltip (Hover)

**Text:** "Consent required - contact clinical team"  
**Purpose:** Explain why button is disabled

---

## Testing Checklist

### Test Scenario 1: Upload without consent
1. Patient has no consent record
2. Click "Upload" on qEEG page
3. Upload file
4. Expected: Show consent message (not HTTP 403 error)
5. Verify: User knows they need to get consent first

### Test Scenario 2: Run analysis without consent
1. qEEG recording exists but no consent
2. Click "Run Analysis"
3. Expected: Show consent message, button disabled
4. Verify: Message is clear

### Test Scenario 3: Valid consent allows workflow
1. Patient has valid consent
2. Click "Upload"/"Run Analysis"/"Generate Report"
3. Expected: Workflow proceeds normally
4. Verify: No consent messages shown

### Test Scenario 4: All 6 workflows
Test the 6 required workflows:
- [ ] qEEG (upload + analyze)
- [ ] MRI (upload + process + report)
- [ ] DeepTwin (simulate + report)
- [ ] Biometrics (analyze)
- [ ] Device sync (sync)
- [ ] Document generation (generate)

Each should show consent message when denied, proceed when granted.

---

## Rollback Plan

If new UX causes issues:
1. Revert import of `consent-error-handler.js` from affected pages
2. Return to generic error messages (safe fallback already in place)
3. No data loss or backend impact
4. Quick recovery (5 min redeploy)

---

## Notes

- **Consent status badge:** Shows at page load, updates if consent changes
- **Button state:** Disable when loading or consent missing, enable when ready
- **Error message:** Shown in both toast notification and inline status area
- **Logging:** Consider adding analytics to track consent denial flows (future enhancement)
- **i18n:** Copy text should be added to i18n system once defined (e.g., consent_required_title)

---

## Success Criteria

✅ Users no longer see raw HTTP error codes  
✅ Consent required message is clear and actionable  
✅ Buttons are disabled until consent verified  
✅ All 6 workflows tested and working  
✅ Staging smoke tests pass  
✅ Clinical team signs off on UX  

---

## Timeline Estimate

- **consent-error-handler.js:** ✅ Done (0.5 hr)
- **Update 6 pages:** 1-2 hrs
- **Test all workflows:** 1 hr
- **Fix any issues:** 30 min buffer
- **Total:** ~3-4 hrs (should fit in 1-2 day window with parallel work)

