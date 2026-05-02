"""Normative-bin loader.

v1 ships open-data norms (Saarbrücken, VOICED, Mozilla CV
demographics-derived). v2 adds the option to OEM-license a
commercial voice DB (mirrors the qEEG NeuroGuide / qEEG-Pro path).
"""

from __future__ import annotations

from typing import Any, Mapping


def load_norm_bins(version: str) -> Mapping[str, Mapping[str, Any]]:
    """Load the named norm-database snapshot from disk.

    TODO: implement in PR #4 — bins keyed as
    ``f"{language}|{sex}|{age_bucket}"``, values containing per-feature
    mean / SD / n / source citation.
    """

    raise NotImplementedError(
        "normative.database.load_norm_bins: implement in PR #4 "
        "(see AUDIO_ANALYZER_STACK.md §9)."
    )
