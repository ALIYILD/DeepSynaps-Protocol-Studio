# Biomarkers workspace — live readiness (doctor demo)

## Scope statement

The in-app **Biomarkers** page (`?page=biomarkers`, alias `?page=biomarkers-ref`) combines:

1. **Neuro-Biomarker Reference** — static curated catalog (`NEURO_BIOMARKER_REFERENCE` in `apps/web/src/neuro-biomarker-data.js`).
2. **Patient Workspace** — aggregated **counts and imported lab rows** from API endpoints when available, plus optional **demo-labelled synthetic lab fixtures** only when **demo session** rules pass (see below).

Static file `apps/web/public/biomarkers.html` is **not** the SPA workspace and is out of scope for clinical demo routing.

## Safety statement

- Biomarkers is **clinical decision-support and navigation only**. It does **not** diagnose, prescribe, perform emergency triage, approve treatment, or operate autonomously.
- **Reference tab**: educational/reference catalog copy — **not** live patient interpretation.
- **Patient Workspace**: values are **API-imported** or **explicitly demo-labelled**; **missing** analytes or modalities are **not** treated as normal.
- **qEEG / MRI counts** on this page are **inventory summaries** only — detailed reads live in modality analyzers.

## Reference vs patient workspace

| Area | Data source | Purpose |
|------|-------------|---------|
| Reference tab | Bundled JS dataset | Searchable catalog + modal detail + optional 10–20 topomap when site tokens parse |
| Patient Workspace | `GET` labs profile, wearables summary, qEEG/MRI lists | Roster selection, staleness, export JSON |

## Button / action matrix

| Label / control | Frontend handler | Route / API | Backend (when applicable) | Expected | Demo | Degraded | Tests |
|-----------------|-------------------|-------------|-----------------------------|----------|------|----------|-------|
| Sidebar Biomarkers | `app.js` nav registry → `pgBiomarkersWorkspace` | `biomarkers` | — | Loads page | Same | Same | E2E walker includes `biomarkers` |
| Route `biomarkers` | `switch` case `biomarkers` | — | — | Full page | Demo banner if fixture | API errors surfaced | `pages-biomarkers.test.js` |
| Alias `biomarkers-ref` | `window._nav`: sets `_bmActiveTab='reference'` → `navigate('biomarkers')` | — | — | Reference tab selected | Same | Same | Manual |
| Tab Reference | `switchTab('reference')` → `_renderReferenceTab` + `_bindReferenceTab` | — | — | Catalog + search | Same | Same | Helpers |
| Tab Patient Workspace | `switchTab('workspace')` → `renderWorkspaceTab` | See APIs below | See below | Workspace UI | Demo labs if gated | Empty/error messages | Helpers |
| Reference search | `oninput` → `window._bmRefSearch` | — | — | Filters cards/groups | Same | Empty-search copy | — |
| Marker card click | `onclick` → `_openBmRefModal` → `_openBiomarkerModal` | — | — | Modal opens | Same | — | Manual |
| Modal close | `#nb-modal-close`, overlay click, Escape | — | — | Modal removes | Same | — | Manual |
| Condition chip | `onclick` → `_bmRefSearch(condition)` | — | — | Search narrows | Same | — | Manual |
| Patient selector | `change` → `loadPatientData` → `renderWorkspaceTab` | — | — | Reloads patient aggregates | Demo fixture path | Roster error banner | — |
| Browser refresh | Full reload | — | — | SPA re-init | Same | Same | — |
| Export JSON | `#bm-export` click → `_downloadJson` | — | — | File download with metadata | `demo_lab_fixture` flag | Partial export if no labs | Unit + manual |
| Linked Assessments | `.bm-link` → `navigate('assessments-v2')` | `assessments-v2` | — | Hub opens | Same | Route missing → blank/error | `BIOMARKERS_LINKED_MODULES` |
| Documents | `navigate('documents-v2')` | `documents-v2` | — | Documents hub | Same | — | — |
| Virtual Care | `navigate('live-session')` | `live-session` | — | Virtual care | Same | — | — |
| qEEG | `navigate('qeeg-launcher')` | `qeeg-launcher` | — | Launcher | Same | — | — |
| MRI | `navigate('mri-analysis')` | `mri-analysis` | — | MRI analyzer | Same | — | — |
| Video | `navigate('video-assessments')` | `video-assessments` | — | Video | Same | — | — |
| Text | `navigate('text-analyzer')` | `text-analyzer` | — | Text | Same | — | — |
| DeepTwin | `navigate('deeptwin')` | `deeptwin` | — | DeepTwin | Same | — | — |
| Protocol Studio | `navigate('protocol-studio')` | `protocol-studio` | — | Protocol Studio | Same | — | — |
| Brain Map | `navigate('brainmap-v2')` | `brainmap-v2` | — | Brain Map Planner | Same | — | — |
| Schedule | `navigate('schedule-v2')` | `schedule-v2` | — | Schedule | Same | — | — |
| Inbox | `navigate('clinician-inbox')` | `clinician-inbox` | — | Inbox | Same | — | — |
| Patient profile | `bm-open-profile` | `patient-profile` | — | Profile | Same | — | — |
| Labs Analyzer | `bm-open-labs` | `labs-analyzer` | — | Labs | Same | — | — |
| Labs table | Render-only | — | — | Rows from `flattenLabResults` | Demo rows labelled via banner | Empty state | Unit `flattenLabResults` |
| Abnormal list | Render-only | — | — | Lists non-normal statuses | Same | Explains missing refs | — |
| Wearable snapshot | `bm-open-wear` → `navigate('wearables')` | `GET /api/v1/wearables/patients/{id}/summary` | `wearable_router.py` | Snapshot or dashes | Same | Nulls show — | — |
| qEEG count | `listPatientQEEGAnalyses` | `GET` qEEG list API | qEEG router | Integer count | Often 0 in demo | Catch → 0 | — |
| MRI count | `listPatientMRIAnalyses` | `GET` MRI list API | MRI router | Integer count | Often 0 in demo | Catch → 0 | — |

## API endpoint matrix (frontend → path)

| Purpose | Method | Path |
|---------|--------|------|
| Patient roster | GET | `/api/v1/patients` |
| Labs profile | GET | `/api/v1/labs/analyzer/patient/{patientId}` |
| Wearables summary | GET | `/api/v1/wearables/patients/{patientId}/summary?days=30` |
| qEEG analyses list | GET | (via `api.listPatientQEEGAnalyses`) |
| MRI analyses list | GET | (via `api.listPatientMRIAnalyses`) |
| Workspace audit | POST | `/api/v1/patients/{patientId}/audit-events` |

Backend routers exist for labs (`labs_analyzer_router.py`) and wearables (`wearable_router.py`). Clinician auth and clinic scoping follow standard API guards (verify in deployment).

## Demo / degraded behavior

- **Demo lab fixture** loads **only** when `isDemoSession()` is true (`import.meta.env.DEV` **or** `VITE_ENABLE_DEMO === '1'`, **and** access token ends with `-demo-token`). Production sessions with real JWTs **do not** silently receive synthetic labs.
- **DEMO_FIXTURE_BANNER_HTML** appears when demo fixture labs are shown.
- API failures: patient list error surfaces in empty state; labs error surfaces in Patient Workspace with **no** silent substitution outside demo rules.
- **Literature anchors** statistic (`CURATED_REFERENCE_LITERATURE_ANCHORS`) is **curated catalog metadata**, not a live PubMed count.

## Known limitations

- Reference tab does not call `/api/v1/qeeg/biomarkers` (that merge lives elsewhere, e.g. Knowledge neuro-reference).
- Wearable/qEEG/MRI failures collapse to **null/empty** — counts may be zero without distinguishing “no data” vs “error” per modality on this page.
- Export JSON is a **workspace snapshot**, not a legal medical record.

## Preview / env notes

- Netlify preview builds often set **`VITE_ENABLE_DEMO=1`** so offline demo personas work; confirm **`VITE_API_BASE_URL`** (or default) points at the intended API for live demos.
- Production/staging: demo fixtures remain **off** unless demo token session is used.

## Preview click-through (agent-run checklist)

1. Open `?page=biomarkers` — safety region visible; tabs load.
2. Reference tab — search “alpha” / “HRV”; open marker card; confirm modal; valid sites show topomap.
3. Patient Workspace — select demo patient; verify labs source line + stale labels; export JSON; open qEEG / MRI shortcut.
4. Confirm closing statement (script below).

## Tomorrow doctor-demo script

1. Open **Biomarkers** (`?page=biomarkers`).
2. Read the **controlled preview** safety banner.
3. **Reference tab**: explain the catalog is **reference-only**, not live interpretation.
4. Search (e.g. alpha asymmetry, HRV, inflammation); open a marker; show **10–20 topomap** only when valid sites parse.
5. **Patient Workspace**: select a **demo** patient; point out **labs source** (API vs demo fixture), **stale** labels, **missing vs normal**.
6. **Export JSON** — show `labs_source`, `demo_lab_fixture`, counts.
7. Use a **linked module** (e.g. qEEG launcher, MRI, DeepTwin, Protocol Studio).
8. Close with:

> “This is a biomarker reference and patient-data aggregation hub. The reference catalog is not live interpretation. Patient values are imported or demo-labelled; missing values are not treated as normal. This page does not diagnose or prescribe.”

## Definition of done (checklist)

- [x] Routes `biomarkers` / `biomarkers-ref` load in-app workspace.
- [x] Safety banner visible; reference tab labelled reference-only; patient workspace explains sources.
- [x] Search + empty state + modal + site parsing unchanged architecturally.
- [x] Demo labs gated; production JWT does not silently get fixtures.
- [x] Export includes source/demo fields.
- [x] Linked module IDs match `app.js` routes.
- [x] Unit tests extended; `npm run build` passes in CI.
