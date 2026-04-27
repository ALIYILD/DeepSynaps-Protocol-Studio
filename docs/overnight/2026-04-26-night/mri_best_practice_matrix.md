# MRI Stream — Best-Practice Matrix

**Date:** 2026-04-26 night
**Method:** Each row compares the *current* DeepSynaps implementation
against the *de-facto* community / clinical best practice (FreeSurfer,
FSL, ANTs, MRtrix, FastSurfer, brainageR, SynthStrip, SynthSeg, MRIQC,
DeepBrainNet) and notes whether the gap is closable tonight.

---

| Capability | Current (DeepSynaps) | Best-practice ref | Gap | Do tonight? | Rationale |
|---|---|---|---|---|---|
| NIfTI header validation | `nibabel.load + zooms` only (io.py:214) | nibabel `as_closest_canonical()` + check `affine` non-degenerate, dim ≥ 3, datatype in known set | No sform/qform check, no datatype validation, no dim sanity | **Yes** | Pure-Python, ~50 LOC, zero new deps |
| Upload format whitelist | Accepts any extension | `.nii`, `.nii.gz`, `.zip` (DICOM bundle) only | Anything passes | **Yes** | Single conditional in router |
| NIfTI magic-byte check | None | NIfTI-1: bytes [344:348] == "n+1\0" or "ni1\0"; NIfTI-2: "n+2\0..."  | None | **Yes** | One header read |
| Voxel-size sanity | None | Reject if any zoom ≤ 0 or > 10 mm or NaN | Garbage volumes pass | **Yes** | 3-line check |
| Empty-volume reject | Empty bytes only | nibabel can load 0-data; check `arr.size > 0 and finite mean` | Silent failure later | **Yes** | trivial |
| Skull strip | Implicit via SynthSeg | SynthStrip (Hoopes 2022) is the modern standalone CPU-friendly tool | Not invoked explicitly; if SynthSeg missing nothing strips | No (needs binary) | DevOps blocker — flag |
| Bias correction | Not implemented | ANTs N4BiasFieldCorrection or FSL FAST | Missing | No | Heavy dep, lower priority for tonight |
| Registration to MNI | `register_t1_to_mni` stub-ish | ANTs SyN (`antspyx`) — gold standard | Stub | No | Already present as optional path |
| Cortical thickness | Stubbed (TODO) | FastSurfer (Henschel 2020) → DKT atlas | Hard-coded demo only | No | Needs real seg engine |
| Volumetrics | Stubbed | SynthSeg+ (Billot 2023) | Hard-coded demo only | No | Needs engine + parsing |
| WMH segmentation | LST-AI (qc.py:177) | LST-AI; SAMSEG; HyperMapper | Optional dep, graceful | OK | Already graceful |
| QC IQMs | MRIQC wrapper (qc.py:102) | MRIQC (Esteban 2017) | Already wrapped | OK | Solid |
| Brain-age model | Custom 3D CNN, MAE 3.30 y ref | DeepBrainNet (Bashyam 2020), brainageR (Cole 2017) | No calibration provenance, no plausibility check, no confidence band | **Yes (safety wrap)** | Without retraining we can still wrap output safely |
| Brain-age plausibility | None | Reject predicted age outside [3, 100] y; reject |gap| > 30 y | Garbage in → garbage out | **Yes** | 5-line guard |
| Brain-age confidence band | None | Cole 2018: report ±MAE; calibration-corrected gap; bias slope | Missing | **Yes** | Use `mae_years_reference` to compute `[predicted-MAE, predicted+MAE]` |
| Brain-age "not estimable" path | Status enum already there | Same | Not used for plausibility failure | **Yes** | Re-use status="failed" + reason |
| ROI structured payload | `dict[str, NormedValue]` keyed by region | OpenNeuro / BIDS-stats `regions[].{name,value,units,...}` | Not list-of-records; consumer must walk dict | **Yes** | Add converter helper, keep dict for back-compat |
| Per-region confidence | Not present in NormedValue | reference_range, percentile_band, model_id | Missing fields | **Yes** | Optional fields on schema; back-compat via Optional |
| Explainability hook | None for brain-age | Captum / SHAP on the CNN; or simpler "top-3 regions driving gap" | Missing | **Yes (hook only)** | Add `explanation` field; provide stub that downstream can populate |
| Safer language | "stim targets", "findings" used loosely | UK MHRA / FDA: never "diagnosis"; use "observation", "finding", "requires clinical correlation" | Disclaimer present, per-finding language inconsistent | **Yes** | Helper that builds finding dicts with safe verbs |
| Multimodal fusion payload | None standardized | qEEG side has `MedRAGQuery`; need symmetric MRI producer | Fusion has to read whole report | **Yes** | Add `to_fusion_payload()` schema producer |
| Audit trail | `AiSummaryAudit` row on analyze | HIPAA / NHS DSPT — keep. | OK | OK | already there |
| Frontend QC banner | `renderQCWarningsBanner` (line 1815) | Required | OK | OK | Already present |
| Frontend confidence chip on brain-age | Yes (1748) | OK | OK | OK | Already present |
| Frontend dead-button audit | Stim-target buttons + viewer all wired | none broken found in this pass | n/a | n/a | confirm via test |
| Loading/empty/error states | Present (1299, 1319) | OK | OK | OK | confirm via test |

---

## Decisions for tonight

We are doing-tonight rows marked **Yes** above:

1. NIfTI + upload validation: extension whitelist, NIfTI magic-byte check,
   header sanity (dims, affine, datatype, voxel sizes).
2. Brain-age safety wrapper: plausibility band, confidence band, calibration
   provenance, "not_estimable" envelope when out-of-distribution.
3. Per-region structured payload (list-of-records form) via converter +
   optional fields on `NormedValue` for `reference_range`, `model_id`.
4. Explainability hook on `BrainAgePrediction` and `StimTarget`.
5. Safer interpretation language utility that builds "finding" dicts.
6. Fusion-ready producer payload `to_fusion_payload()`.
7. Tests for all of the above.
8. Frontend: confirm QC + confidence already render (covered in existing
   tests — we add one defensive test for upload-rejection error path).

## Blockers (NOT done tonight, flagged for DevOps)
- Real volumetric extraction needs FastSurfer or SynthSeg+ binary on the
  worker image. The demo report is the only structured data the pipeline
  emits today.
- ANTs N4 bias correction → install `antspyx` in the worker image.
- SynthStrip explicit skull-strip step — needs a FreeSurfer 7.4+ install.

These are infra changes, not safe to do in a midnight code-only pass.
