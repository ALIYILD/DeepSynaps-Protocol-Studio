"""Demographic-binned z-score helper."""

from __future__ import annotations

from ..schemas import ZScore


def zscore(
    feature: str,
    value: float,
    *,
    age: int,
    sex: str,
    language: str,
) -> ZScore:
    """Return a typed :class:`ZScore` against the matching normative bin.

    TODO: implement in PR #4 alongside :func:`load_norm_bins`. Always
    populate ``n_in_bin`` and ``bin_id`` so reports can disclose which
    cohort drove the comparison.
    """

    raise NotImplementedError(
        "normative.zscore.zscore: implement in PR #4 "
        "(see AUDIO_ANALYZER_STACK.md §9)."
    )
