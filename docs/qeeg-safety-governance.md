# qEEG Safety & Governance Policy

## Decision-Support Only Doctrine

Every qEEG feature in this platform is **decision-support only**. No AI output may be used as a standalone diagnosis, treatment plan, or clinical decision. All outputs require review by a licensed clinician.

## Blocked Language (Claim Governance)

The following patterns are automatically blocked from AI narratives and patient-facing reports:

| Pattern | Example | Block Reason |
|---------|---------|-------------|
| Diagnosis claims | "diagnoses ADHD" | Only clinicians diagnose |
| Confirmation claims | "confirms autism" | qEEG cannot confirm conditions |
| Proof claims | "proves depression" | Neurophysiology is correlational |
| Guarantee claims | "guarantees treatment response" | Outcomes are individual |
| Cure claims | "cures anxiety" | No cure claims allowed |
| Disease-modifying | "disease-modifying effect" | Unapproved efficacy language |
| FDA implies efficacy | "FDA approved so it works" | Misleading regulatory inference |
| No side effects | "no side effects" | Unsafe absolute statement |
| Treatment recommendation | "treatment recommendation" | Only clinicians recommend |
| Probability of disease | "probability of disease" | qEEG gives similarity indices, not probabilities |

## Banned Words (Global Scan)

The following words trigger automatic flagging in any clinical-facing output:
- diagnose
- diagnostic
- diagnosis
- probability of disease

## State Machine & Export Gating

```
DRAFT_AI
  → NEEDS_REVIEW (clinician sends for review)

NEEDS_REVIEW
  → APPROVED (clinician approves)
  → REJECTED (clinician rejects)
  → REVIEWED_WITH_AMENDMENTS (clinician edits)

REVIEWED_WITH_AMENDMENTS
  → APPROVED
  → NEEDS_REVIEW (send back)

APPROVED
  → REJECTED (admin override only)

REJECTED
  → NEEDS_REVIEW (re-submit)
```

**Export rules:**
- Patient-facing report: requires `APPROVED` or `REVIEWED_WITH_AMENDMENTS`
- BIDS export: requires `APPROVED` **and** `signed_by` present

## PHI Protection

- No patient names in document titles, URLs, browser history, or logs
- BIDS export uses SHA256 pseudonyms (`sub-{hash[:8]}`)
- Timeline never exposes `original_filename`
- `patient_facing_report_json` is generated server-side; no raw AI narrative exposed to patients

## Evidence Grades

| Grade | Meaning | Required Action |
|-------|---------|----------------|
| A | RCT or systematic review | Standard of care |
| B | Cohort or case-control | Clinician discretion |
| C | Case series or expert opinion | Enhanced consent |

## Off-Label Flag

Any protocol fit where the indication is not the FDA/CE-marked primary indication is flagged as `off_label_flag=true` and requires explicit clinician acknowledgment.

## Audit Trail

Every state transition, finding update, and sign-off is recorded in `qeeg_report_audits` with:
- actor_id, actor_role
- previous_state → new_state
- timestamp (immutable)
- optional clinician note

Audit records cannot be modified or deleted.
