# Doctor-ready qEEG / ERP / Source Localization Report (Agent 4)

**Branch:** `doctor-ready/e2e-validation-and-hardening`  
**PR:** #515 (draft)  
**Date:** 2026-05-05  
**Scope:** qEEG Raw Workbench + Manual Analysis, ERP tab + BIDS sidecar mapping, Source Localization wording and safe unavailable states.  
**Constraints respected:** no new features; no QEEG-105 registry/status changes; no weakening of WinEEG/LORETA/ERP caveats.

## Tests run

### qEEG pipeline package

```bash
python3 -m pytest -q packages/qeeg-pipeline
```

- **Result:** PASS (`139 passed, 3 skipped`)
- **Notes:** warnings observed from MNE connectivity fmin cycles and malformed EDF measurement date handling; tests still pass.

### API (qEEG raw/workbench + Studio ERP security + BIDS export)

```bash
cd apps/api
python3 -m pytest -q -n 0 \
  tests/test_qeeg_raw_workbench.py \
  tests/test_qeeg_workbench_integration.py \
  tests/test_qeeg_mne_pipeline_router.py \
  tests/test_qeeg_workflow_smoke.py \
  tests/test_qeeg_clinical_workbench.py \
  tests/test_qeeg_security_audit.py
```

- **Result:** PASS
  - `95 passed, 1 skipped` (raw/workbench/mne/security set)
  - `97 passed` (workflow smoke / clinical workbench / security set)

### Web unit tests (qEEG raw workbench + ERP tab)

```bash
cd apps/web
node --test src/pages-qeeg-raw-workbench.test.js src/pages-qeeg-analysis-erp-tab.test.js
```

- **Result:** PASS (`55 pass`)

### Web build/unit (Node20 requirement)

- `npm run build` **cannot be validated in this VM** because Node is v18; Vite 7 requires Node 20+. This is already documented as an environment constraint in the doctor-ready checklist and enforced by CI (Node 20).

## Validation findings (UI/wording/workflow)

### 1) qEEG Raw Workbench / Manual Analysis

- **Manual Analysis tab present**: the Raw Workbench includes “Manual Analysis Mode” with “reference only” pills for analysis concepts.
- **Artifact workflow present**: artifact marking, bad-channel marking, reject epoch, interpolation, ICA/PCA guidance are all present and wired (tests assert handlers).
- **Event marker workflow present**: “Create event marker” + segment labeling present; explicit note that ERP sync terms are reference-only unless ERP workflow active.
- **Minimap / overlays present**: minimap row exists (`qwb-minimap`), event markers render on timeline, and “immutable raw EEG” overlay language remains.
- **Safety wording**:
  - Manual Analysis banner states **manual workflow reference only**, **no native WinEEG compatibility**, **clinician review required**.
  - “Decision-support only” is explicitly positioned as guidance (ICA/PCA guidance note + status bar tooltip behavior covered by unit tests).

### 2) ERP (separate from resting qEEG)

- **ERP tab is explicitly separated** from resting qEEG epochs (`pages-qeeg-analysis.js` comments + guardrails in markup; unit test asserts guardrails).
- **BIDS sidecar flow + mapping preview present**:
  - `events.tsv` upload UI and mapping table logic present.
  - Unit test verifies **persisted BIDS summary restores after reload** and session upload overrides persisted analysis.
- **Guardrails visible**:
  - “Decision-support only — ERP” banner + explicit message that resting qEEG segmentation is not used when ERP markers missing.
- **No normative/diagnostic ERP claims** found in the audited UI text for the ERP tab.

### 3) Source Localization (Studio)

- The Studio source menu uses “Source distribution (LORETA)… / Spectra power distribution (LORETA)…”.
- **No “official LORETA” or “WinEEG LORETA”** wording was introduced by this sprint.
- **Safe unavailable state** exists in the Raw Workbench manual analysis panel: “Source imaging: Not computed in this workbench” (reference-only pill), preventing implied computation where it is not present.

## Issues fixed

1) **Web unit test copy drift**: Raw Workbench manual-analysis unit test expected an outdated “LORETA / sLORETA: Not computed…” string and “WinEEG-style …” phrasing that no longer matches the UI wording.\n
   - Fix: updated `apps/web/src/pages-qeeg-raw-workbench.test.js` to match the current, safer copy:\n
     - “Source imaging: Not computed in this workbench”\n
     - “Manual workflow reference only. DeepSynaps does not claim native WinEEG compatibility here. Clinician review required.”

## Remaining risks / gaps (transparent)

- **ERP-focused API test filenames** in the prompt (`tests/test_qeeg_erp_router.py`, `tests/test_erp_bids_events.py`) **do not exist** in this repo. Coverage instead exists via:\n
  - `tests/test_qeeg_security_audit.py` (includes Studio ERP endpoints)\n
  - `tests/test_qeeg_workflow_smoke.py` and `tests/test_qeeg_clinical_workbench.py` (covers BIDS export gating)\n
  If dedicated ERP/BIDS-sidecar upload endpoints exist under other routers, they should get explicit tests under the correct filenames for clarity.
- **Web build/e2e not runnable in this VM** due to Node 18; CI Node 20 is the validation gate.
- **Studio LORETA label**: While not claimed “official”, the UI still uses the term “LORETA / sLORETA”. If clinical positioning requires “MNE source imaging (sLORETA-style)” wording, that should be handled as a deliberate copy/spec decision (not changed here).

## Doctor-ready verdict (qEEG / ERP / Source)

- **qEEG Raw Workbench:** **Doctor-ready for supervised demo** (manual analysis + cleaning workflow present; strong decision-support/immutable-raw language; no WinEEG compatibility claim).\n
- **ERP tab:** **Doctor-ready for supervised demo** (separate workflow, mapping preview, persistence behavior tested, guardrails visible).\n
- **Source Localization (Studio):** **Doctor-ready with caveats** (terminology is present; no “official” claims; raw workbench correctly avoids implying computation).  

