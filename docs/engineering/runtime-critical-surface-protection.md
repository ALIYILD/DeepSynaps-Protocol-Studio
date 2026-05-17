# Runtime-critical surface protection

A list of surfaces in this repo where additive-only discipline is mandatory and any other change requires explicit task ownership.

Companion docs: [`pr-hygiene-and-drift-disclosure.md`](./pr-hygiene-and-drift-disclosure.md), [`salvage-pr-governance.md`](./salvage-pr-governance.md).

## Why this matters

This repo serves clinicians making real decisions for real patients. A silent regression in the qEEG pipeline, the evidence DB lookup, the scheduling engine, or the safety-governance layer is not just a bug — it can put patients at risk. The "additive-only on critical surfaces" rule exists because additive changes are reversible and observable; in-place rewrites of critical surfaces are not.

This doc lists the surfaces, the reason each is critical, and what kinds of changes are safe vs unsafe.

## Surface list

### Clinical safety & evidence layer

| Surface | Files / dirs | Why critical |
|---------|--------------|--------------|
| qEEG safety governance | `docs/qeeg-safety-governance.md`, `docs/safety_evidence_policy.md`, `apps/api/app/services/qeeg_*` | Banned-language enforcement, claim governance, evidence policy |
| Evidence DB read path | `~/DeepSynaps-Protocol-Studio/.../neuromodulation_evidence_*.db` (read-only), evidence routers | Clinician-facing evidence lookups; bad reads = wrong protocol suggestions |
| Protocol evidence governance | `docs/protocol_evidence_governance.md`, `docs/protocol-evidence-governance-policy.md` | Defines what counts as evidence, who promotes, how overrides work |
| Agent brain | `apps/api/app/services/agent_brain/`, `/api/v1/agent-brain/*` | Grounded context for all AI agents; broken grounding = fabricated citations |
| qEEG report contract | `apps/api/app/services/qeeg_report_template.py` (`QEEGBrainMapReport`) | Canonical shape for all qEEG output |
| AI Brain Age / brain-balance / unevidenced features | `docs/qeeg-evidence-gaps.md` (memory `deepsynaps-qeeg-evidence-gaps`) | Already gated/removed; do not re-introduce without published evidence |

**Safe changes:** documentation, new tests, additive new policy entries with citations.
**Unsafe without explicit task:** modifying banned-language patterns, changing report shape fields, weakening tenant gates.

### API contract layer

| Surface | Files / dirs | Why critical |
|---------|--------------|--------------|
| MRI report contract | `packages/mri-pipeline/portal_integration/api_contract.md`, `MRIReport` Pydantic | Field meanings cannot change without versioning + migration |
| Router BaseModel lint | All `apps/api/app/routers/*.py` Pydantic models | `BaseModel` + `model_config = ConfigDict(...)` convention; regressions caught by lint |
| Router no-models lint | Direct SQLAlchemy model imports in routers | Pattern shared by 5+ existing routers; lint flags new offenders |
| Cross-clinic tenancy gates | `_gate_patient_access(actor, patient_id, db)` callers | IDOR mitigation; every patient-data endpoint must gate |
| Authenticated actor / role gates | `app.auth.get_authenticated_actor`, `require_minimum_role` | Auth contract for all routers |

**Safe changes:** new endpoint that follows the conventions, new fields added at the END of an existing model (not in the middle, not renamed).
**Unsafe without explicit task:** renaming fields, changing field types, removing fields, removing gates, "simplifying" auth dependency chains.

### Persistence & migrations

| Surface | Files / dirs | Why critical |
|---------|--------------|--------------|
| Alembic migrations | `apps/api/alembic/versions/*.py` | Once landed, can't be deleted; merge migrations are normal (see `deepsynaps-alembic-auto-merge-normal`) |
| ORM model `__init__.py` re-exports | `apps/api/app/persistence/models/__init__.py` | Touched by everyone; conflict risk high |
| Postgres/SQLite parity | Bool defaults, tz-aware datetimes (see `deepsynaps-alembic-sqlite-postgres-bool-default`, `deepsynaps-sqlite-tz-naive`) | SQLite tolerates, Postgres rejects → Fly release_command aborts silently |

**Safe changes:** new additive migration with `server_default=sa.false()/true()` (never `sa.text("0")`), new ORM model that doesn't touch the existing re-export ordering.
**Unsafe without explicit task:** modifying existing migrations, deleting migrations, changing FK targets, "fixing" multi-head states without going through the documented auto-merge path.

### Scheduling, courses, monitoring

| Surface | Files / dirs | Why critical |
|---------|--------------|--------------|
| Scheduling engine | `apps/api/app/services/scheduling/`, `apps/web/src/pages-scheduling-hub.js` | Clinician calendar; double-booking, missed sessions = clinical impact |
| Course lifecycle | Treatment courses routers + UI | Patient care plans; cannot lose state mid-treatment |
| Monitoring & wearables | Monitor-hub, wearables routers | Real-time clinical observation surfaces |
| Adverse events | AE routers + UI | Regulatory / safety reporting |

**Safe changes:** UI copy, new analytics tabs, additive new endpoints, new tests.
**Unsafe without explicit task:** changing how sessions are scheduled, modifying course-state transitions, altering AE submission paths.

### Frontend overlay surface (concurrent-edit hotspot)

| Surface | Files / dirs | Why hotspot |
|---------|--------------|-------------|
| AI Agents page | `apps/web/src/pages-agents.js` | Multiple overlays (toolOverlay, hireOverlay, marketplace modal, wizard variants); active concurrent edits |
| Marketplace modal lifecycle | `_renderMarketplaceModal`, `_marketplaceTab`, `_marketplaceModalExecuted` | State machine touched by every agent-related feature |
| Patient hubs | `pages-patient-*.js` | Real-time patient view; concurrent edits high |
| Clinical hubs | `pages-clinical-hubs.js`, `pages-clinical-tools.js` | Cross-cutting clinician views |
| Documents & reports hubs | `pages-documents-hub.js`, `pages-reports-hub.js` | High-frequency edit zone |

**Safe changes:** isolated copy edits (e.g. honest empty-state toasts, see PR #975), new tabs added at the end of an existing tab list, new functions that don't call into the overlay state machines.
**Unsafe without explicit task:** modifying overlay render call-sites, changing overlay state variables, restructuring marketplace tabs, "consolidating" hub render paths.

**Overlay coupling rule:** any PR that changes how an overlay is rendered or what it renders is architectural, not incremental. See [`salvage-pr-governance.md`](./salvage-pr-governance.md) § Overlay coupling warning.

### CI / build / deploy

| Surface | Files / dirs | Why critical |
|---------|--------------|--------------|
| `.github/workflows/*.yml` | All workflow files | A bad workflow change breaks every PR's CI |
| `Dockerfile` (root) | WeasyPrint native deps (Pango/Cairo/HarfBuzz) | Removing breaks all PDF endpoints; see `deepsynaps-weasyprint-native-deps-dockerfile` |
| `fly.toml`, `netlify.toml` | Deploy configs | Bad deploy = prod outage |
| `package.json` scripts | Bun-Windows compatibility (avoid bash brace groups, use subshells) | Cross-platform CI |
| Migrate / release commands | Fly release_command | Postgres migration safety |

**Safe changes:** new workflow added (not modifying existing), new optional script, new build target.
**Unsafe without explicit task:** removing existing CI jobs, changing matrix entries, removing the Dockerfile apt-get layer, modifying the release_command.

### Tests with cross-cutting impact

| Surface | Files / dirs | Why critical |
|---------|--------------|--------------|
| `apps/web/package.json` `test:unit` script | Lists every node --test file | Add new test files via this script, not via vitest config; see `deepsynaps-web-test-runner-node-test` |
| `apps/api/conftest.py` / shared fixtures | Test infrastructure | Changes affect every backend test |
| Coverage thresholds | `coverage` configs | Don't lower without explicit task; current thresholds are policy-owned |

**Safe changes:** new test file in the existing runner, new fixture in a single test file's scope.
**Unsafe without explicit task:** lowering coverage thresholds, replacing test runners, removing existing test files.

## What "additive-only" means concretely

A change is additive when:

- It adds a new file (and the existing files that import from it are NOT modified to require it)
- It adds a new function/class without changing existing ones
- It adds a new endpoint without modifying existing endpoints
- It adds a new test that exercises new code

A change is NOT additive when:

- It renames anything
- It changes a function signature, even by adding an "optional" arg that callers don't yet pass
- It changes a serialization format (JSON shape, Pydantic field type, DB column type)
- It modifies a shared file just to "tidy up" before the real change
- It adds a feature flag that defaults to ON

If you're not sure whether a change is additive, treat it as not additive.

## The "do not touch unless explicitly tasked" list

When working on something else, leave these alone even if you notice issues:

1. Banned-language tables in `docs/qeeg-safety-governance.md`
2. `MRIReport` Pydantic model fields
3. `QEEGBrainMapReport` shape
4. The marketplace overlay state machine in `pages-agents.js`
5. The Dockerfile WeasyPrint apt-get layer
6. `apps/web/package.json`'s `test:unit` script structure
7. Coverage thresholds in `apps/web` and `apps/api`
8. Any Alembic migration file already merged to `main`
9. CLAUDE.md (root) — actively edited by other sessions
10. `.gitignore` (don't add or remove entries in a non-cleanup PR)

If you find a real bug in one of these, file a separate single-concern PR or a tracking issue. Do not fold it into unrelated work.

## When a critical-surface change is required

If the task genuinely requires modifying a critical surface:

1. Surface it explicitly in the PR body: `## Runtime surface impact` (per [`pr-hygiene-and-drift-disclosure.md`](./pr-hygiene-and-drift-disclosure.md))
2. Cite the task or issue that justifies it
3. Keep the diff narrow — don't bundle any "while I'm here" cleanup
4. Add or update tests that cover the changed behavior
5. Tag the relevant code owner (clinical for safety surfaces, MRI lead for MRI, etc.) for review

The PR review process is the gatekeeper. Honest disclosure pre-empts pushback.

## AI-agent guidance

If you are an AI agent (Claude, Cursor, Codex, Hermes, OpenClaw) and the user asks you to touch a critical surface:

- Verify the task description names the surface explicitly. "Fix the bug in scheduling" is not enough; "Fix the off-by-one in `_compute_next_session_window` in `apps/api/app/services/scheduling/window.py`" is.
- If the task is vague and you'd be touching a critical surface, ask. Do not assume scope.
- Spawn a sub-task for clinical or safety review before pushing a PR that modifies banned-language patterns, claim governance, or evidence-policy files.
- If a salvage attempt drifts into a critical surface, ABORT (per [`salvage-pr-governance.md`](./salvage-pr-governance.md) § Abort conditions). Re-author from scratch with explicit task ownership.

## Final principle

> Critical surfaces are not where you do exploratory work.

A bug in a clinical surface costs more than every "while I'm here" cleanup ever saved. When in doubt, leave it alone and file an issue.
