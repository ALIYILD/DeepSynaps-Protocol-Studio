# OpenMed Fit Matrix — DeepSynaps Studio

| Integration point | Text type | Today | OpenMed capability | Output we want | Tier |
|---|---|---|---|---|---|
| Clinician note text submit | SOAP / progress note | stored raw | `analyze` + `deidentify` | entities JSON + de-id body persisted alongside raw | 1 |
| Clinical-text REST API | any | does not exist | all four (`health`, `analyze`, `pii`, `deidentify`) | full passthrough | 1 |
| Patient context bundle | history markdown | sent raw to LLM | `deidentify` (gated) | redacted markdown for upstream LLM calls | 1 |
| Patient text upload (`media/patient/upload/text`) | patient-authored | stored raw | `analyze` | optional symptom extraction | 2 |
| Document upload (PDF/DOCX) | clinical document | stored as blob | `analyze` after server-side extract | sidecar JSON entities | 2 |
| Forms submit | structured Q&A | stored as JSON | `pii` on free-text fields | redacted free-text per field | 2 |
| Reports — narrative section | mixed | LLM-generated | `analyze` on inputs | provenance labels (extracted_fact vs interpretation) | 2 |
| Patient timeline events | mixed | aggregator | `analyze` | event tags (medication_started, dx_recorded) | 2 |
| Chat agent context | clinician-typed | sent raw | `deidentify` | safer prompts | 2 |
| Evidence RAG terms | clinical phrases | regex synonym list | `analyze` (NER) | better term recall | 3 |

## Capability mapping

| OpenMed capability | DeepSynaps slot |
|---|---|
| `POST /analyze` | clinical-text API + note submit + (phase 2) document text |
| `POST /pii/extract` | forms submit (free-text fields) + clinical-text API |
| `POST /pii/deidentify` | note submit + patient-context bundle + clinical-text API |
| `GET /health` | clinical-text health endpoint passthrough |

## Decision

Implement Tier 1 in this PR. Tier 2/3 documented as `blockers_remaining.md` future work.
