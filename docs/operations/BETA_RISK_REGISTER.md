<!-- Verified 2026-05-18; promote-ready. -->
# Beta Risk Register — DeepSynaps Protocol Studio

**Date:** 2026-05-17  
**Audience:** DeepSynaps operations, clinic administrators, safety team  
**Status:** Active — reviewed weekly during pilot

---

## Risk Classification

| Score | Severity |
|-------|----------|
| 1 | Negligible |
| 2 | Low |
| 3 | Medium |
| 4 | High |
| 5 | Critical |

| Score | Likelihood |
|-------|-----------|
| 1 | Rare |
| 2 | Unlikely |
| 3 | Possible |
| 4 | Likely |
| 5 | Almost certain |

**Risk Score = Severity x Likelihood**

| Score | Priority |
|-------|----------|
| 1-4 | Low — monitor |
| 5-9 | Medium — plan mitigation |
| 10-16 | High — active mitigation |
| 17-25 | Critical — immediate action |

---

## Clinical Safety Risks

### R1: AI Output Overclaiming (DIAGNOSIS)

| Field | Value |
|-------|-------|
| **Description** | System output implies diagnostic authority (e.g., "patient has ADHD") instead of "signals consistent with..." |
| **Severity** | 5 (Critical) |
| **Likelihood** | 2 (Unlikely) |
| **Risk Score** | **10 — High** |
| **Mitigation** | All outputs include "Decision support only. Requires clinician review." disclaimer. Safety wording tests in E2E. Grade-based caveats for low-quality evidence. |
| **Owner** | L3 Clinical Safety |
| **Status** | Mitigated — monitoring |

### R2: Missing Safety Disclaimer

| Field | Value |
|-------|-------|
| **Description** | A page or API response lacks the required safety disclaimer |
| **Severity** | 4 (High) |
| **Likelihood** | 2 (Unlikely) |
| **Risk Score** | **8 — Medium** |
| **Mitigation** | E2E tests verify disclaimer presence on all critical pages. Pydantic schemas include safety_disclaimer field. Backend adds disclaimer to all responses. |
| **Owner** | L2 Technical |
| **Status** | Mitigated — monitoring |

### R3: Evidence Fabrication

| Field | Value |
|-------|-------|
| **Description** | System generates or displays fabricated citations, DOIs, or PubMed IDs |
| **Severity** | 5 (Critical) |
| **Likelihood** | 1 (Rare) |
| **Risk Score** | **5 — Medium** |
| **Mitigation** | Evidence citations are seeded from real sources only. DOI/PMID parsed from real URLs via regex. No LLM citation generation. Research-only badge for low-grade evidence. |
| **Owner** | L2 Technical |
| **Status** | Mitigated — monitoring |

---

## Data Privacy Risks

### R4: Cross-Clinic Data Leakage

| Field | Value |
|-------|-------|
| **Description** | A clinician sees patient data from another clinic |
| **Severity** | 5 (Critical) |
| **Likelihood** | 1 (Rare) |
| **Risk Score** | **5 — Medium** |
| **Mitigation** | Clinic isolation enforced via `require_patient_owner()` in `apps/api/app/auth.py`. `require_minimum_role()` used throughout; `admin` role is cross-clinic by design. Access control tests verify isolation. Every query is scoped by `clinic_id`. |
| **Owner** | L2 Technical |
| **Status** | Mitigated — monitoring |

### R5: PHI in Cache Keys or Logs

| Field | Value |
|-------|-------|
| **Description** | Patient names, SSNs, or clinical notes appear in cache keys or application logs |
| **Severity** | 5 (Critical) |
| **Likelihood** | 1 (Rare) |
| **Risk Score** | **5 — Medium** |
| **Mitigation** | Cache keys use scoped IDs only (no names). Redis credentials masked in logs. Values never logged. Security review confirms no PHI exposure. |
| **Owner** | L2 Technical |
| **Status** | Mitigated — monitoring |

### R6: Export Data Exposure

| Field | Value |
|-------|-------|
| **Description** | Exported patient data is accessible to unauthorized users |
| **Severity** | 4 (High) |
| **Likelihood** | 2 (Unlikely) |
| **Risk Score** | **8 — Medium** |
| **Mitigation** | Export requires `clinician` or `reviewer` role (enforced via `require_minimum_role`). Export action logged in audit trail. Clinic isolation on export queries. Role-gated API endpoints. |
| **Owner** | L2 Technical |
| **Status** | Mitigated — monitoring |

---

## Performance Risks

### R7: Slow Dashboard on Large Clinics

| Field | Value |
|-------|-------|
| **Description** | Clinic dashboard takes >5 seconds to load with 100+ patients |
| **Severity** | 3 (Medium) |
| **Likelihood** | 3 (Possible) |
| **Risk Score** | **9 — Medium** |
| **Mitigation** | Summary endpoints use COUNT queries (not full records). Composite indexes on key tables (verified: `ix_ai_analysis_runs_clinic_patient`, `ix_patient_data_assets_clinic_patient`, `ix_generated_documents_clinic_patient`, and others in `models/clinical.py`). Materialized views and Redis caching are referenced in ops config but not in the models layer; verify against runtime config before citing. |
| **Owner** | L2 Technical |
| **Status** | Mitigated — monitoring |

### R8: Materialized View Staleness

| Field | Value |
|-------|-------|
| **Description** | Dashboard shows stale data because materialized views haven't been refreshed |
| **Severity** | 3 (Medium) |
| **Likelihood** | 3 (Possible) |
| **Risk Score** | **9 — Medium** |
| **Mitigation** | Manual refresh via admin endpoint. Status endpoint shows last refresh time. Cron schedule recommended (15-30 min). Fallback to live queries if views stale. |
| **Owner** | L2 Technical |
| **Status** | Accepted — documented |

---

## UX Confusion Risks

### R9: Demo vs Live Mode Confusion

| Field | Value |
|-------|-------|
| **Description** | A clinic operates in demo mode thinking it's live, or vice versa |
| **Severity** | 4 (High) |
| **Likelihood** | 2 (Unlikely) |
| **Risk Score** | **8 — Medium** |
| **Mitigation** | Global red demo banner when demo enabled. Production guard warns if demo in production. `runtime-config` endpoint exposes demo status. Onboarding checklist requires demo/live confirmation. |
| **Owner** | L3 Clinical Safety |
| **Status** | Mitigated — monitoring |

### R10: Research-Only Evidence Misinterpreted

| Field | Value |
|-------|-------|
| **Description** | Clinician treats Grade C/D research-only evidence as clinical-grade |
| **Severity** | 4 (High) |
| **Likelihood** | 3 (Possible) |
| **Risk Score** | **12 — High** |
| **Mitigation** | Research-only badge (gray) on C/D evidence. Grade badges (A=green, D=red). Caveat text explains limitation. Training guide covers evidence grades. Safety disclaimer on every evidence card. |
| **Owner** | L3 Clinical Safety |
| **Status** | Active mitigation — training required |

---

## Role/Access Risks

### R11: Role Escalation

| Field | Value |
|-------|-------|
| **Description** | A user gains access to a higher role than assigned (e.g., technician sees admin data) |
| **Severity** | 4 (High) |
| **Likelihood** | 1 (Rare) |
| **Risk Score** | **4 — Low** |
| **Mitigation** | RBAC enforced server-side via `require_minimum_role()` in `apps/api/app/auth.py`. Role hierarchy: `guest(0) < patient(1) < technician(2) < reviewer(3) < clinician(4) < admin=supervisor(5)` — 7 roles in `ROLE_ORDER` (verified). Role lookup from DB, not client-sent. Clinic isolation prevents cross-clinic access. |
| **Owner** | L2 Technical |
| **Status** | Mitigated — monitoring |

### R12: Consent Not Checked

| Field | Value |
|-------|-------|
| **Description** | AI analysis runs on a patient who has not given consent |
| **Severity** | 4 (High) |
| **Likelihood** | 2 (Unlikely) |
| **Risk Score** | **8 — Medium** |
| **Mitigation** | Synthesis endpoint checks consent via `require_ai_analysis_consent()` in `apps/api/app/services/consent_enforcement.py`. `ConsentRecord` model (`consent_records` table) uses `consent_type = 'ai_analysis'` + `status = 'active'` — there is no boolean `ai_analysis_consent` column (verified). Consent changes logged in audit via `AuditEventRecord`. Onboarding requires consent setup. |
| **Owner** | L2 Technical |
| **Status** | Mitigated — monitoring |

---

## AI Governance Risks

### R13: DeepTwin Causal Overclaiming

| Field | Value |
|-------|-------|
| **Description** | DeepTwin synthesis implies causation ("X caused Y") rather than association |
| **Severity** | 4 (High) |
| **Likelihood** | 2 (Unlikely) |
| **Risk Score** | **8 — Medium** |
| **Mitigation** | E2E negative tests check for prohibited phrases ("caused by", "causes", "definitely"). Safety wording requirements. Clinician review workflow (accept/reject/note). Evidence strength grading. |
| **Owner** | L3 Clinical Safety |
| **Status** | Mitigated — monitoring |

---

## Summary Matrix

| # | Risk | Severity | Likelihood | Score | Status |
|---|------|----------|-----------|-------|--------|
| R1 | AI overclaiming | 5 | 2 | 10 | Mitigated |
| R2 | Missing disclaimer | 4 | 2 | 8 | Mitigated |
| R3 | Evidence fabrication | 5 | 1 | 5 | Mitigated |
| R4 | Cross-clinic leak | 5 | 1 | 5 | Mitigated |
| R5 | PHI in cache/logs | 5 | 1 | 5 | Mitigated |
| R6 | Export exposure | 4 | 2 | 8 | Mitigated |
| R7 | Slow dashboard | 3 | 3 | 9 | Mitigated |
| R8 | MV staleness | 3 | 3 | 9 | Accepted |
| R9 | Demo/live confusion | 4 | 2 | 8 | Mitigated |
| R10 | Research evidence misuse | 4 | 3 | 12 | **Active** |
| R11 | Role escalation | 4 | 1 | 4 | Mitigated |
| R12 | Consent not checked | 4 | 2 | 8 | Mitigated |
| R13 | Causal overclaiming | 4 | 2 | 8 | Mitigated |

**Critical risks:** 0  
**High risks:** 1 (R10 — requires training)  
**Medium risks:** 8  
**Low risks:** 4

---

## Weekly Review Checklist

- [ ] Any new safety incidents reported?
- [ ] Any access anomalies in audit log?
- [ ] Any performance degradation reported?
- [ ] Demo/live mode status confirmed?
- [ ] Evidence grades and disclaimers visible?
- [ ] Consent status up to date?
- [ ] Support ticket volume within targets?
- [ ] Clinician satisfaction trending?
