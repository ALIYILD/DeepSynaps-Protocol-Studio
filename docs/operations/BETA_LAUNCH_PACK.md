<!-- Edited 2026-05-18 from kimi-salvage; original audit verdict EDIT. -->
# DeepSynaps Protocol Studio — Beta Launch Pack

**Version:** 4.0.0-BETA  
**Date:** 2026-05-17  
**Audience:** Clinic administrators, clinicians, DeepSynaps operations  
**Status:** Decision-support preview, not a clinical diagnostic system

---

## 1. What Is Included in Beta

### Core Modules

| Module | Status | Description |
|--------|--------|-------------|
| **Dashboard** | Available | Clinic-level aggregate summaries, patient counts, modality breakdowns |
| **Patient Hub** | Available | Patient list, profile, context preservation |
| **Assessments** | Available | Assessment queue, library, decision-support scoring |
| **qEEG Analyzer** | Available | Band power, connectivity, protocol-fit with evidence links |
| **MRI Analyzer** | Available | Atlas region markers, neuromarkers, brain-age indicators |
| **Biomarkers** | Available | Labs, neuroinflammation, metabolic/nutritional markers |
| **Medication Analyzer** | Available | Medication list, interaction flags, pharmacist review guidance |
| **Protocol Studio** | Available | Handbooks, protocol generation, export |
| **Evidence Research** | Available | Evidence links, citations, provenance, strength grading |
| **Reports** | Available | Clinician review, signing, export/handoff |
| **DeepTwin** | Available | Patient-level synthesis: timeline, correlations, confounders, hypotheses |
| **Patient Portal** | Available | Dashboard, appointments, tasks, messages, check-ins |
| **Audit/Consent** | Available | Full audit trail, consent management, RBAC (`guest`/`patient`/`technician`/`reviewer`/`clinician`/`admin`/`supervisor`) |
| **Admin** | Available | Clinic admin tools, user management, materialized view status |

### Infrastructure

| Feature | Status |
|---------|--------|
| PostgreSQL production support | Ready |
| Composite database indexes | Ready (9 indexes) |
| GZip response compression | Ready |
| Summary endpoints (4) | Ready, cached |
| Redis caching (optional) | Ready, with in-memory fallback |
| Demo mode / Non-PHI banner | Ready |
| Materialized views (PostgreSQL) | Ready, manual refresh |
| Datetime deprecation fixes | Ready |
| Evidence links (qEEG, MRI, Biomarkers) | Ready |

---

## 2. What Is Excluded from Beta

| Feature | Status | Reason |
|---------|--------|--------|
| AI diagnosis / autonomous treatment | **Excluded** | Safety — never part of scope |
| Automated prescribing | **Excluded** | Regulatory — requires clinician decision |
| Emergency triage | **Excluded** | Out of scope — not an emergency system |
| Cross-clinic data sharing | **Excluded** | Privacy — clinic isolation enforced |
| Patient self-diagnosis | **Excluded** | Safety — decision-support only |
| Real-time patient monitoring | **Deferred** | Phase 5 — requires wearable integration |
| Billing/insurance integration | **Deferred** | Out of scope |
| EHR bidirectional sync | **Deferred** | Requires vendor-specific adapters |
| Multi-language UI | **Deferred** | Post-beta — currently English only |
| Mobile native app | **Deferred** | Web app is responsive; native app later |
| Voice AI assistant | **Deferred** | Post-beta — voice analysis present, not AI assistant |

---

## 3. Decision-Support-Only Positioning

DeepSynaps is a **clinical decision support system (CDSS)**, not a diagnostic tool.

### What It Does

- Aggregates and correlates multimodal patient data
- Provides evidence-linked insights with strength grading
- Flags gaps, confounders, and quality issues
- Supports protocol development and review workflows
- Maintains full audit trails for clinical governance

### What It Does NOT Do

- Replace clinician judgment
- Diagnose conditions autonomously
- Recommend treatments without clinician review
- Make prescribing decisions
- Substitute for clinical examination

### Safety Disclaimers

Every clinical output includes:
> "Decision support only. Requires clinician review."

DeepTwin outputs include:
> "DeepTwin does not diagnose. It synthesizes cross-modal signals for your review."

---

## 4. Synthetic / Demo vs Live Data Rules

### Demo Mode

- Activated by `MRI_DEMO_MODE=1` (backend) or `VITE_ENABLE_DEMO=1` (frontend)
- Shows red banner: "DEMO BUILD — Synthetic/non-PHI data only"
- Uses synthetic patient data (`demo-patient-001`, etc.)
- Safe for investor demos, training, UI testing
- No real patient data should be entered in demo mode

### Live Mode

- Default when demo flags are unset or `false`
- No demo banner displayed
- Requires clinic setup, real patient consent
- All audit trails active
- PHI handling per clinic policy

### Never

- Mix demo data with live patient data in the same clinic
- Deploy demo mode in production without explicit configuration
- Enter real PHI when demo mode is active

---

## 5. Known Limitations

| # | Limitation | Impact | Mitigation |
|---|-----------|--------|------------|
| 1 | Evidence DB has 8 seeded entries | Limited evidence coverage | Evidence links show degraded state honestly |
| 2 | Materialized views require manual refresh | Stale data possible | 15-30 min refresh schedule recommended |
| 3 | Redis cache is optional | Fallback to in-memory on missing Redis | Graceful degradation, TTL 30-60s |
| 4 | qEEG/MRI analysis is post-processing | Not real-time streaming | Batch upload and analysis model |
| 5 | Cross-browser E2E limited to Chromium/Firefox | Safari not fully tested | WebKit responsive smoke tests pass |
| 6 | No background scheduler | Manual refresh of MVs, no automatic cache warming | Cron/systemd recommended |
| 7 | Single-language (English) | Non-English clinics | Documentation can be translated |
| 8 | Patient portal is web-based | No native mobile app | Responsive design works on mobile |

---

## 6. Support Escalation

| Level | Contact | Response Time | Handles |
|-------|---------|--------------|---------|
| L1 — Help Desk | support@deepsynaps.io | 24h | Account access, UI questions, known issues |
| L2 — Technical | engineering@deepsynaps.io | 4h (business) | Bugs, performance, integration issues |
| L3 — Clinical Safety | safety@deepsynaps.io | 1h (urgent) | Safety concerns, decision-support issues |
| L4 — Engineering Lead | lead-engineer@deepsynaps.io | 2h | Critical outages, data integrity |

---

## 7. Getting Started

1. Read `CLINIC_ONBOARDING_CHECKLIST.md`
2. Complete clinic setup and role assignments
3. Confirm demo vs live mode
4. Import patients with proper consent
5. Review `CLINICIAN_TRAINING_GUIDE.md`
6. Schedule 30-min training session with DeepSynaps team
7. Begin with 2-3 pilot patients
8. Review weekly metrics in `PILOT_SUCCESS_METRICS.md`
