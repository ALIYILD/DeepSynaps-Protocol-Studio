# Frontend UX Fix Guide - Consent Enforcement
## DeepSynaps Protocol Studio Staging

**Timeline:** 1-2 days  
**Impact:** User-friendly consent blocked dialogs

---

## Problem

**Current:** Users see raw HTTP 403 errors
**Desired:** Users see friendly guidance: "Patient consent required"

---

## Solution

### Pages Needing UX Updates (6 total)
1. qEEG Analyzer - needs consent dialog + badge
2. MRI Analyzer - needs consent dialog + badge
3. DeepTwin Dashboard - needs consent dialog + badge
4. Biometrics - needs consent dialog + badge
5. Device Manager - needs consent dialog + badge
6. Document Generator - needs consent dialog + badge

### New Components to Create
- `ConsentBlockedDialog.jsx` - shows when consent missing
- `ConsentStatusBadge.jsx` - shows consent status on each page

### Pattern
1. Catch 403 with error.data.error === "consent_denied"
2. Show ConsentBlockedDialog
3. Display ConsentStatusBadge in page header

---

## Implementation

**Phase 1:** Error handler + components (2 days)
**Phase 2:** Page integration (1 day)
**Phase 3:** Testing + QA review (1 day)

---

**See:** FRONTEND_UX_FIX_GUIDE.md for detailed spec
