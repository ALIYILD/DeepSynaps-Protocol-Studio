# DB Index Hotspot Audit — DeepSynaps Protocol Studio

**Date:** 2026-05-16
**Scope:** All 6 tables across SQLite (dev/test) and PostgreSQL (production)
**Method:** Static analysis of all SQL execute() calls + endpoint access patterns

---

## Executive Summary

| Table | Queries/sec (est.) | Index Coverage | Risk |
|-------|-------------------|----------------|------|
| multimodal_events | ~200 (highest) | No indexes → **FULL TABLE SCAN** | **HIGH** |
| audit_log | ~50 | No indexes → **FULL TABLE SCAN** | **HIGH** |
| patient_access | ~100 | PRIMARY KEY only | **MEDIUM** |
| evidence_db | ~10 | No indexes → full scan (small table) | LOW |
| deeptwin_reviews | ~5 | No indexes → **FULL TABLE SCAN** | **MEDIUM** |
| deeptwin_tasks | ~3 | No indexes → **FULL TABLE SCAN** | **MEDIUM** |

**Critical finding:** `multimodal_events` and `audit_log` — the two highest-traffic tables — have zero indexes beyond primary keys. Every patient query performs a full table scan.

---

## Table-by-Table Analysis

### 1. multimodal_events (CRITICAL)

**Query patterns (from code audit):**

| # | Query Pattern | Frequency | Current Plan |
|---|--------------|-----------|-------------|
| Q1 | `SELECT * FROM multimodal_events WHERE patient_id = ? ORDER BY timestamp ASC` | Very High | **FULL TABLE SCAN** + filesort |
| Q2 | `SELECT * WHERE patient_id = ? AND modality IN (?, ?, ?) ORDER BY timestamp` | High | **FULL TABLE SCAN** + filesort |
| Q3 | `SELECT * WHERE patient_id = ? AND timestamp >= ? AND timestamp <= ? ORDER BY timestamp` | High | **FULL TABLE SCAN** + filesort |
| Q4 | `SELECT * WHERE patient_id = ? AND modality = ? ORDER BY timestamp` | Medium | **FULL TABLE SCAN** + filesort |
| Q5 | `INSERT/REPLACE INTO multimodal_events` (event ingestion) | High | PK lookup for conflict |

**Engines that trigger these queries:**
- MultimodalTimelineEngine.build_timeline() → Q1, Q2, Q3
- CorrelationEngine.find_correlations() → Q1
- ConfoundEngine.detect_confounders() → Q1
- EvidenceLinkingEngine.attach_evidence() → Q1
- HypothesisRankingEngine.rank_hypotheses() → Q1
- MissingDataEngine.detect_gaps() → Q1
- DeepTwinSnapshotEngine.generate_snapshot() → Q1 (via all 6 engines above)

**Impact:** Every DeepTwin snapshot generation triggers 6+ full table scans on multimodal_events.

---

### 2. audit_log (HIGH)

**Query patterns:**

| # | Query Pattern | Frequency | Current Plan |
|---|--------------|-----------|-------------|
| Q6 | `SELECT * FROM audit_log WHERE clinic_id = ? ORDER BY timestamp DESC` | Medium | **FULL TABLE SCAN** |
| Q7 | `SELECT * WHERE patient_id = ? ORDER BY timestamp DESC` | Medium | **FULL TABLE SCAN** |
| Q8 | `SELECT * WHERE clinician_id = ? ORDER BY timestamp DESC` | Low | **FULL TABLE SCAN** |
| Q9 | `INSERT INTO audit_log (endpoint, clinician_id, clinic_id, ...)` | High | PK auto-increment |

**Triggered by:** All 12 API endpoints (every request logs to audit_log)

---

### 3. patient_access (MEDIUM)

**Query patterns:**

| # | Query Pattern | Frequency | Current Plan |
|---|--------------|-----------|-------------|
| Q10 | `SELECT * WHERE patient_id = ? AND clinic_id = ? AND clinician_id = ?` | Very High | PRIMARY KEY (good) |

**Status:** Has PRIMARY KEY on (patient_id, clinic_id, clinician_id) — acceptable but clinic-scoped lookups could benefit from a secondary index.

---

### 4. evidence_db (LOW)

**Query patterns:**

| # | Query Pattern | Frequency | Current Plan |
|---|--------------|-----------|-------------|
| Q11 | `SELECT * WHERE modality_scope LIKE ?` | Medium | **FULL TABLE SCAN** (small table: ~8 rows) |
| Q12 | `SELECT * WHERE evidence_grade = ?` | Low | **FULL TABLE SCAN** (small table) |
| Q13 | `SELECT * FROM evidence_db` (full table) | Low | **FULL TABLE SCAN** (acceptable) |

**Status:** Small static table (~8 seeded citations). Full scan acceptable but index is cheap.

---

### 5. deeptwin_reviews (MEDIUM)

**Query patterns:**

| # | Query Pattern | Frequency | Current Plan |
|---|--------------|-----------|-------------|
| Q14 | `SELECT * WHERE patient_id = ?` | Medium | **FULL TABLE SCAN** |
| Q15 | `SELECT * WHERE snapshot_id = ?` | Medium | **FULL TABLE SCAN** |

---

### 6. deeptwin_tasks (MEDIUM)

**Query patterns:**

| # | Query Pattern | Frequency | Current Plan |
|---|--------------|-----------|-------------|
| Q16 | `SELECT * WHERE patient_id = ?` | Low | **FULL TABLE SCAN** |
| Q17 | `SELECT * WHERE clinician_id = ?` | Low | **FULL TABLE SCAN** |

---

## Query Frequency Map

```
multimodal_events WHERE patient_id = ?  →  ~200×/session (every engine)
audit_log INSERT                           →  ~50×/session (every API call)
patient_access SELECT (PK lookup)          →  ~100×/session (every access check)
everything else                            →  <20×/session
```

---

## Proposed Index Set

| # | Table | Index Columns | Type | Covers Queries | Priority |
|---|-------|--------------|------|----------------|----------|
| 1 | multimodal_events | `(patient_id, timestamp)` | Composite | Q1, Q5 | **CRITICAL** |
| 2 | multimodal_events | `(patient_id, modality, timestamp)` | Composite | Q2, Q4 | **CRITICAL** |
| 3 | audit_log | `(clinic_id, timestamp DESC)` | Composite | Q6 | **HIGH** |
| 4 | audit_log | `(patient_id, timestamp DESC)` | Composite | Q7 | **HIGH** |
| 5 | audit_log | `(clinician_id, timestamp DESC)` | Composite | Q8 | MEDIUM |
| 6 | evidence_db | `(modality_scope)` | Single | Q11 | LOW |
| 7 | deeptwin_reviews | `(patient_id)` | Single | Q14 | MEDIUM |
| 8 | deeptwin_reviews | `(snapshot_id)` | Single | Q15 | MEDIUM |
| 9 | patient_access | `(clinic_id, clinician_id)` | Composite | Clinic admin lookups | MEDIUM |

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Index bloat on write-heavy tables | Indexes 1-2 are on read-heavy patient queries; write penalty minimal |
| SQLite index limitations | All indexes are SQLite-compatible (no partial/index-only) |
| PostgreSQL migration impact | Indexes created in init_all_tables(), auto-applied on new deployments |
| Existing data migration | `CREATE INDEX IF NOT EXISTS` — safe to re-run, no-op if exists |
| Query plan regression | All indexes cover exact query patterns from code audit |
