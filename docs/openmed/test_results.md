# Test Results — OpenMed integration

Run: 2026-04-28 (overnight transformation agent)
Python: 3.11.14
Pytest: 8.4.2

## OpenMed-specific (16 tests)

```
tests/test_openmed_adapter.py::test_analyze_returns_entities_and_pii         PASSED
tests/test_openmed_adapter.py::test_analyze_empty_summary_when_no_entities   PASSED
tests/test_openmed_adapter.py::test_extract_pii_only_returns_pii_entities    PASSED
tests/test_openmed_adapter.py::test_deidentify_replaces_pii_with_tokens      PASSED
tests/test_openmed_adapter.py::test_deidentify_preserves_clinical_text       PASSED
tests/test_openmed_adapter.py::test_health_reports_heuristic_when_no_upstream PASSED
tests/test_openmed_adapter.py::test_entity_spans_round_trip                  PASSED
tests/test_openmed_adapter.py::test_pii_spans_round_trip                     PASSED
tests/test_openmed_adapter.py::test_long_input_does_not_crash                PASSED
tests/test_clinical_text_router.py::test_health_requires_clinician           PASSED
tests/test_clinical_text_router.py::test_health_ok_for_clinician             PASSED
tests/test_clinical_text_router.py::test_analyze_returns_typed_response      PASSED
tests/test_clinical_text_router.py::test_analyze_rejects_empty               PASSED
tests/test_clinical_text_router.py::test_extract_pii_endpoint                PASSED
tests/test_clinical_text_router.py::test_deidentify_endpoint                 PASSED
tests/test_clinical_text_router.py::test_analyze_rejects_non_clinician       PASSED
======================== 16 passed, 1 warning in 4.08s =========================
```

## Regression — touched/adjacent surfaces (68 tests)

```
test_mri_analysis_router.py     24 passed
test_fusion_router.py           +
test_patients_router.py         +
test_auth_persistence.py        +
test_2fa_flow.py                +
test_assessments_hub.py         = 68 passed in 28s
```

## Frontend unit suite

Not exercised in this PR (no apps/web changes). Last known: 98/98 pass.

## Live API smoke

Will be verified after deploy of merged PR.
