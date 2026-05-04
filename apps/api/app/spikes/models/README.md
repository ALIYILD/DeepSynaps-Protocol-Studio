# Spike CNN (optional)

Place a TUH EEG–fine-tuned ONNX classifier at `spike_cnn.onnx` (see `detect_ai.py` for expected I/O).
Without this file, **heuristic** labels + confidence are used so M11 works offline.

Training notes (target acceptance: recall ≥ 0.9 @ precision ≥ 0.8 on held-out clinical EDFs)
are product QA — not enforced in CI.
