# Regulatory document scaffolding

**These are scaffolding templates, NOT submission-ready documents. Each requires review by qualified regulatory counsel before any filing.**

## Scope

- [SaMD scoping](./samd-scoping.md) — **Upstream** of the other docs. Lays out the FDA SaMD framework, the IMDRF four-tier risk matrix, and DeepSynaps's positioning under each. Decision-support artifact for CWOS audit must-have #4. Read this first if the SaMD classification has not been made yet.
- [Q-Submission draft](./q-submission-draft.md) — FDA Pre-Submission meeting request template for the Protocol Studio software device
- [IEC 62304 lifecycle](./iec-62304-lifecycle.md) — Software lifecycle process template mapped to IEC 62304:2006/A1:2015 clause numbering
- [Predicate analysis](./predicate-analysis.md) — 510(k) substantial equivalence predicate analysis template

## What "scaffolding" means here

- Structured headings are present so nothing is forgotten when real content is inserted
- `[TBD: <role>]` markers appear everywhere a regulatory or legal claim would live
- Repo evidence (file paths, test names, deploy artefacts) is cited where it already exists in this codebase
- No claims are invented; no facts are assumed
- No fee amounts or submission dates are promised

## TBD owner legend

| Tag | Role |
|-----|------|
| `[TBD: regulatory consultant]` | External qualified regulatory affairs consultant |
| `[TBD: clinical lead]` | Responsible clinical investigator or medical director |
| `[TBD: clinical safety officer]` | Clinical safety officer accountable for the risk file |
| `[TBD: quality manager]` | Quality management system owner |
| `[TBD: software lead]` | Lead software engineer / SOUP inventory owner |
| `[TBD: data protection officer]` | DPO accountable for GDPR/UK GDPR compliance |
| `[TBD: CEO/sponsor]` | Dr Ali Yildirim as regulatory sponsor and signing authority |

## Related existing docs

- [DPIA draft](../compliance/DPIA-draft.md)
- [Safety evidence policy](../safety_evidence_policy.md)
- [Protocol Studio safety governance report](../ai-audits/PROTOCOL_STUDIO_SAFETY_GOVERNANCE_REPORT.md)
- [Protocol Studio AI safety report](../ai-audits/PROTOCOL_STUDIO_AI_SAFETY_REPORT.md)
- [QEEG regulatory audit](../../QEEG_REGULATORY_AUDIT.md)
- [FDA product codes](../fda-product-codes.md)

## How to update

- Do not remove a `[TBD]` marker without an authoritative source to replace it
- Replace a `[TBD]` with a citation (document reference, standard clause, clinical study), not a guess
- Have qualified regulatory counsel sign off on any section before it appears in an external filing
