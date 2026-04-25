# DeepSynaps Governance Pack

**Version:** 1.0.0  
**Lifted from:** `ALIYILD/[upstream-repo]` (public GitHub repository)  
**Sanitized:** All product-specific and proprietary branding removed (see CHANGELOG_FROM_UPSTREAM.md)  
**Date:** 2026-04-03

---

## What Is This Pack?

This governance pack provides the process scaffolding and evidence policy rules for the
**DeepSynaps Studio** platform. It defines how clinical evidence is sourced, classified,
reviewed, and audited; how conditions are onboarded; and how the QA and review lifecycle
operates.

The documents were lifted from the upstream public repository and sanitized for use in
DeepSynaps workstreams. No architecture documents specific to the upstream product were
included.

---

## What Was Lifted and Where It Came From

| Output File | Upstream Source Path |
|---|---|
| `docs/evidence_policy.md` | `docs/evidence_policy.md` |
| `docs/evidence_lifecycle.md` | `docs/evidence_lifecycle.md` |
| `docs/protocol_evidence_governance.md` | `docs/protocol-evidence-governance-policy.md` |
| `docs/safety_evidence_policy.md` | `docs/safety_evidence_policy.md` |
| `docs/override_promotion.md` | `docs/OVERRIDE_PROMOTION.md` |
| `docs/review_regeneration.md` | `docs/REVIEW_REGENERATION.md` |
| `docs/review_workflow.md` | `docs/review_workflow.md` |
| `docs/reviewer_workflow.md` | `docs/reviewer_workflow.md` |
| `docs/qa_lifecycle.md` | `docs/qa_lifecycle.md` |
| `docs/condition_onboarding.md` | `docs/condition_onboarding.md` |
| `config/evidence_rules.yaml` | `configs/evidence_rules.yaml` |
| `config/review_thresholds.yaml` | `configs/review_thresholds.yaml` |

---

## What Was Stripped

The following were removed or replaced throughout all files. The original strings are
recorded in CHANGELOG_FROM_UPSTREAM.md only in redacted form to avoid re-introducing
them here.

### Branding and product names
- All references to the upstream product name and its CLI tool name were replaced with
  **"DeepSynaps Studio"** and `deepsynaps-studio` respectively.
- All references to the upstream platform module path were replaced with
  `deepsynaps_studio`.
- All references to the upstream knowledge base path were replaced with `knowledge/`.
- Governance source attribution updated to "DeepSynaps Studio Governance Protocol".
- The upstream institution name ("Brain Center") was removed from all text.

### Proprietary network assessment architecture
The following sections were removed because they depend on a proprietary multi-network
assessment framework not applicable to DeepSynaps Studio:

- **Proprietary 6-Network Bedside Assessment** — the clinical document tied to a
  specific proprietary bedside assessment was removed from the Partners Tier document
  list in `docs/review_workflow.md`. Replaced with "Advanced Multi-Network Bedside
  Assessment" as a generic placeholder.
- **`[UP-PROP-FIELD]` field** — the `ConditionSchema` field was renamed to
  `network_rationale` in `docs/condition_onboarding.md` and the field reference table.
- **Proprietary protocol document names** — "All-in-One Protocol" and "Clinical
  Handbook" replaced the upstream-branded document names.
- **Partners tier description** — removed clauses referring to proprietary training
  certification requirements.
- **Fellow tier description** — removed references to the proprietary bedside
  assessment instrument.
- All code-level references to the proprietary field name as a named parameter in the
  condition template were replaced with `network_rationale`.

### Code-level references
- CLI command examples updated from `[upstream-cli] <command>` to
  `deepsynaps-studio <command>`.
- Import paths updated from `[upstream-module].*` to `deepsynaps_studio.*`.
- `ReviewManager` import path updated.
- All `PYTHONPATH=src python -m [upstream-module].cli.main` examples updated to
  `deepsynaps-studio`.
- Source attribution strings updated.

---

## What Was Kept

The following process scaffolding was preserved in full:

- Evidence level hierarchy and scoring rules
- Confidence labeling system and clinical language
- Review flag taxonomy
- Claim category taxonomy
- QA severity model (BLOCK / WARNING / INFO)
- QA rule modules and BLOCK-level rules
- Reviewer state machine (DRAFT → NEEDS_REVIEW → APPROVED → EXPORTED)
- Review-driven regeneration system (comment ingestion, change requests, safety gates)
- Override promotion workflow
- Evidence gap documentation process
- Condition onboarding workflow (intake → evidence sweep → draft → review → sign-off)
- Two-tier clinical review model (process logic, not product-specific document names)
- Off-label consent requirements
- Shared absolute contraindications
- Audit trail requirements
- Multi-source evidence search, deduplication, screening, and PRISMA pipeline config

---

## DeepSynaps Locked Rules

The following rules are hard-coded into DeepSynaps Studio and cannot be overridden
by reviewer action or configuration:

### Override Rate Auto-Demotion
- **Predictive documents:** Override rate > 25% → document auto-demotes to **ADVISORY** status.
- **Narrative documents:** Override rate > 40% → document auto-demotes to **ADVISORY** status.

These thresholds are configured in `config/review_thresholds.yaml` under
`override_demotion` and are enforced at the platform level.

### Audit Log Hash Chain
Every review state transition is recorded and hash-chained: each audit log entry
includes the cryptographic hash of the previous entry. No entry may be deleted or
altered retroactively. Configured in `config/review_thresholds.yaml` under
`audit_log.hash_chain_enabled: true`.

### `consent_version` on Every Consent Event
All audit events related to consent must carry a `consent_version` field referencing
the exact version of the consent template in effect at the time of the event.
Configured under `audit_log.consent_version_required: true`.

---

## How to Use This Pack

### For platform engineers
1. Review `docs/evidence_policy.md` and `docs/safety_evidence_policy.md` for the
   normative evidence rules that must be enforced in code.
2. Use `config/evidence_rules.yaml` as the canonical configuration for evidence level
   scoring, confidence thresholds, and PubMed search parameters.
3. Use `config/review_thresholds.yaml` for QA completeness thresholds, review triggers,
   and the locked override demotion thresholds.
4. Implement the hash-chain audit log and `consent_version` requirements before any
   clinical deployment.

### For clinical governance teams
1. `docs/review_workflow.md` defines when human review is mandatory and the two-tier
   model for supervised vs independent practice.
2. `docs/reviewer_workflow.md` defines the state machine and audit trail for each review.
3. `docs/override_promotion.md` defines the process for promoting recurring reviewer
   feedback into canonical platform knowledge.

### For condition authors
1. Follow `docs/condition_onboarding.md` step by step: intake → evidence sweep → draft
   schema → smoke test → QA → clinical review → sign-off.
2. `docs/evidence_lifecycle.md` explains how evidence is retrieved, ranked, and clustered.
3. `docs/qa_lifecycle.md` lists every QA rule and its severity.

---

## Verification

After any modification to this pack, run:

```bash
grep -ri -E "[prohibited-terms]" /path/to/deepsynaps_governance_pack/
# Where [prohibited-terms] = the two upstream brand strings listed in CHANGELOG_FROM_UPSTREAM.md
```

The result must be **empty**. Any match indicates residual upstream branding that must
be removed before the pack is used in production.
