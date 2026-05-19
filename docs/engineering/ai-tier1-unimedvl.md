# Tier 1 — UniMedVL Multimodal Text+Image Medical Understanding

UniMedVL is a multimodal medical vision-language model. The adapter
exposes a single `understand` call: given clinical text + a medical
image (DICOM / PNG / JPEG), return a natural-language interpretation
and a caption. Used downstream for chart annotation, MRI report drafts,
and clinician-side image Q&A.

## Status: stub

- Service: `apps/api/app/services/ai/tier1_unimedvl/`
- Router: `/api/v1/ai/unimedvl/*`
- 4 tests pass locally
- No checkpoint loaded, no torch / transformers import in this PR
- No image fetched, no interpretation fabricated

## Endpoints

| Method | Path                              | Role        |
|--------|-----------------------------------|-------------|
| GET    | `/api/v1/ai/unimedvl/health`        | any auth    |
| POST   | `/api/v1/ai/unimedvl/understand`    | clinician+  |

## Configuration

| Variable               | Default | Purpose                                  |
|------------------------|---------|------------------------------------------|
| `UNIMEDVL_MODEL_PATH`  | unset   | Local path or HF id of the checkpoint.   |
| `UNIMEDVL_DEVICE`      | `cpu`   | Inference device.                        |

## Follow-up

1. Wire torch + transformers; resolve the model.
2. Add DICOM / PNG / JPEG decoder; fetch from `image_uri` over
   authenticated transport.
3. Strip PHI before any cloud call (use Tier 3 edge UniMedVL variant
   when PHI must stay on-device).
4. Return real `understanding` + `caption` with hedged language.

Phase 3 — top-15 model deployment lane.
