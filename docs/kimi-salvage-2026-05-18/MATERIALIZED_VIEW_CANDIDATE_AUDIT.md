# Materialized View Candidate Audit

**Date:** 2026-05-17  
**Auditor:** Automated Architecture Audit  
**Scope:** Expensive aggregate queries suitable for materialization

---

## 1. Expensive Summary Queries

| Query | Source Table(s) | Aggregate Ops | Read Freq | Staleness Tolerance |
|-------|----------------|---------------|-----------|-------------------|
| Clinic dashboard: patient counts | patient_access, multimodal_events | COUNT DISTINCT | High | 5-15 min |
| Clinic dashboard: modality counts | multimodal_events | COUNT per modality | High | 5-15 min |
| Clinic dashboard: recent events | multimodal_events | COUNT + date filter | High | 5-15 min |
| Clinic dashboard: quality flags | multimodal_events | COUNT GROUP BY | High | 5-15 min |
| Patient analyzer: modality counts | multimodal_events | COUNT per modality | Medium | 10-30 min |
| Patient analyzer: latest dates | multimodal_events | MAX timestamp | Medium | 10-30 min |
| Analyzer status: stale modalities | multimodal_events | MAX + date math | Medium | 10-30 min |
| Evidence coverage | evidence_db | DISTINCT + COUNT | Low | 1 hour |
| Audit activity | audit_log | COUNT + date filter | Low | 1 hour |

---

## 2. Materialized: YES (this PR)

### mv_clinic_activity_summary

**Rationale:** The clinic dashboard is the most frequently accessed page. It aggregates patient counts, modality counts, and recent activity across all patients in a clinic. This is a natural group-by on `clinic_id`.

**Fields:**
- `clinic_id` — grouped by
- `patient_count` — COUNT DISTINCT patient_id
- `active_patient_count` — ai_analysis_consent = 1
- `*_count_30d` — per-modality counts (session, report, assessment, qeeg, mri, biomarker)
- `latest_activity_at` — MAX event timestamp
- `refreshed_at` — view refresh timestamp

**Refresh strategy:** Manual or scheduled (every 15-30 min). Never on-request.

### mv_patient_analyzer_counts

**Rationale:** The per-patient analyzer summary is accessed when viewing individual patients. It counts events per modality per patient. This is a natural group-by on `clinic_id + patient_id`.

**Fields:**
- `clinic_id` + `patient_id` — grouped by
- `*_count` — per-modality counts (qeeg, mri, biomarker, voice, video, text, movement)
- `latest_analysis_at` — MAX event timestamp
- `refreshed_at` — view refresh timestamp

---

## 3. Materialized: NO (deferred or excluded)

| Query | Reason |
|-------|--------|
| Patient dashboard (full) | Patient-specific, changes frequently, small data |
| Evidence coverage | Small table (8 rows), not a performance concern |
| Audit activity | Append-only, time-series, better served by indexes |
| DeepTwin snapshot | AI-generated, requires fresh computation |
| Synthesis output | AI-generated, not cachable as materialized view |
| Consent decisions | Must be real-time, no staleness tolerance |
| Auth/session data | Security-sensitive, must be real-time |
| Export payloads | Too large, not aggregate queries |

---

## 4. Expected Performance Gain

| Endpoint | Live Query | MV Query | Improvement |
|----------|-----------|----------|-------------|
| Clinic dashboard | 15-50ms | 1-3ms | **5-50x** |
| Patient analyzer | 10-30ms | 1-3ms | **3-30x** |

---

## 5. Indexes on Materialized Views

| View | Index | Columns |
|------|-------|---------|
| mv_clinic_activity_summary | UNIQUE | clinic_id |
| mv_patient_analyzer_counts | UNIQUE | clinic_id, patient_id |
| mv_patient_analyzer_counts | INDEX | patient_id |
