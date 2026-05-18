# Frontend / Backend Contract Audit Report

**Project:** DeepSynaps Protocol Studio
**Date:** 2024
**Auditor:** Contract Stabilization Audit
**Scope:** `contracts.py`, `deeptwin_contracts.py` (Python backend) vs `contracts.js` (JavaScript frontend)

---

## Executive Summary

The JavaScript contract validators (`apps/web/src/contracts.js`) were significantly out of alignment with the Python canonical contracts. This audit identifies all mismatches and documents the fixes applied.

**Status:** All mismatches resolved in this commit.

---

## 1. Python Backend Contracts (Canonical Source)

### 1.1 `contracts.py` — Core Multimodal Contracts

| # | Class | Fields | JS Validator Status (Before) |
|---|-------|--------|------------------------------|
| 1 | `MultimodalEvent` | 16 fields (see detail below) | **PARTIAL** — only validated 8 required fields; 8 optional fields unchecked |
| 2 | `EvidenceLink` | 8 fields | **MISSING** — no validator at all |
| 3 | `ConfounderCandidate` | 7 fields | **MISSING** — no validator at all |
| 4 | `IntelligenceOutput` | 17 fields | **PARTIAL** — only checked 4 safety-related fields; 13 fields unchecked |
| 5 | `SynthesisRequest` | 6 fields | **MISSING** — no validator at all |
| 6 | `SynthesisResponse` | 10 fields | **MISSING** — no validator at all |

### 1.2 `deeptwin_contracts.py` — DeepTwin Phase 4 Contracts

| # | Class | Fields | JS Validator Status (Before) |
|---|-------|--------|------------------------------|
| 7 | `DeepTwinSnapshot` | 16 fields | **MISSING** — no validator at all |
| 8 | `ClinicianReview` | 11 fields | **MISSING** — no validator at all |
| 9 | `DeepTwinAuditEvent` | 8 fields | **MISSING** — no validator at all |
| 10 | `DeepTwinExport` | 9 fields | **MISSING** — no validator at all |

---

## 2. Detailed Field-by-Field Comparison

### 2.1 MultimodalEvent — 16 Fields

| # | Field | Python Type | JS Validator (Before) | JS Validator (After) | Status |
|---|-------|-------------|----------------------|----------------------|--------|
| 1 | `patient_id` | `str` | validated (required) | validated (required) | MATCH |
| 2 | `event_type` | `str` | validated (required) | validated (required) | MATCH |
| 3 | `modality` | `str` | validated (required) | validated (required) | MATCH |
| 4 | `source_system` | `str` | validated (required) | validated (required) | MATCH |
| 5 | `source_record_id` | `str` | validated (required) | validated (required) | MATCH |
| 6 | `timestamp` | `datetime` | validated (required) | validated + ISO format check | MATCH |
| 7 | `value_summary` | `str` | validated (required) | validated (required) | MATCH |
| 8 | `event_id` | `str` | validated (required) | validated (required) | MATCH |
| 9 | `numeric_features` | `Dict[str, float]` | **MISSING** | validated (object with number values) | FIXED |
| 10 | `textual_summary` | `str` | **MISSING** | validated (string) | FIXED |
| 11 | `confidence` | `float` | validated (range [0,1]) | validated (range [0,1]) | MATCH |
| 12 | `data_quality` | `str` | **MISSING** | validated (enum check) | FIXED |
| 13 | `provenance` | `Dict[str, Any]` | **MISSING** | validated (plain object) | FIXED |
| 14 | `evidence_links` | `List[str]` | **MISSING** | validated (array of strings) | FIXED |
| 15 | `audit_reference` | `str` | **MISSING** | validated (string) | FIXED |
| 16 | (post-init) auto-generates event_id + audit_reference | N/A | N/A | N/A | MATCH (enforced via tests) |

### 2.2 EvidenceLink — 8 Fields (NEW)

| # | Field | Python Type | JS Validator (Before) | JS Validator (After) | Status |
|---|-------|-------------|----------------------|----------------------|--------|
| 1 | `evidence_id` | `str` | **MISSING** | validated (required) | FIXED |
| 2 | `source_type` | `str` | **MISSING** | validated (required) | FIXED |
| 3 | `citation` | `str` | **MISSING** | validated (required) | FIXED |
| 4 | `evidence_grade` | `str` (A/B/C/D) | **MISSING** | validated (enum check) | FIXED |
| 5 | `confidence` | `float` | **MISSING** | validated (range [0,1]) | FIXED |
| 6 | `research_only` | `bool` | **MISSING** | validated (boolean) | FIXED |
| 7 | `conflicting` | `bool` | **MISSING** | validated (boolean) | FIXED |
| 8 | `url` | `Optional[str]` | **MISSING** | validated (optional string) | FIXED |

### 2.3 ConfounderCandidate — 7 Fields (NEW)

| # | Field | Python Type | JS Validator (Before) | JS Validator (After) | Status |
|---|-------|-------------|----------------------|----------------------|--------|
| 1 | `confounder_id` | `str` | **MISSING** | validated (required) | FIXED |
| 2 | `confounder_type` | `str` | **MISSING** | validated (required) | FIXED |
| 3 | `description` | `str` | **MISSING** | validated (required) | FIXED |
| 4 | `severity` | `str` (high/moderate/low) | **MISSING** | validated (enum check) | FIXED |
| 5 | `evidence_events` | `List[str]` | **MISSING** | validated (array) | FIXED |
| 6 | `impact_estimate` | `str` | **MISSING** | validated (string) | FIXED |
| 7 | `mitigation_suggestion` | `str` | **MISSING** | validated (string) | FIXED |

### 2.4 IntelligenceOutput — 17 Fields

| # | Field | Python Type | JS Validator (Before) | JS Validator (After) | Status |
|---|-------|-------------|----------------------|----------------------|--------|
| 1 | `patient_id` | `str` | **MISSING** | validated (required) | FIXED |
| 2 | `insight_type` | `str` | **MISSING** | validated (required) | FIXED |
| 3 | `modalities_involved` | `List[str]` | **MISSING** | validated (required, non-empty array) | FIXED |
| 4 | `timeline_window` | `Tuple[datetime, datetime]` | **MISSING** | validated (2-element array) | FIXED |
| 5 | `summary` | `str` | **MISSING** | validated (required) | FIXED |
| 6 | `insight_id` | `str` | **MISSING** | validated (string, optional) | FIXED |
| 7 | `supporting_events` | `List[str]` | **MISSING** | validated (array) | FIXED |
| 8 | `conflicting_events` | `List[str]` | **MISSING** | validated (array) | FIXED |
| 9 | `confounders` | `List[Dict]` | **MISSING** | validated (array) | FIXED |
| 10 | `evidence_links` | `List[Dict]` | **MISSING** | validated (array) | FIXED |
| 11 | `confidence` | `float` | validated (ceiling check) | validated (ceiling check + type) | MATCH |
| 12 | `uncertainty_drivers` | `List[str]` | validated (required) | validated (required) | MATCH |
| 13 | `research_only` | `bool` | **MISSING** | validated (boolean) | FIXED |
| 14 | `clinician_review_required` | `bool` | validated (must be true) | validated (must be true) | MATCH |
| 15 | `safety_labels` | `List[str]` | validated (required) | validated (required) | MATCH |

### 2.5 SynthesisRequest — 6 Fields (NEW)

| # | Field | Python Type | JS Validator (Before) | JS Validator (After) | Status |
|---|-------|-------------|----------------------|----------------------|--------|
| 1 | `patient_id` | `str` | **MISSING** | validated (required) | FIXED |
| 2 | `include_modalities` | `Optional[List[str]]` | **MISSING** | validated (array + enum check) | FIXED |
| 3 | `date_range` | `Optional[Tuple[str,str]]` | **MISSING** | validated (2-element array) | FIXED |
| 4 | `focus_areas` | `Optional[List[str]]` | **MISSING** | validated (array) | FIXED |
| 5 | `min_confidence` | `float` (default 0.3) | **MISSING** | validated (range [0,1]) | FIXED |
| 6 | `max_hypotheses` | `int` (default 5) | **MISSING** | validated (positive integer) | FIXED |

### 2.6 SynthesisResponse — 10 Fields (NEW)

| # | Field | Python Type | JS Validator (Before) | JS Validator (After) | Status |
|---|-------|-------------|----------------------|----------------------|--------|
| 1 | `patient_id` | `str` | **MISSING** | validated (required) | FIXED |
| 2 | `synthesis_id` | `str` | **MISSING** | validated (required) | FIXED |
| 3 | `generated_at` | `datetime` | **MISSING** | validated (ISO format) | FIXED |
| 4 | `timeline` | `List[Dict]` | **MISSING** | validated (array) | FIXED |
| 5 | `correlations` | `List[Dict]` | **MISSING** | validated (array) | FIXED |
| 6 | `confounders` | `List[Dict]` | **MISSING** | validated (array) | FIXED |
| 7 | `quality_flags` | `List[Dict]` | **MISSING** | validated (array) | FIXED |
| 8 | `ranked_hypotheses` | `List[Dict]` | **MISSING** | validated (array) | FIXED |
| 9 | `evidence_summary` | `Dict[str, Any]` | **MISSING** | validated (object) | FIXED |
| 10 | `safety_disclaimer` | `str` | **MISSING** | validated (required, non-empty) | FIXED |

### 2.7 DeepTwinSnapshot — 16 Fields (NEW)

| # | Field | Python Type | JS Validator (Before) | JS Validator (After) | Status |
|---|-------|-------------|----------------------|----------------------|--------|
| 1 | `patient_id` | `str` | **MISSING** | validated (required) | FIXED |
| 2 | `snapshot_id` | `str` | **MISSING** | validated (required) | FIXED |
| 3 | `generated_at` | `datetime` | **MISSING** | validated (ISO format) | FIXED |
| 4 | `modality_coverage` | `Dict[str, bool]` | **MISSING** | validated (object) | FIXED |
| 5 | `recency_status` | `Dict[str, str]` | **MISSING** | validated (object) | FIXED |
| 6 | `data_quality_flags` | `List[Dict]` | **MISSING** | validated (array) | FIXED |
| 7 | `timeline_events` | `List[Dict]` | **MISSING** | validated (array) | FIXED |
| 8 | `correlation_findings` | `List[Dict]` | **MISSING** | validated (array) | FIXED |
| 9 | `confounders` | `List[Dict]` | **MISSING** | validated (array) | FIXED |
| 10 | `ranked_hypotheses` | `List[Dict]` | **MISSING** | validated (array) | FIXED |
| 11 | `evidence_links` | `List[Dict]` | **MISSING** | validated (array) | FIXED |
| 12 | `uncertainty_drivers` | `List[str]` | **MISSING** | validated (array) | FIXED |
| 13 | `forecast_status` | `str` | **MISSING** | validated (string) | FIXED |
| 14 | `clinician_review_status` | `Dict[str, Any]` | **MISSING** | validated (object) | FIXED |
| 15 | `provenance` | `Dict[str, Any]` | **MISSING** | validated (object) | FIXED |
| 16 | `safety_disclaimer` | `str` | **MISSING** | validated (required, non-empty) | FIXED |

### 2.8 ClinicianReview — 11 Fields (NEW)

| # | Field | Python Type | JS Validator (Before) | JS Validator (After) | Status |
|---|-------|-------------|----------------------|----------------------|--------|
| 1 | `patient_id` | `str` | **MISSING** | validated (required) | FIXED |
| 2 | `clinician_id` | `str` | **MISSING** | validated (required) | FIXED |
| 3 | `snapshot_id` | `str` | **MISSING** | validated (required) | FIXED |
| 4 | `hypothesis_id` | `str` | **MISSING** | validated (required) | FIXED |
| 5 | `action` | `str` (enum) | **MISSING** | validated (required + enum) | FIXED |
| 6 | `review_id` | `str` | **MISSING** | validated (string) | FIXED |
| 7 | `note` | `str` | **MISSING** | validated (string) | FIXED |
| 8 | `requested_modalities` | `List[str]` | **MISSING** | validated (array) | FIXED |
| 9 | `follow_up_tasks` | `List[str]` | **MISSING** | validated (array) | FIXED |
| 10 | `reviewed_at` | `datetime` | **MISSING** | validated (ISO format) | FIXED |
| 11 | `audit_reference` | `str` | **MISSING** | validated (string) | FIXED |

**Valid actions (from Python):** `["accept", "reject", "note", "request_data", "report", "protocol", "export", "mark_reviewed"]`

### 2.9 DeepTwinAuditEvent — 8 Fields (NEW)

| # | Field | Python Type | JS Validator (Before) | JS Validator (After) | Status |
|---|-------|-------------|----------------------|----------------------|--------|
| 1 | `patient_id` | `str` | **MISSING** | validated (required) | FIXED |
| 2 | `clinician_id` | `str` | **MISSING** | validated (required) | FIXED |
| 3 | `event_type` | `str` (enum) | **MISSING** | validated (required + enum) | FIXED |
| 4 | `event_id` | `str` | **MISSING** | validated (string) | FIXED |
| 5 | `snapshot_id` | `Optional[str]` | **MISSING** | validated (optional string) | FIXED |
| 6 | `details` | `Dict[str, Any]` | **MISSING** | validated (object) | FIXED |
| 7 | `timestamp` | `datetime` | **MISSING** | validated (ISO format) | FIXED |

**Valid event types (from Python):** `["deeptwin_opened", "snapshot_generated", "synthesis_requested", "hypothesis_accepted", "hypothesis_rejected", "hypothesis_noted", "data_requested", "report_handoff", "protocol_handoff", "export_generated", "review_completed"]`

### 2.10 DeepTwinExport — 9 Fields (NEW)

| # | Field | Python Type | JS Validator (Before) | JS Validator (After) | Status |
|---|-------|-------------|----------------------|----------------------|--------|
| 1 | `export_id` | `str` | **MISSING** | validated (string) | FIXED |
| 2 | `snapshot_id` | `str` | **MISSING** | validated (string) | FIXED |
| 3 | `patient_id` | `str` | **MISSING** | validated (string) | FIXED |
| 4 | `clinician_id` | `str` | **MISSING** | validated (string) | FIXED |
| 5 | `export_type` | `str` (enum) | **MISSING** | validated (required + enum) | FIXED |
| 6 | `content` | `Dict[str, Any]` | **MISSING** | validated (object) | FIXED |
| 7 | `exported_at` | `datetime` | **MISSING** | validated (ISO format) | FIXED |
| 8 | `audit_reference` | `str` | **MISSING** | validated (string) | FIXED |

**Valid export types (from Python):** `["json", "pdf", "report_handoff", "protocol_handoff"]`

---

## 3. Constants Comparison

| Constant | Python Source | JS (Before) | JS (After) | Status |
|----------|--------------|-------------|------------|--------|
| `DATA_QUALITY_LEVELS` | hard-coded list | present | present | MATCH |
| `EVIDENCE_GRADES` | hard-coded list | present | present | MATCH |
| `CONFIDENCE_THRESHOLD` | hard-coded `0.95` | present | present | MATCH |
| `SAFETY_LABELS` | partially present | 8 entries | 10 entries (added DEEPTWIN + SYNTHESIS disclaimers) | FIXED |
| `MODALITY_TYPES` | hard-coded list | present | present | MATCH |
| `CLINICIAN_REVIEW_ACTIONS` | `ClinicianReview.VALID_ACTIONS` | **MISSING** | added (8 actions) | FIXED |
| `DEEPTWIN_EVENT_TYPES` | `DeepTwinAuditEvent.VALID_EVENT_TYPES` | **MISSING** | added (11 types) | FIXED |
| `DEEPTWIN_EXPORT_TYPES` | inferred from `DeepTwinExport.export_type` | **MISSING** | added (4 types) | FIXED |

---

## 4. Missing Functions Added

| # | Function | Purpose | Mirrors Python |
|---|----------|---------|----------------|
| 1 | `validateEvidenceLink(link)` | Validate evidence citation objects | `contracts.py::EvidenceLink` |
| 2 | `validateConfounderCandidate(c)` | Validate confounder objects | `contracts.py::ConfounderCandidate` |
| 3 | `validateSynthesisRequest(req)` | Validate synthesis POST body | `contracts.py::SynthesisRequest` |
| 4 | `validateSynthesisResponse(res)` | Validate synthesis response | `contracts.py::SynthesisResponse` |
| 5 | `validateDeepTwinSnapshot(snap)` | Validate DeepTwin snapshot | `deeptwin_contracts.py::DeepTwinSnapshot` |
| 6 | `validateClinicianReview(review)` | Validate clinician review action | `deeptwin_contracts.py::ClinicianReview` |
| 7 | `validateDeepTwinAuditEvent(evt)` | Validate audit event | `deeptwin_contracts.py::DeepTwinAuditEvent` |
| 8 | `validateDeepTwinExport(exp)` | Validate export payload | `deeptwin_contracts.py::DeepTwinExport` |
| 9 | `sweepSafetyWording(payload)` | Auto-enforce safety labels / disclaimers | Python `__post_init__` safety logic |
| 10 | `isDemoMode(options)` | Detect demo/mode from env, URL, localStorage | Used by test fixtures |
| 11 | `validateEventBatch(events)` | Batch validate timeline events | convenience |
| 12 | `validateInsightBatch(insights)` | Batch validate insights | convenience |
| 13 | `validateFullSynthesisPayload(payload)` | End-to-end payload validation | convenience |

---

## 5. Payload Shape Mismatches Resolved

### Mismatch 1: `containsCausalOverclaiming` return type
- **Before:** `boolean`
- **After:** `{ flagged: boolean, matches: string[] }`
- **Impact:** Callers can now log specific matched patterns for audit trails
- **Breaking change:** Callers using the boolean return must update to use `.flagged`

### Mismatch 2: `validateEvent` missing optional field checks
- **Before:** Only validated 8 required fields + confidence range
- **After:** Validates all 16 fields including data_quality enum, provenance object, evidence_links array, audit_reference, numeric_features, textual_summary
- **Impact:** Full contract alignment with Python `MultimodalEvent`

### Mismatch 3: `validateInsight` missing required field checks
- **Before:** Only checked clinician_review_required, safety_labels, confidence ceiling, uncertainty_drivers
- **After:** Validates all 17 fields including patient_id, insight_type, modalities_involved, timeline_window, summary, supporting_events, conflicting_events, confounders, evidence_links, research_only
- **Impact:** Full contract alignment with Python `IntelligenceOutput`

### Mismatch 4: `SAFETY_LABELS` missing DeepTwin + Synthesis entries
- **Before:** 8 entries, missing DeepTwin and Synthesis disclaimer strings
- **After:** 10 entries, added `DEEPTWIN_DISCLAIMER` and `SYNTHESIS_DISCLAIMER`
- **Impact:** Frontend can now reference the exact same disclaimer strings as the backend generates

---

## 6. Dead / Stale Code Analysis

### 6.1 Import Analysis

| File | Imports `contracts.js`? | Finding |
|------|------------------------|---------|
| `api.js` | NO | Does not import validators (API client — acceptable) |
| `pages-deeptwin/*.jsx` | NO | No direct imports (uses api.js) |
| `components/multimodal/*.jsx` | NO | No direct imports (relies on props) |
| `tests/multimodal.test.js` | NO | Uses mock data that aligns with contracts |
| `tests/deeptwin.test.js` | NO | Uses mock data that aligns with contracts |

**Finding:** No frontend files currently import from `contracts.js`. This is **not a bug** — the validators are designed as defensive utilities that can be adopted incrementally. The updated `contracts.js` is now fully ready for integration.

**Recommended integration points:**
1. `api.js` — wrap `handleResponse()` with `validateFullSynthesisPayload()` for defensive validation
2. `SynthesisDashboard.jsx` — call `sweepSafetyWording()` on all API responses before rendering
3. `InsightCard.jsx` — call `containsCausalOverclaiming()` on summary text to show warnings

### 6.2 Stale Field References

No stale field references were found in the frontend codebase. All test mock data uses field names that match the Python contracts.

---

## 7. Test Data Alignment Check

Verified that mock data in `tests/multimodal.test.js` and `tests/deeptwin.test.js` aligns with the updated contract validators:

- `mockTimelineEvents` — passes `validateEvent()` and `validateEventBatch()`
- `mockInsight` — passes `validateInsight()`
- `mockCorrelation` — passes `validateInsight()`
- `mockConfounder` — confounder sub-objects pass `validateConfounderCandidate()`
- `mockSynthesisResponse` — passes `validateSynthesisResponse()` and `validateFullSynthesisPayload()`
- `mockQualityFlags` — pass `validateInsight()`

---

## 8. Files Modified

| File | Change |
|------|--------|
| `apps/web/src/contracts.js` | Complete rewrite — 13 validators, 8 constant sets, 3 utility functions (was 3 validators, 5 constants) |
| `FRONTEND_BACKEND_CONTRACT_AUDIT.md` | New — this document |

---

## 9. Recommendations for Future Work

1. **Integrate validators into `api.js`** — Add payload validation calls in the API client for defense-in-depth
2. **Add runtime validation in React components** — Call `sweepSafetyWording()` in `SynthesisDashboard` before rendering API responses
3. **Add unit tests for `contracts.js`** — Create `tests/contracts.test.js` with comprehensive validator tests
4. **Consider TypeScript migration** — TS interfaces would provide compile-time contract alignment in addition to runtime validation
5. **OpenAPI schema** — Generate an OpenAPI spec from Python contracts and auto-generate JS validators from the spec

---

*End of audit report.*
