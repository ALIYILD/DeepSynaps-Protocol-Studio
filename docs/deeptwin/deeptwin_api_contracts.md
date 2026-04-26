# DeepTwin TRIBE API contracts

All endpoints live under `/api/v1/deeptwin/` and are authenticated like
the rest of the DeepTwin surface. Tag in OpenAPI: `deeptwin-tribe`.

Every response carries a top-level `disclaimer` and the
`SimulationOutput.labels` block (`simulation_only`, `not_a_prescription`,
`decision_support_only`, `requires_clinician_review`). All
`approval_required` flags are hard-coded to `True`.

---

## Shared models

### `TribeProtocolModel` (request)

```jsonc
{
  "protocol_id": "A",                  // required, non-empty
  "label": "Left DLPFC 10 Hz",         // optional
  "modality": "tdcs",                  // tms | tdcs | tacs | ces | pbm | behavioural | therapy | medication | lifestyle
  "target": "Fp2",                     // optional
  "frequency_hz": 10,                  // optional
  "current_ma": 2.0,                   // optional
  "duration_min": 20,                  // optional
  "sessions_per_week": 5,              // optional
  "weeks": 5,                          // optional
  "contraindications": ["seizure_history"],
  "adherence_assumption_pct": 80.0,    // 0..100
  "notes": "Free-text note"
}
```

### `TribeSamplesModel` (request, optional)

Optional dict letting callers override any modality's raw input. All
fields default to `null`; missing fields trigger the encoder's
`patient_id`-seeded synthetic path.

```jsonc
{
  "qeeg":   { "band_powers": { "alpha_z": -0.3 }, "artifact_pct": 0.06 },
  "mri":    { "brain_age_delta": 1.2, "regions": { "dlpfc_thickness_z": -0.5 } },
  "assessments":       { "phq9_total": 14, "n_assessments_90d": 5 },
  "wearables":         { "sleep_total_min_avg": 410, "days_with_data": 26 },
  "treatment_history": { "n_prior_sessions": 8, "median_response_pct": 22 },
  "demographics":      { "age": 34, "sex": "female", "primary_diagnosis": "anxiety" },
  "medications":       { "medications": ["ssri", "stimulant"] },
  "text":              { "journal_entries": ["I felt better today after sleep."] },
  "voice":             { "n_samples": 3, "f0_mean_hz": 175 }
}
```

---

## `POST /simulate-tribe`

Single-protocol simulation.

**Request**

```jsonc
{
  "patient_id": "pat-1",
  "protocol":   { /* TribeProtocolModel */ },
  "horizon_weeks": 6,                  // 1..26
  "samples":  { /* TribeSamplesModel optional */ },
  "profile":  { /* optional dict, free-form */ },
  "only_modalities": ["qeeg", "assessments"],   // optional subset
  "include_explanations": true,
  "include_evidence": true,
  "include_uncertainty": true
}
```

**Response**

```jsonc
{
  "patient_id": "pat-1",
  "horizon_weeks": 6,
  "output": {
    "patient_id": "pat-1",
    "protocol":   { /* echo */ },
    "horizon_weeks": 6,
    "heads": {
      "symptom_trajectories":   [ /* TrajectoryHead */ ],
      "biomarker_trajectories": [ /* TrajectoryHead */ ],
      "risk_shifts": [
        { "name": "Drop-out risk", "delta": -0.04, "direction_better": "lower", "evidence_grade": "low" }
      ],
      "response_probability": 0.42,
      "response_confidence":  "moderate",
      "adverse_risk": {
        "level": "elevated|baseline",
        "concerns": ["seizure_history"],
        "monitoring_plan": ["…"]
      },
      "latent_state_change": { "direction": "improving|uncertain", "magnitude": 0.18, "explanation": "…" }
    },
    "explanation": {
      "top_modalities":      [{ "modality": "wearables", "weight": 0.21, "quality": 0.84 }],
      "top_drivers":         [{ "modality": "wearables", "feature": "sleep_total_min_avg", "weight": 0.43, "direction": "↑" }],
      "missing_data_notes":  ["Modality 'mri' is missing — its drivers were not used in this prediction."],
      "cautions":            ["DeepTwin output is decision-support only, not a prescription or diagnosis.", "…"],
      "evidence_grade":      "low|moderate",
      "rationale":           "Estimated response probability 0.42 for protocol A (tdcs). …"
    },
    "approval_required": true,
    "labels":            { "simulation_only": true, "not_a_prescription": true, "decision_support_only": true, "requires_clinician_review": true },
    "disclaimer":        "Decision-support only. …"
  },
  "disclaimer": "Decision-support only. …"
}
```

`TrajectoryHead` is `{ metric, units, baseline, points: [{ week, point, ci_low, ci_high }], direction_better }`.

`include_explanations=false` strips the `explanation` block.
`include_uncertainty=false` strips `ci_low`/`ci_high` from each point.

---

## `POST /compare-protocols`

Rank ≥2 candidate protocols.

**Request** — `protocols` length must be in `[2, 8]`.

```jsonc
{
  "patient_id": "pat-1",
  "protocols": [ /* TribeProtocolModel */, /* TribeProtocolModel */ ],
  "horizon_weeks": 6,
  "samples": { … },
  "profile": { … },
  "only_modalities": ["qeeg", "wearables"]
}
```

**Response**

```jsonc
{
  "patient_id": "pat-1",
  "horizon_weeks": 6,
  "comparison": {
    "patient_id": "pat-1",
    "horizon_weeks": 6,
    "candidates": [ /* SimulationOutput */, … ],
    "ranking": [
      { "protocol_id": "A", "label": "Left DLPFC 10 Hz", "score": 0.41, "rank": 1, "rationale": "Estimated response probability 0.42, confidence moderate, safety level baseline." }
    ],
    "winner": "A",
    "confidence_gap": 0.03,
    "disclaimer": "Decision-support only. … Ranking is exploratory; clinician judgement remains the source of truth."
  },
  "disclaimer": "Decision-support only. …"
}
```

---

## `POST /patient-latent`

Run encoders + fusion + adapter only (no head, no protocol).

**Response**

```jsonc
{
  "patient_id": "pat-1",
  "embeddings": [
    { "modality": "qeeg", "vector": [/* 32 floats */], "quality": 0.92, "missing": false, "feature_attributions": { "alpha_power_z": 1.21 }, "notes": ["…"] }
  ],
  "latent": {
    "patient_id": "pat-1",
    "vector": [/* 32 floats */],
    "modality_weights": { "qeeg": 0.13, "mri": 0.0, … },
    "used_modalities": ["qeeg", "assessments", "wearables", …],
    "missing_modalities": ["mri"],
    "fusion_quality": 0.81,
    "coverage_ratio": 0.89,
    "notes": []
  },
  "adapted": {
    "base": { /* PatientLatent */ },
    "adapted_vector": [/* 32 floats */],
    "adaptation_summary": { "applied_baseline_severity": 0.0, "primary_diagnosis": null, "n_used_modalities": 8, "fusion_quality": 0.81, "coverage_ratio": 0.89, "notes": ["Subject adaptation is a deterministic bias; …"] }
  },
  "disclaimer": "Decision-support only. …"
}
```

---

## `POST /explain`

Re-run a single simulation but only return the explanation block plus
the headline numbers.

```jsonc
{
  "patient_id": "pat-1",
  "protocol_id": "A",
  "explanation": { /* same shape as above */ },
  "response_probability": 0.42,
  "response_confidence":  "moderate",
  "evidence_grade":       "low",
  "disclaimer": "Decision-support only. …"
}
```

---

## `POST /report-payload`

UI-ready, downloadable report sections (no PDF this turn).

`kind` ∈ `{ clinician_intelligence, patient_progress, protocol_comparison, governance }`.

```jsonc
{
  "patient_id": "pat-1",
  "kind": "clinician_intelligence",
  "title": "DeepTwin Clinical Intelligence Report",
  "sections": [
    { "id": "summary",     "title": "Patient summary",                "items": [/* … */] },
    { "id": "scenario",    "title": "Scenario",                       "items": [/* … */] },
    { "id": "predictions", "title": "Predicted response",             "items": [/* … */] },
    { "id": "drivers",     "title": "Top drivers",                    "items": [/* … */] },
    { "id": "risks",       "title": "Risks and monitoring",           "items": [/* … */] },
    { "id": "limitations", "title": "Limitations and missing data",   "items": [/* … */] },
    { "id": "review",      "title": "Recommended clinician review points", "items": [/* … */] },
    { "id": "audit",       "title": "Audit",                          "items": ["twin_tribe_report:pat-1:clinician_intelligence:A"] }
  ],
  "audit_ref":   "twin_tribe_report:pat-1:clinician_intelligence:A",
  "generated_at":"2026-04-26T01:23:45Z",
  "disclaimer":  "Decision-support only. …"
}
```

---

## Confidence / uncertainty fields summary

| Field | Where | Range |
|---|---|---|
| `quality` | each `ModalityEmbedding` | 0..1 |
| `fusion_quality` | `PatientLatent` | 0..1 |
| `coverage_ratio` | `PatientLatent` | 0..1 |
| `ci_low` / `ci_high` | each `TrajectoryPoint` | absolute units of the metric |
| `response_confidence` | `HeadOutputs` | "low" \| "moderate" \| "high" |
| `evidence_grade` | `Explanation` | "low" \| "moderate" (never "high" until validated) |
| `confidence_gap` | `ProtocolComparison` | float; difference of top two scores |

## Provenance fields

| Field | Where |
|---|---|
| `audit_ref` | `report-payload` response |
| `feature_attributions` | every `ModalityEmbedding` |
| `notes` | `ModalityEmbedding`, `PatientLatent`, `AdaptedPatient.adaptation_summary.notes` |
| `disclaimer` | every endpoint response |
