# Clinical Safety Policy — DeepSynaps Agent Brain

This document is the contract between the Clinical Agent Brain and every AI
surface in DeepSynaps Studio. Anything in this file is a hard constraint;
anything that violates it is a regression.

## 1. No autonomous prescribing

The Agent Brain MUST NOT:
- recommend a stimulation protocol as the final clinical decision,
- recommend a medication or dose,
- generate a "patient is to receive…" instruction.

It MAY:
- list candidate protocols from the curated registry, with on/off-label and
  clinician-review flags surfaced verbatim.
- enumerate available report templates.

Routers MUST scan provider answers for forbidden phrases (see
`safety.FORBIDDEN_AUTONOMOUS_PHRASES`) and suppress on match.

## 2. Clinician review

Every provider response carries `requires_clinician_review`. This field is
`true` by default and is only `false` for purely operational responses
(`agent_memory` notes). Frontend pages MUST surface this field — typically
as the canonical disclaimer "Decision-support only · clinician review
required."

## 3. No diagnosis from AI alone

The Agent Brain MUST NOT generate diagnostic conclusions from imaging,
qEEG, video, voice, or biomarker data. The qEEG / MRI / video / voice
providers ship as placeholders precisely so they cannot accidentally claim
diagnostic capability.

When wired, those providers MUST:
- attach a `decision_support_only` safety flag,
- set `requires_clinician_review=true`,
- set `confidence` honestly (`low` is the default).

## 4. Citation requirements

`EvidenceProvider` declares `requires_citations=true`. The provider MUST:
- attach a citation row for every supporting paper/protocol returned,
- emit `pmid=null` / `doi=null` when the source row had no such ID, rather
  than fabricating one,
- list `insufficient_local_evidence` in `safety_flags` when no citations
  exist for a positive claim.

The router MUST NOT add citations after the fact. Citations are the
provider's responsibility.

## 5. PHI rules

- Only `PatientContextProvider` may touch patient records. Disabled by
  default. Even when enabled:
  - role must be in `clinician`/`reviewer`/`admin`/`supervisor`,
  - cross-clinic gate (`require_patient_owner`) must pass,
  - audit event written via `record_query` BEFORE the read.
- `AgentMemoryProvider` MUST reject any payload whose top-level keys match
  `safety.PHI_KEY_PATTERN`. Memory writes are operational notes only.
- Routers MUST NOT pass patient_id-bearing query bodies to providers that
  declare `contains_phi=false`.

## 6. Audit requirements

Providers with `requires_audit=true` (today: `agent_memory`,
`patient_context`) MUST trigger `audit.record_query` BEFORE the provider
runs. The audit row is written by the router so even a provider that raises
leaves a trail.

The audit row uses:
- `target_type="agent_brain_query"`,
- `action="agent_brain_query"`,
- `note=f"{provider_name}: {query[:240]}"`,
- the resolved `actor_id` and `role` from the existing `AuthenticatedActor`.

Audit failure is logged to the `security.cross_clinic` channel via
`agent_brain_audit_write_failed`. The user query is still served — denying
service on audit failure would create an availability cliff that is a worse
clinical safety profile than continuing with a logged failure.

## 7. Off-label handling

Per-protocol `On_Label_vs_Off_Label` is surfaced verbatim from
`protocols.csv`. When the Protocol Governance provider returns one or more
off-label protocols, `safety_flags` includes `off_label_protocol_in_results`.
Frontend pages MUST display this flag on the protocol row.

## 8. Research-only handling

Same shape as §7 with `research_only_protocol_in_results`. Pages MUST
display this flag and MUST NOT auto-include research-only protocols in
patient-facing copy.

## 9. Missing-evidence fallback

When no evidence supports a claim:
- the response uses the canonical `INSUFFICIENT_EVIDENCE_FALLBACK` text
  ("No sufficient local evidence was found. This section requires clinician
  review before use."),
- `citations` is empty (no fabricated PMID/DOI),
- `confidence` is `unknown`,
- `safety_flags` includes `insufficient_local_evidence`.

## 10. Patient-facing restrictions

`patient_facing_allowed` is `false` for every provider response in the MVP,
even where the underlying registry row carries `Patient_Facing_Allowed=true`.
The agent-brain layer never auto-clears patient-facing copy. Patient-facing
release of a piece of content is a separate, documented clinician sign-off.

## 11. Disclaimers that must appear verbatim

Pages MUST display these strings without paraphrasing:

- Insufficient evidence: *"No sufficient local evidence was found. This
  section requires clinician review before use."*
- DeepTwin / simulation: *"This is a hypothesis-generating simulation, not
  a diagnosis or treatment decision."*
- qEEG / MRI / video / voice: *"This AI output is decision-support only
  and must not be used as a standalone diagnostic conclusion."*

These are exported from `apps/api/app/services/agent_brain/safety.py` so
the source of truth is one place.

## 12. Test coverage

`apps/api/tests/test_agent_brain_safety.py` enforces the no-autonomous-claim
property by scanning every default provider response for forbidden phrases.
Adding a new provider that fabricates a forbidden phrase is a test failure
on the first PR run.
