"""Cognitive speech analyzers (MCI / AD-spectrum risk, per-task subscores). v2 module."""

from .mci_risk import mci_risk_score
from .tasks import task_subscores

__all__ = ["mci_risk_score", "task_subscores"]
