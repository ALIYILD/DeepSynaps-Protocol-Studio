"""
Pydantic schemas for the MRI Analyzer.

These are the authoritative data types used across the pipeline and the
on-the-wire contract for the API. They match the JSON described in
docs/MRI_ANALYZER.md §7.
"""
from __future__ import annotations

from enum import Enum
from typing import Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class Modality(str, Enum):
    T1 = "T1"
    T2 = "T2"
    FLAIR = "FLAIR"
    RS_FMRI = "rs_fMRI"
    TASK_FMRI = "task_fMRI"
    DTI = "DTI"
    DWI = "DWI"
    ASL = "ASL"
    MRS = "MRS"


class SegmentationEngine(str, Enum):
    FASTSURFER = "fastsurfer"
    SYNTHSEG = "synthseg"
    SYNTHSEG_PLUS = "synthseg_plus"


class Sex(str, Enum):
    F = "F"
    M = "M"
    OTHER = "O"


# ---------------------------------------------------------------------------
# QC
# ---------------------------------------------------------------------------
class QCMetrics(BaseModel):
    t1_snr: float | None = None
    fmri_framewise_displacement_mean_mm: float | None = None
    fmri_outlier_volume_pct: float | None = None
    dti_outlier_volumes: int | None = None
    segmentation_failed_regions: list[str] = Field(default_factory=list)
    passed: bool = True
    notes: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Patient meta
# ---------------------------------------------------------------------------
class PatientMeta(BaseModel):
    patient_id: str
    age: int | None = None
    sex: Sex | None = None
    handedness: Literal["L", "R", "A"] | None = None
    chief_complaint: str | None = None


# ---------------------------------------------------------------------------
# Per-region metric with normative z-score
# ---------------------------------------------------------------------------
class NormedValue(BaseModel):
    value: float
    unit: str | None = None
    z: float | None = None
    percentile: float | None = None
    flagged: bool = False


# ---------------------------------------------------------------------------
# Structural
# ---------------------------------------------------------------------------
class StructuralMetrics(BaseModel):
    atlas: str = "Desikan-Killiany"
    cortical_thickness_mm: dict[str, NormedValue] = Field(default_factory=dict)
    subcortical_volume_mm3: dict[str, NormedValue] = Field(default_factory=dict)
    wmh_volume_ml: NormedValue | None = None
    ventricular_volume_ml: NormedValue | None = None
    icv_ml: float | None = None
    segmentation_engine: SegmentationEngine | None = None


# ---------------------------------------------------------------------------
# Functional
# ---------------------------------------------------------------------------
class NetworkMetric(BaseModel):
    network: Literal["DMN", "SN", "CEN", "SMN", "Language", "Visual", "DAN", "VAN"]
    mean_within_fc: NormedValue
    top_hubs: list[str] = Field(default_factory=list)


class FunctionalMetrics(BaseModel):
    networks: list[NetworkMetric] = Field(default_factory=list)
    sgACC_DLPFC_anticorrelation: NormedValue | None = None
    fc_matrix_shape: tuple[int, int] | None = None
    atlas: str = "Schaefer-400 + Yeo-17"


# ---------------------------------------------------------------------------
# Diffusion
# ---------------------------------------------------------------------------
class BundleMetric(BaseModel):
    bundle: str
    mean_FA: NormedValue
    mean_MD: NormedValue | None = None
    streamline_count: int | None = None


class DiffusionMetrics(BaseModel):
    bundles: list[BundleMetric] = Field(default_factory=list)
    fa_map_s3: str | None = None
    md_map_s3: str | None = None
    tractogram_s3: str | None = None


# ---------------------------------------------------------------------------
# Stim targets — the clinical output
# ---------------------------------------------------------------------------
class StimParameters(BaseModel):
    """Suggested device parameters. Decision-support only."""
    protocol: str | None = None            # "iTBS", "cTBS", "10Hz rTMS", "TPS", etc.
    sessions: int | None = None
    pulses_per_session: int | None = None
    intensity_pct_rmt: float | None = None   # for TMS
    frequency_hz: float | None = None
    duty_cycle_pct: float | None = None      # for tFUS
    derated_pr_mpa: float | None = None      # for tFUS
    derated_i_sppa_w_cm2: float | None = None
    derated_i_spta_mw_cm2: float | None = None
    mechanical_index: float | None = None
    roi_volume_cm3: float | None = None      # for TPS
    pulses_per_hemisphere: int | None = None  # for TPS


class StimTarget(BaseModel):
    target_id: str
    modality: Literal["rtms", "tps", "tfus", "tdcs", "tacs"]
    condition: str                           # matches kg_entities.code for condition
    region_name: str                         # human-readable, e.g. "Left DLPFC (BA46)"
    region_code: str | None = None           # kg_entities.code if available, e.g. "dlpfc_l"
    mni_xyz: tuple[float, float, float]
    patient_xyz: tuple[float, float, float] | None = None
    cortical_depth_mm: float | None = None
    coil_orientation_deg: float | None = None  # for rTMS
    method: str                              # e.g. "sgACC_anticorrelation_personalized"
    method_reference_dois: list[str] = Field(default_factory=list)
    suggested_parameters: StimParameters = Field(default_factory=StimParameters)
    supporting_paper_ids_from_medrag: list[int] = Field(default_factory=list)
    confidence: Literal["low", "medium", "high"] = "medium"
    disclaimer: str = (
        "Reference target coordinates derived from peer-reviewed literature. "
        "Not a substitute for clinician judgment. For neuronavigation planning only."
    )


# ---------------------------------------------------------------------------
# MedRAG bridge payload
# ---------------------------------------------------------------------------
class MedRAGFinding(BaseModel):
    type: Literal["region_metric", "network_metric", "biomarker", "condition",
                  "modality", "region", "channel", "band", "outcome_measure"]
    value: str
    zscore: float | None = None
    polarity: int = 0


class MedRAGQuery(BaseModel):
    findings: list[MedRAGFinding] = Field(default_factory=list)
    conditions: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Top-level report
# ---------------------------------------------------------------------------
class MRIReport(BaseModel):
    analysis_id: UUID = Field(default_factory=uuid4)
    patient: PatientMeta
    modalities_present: list[Modality]
    qc: QCMetrics

    structural: StructuralMetrics | None = None
    functional: FunctionalMetrics | None = None
    diffusion: DiffusionMetrics | None = None

    stim_targets: list[StimTarget] = Field(default_factory=list)
    medrag_query: MedRAGQuery = Field(default_factory=MedRAGQuery)

    overlays: dict[str, str] = Field(default_factory=dict)   # target_id → S3/HTML URL
    report_pdf_s3: str | None = None
    report_html_s3: str | None = None

    pipeline_version: str = "0.1.0"
    norm_db_version: str = "ISTAGING-v1"

    class Config:
        json_schema_extra = {
            "example_see": "docs/MRI_ANALYZER.md §7"
        }
