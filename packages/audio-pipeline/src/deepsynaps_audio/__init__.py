"""DeepSynaps Audio / Voice Analyzer package.

See ``AUDIO_ANALYZER_STACK.md`` at the package root for the
authoritative module architecture, function table, MVP-vs-v2 split,
and recommended implementation order.

This package follows the same slim-import pattern as
``deepsynaps_qeeg`` and ``deepsynaps_mri``: heavy clinical-audio
dependencies (``parselmouth``, ``librosa``, ``opensmile``,
``faster_whisper``) are guarded inside the functions that need them so
the metadata + schema layer keeps importing under
``python:3.11-slim``.
"""

from __future__ import annotations

__version__ = "0.1.0"

__all__ = ["__version__"]
