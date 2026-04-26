# DeepTwin TRIBE — tests added

File: `apps/api/tests/test_deeptwin_tribe.py`.

The synthetic encoders are deterministic, so we can assert exact keys
and ordering without trained weights. Two sections:

## Pure-Python unit tests (no HTTP)

| Test | What it locks in |
|---|---|
| `test_encode_all_returns_one_embedding_per_modality` | All 9 encoders run and emit `EMBED_DIM=32` vectors. |
| `test_missing_modality_is_masked_in_fusion` | A `__no_<modality>__` substring on `patient_id` zero-weights that modality and the surviving weights still sum to 1. |
| `test_fusion_quality_propagates_to_response_confidence` | Fewer used modalities → confidence cannot be `"high"`; full coverage allows `"moderate"` or `"high"`. |
| `test_simulate_protocol_emits_full_shape` | `SimulationOutput` carries the full envelope (heads + explanation + labels + disclaimer); `approval_required` is `True`; trajectory points have `ci_low ≤ point ≤ ci_high`. |
| `test_explanation_payload_has_drivers_and_cautions` | Explanation has top-modalities + top-drivers + decision-support caution; contraindications bubble into `adverse_risk` (level `"elevated"`). |
| `test_compare_protocols_ranks_and_picks_winner` | Three protocols → ranks 1/2/3, single winner, non-negative `confidence_gap`, every candidate has full simulation envelope. |
| `test_low_confidence_scenario_does_not_claim_high` | All 9 modalities masked → `evidence_grade = "low"`, `response_confidence != "high"`, ≥5 missing-data notes. |

## HTTP integration tests

Use `client` + `auth_headers["clinician"]` from the existing
`conftest.py`.

| Test | Endpoint |
|---|---|
| `test_endpoint_simulate_tribe` | `POST /api/v1/deeptwin/simulate-tribe` |
| `test_endpoint_compare_protocols` | `POST /api/v1/deeptwin/compare-protocols` |
| `test_endpoint_patient_latent` | `POST /api/v1/deeptwin/patient-latent` |
| `test_endpoint_explain` | `POST /api/v1/deeptwin/explain` |
| `test_endpoint_report_payload` | `POST /api/v1/deeptwin/report-payload` |
| `test_end_to_end_scenario` | latent → compare → explain winner → report payload (full chain) |

## How to run

```bash
python -m pytest apps/api/tests/test_deeptwin_tribe.py -q
```

Combined run (TRIBE + v1 router + engine):

```bash
python -m pytest \
  apps/api/tests/test_deeptwin_engine.py \
  apps/api/tests/test_deeptwin_router.py \
  apps/api/tests/test_deeptwin_tribe.py \
  -q
```
