"""Structured EEG domain knowledge from curated clinical education sources.

This package injects artifact-awareness, normative context, and clinical
reasoning rules into the qEEG pipeline without changing the existing safety
architecture. All functions are deterministic, import-safe, and PHI-free.
"""
from __future__ import annotations

from .artifact_atlas import ArtifactAtlas, flag_artifact_confounds
from .channel_anatomy import ChannelAtlas, channels_for_artifact, explain_channel
from .encyclopedia import DOMAIN_ENCYCLOPEDIA, explain_domain_concept
from .findings_enhancer import enhance_findings
from .medication_eeg import MedicationEEGAtlas, flag_medication_confounds
from .normative import NormativeContext, age_aware_band_range, expected_pdr_hz
from .sleep_classifier import SleepClassifier, extract_epoch_features_mne
from .sleep_staging import SleepArchitecture, SleepStagingEngine, describe_sleep_stage
from .wineeg_reference import (
    format_wineeg_workflow_context,
    load_wineeg_reference_library,
    manual_analysis_checklist,
    required_workflow_categories,
    validate_wineeg_reference_library,
)

__all__ = [
    "ArtifactAtlas",
    "ChannelAtlas",
    "DOMAIN_ENCYCLOPEDIA",
    "MedicationEEGAtlas",
    "NormativeContext",
    "SleepArchitecture",
    "SleepClassifier",
    "SleepStagingEngine",
    "age_aware_band_range",
    "channels_for_artifact",
    "describe_sleep_stage",
    "enhance_findings",
    "expected_pdr_hz",
    "explain_channel",
    "explain_domain_concept",
    "extract_epoch_features_mne",
    "flag_artifact_confounds",
    "flag_medication_confounds",
    "format_wineeg_workflow_context",
    "load_wineeg_reference_library",
    "manual_analysis_checklist",
    "required_workflow_categories",
    "validate_wineeg_reference_library",
]
