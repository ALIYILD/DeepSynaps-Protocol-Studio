"""DeepSynaps Video Analyzer.

Clinical computer-vision sibling to ``deepsynaps_mri`` and
``deepsynaps_qeeg``. See ``docs/VIDEO_ANALYZER.md`` for the authoritative spec
and ``CLAUDE.md`` for execution rules. The public surface is intentionally
small — most work goes through ``pipeline.run`` or the FastAPI app in
``api.py``.
"""

from __future__ import annotations

__version__ = "0.1.0"

__all__ = [
    "__version__",
]
