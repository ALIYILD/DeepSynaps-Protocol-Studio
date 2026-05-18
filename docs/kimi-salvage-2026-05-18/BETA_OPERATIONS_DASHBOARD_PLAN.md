# Beta Operations Dashboard Plan — DeepSynaps Protocol Studio

**Date:** 2026-05-17  
**Audience:** DeepSynaps operations team, platform admins  
**Scope:** Real-time and daily operational monitoring for clinic beta

---

## 1. Dashboard Overview

A single-page operations dashboard tracking all active beta pilots.

### Access
- URL: `https://ops.deepsynaps.io/beta-dashboard` (proposed)
- Auth: `super_admin` role only
- Data sources: API endpoints, DB queries, log aggregation

---

## 2. Dashboard Sections

### Section A: Active Pilots

| Metric | Source | Refresh |
|--------|--------|---------|
| Active clinic count | `SELECT COUNT(DISTINCT clinic_id) FROM patient_access` | 15 min |
| Active clinician count | `SELECT COUNT(DISTINCT clinician_id) FROM audit_log WHERE timestamp >= now() - interval '7 days'` | 15 min |
| Total patient records | `SELECT COUNT(*) FROM patient_access` | 15 min |
| Patients with AI consent | `SELECT COUNT(*) FROM patient_access WHERE ai_analysis_consent = 1` | 15 min |
| Pilot phase | Manual (onboarding status) | Daily |

### Section B: Module Usage (24h)

| Module | Query | Threshold |
|--------|-------|-----------|
| Dashboard loads | `audit_log WHERE route LIKE '%dashboard%'` | >0 |
| Assessments created | `multimodal_events WHERE modality = 'assessment' AND timestamp >= now() - interval '1 day'` | >0 |
| qEEG analyses | `multimodal_events WHERE modality = 'qeeg' AND timestamp >= now() - interval '1 day'` | >0 |
| MRI analyses | `multimodal_events WHERE modality = 'mri' AND timestamp >= now() - interval '1 day'` | >0 |
| Biomarker entries | `multimodal_events WHERE modality = 'biomarker' AND timestamp >= now() - interval '1 day'` | >0 |
| DeepTwin syntheses | `deeptwin_reviews WHERE action IN ('accept','reject','note') AND reviewed_at >= now() - interval '1 day'` | >0 |
| Reports generated | `multimodal_events WHERE modality = 'report' AND timestamp >= now() - interval '1 day'` | >0 |
| Protocol drafts | `audit_log WHERE route LIKE '%protocol%'` | >0 |
| Evidence searches | `audit_log WHERE route LIKE '%evidence%'` | >0 |
| Patient portal logins | `audit_log WHERE route LIKE '%patient%portal%' AND actor_role = 'patient'` | >0 |
| Exports | `audit_log WHERE route LIKE '%export%'` | >0 |

### Section C: Support Tickets

| Metric | Source | Alert |
|--------|--------|-------|
| Open tickets | Ticketing system API | >5 = yellow, >10 = red |
| Tickets by category | Tag analysis | — |
| Avg response time | Ticket timestamps | >4h = yellow, >24h = red |
| Avg resolution time | Ticket timestamps | >2 days = yellow, >5 days = red |
| Tickets by clinic | Clinic attribution | — |
| Escalated tickets | L2/L3/L4 flag | Any = yellow |

### Section D: Safety Flags

| Flag | Query | Severity |
|------|-------|----------|
| Demo mode active | `runtime_config.demo_mode_enabled = true` | High if production |
| Demo seed enabled | `runtime_config.demo_seed_enabled = true` | High if production |
| Missing safety disclaimer | E2E test failure on disclaimer check | Critical |
| AI overclaiming reported | Safety ticket tagged "ai_overclaiming" | Critical |
| Cross-clinic access anomaly | `audit_log` cross-clinic pattern detection | Critical |
| Consent violations | `patient_access` where consent required but not given | High |
| Export anomalies | Unusual export frequency or volume | Medium |
| Evidence grade concerns | Safety ticket tagged "evidence_quality" | Medium |

### Section E: Performance Alerts

| Metric | Query | Threshold |
|--------|-------|-----------|
| Dashboard load time | API timing | >2s = yellow, >5s = red |
| DeepTwin synthesis time | API timing | >10s = yellow, >30s = red |
| Summary endpoint time | API timing | >1s = yellow, >3s = red |
| Cache hit rate | Redis/Mock metrics | <50% = yellow |
| DB connection pool | `pg_stat_activity` | >80% = yellow, >95% = red |
| Materialized view staleness | `refreshed_at` vs now | >1h = yellow, >4h = red |
| Error rate | Log analysis | >1% = yellow, >5% = red |

### Section F: Audit/Export Events

| Metric | Query | Note |
|--------|-------|------|
| Total audit events (24h) | `SELECT COUNT(*) FROM audit_log WHERE timestamp >= now() - interval '1 day'` | Baseline |
| Export events (24h) | `SELECT COUNT(*) FROM audit_log WHERE route LIKE '%export%'` | Monitor for bulk |
| Consent changes (24h) | `SELECT COUNT(*) FROM audit_log WHERE route LIKE '%consent%'` | Unusual spikes |
| Role changes (24h) | `SELECT COUNT(*) FROM audit_log WHERE route LIKE '%role%'` | Security |
| Report sign events (24h) | `deeptwin_reviews WHERE action IN ('accept','reject') AND reviewed_at >= now() - interval '1 day'` | Activity |

### Section G: Demo/Live Mode Status

| Clinic | Mode | Banner Visible | Demo Seed | Status |
|--------|------|----------------|-----------|--------|
| [clinic-001] | Live | No | No | OK |
| [clinic-002] | Demo | Yes | No | OK (training) |
| [clinic-003] | Live | — | — | Check: runtime-config |

---

## 3. Alert Rules

| Alert | Trigger | Channel | Owner |
|-------|---------|---------|-------|
| CRITICAL: Safety incident | Safety ticket created | PagerDuty + email | L3 Safety |
| CRITICAL: Demo in production | `demo_mode_enabled=true` AND `app_env=production` | PagerDuty + email | L4 Lead |
| CRITICAL: System down | Health check fails | PagerDuty + email | L4 Lead |
| HIGH: Data anomaly | Cross-clinic access detected | Email + Slack | L2 Technical |
| HIGH: Performance degraded | Dashboard >5s or errors >5% | Email + Slack | L2 Technical |
| MEDIUM: MV stale | `refreshed_at > 4 hours ago` | Email | L2 Technical |
| MEDIUM: Support backlog | >10 open tickets | Email | L1 Help Desk |
| LOW: Evidence coverage low | Coverage <40% for active clinic | Weekly report | L2 Technical |

---

## 4. Dashboard Implementation Notes

### v1 (Manual)
- Run SQL queries manually or via script
- Post to Slack/Teams channel
- Update shared spreadsheet

### v2 (Semi-automated)
- Scheduled script runs queries
- Posts to Slack webhook
- Generates HTML report

### v3 (Automated)
- Dedicated ops dashboard app
- Real-time API endpoints
- Grafana/Prometheus integration
- PagerDuty for critical alerts

**Current recommendation:** Start with v1 (manual), move to v2 by week 3 of pilot.
