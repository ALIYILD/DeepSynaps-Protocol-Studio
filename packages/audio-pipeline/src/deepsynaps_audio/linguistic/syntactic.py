"""Syntactic-complexity features: MLU, Yngve depth, embedded-clause depth."""

from __future__ import annotations

from ..schemas import SyntacticFeatures, Transcript


def syntactic_features(transcript: Transcript) -> SyntacticFeatures:
    """Compute the cognitive-speech syntactic feature pack.

    TODO: implement in v2 — MLU and Yngve depth via spaCy parse trees;
    embedded clause depth via a custom walker over the dependency
    graph.
    """

    raise NotImplementedError(
        "linguistic.syntactic.syntactic_features: v2 module — see AUDIO_ANALYZER_STACK.md §7."
    )
