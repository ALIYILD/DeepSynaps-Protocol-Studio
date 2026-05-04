"""Spike detection, AI augmentation, and spike-triggered averaging (M11)."""

from app.spikes.detect_classical import detect_spikes_classical
from app.spikes.detect_ai import augment_spikes_with_ai

__all__ = ["detect_spikes_classical", "augment_spikes_with_ai"]
