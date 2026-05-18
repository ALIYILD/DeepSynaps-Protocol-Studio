# Analyzer Stability Matrix

**DeepSynaps Protocol Studio -- Phase 4 DeepTwin + Phase 3 Multimodal Intelligence**
**Generated:** 2025-01-21
**Auditor:** Clinical AI Safety Engineering

---

## Legend

| Symbol | Meaning |
|--------|---------|
| Yes | Fully implemented |
| Partial | Implemented but has gaps |
| No | Not implemented |
| N/A | Not applicable to this analyzer |

| Status | Meaning |
|--------|---------|
| Stable | All critical checks pass |
| Warning | Minor gaps, non-blocking |
| Critical | Major gaps requiring action |

---

## Matrix

| # | Analyzer | Route | Role Gate | Consent Check | Export Governance | Evidence Links | Provenance | Audit Events | Degraded State | Demo Honesty | Tests | Status |
|---|----------|:-----:|:---------:|:-------------:|:-----------------:|:--------------:|:----------:|:------------:|:--------------:|:------------:|:-----:|--------|
| 1 | **MultimodalTimelineEngine** | Yes | Yes | Yes | N/A | Partial | Yes | Yes | Yes | N/A | Yes | **Stable** |
| 2 | **CorrelationEngine** | Yes | Yes | Yes | N/A | Yes | Yes | Yes | Yes | N/A | Yes | **Stable** |
| 3 | **ConfoundEngine** | Yes | Yes | Yes | N/A | No | Yes | Yes | Yes | N/A | Yes | **Warning** |
| 4 | **EvidenceLinkingEngine** | Yes | Yes | Yes | N/A | Yes | Yes | Yes | Yes | N/A | Yes | **Stable** |
| 5 | **HypothesisRankingEngine** | Yes | Yes | Yes | N/A | Yes | Yes | Yes | Yes | N/A | Yes | **Stable** |
| 6 | **MissingDataEngine** | Yes | Yes | Yes | N/A | No | Yes | Yes | Yes | N/A | Yes | **Warning** |
| 7 | **SafetyGovernance** | N/A | N/A | N/A | N/A | N/A | Yes | Yes | Yes | N/A | Yes | **Stable** |
| 8 | **DeepTwinSnapshotEngine** | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | N/A | Yes | **Stable** |
| 9 | **DeepTwinReviewEngine** | Yes | Yes | Yes | Yes | N/A | Yes | Yes | Yes | N/A | Yes | **Stable** |
| 10 | **DeepTwinExportEngine** | Yes | Yes | Yes | Yes | N/A | Yes | Yes | Yes | No | Yes | **Warning** |
| 11 | **DeepTwinAuditLogger** | N/A | N/A | N/A | N/A | N/A | Yes | Yes | Yes | N/A | Yes | **Stable** |
| 12 | **AccessControl** | N/A | Yes | Yes | N/A | N/A | Yes | Yes | Yes | N/A | Yes | **Stable** |
| 13 | **SynthesisService** | Yes | Yes | Yes | N/A | Yes | Yes | Yes | Yes | N/A | Yes | **Stable** |
| 14 | **AuditLogger** | N/A | N/A | N/A | N/A | N/A | Yes | Yes | Yes | N/A | Yes | **Stable** |

---

## Detailed Analyzer Notes

### 1. MultimodalTimelineEngine
- **Route:** `/api/v1/multimodal/patients/{pid}/timeline`, `/api/v1/deeptwin/patients/{pid}/timeline`
- **Role Gate:** Enforced via `require_clinician_auth`
- **Consent Check:** AI synthesis consent checked at endpoint level
- **Evidence Links:** Events carry `evidence_links` field but engine does not populate them ( EvidenceLinkingEngine does)
- **Provenance:** Every event has `provenance` dict with source, entered_by, site
- **Audit Events:** `AuditLogger.log_intelligence_request()` called
- **Degraded State:** Returns empty list gracefully when no events
- **Tests:** `test_timeline_engine.py`, `test_deeptwin_api.py::TestDeepTwinTimeline`

### 2. CorrelationEngine
- **Route:** `/api/v1/multimodal/patients/{pid}/correlations`
- **Role Gate:** Enforced via `require_clinician_auth`
- **Consent Check:** AI synthesis consent checked at endpoint level
- **Evidence Links:** Evidence attached via EvidenceLinkingEngine after correlation detection
- **Provenance:** Supporting events tracked with event_ids
- **Audit Events:** `AuditLogger.log_intelligence_request()` called
- **Degraded State:** Returns empty list when < 2 events or no correlations
- **Safety:** Score capped at 0.94, "Temporal association only" label on every output
- **Tests:** `test_correlation_engine.py`, `test_deeptwin_api.py`

### 3. ConfoundEngine
- **Route:** `/api/v1/multimodal/patients/{pid}/confounders`
- **Role Gate:** Enforced via `require_clinician_auth`
- **Consent Check:** AI synthesis consent checked at endpoint level
- **Evidence Links:** Confounders do not carry evidence links (gap)
- **Provenance:** Supporting events tracked
- **Audit Events:** `AuditLogger.log_intelligence_request()` called
- **Degraded State:** Returns empty list when no confounders detected
- **Safety:** SafetyGovernance.apply_all() called on all outputs
- **Warning:** Missing evidence links for confounders
- **Tests:** `test_confound_engine.py`

### 4. EvidenceLinkingEngine
- **Route:** Called internally by SynthesisService and DeepTwinSnapshotEngine
- **Role Gate:** Inherits from caller
- **Consent Check:** Inherits from caller
- **Evidence Links:** **Core function** -- attaches, grades, and links evidence
- **Provenance:** External provenance built from supporting events
- **Audit Events:** Events logged via caller
- **Degraded State:** Returns fallback grade D evidence when none found
- **Safety:** Confidence capped to MAX_CONFIDENCE - 0.01
- **Tests:** `test_evidence_engine.py`

### 5. HypothesisRankingEngine
- **Route:** `/api/v1/multimodal/patients/{pid}/hypotheses`, `/api/v1/deeptwin/patients/{pid}/hypotheses`
- **Role Gate:** Enforced via `require_clinician_auth`
- **Consent Check:** AI synthesis consent checked at endpoint level
- **Evidence Links:** Hypotheses carry evidence links via _hypothesis_evidence_links()
- **Provenance:** Supporting events tracked
- **Audit Events:** `AuditLogger.log_intelligence_request()` called
- **Degraded State:** Produces hypotheses even with sparse data
- **Safety:** MAX_SCORE = 0.94, all hypotheses marked research_only=True
- **Tests:** `test_hypothesis_engine.py`, `test_deeptwin_api.py::TestDeepTwinHypotheses`

### 6. MissingDataEngine
- **Route:** `/api/v1/multimodal/patients/{pid}/quality-flags`
- **Role Gate:** Enforced via `require_clinician_auth`
- **Consent Check:** AI synthesis consent checked at endpoint level
- **Evidence Links:** Quality flags do not carry evidence links (gap)
- **Provenance:** Gap events tracked
- **Audit Events:** `AuditLogger.log_intelligence_request()` called
- **Degraded State:** Returns empty list when no gaps detected
- **Warning:** Missing evidence links for quality flags
- **Tests:** `test_missing_data_engine.py`

### 7. SafetyGovernance
- **Route:** N/A (cross-cutting middleware)
- **Role Gate:** N/A
- **Consent Check:** N/A
- **Evidence Links:** N/A
- **Provenance:** Tracks `safety_governance_applied: True` in provenance
- **Audit Events:** Validation errors tracked in response
- **Degraded State:** Sanitizes/corrects outputs instead of failing
- **Safety:** DISALLOWED_PATTERNS (13), MAX_CONFIDENCE = 0.95, required labels
- **Tests:** `test_correlation_engine.py` (indirect), `test_deeptwin_api.py::test_snapshot_no_causal_overclaiming`

### 8. DeepTwinSnapshotEngine
- **Route:** `/api/v1/deeptwin/patients/{pid}/snapshot`
- **Role Gate:** Enforced via `require_clinician_auth`
- **Consent Check:** AI synthesis consent checked at endpoint level
- **Evidence Links:** Evidence linking applied to all insights
- **Provenance:** Full provenance with all engine names, version, timestamp
- **Audit Events:** `AuditLogger.log_intelligence_request()` + `DeepTwinAuditLogger.log_deeptwin_event()`
- **Degraded State:** Produces snapshot even with zero events (empty but valid)
- **Safety:** FORECAST_UNAVAILABLE enforced, SafetyGovernance.apply_all on all insights
- **Tests:** `test_deeptwin_api.py::TestDeepTwinSnapshot`

### 9. DeepTwinReviewEngine
- **Route:** `/api/v1/deeptwin/patients/{pid}/review`
- **Role Gate:** Enforced via `require_clinician_auth`
- **Consent Check:** Inherits from caller
- **Evidence Links:** N/A (workflow engine)
- **Provenance:** Immutable review records with audit_reference
- **Audit Events:** Every action creates immutable audit event + DeepTwinAuditEvent
- **Degraded State:** Validates action before processing
- **Safety:** SAFETY_LABEL appended to all outputs, VALID_ACTIONS enforced
- **Tests:** `test_deeptwin_review.py`, `test_deeptwin_api.py::TestDeepTwinReview`

### 10. DeepTwinExportEngine
- **Route:** `/api/v1/deeptwin/patients/{pid}/export`
- **Role Gate:** Enforced via `require_clinician_auth`
- **Consent Check:** Inherits from caller
- **Evidence Links:** N/A (export engine)
- **Provenance:** Audit reference tracked on every export
- **Audit Events:** Export events logged
- **Degraded State:** Validates export_type before processing
- **Warning:** No demo watermark on exports (synthetic data could be mistaken for real)
- **Tests:** `test_deeptwin_api.py::TestDeepTwinExport`

### 11. DeepTwinAuditLogger
- **Route:** N/A (logging utility)
- **Role Gate:** N/A
- **Consent Check:** N/A
- **Evidence Links:** N/A
- **Provenance:** All events written to SQLite with full metadata
- **Audit Events:** **Core function** -- dedicated audit logging
- **Degraded State:** Graceful SQLite error handling
- **Tests:** `test_deeptwin_api.py` (indirect)

### 12. AccessControl
- **Route:** N/A (auth middleware)
- **Role Gate:** **Core function** -- REQUIRED_ROLE = "clinician"
- **Consent Check:** **Core function** -- ai_analysis_consent verification
- **Evidence Links:** N/A
- **Provenance:** Access checks logged
- **Audit Events:** Failed auth attempts logged
- **Degraded State:** Returns detailed error (but not to client -- sanitized to 403)
- **Tests:** `test_access_control.py`

### 13. SynthesisService
- **Route:** `/api/v1/multimodal/patients/{pid}/synthesis`, `/api/v1/deeptwin/patients/{pid}/synthesis`
- **Role Gate:** Enforced via `require_clinician_auth`
- **Consent Check:** AI synthesis consent checked (ai_synthesis=True)
- **Evidence Links:** Evidence linking applied to all insights
- **Provenance:** Inherited from individual engines
- **Audit Events:** `AuditLogger.log_synthesis_request()` called
- **Degraded State:** Produces synthesis even with zero events
- **Tests:** `test_api_endpoints.py`, `test_deeptwin_api.py::TestDeepTwinSynthesis`

### 14. AuditLogger
- **Route:** N/A (logging utility)
- **Role Gate:** N/A
- **Consent Check:** N/A
- **Evidence Links:** N/A
- **Provenance:** SHA-256 request hashing for integrity
- **Audit Events:** **Core function** -- centralized audit logging
- **Degraded State:** Graceful DB error handling
- **Tests:** `test_api_endpoints.py` (indirect)

---

## Summary Statistics

| Metric | Count |
|--------|-------|
| Total Analyzers | 14 |
| Stable | 11 (78.6%) |
| Warning | 3 (21.4%) |
| Critical | 0 (0%) |

## Warning Items

| Analyzer | Issue | Recommended Action |
|----------|-------|-------------------|
| ConfoundEngine | No evidence links attached | Add evidence link support for confounders |
| MissingDataEngine | No evidence links attached | Add evidence link support for quality flags |
| DeepTwinExportEngine | No demo watermark on exports | Add demo mode watermark when VITE_DEMO_MODE=true |

---

## Phase 3 vs Phase 4 Coverage

| Phase | Analyzers | Routes | All Stable? |
|-------|-----------|--------|-------------|
| Phase 3 (Multimodal Intelligence) | 6 engines | 5 endpoints | Yes (2 warnings) |
| Phase 4 (DeepTwin) | 5 engines + 3 cross-cutting | 5 endpoints | Yes (1 warning) |
| Cross-cutting | 3 utilities | N/A | Yes |
