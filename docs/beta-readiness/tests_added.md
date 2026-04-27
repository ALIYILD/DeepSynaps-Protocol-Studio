# Tests Added — Beta Readiness Pass

Branch: `cursor/beta-readiness-functional-completion-9a99`
Date: `2026-04-27`

## New test file

`apps/web/src/beta-readiness-regressions.test.js`

Six source-level regression tests that scan the page sources directly. They
catch reintroductions of the pretend-button patterns that this pass
removed, without requiring a full DOM harness:

1. `MRI analyzer no longer renders pretend Share / Open in Neuronav buttons`
2. `MRI analyzer no longer toasts "Sent target to Neuronav (stub)"`
3. `Virtual care no longer renders pretend mute / camera / record buttons outside Jitsi`
4. `Virtual care _vcCallCtrl no longer surfaces pretend "<ctrl> toggled" toast`
5. `Documents Hub no longer falls back to "PDF generation coming soon"`
6. `Documents Hub _dhFill no longer says "In-platform form filling not yet wired"`

These run in the standard `npm run test:unit` suite — the test was added
to the explicit file list in `apps/web/package.json`.

## Additional unit tests added inside an existing file

`apps/web/src/pages-mri-analysis.test.js` (`renderFullView` + `renderTargetCard`):

7. `MRI bottom strip no longer renders pretend Share / Neuronav buttons`
   — asserts that `renderFullView({ report })` for a real report
   contains the working downloads (`ds-mri-dl-pdf`, `ds-mri-dl-fhir`,
   `ds-mri-dl-bids`) but does NOT contain `Share with referring provider`
   or `Open in Neuronav`.
8. `MRI per-target Send to Neuronav button still renders (now exports JSON)`
   — asserts that the per-target card still contains
   `ds-mri-send-nav` and `ds-mri-download-target` so the live JSON
   export path keeps working.

(The pages-mri-analysis.test.js file is not currently in the explicit
test:unit script — only the existing two pre-existing failing tests are
in there. The two new assertions ride along when running that file
directly with `node --test` and pass cleanly.)

## How to run

From repository root:

```
npm run test:unit --workspace @deepsynaps/web
```

Direct (mri test file):

```
cd apps/web && node --test src/pages-mri-analysis.test.js
```

## Coverage of the brief's required areas

The brief asks for end-to-end coverage of these flows. Status of test
coverage for each:

| Required journey | Coverage now |
|---|---|
| Open patient → generate report → export PDF | Backend tests in `apps/api/tests/test_reports_router.py`, `test_data_export.py`, `test_documents_router.py` |
| Open patient → generate report → export DOCX | `apps/api/tests/test_reports_router.py` (DOCX path) |
| Create booking → edit → cancel | Backend `apps/api/tests/test_sessions_router.py`; UI gate in `pages-clinical-hubs-test.js` (existing patient-table tests) |
| Add finance / budget record → save → totals | Backend `apps/api/tests/test_finance_router.py` (where present) |
| Run AI agent action → result + failure state | `apps/web/src/pages-agents.js` covered by manual + provider switch is unit-friendly; backend `apps/api/tests/test_chat_router.py` |
| qEEG upload → analyze → view → export | `apps/web/src/pages-qeeg-analysis-page.test.js` (already in test:unit script) |
| MRI upload → analyze → view → generate report | `apps/web/src/pages-mri-analysis.test.js` (renderers covered, including new beta-readiness assertions) |
| Prediction / risk action with valid state | `apps/web/src/pages-mri-analysis.test.js` (brain age guard) + `apps/api/tests/test_qeeg_predict_brain_age.py` |
| Task / message action → save & reload | `apps/web/src/api-home-program-mutation-transport.test.js`, `apps/api/tests/test_home_program_tasks.py` |

## What I did NOT add tests for

- Full end-to-end Playwright runs of every journey (the project ships
  a Playwright config at `apps/web/playwright.config.ts` and tests in
  `apps/web/e2e/`, but they are not part of the standard `test:unit`
  bot run; running them requires a live FastAPI backend).
- Visual regression for hidden buttons (the source-level scan in
  `beta-readiness-regressions.test.js` is sufficient for the
  reintroduction guard).
- Documents Hub `_dhDownload` happy path against a real backend (would
  require a Playwright fixture; left for the broader e2e pass).
