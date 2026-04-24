"""Lightweight deep-learning model wrappers for the DeepSynaps MRI pipeline.

Each submodule keeps heavy frameworks (``torch``, ``onnxruntime``) in
try/except — so the API worker boots even when the ML stack is absent,
returning ``status='dependency_missing'`` in the corresponding pydantic
result envelope.

Current members
---------------
* :mod:`.brain_age` — 3D CNN brain-age + cognition proxy predictor.
"""
from __future__ import annotations

from .brain_age import predict_brain_age

__all__ = ["predict_brain_age"]
