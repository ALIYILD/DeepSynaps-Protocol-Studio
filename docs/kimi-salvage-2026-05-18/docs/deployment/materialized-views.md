# Materialized Views — Deployment Guide

**Version:** 1.0  
**Date:** 2026-05-17  
**Applies to:** PostgreSQL production deployments

---

## Overview

Materialized views provide read-optimized aggregates for expensive dashboard queries. They are refreshed manually or by scheduled job — never synchronously on request.

## Views

### mv_clinic_activity_summary

Clinic-level aggregate dashboard data.

| Field | Type | Description |
|-------|------|-------------|
| clinic_id | TEXT | Clinic identifier |
| patient_count | INT | Total patients in clinic |
| active_patient_count | INT | Patients with ai_analysis_consent=1 |
| session_count_30d | INT | Sessions in last 30 days |
| report_count_30d | INT | Reports in last 30 days |
| assessment_count_30d | INT | Assessments in last 30 days |
| qeeg_count_30d | INT | qEEG events in last 30 days |
| mri_count_30d | INT | MRI events in last 30 days |
| biomarker_count_30d | INT | Biomarker events in last 30 days |
| latest_activity_at | TIMESTAMP | Most recent event timestamp |
| refreshed_at | TIMESTAMP | View refresh timestamp |

### mv_patient_analyzer_counts

Per-patient modality event counts.

| Field | Type | Description |
|-------|------|-------------|
| clinic_id | TEXT | Clinic identifier |
| patient_id | TEXT | Patient identifier |
| qeeg_count | INT | Total qEEG events |
| mri_count | INT | Total MRI events |
| biomarker_count | INT | Total biomarker events |
| voice_count | INT | Total voice events |
| video_count | INT | Total video events |
| text_count | INT | Total text events |
| movement_count | INT | Total wearable/movement events |
| latest_analysis_at | TIMESTAMP | Most recent event timestamp |
| refreshed_at | TIMESTAMP | View refresh timestamp |

---

## Setup

### 1. Automatic (Recommended)

Materialized views are created automatically on application startup when:
- Database dialect is PostgreSQL
- Views do not yet exist

```
[startup] INFO: Materialized view ready: mv_clinic_activity_summary
[startup] INFO: Materialized view ready: mv_patient_analyzer_counts
```

### 2. Manual

```bash
# Requires PostgreSQL connection
export DATABASE_URL=postgresql://user:pass@host/db
export DEEPSYNAPS_APP_ENV=production

# Create views
python -c "from materialized_views import MaterializedViews; MaterializedViews.create_views()"

# Verify
psql $DATABASE_URL -c "SELECT matviewname FROM pg_matviews WHERE schemaname = 'public';"
```

### 3. Indexes

Created automatically with the views:

```sql
-- Clinic lookup (unique)
CREATE UNIQUE INDEX idx_mv_clinic_clinic_id ON mv_clinic_activity_summary (clinic_id);

-- Patient lookup (unique composite)
CREATE UNIQUE INDEX idx_mv_patient_clinic_patient ON mv_patient_analyzer_counts (clinic_id, patient_id);

-- Patient-only lookup
CREATE INDEX idx_mv_patient_patient_id ON mv_patient_analyzer_counts (patient_id);
```

---

## Refresh

### Manual Refresh (Admin API)

```bash
# Refresh all views
curl -X POST "http://api:8000/api/v1/system/materialized-views/refresh" \
  -H "X-Clinic-ID: your-clinic" \
  -H "X-Patient-Access-Token: your-token" \
  -d "clinician_id=admin-001"
```

**Requires:** `clinic_admin` or `super_admin` role.

### Programmatic Refresh

```python
from materialized_views import MaterializedViews

mv = MaterializedViews()

# Refresh single view
mv.refresh_clinic_activity_summary()      # True/False
mv.refresh_patient_analyzer_counts()      # True/False

# Refresh all
results = mv.refresh_all()
# {"clinic_activity_summary": True, "patient_analyzer_counts": True}
```

### Scheduled Refresh (Cron/Systemd)

Recommended: refresh every 15-30 minutes via cron:

```cron
# Refresh every 15 minutes
*/15 * * * * cd /app && python -c "from materialized_views import MaterializedViews; MaterializedViews().refresh_all()" >> /var/log/deepsynaps-mv-refresh.log 2>&1
```

### CONCURRENTLY Refresh (Production)

For zero-downtime refresh, add a unique index first:

```sql
-- Already created by the migration (idx_mv_clinic_clinic_id)
-- Then use CONCURRENTLY:
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_clinic_activity_summary;
```

The application code uses `REFRESH MATERIALIZED VIEW` (not CONCURRENTLY) by default. To enable CONCURRENTLY, modify the refresh SQL or use a custom refresh job.

---

## SQLite Fallback

Materialized views are **PostgreSQL-only**. On SQLite:

- Views are not created
- Summary endpoints use live aggregate queries
- No performance degradation (SQLite is fast enough for dev/test)
- No code changes needed

```python
mv = MaterializedViews()
mv.is_available()     # False on SQLite
mv.get_summary_source()  # "fallback" on SQLite
```

---

## Monitoring

### Status Endpoint

```bash
curl "http://api:8000/api/v1/system/materialized-views/status" \
  -H "X-Clinic-ID: your-clinic" \
  -H "X-Patient-Access-Token: your-token" \
  -d "clinician_id=admin-001"
```

Response:
```json
{
  "dialect": "postgresql",
  "available": true,
  "views": [
    {
      "name": "mv_clinic_activity_summary",
      "has_indexes": true,
      "last_refresh": "2026-05-17T10:30:00"
    }
  ],
  "last_refresh": "2026-05-17T10:30:00",
  "error": null,
  "generated_by": "admin-001",
  "generated_at": "2026-05-17T11:00:00"
}
```

**Requires:** `clinic_admin` or `super_admin` role.

---

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| `available: false` on PostgreSQL | Views not created | Restart app or run `MaterializedViews.create_views()` |
| Slow refresh | Large data volume | Use `REFRESH CONCURRENTLY` or refresh during off-peak |
| Stale data | Refresh not running | Check cron job or trigger manual refresh |
| Indexes missing | Partial creation | Run `MaterializedViews.create_views()` again |
| `dialect: sqlite` | Wrong DATABASE_URL | Verify `DATABASE_URL` starts with `postgresql://` |

---

## Production Cautions

1. **Refresh during off-peak** — Materialized view refresh locks the view. Schedule during low-traffic periods.
2. **Storage** — Materialized views consume disk space proportional to clinic/patient count. Monitor `pg_size_pretty(pg_total_relation_size('mv_clinic_activity_summary'))`.
3. **First refresh after bulk import** — After large data imports, refresh immediately to avoid stale summaries.
4. **Do not refresh on every request** — This defeats the purpose. Use scheduled refresh only.
5. **CONCURRENTLY for scale** — Above ~1000 clinics, use `REFRESH CONCURRENTLY` to avoid read blocking.

---

## Future: Background Scheduler

For automatic refresh without cron:

```python
# Using APScheduler (not included in this PR)
from apscheduler.schedulers.background import BackgroundScheduler

scheduler = BackgroundScheduler()
scheduler.add_job(
    lambda: MaterializedViews().refresh_all(),
    'interval',
    minutes=15,
    id='mv-refresh',
    replace_existing=True,
)
scheduler.start()
```

This is a follow-up enhancement. The current implementation requires manual or external scheduled refresh.
