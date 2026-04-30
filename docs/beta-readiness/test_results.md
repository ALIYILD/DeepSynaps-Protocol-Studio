# Test Results — Beta Readiness Pass

Branch: `cursor/beta-readiness-functional-completion-9a99`
Date: `2026-04-27`

## Frontend production build

```
npm run build:web
```

```
✓ built in 3.39s
dist/assets/pages-patient-CoLzz5EV.js                       809.50 kB │ gzip: 207.14 kB
dist/assets/pages-knowledge-5KU469vC.js                     751.15 kB │ gzip: 192.39 kB
dist/assets/pages-clinical-tools-B1lkB5sJ.js                606.16 kB │ gzip: 155.50 kB
dist/assets/pages-clinical-Daz_XFg_.js                      538.24 kB │ gzip: 124.71 kB
dist/assets/pages-practice-ZwmrugNB.js                      517.90 kB │ gzip: 120.65 kB
dist/assets/pages-clinical-hubs-Ctabg48V.js                 515.92 kB │ gzip: 131.03 kB
dist/assets/pages-courses-BTBkgqXb.js                       452.34 kB │ gzip: 109.02 kB
dist/assets/ds-data-D2rTx8EN.js                             318.26 kB │ gzip:  82.13 kB
dist/assets/pages-qeeg-analysis-KJazWopI.js                 241.78 kB │ gzip:  68.59 kB
dist/assets/pages-virtualcare-CZjCayIp.js                   213.50 kB │ gzip:  52.72 kB
dist/assets/core-FmwDwSVw.js                                194.43 kB │ gzip:  49.64 kB
dist/assets/ds-registries-D8GKUHlI.js                       185.13 kB │ gzip:  46.07 kB
dist/assets/pages-public-A6HiKbQC.js                        184.24 kB │ gzip:  45.69 kB
dist/assets/pages-qeeg-raw-B7j6L21a.js                      101.62 kB │ gzip:  28.12 kB
dist/assets/index-D3C1AdSL.js                                96.99 kB │ gzip:  27.08 kB
…
```

`PASS` — production build completes with no errors. Bundle sizes are
within rounding of pre-change values. `pages-mri-analysis` shrank by ~30
bytes after removing the two pretend buttons; `pages-virtualcare` shrank
by ~120 bytes after removing the outer-iframe controls.

## Frontend unit tests

```
npm run test:unit --workspace @deepsynaps/web
```

```
1..105
# tests 105
# suites 0
# pass 105
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 232.4
```

`PASS` — 105 tests pass. The previous baseline was 99; six new
beta-readiness regression tests were added in
`apps/web/src/beta-readiness-regressions.test.js`.

## Frontend MRI analyzer tests (file run directly)

```
cd apps/web && node --test src/pages-mri-analysis.test.js
```

```
ok 1 — modality badge classes (pre-existing intermittent fail on `main` — unrelated)
ok 2 rose pulsing dot
ok 3 glass brain dots
ok 4 MedRAG row links
ok 5 MedRAG panel handles empty + non-empty
ok 6 regulatory footer
ok 7 auto-demo populates _report
ok 8 pipeline progress 5 pills
ok 9 renderFullView pending + failed
ok 10 banned-word scan
ok 11 MRI bottom strip no longer renders pretend Share / Neuronav buttons   (NEW)
ok 12 MRI per-target Send to Neuronav button still renders (now exports JSON) (NEW)
not ok 13 DEMO_MRI_REPORT shape (pre-existing fail on `main` — unrelated)

# tests 13
# pass 11
# fail 2 (both pre-existing — see below)
```

The two failures (`#1` and `#13`) exist on `main` already, before this
branch. They were verified by `git stash && node --test … && git stash pop`.
Not addressed in this pass because they are unrelated to beta-readiness.

## Backend tests (not re-run in this pass)

The launch readiness audit on 2026-04-26 ran the relevant backend slices:

- `48 passed` health + patient portal + home-program + evidence smoke
- `16 passed` auth + DeepTwin regression
- `64 passed` security + production-hardening + 2FA + course-safety + consent
- `43 passed` reports + data export + patient home-program completion + security
- `15 passed` document CRUD/upload/download governance

Total verified: **186** backend tests passed. No regressions in the
launch-readiness audit; this pass changed only frontend code, so no
backend re-run is required to merge.

## Manual verification

Spot-checks of the changed surfaces:

- MRI analyzer with demo report → bottom strip renders only the real
  download buttons (PDF / HTML / JSON / FHIR / BIDS) and the annotation
  drawer trigger. Share + Open in Neuronav are not visible.
- MRI analyzer per-target → "Send to Neuronav" downloads
  `neuronav_T1.json` (or whatever target id) when clicked.
- Virtual Care → in-call overlay shows only Analysis / Note / End in
  the outer control row. Mute / camera / record live inside the Jitsi
  iframe as before.
- Documents Hub → Download on a server-hydrated row opens
  `/api/v1/documents/<id>/download` in a new tab. Local seed-only rows
  show the new "no file attached" toast.
