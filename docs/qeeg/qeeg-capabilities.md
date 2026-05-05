# qEEG capabilities endpoint (`GET /api/v1/qeeg/capabilities`)

Decision-support only. Clinician review required.

This endpoint exposes a **lightweight capability/dependency report** for the qEEG stack so clinicians and developers can see which optional qEEG features are available in a given deployment **without running any analyses**.

## Safety boundaries

- **No heavy computation**: the endpoint only checks dependency presence (via `importlib.util.find_spec`) and minimal config state (env-var presence, file existence).
- **No secrets**: env var **values** are never returned; only whether required env keys are present.
- **No WinEEG compatibility claims**: WinEEG is **reference-only workflow guidance**; `wineeg_reference.status` is always `reference_only` and `native_file_ingestion` is always `false`.
- **Normative DB honesty**: deployments using the toy CSV norms are labeled `toy` explicitly.

## Endpoint

- **Method**: `GET`
- **Path**: `/api/v1/qeeg/capabilities`
- **Auth**: none (mirrors other qEEG “status/info” surfaces; change only with explicit product decision)

## Response shape (stable)

```json
{
  "status": "ok",
  "generated_at": "2026-05-05T11:05:37.123456+00:00",
  "features": [
    {
      "id": "mne_ingest",
      "label": "MNE EEG file ingest",
      "status": "active",
      "required_packages": ["mne"],
      "missing_packages": [],
      "required_env": [],
      "missing_env": [],
      "clinical_caveat": "Decision-support only. Clinician review required.",
      "ui_surfaces": ["qEEG Analyzer", "Raw Workbench"],
      "notes": "..."
    }
  ],
  "normative_database": {
    "status": "toy",
    "version": "toy-0.1",
    "clinical_caveat": "Toy normative database only. Decision-support only. Clinician review required. Do not treat toy norms as clinically validated reference values."
  },
  "wineeg_reference": {
    "status": "reference_only",
    "native_file_ingestion": false,
    "caveat": "No native WinEEG compatibility. Reference-only checklist and workflow guidance."
  }
}
```

## Feature status semantics

`features[].status` is one of:

- `active`: dependency/config present for the feature’s normal path
- `fallback`: feature exists but is running a reduced/shape-preserving fallback (example: connectivity zero-matrix fallback when `mne_connectivity` is missing)
- `unavailable`: not available in this deployment
- `reference_only`: guidance-only (WinEEG workflow reference)
- `experimental`: present but treated as not clinically validated / gated / heavy (example: toy norms; source localization; live streaming)

## Normative DB detection

- **configured**: `DEEPSYNAPS_QEEG_NORM_CSV_PATH` is set and points to a readable file
- **toy**: toy CSV fixture is present (default dev/test path)
- **unavailable**: neither configured nor toy detected

## Implementation locations

- **Backend router**: `apps/api/app/routers/qeeg_capabilities_router.py`
- **Registration**: `apps/api/app/main.py`
- **Frontend panel** (Raw Workbench help panel):
  - API client: `apps/web/src/api.js` (`api.getQEEGCapabilities()`)
  - UI render: `apps/web/src/pages-qeeg-raw-workbench.js` (stable selectors below)

## Frontend stable selectors

- `qeeg-capabilities-panel`
- `qeeg-capability-row`
- `qeeg-capability-status`
- `qeeg-wineeg-reference-status`
- `qeeg-norm-db-status`

