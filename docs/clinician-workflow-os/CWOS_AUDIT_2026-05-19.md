# Clinician Workflow OS — Consolidated Audit Report

**Date:** 2026-05-19
**Audit method:** 4 parallel read-only Explore subagents, results consolidated by hand.
**Target document:** `docs/clinician-workflow-os/DeepSynaps_Clinician_Workflow_OS.md` (master, landed in PR #1071).
**Status:** **Decision input — not a delivery plan.** Operator must scope each module individually before any implementation work.

---

## Executive summary

The master Workflow OS document proposes 12 clinician-facing modules. This audit reconciles those 12 modules against four independent dimensions:

1. **Implementation status** in the current repository (PRESENT / PARTIAL / MISSING)
2. **Governance overhead** against stabilization-sensitive surfaces (🟢 Green / 🟡 Yellow / 🔴 Red)
3. **Clinical-safety surface impact** (patient-safety class, FDA SaMD lane, PHI, off-label, banned-language, tenancy gate)
4. **Cited-claims verification** — which of the platform claims in the master doc are backed by production code vs aspirational

Headline findings:

- **10 of 12 modules already have PRESENT or PARTIAL implementations** in the repo. Only Prior Auth Automation is true greenfield. Billing Engine is partial (Stripe marketplace subscriptions only — no CPT mapping or claims submission).
- **6 of 12 modules are governance-RED** (heavy clinical-safety overhead). Every RED module is also a PRESENT module — so the "easy wins" framing in the master doc is misleading; the existing implementations need governance hardening, not new code.
- **Universal must-haves** before ANY module ships (consent gating, banned-language gate, `require_patient_owner()` audit, FDA SaMD scoping decision, off-label flagging UI) are independent of module choice.
- **Several master-doc platform claims overstate the live state.** "66 external databases" actually = 22 catalogued + 30 planning (not all functional). "120+ primary sources" is unverifiable from repo content. "BioCypher + Neo4j" is aspirational only. "FastSurfer" is declared in capability strings but not wired into runtime.

The pragmatic implication: the next sprint should NOT be "build a new module." It should be **(a)** ship the universal must-haves as a single hardening PR, **(b)** ground the cited-claims aspirational items in either truthful labelling or in real implementations, and **(c)** scope ONE module's governance hardening end-to-end (recommendation: Patient Intake — Green governance, PRESENT implementation, but first-touch IDOR risk).

---

## Section 1 — Implementation status

Source: read-only repo survey (`apps/api/app/routers/`, `apps/api/app/services/`, `apps/web/src/pages-*.js`, `apps/api/tests/`).

| Module | Status | Existing files (representative) | Repo name | Gap |
|---|---|---|---|---|
| Patient Intake | **PRESENT** | `apps/api/app/routers/onboarding_router.py`, `apps/api/tests/test_intake_preview.py`, `apps/api/app/services/patient_agent_activation.py` | Patient Onboarding / Intake Preview | Frontend UX flow incomplete |
| Prior Auth Automation | **MISSING** | none | — | True greenfield: insurance integration, FHIR eligibility, coverage rules engine |
| Protocol Selector | **PRESENT** | `apps/api/app/routers/protocol_studio_router.py`, `apps/api/app/services/protocol_studio_recommend.py`, `apps/api/app/services/protocol_personalization.py`, `apps/web/src/pages-protocols.js` | Protocol Studio | Approval workflow + real-time literature search incomplete |
| Session Manager | **PRESENT** | `apps/api/app/routers/sessions_router.py`, `apps/api/app/routers/treatment_sessions_router.py`, `ClinicalSession` model | Sessions / Treatment Sessions | Calendar UX component missing |
| Device Manager | **PRESENT** | `apps/api/app/routers/device_sync_router.py`, `apps/api/app/routers/home_devices_router.py`, `apps/api/app/services/devices.py` | Device Sync / Home Device Portal | Real-time telemetry dashboard missing |
| Outcomes Tracker | **PRESENT** | `apps/api/app/routers/outcomes_router.py`, `OutcomeSeries` and `OutcomeEvent` models | Outcomes Router | Longitudinal visualization + automated responder classification |
| Billing Engine | **PARTIAL** | `apps/api/app/routers/agent_billing_router.py`, `apps/api/app/persistence/models/billing.py`, Stripe integration | Agent Billing / Stripe Subscriptions | CPT mapping, insurance claims, EOB reconciliation all missing — Stripe handles marketplace subscriptions only |
| Report Generator | **PRESENT** | `apps/api/app/routers/reports_router.py`, `apps/api/app/services/mri_report_generator.py`, `apps/api/app/services/qeeg_report_generator.py` | Reports / AI Report Router | Clinician-authored template builder, patient-facing report portal |
| Safety Monitor | **PRESENT** | `apps/api/app/services/fusion_safety_service.py`, `apps/api/app/services/qeeg_safety_engine.py`, `apps/api/app/services/mri_safety_engine.py`, `apps/api/app/services/agent_brain/safety.py` | Safety Engine / Fusion Safety | Real-time safety-signal aggregation dashboard |
| Compliance Engine | **PARTIAL** | `apps/api/app/services/mri_compliance.py`, `apps/api/app/services/qeeg_compliance.py`, `apps/api/app/routers/admin_governance_router.py` | Compliance / Modality compliance services | Unified compliance dashboard, automated reporting, HIPAA export |
| Care Coordination | **PRESENT** | `apps/api/app/routers/care_team_coverage_router.py`, `apps/api/app/routers/patient_care_router.py`, 8+ caregiver routers | Care Team Coverage / Caregiver Portal | Inter-clinic care transitions, referral management |
| Analytics Dashboard | **PRESENT** | `apps/api/app/routers/patient_analytics_router.py`, `apps/api/app/routers/population_analytics_router.py`, `apps/web/src/pages-patient-analytics.js` | Patient Analytics / Population Analytics | Custom report builder, drill-down templates |

**Bottom line: 8 PRESENT, 2 PARTIAL, 1 MISSING.** (Note: Patient Intake is listed PRESENT but the frontend wiring is incomplete — counts as PRESENT-but-not-end-to-end.)

---

## Section 2 — Governance overhead

Source: reconciliation against `docs/engineering/runtime-critical-surface-protection.md`, `docs/engineering/concurrent-session-policy.md`, `docs/engineering/runtime-hygiene-policy.md`, `docs/qeeg-safety-governance.md`, `docs/engineering/pr-hygiene-and-drift-disclosure.md`.

| Module | Overhead | Critical surfaces touched | Primary docs to reconcile |
|---|---|---|---|
| Patient Intake | 🟢 Green | Role gates, tenant isolation | `runtime-critical-surface-protection.md` § "API contract layer"; `pr-hygiene-and-drift-disclosure.md` |
| Prior Auth | 🟡 Yellow | Tenancy gates, new migrations, evidence grades | `runtime-critical-surface-protection.md` § "Persistence & migrations" (SQLite/Postgres bool defaults!) |
| Protocol Selector | 🔴 Red | Evidence DB read path, qEEG governance, report contract, agent grounding | `qeeg-safety-governance.md`, `protocol_evidence_governance.md`, `runtime-critical-surface-protection.md` § "Clinical safety & evidence layer" |
| Session Manager | 🔴 Red | Scheduling engine, course lifecycle, overlay state machine | `runtime-critical-surface-protection.md` § "Scheduling, courses, monitoring" + § "Frontend overlay surface" |
| Device Manager | 🟡 Yellow | Monitoring + wearables, tenancy gates | `runtime-critical-surface-protection.md` § "Scheduling, courses, monitoring" |
| Outcomes Tracker | 🔴 Red | `QEEGBrainMapReport` shape (frozen), audit trail immutability, evidence grades | `qeeg-safety-governance.md` § "State Machine & Export Gating", `runtime-critical-surface-protection.md` item 3 (do-not-touch) |
| Billing Engine | 🟡 Yellow | MRI report contract, tenancy gates, migrations | `runtime-critical-surface-protection.md` § "Persistence & migrations" |
| Report Generator | 🔴 Red | Banned-language enforcement, qEEG state machine, agent grounding, WeasyPrint Dockerfile layer | `qeeg-safety-governance.md`, `Dockerfile`, `safety_evidence_policy.md` |
| Safety Monitor | 🔴 Red | Adverse events, monitoring stabilization-sensitive, audit immutability | `runtime-critical-surface-protection.md` § "Scheduling, courses, monitoring", `qeeg-safety-governance.md` § "Audit Trail" |
| Compliance Engine | 🟡 Yellow | Role gates, audit immutability, all routers | `pr-hygiene-and-drift-disclosure.md`, `runtime-critical-surface-protection.md` § "API contract layer" |
| Care Coordination | 🔴 Red | Course lifecycle, inter-clinic tenancy (IDOR risk on referrals), overlay state machine | `runtime-critical-surface-protection.md` § "Scheduling, courses, monitoring" + § "Stabilization-sensitive surfaces" |
| Analytics Dashboard | 🟡 Yellow | Tenancy gates at query layer, overlay surfaces, test registry | `runtime-critical-surface-protection.md` § "Tests with cross-cutting impact"; `apps/web/package.json` `test:unit` |

**1 Green / 5 Yellow / 6 Red.** Every 🔴 Red module is also a PRESENT module — meaning these modules already exist, but ANY incremental work on them must reconcile against the governance docs listed.

---

## Section 3 — Clinical-safety surface impact

Source: review of `docs/qeeg-safety-governance.md`, `docs/safety_evidence_policy.md`, `docs/safety/agent-brain-clinical-safety-policy.md`, `apps/api/app/auth.py::require_patient_owner()`.

| Module | Patient-safety class | FDA SaMD lane | PHI? | Banned-language risk | Off-label risk | Tenancy gate required |
|---|---|---|---|---|---|---|
| Patient Intake | **H** | Class II | Yes | High | Yes | **Yes (critical first touch)** |
| Prior Auth | M | Non-device | Yes | Medium | Yes | Yes |
| Protocol Selector | **H** | Class II | Yes | High | **High** | Yes |
| Session Manager | M | Class II | Yes | Medium | Yes | Yes |
| Device Manager | M | Class II | Yes | Medium | No | Yes |
| Outcomes Tracker | **H** | Class II | Yes | **High** (correlation → diagnosis-claim drift) | No | Yes |
| Billing Engine | L | Non-device | Yes | Low | No | Yes |
| Report Generator | **H** | Class II | Yes | **Critical** (highest banned-language risk surface) | Yes | Yes |
| Safety Monitor | **H** | Class II | Yes | High | No | Yes |
| Compliance Engine | M | Non-device | Yes | Low | No | Yes |
| Care Coordination | **H** | Class II | Yes | Medium | No | **Yes (inter-clinic IDOR)** |
| Analytics Dashboard | M | Non-device | Yes | Medium | No | Yes (at query layer) |

**Universal must-haves** (independent of module choice):

1. **Consent flow hardening** — gate every clinical module on `consent_state ∈ {CONSENTED, AMENDED}` before PHI display or treatment recs. Off-label requires separate `off_label_acknowledged=true`. Reference: `qeeg-safety-governance.md` state machine `DRAFT_AI → NEEDS_REVIEW → APPROVED → EXPORTED`.
2. **Centralized banned-language gate** — block the 11 forbidden patterns from `qeeg-safety-governance.md` ("diagnoses", "confirms", "cures", "disease-modifying effect", "treatment recommendation", etc.) before any AI-generated narrative reaches APPROVED.
3. **Tenancy-gate audit** — every route in patient-scoped modules must call `require_patient_owner(actor, patient_clinic_id)`. Patient Intake is the critical first-touch IDOR risk.
4. **FDA SaMD scoping decision** — for Protocol Selector, qEEG/MRI Analyzers, Safety Monitor: Class II 510(k) requiring predicate + labeling, or decision-support non-device with "Decision-support only. Not a medical device." labeling? Current state per `docs/mri-clinical-safety-case.md` and `docs/qeeg-demo-script.md`: treated as non-device decision-support. This needs an explicit operator decision before external pilot.
5. **Off-label flagging UI** — every protocol row in Protocol Builder/Session Manager shows `[OFF-LABEL]` badge if `off_label=true`. Per `docs/safety_evidence_policy.md`: only TPS (NEUROLITH®) for Alzheimer's and CES (Alpha-Stim®) for anxiety/depression/insomnia are on-label.

---

## Section 4 — Cited-claims verification

Source: cross-check of platform claims in the master doc against repo artifacts.

| Claim | Verification | Evidence |
|---|---|---|
| "66 external databases" | **Overstated, currently 22 + 30 planned** | `apps/api/app/services/knowledge/adapter_bootstrap.py` `_ADAPTER_CATALOG` has **22 entries on current `origin/main`** (21 before #1052 OpenAlex, 22 after). The roadmap's 66 figure counts 22 catalogued + 44 planning rows. Defensible as "addressable inventory" but should not be quoted as functional count. |
| "120+ primary sources" | **Unverifiable from repo** | `docs/summary-report.md` "Master Clinical Database" lists 30 primary sources. The 120+ figure may conflate BATCH report citation counts (~3,160 lines across 6 reports) but actual catalogued sources = 30. |
| CPT fee schedule ($290.77 for 90867 etc.) | **Aspirational** | No CPT fee data embedded in repo. CPT codes referenced in research/handbook docs but no price values. AMA license required for production embed. |
| "BioCypher + Neo4j knowledge graph" | **Aspirational only** | Mentioned in `docs/research/OPEN_SOURCE_DEEPTWIN_STACK_REPORT.md` as optional. NOT in any pyproject.toml, no runtime imports, not wired into adapter registry. |
| "MNE-Python for qEEG" | **In-repo** ✓ | `apps/api/pyproject.toml` declares `mne>=1.7.0,<2.0.0`. 25+ active `import mne` references across routers, services, source localization. BSD-3 licensed. |
| "FastSurfer for MRI" | **Declared but not wired** | Referenced in `apps/api/app/routers/mri_analysis_router.py` and `mri_capabilities_router.py` as a capability string. NO import statements, no GPU container config. Marketing-ready text but not runtime-ready. |
| "SimNIBS for E-field modeling" | **In-repo** ✓ | `apps/api/app/services/knowledge/adapters/simnibs_adapter.py` is registered in adapter catalog (tier P0). Implements SimNIBS 4.0 interface for tDCS/TMS simulation. GPL v3 licensed, flagged research-only. |
| Evidence DB at `services/evidence-pipeline/neuromodulation_evidence_*.db` | **In-repo** ✓ | `apps/api/app/services/evidence_terminal_service.py` `resolve_evidence_db_path()` resolves to `neuromodulation_evidence_2026-04-29_v4.db` under `services/evidence-pipeline/`. Path matches claim. |
| "W01–W07 reports" | **Pending paste** | Only the master `DeepSynaps_Clinician_Workflow_OS.md` is committed (PR #1071). The seven per-clinic-type reports have not yet been pasted into the repo. The underlying BATCH1–BATCH6 docs exist (~3,160 lines) but are named BATCH*, not W0*. |

---

## Section 5 — Combined readiness matrix

| Module | Implementation | Governance | Safety class | Repo-claim status | Net classification |
|---|---|---|---|---|---|
| Patient Intake | PRESENT | 🟢 | H | OK | **Start here for governance-hardening PR** |
| Prior Auth | MISSING | 🟡 | M | OK | Greenfield — substantial new build |
| Protocol Selector | PRESENT | 🔴 | H | OK | Hardening required (banned-language + off-label gates) |
| Session Manager | PRESENT | 🔴 | M | OK | Hardening required (overlay state machine immutability) |
| Device Manager | PRESENT | 🟡 | M | OK | UX completion + monitoring stabilization-sensitive |
| Outcomes Tracker | PRESENT | 🔴 | H | OK | Hardening required (QEEGBrainMapReport contract, audit immutability) |
| Billing Engine | PARTIAL | 🟡 | L | CPT mapping aspirational | Substantial new work for clinical billing |
| Report Generator | PRESENT | 🔴 | H | OK | **Highest banned-language risk surface** |
| Safety Monitor | PRESENT | 🔴 | H | OK | Hardening required (monitoring stabilization-sensitive) |
| Compliance Engine | PARTIAL | 🟡 | M | OK | Dashboard + HIPAA export work |
| Care Coordination | PRESENT | 🔴 | H | OK | **Inter-clinic IDOR risk if referrals added** |
| Analytics Dashboard | PRESENT | 🟡 | M | OK | UX completion + tenancy gates at query layer |

---

## Section 6 — Recommendations

### Before any module work

Land the **five universal must-haves** (Section 3 list) as scoped PRs. Each has cross-module impact; landing them first means every subsequent module benefits and the safety story is consistent.

Suggested PR order:

1. **Centralized banned-language gate** — one service module + CI invariant. Highest blast radius (any narrative-producing module needs it).
2. **`require_patient_owner()` audit** — sweep every patient-scoped route, file the cross-clinic test missing list. Patient Intake is the priority.
3. **Off-label flag plumbing** — `off_label=true` on the protocol catalog rows + UI badge. Per `safety_evidence_policy.md` only TPS-Alzheimer's and CES-anxiety/depression/insomnia are on-label.
4. **FDA SaMD scoping decision document** — operator decision, not engineering. Decide Class II vs decision-support per surface (Protocol Selector, qEEG/MRI Analyzers, Safety Monitor). Document the choice in `docs/regulatory/`.
5. **Consent-state gate** — `consent_state ∈ {CONSENTED, AMENDED}` before any PHI display. Pairs naturally with the off-label flag.

### Module-level recommendation

If you want a "first module to harden end-to-end" pilot: **Patient Intake**. Green governance, PRESENT implementation, but the highest first-touch IDOR risk — and any hardening pattern established here propagates to the 11 other modules. Substantive value, contained blast radius.

If you want the highest business value: **Prior Auth Automation** + **Billing Engine** CPT mapping. Both are genuinely greenfield work (no governance overhead because there's nothing existing to break) and unlock revenue cycle. Days, not weeks, per the master doc's roadmap. Caveat: Prior Auth wires to external payer systems — that's not just engineering, it's a vendor/integration decision.

### Documentation alignment

Three aspirational claims in the master doc should be either grounded or labelled:

- **"66 external databases"** — change to "22 catalogued in production, 44 in planning roadmap" or similar truthful framing.
- **"120+ primary sources"** — verify or remove. The repo's documented count is 30; the 120+ figure isn't traceable.
- **"BioCypher + Neo4j"** — either implement (substantial work) or remove from the OS architecture diagram. Keeping it in marketing surfaces while it's aspirational risks both clinical credibility and contributor confusion.

### Process

The seven per-clinic-type reports (W01–W07) underpinning the master doc have not yet been committed. They were referenced as 5,853 lines of supporting research. Until they land, the master doc's per-clinic findings are not auditable from the repo. Recommend the user paste them in (paste order in PR #1071 follow-up message) so this audit can be extended per clinic type before any clinic-specific module work starts.

---

## Appendix A — Audit provenance

This audit was assembled from four parallel read-only Explore subagent runs on 2026-05-19:

1. **Clinical-safety surface-impact** (agent `aa701f7da948c5c68`, ~76 s, 30 tool uses) — produced the safety classification table and the universal must-haves list.
2. **Governance reconciliation** (agent `a310c7bcdf5411776`, ~132 s, 26 tool uses) — produced the per-module governance overhead ranking and surface-touch map.
3. **Module-to-existing-surface mapping** (agent `a395115f40fcd7812`, ~126 s, 38 tool uses) — produced the implementation-status table and the quick-wins vs greenfield split.
4. **Cited-claims verification** (agent `a0c3e82320adbf1cc`, ~148 s, 43 tool uses) — produced the platform-claim audit and aspirational-claims list. (Counted 20 catalogued adapters from a pre-PR-#1052 state; current count is 22 — this audit reflects the corrected figure.)

All four ran read-only; no files were modified by the subagents. Total agent time ~8 min wall clock running concurrently.

## Appendix B — Files referenced

Per-doc citations are embedded in each section's tables. The high-frequency anchors are:

- `apps/api/app/services/knowledge/adapter_bootstrap.py` (catalog)
- `apps/api/app/auth.py` (`require_patient_owner`)
- `docs/qeeg-safety-governance.md` (banned-language + state machine)
- `docs/engineering/runtime-critical-surface-protection.md` (stabilization-sensitive surfaces)
- `docs/safety_evidence_policy.md` (off-label policy)
- `docs/clinician-workflow-os/DeepSynaps_Clinician_Workflow_OS.md` (master doc this audit targets)
