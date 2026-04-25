# Review-Driven Regeneration System

**Date**: 2026-04-03

## How It Works

```
Reviewer Comments (text / JSON / sidecar)
          │
          ▼
  Comment Ingestion + Parsing
  (CommentNormalizer → classification + section mapping)
          │
          ▼
  Structured Change Requests
  (ChangeRequest with target_type, section, confidence)
          │
          ▼
  Change Plan (dry run / preview)
  (ChangePlan with impact analysis, safety gates)
          │
          ▼
  Controlled Regeneration
  (CanonicalDocumentAssembler with section overrides)
          │
          ▼
  New Document + Diff + Provenance + Review Record
```

## Key Principles

1. **Comments → structured changes, not free-form rewriting.**
   Every reviewer comment is parsed into a ChangeRequest with a target_type
   (section_override, blueprint_patch, knowledge_patch, etc.)

2. **One-document overrides vs canonical improvements.**
   - Section override: applies to this document only
   - Blueprint/knowledge patch: improves the canonical source for all future docs

3. **Evidence-sensitive changes are flagged.**
   Comments touching clinical claims, protocol parameters, or contraindications
   are marked `evidence_sensitive=True` and require manual approval.

4. **Regeneration goes through the canonical path.**
   The system does not free-write. It assembles from knowledge + blueprint
   with optional section overrides applied on top.

5. **Version history is preserved.**
   Every regeneration produces a new provenance sidecar linking back to the
   previous version and the change plan that produced it.

## Models

- `ReviewComment`: one reviewer note (raw_text, section, category, severity)
- `ReviewCommentSet`: collection of comments for one document
- `ChangeRequest`: structured change (target_type, action, confidence, safety flags)
- `ChangePlan`: inspectable plan before regeneration (impact, blocked items, warnings)
- `RegenerationResult`: output of regeneration (old/new versions, diff, applied changes)

## Safety Rules

- Cannot fabricate evidence or PMIDs
- Protocol parameter changes are evidence-sensitive
- Contraindication changes require manual approval
- Broad "rewrite everything" comments are decomposed or blocked
- Approval is invalidated if substantive changes are applied
- Output must pass canonical readiness/QA/governance checks
