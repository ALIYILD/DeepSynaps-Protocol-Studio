"""AI-layer modules for DeepSynaps qEEG Analyzer.

Hosts retrieval, risk scoring, explainability, protocol recommendation,
longitudinal analysis, and copilot helpers. Every public function here
must be safe to import in a worker without heavy optional deps — fall
back to deterministic stubs flagged with ``is_stub=True``.
"""
