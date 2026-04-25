"""Live qEEG streaming helpers.

This subpackage provides a low-latency "monitoring, not diagnostic" feature
extraction path intended for real-time dashboards (WS/SSE).
"""

from __future__ import annotations

from .lsl_source import LSLSource, MockSource
from .quality import compute_quality_indicators
from .rolling import RollingFeatures
from .zscore_live import zscore_window

__all__ = [
    "LSLSource",
    "MockSource",
    "RollingFeatures",
    "compute_quality_indicators",
    "zscore_window",
]

