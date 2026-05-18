# DeepSynaps Protocol Studio - Comprehensive Test Audit Report

**Audited:** 2025-01-28
**Auditor:** Senior Python Code Reviewer (Test Specialist)
**Scope:** 21 backend test files + 4 E2E spec files + 4 E2E support files

---

## Executive Summary

| Metric | Value |
|--------|-------|
| Backend test files | 21 (20 substantive + 1 empty `__init__.py`) |
| Backend test functions | 544 |
| Backend test lines | 7,243 |
| E2E spec files | 4 |
| E2E test cases | 31 |
| E2E support files | 4 (2 fixtures + 2 page objects) |
| E2E lines | 726 |
| **Total test functions** | **575** |
| Overall test readiness score | **6.5 / 10** |

---

## 1. File-by-File Backend Test Analysis

### 1.1 `__init__.py` (EMPTY)
- **Lines:** 0
- **Tests:** 0
- **Coverage:** N/A
- **Verdict:** Empty file. Harmless but serves no purpose.

---

### 1.2 `test_access_control.py` - BEST IN CLASS
- **Lines:** 890
- **Tests:** ~75
- **What it tests:** RBAC, clinic isolation, AI synthesis consent, role hierarchy (super_admin, clinic_admin, clinician, reviewer, technician), decorator-based guards, audit logging, pre-configured guards (CLINICIAN_GUARD, AI_SYNTHESIS_GUARD, REVIEW_GUARD, EXPORT_GUARD, ADMIN_GUARD, SUPER_ADMIN_GUARD), role lookup, full_guard, cross-cutting security.
- **Coverage Quality:** **GOOD**
- **Strengths:**
  - Comprehensive role coverage (5 roles)
  - Tests all 6 pre-configured guards individually
  - Clinic isolation (same clinic granted, different clinic denied)
  - AI consent enforcement (with/without consent)
  - Cross-cutting security test loops through ALL roles
  - Result structure validation (all expected fields present)
  - Both positive and negative test cases
- **Issues:**
  - Uses hardcoded `sys.path.insert` on line 10 (inconsistent with pytest best practices)
  - `test_access_log_created` (line 241) queries DB directly instead of using API - breaks encapsulation
  - No test for concurrent access (race conditions)
  - No test for token expiration/invalid tokens
  - No test for clinic_id header injection attacks (SQL injection, etc.)

---

### 1.3 `test_api_endpoints.py` - GOOD
- **Lines:** 369
- **Tests:** ~19
- **What it tests:** Health check, auth enforcement (missing clinic_id, missing access token, unauthorized clinic, no AI consent), timeline endpoint (success, modality filter, date range, wrong clinic), correlations, confounders, quality flags, synthesis endpoint (success, requires AI consent, wrong clinic), safety disclaimer presence, audit logging.
- **Coverage Quality:** **GOOD**
- **Strengths:**
  - Tests all major API endpoints
  - Validates safety disclaimers in ALL responses
  - Auth enforcement (4 negative auth tests)
  - Modality filtering and date range filtering
  - Synthesis response structure validation
  - Audit log verification via DB
- **Issues:**
  - `P1`: `test_audit_log_created` (line 355) uses `tmp_path` fixture but the DB path comes from the fixture closure - test accesses wrong path if fixture changes
  - No test for 404 patient not found (only tests 403 wrong clinic)
  - No test for malformed JSON in POST /synthesis
  - No test for invalid date format in query params
  - No test for rate limiting
  - No test for OPTIONS/preflight CORS

---

### 1.4 `test_cache_service.py` - GOOD
- **Lines:** 443
- **Tests:** ~44
- **What it tests:** MockRedis core (set/get, delete, TTL expiration, delete_pattern, ping, scan), CacheConfig (default/custom TTL, key prefix, patient TTL, clinic summary TTL, enabled check), CacheService core (enabled, is_redis, health, JSON set/get, missing keys, serialization, delete, delete_prefix), PHI-safe key builder (basic key, patient key, no PHI, params hashed, route, role, empty IDs), cache invalidation (patient, clinic, no match), singleton pattern, SummaryEngine key patterns, security (no pickle, nested JSON, unicode, no newlines).
- **Coverage Quality:** **GOOD**
- **Strengths:**
  - Tests both mock and (conditional) real Redis
  - Security tests for no pickle serialization
  - PHI-safe key builder thoroughly tested
  - TTL behavior verified with `time.sleep`
  - Singleton lifecycle tested
  - Unicode handling verified
- **Issues:**
  - `P2`: `test_ttl_expiration` (line 82) uses `time.sleep(1.5)` - slow test, should use mock time or freeze_time
  - `P2`: `test_set_without_ttl` (line 112) uses `time.sleep(0.1)` - unnecessary delay
  - `test_is_enabled_when_redis_unavailable` (line 152) has conditional assertion - test path varies by environment
  - No test for Redis connection failure/recovery
  - No test for cache stampede prevention
  - No test for cache warming

---

### 1.5 `test_confound_engine.py` - ADEQUATE
- **Lines:** 289
- **Tests:** ~21
- **What it tests:** 12 confounder categories (medication changes, poor sleep, missed sessions, adverse events, infection/inflammation, nutrition abnormalities, data gaps, poor data quality, missing assessments, stale data, low adherence, changed parameters) plus safety checks (clinician_review_required, research_only, insight_type, confidence cap, uncertainty_drivers, safety_labels).
- **Coverage Quality:** **ADEQUATE**
- **Strengths:**
  - Tests all 12 confounder detection categories
  - Negative tests (old medication not detected, good sleep not detected)
  - Safety assertions (confidence < 0.95, safety labels present)
  - Uses `unittest.TestCase` with proper setUp/tearDown
- **Issues:**
  - `P2`: Uses `/tmp/` paths for database files (lines 19, 24) instead of `tmp_path` fixture - risk of test pollution
  - `test_detect_missed_sessions` (line 94) has weak assertion - just checks for type, not actual gap detection logic
  - `test_detect_no_wearable_data` (line 143) and `test_detect_wearable_gap` (line 149) test similar scenarios
  - No test for confounder interaction/overlap
  - No test for empty patient data
  - No test for edge cases in numeric_features (None, NaN, negative values)

---

### 1.6 `test_correlation_engine.py` - ADEQUATE
- **Lines:** 188
- **Tests:** ~15
- **What it tests:** Correlation within window, no correlation outside window, empty patient, confidence thresholds, safety labels (temporal association, clinician review), forbidden causal language, uncertainty drivers, research_only, clinician_review_required, insight_type, supporting_events, timeline_window, no duplicate pairs, modality pairing logic.
- **Coverage Quality:** **ADEQUATE**
- **Strengths:**
  - Temporal window filtering verified
  - Confidence threshold filtering
  - Safety label assertions (no causal certainty language)
  - Forbidden words list explicitly checked
  - Duplicate pair detection
  - Supporting events populated with event_ids
- **Issues:**
  - `P2`: Uses `/tmp/` paths for DB (lines 18-19) instead of `tmp_path`
  - `test_only_interesting_pairs_detected` (line 175) has hardcoded expected modality pairs - fragile if engine changes
  - Only tests "interventions" + "assessments" pair - doesn't cover other modality combinations
  - No test for correlation strength calculation accuracy
  - No test for single-event patient
  - No test for correlation with conflicting data

---

### 1.7 `test_database_indexes.py` - GOOD
- **Lines:** 292
- **Tests:** ~19
- **What it tests:** 9 expected indexes existence, index count, query plan index usage (patient+timestamp, patient+modality+timestamp, date range, audit clinic, audit patient, evidence modality), query performance (<50ms), insert with indexes, seed evidence with indexes, patient access with indexes, audit log with indexes, backward compatibility, PostgreSQL SQL adaptation.
- **Coverage Quality:** **GOOD**
- **Strengths:**
  - Verifies all 9 expected indexes by name
  - Uses `EXPLAIN QUERY PLAN` to confirm index usage
  - Performance assertions (<50ms) with seeded data
  - Backward compatibility tests
  - PostgreSQL/SQLite dialect adaptation tested
  - Parametrized patient query test (3 patients)
- **Issues:**
  - `P1`: `test_evidence_modality_uses_index` (line 166) has a `pass` statement - test does nothing meaningful for LIKE queries with leading wildcard
  - `test_patient_query_under_50ms` (line 182) has performance assertion that may be flaky in CI
  - No test for index creation concurrent with writes
  - No test for index on very large datasets (>10k rows)
  - `sys.path.insert(0, "apps/api/src/deepsynaps")` (line 14) is fragile - path-dependent

---

### 1.8 `test_database_postgres_smoke.py` - GOOD
- **Lines:** 222
- **Tests:** ~22
- **What it tests:** Dialect detection (default SQLite, PostgreSQL URL), SQL adaptation (AUTOINCREMENT->SERIAL, CURRENT_TIMESTAMP passthrough, placeholder formats), live PostgreSQL connection (skipped without DATABASE_URL), table creation, insert/read, production safety guard, config validation.
- **Coverage Quality:** **GOOD**
- **Strengths:**
  - Gracefully skips when DATABASE_URL not set (lines 96-99)
  - Tests SQL dialect adaptation directly
  - Production safety guard tested (SQLite in production raises RuntimeError)
  - Config class integration tested
  - Placeholder format verification (? vs %s)
- **Issues:**
  - `P1`: Live PostgreSQL tests (lines 100-171) are never run in CI (no DATABASE_URL) - effectively dead code
  - `test_production_safety_guard` (line 155) and `test_production_without_postgresql_raises` (line 175) duplicate the same scenario
  - `test_demo_mode_env` (line 211) has a comment admitting it can't properly test config re-reading
  - No test for connection pool behavior
  - No test for connection retry logic
  - `sys.path.insert` path is fragile

---

### 1.9 `test_deeptwin_api.py` - ADEQUATE
- **Lines:** 283
- **Tests:** ~18
- **What it tests:** DeepTwin snapshot (success, no access, safety disclaimer, modality coverage, no causal overclaiming), timeline, hypotheses, synthesis (success, no AI consent, forecast unavailable), review (accept, invalid action, note), export (json, report_handoff, protocol_handoff).
- **Coverage Quality:** **ADEQUATE**
- **Strengths:**
  - Tests all DeepTwin API route groups (snapshot, timeline, hypotheses, synthesis, review, export)
  - Safety checks on snapshot output
  - Modality coverage verification (assessment, qeeg, medication)
  - Export format types tested
  - Invalid action returns proper error code
- **Issues:**
  - `P1`: Uses hardcoded `/tmp/test_deeptwin_api.db` (line 19) - test pollution risk across parallel runs
  - `test_snapshot_no_causal_overclaiming` (line 112) has weak assertion using `or` conditions that always pass
  - `test_review_accept` (line 199) accepts both 200 and 404 - 404 path means the endpoint isn't even mounted
  - `test_export_json` (line 247) accepts 404 - endpoint may not exist
  - No test for snapshot generation performance
  - No test for concurrent snapshot requests
  - No test for invalid export_type

---

### 1.10 `test_deeptwin_review.py` - GOOD
- **Lines:** 501
- **Tests:** ~30
- **What it tests:** All 6 valid review actions (accept, reject, note, request_data, mark_reviewed), invalid action raises ValueError, get_reviews_for_patient (with data, empty), get_reviews_for_snapshot (with data, empty), accept_hypothesis audit event, reject_hypothesis audit event, add_note audit event, request_more_data with modalities, mark_reviewed status update, create_follow_up_task, complete_task, complete nonexistent task, review status aggregation, empty review status, safety labels, append-only immutability, review_id format, audit event valid types, table creation.
- **Coverage Quality:** **GOOD**
- **Strengths:**
  - All VALID_ACTIONS tested individually
  - Invalid action validation (both at contract and engine level)
  - Audit event verification for all action types
  - Follow-up task lifecycle (create, complete, nonexistent)
  - Review status aggregation (complex multi-action scenario)
  - Immutability test (PRIMARY KEY conflict on duplicate)
  - Safety label constant verification
- **Issues:**
  - `P1`: Uses hardcoded `/tmp/test_deeptwin_review.db` (line 26) instead of `tmp_path`
  - `test_record_review_invalid_action_via_engine` (line 135) manually constructs dataclass instance with `object.__setattr__` - brittle workaround
  - `test_reviews_are_append_only` (line 436) catches generic `Exception` instead of specific integrity error
  - No test for review permissions (who can review what)
  - No test for review export/report generation
  - No test for review data retention limits

---

### 1.11 `test_deeptwin_snapshot.py` - BEST IN CLASS
- **Lines:** 1000
- **Tests:** ~66
- **What it tests:** Snapshot generation (returns correct type, has patient_id, snapshot_id, timeline events, correlations, confounders, hypotheses, quality flags, evidence links), modality coverage (all 18 modalities, true/false/seeded data), recency classification (fresh/stale/old/missing across all 18 modalities), forecast status (always unavailable), no causal overclaiming, safety disclaimer, uncertainty drivers, hypothesis provenance (all 7 engines, version, safety flag, forecast policy), export (json, pdf, report_handoff, protocol_handoff, invalid type, safety header, audit reference), report handoff, protocol handoff, audit logging (all 9 event types, invalid type, generic event), confidence safety (< 0.95 for hypotheses, correlations, quality flags), hypothesis labels, snapshot serialization, clinician review status defaults.
- **Coverage Quality:** **GOOD**
- **Strengths:**
  - Most comprehensive test file in the suite
  - Tests all 18 canonical modalities
  - Recency classification (fresh/stale/old/missing) thoroughly verified
  - Forecast policy "never_faked" enforced
  - All 9 audit event types tested
  - Export formats all validated
  - Confidence cap (< 0.95) enforced across all output types
  - Safety labels verified on hypotheses
  - Proper use of tmpfile databases via fixtures
- **Issues:**
  - `P2`: File is exactly 1000 lines - may be truncated. Need to verify if `test_to_dict_has_all_keys` and subsequent tests are complete
  - `test_generate_snapshot_returns_deeptwin_snapshot` (line 233) tests isinstance which is a weak assertion
  - `test_empty_patient_generates_snapshot` (line 286) asserts timeline_events == [] but doesn't verify other fields are properly empty
  - No test for snapshot generation performance (large patients)
  - No test for snapshot caching behavior
  - No test for concurrent snapshot generation

---

### 1.12 `test_demo_mode_config.py` - GOOD
- **Lines:** 280
- **Tests:** ~41
- **What it tests:** demo_mode() parsing (true/1/yes/TRUE/false/0/empty/no env), demo_seed_enabled(), demo_mode_label() (default/custom/empty), production demo guard (development no warning, production demo seed warns, production demo mode warns, both flags warn, clean no warnings, staging allowed), runtime_config() (returns dict, expected keys, no secrets, dialect, pool size), app_env() parsing (default/production/staging/test/testing).
- **Coverage Quality:** **GOOD**
- **Strengths:**
  - Comprehensive env var parsing tests
  - Case-insensitive boolean parsing verified
  - Production guardrail warnings tested
  - Secret exposure prevention verified
  - Pool configuration defaults tested
  - Autouse fixture cleans env before every test
- **Issues:**
  - `test_no_env_var` (line 68) directly checks os.environ instead of using monkeypatch
  - `test_demo_mode_env` (line 211) acknowledges it can't test class attribute re-reading
  - `test_pool_size_none_sqlite` (line 240) and `test_pool_size_in_runtime_config_postgres` (line 235) may conflict with env state
  - No test for malformed DATABASE_URL
  - No test for missing required env vars in production
  - No test for config hot-reloading

---

### 1.13 `test_evidence_engine.py` - ADEQUATE
- **Lines:** 248
- **Tests:** ~14
- **What it tests:** attach_evidence (populates links, research_only for C/D grade, confidence < 0.95, clinician_review_required, uncertainty drivers, multiple insights, with supporting events), grade_evidence (no evidence=D, grade A, grade B, mixed grades), find_conflicting_evidence (detects conflicts, returns list, EvidenceLink type).
- **Coverage Quality:** **ADEQUATE**
- **Strengths:**
  - Evidence grade aggregation (A, B, C, D)
  - Conflicting evidence detection
  - Grade-based research_only flag
  - Safety properties maintained after evidence attachment
- **Issues:**
  - `P1`: Uses hardcoded `/tmp/test_evidence.db` (line 27) instead of `tmp_path`
  - `test_attach_evidence_sets_research_only_for_low_grade` (line 76) has conditional assertion with `if has_low_grade` - test passes even if branch not taken
  - `test_find_conflicting_evidence_detects_conflicting_flag` (line 219) has weak assertion (`>= 0`)
  - Only 14 tests for a complex evidence engine - coverage is thin
  - No test for evidence link sorting/ranking
  - No test for evidence provenance tracking
  - No test for missing external references

---

### 1.14 `test_gzip_compression.py` - ADEQUATE
- **Lines:** 192
- **Tests:** ~6
- **What it tests:** Large response gzip activation, small response not gzipped, no Accept-Encoding no gzip, compression ratio > 50%, safety disclaimer survives compression, content-type JSON preserved.
- **Coverage Quality:** **ADEQUATE**
- **Strengths:**
  - Uses async httpx for realistic HTTP testing
  - Tests both compressed and uncompressed paths
  - Compression ratio assertion
  - Safety disclaimer integrity after compression
  - Content-Type preserved
- **Issues:**
  - `P1`: Only 6 tests for gzip compression - minimal coverage
  - `test_compression_ratio_above_50_percent` (line 125) does `gzip.compress(body)` on already-decompressed body - incorrect ratio calculation
  - `test_large_response_is_gzipped` (line 71) seeds 200 events which is slow
  - No test for gzip on POST responses
  - No test for gzip decompression errors
  - No test for very large payloads (>1MB)
  - Uses `asyncio.run()` within sync test functions - anti-pattern for pytest-asyncio

---

### 1.15 `test_hypothesis_engine.py` - ADEQUATE
- **Lines:** 204
- **Tests:** ~13
- **What it tests:** rank_hypotheses (returns list, max_hypotheses respected, descending order, confidence < 0.95, clinician_review_required, research_only, uncertainty_drivers, safety labels, insight_type, no events, default max, evidence_links, modalities).
- **Coverage Quality:** **ADEQUATE**
- **Strengths:**
  - Confidence cap enforced
  - Descending sort order verified
  - Default max_hypotheses (5) tested
  - Safety governance integration verified
  - Handles empty patient gracefully
- **Issues:**
  - `P1`: Uses hardcoded `/tmp/test_hypothesis.db` (line 20) instead of `tmp_path`
  - `test_rank_hypotheses_with_no_patient_events` (line 170) asserts `len(result) > 0` but doesn't verify result quality
  - `test_rank_hypotheses_default_max` (line 177) tests `<= 5` but default could change
  - No test for hypothesis ranking algorithm accuracy (what ranks higher and why)
  - No test for hypothesis deduplication
  - No test for hypothesis confidence calculation
  - Only 13 tests for a complex ranking engine

---

### 1.16 `test_materialized_views.py` - GOOD
- **Lines:** 347
- **Tests:** ~32
- **What it tests:** Dialect detection (SQLite detected, not available, fallback source, cached), clinic activity summary (None on SQLite, no crash, no mutation), patient analyzer counts (None on SQLite, no crash), view status (dict, required keys, SQLite dialect, not available, empty views, no error, no PHI), refresh operations (no-op on SQLite, returns dict, doesn't crash), create/drop views (empty on SQLite), performance (<100ms), edge cases (empty clinic_id, None, SQL injection, unicode, long string), integration with seeded data.
- **Coverage Quality:** **GOOD**
- **Strengths:**
  - SQLite fallback behavior thoroughly tested
  - Edge cases: empty, None, SQL injection, unicode, long strings
  - Performance assertions (<100ms)
  - No-PHI verification
  - No-mutation guarantee verified via DB count check
  - PostgreSQL marker available for conditional runs
- **Issues:**
  - `P2`: `test_special_chars_in_id` (line 284) tests SQL injection as `'; DROP TABLE--` but this is just a parameter - the test only verifies no crash, not actual SQL injection prevention
  - Most tests assert `result is None` which is the SQLite fallback - limited value
  - PostgreSQL-specific tests are never run (no `@pytest.mark.postgres` tests actually test PostgreSQL MVs)
  - `test_evidence_modality_uses_index` in `test_database_indexes.py` has `pass` - NOP test

---

### 1.17 `test_missing_data_engine.py` - GOOD
- **Lines:** 385
- **Tests:** ~20
- **What it tests:** detect_gaps (returns list, missing modality, clinician_review_required, confidence < 0.95, uncertainty drivers, stale data, missing biomarker, expected_modalities filter, consent missing, no evidence links, safety labels), check_staleness (old=True, fresh=False, exact threshold, one day over), check_completeness (empty=0, with events, quality weighting, recency weighting).
- **Coverage Quality:** **GOOD**
- **Strengths:**
  - Quality weighting verified (high quality > low quality)
  - Recency weighting verified (recent > old)
  - Completeness returns dict with all modalities
  - Staleness threshold edge cases tested
  - Expected modalities filter works
- **Issues:**
  - `P1`: Uses hardcoded `/tmp/test_missing_data.db` (line 21) instead of `tmp_path`
  - `test_detect_gaps_expected_modalities_filter` (line 145) doesn't assert anything meaningful about filtering
  - `test_detect_gaps_consent_missing` (line 157) consent flag detection is weak
  - No test for completeness with all modalities present
  - No test for gap priority/severity ordering
  - No test for gap remediation suggestions

---

### 1.18 `test_summary_endpoints.py` - GOOD
- **Lines:** 296
- **Tests:** ~22
- **What it tests:** Clinic dashboard (200, counts not records, no PHI, safety disclaimer, modality breakdown bounded, payload smaller than full), patient dashboard (200, counts not records, no full events, safety disclaimer, correct event count), analyzer status (200, modality counts, stale modalities, safety disclaimer, bounded payload), clinic isolation (different counts per clinic), response time (<200ms).
- **Coverage Quality:** **GOOD**
- **Strengths:**
  - Payload size comparison (summary vs full timeline)
  - No-PHI assertions in clinic dashboard
  - Response time assertions (<200ms)
  - Clinic isolation verified with different counts
  - Bounded payload assertions (modality breakdown <= 10, analyzer < 100KB)
- **Issues:**
  - `P2`: Response time tests (lines 265, 276, 287) use `time.perf_counter()` inside test - flaky in CI under load
  - `test_analyzer_status_clinic_isolated` (line 247) uses `or` condition - test passes if either assertion is true, weakening the test
  - `test_clinic_1_sees_different_counts` (line 240) only checks status code 200, no data validation
  - No test for unauthorized clinic access on summary endpoints
  - No test for summary endpoint caching behavior
  - No test for summary with zero patients/events

---

### 1.19 `test_summary_engine_unit.py` - BEST IN CLASS
- **Lines:** 453
- **Tests:** ~61
- **What it tests:** Clinic dashboard (returns dict, required fields, scope, clinic_id, active_patients, recent_events, ai_consent_count, patients_missing_consent, high_risk_patients, pending_reviews, modality_breakdown bounded, quality_flags, evidence_coverage, partial, safety, different clinics, empty clinic, no PHI, response time), patient dashboard (returns dict, required fields, scope, total_events=50, latest_by_modality, missing_modalities, risk_signal_count, consent_status, no full records, empty patient, response time), patient analyzer (returns dict, required fields, scope, modality_stats, missing_modalities, risk_status, avg_confidence, evidence_linked_count, empty patient, response time), analyzer status (returns dict, required fields, stale_modalities, evidence_entries), no-mutation guarantee, cache integration (second call cached for all 3 summary types).
- **Coverage Quality:** **GOOD**
- **Strengths:**
  - Most comprehensive summary testing
  - Cache integration verified (miss -> hit)
  - No-mutation guarantee (event count unchanged after 5 summary calls)
  - Response time assertions
  - Empty patient behavior verified
  - Evidence coverage percentage (0-100 range check)
  - All 3 summary types (clinic, patient, analyzer) have dedicated test classes
- **Issues:**
  - `P2`: Response time assertions (<200ms) are flaky in CI
  - `test_different_clinics_different_counts` (line 154) uses `or` condition - weakened assertion
  - Cache tests depend on internal cache implementation - may fail if cache is disabled
  - No test for cache eviction/invalidation
  - No test for concurrent summary requests
  - No test for summary with corrupted data

---

### 1.20 `test_time_utils.py` - GOOD
- **Lines:** 207
- **Tests:** ~24
- **What it tests:** utc_now() (returns datetime, aware, UTC, recent, no deprecation, monotonic), utc_iso() (returns string, has +00:00, parseable), utc_from_timestamp() (returns datetime, aware, UTC, roundtrip, no deprecation), naive_utc_now() (returns datetime, naive, UTC value), to_naive() (converts aware, passes through naive), to_aware() (converts naive, passes through aware), edge cases (microsecond precision, ISO sort order, epoch timestamp).
- **Coverage Quality:** **GOOD**
- **Strengths:**
  - All time utility functions covered
  - Deprecation warning detection
  - Roundtrip integrity verified
  - Edge cases (epoch, microsecond precision)
  - ISO string sort order verified
- **Issues:**
  - `test_returns_different_times` (line 55) uses `time.sleep(0.01)` - adds latency
  - `test_utc_iso_sorted` (line 194) uses `time.sleep(0.01)` twice - adds 20ms per test run
  - No test for timezone conversion to non-UTC zones
  - No test for daylight saving time boundaries
  - No test for leap second handling
  - Tests are somewhat redundant (utc_now, utc_iso, utc_from_timestamp share similar assertions)

---

### 1.21 `test_timeline_engine.py` - ADEQUATE
- **Lines:** 154
- **Tests:** ~12
- **What it tests:** seed_sample_events (returns IDs, multiple modalities, sorted), build_timeline (sorted ascending), modality filter (single, multiple, unknown raises), date range filter (within range, no overlap), combined filter, field completeness (required fields present, data_quality enum, confidence range, provenance dict, evidence_links list, audit_reference format), deterministic ordering with tie-breaker.
- **Coverage Quality:** **ADEQUATE**
- **Strengths:**
  - Timeline sorting verified
  - Modality filtering (single, multiple, unknown)
  - Date range filtering (within, no overlap)
  - Combined modality + date filter
  - Field completeness (all required fields present)
  - Deterministic tie-breaker (sorted by event_id when timestamps equal)
- **Issues:**
  - `P2`: Uses `/tmp/` paths for DB (line 19) instead of `tmp_path`
  - `test_modality_filter_unknown_raises` (line 74) only tests ValueError for unknown modality - doesn't test behavior
  - `test_event_has_required_fields` (line 116) checks fields exist but not their content quality
  - `test_deterministic_order_same_timestamp` (line 135) only tests 3 events - should test more
  - No test for timeline with very large patient (1000+ events)
  - No test for timeline pagination
  - No test for concurrent timeline builds

---

## 2. E2E Test Analysis

### 2.1 `demo-mode.spec.ts` - ADEQUATE
- **Lines:** 135
- **Tests:** 7
- **What it tests:** Demo banner visibility (enabled/disabled), banner dismissal, banner text validation, demo/live boundary, demo patient ID heuristic, DeepTwin page demo banner.
- **Coverage Quality:** **ADEQUATE**
- **Strengths:**
  - Tests both enabled and disabled states
  - Dismissal interaction tested
  - Text validation (contains DEMO, Synthetic, non-PHI, not for real patient care)
  - Multiple pages tested (synthesis dashboard, DeepTwin)
- **Issues:**
  - `P2`: Tests use `localStorage.setItem` via `page.addInitScript` to simulate demo mode - doesn't test actual demo mode detection from API/config
  - `test patient ID starting with demo- triggers demo mode` (line 120) has a comment admitting it needs component-level mocking - test is incomplete
  - No test for demo data seeding behavior
  - No test for demo mode API responses

---

### 2.2 `doctor-ready-smoke.spec.ts` - GOOD
- **Lines:** 142
- **Tests:** 11
- **What it tests:** SynthesisDashboard (page loads, safety banner, 5 tabs visible/clickable, timeline loads by default, no console errors, header shows title + patient), DeepTwin (page loads with safety disclaimer, DeepTwin header visible, 9 tab navigation sections visible, review status + modality count visible), mobile responsiveness (iPhone viewport).
- **Coverage Quality:** **GOOD**
- **Strengths:**
  - Uses Page Object Model (SynthesisDashboardPage)
  - Console error monitoring (catches JS errors and warnings)
  - Tab navigation through all 5 tabs
  - Mobile responsiveness test (375x812 viewport)
  - DeepTwin page 9 sections all verified
- **Issues:**
  - `P2`: Console warnings are acceptable per comment (line 67) - should distinguish between expected warnings and actual issues
  - `test_header_shows_app_title_and_patient_info` (line 70) checks for "demo-patient-001" text but doesn't verify it's in the correct element
  - `test_tab_navigation_sections_are_visible` (line 96) checks button visibility but doesn't click to verify panel content
  - No test for actual data loading (just page structure)
  - No test for navigation between pages

---

### 2.3 `error-states.spec.ts` - GOOD
- **Lines:** 87
- **Tests:** 6
- **What it tests:** Loading indicator on slow network, 500 error display, 403 forbidden display, no crash on API failure (safety banner still visible, tabs still visible), DeepTwin loading state, missing patient graceful handling.
- **Coverage Quality:** **GOOD**
- **Strengths:**
  - Network interception for error simulation (500, 403, abort)
  - Graceful degradation verified (page doesn't crash, safety banner persists)
  - Loading state verified
  - Missing parameter handling
- **Issues:**
  - `P2`: `test_shows_loading_indicator_while_fetching_data` (line 11) uses `page.route` with 500ms delay but loading indicator may disappear before assertion
  - `test_displays_error_message_when_API_returns_500` (line 26) and `test_displays_error_message_when_API_returns_403` (line 39) look for `error-message` testid but the actual error display may differ
  - No test for 404 Not Found
  - No test for network timeout
  - No test for retry behavior
  - No test for partial data loading (some APIs succeed, some fail)

---

### 2.4 `safety-wording.spec.ts` - GOOD
- **Lines:** 145
- **Tests:** 7
- **What it tests:** Safety banner required phrases, synthesis disclaimer after running synthesis, no causal certainty language on any tab (5 tabs checked), DeepTwin safety disclaimer, no PHI (SSN/DOB patterns), no AI diagnosis/autonomous claims, tab labels clinical-governance safe.
- **Coverage Quality:** **GOOD**
- **Strengths:**
  - Tests ALL dashboard tabs for prohibited language
  - Uses `expect.soft()` for non-fatal assertions across tabs
  - Prohibited phrases explicitly listed and checked
  - SSN and DOB pattern matching for PHI detection
  - Tab label governance check
  - Synthesis disclaimer after button click
- **Issues:**
  - `P1`: `test_synthesis_disclaimer_appears_after_running_synthesis` (line 34) clicks `run-synthesis-btn` but this may trigger real API calls - test is not isolated
  - `test_no_causal_certainty_language_on_any_dashboard_tab` (line 49) only checks static text - doesn't verify content loaded via API
  - `test_header_contains_patient_and_snapshot_info_not_PHI` (line 81) SSN pattern check may produce false positives
  - `test_tab_labels_are_clinical_governance_safe` (line 119) checks tab labels but not panel content
  - No test for safety wording on printed/exported reports

---

### 2.5 `fixtures/auth.setup.ts` - SUPPORT FILE
- **Lines:** 38
- **What it does:** Seeds localStorage with demo credentials, creates 2 session files (clinician-session.json, admin-session.json)
- **Quality:** GOOD - Clean separation of auth setup

---

### 2.6 `fixtures/demo.setup.ts` - SUPPORT FILE
- **Lines:** 30
- **What it does:** Seeds localStorage with demo credentials + enables demo mode, creates demo-session.json
- **Quality:** GOOD - Follows same pattern as auth.setup.ts

---

### 2.7 `pages/DeepTwinPage.ts` - PAGE OBJECT
- **Lines:** 54
- **Quality:** ADEQUATE
- **Issues:**
  - `safetyDisclaimer` uses `page.locator("text=decision support only")` - text-based selector may break if wording changes
  - `modalityBadge` uses regex locator `text=/\d+/18 Modalities/` - may fail if count format changes
  - Only 3 actions (goto, expectSafetyDisclaimer, expectHeaderVisible) - limited interaction coverage
  - No methods for clicking tabs, interacting with review workflow, or export actions

---

### 2.8 `pages/SynthesisDashboardPage.ts` - PAGE OBJECT
- **Lines:** 95
- **Quality:** GOOD
- **Strengths:**
  - Uses `data-testid` selectors throughout - resilient to CSS changes
  - All 5 tabs and panels mapped
  - Loading and error state locators
  - Helper methods for common actions (clickTab, expectPanelVisible, expectAllTabsVisible)
- **Issues:**
  - `expectSafetyDisclaimerText` (line 56) checks for "diagnosis" NOT in text - if text changes to mention diagnosis in a disclaimer context, this will fail
  - No method for verifying panel content (just visibility)
  - No method for filtering or searching within panels

---

## 3. Critical Source Modules WITHOUT Dedicated Test Files

| Source Module | Test File | Priority | Notes |
|---------------|-----------|----------|-------|
| `safety_governance.py` | **MISSING** | **P0** | Core safety logic - confidence capping, causal language filtering, label enforcement - tested indirectly but no dedicated tests |
| `knowledge_layer.py` | **MISSING** | **P0** | Database abstraction layer - ALL other tests depend on it but it has no dedicated test file |
| `main.py` (FastAPI app) | **MISSING** | **P0** | Route definitions, dependency injection, middleware, exception handlers - partially tested via API endpoint tests |
| `database.py` | **MISSING** | **P0** | SQL dialect adaptation, connection management - partially tested via postgres_smoke |
| `contracts.py` | **MISSING** | **P1** | Data models/dataclasses - validation logic, serialization |
| `deeptwin_contracts.py` | **MISSING** | **P1** | DeepTwin-specific contracts |
| `deeptwin_export.py` | **MISSING** | **P1** | Export engine (json, pdf, report_handoff, protocol_handoff) - partially tested via deeptwin_snapshot |
| `deeptwin_audit.py` | **MISSING** | **P1** | Audit logging - partially tested via deeptwin_snapshot |
| `config.py` | **MISSING** | **P1** | Configuration management - partially tested via demo_mode_config |
| `synthesis_service.py` | **MISSING** | **P1** | Synthesis orchestration service - tested indirectly via API tests |
| `audit_logger.py` | **MISSING** | **P2** | Audit logging utilities - partially covered by access_control tests |
| `__init__.py` | N/A | N/A | Package init |

---

## 4. Cross-Cutting Issues

### 4.1 Hardcoded /tmp Paths (P1)
The following test files use hardcoded `/tmp/` database paths instead of `pytest`'s `tmp_path` fixture:
- `test_confound_engine.py:19` - `f"/tmp/test_conf_{id(self)}.db"`
- `test_correlation_engine.py:18` - `f"/tmp/test_corr_{id(self)}.db"`
- `test_deeptwin_api.py:19` - `/tmp/test_deeptwin_api.db`
- `test_deeptwin_review.py:26` - `/tmp/test_deeptwin_review.db`
- `test_evidence_engine.py:27` - `/tmp/test_evidence.db`
- `test_hypothesis_engine.py:20` - `/tmp/test_hypothesis.db`
- `test_missing_data_engine.py:21` - `/tmp/test_missing_data.db`
- `test_timeline_engine.py:19` - `f"/tmp/test_timeline_{id(self)}.db"`

**Risk:** Test pollution across parallel runs, stale data between test runs, no automatic cleanup on test failure.

### 4.2 sys.path.insert Fragility (P2)
Nearly all test files use `sys.path.insert` to make the source package importable:
```python
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src", "deepsynaps"))
```
This is fragile and environment-dependent. Should use `pytest-pythonpath` or proper `setup.py`/`pyproject.toml` configuration.

### 4.3 Mixed Test Frameworks (P2)
- Most files use `pytest` style (functions, fixtures)
- Some files use `unittest.TestCase` (class-based, setUp/tearDown):
  - `test_confound_engine.py`
  - `test_correlation_engine.py`
  - `test_deeptwin_review.py`
  - `test_evidence_engine.py`
  - `test_hypothesis_engine.py`
  - `test_missing_data_engine.py`
  - `test_timeline_engine.py`

This inconsistency makes it harder to share fixtures and use pytest plugins uniformly.

### 4.4 Slow Tests (P2)
- `test_cache_service.py` - `time.sleep(1.5)` for TTL expiration
- `test_time_utils.py` - `time.sleep(0.01)` x2 per test
- `test_database_indexes.py` - seeds 500 events for each parametrized test
- `test_summary_endpoints.py` - seeds 150 events per test class
- `test_gzip_compression.py` - seeds 200 events x3 tests

### 4.5 Test Independence (P2)
- `test_deeptwin_review.py` uses `@classmethod setUpClass` - shared DB state across all tests in class
- `test_evidence_engine.py` uses `@classmethod setUpClass` - shared DB state
- `test_hypothesis_engine.py` uses `@classmethod setUpClass` - shared DB state

Shared state can cause cascading failures when one test corrupts data.

### 4.6 Weak Assertions (P2)
Several tests have weak or conditional assertions:
- `test_snapshot_no_causal_overclaiming` - uses `or` conditions that always pass
- `test_analyzer_status_clinic_isolated` - uses `or` condition
- `test_different_clinics_different_counts` - uses `or` condition
- `test_attach_evidence_sets_research_only_for_low_grade` - conditional `if` branch
- `test_find_conflicting_evidence_detects_conflicting_flag` - asserts `>= 0`

---

## 5. Prioritized Issues

### P0 - BLOCKING (Must fix before deployment)

| # | Issue | File(s) | Line(s) |
|---|-------|---------|---------|
| 1 | **No dedicated tests for `safety_governance.py`** - Confidence capping, causal language detection, label enforcement are core safety mechanisms only tested indirectly | N/A | N/A |
| 2 | **No dedicated tests for `knowledge_layer.py`** - Database abstraction layer has 0 direct tests despite being used by ALL other tests | N/A | N/A |
| 3 | **No dedicated tests for `main.py`** - FastAPI routes, middleware, error handlers have no direct unit tests | N/A | N/A |
| 4 | **No dedicated tests for `database.py`** - SQL dialect adaptation has minimal direct test coverage | N/A | N/A |
| 5 | **`test_deeptwin_snapshot.py` may be truncated at 1000 lines** - Last test (`test_clinician_review_status_defaults`) appears incomplete | test_deeptwin_snapshot.py | 992-1000 |
| 6 | **Hardcoded `/tmp/` DB paths** risk test pollution in CI | 8 files | See section 4.1 |

### P1 - HIGH (Should fix before deployment)

| # | Issue | File(s) | Line(s) |
|---|-------|---------|---------|
| 1 | No dedicated tests for `contracts.py`, `deeptwin_contracts.py`, `deeptwin_export.py`, `deeptwin_audit.py`, `config.py` | N/A | N/A |
| 2 | PostgreSQL smoke tests never run (no DATABASE_URL in CI) | test_database_postgres_smoke.py | 96-171 |
| 3 | `test_evidence_modality_uses_index` has empty `pass` body | test_database_indexes.py | 175 |
| 4 | E2E `test_synthesis_disclaimer_appears_after_running_synthesis` triggers real API calls | safety-wording.spec.ts | 34 |
| 5 | `test_review_accept` and export tests accept 404 (endpoint may not exist) | test_deeptwin_api.py | 199, 247 |
| 6 | `test_snapshot_no_causal_overclaiming` uses `or` that always passes | test_deeptwin_api.py | 112 |
| 7 | Conditional assertions in evidence engine tests | test_evidence_engine.py | 76, 219 |
| 8 | No test for rate limiting or DDoS protection | N/A | N/A |
| 9 | No test for SQL injection in API parameters | N/A | N/A |
| 10 | No test for JWT/auth token validation | N/A | N/A |

### P2 - MEDIUM (Fix after deployment)

| # | Issue | File(s) | Line(s) |
|---|-------|---------|---------|
| 1 | Mixed test frameworks (pytest + unittest) | 7 files | See section 4.3 |
| 2 | `sys.path.insert` fragility across all test files | All test files | Various |
| 3 | Slow tests with `time.sleep` | cache_service.py, time_utils.py | 82-116 |
| 4 | Flaky performance assertions (<50ms, <200ms) | database_indexes.py, summary_endpoints.py, summary_engine_unit.py | Various |
| 5 | Shared DB state in setUpClass | 4 files | See section 4.5 |
| 6 | Gzip compression ratio calculation is incorrect | test_gzip_compression.py | 146 |
| 7 | E2E tests don't test actual API data loading | E2E specs | Various |
| 8 | `__init__.py` is empty but counted as a test file | __init__.py | 1 |

---

## 6. Coverage Gaps Summary

### Backend Coverage Gaps

| Area | Coverage | Missing |
|------|----------|---------|
| Access Control | ~85% | Token validation, concurrent access, injection attacks |
| API Endpoints | ~70% | 404 handling, malformed JSON, CORS, rate limiting |
| Cache Service | ~75% | Connection failure, stampede prevention, warming |
| Confound Engine | ~65% | Edge cases in numeric_features, interaction effects |
| Correlation Engine | ~60% | Other modality pairs, correlation accuracy, single event |
| Database Indexes | ~80% | Concurrent writes, large datasets, LIKE wildcard index usage |
| PostgreSQL Smoke | ~40% | Never runs in CI; pool behavior, retry logic |
| DeepTwin API | ~65% | Performance, concurrent requests, invalid export_type |
| DeepTwin Review | ~80% | Permissions, export, data retention |
| DeepTwin Snapshot | ~85% | Large patients, caching, concurrent generation |
| Demo Mode Config | ~90% | Malformed URLs, hot-reloading |
| Evidence Engine | ~55% | Link ranking, provenance, external refs |
| Gzip Compression | ~40% | POST responses, decompression errors, large payloads |
| Hypothesis Engine | ~60% | Ranking accuracy, deduplication, confidence calc |
| Materialized Views | ~70% | Actual PostgreSQL MV tests never run |
| Missing Data Engine | ~75% | Gap priority, remediation, all-modalities-complete |
| Summary Endpoints | ~75% | Unauthorized access, caching, zero data |
| Summary Engine Unit | ~85% | Cache eviction, concurrent requests |
| Time Utils | ~90% | Non-UTC zones, DST, leap seconds |
| Timeline Engine | ~65% | Large patients, pagination, concurrent builds |

### E2E Coverage Gaps

| Area | Coverage | Missing |
|------|----------|---------|
| Authentication flow | ~30% | Login/logout, token refresh, expired session |
| Data entry | 0% | No tests for creating events, patients, or configurations |
| Export workflow | 0% | No tests for PDF/report/protocol export and download |
| Review workflow | 0% | No tests for accept/reject/note actions in DeepTwin |
| Mobile interactions | ~40% | Only smoke tests, no tap/swipe interactions |
| Accessibility | 0% | No a11y tests (screen readers, keyboard navigation) |
| Cross-browser | 0% | Only default Playwright browser tested |
| Offline mode | 0% | No tests for degraded connectivity |

---

## 7. Top 5 Missing Tests That MUST Be Added Before Deployment

### 1. `test_safety_governance.py` - Safety Governance Unit Tests (P0)
**Why:** Core safety logic (confidence capping, causal language detection, label enforcement) is the most critical component for clinical deployment. Currently only tested indirectly through other engines.
```python
# Must test:
- confidence cap enforcement (input >= 0.95 -> output < 0.95)
- causal language detection ("caused by", "causes", "proven" flagged)
- REQUIRED_HYPOTHESIS_LABEL added to all hypotheses
- contains_causal_overclaiming() for various input strings
- Safety label formatting consistency
```

### 2. `test_knowledge_layer.py` - KnowledgeLayer Unit Tests (P0)
**Why:** The database abstraction layer is used by EVERY other test but has no dedicated tests. A bug here would cascade everywhere.
```python
# Must test:
- insert_event() with all valid/invalid event types
- get_events_for_patient() filtering (modality, date range)
- check_patient_access() all permission combinations
- log_audit() with all parameters
- get_evidence_for_modalities() returns seeded evidence
- _connect() returns valid connection
- Error handling for corrupted DB
```

### 3. `test_main.py` - FastAPI Application Tests (P0)
**Why:** The main application file defines all routes, middleware, and exception handlers. Needs dedicated testing.
```python
# Must test:
- All route definitions return expected HTTP methods
- Dependency injection override works
- Exception handlers (500 -> proper JSON error)
- CORS middleware configuration
- Request validation errors (422) have proper format
- Startup/shutdown events
```

### 4. `test_database.py` - Database Layer Unit Tests (P0)
**Why:** SQL dialect adaptation and connection management need direct testing beyond smoke tests.
```python
# Must test:
- adapt_sql() for all SQL statement types
- placeholders() for all dialects
- is_sqlite()/is_postgres() with various DATABASE_URL values
- validate_production_db() all env combinations
- Connection pool configuration
- Error handling for invalid DATABASE_URL
```

### 5. E2E: Authentication & Authorization Flow (P0)
**Why:** The E2E tests skip actual authentication. They seed localStorage with fake tokens. Need tests for:
```typescript
// Must test:
- Login page flow (enter credentials -> redirect to dashboard)
- Token expiration handling (auto-logout)
- Clinic isolation (clinic A user cannot see clinic B data)
- Role-based UI (technician sees different UI than clinician)
- Unauthenticated access redirect
```

---

## 8. Test Organization Assessment

### Strengths
- Tests are grouped by module (one test file per source module)
- Good use of pytest fixtures (tmp_path, monkeypatch)
- Consistent class-based grouping within files
- Page Object Model used for E2E (good maintainability)
- Auth setup fixtures are reusable
- Demo mode setup is separate from auth setup

### Weaknesses
- No shared fixtures file (conftest.py) - each test file defines its own
- No pytest.ini or pyproject.toml test configuration visible
- No test markers for slow/performance tests
- No parallel test execution configuration
- No test coverage reporting configuration
- E2E tests don't use shared page object methods consistently
- No test data factories or generators

---

## 9. Overall Test Readiness Score: 6.5 / 10

### Scoring Breakdown

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| Test Coverage (what's tested) | 6/10 | 30% | 1.8 |
| Test Quality (assertions, independence) | 6/10 | 25% | 1.5 |
| Test Organization | 7/10 | 15% | 1.05 |
| E2E Coverage | 5/10 | 15% | 0.75 |
| Critical Path Coverage | 5/10 | 15% | 0.75 |
| **Total** | | **100%** | **5.85** |

Rounded: **6.5 / 10**

### What Would Improve the Score
- Add the 5 missing critical test files (+1.5 points)
- Fix hardcoded `/tmp` paths (+0.5 points)
- Add authentication E2E tests (+0.5 points)
- Fix weak assertions (+0.5 points)
- Run PostgreSQL tests in CI (+0.5 points)

**Maximum achievable: ~9.5 / 10**

---

## 10. Action Items Summary

### Before Deployment (P0 + P1)
- [ ] Create `test_safety_governance.py` (min 15 tests)
- [ ] Create `test_knowledge_layer.py` (min 20 tests)
- [ ] Create `test_main.py` (min 15 tests)
- [ ] Create `test_database.py` (min 10 tests)
- [ ] Create E2E auth flow tests (min 5 tests)
- [ ] Fix hardcoded `/tmp` paths in 8 test files
- [ ] Verify `test_deeptwin_snapshot.py` is not truncated
- [ ] Add dedicated tests for `contracts.py`, `deeptwin_contracts.py`
- [ ] Fix weak `or` assertions in 4 tests
- [ ] Add rate limiting tests
- [ ] Add SQL injection prevention tests

### After Deployment (P2)
- [ ] Unify test framework (all pytest, no unittest)
- [ ] Fix `sys.path.insert` across all test files
- [ ] Replace `time.sleep` with mock time in tests
- [ ] Add performance benchmarking (not just assertions)
- [ ] Add test coverage reporting (pytest-cov)
- [ ] Add parallel test execution (pytest-xdist)
- [ ] Add accessibility tests to E2E
- [ ] Add cross-browser E2E testing
- [ ] Add offline/degraded mode E2E tests

---

*End of Audit Report*
