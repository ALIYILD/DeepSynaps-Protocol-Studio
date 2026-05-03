"""Backend adapters for optional audio and ML dependencies."""

from deepsynaps_audio.backends.audio_io import (
    AudioIOBackend,
    AudioIOError,
    DecodedAudio,
    get_default_audio_backend,
)

__all__ = ["AudioIOBackend", "AudioIOError", "DecodedAudio", "get_default_audio_backend"]
