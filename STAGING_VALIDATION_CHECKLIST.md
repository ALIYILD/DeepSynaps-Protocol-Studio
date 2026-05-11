# Staging Validation Checklist — Neuro MRI Signs Library

**Environment:** Staging deployment  
**Date:** _____________  
**QA Lead:** _____________  
**Status:** ☐ Pass ☐ Fail ☐ Partial

---

## Phase 1: Pre-Deployment

- [ ] All code reviewed and approved
- [ ] PR merged to main branch
- [ ] Database backup created
- [ ] Staging environment verified ready
- [ ] Migration scripts tested locally
- [ ] Seed data idempotency confirmed

---

## Phase 2: Database & Migration

### Migration Execution

- [ ] Migration runs without errors
- [ ] No rollback required
- [ ] All 3 tables created: `neuro_signs`, `case_neuro_signs`, `neuro_sign_annotations`
- [ ] All indexes created successfully
- [ ] Constraints enforced (unique, check, foreign key)

**Evidence:**
```sql
SELECT COUNT(*) FROM neuro_signs;                    -- Should be 18
SELECT COUNT(*) FROM case_neuro_signs;               -- Should be 0
SELECT COUNT(*) FROM neuro_sign_annotations;         -- Should be 0
```

### Seed Data

- [ ] 18 signs seeded into `neuro_signs`
- [ ] All categories present (7 total): neurodegenerative (4), metabolic (2), developmental (1), demyelinating (3), vascular (4), tumoral (2), cerebellar (2)
- [ ] Each sign has: name, slug, category, modality, sequences, anatomy, description, caveat, reporting_phrase
- [ ] All signs have `is_published = true`
- [ ] No duplicate slugs
- [ ] Timestamps (created_at, updated_at) set correctly

**Evidence:**
```sql
SELECT category, COUNT(*) FROM neuro_signs GROUP BY category;
-- Should show: neurodegenerative 4, metabolic 2, ...

SELECT COUNT(*) FROM neuro_signs WHERE reporting_phrase IS NULL;
-- Should be 0 (all have reporting phrases)
```

---

## Phase 3: API Endpoints

### List & Search

**Endpoint:** `GET /api/neuro-signs/`

- [ ] Returns 200 OK
- [ ] Response includes: items, total, skip, limit
- [ ] `total` = 18
- [ ] Items are NeuroSignResponse objects with full data
- [ ] Pagination works: `?skip=0&limit=5` returns 5 items
- [ ] Search works: `?q=hummingbird` returns Hummingbird Sign
- [ ] Search case-insensitive: `?q=HUMMINGBIRD` returns same result
- [ ] Filter by category: `?category=neurodegenerative` returns 4 signs
- [ ] Filter by modality: `?modality=MRI` returns all signs (all are MRI)
- [ ] Filter by sequence: `?sequence=T1` returns signs with T1 in sequences
- [ ] Filter by anatomy: `?anatomy=midbrain` returns relevant signs
- [ ] Multiple filters combined: `?category=neurodegenerative&anatomy=midbrain` works

**Test commands:**
```bash
curl http://staging-api/api/neuro-signs/ | jq '.total'                           # 18
curl http://staging-api/api/neuro-signs/?q=hummingbird | jq '.items[0].name'     # Hummingbird Sign
curl http://staging-api/api/neuro-signs/?category=metabolic | jq '.total'        # 2
```

### Detail Endpoint

**Endpoint:** `GET /api/neuro-signs/{sign_id}`

- [ ] Returns 200 OK for valid sign ID
- [ ] Returns 404 for invalid ID
- [ ] Can fetch by ID: `GET /api/neuro-signs/sign_hummingbird`
- [ ] Can fetch by slug: `GET /api/neuro-signs/hummingbird-sign`
- [ ] Response includes all fields: name, category, visual_description, pathophysiology_explanation, differential_diagnosis, clinical_caveat, reporting_phrase, source_refs, etc.
- [ ] Response does not include unpublished signs (404 if `is_published=false`)

**Test commands:**
```bash
curl http://staging-api/api/neuro-signs/sign_hummingbird | jq '.name'           # Hummingbird Sign
curl http://staging-api/api/neuro-signs/hummingbird-sign | jq '.slug'           # hummingbird-sign
curl -w "%{http_code}" http://staging-api/api/neuro-signs/nonexistent | grep 404 # 404
```

### Admin: Create Sign (Admin-Only)

**Endpoint:** `POST /api/neuro-signs/` (requires admin role)

- [ ] Non-admin user gets 403 Forbidden
- [ ] Admin user can create new sign (201 Created)
- [ ] Slug must be unique (409 Conflict if duplicate)
- [ ] Created sign has: id, created_at, updated_at, created_by

**Test commands:**
```bash
# As non-admin
curl -X POST http://staging-api/api/neuro-signs/ -H "Authorization: Bearer $USER_TOKEN" \
  -d '{"name":"Test","slug":"test"}' | jq '.detail'  # Should contain "Admin"

# As admin
curl -X POST http://staging-api/api/neuro-signs/ -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"name":"New Sign","slug":"new-sign","category":"test","modality":"MRI"}' \
  | jq '.id'  # Should return UUID
```

### Admin: Update Sign (Admin-Only)

**Endpoint:** `PUT /api/neuro-signs/{sign_id}` (requires admin role)

- [ ] Non-admin user gets 403 Forbidden
- [ ] Admin user can update existing sign (200 OK)
- [ ] Partial update works (update only provided fields)
- [ ] Updated sign preserves old fields (merge, not replace)
- [ ] `updated_at` changes, `updated_by` set

**Test commands:**
```bash
curl -X PUT http://staging-api/api/neuro-signs/sign_hummingbird \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"clinical_caveat":"Updated caveat"}' | jq '.updated_at'  # Should be recent timestamp
```

### Case Integration: Attach Sign

**Endpoint:** `POST /api/neuro-signs/case/{case_id}/attach` (requires clinician role)

- [ ] Clinician can attach sign to case (201 Created)
- [ ] Returns: id, case_id, neuro_sign_id, clinician_id, confidence, note, created_at
- [ ] Confidence defaults to 'possible' if not provided
- [ ] Duplicate constraint: attaching same sign+case+clinician twice fails (409 Conflict)
- [ ] Patient user cannot attach (403 Forbidden)
- [ ] Guest user cannot attach (403 Forbidden)

**Test commands:**
```bash
# As clinician
curl -X POST http://staging-api/api/neuro-signs/case/patient-case-123/attach \
  -H "Authorization: Bearer $CLINICIAN_TOKEN" \
  -d '{"neuro_sign_id":"sign_hummingbird","confidence":"probable","note":"Test note"}' \
  | jq '.id'  # Returns UUID

# Try duplicate
curl -X POST http://staging-api/api/neuro-signs/case/patient-case-123/attach \
  -H "Authorization: Bearer $CLINICIAN_TOKEN" \
  -d '{"neuro_sign_id":"sign_hummingbird"}' \
  | jq '.detail'  # Should contain "already attached"
```

### Case Integration: Get Case Signs

**Endpoint:** `GET /api/neuro-signs/case/{case_id}`

- [ ] Returns array of CaseNeuroSignResponse objects
- [ ] Returns empty array if no signs attached to case
- [ ] Returns all signs attached by any clinician for that case
- [ ] Ordered by created_at (newest first)

**Test commands:**
```bash
curl http://staging-api/api/neuro-signs/case/patient-case-123 | jq '.[] | .neuro_sign_id'
```

### Case Integration: Update Case Sign

**Endpoint:** `PUT /api/neuro-signs/case/{case_sign_id}`

- [ ] Clinician can update confidence level (200 OK)
- [ ] Clinician can update note (200 OK)
- [ ] Clinician can mark as inserted_into_report (200 OK)
- [ ] Partial update works (update only provided fields)
- [ ] `updated_at` changes

**Test commands:**
```bash
curl -X PUT http://staging-api/api/neuro-signs/case/case-sign-uuid \
  -H "Authorization: Bearer $CLINICIAN_TOKEN" \
  -d '{"confidence":"characteristic","note":"Updated note"}' \
  | jq '.confidence'  # Should be "characteristic"
```

### Case Integration: Remove Sign from Case

**Endpoint:** `DELETE /api/neuro-signs/case/{case_sign_id}`

- [ ] Clinician can delete case sign (204 No Content)
- [ ] Case sign record removed from database
- [ ] Subsequent GET returns 404 or empty

**Test commands:**
```bash
curl -X DELETE http://staging-api/api/neuro-signs/case/case-sign-uuid \
  -H "Authorization: Bearer $CLINICIAN_TOKEN" \
  -w "%{http_code}"  # Should be 204
```

### Report Insertion

**Endpoint:** `POST /api/neuro-signs/case/{case_id}/insert-report`

- [ ] Marks case_sign.inserted_into_report = true (200 OK)
- [ ] Returns reporting phrase (phrase field in response)
- [ ] Returns phrase from NeuroSign.reporting_phrase by default
- [ ] Allows custom_text override (if provided in payload)
- [ ] Phrase is NOT auto-injected into final report (clinician receives phrase to paste manually)

**Test commands:**
```bash
curl -X POST http://staging-api/api/neuro-signs/case/patient-case-123/insert-report \
  -H "Authorization: Bearer $CLINICIAN_TOKEN" \
  -d '{"case_sign_id":"case-sign-uuid"}' \
  | jq '.phrase'  # Should return the reporting phrase
```

---

## Phase 4: Frontend Component

### MRI Neuromarkers Tab

- [ ] Tab renders without console errors
- [ ] Tab title: "MRI Neuromarkers"
- [ ] Tab subtitle includes disclaimer: "Pattern-recognition aid only"
- [ ] Disclaimer is non-dismissible (not a close button, not a checkbox)

### Search & Filter Controls

- [ ] Search input present and functional
- [ ] Search placeholder: "Search by name, description, or anatomy..."
- [ ] Search button triggers API call
- [ ] Enter key in search box triggers search
- [ ] Category dropdown with options: All, Neurodegenerative, Metabolic, etc.
- [ ] Modality dropdown with options: All, MRI, CT, Angiography
- [ ] Sequence dropdown with options: All, T1, T2, FLAIR, DWI, SWI, etc.
- [ ] Filters are cumulative (all selected filters apply together)

### Sign Cards

- [ ] Grid layout displays cards responsively (4 columns on desktop, fewer on mobile)
- [ ] Each card shows:
  - [ ] Sign name (bold, large text)
  - [ ] Category badge with appropriate color
  - [ ] Modality, anatomy, sequences as metadata
  - [ ] Visual description excerpt
  - [ ] Primary conditions list
  - [ ] "View Detail" button
  - [ ] "Attach to Case" button (if clinician context available)
- [ ] Hover effect on cards (darker background, shadow)
- [ ] All 18 signs display in initial load (or paginated)

### Detail Modal

**Trigger:** Click "View Detail" on any sign card

- [ ] Modal opens without full page reload
- [ ] Modal header shows sign name
- [ ] Modal has close button (X) in top-right
- [ ] Modal closes on ESC key
- [ ] Modal closes on close button click
- [ ] Modal body shows:
  - [ ] Category & Anatomy section (category, modality, anatomy, sequences)
  - [ ] Clinical Information section (primary conditions, associated conditions)
  - [ ] Visual Description section (full text)
  - [ ] Pathophysiology section (full text)
  - [ ] Differential Diagnosis section (full text)
  - [ ] **Clinical Caveat section** (prominent, red/warning color, prominent in UI)
  - [ ] Reporting Phrase section (textarea, read-only, with "Copy Phrase" button)
  - [ ] Evidence Notes section
  - [ ] Sources section (list of references with year and link if available)
- [ ] "Copy Phrase" button copies reporting phrase to clipboard
- [ ] Confirmation message shown when copied ("Phrase copied to clipboard!")
- [ ] No auto-population of report fields (user must manually paste)

### Clinical Safety Display

- [ ] Disclaimer visible at top of MRI Neuromarkers tab
- [ ] Disclaimer visible in detail modal under "Clinical Caveat"
- [ ] Disclaimer text: "Pattern-recognition aid only; not a diagnostic tool. Clinician review required. Not automatically inserted into clinical reports."
- [ ] Disclaimer cannot be dismissed (no close button, not optional)
- [ ] Red warning color used for disclaimer sections
- [ ] Warning styling consistent across all pages

### No Fake Success Messages

- [ ] No auto-success popup when sign loads
- [ ] No "Sign successfully loaded" message
- [ ] No "Report updated" message when detail modal opens
- [ ] No "Sign attached" message until explicitly confirmed
- [ ] All user actions require explicit click/confirmation

### Case Attachment UI (Foundation)

- [ ] "Attach to Case" button present on sign cards
- [ ] Clicking "Attach to Case" shows instructions (placeholder for now)
- [ ] UI indicates: "To attach sign to a patient case, use the MRI Analysis workflow"
- [ ] No errors when clicking button

---

## Phase 5: Permissions & Access Control

### Role-Based Access

- [ ] **Admin user:**
  - [ ] Can POST /api/neuro-signs/ (create sign) → 201
  - [ ] Can PUT /api/neuro-signs/{id} (update sign) → 200
  - [ ] Can view sign library → 200

- [ ] **Clinician user:**
  - [ ] Can GET /api/neuro-signs/ (view library) → 200
  - [ ] Cannot POST /api/neuro-signs/ (create sign) → 403
  - [ ] Cannot PUT /api/neuro-signs/{id} (update sign) → 403
  - [ ] Can POST /api/neuro-signs/case/{id}/attach (attach sign) → 201

- [ ] **Patient user:**
  - [ ] Can GET /api/neuro-signs/ (view library, if enabled) → 200 or 403
  - [ ] Cannot POST /api/neuro-signs/case/{id}/attach (attach sign) → 403

- [ ] **Guest user:**
  - [ ] Cannot access /api/neuro-signs/ endpoints → 401 or 403

### Audit Trail

- [ ] Case attachment records: case_id, neuro_sign_id, clinician_id, created_at
- [ ] Each attachment is traceable to clinician who created it
- [ ] Clinician ID from JWT token (not user-provided)
- [ ] Cannot spoof clinician ID (auth enforcement)

---

## Phase 6: Clinical Safety Workflows

### Report Insertion Workflow

- [ ] Clinician views sign detail modal
- [ ] Clinician clicks "Copy Phrase" button
- [ ] Phrase is copied to clipboard (no auto-paste to report)
- [ ] Clinician manually navigates to patient report (separate system)
- [ ] Clinician manually pastes phrase into report
- [ ] **Phrase is fully editable** in report (not locked)
- [ ] Clinician can delete, modify, or re-word the phrase
- [ ] **No auto-injection into final report** (clinician must confirm report generation)
- [ ] Report generation step is explicit (button click, confirmation)
- [ ] Audit trail records insertion: `{case_sign_id, inserted_at, action: 'inserted_into_report'}`

### Disclaimer Enforcement

- [ ] On every page load, disclaimer is visible
- [ ] Disclaimer cannot be hidden by user action
- [ ] Disclaimer persists even after interaction
- [ ] No "Don't show this again" option
- [ ] No X close button on disclaimer
- [ ] Red/warning styling applied

### No Automatic Diagnosis

- [ ] Attaching sign to case does NOT automatically suggest diagnosis
- [ ] Report insertion does NOT auto-populate differential diagnoses
- [ ] No "recommended action" messages based on attached signs
- [ ] All interpretations are manual (clinician-driven)

---

## Phase 7: Data Integrity & Constraints

### Unique Constraints

- [ ] Cannot attach same sign twice to same case by same clinician
  - Test: Attach sign, try again, expect 409 Conflict
- [ ] Slug must be unique across all signs
  - Test: Try to create two signs with same slug, expect 409

### Referential Integrity

- [ ] Cannot attach non-existent sign to case
  - Test: POST with fake sign_id, expect 404
- [ ] Cannot reference non-existent case_sign in update
  - Test: PUT to non-existent case_sign_id, expect 404

### Timestamps

- [ ] `created_at` is set when record created (auto-set by DB)
- [ ] `updated_at` is set when record created and updated (auto-updated)
- [ ] Timestamps are in UTC/correct timezone
- [ ] Timestamps are immutable (cannot be set by user)

---

## Phase 8: No Regressions

- [ ] Existing Biomarkers QEEG tab still works
- [ ] QEEG tab data loads correctly
- [ ] No 500 errors on any existing endpoints
- [ ] Database backup/restore works
- [ ] API health check passes
- [ ] Startup logs show no errors
- [ ] No database connection issues

**Test:**
```bash
curl http://staging-api/health | jq '.status'  # Should be "healthy"
```

---

## Phase 9: Performance

- [ ] List endpoint returns in <500ms with 18 signs
- [ ] Detail endpoint returns in <200ms
- [ ] Search returns in <500ms
- [ ] Frontend tab loads and renders in <2s
- [ ] Detail modal opens in <500ms
- [ ] No N+1 queries on list endpoint
- [ ] Database indexes are used (check query plans)

---

## Phase 10: Final Verdict

### Overall Assessment

- [ ] **PASS** — All checks passed; ready for clinical review
- [ ] **PASS with minor issues** — Non-critical issues found; ready for clinical review with notes
- [ ] **FAIL** — Critical issues found; do not proceed to clinical review until fixed

### Issues Found

**Critical (must fix before approval):**
1. _________________________________________________________________
2. _________________________________________________________________

**Non-critical (note for future):**
1. _________________________________________________________________
2. _________________________________________________________________

### Sign-Off

**QA Lead:** _________________________________  
**Date:** _________________________________  
**Approved for Clinical Review:** ☐ Yes ☐ No

---

## Appendix: Test Data

### Sample Sign (for manual testing)

```
ID: sign_hummingbird
Slug: hummingbird-sign
Name: Hummingbird Sign
Category: neurodegenerative
Modality: MRI
Sequences: ["T1", "T2"]
Anatomy: ["midbrain", "brainstem"]
Primary Conditions: ["PSP", "MSA"]
Reporting Phrase: "Midbrain atrophy with hummingbird sign appearance, consistent with PSP or MSA."
```

### Test Credentials

```
Admin Token: (from staging auth system)
Clinician Token: (from staging auth system)
Patient Token: (from staging auth system)
Guest Token: (if applicable)
```

---

**This checklist must be completed with PASS verdict before proceeding to clinical review.**
