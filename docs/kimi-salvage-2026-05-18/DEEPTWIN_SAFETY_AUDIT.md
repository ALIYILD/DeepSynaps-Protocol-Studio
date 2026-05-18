<!-- Edited 2026-05-18 from kimi-salvage; original audit verdict EDIT. -->
<!--
  WHOLE DOCUMENT TODO: re-audit against current deeptwin_*.py services in
  apps/api/app/services/ before treating any claim in this document as verified.

  Current real DeepTwin services (apps/api/app/services/):
    deeptwin_engine.py, deeptwin_fusion.py, deeptwin_causal.py,
    deeptwin_evidence.py, deeptwin_nof1.py, deeptwin_research_loop.py,
    deeptwin_decision_support.py, deeptwin_dashboard.py,
    deeptwin_dashboard_audit.py, deeptwin_simulation_v2.py,
    deeptwin_trajectory.py

  The salvage doc was written against a different architecture that named
  deeptwin_snapshot.py, deeptwin_review.py, correlation_engine.py,
  hypothesis_engine.py — none of these exist in current main.
  All section 2 evidence citations (line numbers, function names) are
  therefore UNVERIFIED and must be re-checked before re-promotion.

  Source path: apps/api/app/ — NOT apps/api/src/deepsynaps/.
-->

# DeepTwin Safety Audit Report

**Auditor:** Clinical AI Safety Engineering  
**Date:** 2025-01-21  
**Edited:** 2026-05-18 — stale component paths flagged; see WHOLE DOCUMENT TODO above.  
**Scope:** All DeepTwin components (frontend + backend)  
**Status:** UNVERIFIED against current main — do not treat as a current audit pass

---

## 1. Safety Wording Sweep

### Grep Results: Forbidden Language Scan

<!-- TODO: verify against current main — rerun grep on apps/api/app/ and apps/web/ -->
Scanned all `*.py`, `*.jsx`, `*.js` files for forbidden clinical language patterns.

| Pattern | Matches | Context | Risk |
|---------|---------|---------|------|
| `diagnose` | 5 | All in safety disclaimers ("does not diagnose") | <!-- TODO: verify --> SAFE |
| `prescribe` | 4 | Safety governance patterns + disclaimers | <!-- TODO: verify --> SAFE |
| `predicts disorder` | 0 | None found | <!-- TODO: verify --> SAFE |
| `autonomous treatment` | 1 | DISALLOWED_PATTERNS in safety_governance.py | <!-- TODO: verify --> SAFE |
| `AI diagnosis` | 0 | None found | <!-- TODO: verify --> SAFE |
| `emergency triage claims` | 0 | None found | <!-- TODO: verify --> SAFE |
| `caused by` | 3 | Regex pattern in safety_governance.py + contracts.js (detection) + test assertions | <!-- TODO: verify --> SAFE |
| `proves cause` | 0 | None found | <!-- TODO: verify --> SAFE |
| `predicts outcome` | 0 | None found | <!-- TODO: verify --> SAFE |
| `will definitely` | 1 | DISALLOWED_PATTERNS in safety_governance.py | <!-- TODO: verify --> SAFE |
| `guaranteed` | 2 | DISALLOWED_PATTERNS in safety_governance.py | <!-- TODO: verify --> SAFE |

---

## 2. DeepTwin Component Safety Verification

<!-- TODO: ALL subsections below reference component paths and line numbers from the
     abandoned prototype. They have NOT been verified against current main.
     Re-audit each subsection against the actual files listed in the WHOLE DOCUMENT
     TODO at the top before promoting this document. -->

### 2.1 RankedHypotheses.jsx

<!-- TODO: verify file exists and line numbers are current -->
| Requirement | Status | Evidence |
|-------------|--------|----------|
| Every hypothesis has "Requires clinician review" label | <!-- TODO: verify --> PASS | Line 22: "Ranked hypotheses are decision support only. Each requires individual clinician review. They are not diagnoses." |
| Safety banner visible | <!-- TODO: verify --> PASS | Lines 19-24: Amber warning banner with clinician review text |
| Confidence capped < 95% | <!-- TODO: verify --> PASS | Line 45: `Math.min((h.confidence || 0) * 100, 94)%` hard caps visual at 94% |
| No causal certainty | <!-- TODO: verify --> PASS | Summary text uses "may be related to" / "aligned with" language |

### 2.2 ForecastPanel.jsx

<!-- TODO: verify file exists and line numbers are current -->
| Requirement | Status | Evidence |
|-------------|--------|----------|
| Shows "unavailable: no calibrated model" | <!-- TODO: verify --> PASS | Line 8: `FORECAST_UNAVAILABLE = "Forecast unavailable: no calibrated model."` |
| Never fakes predictions | <!-- TODO: verify --> PASS | Lines 5, 21-25, 41-42: Multiple explicit statements |
| Honest disclosure section | <!-- TODO: verify --> PASS | Lines 38-47: Full disclosure about forecasting policy |

### 2.3 DeepTwinPage.jsx

<!-- TODO: verify file exists and line numbers are current -->
| Requirement | Status | Evidence |
|-------------|--------|----------|
| Safety disclaimer always visible | <!-- TODO: verify --> PASS | Lines 17-20, 107-113: Persistent amber banner at top of page |
| Disclaimer text accurate | <!-- TODO: verify --> PASS | "DeepTwin provides decision support only and requires clinician review. It does not diagnose, prescribe, prove causality, or predict outcomes." |
| Forecast status passed through | <!-- TODO: verify --> PASS | Line 87: `forecast_status: "unavailable: no calibrated model"` |

### 2.4 PatientOverview.jsx

<!-- TODO: verify file exists and line numbers are current -->
| Requirement | Status | Evidence |
|-------------|--------|----------|
| "Requires clinician review" on hypotheses | <!-- TODO: verify --> PASS | Line 50: "Requires clinician review" |
| Forecast warning shown | <!-- TODO: verify --> PASS | Lines 62-70: Shows forecast status from snapshot |

### 2.5 ClinicianReview.jsx

<!-- TODO: verify file exists and line numbers are current -->
| Requirement | Status | Evidence |
|-------------|--------|----------|
| Review actions available | <!-- TODO: verify --> PASS | Accept/Reject/Note buttons for each hypothesis |
| Mark reviewed capability | <!-- TODO: verify --> PASS | Lines 158-166: "Mark Snapshot as Reviewed" |
| Audit trail maintained | <!-- TODO: verify --> PASS | Lines 169-182: Full review history displayed |

### 2.6 Backend: safety_governance.py

<!-- TODO: verify apps/api/app/services/safety_governance.py exists and line numbers are current -->
| Requirement | Status | Evidence |
|-------------|--------|----------|
| DISALLOWED_PATTERNS list | <!-- TODO: verify --> PASS | Lines 12-26: 13 forbidden patterns |
| MAX_CONFIDENCE = 0.95 | <!-- TODO: verify --> PASS | Line 31: Hard cap at 0.95 |
| Required correlation label | <!-- TODO: verify --> PASS | Line 28: "Temporal association only. Not causal proof." |
| Required hypothesis label | <!-- TODO: verify --> PASS | Line 29: "Ranked clinical hypothesis. Requires clinician review." |
| Sanitize summary method | <!-- TODO: verify --> PASS | Lines 97-112: Replaces causal language with safe alternatives |
| apply_all enforcement | <!-- TODO: verify --> PASS | Line 115-121: Every output validated |

### 2.7 Backend: deeptwin_engine.py (was: deeptwin_snapshot.py — file does not exist in current main)

<!-- TODO: the original doc cited deeptwin_snapshot.py which does not exist.
     The equivalent service in current main is deeptwin_engine.py (and related
     services listed in the WHOLE DOCUMENT TODO). Re-audit these requirements
     against deeptwin_engine.py, deeptwin_decision_support.py, etc. -->
| Requirement | Status | Evidence |
|-------------|--------|----------|
| FORECAST_UNAVAILABLE constant | <!-- TODO: verify against deeptwin_engine.py --> UNVERIFIED | Was cited at deeptwin_snapshot.py line 57 — file absent from current main |
| Safety disclaimer constant | <!-- TODO: verify --> UNVERIFIED | Was cited at deeptwin_snapshot.py lines 58-61 — file absent |
| SafetyGovernance.apply_all called on all insights | <!-- TODO: verify --> UNVERIFIED | Was cited at deeptwin_snapshot.py lines 144, 151, 158, 167 — file absent |
| Provenance tracks safety governance | <!-- TODO: verify --> UNVERIFIED | Was cited at deeptwin_snapshot.py line 337 — file absent |
| Forecast policy documented | <!-- TODO: verify --> UNVERIFIED | Was cited at deeptwin_snapshot.py line 338 — file absent |

### 2.8 Backend: (was: correlation_engine.py — file does not exist in current main)

<!-- TODO: correlation_engine.py does not exist in apps/api/app/services/.
     Correlation logic may live in deeptwin_causal.py or deeptwin_engine.py.
     Re-verify these requirements against the actual file. -->
| Requirement | Status | Evidence |
|-------------|--------|----------|
| Score capped at 0.94 | <!-- TODO: verify --> UNVERIFIED | Was cited at correlation_engine.py line 148 — file absent |
| "Temporal association only" in summary | <!-- TODO: verify --> UNVERIFIED | Was cited at correlation_engine.py line 175 — file absent |
| Safety labels on output | <!-- TODO: verify --> UNVERIFIED | Was cited at correlation_engine.py lines 205-208 — file absent |

### 2.9 Backend: (was: hypothesis_engine.py — file does not exist in current main)

<!-- TODO: hypothesis_engine.py does not exist in apps/api/app/services/.
     Hypothesis ranking may live in deeptwin_decision_support.py or deeptwin_engine.py.
     Re-verify these requirements against the actual file. -->
| Requirement | Status | Evidence |
|-------------|--------|----------|
| MAX_SCORE = 0.94 | <!-- TODO: verify --> UNVERIFIED | Was cited at hypothesis_engine.py line 25 — file absent |
| All hypotheses marked research_only | <!-- TODO: verify --> UNVERIFIED | Was cited at hypothesis_engine.py line 186 — file absent |
| Safety labels on every hypothesis | <!-- TODO: verify --> UNVERIFIED | Was cited at hypothesis_engine.py lines 188-190 — file absent |
| SafetyGovernance.apply_all called | <!-- TODO: verify --> UNVERIFIED | Was cited at hypothesis_engine.py line 96 — file absent |

---

## 3. Safety Checklist

<!-- TODO: all rows below need re-verification against current main before this
     checklist can be cited as a passing audit. Do not use this checklist as
     evidence of compliance without re-running the audit. -->
| # | Requirement | Status |
|---|-------------|--------|
| 1 | Every hypothesis has "Requires clinician review" label | <!-- TODO: verify --> UNVERIFIED |
| 2 | Forecast panel shows "unavailable: no calibrated model" | <!-- TODO: verify --> UNVERIFIED |
| 3 | No causal certainty language in any output | <!-- TODO: verify --> UNVERIFIED |
| 4 | Confidence never shown as >= 95% | <!-- TODO: verify --> UNVERIFIED |
| 5 | Safety disclaimer always visible on DeepTwin page | <!-- TODO: verify --> UNVERIFIED |
| 6 | Safety disclaimer always visible on SynthesisDashboard | <!-- TODO: verify --> UNVERIFIED |
| 7 | No forbidden language in clinical outputs | <!-- TODO: verify --> UNVERIFIED |
| 8 | Backend enforces MAX_CONFIDENCE < 0.95 | <!-- TODO: verify --> UNVERIFIED |
| 9 | Backend sanitizes causal overclaiming | <!-- TODO: verify --> UNVERIFIED |
| 10 | Evidence grades C/D auto-marked research_only | <!-- TODO: verify --> UNVERIFIED |
| 11 | All exports carry safety header | <!-- TODO: verify --> UNVERIFIED |
| 12 | All audit events carry safety_label | <!-- TODO: verify --> UNVERIFIED |
| 13 | Access control requires clinician role | <!-- TODO: verify --> UNVERIFIED |
| 14 | AI synthesis requires patient consent | <!-- TODO: verify --> UNVERIFIED |
| 15 | Error responses include safety disclaimer | <!-- TODO: verify --> UNVERIFIED |

---

## 4. Recommendations

| Priority | Item | Action |
|----------|------|--------|
| CRITICAL | Re-audit sections 2.7–2.9 against actual deeptwin_*.py services in apps/api/app/services/ | Assign to clinical safety reviewer |
| LOW | Add `REQUIRES_CLINICIAN_REVIEW` badge to each hypothesis card as visual indicator | UI enhancement — verify still missing before implementing |
| LOW | Consider adding confidence color coding (green < 70%, yellow 70-85%, orange 85-94%) | UX improvement |
| LOW | Add keyboard shortcut to dismiss safety banner (but keep it in DOM for audit) | Accessibility |

---

## 5. Final Verdict

<!-- TODO: original verdict was PASS but was based on deeptwin_snapshot.py,
     correlation_engine.py, and hypothesis_engine.py — none of which exist in
     current main. Verdict is suspended until sections 2.7–2.9 and the full
     checklist in section 3 are re-verified. -->

**SUSPENDED — re-audit required.** The salvage audit's PASS verdict cannot be carried forward because the three backend services it audited (deeptwin_snapshot.py, correlation_engine.py, hypothesis_engine.py) do not exist in current main. Safety wording sweep (section 1) and frontend component audits (2.1–2.5) remain plausibly valid but require line-number verification. Section 2.6 (safety_governance.py) is the most likely to still be accurate and should be verified first.
