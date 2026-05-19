from __future__ import annotations

from .schemas import EEGInputMetadata, EEGQualityCheck


def validate_eeg_metadata(metadata: EEGInputMetadata) -> EEGQualityCheck:
    warnings: list[str] = []
    if metadata.channel_count < 8:
        warnings.append("Low channel count for clinical EEG use.")
    if metadata.sample_rate_hz < 128:
        warnings.append("Sampling rate may be insufficient for some biomarkers.")
    return EEGQualityCheck(
        passed=not warnings,
        warnings=warnings,
        artifact_flags=[],
    )
