# Protocol Evidence Governance Policy (Source of Truth)

This repository enforces evidence governance for all protocol and long-form clinical document generation in DeepSynaps Studio.

## Status

This document is the **stable, canonical link target** for "protocol evidence governance policy" references
in DeepSynaps workstreams.

## Normative policy documents

The rules are defined in the following documents and must be followed **exactly**:

- `docs/evidence_policy.md`
  - Evidence level hierarchy (`EvidenceLevel`)
  - **Real PMIDs only** (no fabricated or placeholder citations)
  - Confidence labels and review flag triggers
  - Off-label marking and consent requirements
- `docs/safety_evidence_policy.md`
  - QA blocking rules ("QA BLOCK")
  - Contradiction handling rules
  - Audit/traceability requirements

If there is any conflict between this wrapper and the documents above, **the documents above win**.

## Where policy is enforced in code (high-level)

- **Schema validation / formatting**: `src/deepsynaps_studio/schemas/*`
- **QA blocking & review flags**: `src/deepsynaps_studio/qa/*`
- **Canonical generation orchestration**: `src/deepsynaps_studio/generation/service.py`
- **Knowledge governance rule text** (consent/off-label language templates): `knowledge/shared/governance_rules.yaml`
