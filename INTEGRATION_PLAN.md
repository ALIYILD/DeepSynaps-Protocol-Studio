# DeepSynaps Studio Integration Plan

## Scope

This plan audits the current Studio MVP in `C:\Users\yildi\DeepSynaps-Protocol-Studio` against:

- secondary codebase: `C:\Users\yildi\deepsynaps-platform`
- Perplexity-style output package: `C:\Users\yildi\OneDrive\Desktop\deepsynaps studio`

The goal is to identify what should be merged into the main Studio repository, what should be replaced, and what must remain separate.

## Executive decision

- Merge the curated clinical dataset and governance artifacts from `C:\Users\yildi\OneDrive\Desktop\deepsynaps studio`.
- Keep `C:\Users\yildi\deepsynaps-platform` separate as a reference codebase only.
- Reuse selective implementation patterns from `deepsynaps-platform` only by re-implementing them inside Studio, not by copying the product code wholesale.

## 1. Merge order

### Phase 1: Import the clinical database as the canonical content source

These files are high-value and domain-aligned:

| Source path | Target path | Action | Notes |
|---|---|---|---|
| `C:\Users\yildi\OneDrive\Desktop\deepsynaps studio\conditions.csv` | `data/imports/clinical-database/conditions.csv` | Merge | Replace ad hoc condition content with importable canonical rows. |
| `C:\Users\yildi\OneDrive\Desktop\deepsynaps studio\devices.csv` | `data/imports/clinical-database/devices.csv` | Merge | Use as source for backend device registry expansion. |
| `C:\Users\yildi\OneDrive\Desktop\deepsynaps studio\Modalities.csv` | `data/imports/clinical-database/modalities.csv` | Merge | Align modality vocabulary with clinical database IDs and labels. |
| `C:\Users\yildi\OneDrive\Desktop\deepsynaps studio\protocols.csv` | `data/imports/clinical-database/protocols.csv` | Merge | Primary deterministic protocol source; must not be pushed directly to frontend. |
| `C:\Users\yildi\OneDrive\Desktop\deepsynaps studio\assessments.csv` | `data/imports/clinical-database/assessments.csv` | Merge | Feeds assessment builder templates and backend assessment registry. |
| `C:\Users\yildi\OneDrive\Desktop\deepsynaps studio\phenotypes.csv` | `data/imports/clinical-database/phenotypes.csv` | Merge | Use for symptom clusters and upload-review targeting logic. |
| `C:\Users\yildi\OneDrive\Desktop\deepsynaps studio\sources.csv` | `data/imports/clinical-database/sources.csv` | Merge | Needed for traceability and references in generated outputs. |
| `C:\Users\yildi\OneDrive\Desktop\deepsynaps studio\Evidence_Levels.csv` | `data/imports/clinical-database/evidence-levels.csv` | Merge | Should drive canonical evidence labeling. |
| `C:\Users\yildi\OneDrive\Desktop\deepsynaps studio\Governance_Rules.csv` | `data/imports/clinical-database/governance-rules.csv` | Merge | Should become backend governance registry, not just a doc artifact. |

### Phase 2: Import the supporting docs as migration specs

| Source path | Target path | Action | Notes |
|---|---|---|---|
| `C:\Users\yildi\OneDrive\Desktop\deepsynaps studio\DATA_DICTIONARY.md` | `docs/integration/clinical-database-data-dictionary.md` | Merge | Use as field contract during schema import. |
| `C:\Users\yildi\OneDrive\Desktop\deepsynaps studio\SUMMARY_REPORT.md` | `docs/integration/clinical-database-summary.md` | Merge | Useful as audit evidence and rollout reference. |
| `C:\Users\yildi\OneDrive\Desktop\deepsynaps studio\deployment_checklist.md` | `docs/integration/legacy-deployment-checklist.md` | Merge with adaptation | Keep as input only; current commands target a different stack. |
| `C:\Users\yildi\OneDrive\Desktop\deepsynaps studio\expansion_plan.md` | `docs/integration/expansion-plan.md` | Merge after review | Product planning material; not a source of truth. |
| `C:\Users\yildi\OneDrive\Desktop\deepsynaps studio\expansion_candidates.md` | `docs/integration/expansion-candidates.md` | Merge after review | Backlog input only. |
| `C:\Users\yildi\OneDrive\Desktop\deepsynaps studio\research_workflow.md` | `docs/integration/research-workflow.md` | Merge after review | Can inform evidence-refresh workflows. |

### Phase 3: Normalize the backend around imported registries

Current Studio registry/data files are too small to represent the intended product.

| Current target path | Change needed |
|---|---|
| `data/conditions/parkinsons-disease.json` | Replace or regenerate from imported `conditions.csv` records. |
| `data/modalities/tps.json` | Replace or regenerate from imported `Modalities.csv`. |
| `data/devices/neurolith.json` | Replace or regenerate from imported `devices.csv`. |
| `apps/api/app/registries/evidence.py` | Refactor to load from imported evidence/protocol/source tables rather than hardcoded records. |
| `apps/api/app/registries/devices.py` | Refactor to load from imported devices/modalities tables. |
| `apps/api/app/registries/generation.py` | Replace static rule tables with deterministic derivation from protocol/governance/evidence tables. |
| `packages/core-schema/src/deepsynaps_core_schema/models.py` | Extend types to cover imported IDs, governance flags, review status, traceability fields, and source links. |

## 2. Keep separate

These parts of `deepsynaps-platform` are not merge candidates for Studio:

| Source path | Decision | Reason |
|---|---|---|
| `C:\Users\yildi\deepsynaps-platform\src\perfflux\**` | Keep separate | GPU optimization platform, wrong domain, different bounded context. |
| `C:\Users\yildi\deepsynaps-platform\frontend\src\pages\**` | Keep separate | Product surfaces are for telemetry, fleet, agents, FinOps, orchestration. |
| `C:\Users\yildi\deepsynaps-platform\deploy\**` | Keep separate | Deployment model targets a different service topology. |
| `C:\Users\yildi\deepsynaps-platform\tests\**` | Keep separate | Test coverage assumes GPU/telemetry/orchestration contracts. |
| `C:\Users\yildi\deepsynaps-platform\data\**` | Keep separate pending review | Different product data semantics. |
| `C:\Users\yildi\OneDrive\Desktop\deepsynaps studio\index.html` | Keep separate | Built artifact, not source. |
| `C:\Users\yildi\OneDrive\Desktop\deepsynaps studio\index-4hSlFOeC.js` | Keep separate | Compiled asset, not maintainable merge input. |
| `C:\Users\yildi\OneDrive\Desktop\deepsynaps studio\index-CQpg89Co.css` | Keep separate | Compiled asset, not maintainable merge input. |
| `C:\Users\yildi\OneDrive\Desktop\deepsynaps studio\DeepSynaps Studio — Review & Governance.zip` | Keep separate until unpacked and inspected | Opaque bundle; cannot be merged safely without contents review. |

## 3. Reuse by re-implementation, not file copy

Some files in `deepsynaps-platform` are useful as pattern references, but should not be merged directly.

| Source path | Suggested Studio target | Action | Reason |
|---|---|---|---|
| `C:\Users\yildi\deepsynaps-platform\frontend\src\components\DataTable.tsx` | `apps/web/src/components/ui/DataTable.tsx` | Re-implement | Generic sortable table behavior is reusable; current visual language is not. |
| `C:\Users\yildi\deepsynaps-platform\frontend\src\components\ProtectedRoute.tsx` | `apps/web/src/components/domain/RoleGate.tsx` | Re-implement selectively | Access gating logic is relevant; routing/auth assumptions differ. |
| `C:\Users\yildi\deepsynaps-platform\frontend\src\components\StatusBadge.tsx` | `apps/web/src/components/ui/Badge.tsx` | Re-implement selectively | Badge state mapping is useful, but current Studio tone system is already cleaner. |
| `C:\Users\yildi\deepsynaps-platform\frontend\src\api\client.ts` | `apps/web/src/lib/api/client.ts` | Re-implement selected ideas only | Avoid localStorage connection logic; keep current typed, role-token-based adapter. |
| `C:\Users\yildi\deepsynaps-platform\src\perfflux\api\auth.py` | `apps/api/app/auth.py` | Re-implement selected ideas only | JWT/API key hardening patterns are relevant; env names and scope model differ. |

## 4. Dependency mismatches

### Frontend

| Area | Studio main repo | Secondary repo | Impact |
|---|---|---|---|
| React router | `react-router-dom@^7.7.1` in `apps/web/package.json` | `react-router-dom@^7.13.1` in `frontend/package.json` | Low risk; no direct merge blocker. |
| Tailwind | `tailwindcss@^3.4.17` | `tailwindcss@^4.2.1` plus `@tailwindcss/vite` | High risk if UI code is copied directly. |
| Vite | `vite@^7.0.4` | `vite@^8.0.0` | Medium risk if build config is copied. |
| Design libraries | restrained custom Studio components | `lucide-react`, `recharts`, Sentry, dashboard widgets | Mismatch; dashboard UI cannot be dropped into Studio cleanly. |

### Backend

| Area | Studio main repo | Secondary repo | Impact |
|---|---|---|---|
| Package identity | `deepsynaps-protocol-studio` | `deepsynaps` / `perfflux` modules | Direct imports are incompatible. |
| Config model | `DEEPSYNAPS_*` ad hoc env in `apps/api/app/database.py` | `PERFFLUX_*` env-heavy settings model | Patterns reusable, names not reusable. |
| Runtime dependencies | lean FastAPI + SQLAlchemy | FastAPI + Redis + telemetry + JWT + OTEL + Prometheus + GPU libs | Direct merge would massively over-expand MVP scope. |
| Persistence | simple SQLite-ready SQLAlchemy | broader service mesh assumptions | Studio should not inherit the platform topology. |

## 5. Env/config changes needed

These changes are needed if the clinical database is imported into Studio.

| Needed change | Target file/path | Why |
|---|---|---|
| Add a data root setting such as `DEEPSYNAPS_DATA_ROOT` | `apps/api/app/settings.py` (new) | Current repo lacks a centralized settings module for CSV/JSON import locations. |
| Add import mode/config flags such as `DEEPSYNAPS_USE_IMPORTED_REGISTRIES=true` | `apps/api/app/settings.py` (new) | Allows staged migration from hardcoded registries to imported content. |
| Move DB URL and CORS into settings | `apps/api/app/settings.py` and `apps/api/app/main.py` | Current config is too scattered for a real deployment. |
| Add frontend API env examples | `apps/web/.env.example` (new) | Current repo documents `VITE_API_BASE_URL` in README only. |
| Add demo auth token docs or env-backed mapping | `apps/web/src/config/api.ts` and README | Needed so staging/demo behavior is explicit. |

## 6. Database/schema changes needed

Current Studio persistence is limited to audit events. Importing the desktop database cleanly requires new schema support.

### Required new persistent tables

- `evidence_levels`
- `governance_rules`
- `modalities`
- `devices`
- `conditions`
- `phenotypes`
- `assessments`
- `protocols`
- `sources`
- optional join tables if semicolon-separated CSV fields are normalized

### Required ORM/migration work

| Needed change | Target path |
|---|---|
| Add ORM models for the nine clinical tables | `apps/api/app/persistence/clinical_models.py` |
| Add import pipeline from CSV to ORM or cache layer | `apps/api/app/services/imports.py` |
| Add repository/query layer for imported records | `apps/api/app/repositories/clinical.py` |
| Extend audit persistence to include review status changes for imported records | `apps/api/app/repositories/audit.py` and `apps/api/app/persistence/models.py` |
| Add migration tooling | `alembic/` or equivalent new path at repo root |

### Contract changes

| Existing file | Change |
|---|---|
| `packages/core-schema/src/deepsynaps_core_schema/models.py` | Add explicit IDs, regulatory pathway fields, review status, source URLs, governance flags, and export eligibility fields. |
| `apps/web/src/types/domain.ts` | Align frontend domain types to imported record shape after schema normalization. |

## 7. Deployment blockers

These are the concrete blockers before a safe merge of the desktop dataset into the app:

1. No import pipeline exists from the CSV/XLSX package into backend registries or persistence.
2. No migration framework exists for the required clinical tables.
3. Current backend only persists audit events; everything else is registry/hardcoded.
4. Current frontend types are smaller than the desktop dataset fields and would drop important regulatory/governance information.
5. The output package includes claims such as FDA status and evidence grades that require source-preserving import and review controls before surfacing in UI.
6. `deployment_checklist.md` in the output package targets a different stack (`deepsynaps-engine`, Node server, Drizzle, `/api/stats`); it cannot be executed against the current FastAPI app.
7. The zipped governance package is not inspected, so it cannot be relied on in the merge plan yet.

## 8. Recommended next implementation slice

1. Create `docs/integration/` and `data/imports/clinical-database/`.
2. Copy the desktop CSV and markdown assets into those paths without transforming them.
3. Add a backend import reader that validates record counts against the desktop summary:
   - 4 evidence levels
   - 12 governance rules
   - 12 modalities
   - 19 devices
   - 20 conditions
   - 30 phenotypes
   - 42 assessments
   - 32 protocols
   - 30 sources
4. Expand `packages/core-schema` before changing the frontend.
5. Refactor backend evidence/device/protocol services to read imported data.
6. Only then swap the frontend pages from MVP-shaped payloads to imported clinical payloads.

## 9. Do not merge

Do not merge these directly into Studio:

- `C:\Users\yildi\deepsynaps-platform\src\perfflux\**`
- `C:\Users\yildi\deepsynaps-platform\frontend\src\pages\**`
- `C:\Users\yildi\deepsynaps-platform\frontend\src\api\mock-data.ts`
- `C:\Users\yildi\deepsynaps-platform\frontend\src\api\mock-advisory.ts`
- `C:\Users\yildi\deepsynaps-platform\deploy\**`
- `C:\Users\yildi\OneDrive\Desktop\deepsynaps studio\index.html`
- `C:\Users\yildi\OneDrive\Desktop\deepsynaps studio\index-4hSlFOeC.js`
- `C:\Users\yildi\OneDrive\Desktop\deepsynaps studio\index-CQpg89Co.css`

They either belong to a different product, are compiled artifacts, or would widen the Studio MVP beyond the intended domain.
