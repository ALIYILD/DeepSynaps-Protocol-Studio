# Kimi knowledge-adapter salvage notes — 2026-05-18

**Status:** Preservation snapshot. No deletions. Reference material only.

This document records the decision to **preserve** all Kimi-authored material
in `apps/api/app/knowledge/`, `apps/api/tests/knowledge/`, and
`docs/knowledge/` rather than delete it, even though that tree is a parallel
non-production codebase. The research it captures (database URLs, endpoints,
rate limits, response shapes, evidence-grade mappings) is real and reusable;
the *implementation* is not, but the *plan* is.

The actionable next-steps document is
[`knowledge-adapter-roadmap.md`](./knowledge-adapter-roadmap.md), which uses
these preserved files as the briefing material for re-implementation in the
production tree at `apps/api/app/services/knowledge/adapters/`.

---

## What is preserved

| Path | Kind | Count | Decision |
|---|---|---:|---|
| `apps/api/app/knowledge/*_adapter.py` | Adapter implementations | 50 | **Reference only.** Wrong base class, wrong import paths, not wired. Do NOT import from these. Read them for: target URL, rate limit, intended endpoints, transform logic ideas. |
| `apps/api/app/knowledge/{medication,genetic,qeeg,mri}_analyzer_bridge.py` | Bridge implementations | 4 | **Reference only.** Production already has bridges at `apps/api/app/services/knowledge/*_analyzer_bridge.py`. Read these only for new ideas not already covered by production. |
| `apps/api/app/knowledge/multimodal_synthesizer_v2.py` | Synthesizer v2 | 1 | **Reference only.** Production has `apps/api/app/services/knowledge/multimodal_synthesizer.py`. The `_v2` suffix exists because Kimi recognized the name collision without resolving it. |
| `apps/api/app/knowledge/deeptwin_integration.py` | DeepTwin layer | 1 | **Reference only.** Production has `apps/api/app/services/knowledge/deeptwin_hooks.py` plus 20 live `/api/v1/deeptwin/*` endpoints. Use this only for novel ideas. |
| `apps/api/app/knowledge/adapter_registry.py` | Parallel registry | 1 | **Reference only.** Production registry at `apps/api/app/services/knowledge/adapter_registry.py` is the canonical one (795 lines, imported by 9 production files). |
| `apps/api/app/knowledge/seed_evidence_store.py` + `seed_queries.json` + `test_seed_pipeline.py` | Seeding pipeline | 3 | **Reference only.** The seed queries JSON is reusable as a starter set; the pipeline code targets the wrong adapter registry. |
| `apps/api/tests/knowledge/test_*.py` | Test suites | 20 | **Reference only.** Cannot be collected by pytest — every import path (`from app.knowledge.*`) fails because the parallel tree is not on the import surface. Read for: what the adapter author thought needed verifying. |
| `docs/knowledge/BATCH{1..6}_*INTEGRATION_REPORT.md` | Per-batch design briefings | 6 | **Keep as authoritative briefing material.** These are the highest-density planning artifacts — they have the API endpoints, rate limits, sample queries, response field maps, and evidence-grade mappings used to plan each database. The roadmap doc references each by name. |

Approximate scale: ~37k Python lines + ~16k test lines + ~5k Markdown
briefing lines. **Zero of it ships to production today.** All of it can
inform the proper re-implementations described in the roadmap.

## Why preservation, not deletion

1. **Research value is durable; code may not be.** The work that went into
   identifying 50 free/open biomedical databases, finding their REST
   endpoints, documenting their rate limits, and capturing their response
   shapes is real and expensive even when the resulting Python doesn't run.
2. **The BATCH integration reports are usable as design specs.** They
   contain working sample queries, evidence-grade mappings, and field-level
   transformation notes. Re-implementing against the production
   `DatabaseAdapter` ABC is much faster with these in hand than without.
3. **Deletion would compound today's outage churn.** This repo has already
   absorbed today's deploy hotfix (PR #994), brain-twin revert (#979), and
   89-doc Kimi salvage triage (#992/#995/#996). Adding a 75k-line delete on
   top of that is unnecessary noise.

See also: memory `agent-parallel-codebase-salvage.md` for the general
collaboration rule this decision establishes.

## Why this material is non-shippable as-is

The parallel tree at `apps/api/app/knowledge/` was independently verified
on 2026-05-18 to be unreachable from production:

- **Imports fail.** Every Kimi adapter starts with
  `from app.knowledge.base_adapter import BaseAdapter` — but `base_adapter.py`
  exists only at `apps/api/app/services/knowledge/base_adapter.py`. The
  parallel tree has no such file. Direct import test:
  `ModuleNotFoundError: No module named 'app.knowledge.base_adapter'`.
- **Class signatures incompatible.** Kimi's adapters define
  `validate_connection()` / `search()` / `transform_to_canonical()` /
  `get_provenance()` / `get_confidence_score()` / `close()`. Production's
  `DatabaseAdapter(ABC)` requires `source_name`, `source_version`,
  `connect`, `disconnect`, `fetch`, `normalize`, `validate`, `get_provenance`,
  `get_license`, `get_confidence`, `health_check`. No overlap on shape.
- **Zero wiring.** No router, service, or task imports anything from
  `app.knowledge.*`. Production `openapi.json` exposes 1,486 paths and not
  one of them comes from the parallel tree.
- **Tests cannot collect.** Every test under `apps/api/tests/knowledge/`
  raises `ModuleNotFoundError` at collection. The claimed 951 passing tests
  was never executed.

## What "re-implementation" means here

For each database that we want in production:

1. Read the relevant `docs/knowledge/BATCH*_INTEGRATION_REPORT.md` section
   as the design brief (URL, endpoints, rate limits, sample queries).
2. Glance at the matching Kimi file at `apps/api/app/knowledge/<name>_adapter.py`
   only for additional ideas (response transformation, field mappings).
3. Write a new file at
   `apps/api/app/services/knowledge/adapters/<name>_adapter.py` that
   subclasses the production `DatabaseAdapter` ABC and implements every
   abstract method.
4. Add an entry to `apps/api/app/services/knowledge/adapter_registry.py`
   (or wherever startup-time registration lives) so the adapter is reachable.
5. Add a test at `apps/api/tests/test_<name>_adapter.py` following the
   existing flat-file pattern (e.g. `test_openmed_adapter.py`).
6. Each adapter ships in its own PR through the standard gates.

## Eventual cleanup

Once the proper re-implementations are in production and the
[roadmap](./knowledge-adapter-roadmap.md) shows ✅ for a given database,
the matching Kimi file becomes truly redundant and can be removed. Cleanup
happens **after** replacement, not before — and even then only with a
final reference check that the file isn't being imported by anything new.

Until then: hands off the parallel tree.
