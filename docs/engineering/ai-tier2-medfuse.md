# Tier 2 — MEDFuse Multimodal Fusion

MEDFuse fuses multiple clinical modalities (MRI / fMRI / EEG / structured
clinical features / genomics) into a single representation for downstream
prediction heads.

## Status: stub

- Service: `apps/api/app/services/ai/tier2_medfuse/`
- Router: `/api/v1/ai/medfuse/*`
- 4 tests pass locally
- No fusion model loaded, no modality URIs fetched

## Endpoints

| Method | Path                          | Role        |
|--------|-------------------------------|-------------|
| GET    | `/api/v1/ai/medfuse/health`     | any auth    |
| POST   | `/api/v1/ai/medfuse/fuse`       | clinician+  |

## Configuration

| Variable              | Default | Purpose                                |
|-----------------------|---------|----------------------------------------|
| `MEDFUSE_MODEL_PATH`  | unset   | Local path or HF id of the fusion ckpt.|

## Follow-up

1. Compose per-modality encoders (delegate to existing Tier 2 adapters
   — Brain-JEPA for fMRI, CBraMod for EEG, PubMedBERT for clinical
   notes).
2. Wire the cross-modal attention head.
3. Return real `fused_embedding` + `embedding_dim`.
4. Add downstream task heads (e.g. TMS response, DBS outcome).

Phase 3 — Phase B Month 2-3.
