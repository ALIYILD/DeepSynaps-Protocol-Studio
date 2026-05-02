"""Prosodic features computed from a recording + its transcript."""

from __future__ import annotations

from ..schemas import ProsodyFeatures, Recording, Transcript


def prosody_from_transcript(recording: Recording, transcript: Transcript) -> ProsodyFeatures:
    """Speech rate, articulation rate, pause stats, hesitation markers.

    TODO: implement in v2 — derive pause segments from word-level
    timestamps + a VAD pass; speech rate from word count over voiced
    duration; articulation rate from syllable estimation.
    """

    raise NotImplementedError(
        "linguistic.prosody.prosody_from_transcript: v2 module — see AUDIO_ANALYZER_STACK.md §7."
    )
