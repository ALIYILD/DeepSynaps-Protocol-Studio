# DeepTwin Architecture (TRIBE-inspired layer)

This document is the repo-specific design of the new DeepTwin layer
shipped under `apps/api/app/services/deeptwin_tribe/`. It coexists with
the existing v1 DeepTwin endpoints (summary, timeline, signals,
correlations, predictions, simulations, reports, agent-handoff) without
replacing any of them.

## High-level data flow

```
patient_id ──┬─► encoders.qeeg.encode             ┐
             ├─► encoders.mri.encode              │
             ├─► encoders.assessments.encode      │
             ├─► encoders.wearables.encode        │
             ├─► encoders.treatment_history.encode│   list[ModalityEmbedding]
             ├─► encoders.demographics.encode     │  ───────────────┐
             ├─► encoders.medications.encode      │                 │
             ├─► encoders.text.encode             │                 ▼
             └─► encoders.voice.encode            ┘            fusion.fuse
                                                                   │
                                                                   ▼
                                                            PatientLatent
                                                                   │
                                                                   ▼
                                                       patient_adapter.adapt
                                                                   │
                                                                   ▼
                                                            AdaptedPatient
                                                                   │
                              ProtocolSpec ─────────────────┐      ▼
                                                            └──► heads.predict
                                                                   │
                                                                   ▼
                                                              HeadOutputs
                                                                   │
                                                                   ▼
                                                       explanation.explain
                                                                   │
                                                                   ▼
                                                          SimulationOutput
```

## Components

| Component | Purpose | Today | Tomorrow (swap) |
|---|---|---|---|
| **Encoders** | One file per modality. Contract: `encode(patient_id, *, sample) -> ModalityEmbedding`. | Deterministic feature extraction + projection to `EMBED_DIM=32`. | Real pretrained model (qEEG transformer, MRI vision encoder, sentence-bert text, wav2vec2 voice, etc.). |
| **Fusion** | Combine `list[ModalityEmbedding]` → single `PatientLatent`. Mask missing modalities. | Quality-weighted mean of normalized embeddings. | Cross-modal attention transformer. |
| **Patient adapter** | Subject-specific bias on the fused latent. | Deterministic affine bias keyed by patient_id + diagnosis + baseline severity. | Learned subject-mapping MLP. |
| **Heads** | Multi-task prediction. | Deterministic, modality-aware factor model with uncertainty bands that widen with horizon and shrink with quality. | Trained per-head networks. |
| **Explanation** | Top drivers, evidence grade, missing data, cautions. | Sort by `feature_attributions` magnitude + cover the standard cautions. | Add SHAP/integrated-gradients XAI runtime. |
| **Orchestrator** | Single entry point used by the router. | `simulator.py` exposes `simulate_protocol`, `compare_protocols`, `compute_patient_latent`, `encode_all`, `to_jsonable`. | Add caching of latents + protocol scoring batch. |

### Embedding contract

```python
@dataclass
class ModalityEmbedding:
    modality: ModalityName
    vector: list[float]            # length EMBED_DIM (=32)
    quality: float                 # 0..1
    missing: bool                  # True when no real data
    feature_attributions: dict[str, float]
    notes: list[str]
```

`vector` is per-modality but lives in a shared `EMBED_DIM` so the heads
can be trained against any subset.

### Fusion behaviour

- `weight_i = quality_i / sum(quality)` (zeros stay zeros).
- `fused = sum_i weight_i * vector_i`.
- `coverage_ratio = used / total`.
- `fusion_quality = sum_i weight_i * quality_i`.

Coverage and quality drive both the head-level confidence and the
explanation evidence grade.

## API surface

| Endpoint | Purpose |
|---|---|
| `POST /api/v1/deeptwin/simulate-tribe` | Single-protocol simulation. |
| `POST /api/v1/deeptwin/compare-protocols` | Score and rank ≥2 protocols. |
| `POST /api/v1/deeptwin/patient-latent` | Encoders + fusion + adapter only. |
| `POST /api/v1/deeptwin/explain` | Re-run explanation for a protocol. |
| `POST /api/v1/deeptwin/report-payload` | UI-ready report sections. |

All endpoints sit under the existing `deeptwin` tag; the FastAPI tag
`deeptwin-tribe` differentiates them in the OpenAPI schema. The legacy
endpoints (`analyze`, `simulate`, `evidence`) and the v1 endpoints
(`patients/:id/summary`, `…/timeline`, `…/signals`, `…/correlations`,
`…/predictions`, `…/simulations`, `…/reports`, `…/agent-handoff`) are
unchanged.

## Schemas (request/response)

See `deeptwin_api_contracts.md` for the canonical contracts.

## Training / inference path

There is no training in this turn. Inference is purely deterministic
and seeded by `patient_id`. The seams above are designed so that
- **Encoder swap**: replace the body of any encoder file. Inputs/outputs
  unchanged.
- **Fusion swap**: replace `_attention_weights` and `fuse` with a
  learned model. Downstream code unchanged.
- **Head swap**: replace `predict` with a trained model. Endpoint
  contracts unchanged.
- **Explanation swap**: replace the magnitude-rank XAI with SHAP /
  integrated gradients. Output fields unchanged.

## Fallback behaviour for missing modalities

Every encoder accepts a `__no_<modality>__` prefix on `patient_id` to
explicitly trigger the "no data" branch. In production:

- A real ingestion check decides whether the encoder runs against a
  real `sample` or returns `empty_embedding(...)`.
- Fusion sees `quality == 0` and zero-weights the modality.
- Heads still produce a prediction using the surviving modalities.
- Explanation surfaces a `missing_data_note` per absent modality.
- If `coverage_ratio < 0.4`, the response carries an extra caution and
  evidence_grade is forced down.
- A patient with **zero** modalities still returns a well-formed
  response with `evidence_grade="low"`, `response_confidence != "high"`,
  `approval_required=True`. Tested in
  `test_low_confidence_scenario_does_not_claim_high`.

## Privacy boundary

- No direct identifiers (name, DOB, email, address) enter any encoder.
- Demographics encoder uses coarse one-hots (sex categories, broad
  diagnosis bucket, normalised age and education years).
- Latents are deterministic functions of the inputs above; they are not
  unique person IDs.

## Determinism

Everything is seeded by `blake2s(patient_id | modality | salt)`. Two
calls with the same arguments produce byte-identical responses, which
is what the frontend and tests rely on.

## Connection to the existing UI

The new endpoints are additive; the existing DeepTwin clinician page
keeps working as it does today. A *Compare Protocols* panel was added
to that page (additive) and wires `POST /compare-protocols` →
ranking cards + top drivers + safety stamps. No existing route changed
shape.

## Where to add new modalities

1. Drop a new file under `apps/api/app/services/deeptwin_tribe/encoders/`.
2. Add it to `ModalityName` and `ALL_MODALITIES` in `types.py`.
3. Register it in `encoders/__init__.py` and `simulator.encode_all`.
4. Add fixtures to `apps/api/tests/test_deeptwin_tribe.py`.
