# CWOS Audit Closeout — 2026-05-19

> Companion to [`CWOS_AUDIT_2026-05-19.md`](./CWOS_AUDIT_2026-05-19.md).
> The audit was a snapshot; this is the post-wave dashboard.

The 2026-05-19 audit (PR #1073) identified five universal must-haves
that gate ANY clinical module's go-live. Over the course of 2026-05-19,
**16 PRs landed** addressing the must-haves end-to-end. This document
records what shipped, what's still operator-blocked, and the precise
PR lineage so a future reader can trust the wave's audit-honest claim.

---

## Must-have status at closeout

| # | Must-have | Status | Lineage |
|---|---|---|---|
| 1 | Claim-governance protocol + cross-modality registry | ✅ shipped | #1075 |
| 2 | Patient tenancy-gate audit + ratchet + remediation wave | ✅ shipped | #1080 → #1099 → #1102 → #1106 → #1108 → #1110 → #1111 → #1112 |
| 3 | Off-label flag (conservative default + visible badge) | ✅ shipped | #1085 (web) + #1095 (backend) |
| 4 | FDA SaMD scoping decision | ⏸ awaiting operator + regulatory counsel | #1121 scoping doc landed; **the decision itself is operator territory** |
| 5 | Consent-state gate (off-label acknowledgement) | ✅ shipped end-to-end (5 layers) | #1089 → #1093 → #1097 → #1115 |

---

## Must-have #1 — Claim-governance protocol (#1075)

`ClaimGovernor` Protocol class (runtime_checkable) at
`apps/api/app/services/safety/`, with `MODALITY_GOVERNORS` registry
and `register_modality_governor()` enforcement. Required attributes
on every governor: `_BLOCKED_PATTERNS`, `_BANNED_WORDS`,
`scan_for_banned_words(text) -> list[str]`. Conformance test parameterised
over `REQUIRED_MODALITIES = ("qeeg", "mri")`. 14 protocol tests, all
passing.

---

## Must-have #2 — Tenancy-gate wave

Largest wave of the day. AST audit script (`scripts/audit_patient_tenancy_gates.py`)
finds patient-scoped FastAPI route handlers that don't reach a
recognised tenancy primitive. CI ratchet in
`.github/workflows/tenancy-gate-check.yml` blocks new ungated routes
via `TENANCY_GATE_MAX_UNGATED` env var.

### Ratchet history

* Baseline (#1080): **79 ungated** across 27 router files.
* #1102 — patients_router + `_get_patient_for_actor` recognition. 79 → 71.
* #1106 — clinician_digest / inbox / adherence / wellness. 71 → 62.
* #1108 — complementary + rehab patient histories. 62 → 41.
* #1110 — data_console + medications + intelligence_hub + patient_care. 41 → 25.
* #1111 — 15-file remainder. 25 → 3.
* #1112 — ratchet floor lowered 71 → 3 with documentation refresh.

### The 3 still-ungated routes

All in `apps/api/app/routers/knowledge_router_v2.py`:

* `GET /deeptwin/{patient_id}`
* `POST /deeptwin/{patient_id}/synthesize`
* `GET /deeptwin/{patient_id}/report`

Operator-marked off-limits to automated remediation. Lowering the
floor below 3 requires an explicit operator decision on these
endpoints.

### Recognised tenancy primitives (the gate set)

Established by inspection through the wave. All verified to enforce
cross-clinic-leak safety:

* `require_patient_owner` (canonical, `app.auth`)
* `_gate_patient_access` (canonical per-router shim)
* `_gate_patient` (digital_phenotyping_router)
* `_check_patient_access`, `_check_patient_clinic_access` (media_router)
* `_enforce_patient_scope` (patient_portal_v2_router — patient-self-only)
* `_get_patient_for_actor` (patients_router — clinician-ownership model)
* `resolve_analytics_patient_id` (services.biometrics_analytics)
* `_resolve_patient_for_actor*` family (7 routers)

---

## Must-have #3 — Off-label conservative default

Per `docs/safety_evidence_policy.md`: all neuromodulation is
off-label except TPS (NEUROLITH®) for Alzheimer's and CES
(Alpha-Stim®) for anxiety/depression/insomnia.

Two surfaces had silent defaults that bypassed downstream gates:

* **Web** (#1085): `pages-protocols.js::_backendToStudio` and
  `pages-registries.js` both defaulted to "no badge" for blank/unknown.
  Now blank → off-label badge + governance token (which the launch
  gate reads).
* **Backend** (#1095): `treatment_courses_router.py::create_course` had
  three `params.get("on_label", True)` call sites that defaulted to
  on-label when the params dict was incomplete. Now `False`. Closes
  the silent gate-bypass.

---

## Must-have #4 — FDA SaMD scoping (operator decision)

`docs/regulatory/samd-scoping.md` (#1121) gives the operator + regulatory
counsel a decision-ready artifact:

* IMDRF SaMD framework + the FDA CDS carve-out's four-prong test.
* DeepSynaps clinical functions mapped to the framework.
* Three paths forward (bifurcated, whole-non-device, whole-SaMD) with
  honest pros/cons.
* EU MDR Rule 11 + UK MHRA parallel — stricter than FDA, no broad
  CDS carve-out.
* Recommendation matrix per function family.
* Seven open questions the operator + counsel must answer.

**Suggested provisional path (NOT a determination):** Path A
(bifurcated). Non-device CDS for Protocol Studio + course activation +
safety monitor + off-label flagging + AI note drafting. SaMD lane
(510(k) or research-only) for qEEG analyzer + MRI analyzer +
qEEG-protocol-fit (these analyse signal/image acquisition → fail CDS
prong (1) per the 2022 Final Guidance, regardless of disclaimer text).

---

## Must-have #5 — Off-label acknowledgement (5 layers)

The end-to-end safety surface — all five layers required for credible
enforcement:

| Layer | PR | What |
|---|---|---|
| Conservative default (web) | #1085 | Badge + governance default |
| Conservative default (backend) | #1095 | `create_course` defaults `on_label=False` |
| Service-layer enforcer | #1089 | `require_off_label_acknowledgement` in `consent_enforcement.py` |
| Activation gate wiring | #1093 | `activate_course` returns 403 `code='off_label_consent_missing'` when needed |
| Reactive frontend capture | #1097 | 403 → modal → POST consent → retry |
| Proactive frontend capture | #1115 | Pre-flight check via `api.listConsents`; modal up-front; reactive stays as defence in depth |

`OFF_LABEL_CONSENT_TYPE = "off_label_acknowledgement"`. Today's
predicate is per-patient × per-clinician × consent_type. Modality is
carried for audit but NOT part of the gate predicate — per-modality
scoping is an open product decision (see "Remaining open questions"
below).

---

## What this wave did NOT do (open items)

These three items are explicit non-engineering blockers. The wave's
honesty depends on naming them, not papering them over.

### 1. `knowledge_router_v2.py` DeepTwin routes

Three patient-scoped DeepTwin endpoints remain ungated. The file
is operator-marked off-limits. The audit ratchet stops at 3 until
the operator decides what to do with these endpoints (gate them,
deprecate them, restrict to research-only, etc.).

### 2. FDA SaMD classification

The scoping doc (#1121) is upstream of the existing predicate
analysis, Q-Sub draft, and IEC 62304 lifecycle templates. The
classification decision itself requires operator + qualified
regulatory counsel sign-off. Until that decision is made, the
existing templates remain templates.

### 3. Per-modality off-label acknowledgement

Today one off-label consent covers all future modalities for a
patient × clinician pair. Stricter alternative: one consent per
modality (rTMS / tDCS / CES / TPS / VNS / DBS independently).

Stricter is safer (each modality has a different risk profile);
permissive is less clinician friction. This is a product call,
not engineering. The `modality_slug` field is already carried on
every `ConsentRecord` so either direction is implementable; the
predicate filter is one line in `require_off_label_acknowledgement`
and one item in `_cdHasValidOffLabelConsent`'s predicate list.

---

## New conventions established by the wave

Memory-curated for future sessions:

* **Tenancy ratchet pattern** (#1080 → #1099 → #1102 → … → #1112)
  — audit script + workflow env var + static doc + scoped remediation
  PRs. Lets a legacy backlog land without blocking new work.
* **Parallel subagent batch remediation with worktree isolation**
  (#1106 / #1108 / #1110 / #1111) — 4 subagents in parallel, each
  in `isolation: "worktree"`, gated 68 routes across 25 files in one
  afternoon. Parent does the final coordination PR.
* **Five-layer safety surface pattern** (#1085 / #1095 / #1089 /
  #1093 / #1097 / #1115) — conservative default (web + backend) +
  service-layer enforcer + router gate + reactive frontend + proactive
  frontend. ALL FIVE required for credible enforcement.

These are recorded in `~/.claude/projects/-Users-aliyildirim/memory/`:
* `deepsynaps-cwos-must-haves-wave-2026-05-19.md`
* `deepsynaps-subagent-batch-remediation-pattern.md`

---

## How to use this doc

* As a hand-off when a session ends and a new one starts on this work.
* As a reference for the next module's go-live audit ("what did the
  CWOS-2026-05-19 wave actually deliver?").
* As the source of truth for the must-have status, NOT the original
  audit doc (which is a snapshot pinned to the moment of the audit).

The original audit at `CWOS_AUDIT_2026-05-19.md` remains unchanged —
it's the historical record. This closeout is the live status.
