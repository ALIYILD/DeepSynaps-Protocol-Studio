# AGENTS.md — DeepSynaps Protocol Studio (MRI Analyzer focus)

Guidance for Cursor and automated agents working on **DeepSynaps**, especially the **MRI Analyzer** pipeline, API, and clinical UI.

---

## Project purpose

- **Monorepo** for DeepSynaps Studio: web app (`apps/web`), API (`apps/api`), MRI pipeline package (`packages/mri-pipeline`), QA schemas (`packages/qa`), and related services.
- **MRI Analyzer** delivers decision-support for neuromodulation planning: DICOM/NIfTI → processing → structured **`MRIReport`** JSON, artefacts, QC — **not** a medical device; clinician review required.

---

## Architecture principles

1. **Algorithms live in Python** — `packages/mri-pipeline/src/deepsynaps_mri/` (`pipeline.py`, `io.py`, `registration.py`, `structural.py`, `targeting.py`, etc.). The API **facades** this via `apps/api/app/services/mri_pipeline.py` (`HAS_MRI_PIPELINE` guard).
2. **UI is separate** — `apps/web/src/pages-mri-analysis.js` (and related) consume JSON; no segmentation or registration logic in the browser beyond viewers.
3. **Contracts are explicit** — `packages/mri-pipeline/portal_integration/api_contract.md` and Pydantic models in `schemas.py`. Targeting stays **pure** (no side effects in `targeting.py`).
4. **Wrap first, reimplement second** — integrate FreeSurfer SynthSeg, FastSurfer, FSL, ANTs via **thin adapters** under `deepsynaps_mri/adapters/` (`dcm2niix`, subprocess helpers; more CLIs migrating incrementally from `io.py` / `structural.py` / `qc.py`) and subprocess/container calls; do not rewrite recon-all or ANTs in one pass.

---

## Coding rules

- **Typed Python** preferred for new code in `deepsynaps_mri` (`TypedDict` / Pydantic / dataclasses for public surfaces).
- **No silent API changes** — if HTTP or JSON contract must change: version, migration notes, and update `api_contract.md` / consumers.
- **Explicit validation** — use `validation.py` and router-level checks; fail with stable error codes, not generic 500s where avoidable.
- **pytest required** for new Python modules and behavioral changes; mirror patterns in `packages/mri-pipeline/tests/`, `apps/api/tests/`.
- **No UI changes unless the task explicitly asks** for web/MRI Analyzer pages or styles.
- **Minimal diff** — do not refactor unrelated files or add dependencies without justification.

---

## Dependency rules

- **No unnecessary dependencies** — prefer stdlib + existing stack (`nibabel`, `antspyx`, `pydicom`, etc. per `packages/mri-pipeline`).
- New packages need a **one-line rationale** in the PR/commit (why not existing tools).
- Heavy optional stacks (GPU Docker, FSL) belong in **adapter layers** and CI profiles, not mandatory imports at API startup (keep `HAS_MRI_PIPELINE` pattern).

---

## Testing rules

- **Python:** `pytest` in `packages/mri-pipeline/tests/`, `apps/api/tests/` as applicable.
- **Web:** `npm run test` / `node --test` in `apps/web` per existing scripts.
- Prefer **fixtures + golden JSON** for MRI report shape (`packages/qa` specs); avoid huge binary fixtures in git — document external golden datasets if needed.

---

## Logging, provenance, and auditability

- **Structured logging** — use module loggers; include `analysis_id` / stage where available.
- **Every pipeline step should record:** inputs (paths + hashes where feasible), outputs (artefact paths), tool identity (name, version or container digest), **exit code / errors**, and logs under the run output directory.
- **No magical hidden state** — orchestration in `pipeline.py` with clear `PipelineContext`; adapters return typed results + paths.
- Aim for a **manifest** (JSON) per stage as the implementation matures (see roadmap in repo docs).

---

## External neuroimaging tools

- **Prefer adapters** under `deepsynaps_mri/adapters/` when present; consolidate scattered `subprocess` calls there over time (legacy: `io.py`, `structural.py`, `qc.py`).
- **Timeouts and capture** stdout/stderr to files under `out_dir/artefacts/`.
- **Document** required binaries/images in `packages/mri-pipeline/README.md` or `docs/`, not only in code comments.
- **Default policy:** SynthSeg / FastSurfer for structural speed; avoid **recon-all** as default (see `packages/mri-pipeline/CLAUDE.md`).
- **ANTs:** prefer existing `registration.py` (`antspyx`) — extend rather than duplicate CLI unless needed.

---

## Module boundaries

| Area | Owns | Must not own |
|------|------|----------------|
| `deepsynaps_mri/*` | Algorithms, QC, report generation, NIfTI/DICOM I/O | HTTP auth, DB migrations |
| `apps/api/app/services/mri_pipeline.py` | Import guard, demo report, calling `run_pipeline` | Core math/segmentation |
| `apps/api/app/routers/mri_analysis_router.py` | Uploads, jobs, HTTP codes | Pipeline internals |
| `apps/web/src/pages-mri-analysis.js` | Layout, viewers, empty states | Processing logic |
| `packages/qa` | Report validation schemas / golden shapes | Runtime pipeline |

---

## What not to do

- Force-push **`main`** or `--amend` pushed commits (see `CLAUDE.md`).
- Hardcode tokens or secrets.
- Change **`MRIReport`** field meanings without versioning / migration.
- Add **Slicer** or **full recon-all** as default production paths without explicit product approval.
- **One-shot** giant integrations (whole Nipype graph, full FSL suite) — ship incremental adapters.

---

## Explicit agent rules (checklist)

| Rule | Detail |
|------|--------|
| Wrap first, reimplement second | Adapters + contracts before native rewrites |
| No silent API changes | Contract docs + clients updated |
| Pipeline observability | Inputs, outputs, artefacts, errors recorded per step |
| Typed Python preferred | Public functions in `deepsynaps_mri` |
| pytest for new modules | Required |
| No UI unless requested | Especially `pages-mri-analysis.js` / `styles.css` |
| No unnecessary dependencies | Justify every addition |

---

## Nested AGENTS.md (optional)

This repo is **multi-package**. Add focused `AGENTS.md` files where agents spend most time:

| Path | Scope |
|------|--------|
| `packages/mri-pipeline/AGENTS.md` | Python MRI pipeline, adapters, schemas, tests |
| `apps/api/AGENTS.md` | FastAPI routes, services, MRI router, migrations |
| `apps/web/AGENTS.md` | Vite app, MRI Analyzer page, unit tests |

Keep **this root file** as the default; nested files **override or specialize** for their subtree only.

---

## Quick references

- MRI package spec: `packages/mri-pipeline/docs/MRI_ANALYZER.md`, `packages/mri-pipeline/CLAUDE.md`
- API contract: `packages/mri-pipeline/portal_integration/api_contract.md`
- Session/deploy notes: `CLAUDE.md` (repo root)
- **12-prompt MRI audit (what is merged vs missing):** `packages/mri-pipeline/docs/PROMPT_AUDIT_MRI.md`
