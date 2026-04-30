# Schemas Added / Changed

## New (`apps/api/app/services/openmed/schemas.py`)

| Schema | Purpose |
|---|---|
| `ClinicalTextInput` | Single normalised input (text + source_type + locale) |
| `TextSpan` | Char-level start/end |
| `ExtractedClinicalEntity` | label + text + span + normalised + confidence + source |
| `PIIEntity` | label + text + span + confidence |
| `AnalyzeResponse` | schema_id, backend, entities, pii, summary, safety_footer, char_count |
| `PIIExtractResponse` | schema_id, backend, pii |
| `DeidentifyResponse` | schema_id, backend, redacted_text, replacements, safety_footer |
| `HealthResponse` | ok, backend, upstream_ok, upstream_url, note |

## Type aliases

| Alias | Members |
|---|---|
| `SourceType` | clinician_note, patient_note, referral, intake_form, transcript, document_text, free_text |
| `EntityLabel` | diagnosis, symptom, medication, procedure, lab, anatomy, vital, risk_factor, allergy, device, other |
| `PIILabel` | person_name, date, mrn, phone, email, address, id_number, url, ssn, ip_address, other_pii |

## Schema IDs (for downstream contract stability)

| Endpoint | schema_id |
|---|---|
| analyze | `deepsynaps.openmed.analyze/v1` |
| extract-pii | `deepsynaps.openmed.pii/v1` |
| deidentify | `deepsynaps.openmed.deid/v1` |

## No DB schema changes

This PR adds no Alembic migration. Entities are returned in API responses
rather than persisted. Phase 2 will add an `extracted_entities_json` column
to `clinician_media_note` (or a sidecar table) to store extractions for
audit + retrieval.

## Existing schemas changed

None. The `clinician_note_text` response gains an `openmed` field, which is
additive — existing UI consumers ignore unknown keys.
