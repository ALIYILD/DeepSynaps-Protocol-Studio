# qEEG payload fixtures

JSON fixtures used by `tests/test_schema_v3.py` to validate the unified
`schemas/qeeg_payload_v3.json` against representative payloads.

| File | Coverage |
|---|---|
| `payload_v1_minimal.json` | CONTRACT.md only — required `features`/`zscores`/`flagged_conditions`/`quality` with classical sub-trees. |
| `payload_v2_ai_upgrades.json` | CONTRACT.md + CONTRACT_V2.md — adds embedding, brain_age, risk_scores, centiles, explainability, similar_cases, protocol_recommendation, longitudinal. |
| `payload_v3_full.json` | All three contracts — V2 plus fusion_recommendation, annotations, outcomes, patient_facing_summary. |

These are hand-rolled, deterministic, and small enough to read at a glance.
They are **not** runtime pipeline outputs — the pipeline still emits dataclass
`PipelineResult` instances; PR-B will wire schema validation in.
