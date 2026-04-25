# DeepSweeper — diff from upstream ClawSweeper

Side-by-side summary of every change DeepSweeper applies on top of [openclaw/clawsweeper](https://github.com/openclaw/clawsweeper). Use this when re-merging upstream changes.

## Files added

| File | Purpose |
|---|---|
| `src/regulated.ts` | Regulated-component check (path globs + keyword scan + guardrail) |
| `src/audit.ts` | Hash-chained audit log emitter and verifier |
| `src/repos.ts` | Multi-repo target loader |
| `src/tests/regulated.test.ts` | 8 unit tests for regulated guardrail |
| `src/tests/audit.test.ts` | Chain integrity + tamper detection tests |
| `config/regulated-paths.yaml` | Path globs + keywords that block auto-close |
| `config/target-repos.yaml` | Repos to sweep + per-repo apply policy |
| `docs/ADOPTION.md` | How to stand this up on your org |
| `docs/REGULATORY_MAPPING.md` | IEC 62304 / ISO 13485 / EU AI Act / GDPR / HIPAA mapping |
| `docs/DIFF_FROM_CLAWSWEEPER.md` | This file |
| `patches/clawsweeper.diff` | Source diff for re-merging upstream |

## Files renamed

| Upstream | DeepSweeper |
|---|---|
| `src/clawsweeper.ts` | `src/deepsweeper.ts` |
| `schema/clawsweeper-decision.schema.json` | `schema/deepsweeper-decision.schema.json` |

## Schema changes

### Renamed enum values

| Field | Upstream | DeepSweeper |
|---|---|---|
| `closeReason` enum | `clawhub` | `studio_marketplace` |

### New required fields

| Field | Type | Purpose |
|---|---|---|
| `keepOpenReason` | enum | Why we keep open (regulated_component, real_bug, plausible_feature, …) |
| `regulatedComponentTouched` | boolean | Set by guardrail; if true, blocks close |
| `regulatedComponentPaths` | array<string> | Specific paths from allow-list that triggered the flag |

### New conditional rules

```json
"allOf": [
  { "if": { "properties": { "decision": { "const": "close" } } },
    "then": { "properties": {
      "regulatedComponentTouched": { "const": false },
      "confidence": { "const": "high" },
      "keepOpenReason": { "const": "none" }
    }}},
  { "if": { "properties": { "regulatedComponentTouched": { "const": true } } },
    "then": { "properties": {
      "decision": { "const": "keep_open" },
      "keepOpenReason": { "const": "regulated_component" }
    }}}
]
```

## Prompt changes

The prompt (`prompts/review-item.md`) adds:

1. A new top-priority section "Regulated-component guardrail" before any other criterion
2. Renames `clawhub` close reason → `studio_marketplace`
3. Replaces `VISION.md` scope anchor with `docs/SCOPE.md`
4. Replaces `https://docs.openclaw.ai` with `https://docs.deepsynaps.com`
5. Replaces `https://clawhub.ai/` with `https://marketplace.deepsynaps.com`
6. Adds explicit list of regulatory keywords (FDA, IEC 62304, ISO 13485, PHI, HIPAA, GDPR, consent, etc.)

The maintainer-authored exclusion section is unchanged from upstream — already correct.

## Source changes (`src/deepsweeper.ts` vs upstream `src/clawsweeper.ts`)

See `patches/clawsweeper.diff`. Headlines:

| Concern | Upstream | DeepSweeper |
|---|---|---|
| Target repo | Hard-coded `openclaw/openclaw` constant | Loaded from `config/target-repos.yaml`, multi-repo |
| Report repo | Hard-coded `openclaw/clawsweeper` | Loaded from config |
| Docs URL | Hard-coded `https://docs.openclaw.ai` | Loaded from config |
| Marketplace URL | Hard-coded `CLAWHUB_URL = "https://clawhub.ai/"` | Loaded from config as `MARKETPLACE_URL` |
| `ALLOWED_REASONS` | includes `clawhub` | includes `studio_marketplace` |
| `closeReasonText` | `"belongs on ClawHub"` | `"belongs on Studio Marketplace"` |
| `defaultCloseComment` | links ClawHub | links Studio Marketplace |
| `canClose` | confidence=high + allowed reason | + `!decision.regulatedComponentTouched` |
| `applyDecision` | direct close call | re-runs `evaluateRegulated`, calls `enforceRegulatedGuardrail`, then `emitAuditRecord` for both close and keep-open paths |
| `main` | single-repo loop | iterates `selectRepos(TARGET_CONFIG, filter)` |

## Workflow changes (`.github/workflows/sweep.yml`)

| Concern | Upstream | DeepSweeper |
|---|---|---|
| Cron | `17 * * * *` (hourly) | `17 6 * * *` (daily, 06:17 UTC) |
| Shard count default | 40 | 10 |
| Apply limit default | 20 | 20 (unchanged) |
| Apply min age default | 0 | 14 |
| New input | — | `target_repo` (filter to one repo) |
| Matrix | single repo | matrix over `config/target-repos.yaml` |
| New step | — | `verify-audit` runs before `apply-decisions` |
| New step | — | Audit log committed in `apply-artifacts` and `apply-decisions` jobs |
| Secrets | `OPENAI_API_KEY`, `GH_TOKEN` | `DEEPSWEEPER_OPENAI_API_KEY`, `DEEPSWEEPER_GITHUB_TOKEN` |

## CLI changes

New commands:
- `list-repos --filter "owner/name"` — outputs the workflow matrix
- `verify-audit` — runs `verifyChain()` on `audit-log.ndjson`

Existing commands (`plan`, `review`, `apply-artifacts`, `apply-decisions`, `reconcile`, `dashboard`, `status`) take a new `--repo owner/name` argument so a single binary can sweep any repo in the config.

## Tests added

| Test | Coverage |
|---|---|
| `regulated.test.ts` | Path glob match, keyword scan, guardrail rewrite, pass-through |
| `audit.test.ts` | Chain integrity across N records, tamper detection at index 0 |

Both run via `npm test` (Node test runner). 0 dependencies beyond the standard library and `yaml`.
