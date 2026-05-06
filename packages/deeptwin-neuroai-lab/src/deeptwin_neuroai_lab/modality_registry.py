"""Modality registry: formats, feature groups, visualization hints, safety notes."""

from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field

from deeptwin_neuroai_lab.schemas import Modality


class ClinicalStatus(str, Enum):
    research_only = "research_only"
    clinician_reviewed = "clinician_reviewed"
    validated_instrument = "validated_instrument"


class ModalityRegistryEntry(BaseModel):
    modality: Modality
    accepted_input_formats: list[str]
    feature_groups: list[str]
    dashboard_visualisation: str
    safety_notes: str
    clinical_status: ClinicalStatus = ClinicalStatus.research_only


MODALITY_REGISTRY: dict[Modality, ModalityRegistryEntry] = {
    Modality.eeg: ModalityRegistryEntry(
        modality=Modality.eeg,
        accepted_input_formats=["EDF", "CSV", "JSON", "vendor_export"],
        feature_groups=["band_power", "asymmetry", "coherence", "peak_frequency", "artefact_score"],
        dashboard_visualisation="line_chart",
        safety_notes="Spectral and derived metrics are exploratory unless interpreted by a clinician.",
        clinical_status=ClinicalStatus.research_only,
    ),
    Modality.qeeg: ModalityRegistryEntry(
        modality=Modality.qeeg,
        accepted_input_formats=["EDF", "CSV", "JSON", "vendor_export"],
        feature_groups=["band_power", "asymmetry", "coherence", "normative_comparison_placeholder"],
        dashboard_visualisation="heatmap",
        safety_notes="Not diagnostic alone; normative comparisons require validated pipelines.",
        clinical_status=ClinicalStatus.clinician_reviewed,
    ),
    Modality.mri: ModalityRegistryEntry(
        modality=Modality.mri,
        accepted_input_formats=["DICOM", "NIfTI", "report_JSON"],
        feature_groups=["volume", "registration_quality", "segmentation_summary"],
        dashboard_visualisation="volume_placeholder",
        safety_notes="Structural summaries support context only.",
        clinical_status=ClinicalStatus.clinician_reviewed,
    ),
    Modality.fmri: ModalityRegistryEntry(
        modality=Modality.fmri,
        accepted_input_formats=["NIfTI", "timeseries_JSON"],
        feature_groups=["activation_summary", "connectivity_placeholder"],
        dashboard_visualisation="heatmap",
        safety_notes="Task fMRI summaries are research-context unless formally reported.",
        clinical_status=ClinicalStatus.research_only,
    ),
    Modality.video: ModalityRegistryEntry(
        modality=Modality.video,
        accepted_input_formats=["mp4", "mov", "landmarks_JSON"],
        feature_groups=["gaze", "facial_affect_proxy", "movement", "engagement_proxy"],
        dashboard_visualisation="timeline",
        safety_notes="Behavioural analytics only; not a developmental or psychiatric diagnosis.",
        clinical_status=ClinicalStatus.research_only,
    ),
    Modality.audio: ModalityRegistryEntry(
        modality=Modality.audio,
        accepted_input_formats=["wav", "mp3", "features_JSON"],
        feature_groups=["rms", "spectral_centroid_placeholder"],
        dashboard_visualisation="timeline",
        safety_notes="Audio features are exploratory.",
        clinical_status=ClinicalStatus.research_only,
    ),
    Modality.voice: ModalityRegistryEntry(
        modality=Modality.voice,
        accepted_input_formats=["wav", "features_JSON"],
        feature_groups=["prosody", "pitch_variability", "speech_rate", "pauses"],
        dashboard_visualisation="bar_chart",
        safety_notes="Prosody proxies are not diagnostic of speech or cognitive disorders.",
        clinical_status=ClinicalStatus.research_only,
    ),
    Modality.text: ModalityRegistryEntry(
        modality=Modality.text,
        accepted_input_formats=["plain_text", "JSON"],
        feature_groups=["length", "sentiment_proxy_placeholder"],
        dashboard_visualisation="table",
        safety_notes="Text analytics require governance for PHI.",
        clinical_status=ClinicalStatus.research_only,
    ),
    Modality.clinical_note: ModalityRegistryEntry(
        modality=Modality.clinical_note,
        accepted_input_formats=["plain_text", "FHIR_note_JSON"],
        feature_groups=["structured_tags_placeholder"],
        dashboard_visualisation="table",
        safety_notes="Notes are authored by clinicians; NLP summaries are assistive only.",
        clinical_status=ClinicalStatus.clinician_reviewed,
    ),
    Modality.assessment: ModalityRegistryEntry(
        modality=Modality.assessment,
        accepted_input_formats=["JSON", "CSV", "PDF_scores_manual"],
        feature_groups=["scale_scores", "domain_scores", "change_from_baseline"],
        dashboard_visualisation="trend_chart",
        safety_notes="Interpretation depends on validated instruments and clinical context.",
        clinical_status=ClinicalStatus.validated_instrument,
    ),
    Modality.biometric: ModalityRegistryEntry(
        modality=Modality.biometric,
        accepted_input_formats=["CSV", "JSON", "vendor_sync"],
        feature_groups=["heart_rate", "hrv_proxy", "sleep_summary", "steps"],
        dashboard_visualisation="trend_chart",
        safety_notes="Consumer biometrics are supportive context only.",
        clinical_status=ClinicalStatus.research_only,
    ),
    Modality.medication: ModalityRegistryEntry(
        modality=Modality.medication,
        accepted_input_formats=["FHIR_MedicationStatement", "CSV"],
        feature_groups=["dose_timeline", "adherence_placeholder"],
        dashboard_visualisation="timeline",
        safety_notes="Medication timelines require clinician reconciliation.",
        clinical_status=ClinicalStatus.clinician_reviewed,
    ),
    Modality.intervention: ModalityRegistryEntry(
        modality=Modality.intervention,
        accepted_input_formats=["session_JSON", "CSV", "EHR_export"],
        feature_groups=[
            "session_count",
            "cumulative_duration",
            "target_distribution",
            "dose_proxy",
        ],
        dashboard_visualisation="timeline",
        safety_notes="No automatic parameter changes; sessions describe care context.",
        clinical_status=ClinicalStatus.clinician_reviewed,
    ),
    Modality.outcome_score: ModalityRegistryEntry(
        modality=Modality.outcome_score,
        accepted_input_formats=["JSON", "CSV"],
        feature_groups=["scale_name", "score", "delta_vs_baseline"],
        dashboard_visualisation="trend_chart",
        safety_notes="Longitudinal scores show association patterns only.",
        clinical_status=ClinicalStatus.validated_instrument,
    ),
    Modality.wearable: ModalityRegistryEntry(
        modality=Modality.wearable,
        accepted_input_formats=["vendor_JSON", "CSV"],
        feature_groups=["activity", "sleep", "stress_proxy"],
        dashboard_visualisation="trend_chart",
        safety_notes="Wearable metrics are noisy; use as context.",
        clinical_status=ClinicalStatus.research_only,
    ),
    Modality.lab_result: ModalityRegistryEntry(
        modality=Modality.lab_result,
        accepted_input_formats=["FHIR_Observation", "CSV"],
        feature_groups=["value", "unit", "reference_flag_placeholder"],
        dashboard_visualisation="table",
        safety_notes="Labs must be verified against primary records.",
        clinical_status=ClinicalStatus.clinician_reviewed,
    ),
    Modality.sleep: ModalityRegistryEntry(
        modality=Modality.sleep,
        accepted_input_formats=["CSV", "JSON"],
        feature_groups=["duration", "efficiency_proxy", "staging_placeholder"],
        dashboard_visualisation="trend_chart",
        safety_notes="Sleep staging requires validated acquisition.",
        clinical_status=ClinicalStatus.research_only,
    ),
    Modality.behaviour: ModalityRegistryEntry(
        modality=Modality.behaviour,
        accepted_input_formats=["observation_JSON", "rating_scales"],
        feature_groups=["episode_counts_placeholder"],
        dashboard_visualisation="timeline",
        safety_notes="Behavioural codes are observational, not diagnostic labels.",
        clinical_status=ClinicalStatus.research_only,
    ),
    Modality.other: ModalityRegistryEntry(
        modality=Modality.other,
        accepted_input_formats=["JSON"],
        feature_groups=["custom"],
        dashboard_visualisation="table",
        safety_notes="Unclassified modality — review provenance.",
        clinical_status=ClinicalStatus.research_only,
    ),
}


def list_modalities() -> list[Modality]:
    return list(MODALITY_REGISTRY.keys())


def get_entry(modality: Modality) -> ModalityRegistryEntry | None:
    return MODALITY_REGISTRY.get(modality)


def registry_summary() -> dict[str, Any]:
    return {
        m.value: entry.model_dump(mode="json")
        for m, entry in MODALITY_REGISTRY.items()
    }
