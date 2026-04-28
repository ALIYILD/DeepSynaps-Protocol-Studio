# Tests Added

## `apps/api/tests/test_openmed_adapter.py` — 9 unit tests

| Test | What it proves |
|---|---|
| `test_analyze_returns_entities_and_pii` | Coverage across medication / diagnosis / symptom / lab / procedure + PII (email/phone/mrn) |
| `test_analyze_empty_summary_when_no_entities` | Adapter handles zero-entity text gracefully |
| `test_extract_pii_only_returns_pii_entities` | PII endpoint returns only PII entities |
| `test_deidentify_replaces_pii_with_tokens` | Redacted output replaces PHI with `[LABEL]` placeholders |
| `test_deidentify_preserves_clinical_text` | Clinical entities (anhedonia, sertraline, MDD) survive deidentification |
| `test_health_reports_heuristic_when_no_upstream` | Default backend identifies itself correctly |
| `test_entity_spans_round_trip` | `text[span.start:span.end] == ent.text` for every entity |
| `test_pii_spans_round_trip` | Same property for PII entities |
| `test_long_input_does_not_crash` | 200 KB input handled without error |

## `apps/api/tests/test_clinical_text_router.py` — 7 integration tests

| Test | What it proves |
|---|---|
| `test_health_requires_clinician` | Unauthenticated → 401/403 |
| `test_health_ok_for_clinician` | Authenticated clinician sees `ok=True` + backend name |
| `test_analyze_returns_typed_response` | Response carries `schema_id`, `char_count`, entities, pii, safety_footer |
| `test_analyze_rejects_empty` | Empty body → 422 from Pydantic constraint |
| `test_extract_pii_endpoint` | PII endpoint round-trip |
| `test_deidentify_endpoint` | Redacted output has `[EMAIL]`, no raw email |
| `test_analyze_rejects_non_clinician` | Guest token → 401/403 |

## Regression gate

| Suite | Result |
|---|---|
| `test_mri_analysis_router.py` | 24/24 pass |
| `test_fusion_router.py` + `test_patients_router.py` + `test_auth_persistence.py` + `test_2fa_flow.py` + `test_assessments_hub.py` | 68/68 pass |

Total new tests: 16. Total regression: 92 (16 + 24 + 68 — no overlap).
