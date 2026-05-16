# DB Index Design — DeepSynaps Protocol Studio

## Overview

9 composite/single-column indexes added across 6 tables. All indexes are:
- **SQLite-compatible** — work in dev/test environments
- **PostgreSQL-compatible** — production-ready via dialect adapter
- **Created automatically** via `init_all_tables()` on application startup
- **Safe to re-run** — `CREATE INDEX IF NOT EXISTS` (no-op if already present)
- **Zero product behavior change** — only query performance improves

---

## Index Inventory

| # | Table | Index Name | Columns | Type | Priority | Covers |
|---|-------|-----------|---------|------|----------|--------|
| 1 | multimodal_events | idx_me_patient_timestamp | `(patient_id, timestamp)` | Composite | **CRITICAL** | All patient timeline queries |
| 2 | multimodal_events | idx_me_patient_modality_timestamp | `(patient_id, modality, timestamp)` | Composite | **CRITICAL** | Filtered patient queries |
| 3 | audit_log | idx_al_clinic_timestamp | `(clinic_id, timestamp DESC)` | Composite | **HIGH** | Clinic-scoped audit |
| 4 | audit_log | idx_al_patient_timestamp | `(patient_id, timestamp DESC)` | Composite | **HIGH** | Patient audit trail |
| 5 | audit_log | idx_al_clinician_timestamp | `(clinician_id, timestamp DESC)` | Composite | MEDIUM | Clinician activity |
| 6 | evidence_db | idx_edb_modality | `(modality_scope)` | Single | LOW | Evidence lookups |
| 7 | deeptwin_reviews | idx_dtr_patient | `(patient_id)` | Single | MEDIUM | Review history |
| 8 | deeptwin_reviews | idx_dtr_snapshot | `(snapshot_id)` | Single | MEDIUM | Snapshot reviews |
| 9 | patient_access | idx_pa_clinic_clinician | `(clinic_id, clinician_id)` | Composite | MEDIUM | Clinic admin lookups |

---

## Query Coverage Matrix

| Query Pattern | Engines | Index Used |
|--------------|---------|-----------|
| `WHERE patient_id = ? ORDER BY timestamp` | Timeline, Correlation, Confound, Hypothesis, Missing Data, DeepTwin | #1 |
| `WHERE patient_id = ? AND modality IN (?)` | Timeline (filtered) | #2 |
| `WHERE patient_id = ? AND timestamp BETWEEN ? AND ?` | Timeline (date range) | #1 (partial) |
| `INSERT INTO audit_log` | All 12 API endpoints | PK |
| `WHERE clinic_id = ? ORDER BY timestamp DESC` | Audit queries | #3 |
| `WHERE patient_id = ? ORDER BY timestamp DESC` | Audit queries | #4 |
| `WHERE modality_scope LIKE ?` | Evidence lookup | #6 |
| `WHERE patient_id = ?` (reviews) | Review engine | #7 |
| `WHERE snapshot_id = ?` (reviews) | Review engine | #8 |
| `WHERE patient_id = ? AND clinic_id = ? AND clinician_id = ?` | Access control | PK |
| `WHERE clinic_id = ? AND clinician_id = ?` | Clinic admin | #9 |

---

## Implementation

Indexes are defined in `apps/api/src/deepsynaps/database.py` as `_INDEX_STATEMENTS` dict and created automatically by `init_all_tables()` alongside table creation.

```python
# database.py — index creation (dialect-agnostic)
_INDEX_STATEMENTS = {
    "idx_me_patient_timestamp": """
        CREATE INDEX IF NOT EXISTS idx_me_patient_timestamp
        ON multimodal_events (patient_id, timestamp)
    """,
    # ... 8 more indexes
}

def init_all_tables(conn):
    # Tables first, then indexes
    for sql in _CREATE_STATEMENTS.values():
        conn.execute(adapt_sql(sql, conn.dialect))
    for sql in _INDEX_STATEMENTS.values():
        conn.execute(adapt_sql(sql, conn.dialect))
```

---

## Performance Validation

All 6 query-plan tests pass with `USING INDEX` confirmed via `EXPLAIN QUERY PLAN`:
- Patient + timestamp: **USING INDEX idx_me_patient_timestamp**
- Patient + modality: **USING INDEX idx_me_patient_modality_timestamp**
- Patient + date range: **USING INDEX idx_me_patient_timestamp**
- Clinic audit: **USING INDEX idx_al_clinic_timestamp**
- Patient audit: **USING INDEX idx_al_patient_timestamp**

All 3 performance tests pass (<50ms with 500 rows):
- Patient query: <50ms
- Filtered patient query: <50ms
- Date range query: <50ms

---

## Risk Assessment

| Risk | Status |
|------|--------|
| Write penalty | Negligible — indexes on read-heavy query patterns |
| Storage overhead | ~9 indexes × small tables ≈ <1MB |
| Migration impact | Zero — `IF NOT EXISTS` is safe to re-run |
| SQLite compatibility | All indexes use standard SQL (no partial/GIN) |
| PostgreSQL compatibility | Verified via SQL adaptation tests |
| Product behavior change | None — indexes are transparent |
