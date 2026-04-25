# Safety & Evidence Policy

## Non-Negotiable Rules

1. **Never fabricate PMIDs**, journals, outcomes, sample sizes, or clinical conclusions.
2. **Never allow unsupported recommendations** to appear as established guidance.
3. **Every section** must be traceable to evidence, QA, and build metadata.
4. **If evidence is weak**, say weak. Use the confidence label "Consensus-informed (limited evidence):"
5. **If evidence is insufficient**, emit "⚠ Requires clinical review — evidence insufficient:" rather than filling gaps.
6. **Do not silently change shared schemas.** Schema changes must be backwards-compatible or versioned.

## Confidence Labels

| Label | Condition | Clinical Language |
|-------|-----------|-------------------|
| `high_confidence` | Mean score ≥ 3.5, ≥ 2 sources | "Evidence-based:" |
| `medium_confidence` | Mean score ≥ 3.0 | "Supported by emerging evidence:" |
| `low_confidence` | Mean score ≥ 2.0 | "Consensus-informed (limited evidence):" |
| `insufficient` | Mean score < 2.0 or no sources | "⚠ Requires clinical review — evidence insufficient:" |
| `review_required` | Contradictions or flags | "⚠ REVIEW REQUIRED:" |

## Off-Label Usage

All neuromodulation administered via DeepSynaps Studio is **off-label** except:
- TPS (NEUROLITH®) for Alzheimer's disease (CE-marked)
- CES (Alpha-Stim®) for anxiety, depression, insomnia (FDA-cleared)

Off-label targets must have:
- `off_label: true` in StimulationTarget
- `consent_required: true`
- Explicit safety notes
- QA flags if consent flag is missing

## QA BLOCK Rules

These rules **halt export** when `enable_qa_blocking` is True:
- No references at all
- Placeholder citations in text
- No contraindications listed
- No safety notes
- No treatment protocols
- Empty clinical overview
- Unreplaced placeholder text

## Contradiction Handling

When evidence contradicts:
1. Both supporting and contradicting PMIDs are recorded
2. `has_contradictions: true` set on the evidence bundle
3. QA generates a WARNING issue
4. Section marked `requires_review: true`
5. Clinical reviewer must decide which evidence to follow

## Audit Requirements

Every generated document must have:
- Build manifest with content hash
- Evidence snapshot reference
- QA report reference
- Review state tracking (when reviewer workflow enabled)
