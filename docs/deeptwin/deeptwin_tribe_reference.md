# DeepTwin TRIBE Reference

> Reference architecture used as inspiration for the DeepSynaps DeepTwin
> upgrade. **Not a copy.** TRIBE solves a different problem; we adopt
> only the architectural shape that fits clinical decision support.

## What TRIBE / TRIBE v2 contributes architecturally

TRIBE (and TRIBE v2) is a multimodal, subject-aware response-prediction
architecture. The pieces that map onto DeepTwin are:

| TRIBE component | What it does | Why we want the shape |
|---|---|---|
| **Per-modality encoders** (audio, text, video) | Each modality goes through its own pretrained encoder; nothing is concatenated raw. | Lets us swap qEEG / MRI / wearables / text encoders independently as better models appear, without touching the heads. |
| **Temporal/multimodal integration** (cross-modal transformer) | Aligns encoded streams in time and produces a fused token. | Mirrors what we need for "what is this patient doing right now across all signals?" |
| **Subject-specific mapping layer** | Conditions the model on the participant. | Carries demographics / diagnosis / history into the fused representation without leaking identifiers into the encoders. |
| **Multi-task response heads** | Same fused representation predicts many response targets. | Lets one DeepTwin pass produce symptom, biomarker, risk, and response-probability forecasts together. |
| **Zero-shot generalisation** | Trained subjects ≠ inference subjects. | We never hold patient-specific model weights; subject conditioning is the only personalisation. |

## What can be adapted to DeepSynaps

- **Modular encoder seam.** Each modality (`qeeg`, `mri`, `assessments`,
  `wearables`, `treatment_history`, `demographics`, `medications`,
  `text`, `voice`) is its own file under
  `apps/api/app/services/deeptwin_tribe/encoders/`. Today they are
  deterministic feature extractors; tomorrow they can be wrapped real
  pretrained models with the same `encode(patient_id, *, sample) ->
  ModalityEmbedding` signature.
- **Quality-weighted attention.** TRIBE's cross-modal attention becomes
  a quality-weighted mean in our fusion layer. It is simple, predictable,
  and crucially handles missing modalities by zeroing their weight.
- **Subject-mapping layer.** Implemented as a deterministic affine bias
  in `patient_adapter.py`. A learned subject-mapping MLP can replace it
  later; the contract stays.
- **Multi-task heads.** `heads.py` emits four families of forecast
  (`symptom`, `biomarker`, `risk`, `response_probability`) plus
  `adverse_risk` and `latent_state_change` from one adapted latent.

## What should NOT be copied directly

- **Whole-brain fMRI prediction goal.** TRIBE predicts dense neural
  responses. DeepTwin produces *modeled what-if trajectories* for clinician
  review (decision-support), not validated patient-specific outcome prediction
  and not fMRI maps. Borrow the architecture; do not borrow the target.
- **Pretrained encoder choices.** TRIBE's audio/text/video encoders are
  not clinically calibrated. We expose the seam, but real model swaps
  must pass clinical validation before enabling.
- **Implicit zero-shot promise.** TRIBE's zero-shot story assumes large,
  diverse training cohorts. We have neither. DeepTwin therefore frames
  every prediction as **model-estimated, low-to-moderate evidence**,
  never "validated".
- **End-to-end loss aggregation.** TRIBE trains all heads jointly. We
  do not train at all in the v0 layer; if real models are added later,
  heads should be trained independently against approved outcome data,
  with per-head evaluation and human review before promotion.

## Clinical limitations we must respect

1. **No diagnosis.** DeepTwin output is decision-support only. Every
   response includes `approval_required=True` and a disclaimer.
2. **Causation never claimed.** Trajectories are framed as
   "model-estimated response patterns", not "this protocol will cause X".
3. **Uncertainty is a first-class field.** Every trajectory point ships
   with `ci_low` / `ci_high`; every head ships with a confidence label.
4. **Missing data is visible.** `missing_data_notes` and the per-modality
   `missing` flag bubble to the explanation surface.
5. **Subject mapping uses no identifiers.** Demographics encoder carries
   coarse one-hot fields only; no name / DOB / address ever lands in a
   latent.
6. **No autonomous learning loop in production.** Even when an eval
   harness lands, rule/model updates require explicit human approval.
   See `apps/api/app/services/deeptwin_research_loop.py` (placeholder
   shipped earlier; `ENABLED = False`).

## Where TRIBE concepts live in the repo

| TRIBE concept | DeepSynaps file |
|---|---|
| Per-modality encoders | `apps/api/app/services/deeptwin_tribe/encoders/{qeeg,mri,assessments,wearables,treatment_history,demographics,medications,text,voice}.py` |
| Encoder contract | `apps/api/app/services/deeptwin_tribe/types.py` (`ModalityEmbedding`) |
| Multimodal integration | `apps/api/app/services/deeptwin_tribe/fusion.py` |
| Subject mapping | `apps/api/app/services/deeptwin_tribe/patient_adapter.py` |
| Multi-task heads | `apps/api/app/services/deeptwin_tribe/heads.py` |
| Explanation | `apps/api/app/services/deeptwin_tribe/explanation.py` |
| Orchestrator | `apps/api/app/services/deeptwin_tribe/simulator.py` |
| API surface | `apps/api/app/routers/deeptwin_router.py` (TRIBE block at the bottom) |
