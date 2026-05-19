"""DeepSynaps three-tier AI architecture.

Subpackages:

- ``tier1_llm``  — cloud-served clinical-reasoning LLM (vLLM + Me-LLaMA).
- ``tier2_qeeg`` — GPU-served qEEG inference (EEGNet + BIOT, ONNX Runtime).
- ``tier2_mri``  — GPU-served MRI segmentation pipeline (FastSurfer, SynthSeg).

Every tier ships in stub mode first: contract + router + tests, no model
weights and no fake clinical output. Real model wiring lands in follow-up
PRs once the contract is validated by clinician review.
"""
