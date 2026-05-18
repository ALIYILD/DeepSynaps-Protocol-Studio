# Clinic Onboarding Checklist — DeepSynaps Beta

**Date:** 2026-05-17  
**Audience:** Clinic administrators, DeepSynaps operations team  
**Goal:** Complete setup for a new clinic joining the beta program

---

## Phase 1: Clinic Setup

| # | Task | Owner | Status | Notes |
|---|------|-------|--------|-------|
| 1 | Sign beta agreement | Clinic Admin / DeepSynaps Ops | ☐ | Decision-support terms, data handling |
| 2 | Confirm clinic ID | DeepSynaps Ops | ☐ | e.g., `clinic-demo-001` |
| 3 | Set `DEEPSYNAPS_APP_ENV` | DeepSynaps Ops | ☐ | `staging` for beta, `production` for live |
| 4 | Set `DEEPSYNAPS_DEMO_MODE` | DeepSynaps Ops | ☐ | `false` for live beta |
| 5 | Set `DEEPSYNAPS_DEMO_CLINIC_SEED` | DeepSynaps Ops | ☐ | `false` — no synthetic data |
| 6 | Confirm database connection | DeepSynaps Ops | ☐ | PostgreSQL for beta |
| 7 | Run database migration | DeepSynaps Ops | ☐ | `alembic upgrade head` |
| 8 | Create materialized views | DeepSynaps Ops | ☐ | Auto-created on startup |
| 9 | Verify health endpoint | DeepSynaps Ops | ☐ | `GET /health` returns `ok` |
| 10 | Verify runtime config | DeepSynaps Ops | ☐ | `GET /api/v1/system/runtime-config` |

---

## Phase 2: Users and Roles

| # | Task | Owner | Status | Notes |
|---|------|-------|--------|-------|
| 1 | Designate clinic_admin | Clinic Admin | ☐ | Primary clinic administrator |
| 2 | Add clinicians | Clinic Admin | ☐ | Role: `clinician` |
| 3 | Add reviewers (optional) | Clinic Admin | ☐ | Role: `reviewer` |
| 4 | Add technicians (optional) | Clinic Admin | ☐ | Role: `technician` |
| 5 | Confirm super_admin contact | DeepSynaps Ops | ☐ | Platform-level admin |
| 6 | Verify role access | Clinic Admin | ☐ | Each user can log in and see correct UI |
| 7 | Test clinic isolation | DeepSynaps Ops | ☐ | Users cannot see other clinics' data |

### Role Matrix

| Role | Dashboard | Patients | Assessments | Analyzers | Reports | Admin |
|------|-----------|----------|-------------|-----------|---------|-------|
| super_admin | All clinics | All clinics | — | — | — | Full |
| clinic_admin | Own clinic | Own clinic | — | — | — | Clinic |
| clinician | Own clinic | Own clinic | Full | Full | Full | — |
| reviewer | Own clinic | Read | Read | Read | Review | — |
| technician | — | — | — | Upload only | — | — |

---

## Phase 3: Consent Setup

| # | Task | Owner | Status | Notes |
|---|------|-------|--------|-------|
| 1 | Confirm consent policy | Clinic Admin | ☐ | Align with clinic's IRB/ethics |
| 2 | Upload consent forms | Clinic Admin | ☐ | Via patient_access table |
| 3 | Configure `ai_analysis_consent` | Clinic Admin | ☐ | Per-patient flag |
| 4 | Test consent check | Clinician | ☐ | Verify synthesis requires consent |
| 5 | Document opt-out process | Clinic Admin | ☐ | How patients withdraw consent |
| 6 | Verify consent in audit | Clinic Admin | ☐ | All consent changes logged |

---

## Phase 4: Demo vs Live Confirmation

| # | Task | Owner | Status | Notes |
|---|------|-------|--------|-------|
| 1 | Confirm `VITE_ENABLE_DEMO=0` in frontend build | DeepSynaps Ops | ☐ | No demo banner in production |
| 2 | Verify no demo banner appears | Clinic Admin | ☐ | Load app, check top bar |
| 3 | Verify `demo_mode_enabled: false` in runtime config | DeepSynaps Ops | ☐ | `GET /api/v1/system/runtime-config` |
| 4 | Confirm production guard passed | DeepSynaps Ops | ☐ | Startup logs show no warnings |

---

## Phase 5: Patient Import

| # | Task | Owner | Status | Notes |
|---|------|-------|--------|-------|
| 1 | Prepare patient CSV | Clinic Admin | ☐ | patient_id, clinic_id, access_level |
| 2 | Import via patient_access table | DeepSynaps Ops | ☐ | Direct DB import or API |
| 3 | Verify patient list loads | Clinician | ☐ | Patient Hub shows all patients |
| 4 | Test patient isolation | Clinician | ☐ | Can only see own clinic's patients |
| 5 | Start with 2-3 pilot patients | Clinic Admin | ☐ | Small cohort for initial validation |

---

## Phase 6: Device and Integration Setup

| # | Task | Owner | Status | Notes |
|---|------|-------|--------|-------|
| 1 | Confirm qEEG device compatibility | Technician | ☐ | Export format for upload |
| 2 | Confirm MRI DICOM pipeline | Technician | ☐ | DICOM → analysis workflow |
| 3 | Confirm biomarker lab integration | Technician | ☐ | Lab results import format |
| 4 | Test file upload | Technician | ☐ | Small test file per modality |
| 5 | Verify evidence DB seeded | DeepSynaps Ops | ☐ | 8 evidence entries present |

---

## Phase 7: Evidence DB Status

| # | Task | Owner | Status | Notes |
|---|------|-------|--------|-------|
| 1 | Verify evidence entries | DeepSynaps Ops | ☐ | `SELECT COUNT(*) FROM evidence_db` |
| 2 | Check evidence coverage | Clinic Admin | ☐ | `/api/v1/summary/clinic-dashboard` shows % |
| 3 | Plan evidence expansion | DeepSynaps Ops | ☐ | Add clinic-specific evidence if needed |

---

## Phase 8: Report Templates

| # | Task | Owner | Status | Notes |
|---|------|-------|--------|-------|
| 1 | Confirm report templates | Clinic Admin | ☐ | Check existing templates |
| 2 | Customize clinic header/footer | Clinic Admin | ☐ | Logo, address, contact |
| 3 | Test report generation | Clinician | ☐ | Generate test report for demo patient |
| 4 | Test export formats | Clinician | ☐ | JSON, PDF, CSV |
| 5 | Verify report signing workflow | Reviewer | ☐ | Review → Accept/Reject/Note |

---

## Phase 9: Audit and Export Training

| # | Task | Owner | Status | Notes |
|---|------|-------|--------|-------|
| 1 | Show audit log location | Clinic Admin | ☐ | Where to find audit entries |
| 2 | Demonstrate export process | Clinician | ☐ | Patient data export |
| 3 | Explain retention policy | Clinic Admin | ☐ | Data retention per clinic policy |
| 4 | Confirm audit is logging | DeepSynaps Ops | ☐ | Events appear in audit_log table |

---

## Phase 10: Go-Live Sign-Off

| # | Task | Owner | Status | Notes |
|---|------|-------|--------|-------|
| 1 | All checklist items complete | Clinic Admin + DeepSynaps Ops | ☐ | Review all phases above |
| 2 | Clinician training scheduled | Clinic Admin | ☐ | See `CLINICIAN_TRAINING_GUIDE.md` |
| 3 | Support contacts distributed | DeepSynaps Ops | ☐ | See `BETA_LAUNCH_PACK.md` |
| 4 | Pilot metrics baseline set | DeepSynaps Ops | ☐ | See `PILOT_SUCCESS_METRICS.md` |
| 5 | Go-live date confirmed | Both | ☐ | — |
| 6 | Weekly check-in scheduled | Both | ☐ | First 4 weeks of pilot |
