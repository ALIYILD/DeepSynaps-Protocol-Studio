# qEEG Clinical Intelligence Workbench — UAT Hardening Report

**Date**: 2026-04-28  
**Scope**: Migration 048 + Clinical Workbench hardening pass  
**Tester**: Kimi Code CLI  
**Status**: STAGING READY (go for UAT; 2 low risks remain)

---

## 1. Issues Found & Fixed (This Pass)

### CRITICAL — 1 issue

| # | Issue | File | Fix |
|---|-------|------|-----|
| C1 | `get_red_flags` endpoint crashed with `AttributeError: 'QEEGAnalysis' object has no attribute 'qeeg_record'` | `qeeg_analysis_router.py:3403` | Query `QEEGRecord` directly via `analysis.qeeg_record_id` instead of missing ORM relationship |

**Impact**: Any request to `/red-flags` for an analysis without a linked `QEEGRecord` row would 500.

### HIGH — 2 issues

| # | Issue | File | Fix |
|---|-------|------|-----|
| H1 | Backend unit tests (`test_qeeg_clinical_workbench.py`) were completely broken — FakeAnalysis used wrong field names, `classify_claims` passed a string instead of dict, `sanitize_for_patient` used wrong structure, `transition_report_state` expected `ValueError` instead of `ApiServiceError`, `sign_report` signature changed, timeline mock didn't handle multi-model queries, BIDS mock didn't handle `order_by` chain | `test_qeeg_clinical_workbench.py` | Rewrote entire test file to match actual service APIs (18 tests now passing) |
| H2 | Backend smoke test (`test_qeeg_workflow_smoke.py`) used wrong model fields (`duration_sec`, `sample_rate`, `rejected_epochs`, `total_epochs`, `montage_type`), non-existent `db` fixture, missing `User` seed causing cross-clinic 403, wrong Patient field `date_of_birth` | `test_qeeg_workflow_smoke.py` | Fixed all model fields, switched to `SessionLocal()`, seeded `User` with matching `clinic_id`, used `dob` |

### MEDIUM — 1 issue

| # | Issue | File | Fix |
|---|-------|------|-----|
| M1 | Stale `__pycache__` caused `AIReportOut` schema mismatch (`dict` vs `list` for `claim_governance`) | `app/routers/__pycache__` | Cleared pycache; verified source schema is `Optional[list]` |

### LOW — 2 issues

| # | Issue | File | Fix |
|---|-------|------|-----|
| L1 | No observability logs for safety-critical events (blocked claims, red flags, state transitions, export denials) | `qeeg_claim_governance.py`, `qeeg_safety_engine.py`, `qeeg_clinician_review.py`, `qeeg_bids_export.py` | Added structured `extra=` logs with event type, counts, IDs (no PHI) |
| L2 | `classify_claims` regex false-positive concern for "differential diagnosis" | `qeeg_claim_governance.py` | Verified regex requires `diagnoses?` + condition name (ADHD, autism, etc.); "differential diagnosis" does NOT match |

---

## 2. Test Results

### Frontend unit tests (`qeeg-clinical-workbench.test.js`)

- **Count**: 22
- **Result**: ✅ All passing
- **Command**: `node --test src/qeeg-clinical-workbench.test.js`

### Backend unit tests (`test_qeeg_clinical_workbench.py`)

- **Count**: 18
- **Result**: ✅ All passing
- **Command**: `pytest tests/test_qeeg_clinical_workbench.py -q`

### Backend smoke tests (`test_qeeg_workflow_smoke.py`)

- **Count**: 3
- **Result**: ✅ All passing
- **Command**: `pytest tests/test_qeeg_workflow_smoke.py -q`

### Full backend suite (representative)

- **test_health.py**: ✅ 2 passed
- **Clinical workbench + smoke**: ✅ 21 passed

---

## 3. UAT Scenarios Verified

### Clean Valid Case
- Upload analysis with good duration (300s), sample rate (256 Hz), 19 channels, 95% epochs retained
- Safety cockpit: `VALID_FOR_REVIEW` ✅
- Red flags: 0 flags ✅
- AI report generation: returns 201, `report_state=DRAFT_AI`, `claim_governance` populated ✅
- Protocol fit: computes and persists ✅
- State transitions: DRAFT_AI → NEEDS_REVIEW → APPROVED ✅
- Sign report: `signed_by` populated ✅
- Patient-facing report: returns 200 after approval+sign ✅
- BIDS export: returns 200 with `application/zip` ✅
- Timeline: returns chronological events with `qeeg_baseline` ✅

### Poor-Quality Case
- Short duration (30s), low epochs
- Safety cockpit: `REPEAT_RECOMMENDED` ✅
- Red flags: `DURATION_SHORT`, `EPOCHS_LOW` flagged ✅

### Unsafe-Claim Case
- AI narrative with "diagnoses ADHD" and "guarantees treatment response"
- Claim governance: BLOCKED claims detected, block reasons recorded ✅
- Patient-facing report: BLOCKED claims stripped, technical jargon softened ✅
- Observability log: `qeeg_claim_blocked` event fired ✅

---

## 4. Verified Correct Behavior (Re-Audit)

### Safety Correctness
- ✅ BLOCKED patterns catch diagnostic language (`diagnoses ADHD`, `confirms autism`, etc.)
- ✅ Banned words list: `diagnose`, `diagnostic`, `diagnosis`, `probability of disease`
- ✅ Patient-facing report strips BLOCKED claims via `_remove_blocked()`
- ✅ Patient-facing report softens INFERRED claims via `_soften_text()`
- ✅ Patient-facing report removes technical jargon via `_remove_technical_jargon()`
- ✅ Protocol fit includes `off_label_flag` and `required_checks`
- ✅ BIDS export gated by `can_export()` (requires APPROVED + signed_by)
- ✅ All AI report outputs include disclaimer

### Permission Checks
- ✅ All 10 new endpoints have `require_minimum_role(actor, "clinician")`
- ✅ All 10 new endpoints call `_gate_patient_access()`
- ✅ State transitions validate against `VALID_TRANSITIONS` map
- ✅ APPROVED → REJECTED is admin-only

### PHI Protection
- ✅ BIDS export uses SHA256 pseudonyms (`sub-{hash[:8]}`)
- ✅ Timeline no longer exposes `original_filename`
- ✅ No patient names in BIDS filenames, URLs, or document titles
- ✅ `patient_facing_report_json` generated server-side
- ✅ No patient names in observability logs

### UI/UX Quality
- ✅ All 7 panels return empty string or useful fallback when data is missing
- ✅ Error states show actionable messages (not raw traces)
- ✅ Loading spinners render during async fetch
- ✅ Demo mode works (panels skip mount for `analysisId === 'demo'`)
- ✅ Legacy analyses without new fields render unchanged
- ✅ No "agent" wording in clinician-facing UI
- ✅ Copilot offline replies always end with clinician handoff
- ✅ No diagnostic/cure/guarantee wording in any user-facing panel (only in negative disclaimers)

### Backend Reliability
- ✅ Audit trail immutable (only `db.add(audit)`, no update/delete paths)
- ✅ Timeline handles missing outcomes/wearables (empty list fallback)
- ✅ Protocol fit handles missing patient data gracefully
- ✅ Safety cockpit handles missing `band_powers_json` gracefully
- ✅ BIDS export handles missing report (proceeds without report derivatives)
- ✅ Observability logs added for blocked claims, red flags, state transitions, export denials

---

## 5. Known Limitations (Acceptable for Staging UAT)

| Limitation | Impact | Planned Resolution |
|------------|--------|-------------------|
| Timeline RCI uses single global theta metric only | Clinicians may want multi-metric RCI | v2: add alpha, delta, TBR, connectivity RCI |
| `original_filename` is still stored in DB (existing column) | PHI risk if DB is compromised | Acceptable with existing access controls; consider encryption-at-rest |
| BIDS export SHA256 is deterministic | Same patient → same sub-ID across exports | Acceptable per BIDS standard; add salt if cross-study re-identification becomes concern |
| Patient-facing report may still be too technical for some patients | Lower comprehension for non-clinical readers | Post-UAT survey; iterate `_remove_technical_jargon()` |
| Copilot 2.0 WebSocket context may exceed message size for very large analyses | Potential WS disconnect | Truncate context to 4KB if needed; monitor WS errors |

---

## 6. Remaining Risks (Post-UAT Monitoring)

| Risk | Severity | Likelihood | Mitigation | Owner |
|------|----------|-----------|------------|-------|
| Clinician confusion about state machine order | LOW | MEDIUM | Demo script emphasizes workflow; tooltips on buttons | UX |
| False positives in BLOCKED patterns | LOW | LOW | Weekly review of `qeeg_claim_blocked` logs; tune regexes | Data Science |
| Timeline RCI is simplistic (global theta only) | LOW | HIGH | Document as "preliminary RCI"; add multi-metric RCI in v2 | Engineering |

---

## 7. Go / No-Go Recommendation

| Criterion | Status |
|-----------|--------|
| Critical bugs fixed | ✅ |
| High bugs fixed | ✅ |
| Backend tests passing (18 unit + 3 smoke) | ✅ |
| Frontend tests passing (22) | ✅ |
| PHI audit clean | ✅ |
| Safety/governance audit clean | ✅ |
| UI language audit clean (no diagnostic/cure/guarantee claims) | ✅ |
| Observability logs in place | ✅ |
| Documentation updated | ✅ |

**Recommendation**: **GO for staging UAT**. Deploy to `deepsynaps-studio.fly.dev` and run the 12-step demo script with 2–3 clinicians. After 1 week of feedback, evaluate for production clinic demo.

**Blockers for production**: None identified. Monitor the 3 remaining low-severity risks during UAT.
