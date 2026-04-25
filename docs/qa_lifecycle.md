# QA Lifecycle

## Overview

The QA engine validates every condition build against clinical safety and evidence rules before documents can be exported or approved.

## QA Engine (`qa/engine.py`)

`QAEngine` aggregates 6 rule modules:

| Module | Rules | Checks |
|--------|-------|--------|
| `CitationRules` | 5 | No references, missing PMIDs, placeholders, duplicates, minimum count |
| `SafetyRules` | 4 | No contraindications, no safety notes, off-label consent, exclusion criteria |
| `ModalityRules` | 4 | No protocols, TPS off-label flag, no targets, missing parameters |
| `PopulationRules` | 3 | No inclusion criteria, no phenotypes, no assessment tools |
| `LanguageRules` | 3 | Excessive certainty, missing confidence labels, placeholder text |
| `CompletenessRules` | 5 | Empty overview, pathophysiology, networks, evidence summary, brain regions |

## Severity Model

| Severity | Meaning | Count |
|----------|---------|-------|
| **BLOCK** | Critical — prevents export | 6 rules |
| **WARNING** | Needs attention — does not prevent export | 13 rules |
| **INFO** | Informational only | 5 rules |

### BLOCK-level rules (export-stopping)
1. `citations.no_references` — No references at all
2. `citations.placeholder` — Placeholder citations in text
3. `safety.no_contraindications` — No contraindications listed
4. `safety.no_safety_notes` — No safety notes
5. `modality.no_protocols` — No treatment protocols
6. `completeness.empty_overview` — Empty clinical overview
7. `language.placeholder_text` — Unreplaced placeholders

## Integration with Build Pipeline

```
Condition Build
    │
    ▼
QAEngine.run_condition_qa()
    │
    ├─► QAReport (always generated)
    │
    ├─► If enable_qa_blocking=True AND block_count > 0:
    │       └─► QABlockError raised (export halted)
    │
    └─► If override_qa_block=True:
            └─► Export proceeds with warnings logged
```

## QAReport Structure

```json
{
  "report_id": "qa-build-parkinsons-20260401120000",
  "condition_slug": "parkinsons",
  "issues": [...],
  "passed": true,
  "block_count": 0,
  "warning_count": 2,
  "info_count": 1
}
```

## CLI Usage

```bash
# Run QA on a single condition
deepsynaps-studio qa2 condition --condition parkinsons

# Run QA on all conditions
deepsynaps-studio qa2 all --format markdown --output-dir outputs/qa/
```
