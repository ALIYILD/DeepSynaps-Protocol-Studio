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

from pydantic import BaseModel, ConfigDict, Field


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
# QC — base IQMs + MRIQC layer + incidental-finding triage
# ---------------------------------------------------------------------------
class MRIQCResult(BaseModel):
    """Image-quality metrics produced by the MRIQC wrapper.

    The wrapper in :mod:`deepsynaps_mri.qc` calls the ``mriqc`` CLI via
    subprocess; when the binary is missing or the call fails ``status``
    becomes ``dependency_missing`` / ``failed`` and the pipeline proceeds
    without blocking. Thresholds come from the MRIQC project defaults.

    Evidence
    --------
    * Esteban O et al., 2017, ``10.1371/journal.pone.0184661`` — MRIQC
      reference implementation and IQM definitions.
    """

    status: Literal["ok", "dependency_missing", "failed"]
    cnr: float | None = None
    snr: float | None = None
    efc: float | None = None
    fber: float | None = None
    fwhm_mm: float | None = None
    motion_mean_fd_mm: float | None = None
    passes_threshold: bool = True
    thresholds_version: str = "mriqc-0.15"
    error_message: str | None = None


class IncidentalFinding(BaseModel):
    """One candidate incidental radiological finding.

    Always flagged for clinician review; DeepSynaps is not a diagnostic
    tool. Provided for research / wellness use as a triage aid.
    """

    finding_type: Literal["wmh", "tumor", "infarct", "cyst", "other"]
    location_region: str | None = None
    volume_ml: float | None = None
    severity: Literal["minor", "moderate", "severe"] = "minor"
    confidence: float                           # 0..1
    requires_radiologist_review: bool = True


class IncidentalFindingResult(BaseModel):
    """Envelope from the incidental-finding screening CNN.

    Evidence
    --------
    * LST-AI 2024 — https://github.com/CompImg/LST-AI (white-matter
      hyperintensity segmentation).
    * BRATS-style tumour detectors.
    """

    status: Literal["ok", "dependency_missing", "failed"]
    findings: list[IncidentalFinding] = Field(default_factory=list)
    any_flagged: bool = False
    classifier_version: str = "wmh_tumor_infarct_v1"
    error_message: str | None = None


class QCMetrics(BaseModel):
    t1_snr: float | None = None
    fmri_framewise_displacement_mean_mm: float | None = None
    fmri_outlier_volume_pct: float | None = None
    dti_outlier_volumes: int | None = None
    segmentation_failed_regions: list[str] = Field(default_factory=list)
    passed: bool = True
    notes: list[str] = Field(default_factory=list)
    # Radiology screening layer (AI_UPGRADES §P0 #5) — both optional. The
    # pipeline populates these at ingest time via :mod:`deepsynaps_mri.qc`.
    mriqc: MRIQCResult | None = None
    incidental: IncidentalFindingResult | None = None


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
    # Optional decision-support fields surfaced to the consumer for safer
    # interpretation. All default to ``None`` so existing payloads round-trip
    # unchanged (back-compat for pipeline.py + the demo report).
    reference_range: tuple[float, float] | None = None
    confidence: Literal["low", "medium", "high"] | None = None
    model_id: str | None = None


# ---------------------------------------------------------------------------
# Structural
# ---------------------------------------------------------------------------
class BrainAgePrediction(BaseModel):
    """Brain-age + cognition proxy from a 3D CNN applied to preprocessed T1.

    Evidence
    --------
    * Alzheimer's Res Ther 2025, PMC12125894 — 3D CNN trained on >10k scans,
      MAE = 3.30 y, cognition AUC ≈ 0.95.
    * Nature Aging 2025, ``s41514-025-00260-x`` — 2D clinical variant.
    * UK Biobank CNN, MAE = 2.67 y.
    * Open weights: https://github.com/westman-neuroimaging-group/brainage-prediction-mri.

    Research / wellness use only — not a clinical diagnostic.
    """

    status: Literal["ok", "dependency_missing", "failed", "not_estimable"] = "dependency_missing"
    predicted_age_years: float | None = None
    chronological_age_years: float | None = None
    brain_age_gap_years: float | None = None
    gap_zscore: float | None = None
    cognition_cdr_estimate: float | None = None
    model_id: str = "brainage_cnn_v1"
    mae_years_reference: float = 3.30          # Alzheimer's Res Ther 2025
    runtime_sec: float | None = None
    error_message: str | None = None
    # Decision-support upgrades — added 2026-04-26 night-shift.
    #
    # ``confidence_band_years``: ± window (in years) around the prediction
    # using the model's reference MAE. Surfaces ``[predicted - mae,
    # predicted + mae]`` so clinicians can read "58.7 ± 3.3 y" not a raw
    # point estimate.
    #
    # ``calibration_provenance``: human-readable note describing the
    # training cohort + age range the model was calibrated on. Lets
    # downstream callers spot out-of-distribution patients.
    #
    # ``not_estimable_reason``: when ``status='not_estimable'`` (added to
    # the Literal above) the safety wrapper writes a short explanation
    # here instead of returning a garbage age prediction.
    #
    # ``top_contributing_regions``: explainability hook — list of region
    # names + signed contribution to the gap. Empty by default; populated
    # by future per-region attribution work (Captum / SHAP). The schema
    # field is here today so the API contract is stable.
    confidence_band_years: tuple[float, float] | None = None
    calibration_provenance: str | None = None
    not_estimable_reason: str | None = None
    top_contributing_regions: list[dict] = Field(default_factory=list)


class StructuralMetrics(BaseModel):
    atlas: str = "Desikan-Killiany"
    cortical_thickness_mm: dict[str, NormedValue] = Field(default_factory=dict)
    subcortical_volume_mm3: dict[str, NormedValue] = Field(default_factory=dict)
    wmh_volume_ml: NormedValue | None = None
    ventricular_volume_ml: NormedValue | None = None
    icv_ml: float | None = None
    segmentation_engine: SegmentationEngine | None = None
    brain_age: BrainAgePrediction | None = None


# ---------------------------------------------------------------------------
# Morphometry / reporting (structural biomarkers aggregation)
# ---------------------------------------------------------------------------
class RegionalVolumeRow(BaseModel):
    """One subcortical (or ROI) volume from aseg.stats / volumes.csv."""

    region_id: str
    """Stable id, e.g. ``aseg.Left-Hippocampus`` or ``synthseg.Hippocampus``."""
    structure_name: str
    volume_mm3: float
    seg_id: int | None = None
    n_voxels: int | None = None
    source: Literal["freesurfer_aseg", "synthseg_csv", "manual"] = "freesurfer_aseg"

    def to_dict(self) -> dict:
        return self.model_dump()


class RegionalVolumesResult(BaseModel):
    ok: bool
    source: Literal["freesurfer_aseg", "synthseg_csv", "none"]
    rows: list[RegionalVolumeRow] = Field(default_factory=list)
    icv_mm3: float | None = None
    stats_path: str | None = None
    manifest_path: str | None = None
    code: str = ""
    message: str = ""

    def to_dict(self) -> dict:
        return self.model_dump()


class AsymmetryIndexRow(BaseModel):
    """Regional asymmetry: ``100 * (L - R) / mean(L,R)`` when mean > 0."""

    region_base: str
    left_structure: str
    right_structure: str
    volume_left_mm3: float
    volume_right_mm3: float
    asymmetry_index_pct: float
    flagged: bool = False
    """True if ``abs(asymmetry_index_pct)`` exceeds threshold."""

    def to_dict(self) -> dict:
        return self.model_dump()


class AsymmetryResult(BaseModel):
    ok: bool
    indices: list[AsymmetryIndexRow] = Field(default_factory=list)
    threshold_abs_pct: float = 10.0
    manifest_path: str | None = None
    code: str = ""
    message: str = ""

    def to_dict(self) -> dict:
        return self.model_dump()


class MorphometryProvenance(BaseModel):
    """Audit trail for morphometry tables (paths only — no PHI)."""

    pipeline_step: str = "morphometry_reporting"
    regional_volumes_source: str | None = None
    regional_volumes_path: str | None = None
    asymmetry_manifest_path: str | None = None
    thickness_summary_path: str | None = None
    segmentation_engine: str | None = None
    norm_db_version: str | None = None

    def to_dict(self) -> dict:
        return self.model_dump()


class MorphometrySummary(BaseModel):
    """Aggregated morphometry for API/report consumers (JSON-serialisable)."""

    ok: bool
    atlas: str = "Desikan-Killiany"
    n_regions_volume: int = 0
    n_asymmetry_pairs: int = 0
    qc_flags: list[str] = Field(default_factory=list)
    provenance: MorphometryProvenance = Field(default_factory=MorphometryProvenance)
    summary_path: str | None = None
    code: str = ""
    message: str = ""

    def to_dict(self) -> dict:
        return self.model_dump()


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


class EfieldDose(BaseModel):
    """Per-target E-field dose from SimNIBS head-model FEM.

    Evidence
    --------
    * Wang 2024 (Biol Psychiatry, PMC10922371) — review of E-field personalization
      for clinical TMS.
    * Makarov 2025 (Imaging Neuroscience ``imag_a_00412``) — real-time E-field
      reduced-order solver (<400 basis modes, <3% error).
    * TAP pipeline, NCT03289923 (MDD).

    All fields are optional so that pipelines which haven't run SimNIBS surface
    ``status='dependency_missing'`` without crashing any downstream consumer.
    """

    status: Literal["ok", "dependency_missing", "failed"] = "dependency_missing"
    v_per_m_at_target: float | None = None
    peak_v_per_m: float | None = None
    focality_50pct_volume_cm3: float | None = None
    iso_contour_mesh_s3: str | None = None           # path to .msh / .vtk
    e_field_png_s3: str | None = None                # 2D slice PNG overlay
    coil_optimised: bool = False
    optimised_coil_pos: dict[str, float] | None = None  # centre, direction
    solver: Literal["simnibs_fem", "simnibs_rt", "unavailable"] = "unavailable"
    runtime_sec: float | None = None
    error_message: str | None = None


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
    efield_dose: EfieldDose | None = None
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

    # Human-readable amber warnings surfaced at the top of the analyzer
    # page — populated when the MRIQC or incidental-finding stage flags
    # something a radiologist should review. Does not block pipeline
    # progress — surfaced only.
    qc_warnings: list[str] = Field(default_factory=list)
    clinical_summary: dict = Field(default_factory=dict)
    saved_evidence_citations: list[dict] = Field(default_factory=list)

    model_config = ConfigDict(
        json_schema_extra={
            "example_see": "docs/MRI_ANALYZER.md §7"
        }
    )


class MRIAnalysisReportPayload(BaseModel):
    """Report-ready bundle: top-level MRI report + morphometry audit block."""

    mri_report: MRIReport
    morphometry: MorphometrySummary
    regional_volumes: RegionalVolumesResult | None = None
    asymmetry: AsymmetryResult | None = None
    payload_json_path: str | None = None

    def to_dict(self) -> dict:
        return self.model_dump(mode="json")


# ---------------------------------------------------------------------------
# Longitudinal change-map (AI_UPGRADES §P0 #4)
# ---------------------------------------------------------------------------
class RegionChange(BaseModel):
    """One structural / functional / diffusion ROI delta between two visits.

    ``metric`` records which backing measure the delta was computed on so
    the frontend can group rows correctly. ``delta_pct`` follows
    ``(followup - baseline) / baseline * 100``; regions with |delta_pct|
    ≥ 2.5 % are flagged for attention.
    """

    region: str
    baseline_value: float
    followup_value: float
    delta_absolute: float
    delta_pct: float
    flagged: bool = False
    metric: Literal[
        "cortical_thickness_mm",
        "subcortical_volume_mm3",
        "mean_FA",
        "within_network_fc",
    ]


class LongitudinalReport(BaseModel):
    """Visit-to-visit change map for one patient across two ``MRIReport`` s.

    Evidence
    --------
    * Reuter M et al., 2012, ``10.1016/j.neuroimage.2012.02.084`` —
      FreeSurfer longitudinal processing stream (within-subject template,
      bias reduction for change detection).
    * Avants B et al., 2008 — Symmetric Normalization (SyN) and
      Jacobian-determinant change maps.
    * TPS Alzheimer's 6-month follow-up — NCT05910619.
    """

    baseline_analysis_id: UUID
    followup_analysis_id: UUID
    days_between: int | None = None
    structural_changes: list[RegionChange] = Field(default_factory=list)
    functional_changes: list[RegionChange] = Field(default_factory=list)
    diffusion_changes: list[RegionChange] = Field(default_factory=list)
    jacobian_determinant_s3: str | None = None
    change_overlay_png_s3: str | None = None
    summary: str | None = None
    pipeline_version: str = "0.1.0"
