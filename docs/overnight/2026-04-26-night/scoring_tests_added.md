# Scoring Tests Added — Stream 4

## New test module

`apps/api/tests/test_risk_clinical_scores.py` — 25 tests, all PASSING.

The module covers the unified `ScoreResponse` contract, anchor policy,
research-grade ceilings, range validation, and audit metadata. It is
self-contained: it adds the evidence + apps/api source paths to
``sys.path`` so it runs without an editable install, and never imports
the FastAPI app (so it passes regardless of whether ``aiofiles`` and
the other API-side optional deps are present).

### Coverage matrix

| Test | Asserts |
|---|---|
| `test_all_scores_contract_minimal_inputs` | `build_all_clinical_scores` returns every `SCORE_IDS` entry with the unified contract even with empty inputs. |
| `test_anxiety_with_gad7_anchors_to_validated_assessment` | GAD-7 record produces `assessment_anchor=="GAD-7"`, `scale=="raw_assessment"`, `confidence=="high"`. |
| `test_anxiety_without_prom_falls_back_to_biomarker_capped_med` | No PROM → confidence ceiling `med`, biomarker similarity in [0, 1], `missing-validated-anchor` caution. |
| `test_depression_phq9_item9_emits_safety_caution` | PHQ-9 item 9 ≥ 2 emits `phq9-item9-positive` BLOCK caution. |
| `test_anxiety_score_no_inputs_returns_no_data` | Empty inputs → `confidence=="no_data"`, `value is None`, cautions present. |
| `test_mci_with_moca_anchors` | MoCA → `assessment_anchor=="MoCA"`, value passed through. |
| `test_mci_young_age_emits_ood_warning` | `chronological_age < 40` → `out-of-distribution-age` caution. |
| `test_brain_age_consumes_payload_and_validates_range` | Wraps qEEG payload, value in years, confidence ≤ med (no PROM anchor). |
| `test_brain_age_out_of_range_warns` | `predicted_years` 120 → `out-of-range-brain-age` caution. |
| `test_brain_age_stub_flag_surfaces_caution` | `is_stub=True` → `stub-model-fallback` caution + `upstream_is_stub` provenance. |
| `test_brain_age_missing_payload_returns_no_data` | None payload → `no_data`. |
| `test_stress_without_pss_marked_research_grade` | No PSS-10 → `scale=="research_grade"`, `research-grade-score` + `missing-validated-anchor` cautions, ceiling `med`. |
| `test_stress_no_inputs_no_data` | Empty wearable + assessments → `no_data`. |
| `test_relapse_research_grade_capped_med` | trajectory + AEs → `research_grade`, value in [0, 1], ceiling `med`. |
| `test_relapse_no_inputs_returns_no_data` | None inputs → `no_data`. |
| `test_adherence_high_risk_when_low_rate_and_open_flags` | low rate + open flags → composite in [0, 1], research-grade caution. |
| `test_adherence_missing_planned_sessions_warns` | `sessions_expected is None` → `missing-planned-sessions` caution. |
| `test_response_probability_research_grade_and_capped` | `research_grade`, value in [0, 1], ceiling `med`, `evidence-pending` + `research-grade-score` cautions. |
| `test_response_probability_no_payload_no_data` | None payload → `no_data`. |
| `test_cap_confidence_research_grade_caps_at_med` | Confidence policy unit test (research-grade ⇒ med; no anchor ⇒ med; anchored ⇒ high allowed). |
| `test_hash_inputs_deterministic` | `hash_inputs` is order-independent and changes when inputs change. |
| `test_similarity_indexed_scores_stay_in_unit_interval` | Range validation: similarity scores in [0, 1]. |
| `test_top_contributors_when_score_has_value` | When `value` non-null, `top_contributors` has length ≥ 1. |
| `test_low_input_quality_produces_cautions` | Low-quality input ⇒ at least one caution. |
| `test_uncertainty_band_validator_rejects_inverted_bounds` | Pydantic validator rejects `(hi, lo)` band. |

## Test commands & results

### Stream 4 owned tests (NEW)

```bash
python3.11 -m pytest apps/api/tests/test_risk_clinical_scores.py -v 2>&1 | tail -50
```

```
collected 25 items
... (all 25 PASSED)
======================== 25 passed, 1 warning in 5.78s =========================
```

### Spec-required: evidence_router

```bash
python3.11 -m pytest apps/api/tests/test_evidence_router.py -v 2>&1 | tail -50
```

```
collected 6 items
test_evidence_health_returns_503_when_db_missing PASSED
test_evidence_endpoints_work_with_fixture_db    PASSED
test_evidence_health_requires_auth              PASSED
test_evidence_papers_filters_oa_only            PASSED
test_research_papers_use_enriched_bundle_ranking PASSED
test_research_protocol_coverage_uses_bundle_summary PASSED
========================= 6 passed, 1 warning in 1.84s =========================
```

### Spec-required: packages/evidence

```bash
python3.11 -m pytest packages/evidence/tests/ -v 2>&1 | tail -50
```

Default invocation FAILS in this environment because the
`deepsynaps_evidence` package is not installed editable
(`ModuleNotFoundError: No module named 'deepsynaps_evidence'`).
This baseline failure is **pre-existing** and unrelated to Stream 4
changes — the `apps/api` tests work because `apps/api/tests/conftest.py`
explicitly adds `packages/evidence/src` to ``sys.path``.

With the package on the path, all 47 tests pass (including the new
`score_response` module by virtue of being part of the package — the
new schema is not yet directly tested in `packages/evidence/tests/`,
because Stream 4's contract tests live in
`apps/api/tests/test_risk_clinical_scores.py` per the task spec):

```bash
PYTHONPATH=packages/evidence/src python3.11 -m pytest packages/evidence/tests/ -v 2>&1 | tail -10
```

```
test_audit_hash.py ... 7 PASSED
test_schemas.py    ... 10 PASSED
test_scoring.py    ... 30 PASSED
============================== 47 passed in 0.10s ==============================
```

## Tests NOT touched

* `apps/api/tests/test_risk_stratification_router.py` — does not exist
  (was not part of the original repo); the existing `risk_stratification.py`
  service is left intact.
* `apps/api/tests/test_evidence_intelligence.py` — outside Stream 4
  scope per the task board.
