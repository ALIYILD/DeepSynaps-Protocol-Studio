"""Dataset adapters for qEEG training."""

from __future__ import annotations

__all__ = ["NMTStudy", "TDBrainStudy", "TUEGStudy"]

from .nmt import NMTStudy
from .tdbrain import TDBrainStudy
from .tueg import TUEGStudy

