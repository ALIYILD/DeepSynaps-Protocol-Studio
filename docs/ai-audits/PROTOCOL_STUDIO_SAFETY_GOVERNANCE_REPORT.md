## Protocol Studio — Safety / Governance / Off-Label Report (Agent 6)

### Executive summary
DeepSynaps already contains strong governance building blocks (role gating, PHI-safe logging, clinician review state machines, audit trail infrastructure). Protocol Studio should reuse these patterns to enforce:
- **Clinician decision-support only** labeling for all drafts.
- **No approval without clinician review**, and **off-label explicit acknowledgement**.
- **Research-only cannot be approved as treatment**.
- **Contraindication checks** must run before output and must block/require review when high-risk or incomplete.
- **Audit events** for search/generate/view/export/review/approve/reject with PHI-minimizing payloads.

### Scope inspected (key references)
- Governance policy docs:
  - `docs/protocol_evidence_governance.md`
  - `docs/protocol-evidence-governance-policy.md`
- Auth/RBAC + tenant isolation:
  - `apps/api/app/auth.py` (`require_minimum_role`, `require_patient_owner`)
- Review state machine precedents:
  - `apps/api/app/services/qeeg_clinician_review.py`
  - `apps/api/app/services/mri_clinician_review.py`
- Contraindication/off-label precedent (MRI targeting governance):
  - `apps/api/app/services/mri_protocol_governance.py`
- Audit trail + review action logging:
  - `apps/api/app/services/audit.py`
  - `apps/api/app/services/review.py`
  - `apps/api/app/persistence/models/audit.py`
- PHI-safe request logging/sanitization:
  - `apps/api/app/services/log_sanitizer.py`
- Existing saved protocol draft persistence (baseline for workflow):
  - `apps/api/app/routers/protocols_saved_router.py`

---

## Existing governance controls (what we can reuse)

### 1) Role gating / RBAC
`apps/api/app/auth.py` defines role ordering and provides `require_minimum_role(actor, ...)`.
Recommendation:
- Draft creation/generation: minimum `clinician`
- Review/approve/reject: minimum `reviewer` or `clinician` depending on org policy; keep `admin` override
- Admin-only reversal of an approval (matches MRI/qEEG pattern)

### 2) State machines for clinician review
Both MRI and qEEG report review services implement explicit `VALID_TRANSITIONS` and log PHI-safe transition metadata.
Recommendation: implement a similar explicit workflow for Protocol Studio drafts.

### 3) PHI-safe logging and telemetry controls
`log_sanitizer.py` is a strong defense-in-depth layer (path redaction and body dropping for patient-scoped routes). Protocol Studio endpoints should be included in the “patient-scoped route” list if they include `patient_id` in path.

---

## Proposed Protocol Studio draft governance model

### Draft statuses (server-authoritative)
Use an explicit state machine (mirrors qEEG/MRI patterns). Suggested states:
- `DRAFT`
- `SUBMITTED_FOR_REVIEW`
- `NEEDS_CHANGES`
- `APPROVED` (internal “practice-approved” only; never equate to regulatory approval)
- `REJECTED`

Important: treat “research-only” as a **computed block** rather than a state transition if possible (prevents inconsistent state).

### Valid transitions (example)
- `DRAFT` → `SUBMITTED_FOR_REVIEW`
- `SUBMITTED_FOR_REVIEW` → `APPROVED` | `REJECTED` | `NEEDS_CHANGES`
- `NEEDS_CHANGES` → `SUBMITTED_FOR_REVIEW`
- `APPROVED` → `REJECTED` (admin only, if reversals are allowed)

### Off-label acknowledgement (hard gate on approval)
If a draft is off-label, approval requires explicit acknowledgement:
- Approval request must include `off_label_acknowledged=true`
- Record acknowledgement metadata:
  - `acknowledged_at`, `acknowledged_by_actor_id`, `ack_version`
  - Avoid storing free-text in audit logs

### Research-only restriction (hard block)
If a draft is tagged `research_only`:
- It **cannot** transition to treatment approval.
- Export/activation must be blocked or limited to “research template” exports (if implemented explicitly).

### Contraindication/safety checks
Implement a preflight that returns structured outcomes:
- `safe_to_review`
- `needs_more_data`
- `contraindication_found`
- `off_label_requires_review`
- `research_only_not_prescribable`

Enforcement recommendations:
- Generation can produce a “blocked_requires_review” draft response instead of returning parameters.
- Approval requires that there are no hard contraindication blocks, or requires an admin override with reason code (if governance allows).

---

## Proposed endpoints (Protocol Studio governance)

These match the mission request; the implementation should reuse existing auth + audit patterns:
- `POST /api/v1/protocol-studio/drafts/{draft_id}/review`
- `POST /api/v1/protocol-studio/drafts/{draft_id}/approve`
- `POST /api/v1/protocol-studio/drafts/{draft_id}/reject`

Hard requirements:
- Approve requires clinician/reviewer/admin role.
- Off-label requires explicit acknowledgement.
- Research-only cannot be approved for treatment.
- All actions emit audit events (PHI-safe).

---

## Audit events (PHI-safe) — recommended set

### Search / view / generation
- `protocol_studio.search`
- `protocol_studio.evidence.view`
- `protocol_studio.protocol.view`
- `protocol_studio.generate.requested`
- `protocol_studio.generate.completed`
- `protocol_studio.generate.blocked` (include reason codes only)

### Draft lifecycle + governance
- `protocol_studio.draft.created`
- `protocol_studio.draft.updated` (store changed-field names only)
- `protocol_studio.draft.submitted_for_review`
- `protocol_studio.draft.needs_changes`
- `protocol_studio.draft.approved`
- `protocol_studio.draft.rejected`
- `protocol_studio.draft.off_label_acknowledged` (include `ack_version`)
- `protocol_studio.draft.research_only_blocked`
- `protocol_studio.draft.contraindication_blocked` (reason codes)

### Export
- `protocol_studio.export.requested`
- `protocol_studio.export.completed`
- `protocol_studio.export.blocked`

### PHI minimization rules for audit payload
- Store: `draft_id`, `patient_id` (or a stable internal ref), `actor_id`, `actor_role`, `clinic_id`, `action`, `timestamp`
- Store: counts (evidence count, contraindication count), and reason codes
- Do NOT store: raw clinical notes, raw patient text, or full protocol parameters in audit rows

---

## Risks / open decisions
- **Role model for approval**: whether `clinician` can self-approve, or must be `reviewer`/second clinician.
- **“Approved” wording**: ensure UI/API always qualifies as internal/practice governance and never implies regulatory approval.
- **Research-only representation**: computed block vs explicit state.

