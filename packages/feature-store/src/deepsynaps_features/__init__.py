from __future__ import annotations

"""DeepSynaps Layer 2 Feature Store package (contracts + retrieval)."""

__version__ = "0.1.0"

from .serve import fetch_patient_features

__all__ = ["__version__", "fetch_patient_features"]

