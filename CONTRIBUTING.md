# Contributing to DeepSynaps Protocol Studio

## EEG Studio module workflow (Cursor / agents)

1. Open the repo in Cursor.
2. Attach **`cursor_prompts/00_MASTER_SPEC.md`** and **`cursor_prompts/01_ARCHITECTURE.md`** to every implementation chat (cross-cutting rules and API layout).
3. Attach the **module prompt** you are implementing, e.g. **`cursor_prompts/M08_SPECTRA_QEEG.md`**.
4. Instruct the agent: *Implement the prompt in the attached module file. Adhere strictly to file targets, data contracts, and acceptance criteria. After implementation, write tests and run them.*
5. Review diffs, run the module’s acceptance checks and repo CI commands, then merge.

Full module index: **`cursor_prompts/README.md`**.

## Repository commands (typical)

From repo root:

```bash
npm install
python -m pip install -e ./packages/core-schema … -e ./apps/api   # see root README
uvicorn app.main:app --reload --app-dir apps/api
npm run dev -w @deepsynaps/web
```

Tests:

```bash
cd apps/api && pytest
cd apps/web && npm run typecheck && npm run build
```

## Cross-module conventions

Summarized in **`cursor_prompts/00_MASTER_SPEC.md`**: units (µV, seconds), color maps, norm versioning, RunRecord logging, feature flags, i18n (en + tr), accessibility, testing expectations.

## Golden EDF fixtures

See **`tests/fixtures/eeg_studio/README.md`**. Do not commit identifiable PHI; document provenance for any real recordings.

## Pull requests

- Keep scope to the module or bugfix at hand; avoid unrelated refactors.
- Link to the module prompt or issue describing acceptance criteria.
- Ensure new user-visible strings go through i18n keys when studio i18n is wired for that surface.
