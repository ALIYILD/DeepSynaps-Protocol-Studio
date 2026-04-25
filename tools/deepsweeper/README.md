# DeepSweeper

This directory is a vendored DeepSweeper kit inside the DeepSynaps Studio repo.
It now includes the imported upstream `clawsweeper` core, adapted for
DeepSynaps-specific guardrails, multi-repo config, audit logging, and
repo-scoped artifact directories under `items/<owner__repo>/` and
`closed/<owner__repo>/`.

Conservative maintainer bot for DeepSynaps Studio repositories. Forks [openclaw/clawsweeper](https://github.com/openclaw/clawsweeper) and adds a regulated-component guardrail, audit-log integration, and multi-repo sweep.

DeepSweeper reviews open issues and PRs across the DeepSynaps repos, writes one regenerated markdown record per open item, and closes only when the evidence is strong AND the item does not touch a regulated component.

## Allowed close reasons

- `implemented_on_main` — current `main` already implements or fixes the request
- `cannot_reproduce` — no longer reproduces against current `main`
- `studio_marketplace` — useful idea, belongs as a Studio Marketplace plugin/skill
- `incoherent` — too unclear to be actionable
- `stale_insufficient_info` — issue >60 days old with insufficient data

Everything else stays open.

## Hard guardrails (non-negotiable)

1. **Regulated component check** — any item touching `apps/qeeg-analyzer/`, `apps/mri-analyzer/`, `apps/brain-twin/`, `packages/encoders/`, `packages/fusion/`, `packages/audit/`, `packages/drift/`, `packages/event-bus/`, `packages/feature-store/`, `schemas/`, `**/protocols/**`, or any file matching the keywords list (FDA, IEC 62304, ISO 13485, PHI, HIPAA, GDPR, consent, etc.) is auto-kept-open. Configurable in `config/regulated-paths.yaml`.

2. **Maintainer-authored exclusion** — items where the GitHub author association is `OWNER`, `MEMBER`, or `COLLABORATOR` are never auto-closed.

3. **Audit chain** — every close and keep-open decision emits an audit record to `audit-log.ndjson` with hash chaining (sha256 over canonical JSON, `hashPrev` linkage). Verifiable via `npm run verify-audit`. This satisfies IEC 62304 SOUP audit-trail requirements.

4. **Defense-in-depth** — the prompt instructs the model to keep_open regulated items, AND the apply phase re-checks before posting any close. Either layer catching it keeps the item open.

5. **Per-repo apply policy** — regulated repos are configured `apply_closures: false` in `config/target-repos.yaml`. They get reviewed and recorded but never auto-closed; humans review the markdown records and close manually.

## Repo layout

```
deepsweeper/
├── README.md                                 # This file
├── package.json                              # Node 24+, TypeScript Native Preview
├── tsconfig.json
├── prompts/
│   └── review-item.md                        # Prompt sent to Codex
├── schema/
│   └── deepsweeper-decision.schema.json      # Strict JSON Schema (regulatedComponentTouched required)
├── config/
│   ├── regulated-paths.yaml                  # Allow-list of paths and keywords that block auto-close
│   └── target-repos.yaml                     # Repos to sweep + per-repo apply policy
├── src/
│   ├── deepsweeper.ts                        # Main bot (forked from clawsweeper.ts, see patches/)
│   ├── regulated.ts                          # Regulated-component check + guardrail
│   ├── audit.ts                              # Hash-chained audit log
│   ├── repos.ts                              # Multi-repo loader
│   └── tests/                                # node:test unit tests
├── patches/
│   └── clawsweeper.diff                      # Upstream diff to re-apply on upstream bumps
├── docs/
│   ├── ADOPTION.md                           # How to bring this into your org
│   ├── REGULATORY_MAPPING.md                 # IEC 62304 / ISO 13485 / GDPR mapping
│   └── DIFF_FROM_CLAWSWEEPER.md              # Side-by-side diff with upstream
├── .github/workflows/
│   └── sweep.yml                             # Daily 06:17 UTC schedule
└── audit-log.ndjson                          # Append-only hash chain (committed)
```

## How a sweep runs

1. **list-repos** — read `config/target-repos.yaml`, expand to a workflow matrix
2. **plan** — for each repo, list open items, decide which need (re-)review based on cadence + freshness
3. **review** — sharded across N workers, each shard runs Codex on a batch of items with the prompt and schema. Read-only checkout of the target repo. Each decision goes through `regulated.ts` even if Codex says close.
4. **apply-artifacts** — collect all `items/*.md` records, commit them
5. **apply-decisions** — for repos where `apply_closures=true`, post comments and close items where `canClose(decision) === true`. Every close emits `deepsweeper.close` audit record. Every keep-open emits `deepsweeper.keep_open`.
6. **verify-audit** — runs after every apply, validates the chain end-to-end
7. **dashboard** — refresh README metrics

## Quickstart

```bash
git clone https://github.com/<your-org>/deepsweeper
cd deepsweeper
npm ci
npm run build
npm test
npm run verify-audit                  # validates audit-log.ndjson chain
npm run list-repos                    # prints configured repo matrix
npm run status -- --repo deepsynaps/studio
```

To inspect the vendored status:

```bash
npm run status
```

To configure for your repos:
1. Edit `config/target-repos.yaml` — list your repos and per-repo apply policy
2. Edit `config/regulated-paths.yaml` — adjust paths and keywords
3. Adjust `prompts/review-item.md` if your scope anchor differs from `docs/SCOPE.md`
4. Set GitHub secrets: `DEEPSWEEPER_GITHUB_TOKEN` (PAT with repo + issues + pull-requests scope) and `DEEPSWEEPER_OPENAI_API_KEY`

## GitHub Actions in this repo

The runnable root workflows are:

- `.github/workflows/deepsweeper-sweep.yml` - scheduled/manual sweep runner
- `.github/workflows/deepsweeper-validate.yml` - build/test/check validation for the vendored tool

Recommended first run:

```text
workflow_dispatch
target_repo=deepsynaps/studio
apply_closures=false
apply_existing=false
```

Start with a dry review-only run on one repo, inspect `tools/deepsweeper/items/`,
then enable `apply_closures` only after the outputs look correct.

## Differences from upstream ClawSweeper

See [docs/DIFF_FROM_CLAWSWEEPER.md](docs/DIFF_FROM_CLAWSWEEPER.md). Headlines:

- **New schema field** `regulatedComponentTouched` (required, conditional schema rule blocks close when true)
- **New keep-open reason** `regulated_component`
- **Renamed close reason** `clawhub` → `studio_marketplace`
- **Multi-repo sweep** via `config/target-repos.yaml`
- **Audit chain** on every decision
- **Daily cron** instead of hourly (06:17 UTC)
- **Per-repo apply policy** — regulated repos default to review-only
- **Stricter prompt** — regulated-component guardrail is the first check, before any other criterion

## What this is not

- Not a clinical decision-support system. It manages issues and PRs, not patients.
- Not a replacement for human maintainer judgment on regulated components.
- Not connected to the patient-facing audit log. Its audit chain is a separate stream (`deepsweeper.*` event types) that satisfies SOUP records but does not mix with PHI.

## License

Internal-only, private. The underlying ClawSweeper source carries its own license — see [openclaw/clawsweeper](https://github.com/openclaw/clawsweeper).
