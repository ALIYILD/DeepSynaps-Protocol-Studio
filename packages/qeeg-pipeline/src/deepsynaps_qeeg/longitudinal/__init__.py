"""Longitudinal qEEG comparisons (within-patient, across sessions).

This package provides lightweight, file-based longitudinal comparison utilities:

- `store`: load per-session artifacts (default: `features.json` from outputs/)
- `compare`: compute deltas between two sessions
- `significance`: compute Reliable Change Index (RCI) flags using bundled norms
- `viz`: render change topomaps and longitudinal trend plots for reports
"""

from .compare import ComparisonResult, SessionData, compare_sessions
from .significance import RCIResult, rci_for_comparison
from .store import FileSessionStore, SessionStore

__all__ = [
    "ComparisonResult",
    "FileSessionStore",
    "RCIResult",
    "SessionData",
    "SessionStore",
    "compare_sessions",
    "rci_for_comparison",
]

