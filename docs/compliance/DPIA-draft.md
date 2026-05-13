# Data Protection Impact Assessment — Engineering Scaffolding (DRAFT)

> **DRAFT — for legal / Data Protection Officer review. NOT legal advice.**
>
> This document is engineering-side scaffolding to support a future UK GDPR
> Article 35 DPIA. It enumerates the technical facts, data flows, and open
> questions a qualified Data Protection Officer or external counsel will
> need to make legal-basis and risk decisions. Nothing in this document
> constitutes a completed assessment, a legal-basis decision, or a
> compliance sign-off.
>
> Tracking issue: [#845](https://github.com/ALIYILD/DeepSynaps-Protocol-Studio/issues/845)
>
> Status: **scaffolding only — awaiting legal-owner / DPO assignment**.

---

## 1. Personal data categories processed

| Category | Where in the system | Special-category (GDPR Art. 9)? |
|---|---|---|
| Patient identifiers (name, DOB, email, phone, gender) | `apps/api/app/persistence/models/patient.py:41` — `Patient` | No, but combined with health data → yes |
| Clinical conditions, modalities, protocols | `Patient`, `AssessmentRecord`, `TreatmentCourse`, `PrescribedProtocol` (`models/clinical.py`) | **Yes — health data** |
| qEEG / EEG raw data and analyses | `QEEGAnalysis` + uploaded EDF files | **Yes — biometric / health** |
| MRI / DeepTwin / biometrics | `MriAnalysis`, `DeepTwinAnalysisRun`, `biometrics-pipeline` package | **Yes — biometric / health** |
| Device sync telemetry (wearables) | `DeviceConnection` + observations (sync_pipeline) | **Yes — health** |
| AI-generated drafts / report content | `reports_router`, `documents_router`, `protocol_studio_router` | Derived health |
| Audit events / consent records | `AuditEventRecord`, `ConsentRecord`, `SafetyFlag` | Operational, but references the above |
| Clinician PII (name, email, clinic) | `User`, `Clinic` | No |
| Cached session metadata (browser localStorage) | `apps/web/src/auth.js::setCurrentUser` writes `ds_session_user` (id, email, display_name, role, package_id, clinic_id) | Identifier — see PR #897 for the cache lifecycle |

## 2. Lawful basis options (legal owner must decide)

For each category in §1, a lawful basis must be selected under both Art. 6 and (where applicable) Art. 9:

- Art. 6(1)(b) contract — clinician–clinic engagement
- Art. 6(1)(c) legal obligation — clinical record-keeping requirements
- Art. 6(1)(f) legitimate interest — operational logging, abuse prevention
- Art. 9(2)(h) provision of health/social care — most clinical data; must be paired with a confidentiality basis (e.g. UK DPA 2018 Sch.1 Part 1 §2)
- Art. 9(2)(a) explicit consent — fallback / patient-initiated flows

**Decisions for legal owner**: which combination applies to (a) AI-assisted drafts, (b) wearable device telemetry under `device_sync` consent, (c) cached-session browser metadata.

## 3. Consent infrastructure (technical state)

### Model
`ConsentRecord(patient_id, clinician_id, consent_type, status, expires_at, signed, signed_at, document_ref, created_at)` — `apps/api/app/persistence/models/patient.py:70`.

### Canonical service
`apps/api/app/services/consent_enforcement.py` provides:

- `require_ai_analysis_consent` (line 29)
- `require_device_sync_consent` (line ~120)
- `require_document_generation_consent` (line 212)

Each writes an `AuditEventRecord` on grant and a `SafetyFlag` on denial.

### Wired call sites (as of 2026-05-13)

| Consent type | Endpoint | Wiring PR |
|---|---|---|
| `ai_analysis` | `clinical_text_router.{analyze,extract-pii,deidentify,analyze-neuromodulation}` | #847 + #893 |
| `device_sync` | `device_sync_router.{trigger_sync,oauth_callback}` | #891 + #895 |
| `document_generation` | `protocol_studio_router.{generate,recommend}` | #890 + #896 |

### Known gap (technical, engineering follow-up)
`protocol_studio_router._consent_active_protocol` and `device_sync_router._consent_active_device` are local helpers that filter by `consent_type` + `status="active"` but **do not write `AuditEventRecord` on grant or denial**, unlike the canonical service helpers. Engineering plan: refactor these onto `app.services.consent_enforcement` to unify the audit trail. Not blocking the DPIA but should land before clinical-data exposure.

**Decisions for legal owner**:
- What fields must `ConsentRecord.document_ref` capture (signed-PDF hash, IP, timestamp, witness)?
- Required granularity of consent revocation (per-modality, per-clinician, per-document-type, or global)?

## 4. Data flows (sub-processors to enumerate under Art. 28)

### Inbound
patient signup → clinician uploads EDF / MRI / labs → wearable OAuth callback → patient-portal media upload.

### Internal
`apps/worker` Celery workers run EEG / MRI / biometrics / qeeg-pipeline / mri-pipeline jobs.

### External sub-processors

| Processor | Purpose | Region | PHI exposure |
|---|---|---|---|
| Fly.io | API + worker hosting | per `fly.toml` (`lhr`/`fra`) | Stores all clinical data |
| Netlify | Web preview build hosting | global CDN | Static assets only |
| OpenRouter / Anthropic / OpenAI | LLM inference (chat_service, qeeg AI report, agents) | provider-specific | PHI-redacted prompts via `app.qeeg.services.phi_redaction` |
| Stripe | Billing | global | Billing metadata only |
| Sentry | Error tracking | disabled in current deployment (see `app.sentry_setup` warning) | If enabled, must scrub PII |
| Cloudflare | CDN / tunnel | global | No PHI |
| Unpaywall / PubMed / FDA | Read-only public literature | public | No PHI leaves |

### Outbound to patient
Patient portal display, exported documents, email notifications.

## 5. Data-subject rights (Art. 12–22) implementation status

| Right | Status | Where / Gap |
|---|---|---|
| Art. 15 access | partial | `patient_portal_router` exposes own records. Open: explicit "download all my data" export endpoint? |
| Art. 16 rectification | partial | Patient portal allows profile edits; clinical edits clinician-only |
| Art. 17 erasure | **MISSING** | No patient-initiated delete endpoint. `Patient.status` allows soft-delete but does not purge |
| Art. 18 restriction | partial | Via `ConsentRecord.status="withdrawn"`. Open: does revocation propagate to downstream services in real time? |
| Art. 20 portability | **MISSING** | No explicit "export to common format" endpoint |
| Art. 21 object | **MISSING** | No opt-out for legitimate-interest processing |
| Art. 22 automated decisions | mitigated | AI surfaces are decision-SUPPORT only with disclaimers (`apps/web/src/.../disclaimers.js`); never autonomous. Open: legal classification of "AI draft + clinician sign-off" workflow |

## 6. Retention & deletion policy

**Current state**: no automated retention windows. All rows persist until manual admin action. Backups under `data/backups/` are unbounded.

**Decisions for legal owner**:
- Minimum retention for clinical records (UK GMC: adults 8 yrs from last contact; minors to age 25/26)
- Maximum retention for raw device telemetry
- Backup retention and secure-deletion procedure for inactive accounts
- Audit-log retention (often longer than the underlying record)

## 7. Access controls

- Role-based: `actor.role` ∈ {patient, clinician, technician, supervisor, reviewer, clinic-admin, admin, super-admin}
- Cross-clinic gate: `require_patient_owner` + `_gate_patient_access` enforce "patient belongs to actor's clinic" on every patient-data endpoint
- IDOR test coverage: `tests/test_*_cross_clinic*.py` (pattern documented in memory `deepsynaps-qeeg-pdf-export-tenant-gate.md`)

**Decision for legal owner**: formal access-control matrix for the DPIA appendix.

## 8. Audit logging

- Canonical table: `AuditEventRecord(event_id, target_id, target_type, action, role, actor_id, note, created_at)`
- Written by consent gates and many router actions
- **Gap**: the local `protocol_studio` + `device_sync` consent helpers do not write audit events on grant/denial (see §3)

**Decisions for legal owner**:
- Required minimum field set
- Tamper-evidence requirements (signed log chain, append-only WAL, etc.)
- Retention of audit log itself

## 9. Residual risks to flag for the DPIA

1. **AI inference exfiltration**: `chat_service` sends prompts to OpenRouter/Anthropic. PHI redaction runs but is best-effort. Anthropic/OpenAI API plans support zero-retention but **verifying the contracted plan + DPA is a legal task, not an engineering one**.
2. **Browser-side cached session metadata**: `ds_session_user` in `localStorage` (PR #897 / #883) includes user `email` and `display_name` to enable cached-session restore on auth-bootstrap network failure. Cleared on logout and session-expired. Engineering follow-up: consider slimming the cached payload to non-PII fields only.
3. **Demo / synthetic data leak**: demo tokens (`*-demo-token`) bypass some flows; verify no path lights demo paths in prod.
4. **Patient-portal preview deployments** (Netlify) use `VITE_ENABLE_DEMO=1`. Verify no path from preview to real patient data.

## 10. Deliverables vs. what exists in-repo

| Deliverable | Status | Notes |
|---|---|---|
| Article 35 DPIA report | **MISSING** | This document is engineering scaffolding only |
| HIPAA compliance review | **MISSING** | Outside DPIA scope but on Item-E spec |
| Lawful-basis register | **MISSING** | See §2 |
| DPA template / sub-processor list | **MISSING** | See §4 |
| Consent management procedures | partial (technical only) | Code wiring exists; SOP missing |
| Data retention + deletion policy | **MISSING** | See §6 |
| Patient rights SOP | **MISSING** | See §5 |

## 11. Legal-owner next actions

This document **cannot be promoted to a completed DPIA by engineering alone**. A qualified Data Protection Officer or external counsel must:

1. Accept or correct the data-flow and processing model in §§1–4
2. Decide the lawful-basis pairing per category in §2
3. Sign off on residual risks in §9 (or task engineering with mitigations)
4. Publish the DPIA, DPA, retention policy, and patient-rights SOP

### Engineering work this scaffolding implies (pending legal direction)

- Patient-portal "download my data" export (Art. 20)
- Patient-portal "delete my account" workflow (Art. 17)
- Automated retention sweep job
- Audit-log retention separate from clinical-record retention
- Refactor `protocol_studio` + `device_sync` consent gates onto the canonical service for unified audit trail
- Slim the `ds_session_user` cache payload to non-PII fields only

---

**Maintenance**: this file should be updated by engineering PR when any of the underlying systems change (new sub-processor, new patient-data endpoint, new consent type, etc.). The legal owner can then re-review affected sections without rebuilding the scaffolding from scratch.
