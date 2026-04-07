# DeepSynaps Studio File Map

## Main repo inventory

### Primary app surfaces

| Area | Paths |
|---|---|
| Backend API | `apps/api/app/main.py`, `apps/api/app/services/`, `apps/api/app/registries/`, `apps/api/app/auth.py`, `apps/api/app/database.py`, `apps/api/app/persistence/` |
| Frontend app | `apps/web/src/app/`, `apps/web/src/pages/`, `apps/web/src/components/`, `apps/web/src/lib/api/`, `apps/web/src/config/api.ts` |
| Shared contracts | `packages/core-schema/src/deepsynaps_core_schema/models.py` |
| Current registry seed data | `data/conditions/`, `data/modalities/`, `data/devices/` |
| Docs | `docs/product-vision.md`, `docs/mvp-scope.md`, `docs/architecture.md` |

### Current route map

Defined in `apps/web/src/app/AppRoutes.tsx`:

- `/`
- `/evidence-library`
- `/device-registry`
- `/assessment-builder`
- `/protocols`
- `/handbooks`
- `/upload-review`
- `/governance-safety`
- `/pricing-access`

## Comparison source: `deepsynaps-platform`

### What it actually contains

| Area | Paths | Relevance to Studio |
|---|---|---|
| FastAPI backend | `src/perfflux/api/` | Low as direct merge; useful only for auth/config patterns |
| Large orchestration domain | `src/perfflux/agents/`, `src/perfflux/orchestration/`, `src/perfflux/research/` | Not relevant |
| Frontend shell and dashboards | `frontend/src/pages/`, `frontend/src/components/`, `frontend/src/api/` | Low as direct merge; a few generic UI patterns only |
| Deployment/ops docs | `docs/`, `deploy/`, `Dockerfile`, `docker-compose.yml`, `fly.toml` | Separate product |
| Tests | `tests/`, `frontend/src/**/__tests__` | Different contracts |

### Candidate reference files only

| Source file | Suggested destination | Status |
|---|---|---|
| `C:\Users\yildi\deepsynaps-platform\frontend\src\components\DataTable.tsx` | `apps/web/src/components/ui/DataTable.tsx` | Re-implement, do not copy blindly |
| `C:\Users\yildi\deepsynaps-platform\frontend\src\components\ProtectedRoute.tsx` | `apps/web/src/components/domain/RoleGate.tsx` | Reference only |
| `C:\Users\yildi\deepsynaps-platform\frontend\src\components\StatusBadge.tsx` | `apps/web/src/components/ui/Badge.tsx` | Reference only |
| `C:\Users\yildi\deepsynaps-platform\frontend\src\api\client.ts` | `apps/web/src/lib/api/client.ts` | Reference only |
| `C:\Users\yildi\deepsynaps-platform\src\perfflux\api\auth.py` | `apps/api/app/auth.py` | Reference only |

## Comparison source: desktop output package

### High-value data assets

| Source file | Proposed Studio path | Why |
|---|---|---|
| `C:\Users\yildi\OneDrive\Desktop\deepsynaps studio\conditions.csv` | `data/imports/clinical-database/conditions.csv` | Canonical clinical condition rows |
| `C:\Users\yildi\OneDrive\Desktop\deepsynaps studio\devices.csv` | `data/imports/clinical-database/devices.csv` | Regulatory/device dataset |
| `C:\Users\yildi\OneDrive\Desktop\deepsynaps studio\Modalities.csv` | `data/imports/clinical-database/modalities.csv` | Clinical modality registry |
| `C:\Users\yildi\OneDrive\Desktop\deepsynaps studio\protocols.csv` | `data/imports/clinical-database/protocols.csv` | Deterministic protocol rules source |
| `C:\Users\yildi\OneDrive\Desktop\deepsynaps studio\assessments.csv` | `data/imports/clinical-database/assessments.csv` | Assessment builder and intake support |
| `C:\Users\yildi\OneDrive\Desktop\deepsynaps studio\phenotypes.csv` | `data/imports/clinical-database/phenotypes.csv` | Symptom cluster normalization |
| `C:\Users\yildi\OneDrive\Desktop\deepsynaps studio\sources.csv` | `data/imports/clinical-database/sources.csv` | Source traceability |
| `C:\Users\yildi\OneDrive\Desktop\deepsynaps studio\Evidence_Levels.csv` | `data/imports/clinical-database/evidence-levels.csv` | Evidence labels and export gating |
| `C:\Users\yildi\OneDrive\Desktop\deepsynaps studio\Governance_Rules.csv` | `data/imports/clinical-database/governance-rules.csv` | Governance and clinician gating |

### High-value documentation assets

| Source file | Proposed Studio path | Why |
|---|---|---|
| `C:\Users\yildi\OneDrive\Desktop\deepsynaps studio\DATA_DICTIONARY.md` | `docs/integration/clinical-database-data-dictionary.md` | Field-level schema reference |
| `C:\Users\yildi\OneDrive\Desktop\deepsynaps studio\SUMMARY_REPORT.md` | `docs/integration/clinical-database-summary.md` | Coverage and QA reference |
| `C:\Users\yildi\OneDrive\Desktop\deepsynaps studio\deployment_checklist.md` | `docs/integration/legacy-deployment-checklist.md` | Historical deployment/runbook only |
| `C:\Users\yildi\OneDrive\Desktop\deepsynaps studio\research_workflow.md` | `docs/integration/research-workflow.md` | Evidence refresh process input |
| `C:\Users\yildi\OneDrive\Desktop\deepsynaps studio\expansion_plan.md` | `docs/integration/expansion-plan.md` | Backlog input |
| `C:\Users\yildi\OneDrive\Desktop\deepsynaps studio\expansion_candidates.md` | `docs/integration/expansion-candidates.md` | Backlog input |

### Non-source artifacts

| Source file | Decision |
|---|---|
| `C:\Users\yildi\OneDrive\Desktop\deepsynaps studio\index.html` | Keep separate |
| `C:\Users\yildi\OneDrive\Desktop\deepsynaps studio\index-4hSlFOeC.js` | Keep separate |
| `C:\Users\yildi\OneDrive\Desktop\deepsynaps studio\index-CQpg89Co.css` | Keep separate |
| `C:\Users\yildi\OneDrive\Desktop\deepsynaps studio\DeepSynaps Studio — Review & Governance.zip` | Inspect later before deciding |
| `C:\Users\yildi\OneDrive\Desktop\deepsynaps studio\DeepSynaps_Studio_Clinical_Database.xlsx` | Keep as archival source beside CSV import set |
| `C:\Users\yildi\OneDrive\Desktop\deepsynaps studio\deepsynaps_studio_database_starter.xlsx` | Keep as archival source only |

## Suggested target structure additions

These target paths do not exist yet but should be created before real integration work starts:

```text
data/
  imports/
    clinical-database/
      conditions.csv
      devices.csv
      modalities.csv
      protocols.csv
      assessments.csv
      phenotypes.csv
      sources.csv
      evidence-levels.csv
      governance-rules.csv
docs/
  integration/
    clinical-database-data-dictionary.md
    clinical-database-summary.md
    legacy-deployment-checklist.md
    expansion-plan.md
    expansion-candidates.md
    research-workflow.md
apps/api/app/
  settings.py
  services/
    imports.py
  repositories/
    clinical.py
  persistence/
    clinical_models.py
```

## Replace vs preserve

### Replace over time

- `data/conditions/parkinsons-disease.json`
- `data/modalities/tps.json`
- `data/devices/neurolith.json`
- hardcoded backend evidence/device/generation registries

### Preserve

- `apps/web/src/pages/` route structure
- `apps/web/src/lib/api/` typed API adapter shape
- `apps/api/app/services/` service layer split
- `apps/api/app/persistence/models.py` audit persistence pattern
- `packages/core-schema/` as the canonical contract location

## Summary

The desktop output package maps cleanly onto Studio's data and governance layers.

The `deepsynaps-platform` repository does not map cleanly onto Studio's product domain. Treat it as a source of implementation ideas only.
