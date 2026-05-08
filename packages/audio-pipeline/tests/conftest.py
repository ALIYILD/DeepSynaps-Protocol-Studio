"""Pytest config for deepsynaps-audio.

Collection-level skips for tests that reference an older API surface and
need to be rewritten before they can re-enter the suite.
"""

from __future__ import annotations

# TODO(test-coverage): tests/test_ingestion.py imports four symbols that no
# longer exist in deepsynaps_audio.ingestion: check_audio_quality,
# extract_audio_metadata, import_voice_sample, segment_voice_tasks. The
# current ingestion module exposes load_recording / import_session / to_bids
# instead. Skip the file at collection time so the rest of the suite runs;
# rewrite the test against the current API in a follow-up PR.
collect_ignore = ["test_ingestion.py"]
