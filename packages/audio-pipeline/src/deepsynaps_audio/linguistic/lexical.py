"""Lexical-diversity features: TTR, MTLD, Brunet's W, Honoré's R, POS ratios."""

from __future__ import annotations

from ..schemas import LexicalFeatures, Transcript


def lexical_features(transcript: Transcript) -> LexicalFeatures:
    """Compute the cognitive-speech lexical feature pack.

    TODO: implement in v2 — TTR / MTLD / Brunet's W / Honoré's R via
    standard formulas; POS ratios via spaCy. Idea density is optional
    in v2 (Kintsch-style propositional density is language-specific).
    """

    raise NotImplementedError(
        "linguistic.lexical.lexical_features: v2 module — see AUDIO_ANALYZER_STACK.md §7."
    )
