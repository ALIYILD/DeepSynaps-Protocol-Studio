# Override Promotion System

**Date**: 2026-04-03

## What It Does

When reviewers repeatedly request the same kind of change across documents,
the promotion system detects the pattern and helps move it from a local
one-off override into the canonical source of truth.

## Three Kinds of Changes

| Kind | Scope | Where It Lives |
|------|-------|---------------|
| **Local override** | One document only | Applied as section content patch |
| **Canonical improvement** | All future documents | YAML knowledge / blueprint / shared rule |
| **Blocked / unsafe** | Cannot be auto-applied | Requires manual authoring |

## Promotion Workflow

```
Repeated reviewer overrides
    → detect_candidates()  — find patterns in revision history
    → create_proposal()    — structured proposal with impact analysis
    → approve / reject     — human decision with reviewer identity
    → apply_promotion()    — safe YAML patch with validation
    → optional regeneration of impacted outputs
```

## Promotability Policy

**Auto-promotable (with editorial approval):**
- Blueprint section/table/visual changes
- Shared governance wording improvements
- Rendering/style/tier policy improvements

**Requires clinical review:**
- Condition knowledge updates
- Contraindication changes
- Modality-specific treatment claims
- Protocol parameter changes

**Not promotable:**
- One-off document preferences
- Reviewer-specific language preferences
- Broad unclear rewrite demands
- Unsupported evidence requests

## CLI Commands

```bash
deepsynaps-studio promotion-detect              # Find reusable patterns
deepsynaps-studio promotion-propose <id>        # Create a proposal
deepsynaps-studio promotion-list                # List all proposals
```

## Safety

- Unapproved proposals cannot be applied
- Evidence-sensitive content requires clinical approval
- Dry-run mode shows impact without writing files
- YAML validation runs after every patch
- Full audit trail: candidate → proposal → approval → apply → regeneration
