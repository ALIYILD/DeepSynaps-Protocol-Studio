<!-- Edited 2026-05-18 from kimi-salvage; original audit verdict EDIT. -->
# Materialized View Candidate Audit

**Date:** 2026-05-17 (revised 2026-05-18)
**Auditor:** Automated Architecture Audit
**Scope:** Expensive aggregate queries suitable for materialization
**Status:** Methodology preserved; no materialized views are currently deployed. Table/column names below are candidates — verify against current ORM models in `apps/api/app/persistence/models/` before implementing.

---

## 1. Expensive Summary Query Candidates

<!-- TODO: verify against current main — confirm table names and column names match ORM models in apps/api/app/persistence/models/ -->

| Query | Likely Source Model(s) | Aggregate Ops | Read Freq | Staleness Tolerance |
|-------|------------------------|---------------|-----------|---------------------|
| Clinic dashboard: patient counts | patient, clinical models | COUNT DISTINCT | High | 5–15 min |
| Clinic dashboard: modality counts | qeeg, mri, labs, media models | COUNT per modality | High | 5–15 min |
| Clinic dashboard: recent events | audit or event models | COUNT + date filter | High | 5–15 min |
| Clinic dashboard: quality flags | qeeg or assessment models | COUNT GROUP BY | High | 5–15 min |
| Patient analyzer: modality counts | qeeg, mri, labs models | COUNT per modality | Medium | 10–30 min |
| Patient analyzer: latest dates | qeeg, mri, labs models | MAX timestamp | Medium | 10–30 min |
| Analyzer status: stale modalities | qeeg, mri, labs models | MAX + date math | Medium | 10–30 min |
| Evidence coverage | knowledge_cache model | DISTINCT + COUNT | Low | 1 hour |
| Audit activity | audit model | COUNT + date filter | Low | 1 hour |

---

## 2. Materialized: YES (when implemented)

### mv_clinic_activity_summary

**Rationale:** The clinic dashboard is the most frequently accessed page. It aggregates patient counts, modality counts, and recent activity across all patients in a clinic — a natural group-by on `clinic_id`.

**Proposed fields:**
- `clinic_id` — grouped by
- `patient_count` — COUNT DISTINCT patient_id
- `active_patient_count` — patients with AI analysis consent
- `*_count_30d` — per-modality counts (session, report, assessment, qeeg, mri, biomarker)
- `latest_activity_at` — MAX event timestamp
- `refreshed_at` — view refresh timestamp

**Refresh strategy:** Manual or scheduled (every 15–30 min). Never on-request.

<!-- TODO: verify against current main — confirm clinic_id and patient_id column names in actual ORM models -->

### mv_patient_analyzer_counts

**Rationale:** Per-patient analyzer summary, accessed when viewing individual patients. Counts events per modality per patient — natural group-by on `clinic_id + patient_id`.

**Proposed fields:**
- `clinic_id` + `patient_id` — grouped by
- `*_count` — per-modality counts (qeeg, mri, biomarker, voice, video, text, movement)
- `latest_analysis_at` — MAX event timestamp
- `refreshed_at` — view refresh timestamp

<!-- TODO: verify against current main — confirm modality column names match current qeeg/mri/labs/media models -->

---

## 3. Materialized: NO (deferred or excluded)

| Query | Reason |
|-------|--------|
| Patient dashboard (full) | Patient-specific, changes frequently, small data |
| Evidence coverage | Small table, not a performance concern |
| Audit activity | Append-only, time-series, better served by indexes |
| AI synthesis output | AI-generated, not cacheable as materialized view |
| Consent decisions | Must be real-time, no staleness tolerance |
| Auth/session data | Security-sensitive, must be real-time |
| Export payloads | Too large, not aggregate queries |

---

## 4. Expected Performance Gain (estimated)

| Endpoint | Live Query | MV Query | Improvement |
|----------|-----------|----------|-------------|
| Clinic dashboard | 15–50 ms | 1–3 ms | **5–50x** |
| Patient analyzer | 10–30 ms | 1–3 ms | **3–30x** |

These are estimates based on typical PostgreSQL aggregate query patterns. Measure against actual query plans before committing to an implementation.

---

## 5. Indexes on Materialized Views

| View | Index Type | Columns |
|------|------------|---------|
| mv_clinic_activity_summary | UNIQUE | clinic_id |
| mv_patient_analyzer_counts | UNIQUE | clinic_id, patient_id |
| mv_patient_analyzer_counts | INDEX | patient_id |

Note: 55+ index declarations already exist in `apps/api/app/persistence/models/`. Review those before adding redundant indexes.
