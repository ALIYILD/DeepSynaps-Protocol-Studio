# DeepSynaps Protocol Studio — Repo Architecture Map

**Generated:** 2026-04-26 22:45 UTC (night-shift architect pass)

---

## APPS

### apps/web (React + Vite, 180 src files)
**What:** Clinician + patient portal, analytics UI, qEEG/MRI visualization, protocol builder, digital twin simulator  
**Framework:** React 18.3 + Vite 7, Cornerstone.js (DICOM), Plotly (charts)  
**Key files:**
- `app.js` — app shell, routing, auth context, language/theme switcher
- `pages-*.js` (38 page modules) — clinical, patient, qEEG, MRI, DeepTwin, research, registry
- `styles.css` — design tokens, WCAG AA contrast, reduced-motion prefs
- Test suite: 26 .test.js files (unit tests via Node.js test runner)

**Public surfaces (URL routes):**
- `/` — landing, demo buttons, auth gate
- `/clinical/*` — clinician hub, patients table, hubs, tools, courses, protocols, handbooks, monitoring
- `/patient/*` — patient timeline, home program tasks, device dashboard, consent
- `/qeeg/*` — analysis, raw data, viz, copilot
- `/mri/*` — analysis, brain-age, comparison, QC
- `/deeptwin/*` — simulator, scenarios, predictions
- `/agents/*` — command center, monitoring
- `/research/*` — evidence library, literature, registries

**Dependencies exported by apps/api:**  
All pages consume `/api/*` routes (auth, patients, sessions, qEEG, MRI, fusion, documents, evidence, etc.)

---

### apps/api (FastAPI + SQLAlchemy, 310 py files)
**What:** Core backend serving all clinical + patient workflows, qEEG/MRI analysis dispatch, evidence/protocol generation  
**Language:** Python 3.11+, FastAPI, SQLAlchemy ORM, Alembic migrations  
**Key files:**
- `app/main.py` — FastAPI app init, router registration, exception handlers, health checks
- `app/routers/` (75 router files) — route handlers for domains (auth, patients, qEEG, MRI, evidence, etc.)
- `app/persistence/models.py` — SQLAlchemy models (patient, session, assessment, report, consent, etc.)
- `app/services/` — business logic; key submodules:
  - `analyses/` — qEEG/MRI/fusion analysis orchestration
  - `device_sync/` — Bluetooth/device adapters
- `tests/` (81 test files) — pytest unit + integration tests

**API endpoints (route categories):**
- `/auth/*` — login, signup, token, 2FA, password reset
- `/patients/*` — CRUD, sessions, assessments, outcomes, medications
- `/qeeg/*` — analyze, live stream, raw fetch, viz, copilot chat, MNE pipeline, AI upgrades
- `/mri/*` — analyze, brain-age, incidental review, fusion
- `/evidence/*` — protocol evidence library, citations, validation
- `/protocols/generate` — deterministic protocol builder
- `/documents/*` — reports, exports, templates
- `/deeptwin/*` — simulation, scenario management, prediction
- `/consent/*` — consent forms, signatures, audit log
- `/admin/*` — pgvector management, feature-store upsert
- 40+ additional specialized routes (team, payments, devices, wearables, marketplace, etc.)

**Database:** SQLite (dev), PostgreSQL (prod); migrations in `alembic/versions/`

---

### apps/worker (Python, 6 py files)
**What:** Background job runner; qEEG/MRI pipeline dispatch, document generation, DeepTwin simulation helper  
**Language:** Python 3.11+  
**Key files:**
- `app/main.py` — worker config and queue setup
- Job consumers for analyses, reports, simulations

**Entrypoint:** Callable job handlers expected by apps/api dispatch

---

### apps/brain-twin (placeholder, 0 active files)
**Note:** Directory exists but currently unmaintained; brain-twin logic lives in apps/deeptwin page + worker jobs

---

### apps/qeeg-trainer (Python, 7 py files)
**What:** Research/demo suite for qEEG model training and validation studies  
**Language:** Python 3.11+  
**Key files:**
- `src/qeeg_trainer/` — study definitions, benchmarks, cohort builders

---

## PACKAGES (Shared libraries)

### packages/core-schema (Python, 5 py files)
**What:** Pydantic domain models and API contracts shared by all apps/routers  
**Language:** Python 3.11+  
**Key files:**
- `models.py` — Patient, Session, QEEGAnalysis, MRIAnalysis, Report, Consent, etc.
- `condition_package.py` — ConditionPackage schema (evidence, protocols, device rules)
- `__init__.py` — exported types

**Exports:** BaseModel subclasses used throughout backend and shared packages

---

### packages/qeeg-pipeline (Python, 104 py files)
**What:** MNE-Python-based qEEG ingestion, preprocessing, feature extraction, analysis, reporting  
**Language:** Python 3.11+ (MNE-Python, SciPy, NumPy, specparam)  
**Key submodules:**
- `preprocess.py` — filter, ICA, artifact rejection
- `features/` — spectral, connectivity, source localization
- `ml/` — clustering, similarity scoring, conformal prediction
- `narrative/` — RAG-backed clinical summaries
- `normative/` — z-score, percentile, longitudinal comparison
- `report/` — HTML/PDF report generation
- `ai/` — AI copilot integration (Claude API)

**Public exports:** `from deepsynaps_qeeg import run_analysis, generate_report`

**Test files:** 20+ pytest tests

---

### packages/qeeg-encoder (Python, 29 py files)
**What:** Feature embeddings, tabular representations, conformal prediction intervals for qEEG  
**Language:** Python 3.11+  
**Key submodules:**
- `encoder.py` — main encoding logic
- `features/` — hand-crafted + learned feature sets
- `tabular/` — table serialization for downstream models
- `conformal/` — uncertainty quantification

**Exports:** `from qeeg_encoder import encode, predict_with_confidence`

---

### packages/mri-pipeline (Python, 31 py files)
**What:** NIfTI/DICOM ingestion, structural/fMRI/DTI analysis, incidental-finding triage, MRIQC wrapper  
**Language:** Python 3.11+ (nibabel, nilearn, FSL, SPM facades)  
**Key submodules:**
- `structural.py` — VBM, regional volumes, brain-age estimation
- `registration.py` — ANTs/SPM registration, atlas mapping
- `models/` — trained models (brain-age, pathology classifiers)
- `worker.py` — long-running pipeline coordinator

**Public exports:** `from deepsynaps_mri import run_analysis, validate_nifti`

**Test files:** 8+ pytest tests

---

### packages/evidence (Python, 12 py files)
**What:** Evidence grading, citation validation, audit trails, scoring logic  
**Language:** Python 3.11+ (Pydantic validation)  
**Key files:**
- `scoring.py` — evidence level calculator
- `validator.py` — citation validation, counter-evidence detection
- `audit.py` — immutable audit log schema

**Exports:** `from deepsynaps_evidence import grade_evidence, validate_citation`

**Test files:** 3 pytest tests

---

### packages/feature-store (Python, 41 py files)
**What:** Multimodal feature versioning, serving, streaming transforms, feature-store state management  
**Language:** Python 3.11+  
**Key submodules:**
- `serve.py` — HTTP/gRPC feature serving
- `definitions/` — feature catalogs (qEEG, MRI, wearable, PROM features)
- `transforms/` — normalization, scaling, interaction terms
- `streaming/` — Kafka-like event ingestion

**Exports:** `from deepsynaps_features import get_features, store_features`

---

### packages/safety-engine (Python, 2 py files)
**What:** Deterministic device compatibility checks, safety rules, contraindication logic  
**Language:** Python 3.11+  
**Key files:**
- `compatibility.py` — rule engine for device + condition safety

**Exports:** `from deepsynaps_safety_engine import check_compatibility`

---

### packages/generation-engine (Python, 2 py files)
**What:** Deterministic protocol/document generation from conditions + rules  
**Language:** Python 3.11+  
**Key files:**
- `protocols.py` — template-driven document builder

**Exports:** `from deepsynaps_generation_engine import generate_protocol`

---

### packages/render-engine (Python, 2 py files)
**What:** HTML/PDF rendering facade for reports, documents  
**Language:** Python 3.11+  
**Exports:** `from deepsynaps_render_engine import render_html, render_pdf`

---

### packages/core-schema, packages/condition-registry, packages/modality-registry, packages/device-registry (Python, 2 py each)
**What:** Structured registries (conditions, imaging modalities, devices) loaded at startup  
**Language:** Python 3.11+  
**Key files:**
- `registry.py` — in-memory lookup tables
- `data/` — JSON/YAML source files

**Exports:** `from deepsynaps_condition_registry import get_condition`

---

### packages/qa (Python, 8 py files)
**What:** QA helpers, smoke tests, spec checking  
**Language:** Python 3.11+  
**Key submodules:**
- `checks/` — runtime checks (schema, consistency, permissions)
- `specs/` — test specs for critical workflows

---

### packages/deepsynaps-core (Python, 5 py files)
**What:** Core primitives (timeline events, risk factors, agent bus)  
**Language:** Python 3.11+  

---

## SERVICES

### services/evidence-pipeline (Python, 21 py files)
**What:** Background evidence ingestion, literature watch, citation indexing  
**Language:** Python 3.11+  
**Key submodules:**
- `sources/` — PubMed, medical databases, vendor APIs  
- Scheduled jobs for evidence refresh

---

## DATA & CONFIG

### data/imports/clinical-database
201-record clinical dataset (DICOM, EDF, clinical metadata) imported on first launch

### data/snapshots/clinical-database
Generated runtime snapshots for QC and fallback

### data/conditions
Authoritative condition package JSON (structured evidence, protocols, device rules per condition)

### config/
- `evidence_rules.yaml` — evidence grading rules
- `review_thresholds.yaml` — approval gates
- Other governance YAMLs

---

## TESTING & VERIFICATION

**Backend tests:** 81 pytest files in apps/api/tests/  
**Frontend unit tests:** 26 .test.js files (Node.js test runner)  
**E2E tests:** Playwright config in apps/web/  
**Package tests:** Scattered in packages/*/tests/

**Build/lint:**
- Frontend: `npm run typecheck` (tsc), `npm run build` (Vite)
- Backend: `pytest`, no formal lint configured yet

---

## DEPLOYMENT

**Web:** Netlify (apps/web build, static site)  
**API:** Fly.io (FastAPI container, postgresql)  
**Scripts:** `scripts/deploy-preview.sh` for preview deploys

---

## INTERDEPENDENCIES

```
apps/web → apps/api (HTTP via VITE_API_BASE_URL)
apps/api → packages/core-schema, -condition-registry, -qeeg-pipeline, -mri-pipeline, -evidence, -feature-store, -safety-engine, -generation-engine, -render-engine
apps/worker → packages/qeeg-pipeline, -mri-pipeline, -generation-engine, -render-engine
services/evidence-pipeline → packages/evidence, -core-schema
```

All entry points are defined in pyproject.toml `[project]` name/version + top-level __init__.py exports.

