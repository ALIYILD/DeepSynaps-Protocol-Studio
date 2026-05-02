"""Lexical-diversity features: TTR, MTLD, Brunet's W, Honoré's R, POS ratios."""

from __future__ import annotations

from ..analyzers.cognitive_speech import extract_linguistic_features
from ..schemas import LexicalFeatures, Transcript


def lexical_features(transcript: Transcript) -> LexicalFeatures:
    """Compute the lexical slice used by cognitive-speech analyzers (tokenizer-light heuristics)."""

    lf = extract_linguistic_features(transcript.text)
    return LexicalFeatures(
        type_token_ratio=lf.type_token_ratio,
        mtld=lf.mtld,
        brunet_w=lf.brunet_w,
        honore_r=lf.honore_r,
        noun_ratio=lf.noun_ratio,
        verb_ratio=lf.verb_ratio,
        pronoun_ratio=lf.pronoun_ratio,
        idea_density=lf.idea_density,
    )
