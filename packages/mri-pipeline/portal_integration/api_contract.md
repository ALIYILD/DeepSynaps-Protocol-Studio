# API contract — DeepSynaps MRI Analyzer

Base URL: `${INTERNAL_API}/mri`
Auth: dashboard session cookie (forwarded JWT)
All responses: `application/json` unless specified.

## 1. `POST /upload`
Multipart form:
- `patient_id`: string (required)
- `file`: application/zip (DICOMs) or `.nii.gz` (already-converted NIfTI)

Response:
```json
{ "upload_id": "b1a74…", "path": "/var/ds_mri/uploads/b1a74…", "patient_id": "DS-2026-000123" }
```

## 2. `POST /analyze`
Form fields:
- `upload_id` (required)
- `patient_id` (required)
- `condition` (default `"mdd"`) — one of the `kg_entities.code` values: `mdd`, `ptsd`, `ocd`, `alzheimers`, `parkinsons`, `chronic_pain`, `tinnitus`, `stroke`, `adhd`, `tbi`, `asd`, `insomnia`
- `age` (optional int)
- `sex` (optional `F | M | O`)
- `run_mode` (default `"background"`; `"sync"` blocks — tests only)

Response:
```json
{ "job_id": "…", "state": "queued" }
```

## 3. `GET /status/{job_id}`
```json
{ "job_id": "…", "state": "STARTED|PROGRESS|SUCCESS|FAILURE", "info": { "stage": "fmri" } }
```

## 4. `GET /report/{analysis_id}`
Returns a full `MRIReport` object — see `src/deepsynaps_mri/schemas.py::MRIReport` for the authoritative Pydantic schema. See `demo/sample_mri_report.json` for a concrete example.

## 5. `GET /report/{analysis_id}/pdf`
Returns `application/pdf`.

## 6. `GET /report/{analysis_id}/html`
Returns `text/html` — full standalone Jinja-rendered report suitable for printing.

## 7. `GET /overlay/{analysis_id}/{target_id}`
Returns `text/html` (nilearn `view_img`) — intended to be embedded via `<iframe src=…>` in the portal. Each target has one interactive viewer.

## 8. `GET /medrag/{analysis_id}?top_k=20`
Delegates to the qEEG MedRAG retrieval module. Returns:

```json
{
  "analysis_id": "…",
  "results": [
    { "paper_id": 51907, "title": "…", "doi": "…", "year": 2024, "score": 0.91,
      "hits": [{"entity": "sgACC_DLPFC_anticorrelation", "relation": "stim_target_for"}] },
    ...
  ]
}
```

## 9. WebSocket (optional, Phase 2)
`WS /ws/mri/status/{job_id}` — streams pipeline stage events as they complete (`{"stage": "structural", "status": "done"}`).
