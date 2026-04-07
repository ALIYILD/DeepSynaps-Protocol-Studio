# DeepSynaps Studio Risk Notes

## 1. Product-boundary risk

### Highest risk

Directly merging `C:\Users\yildi\deepsynaps-platform` into Studio would create a domain collision.

- `deepsynaps-platform` is an autonomous GPU optimization platform.
- `DeepSynaps-Protocol-Studio` is a clinical neuromodulation document and governance platform.
- Shared naming is not enough to justify code reuse.

Risk outcome:

- wrong data model
- wrong deployment topology
- wrong auth assumptions
- wrong frontend IA
- large maintenance debt from imported irrelevant code

Recommendation:

- keep the repo separate
- only lift implementation patterns after manual translation

## 2. Clinical-data import risk

The desktop output package contains strong-value data, but it also contains regulatory and evidence claims.

Examples observed in the package:

- evidence levels EV-A through EV-D
- device regulatory pathways and indications
- off-label vs on-label protocol labeling
- patient-facing export constraints

Risk outcome:

- if imported loosely, the app could surface claims without preserving source traceability or governance flags
- if flattened into current MVP payloads, important caveats will be lost

Recommendation:

- import the CSV files as immutable source assets first
- preserve source URLs, review status, and governance fields in the schema
- block UI publication until import validation passes

## 3. Schema risk

Current Studio contracts in `packages/core-schema/src/deepsynaps_core_schema/models.py` are too narrow for the desktop database.

Examples of missing or underspecified fields:

- regulatory pathway
- official indication text
- review status
- source URLs
- export allowed / patient-facing flags
- clinician-only / governance rule references
- explicit evidence-level IDs

Risk outcome:

- data loss during import
- ambiguous frontend behavior
- inability to explain why a protocol is gated or blocked

Recommendation:

- extend the canonical schema before importing runtime data into backend services

## 4. Persistence risk

Current Studio persistence is minimal.

What exists now:

- audit event persistence in `apps/api/app/persistence/models.py`

What is missing for the imported clinical database:

- tables for the nine database entities
- migrations
- normalized joins or import mapping strategy
- versioning or snapshotting for imported records

Risk outcome:

- brittle runtime-only imports
- no safe audit trail for content revisions
- no rollback path for bad data imports

Recommendation:

- add migrations before wiring imported tables into production endpoints

## 5. Deployment risk

The desktop `deployment_checklist.md` is useful operationally but targets a different stack:

- `deepsynaps-engine`
- Node runtime
- Drizzle schema push
- `/api/stats`
- `/api/governance/check`

Current Studio stack:

- FastAPI
- SQLAlchemy
- SQLite-ready persistence
- different endpoint map

Risk outcome:

- executing the old checklist against Studio would fail or create false confidence

Recommendation:

- treat the checklist as source material only
- rewrite a Studio-specific deployment runbook after the data-import layer exists

## 6. Auth/security risk

Studio currently uses demo Bearer tokens with server-side role mapping.

This is acceptable for MVP demos but insufficient for clinical governance once real imported data is used.

Risk outcome:

- weak operator attribution
- insufficient review provenance
- unclear separation between viewer, clinician, reviewer, and admin permissions

Recommendation:

- keep the current demo auth for now
- design imported governance workflows so they can later plug into real auth without contract churn

## 7. Frontend merge risk

The `deepsynaps-platform` frontend uses a very different visual and dependency stack:

- Tailwind 4 vs Studio Tailwind 3
- dashboard-heavy telemetry UI
- localStorage-backed API connection behavior
- dark, ops-centric visual language

Risk outcome:

- inconsistent UI
- dependency churn
- regression risk in the current Studio demo

Recommendation:

- do not copy page-level components
- only replicate generic ideas such as sortable tables or auth wrappers

## 8. Data-quality risk

The desktop summary claims:

- 201 total records
- 9 tables
- validated counts and review statuses

Those claims have not yet been validated inside Studio code.

Risk outcome:

- partial imports
- silent count mismatches
- broken references between protocols, conditions, devices, and sources

Recommendation:

- build an import validator that checks:
  - exact row counts
  - primary-key uniqueness
  - foreign-key resolution
  - governance-rule validity
  - evidence-level validity

## 9. Deployment blockers

These blockers should be resolved before attempting a real merge into app behavior:

1. No importer exists for the desktop CSV package.
2. No clinical persistence schema exists.
3. No migration tool exists in the Studio repo.
4. No content-versioning strategy exists for imported clinical rows.
5. The governance ZIP has not been unpacked or audited.
6. Frontend contracts do not yet carry the full imported record shape.

## 10. Safe path

The safest integration path is:

1. copy the desktop CSV and markdown artifacts into versioned import folders
2. validate the dataset offline
3. extend the canonical schema
4. add backend import and repository layers
5. expose imported data behind existing endpoints
6. update frontend views after backend contracts stabilize

Anything more aggressive than that is likely to create semantic regressions rather than useful progress.
