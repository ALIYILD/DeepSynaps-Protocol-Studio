# DeepTwin 360 Dashboard

A single doctor-facing rollup that collects all available patient data into one
clinician-reviewable surface. Available as a tab inside the existing DeepTwin
page (`Overview · 360 Dashboard · Simulations · Notes · Review`).

The dashboard is **honest about gaps** — domains the platform has no
ingestion path for are reported `unavailable`; domains that exist but have no
rows for this patient are reported `missing`. We never invent values.

## Endpoint

```
GET /api/v1/deeptwin/patients/{patient_id}/dashboard
```

- Requires clinician/admin role (`_require_clinician_review_actor`).
- Cross-clinic owner gate via `_gate_patient_access` (404 for unknown
  patients; 403 with `cross_clinic_access_denied` for cross-clinic).
- Writes an audit row with `action="dt360_opened"`, target type
  `deeptwin_dashboard`, target id = patient_id, note prefixed
  `deeptwin.dashboard.opened`.

## Payload shape

```jsonc
{
  "patient_id": "pat-360-1",
  "generated_at": "2026-04-30T19:41:28Z",
  "patient_summary": {
    "name": "Alice Doe",
    "age": 33,
    "diagnosis": ["ADHD", "anxiety"],
    "phenotype": [],
    "primary_goals": [],
    "risk_level": "unknown"
  },
  "completeness": {
    "score": 0.227,
    "available_domains": 4,
    "partial_domains": 2,
    "missing_domains": 12,
    "high_priority_missing": ["qeeg", "assessments", "treatment_sessions",
                              "safety_flags", "outcomes"]
  },
  "safety": {
    "adverse_events": [/* from AdverseEvent rows */],
    "contraindications": [],
    "red_flags": [/* from WearableAlertFlag rows */],
    "medication_confounds": []
  },
  "domains": [
    {
      "key": "qeeg",
      "label": "EEG / qEEG",
      "status": "missing",
      "record_count": 0,
      "last_updated": null,
      "summary": "No qEEG records on file.",
      "warnings": [],
      "source_links": [],
      "upload_links": [
        { "label": "Upload qEEG", "href": "/qeeg-analysis", "kind": "qeeg" }
      ]
    }
    // ... 21 more
  ],
  "timeline": [],
  "correlations": [],
  "outcomes": {
    "series_count": 0, "event_count": 0, "summary": "No outcomes on file."
  },
  "prediction_confidence": {
    "status": "placeholder",
    "real_ai": false,
    "confidence": null,
    "confidence_label": "Not calibrated",
    "summary": "Decision-support only. Requires clinician review.",
    "drivers": [],
    "limitations": [
      "No validated outcome dataset bound to this engine.",
      "Encoders are deterministic feature extractors, not trained ML.",
      "Predictions must not be used as autonomous treatment recommendations."
    ]
  },
  "clinician_notes": [],
  "review": {
    "reviewed": false, "reviewed_by": null, "reviewed_at": null
  },
  "disclaimer": "Decision-support only. Requires clinician review. ..."
}
```

## The 22 domains

| # | Key | Source today | Default status when no data |
|---|---|---|---|
| 1  | `identity`            | `Patient` row                       | `available` (always) |
| 2  | `diagnosis`           | `Patient.primary_condition`, `secondary_conditions`, `PhenotypeAssignment` | `missing` |
| 3  | `symptoms_goals`      | `Patient.notes`, `Message`          | `missing` |
| 4  | `assessments`         | `AssessmentRecord`                  | `missing` |
| 5  | `qeeg`                | `QEEGRecord`                        | `missing` |
| 6  | `mri`                 | `MriAnalysis`                       | `missing` |
| 7  | `video`               | `VideoAnalysis`                     | `missing` |
| 8  | `voice`               | `VoiceAnalysis`                     | `missing` |
| 9  | `text`                | `Message` (journal not modelled)    | `missing` |
| 10 | `biometrics`          | `WearableObservation`               | `missing` |
| 11 | `wearables`           | `WearableDailySummary`              | `missing` |
| 12 | `cognitive_tasks`     | — none —                            | `unavailable` |
| 13 | `medications`         | `PatientMedication`                 | `missing` |
| 14 | `labs`                | — none —                            | `unavailable` |
| 15 | `treatment_sessions`  | `ClinicalSession`                   | `missing` |
| 16 | `safety_flags`        | `AdverseEvent` + `WearableAlertFlag`| `missing` |
| 17 | `lifestyle`           | `WearableDailySummary` (sleep only) | `missing` |
| 18 | `environment`         | — none —                            | `unavailable` |
| 19 | `caregiver_reports`   | — none —                            | `unavailable` |
| 20 | `clinical_documents`  | `DocumentTemplate` (templates only) | `partial` |
| 21 | `outcomes`            | `OutcomeSeries` + `OutcomeEvent`    | `missing` |
| 22 | `twin_predictions`    | DeepTwin engine (placeholder)       | `partial` (with warning) |

`unavailable` domains carry an explicit warning — "Domain is structurally
unavailable, not data-missing" — so the doctor knows the gap is platform-level.

## Frontend

Tab is added to `apps/web/src/pages-deeptwin.js`. The 360 view lives in
`apps/web/src/deeptwin/dashboard360.js`:

- 4 top cards: Patient Summary · Twin Completeness Score · Safety / Risk Flags · Clinician Review Status.
- 22-domain grid: every domain card has icon (label), status badge,
  record count, latest update, summary, warnings, and **upload links**
  (e.g. "Upload qEEG", "Submit assessment", "Connect device") that hand
  off to the existing upload surfaces.
- 6 bottom panels: Patient Timeline · Outcomes & Progress · Medication /
  qEEG Confounds · Correlation Explorer · DeepTwin Prediction & Confidence
  · Clinician Notes.
- Safety footer is fixed at the bottom with the standard caution language.

## Quick-upload behaviour

The 360 dashboard is the doctor's hub: most data flows in from other pages
(qEEG analyzer, MRI analyzer, assessments hub, sessions log, devices), and
each domain card carries a quick-upload button that navigates to that
existing surface. The endpoint never invents an upload path — it only
emits `upload_links` for surfaces the codebase already has.

## Safety wording

Every dashboard render shows:

- "Decision-support only"
- "Requires clinician review"
- "Correlation does not imply causation"
- "Predictions are uncalibrated unless validated"
- "Not an autonomous treatment recommendation"

## Tests

| Layer | File |
|---|---|
| Backend | `apps/api/tests/test_deeptwin_dashboard.py` |
| Frontend (smoke) | `apps/web/src/deeptwin/dashboard360.js` is bundle-tested by `vite build` |
| E2E | `apps/web/e2e/08-deeptwin-360.spec.ts` |

Backend test cases:

1. valid patient returns dashboard payload
2. invalid patient returns 404
3. cross-clinic access blocked (403)
4. payload includes all 22 domains
5. missing domains are not faked
6. safety flags included when present
7. `prediction_confidence` is honest when model is placeholder
8. audit event written

Run:

```bash
python -m pytest apps/api/tests/test_deeptwin_dashboard.py -q
cd apps/web && npx vite build
cd apps/web && npx playwright test e2e/08-deeptwin-360.spec.ts
```

## Roadmap (deferred)

- Wire ingestion paths for the 4 `unavailable` domains (cognitive tasks,
  labs, environment, caregiver reports).
- Add per-patient clinical-document timeline (`clinical_documents` →
  `available`).
- Replace `prediction_confidence.status="placeholder"` with calibrated
  output once a validated outcome dataset is bound.
- Surface `correlations` and `timeline` arrays from the DeepTwin v1
  endpoints inside the bottom panels (currently shown as "no data" stubs).
- Editable clinician review block (button to mark reviewed).
