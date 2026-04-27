# Score API Contracts — unified ScoreResponse

Stream 4 introduces a single response shape for every clinical
decision-support score. Source of truth:

* Schema: `packages/evidence/src/deepsynaps_evidence/score_response.py`
* Builders: `apps/api/app/services/risk_clinical_scores.py`
* Endpoint: `GET /api/v1/risk/patient/{patient_id}/clinical-scores`

## Unified `ScoreResponse`

```jsonc
{
  "score_id": "anxiety",                  // see SCORE_IDS below
  "value": 14,                            // numeric on `scale`; null when no_data
  "scale": "raw_assessment",              // raw_assessment | similarity_index |
                                          // probability | years | percentile |
                                          // rate_pct | research_grade
  "interpretation": "GAD-7 = 14 (moderate); may indicate moderate anxiety symptoms — discuss with clinician.",
  "confidence": "high",                   // low | med | high | no_data
  "uncertainty_band": [12.0, 16.0],       // (lo, hi) on same units as value, or null
  "top_contributors": [
    {
      "feature": "gad7_total",
      "weight": 14,
      "direction": "higher_when_more_severe",
      "value": 14
    }
  ],
  "assessment_anchor": "GAD-7",           // PROM anchor when present, else null
  "evidence_refs": [                      // 0..3 supporting refs from Evidence stream
    {
      "ref_id": "pmid:29726344",
      "title": "...",
      "grade": "A",
      "url": "https://...",
      "relation": "supports"
    }
  ],
  "cautions": [                           // ALWAYS surfaced when input quality is low
    {
      "code": "phq9-item9-positive",
      "severity": "block",                // info | warning | block
      "message": "PHQ-9 item 9 = 2: suicidality screen required."
    }
  ],
  "method_provenance": {
    "model_id": "anxiety-anchor-gad7",
    "version": "v1",
    "inputs_hash": "sha256...",
    "upstream_is_stub": false
  },
  "computed_at": "2026-04-26T23:30:00Z"
}
```

### Field rules

| Field | Rule |
|---|---|
| `confidence` | Capped via `cap_confidence`: NO validated anchor → cannot reach `high`; research-grade → cannot exceed `med`. |
| `assessment_anchor` | Set only when a validated PROM was used as PRIMARY. Biomarkers are SUPPORTING and never set this field. |
| `cautions` | Empty list ONLY when value is present and all input quality checks pass. |
| `top_contributors` | Length >= 1 when `value` is non-null. May be empty when `confidence == "no_data"`. |
| `method_provenance.inputs_hash` | SHA-256 of canonicalised inputs. Required for audit. |
| `interpretation` | Hedged language only ("may indicate", "consistent with", "discuss with clinician"). NEVER "diagnose". |

## Per-score contracts

### `anxiety`

| | |
|---|---|
| Primary anchor | **GAD-7** (preferred) → HAM-A |
| Supporting | qEEG `anxiety_like` similarity index (`packages/qeeg-pipeline/src/deepsynaps_qeeg/ai/risk_scores.py`) |
| Scale when anchored | `raw_assessment` |
| Scale when biomarker-only | `similarity_index` ([0, 1]) |
| Confidence ceiling without anchor | `med` |
| Notable cautions | `missing-validated-anchor`, `uncalibrated-biomarker` |

### `depression`

| | |
|---|---|
| Primary anchor | **PHQ-9** (preferred) → HAM-D → BDI-II → BDI |
| Supporting | qEEG `mdd_like` |
| Scale when anchored | `raw_assessment` (PHQ-9 0..27) |
| Special safety | PHQ-9 item 9 ≥ 1 → `phq9-item9-positive` warning; ≥ 2 → BLOCK severity (deferred to risk_stratification suicide_risk for hard action) |

### `stress`

| | |
|---|---|
| Primary anchor | **PSS-10** (catalog gap — see handoff) |
| Supporting | wearable mood / anxiety / HRV / sleep_hours composite |
| Scale when anchored | `raw_assessment` |
| Scale when wearable-only | `research_grade` |
| Confidence ceiling | `med` (research-grade); `low` when <3 wearable signals |

### `mci` (cognitive risk)

| | |
|---|---|
| Primary anchor | **MoCA** → MMSE (catalog gap) |
| Supporting | qEEG `cognitive_decline_like` |
| Notable cautions | `out-of-distribution-age` when chronological_age < 40 |

### `brain_age`

| | |
|---|---|
| Source payload | qEEG `predict_brain_age` (`packages/qeeg-pipeline/.../ml/brain_age.py`) OR MRI brain-age (Stream 2 — handoff requested for stable accessor) |
| Anchor | **none** — gap-vs-chronological is the calibration |
| Scale | `years` |
| Range guard | `predicted_years` must lie in [5, 95] else `out-of-range-brain-age` warning |
| Stub guard | `is_stub == True` → `stub-model-fallback` caution + `upstream_is_stub=True` provenance |
| Large gap guard | \|gap_years\| > 10 → `large-brain-age-gap` warning |
| Confidence ceiling | `med` (no PROM anchor) |

### `relapse_risk`

| | |
|---|---|
| Anchor | **none widely validated** — `research_grade` |
| Inputs | longitudinal change scores (`packages/qeeg-pipeline/.../ai/longitudinal.py`) + unresolved adverse-event count |
| Composite | `0.6 * fraction_significantly_worsening + 0.4 * min(1, AEs/3)` |
| Confidence ceiling | `med` |

### `adherence_risk`

| | |
|---|---|
| Anchor | none |
| Inputs | `home_device_adherence.compute_adherence_summary` |
| Composite | mean of three risk components: rate inversion, open_flags, side_effect_count |
| HIGH risk rule | adherence_rate_pct < 50 OR open_flags ≥ 1 OR side_effect_count ≥ 3 |
| Notable cautions | `missing-planned-sessions` when `sessions_expected is None` |

### `response_probability`

| | |
|---|---|
| Anchor | none |
| Inputs | qEEG `*_like` similarity for the `primary_target` (default `mdd_like`) |
| Scale | `research_grade` (NOT a calibrated probability) |
| Notable cautions | `research-grade-score` (warning), `evidence-pending` (info) |
| Confidence ceiling | `med` |

## Endpoint

```
GET /api/v1/risk/patient/{patient_id}/clinical-scores
Authorization: Bearer <guest|patient|clinician|admin token>

200 OK
{
  "patient_id": "...",
  "score_ids": ["anxiety", "depression", "stress", "mci", "brain_age",
                 "relapse_risk", "adherence_risk", "response_probability"],
  "scores": {
    "anxiety": { ScoreResponse },
    ...
  },
  "computed_at": "2026-04-26T23:30:00Z"
}
```

The endpoint NEVER computes biomarker payloads itself. Stream 4 only
consumes:

* Validated assessments (already loaded by `assemble_patient_context`)
* Wearable summaries (already loaded)
* Adverse events (already loaded)

`qeeg_risk_payload`, `brain_age_payload`, `trajectory_change_scores`
and `adherence_summary` are accepted as optional inputs to the score
builders. A future change (post-handoff with Streams 1, 2 and the
home-device service) will plumb them through the router.

## Cross-stream handoffs

* **Evidence stream**: add PSS-10, MoCA, MMSE rules to
  `apps/api/app/services/assessment_scoring._PREFIX_SCORING` and to
  the assessment template registry so the Stress / MCI scores can
  anchor cleanly.
* **MRI stream**: expose a stable accessor returning the brain-age
  payload shape documented above; Stream 4 will consume.
* **qEEG stream**: no changes requested; current `_decision_support_metadata`
  payload is consumed verbatim.
* **Evidence stream**: implement `evidence_refs` resolver per score_id —
  return up to 3 supporting refs; Stream 4 will pass through.
