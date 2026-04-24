"""
Canonical coordinate atlas and static clinical reference values.

Every coordinate is in MNI152NLin2009cAsym space (same as fMRIPrep default,
same as pgvector-stored paper abstracts) unless explicitly noted.

References are DOIs or PubMed IDs from the 87k-paper DeepSynaps DB.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class TargetAtlasEntry:
    """One canonical stim target with its evidence anchor."""
    target_id: str
    modality: str                    # rtms | tps | tfus | tdcs | tacs
    condition: str                   # kg_entities.code
    region_name: str
    region_code: str | None
    mni_xyz: tuple[float, float, float]
    method: str
    reference_dois: tuple[str, ...]
    notes: str = ""


# ---------------------------------------------------------------------------
# rTMS — DLPFC targets for MDD
# ---------------------------------------------------------------------------
RTMS_MDD_TARGETS: list[TargetAtlasEntry] = [
    TargetAtlasEntry(
        target_id="rTMS_MDD_Fox_sgACC",
        modality="rtms",
        condition="mdd",
        region_name="Left DLPFC (Fox sgACC-anticorrelation group target)",
        region_code="dlpfc_l",
        mni_xyz=(-38, 44, 26),
        method="sgACC_anticorrelation_group",
        reference_dois=("10.1016/j.biopsych.2012.04.028",),
        notes="Fox et al. 2012, Biol Psychiatry — group-average target with strongest sgACC-negative FC",
    ),
    TargetAtlasEntry(
        target_id="rTMS_MDD_BA9",
        modality="rtms",
        condition="mdd",
        region_name="Left DLPFC — BA9 (dorsal)",
        region_code="dlpfc_l",
        mni_xyz=(-36, 39, 43),
        method="anatomical_BA9",
        reference_dois=("10.1016/j.biopsych.2020.07.021",),
    ),
    TargetAtlasEntry(
        target_id="rTMS_MDD_BA46",
        modality="rtms",
        condition="mdd",
        region_name="Left DLPFC — BA46",
        region_code="dlpfc_l",
        mni_xyz=(-44, 40, 29),
        method="anatomical_BA46",
        reference_dois=("10.1001/jamapsychiatry.2015.1413",),
    ),
    TargetAtlasEntry(
        target_id="rTMS_MDD_F3_Beam",
        modality="rtms",
        condition="mdd",
        region_name="Left DLPFC — F3 Beam group target",
        region_code="dlpfc_l",
        mni_xyz=(-37, 26, 49),
        method="F3_Beam_projection",
        reference_dois=("10.1016/j.brs.2009.03.005",),
        notes="Beam et al. 2009 — 10-20 EEG F3 projected to cortex",
    ),
    TargetAtlasEntry(
        target_id="rTMS_MDD_sgACC_Cash",
        modality="rtms",
        condition="mdd",
        region_name="Left DLPFC — Cash sgACC target (SAINT)",
        region_code="dlpfc_l",
        mni_xyz=(-42, 44, 30),
        method="sgACC_anticorrelation_Cash",
        reference_dois=("10.1176/appi.ajp.2021.20101429",),
        notes="SAINT / Nolan Williams lab",
    ),
]

# ---------------------------------------------------------------------------
# rTMS — other conditions
# ---------------------------------------------------------------------------
RTMS_OTHER_TARGETS: list[TargetAtlasEntry] = [
    TargetAtlasEntry("rTMS_PTSD_R_DLPFC", "rtms", "ptsd",
                     "Right DLPFC", "dlpfc_r", (42, 40, 26),
                     "anatomical", ("10.1176/appi.ajp.2018.17101180",)),
    TargetAtlasEntry("rTMS_OCD_DMPFC", "rtms", "ocd",
                     "Dorsomedial PFC / pre-SMA", "vmpfc", (0, 50, 30),
                     "anatomical", ("10.1176/appi.ajp.2019.18101180",)),
    TargetAtlasEntry("rTMS_OCD_preSMA", "rtms", "ocd",
                     "Pre-Supplementary Motor Area", "sma", (0, 18, 58),
                     "anatomical", ("10.1016/j.brs.2018.11.009",)),
    TargetAtlasEntry("rTMS_PAIN_L_M1", "rtms", "chronic_pain",
                     "Left Primary Motor Cortex (hand)", "m1_l", (-37, -21, 58),
                     "anatomical", ("10.1016/j.pain.2014.10.018",)),
    TargetAtlasEntry("rTMS_TIN_L_A1", "rtms", "tinnitus",
                     "Left Primary Auditory Cortex", "temporal_superior", (-52, -20, 6),
                     "anatomical", ("10.1002/hbm.24694",)),
    TargetAtlasEntry("rTMS_STROKE_contraR_M1", "rtms", "stroke",
                     "Right M1 (contralesional inhibition)", "m1_r", (37, -21, 58),
                     "anatomical", ("10.1016/j.apmr.2016.06.019",)),
    TargetAtlasEntry("rTMS_ADHD_R_DLPFC", "rtms", "adhd",
                     "Right DLPFC", "dlpfc_r", (42, 40, 26),
                     "anatomical", ("10.1007/s00406-022-01484-8",)),
    TargetAtlasEntry("rTMS_PD_M1", "rtms", "parkinsons",
                     "Primary Motor Cortex (bilateral)", "m1_l", (-37, -21, 58),
                     "anatomical", ("10.1002/mds.28233",)),
]

# ---------------------------------------------------------------------------
# TPS (Transcranial Pulse Stimulation) — Alzheimer / MCI / TRD (Storz Neurolith)
# ---------------------------------------------------------------------------
TPS_AD_TARGETS: list[TargetAtlasEntry] = [
    TargetAtlasEntry(
        target_id="TPS_AD_bilateral_frontal",
        modality="tps",
        condition="alzheimers",
        region_name="Bilateral frontal cortex (DLPFC + IFG incl. Broca)",
        region_code="dlpfc_l",
        mni_xyz=(-38, 40, 26),
        method="TPS_AD_ROI_frontal",
        reference_dois=("10.1002/alz.12093", "10.1007/s40120-022-00395-z"),
        notes="Beisteiner 2020; 2×800 pulses/hemisphere; ROI volume 136-164 cm³",
    ),
    TargetAtlasEntry(
        target_id="TPS_AD_bilateral_parietal",
        modality="tps",
        condition="alzheimers",
        region_name="Bilateral lateral parietal cortex (incl. Wernicke)",
        region_code="angular_gyrus",
        mni_xyz=(-48, -56, 30),
        method="TPS_AD_ROI_parietal",
        reference_dois=("10.1002/alz.12093",),
        notes="2×400 pulses/hemisphere; ROI volume 122-147 cm³",
    ),
    TargetAtlasEntry(
        target_id="TPS_AD_precuneus",
        modality="tps",
        condition="alzheimers",
        region_name="Extended precuneus (bilateral, DMN hub)",
        region_code="precuneus",
        mni_xyz=(0, -66, 42),
        method="TPS_AD_ROI_precuneus",
        reference_dois=("10.1002/alz.12093", "10.3389/fnagi.2022.820587"),
        notes="2×600 pulses bilateral; ROI volume 66-92 cm³; DMN hub",
    ),
]

# ---------------------------------------------------------------------------
# tFUS (transcranial focused ultrasound) — clinical-adjacent
# ---------------------------------------------------------------------------
TFUS_TARGETS: list[TargetAtlasEntry] = [
    TargetAtlasEntry(
        target_id="tFUS_TRD_SCC",
        modality="tfus",
        condition="mdd",
        region_name="Subcallosal cingulate (SCC / BA25)",
        region_code="acc_rostral",
        mni_xyz=(4, 20, -12),
        method="tFUS_SCC_Riis",
        reference_dois=("10.1016/j.brs.2023.01.016",),
        notes="Riis et al. 2023 NCT05301036 — depressive symptoms resolved within 24h",
    ),
    TargetAtlasEntry(
        target_id="tFUS_EPI_L_hippocampus",
        modality="tfus",
        condition="alzheimers",   # also MCI / epilepsy
        region_name="Left hippocampus",
        region_code="hippocampus",
        mni_xyz=(-26, -22, -12),
        method="tFUS_Brinker",
        reference_dois=("10.1016/j.brs.2020.03.010",),
        notes="Brinker 2020 NCT03868293 — drug-resistant mTLE; also used as DLPFC-seed for AD",
    ),
    TargetAtlasEntry(
        target_id="tFUS_M1_hand",
        modality="tfus",
        condition="chronic_pain",
        region_name="Left Primary Motor Cortex (hand)",
        region_code="m1_l",
        mni_xyz=(-37, -21, 58),
        method="tFUS_M1_Legon",
        reference_dois=("10.1038/s41593-018-0242-x",),
    ),
    TargetAtlasEntry(
        target_id="tFUS_R_IFG_mood",
        modality="tfus",
        condition="mdd",
        region_name="Right Inferior Frontal Gyrus",
        region_code="ifg",
        mni_xyz=(48, 20, 20),
        method="tFUS_IFG_Sanguinetti",
        reference_dois=("10.3389/fnhum.2020.00052",),
    ),
    TargetAtlasEntry(
        target_id="tFUS_thalamic_VPL",
        modality="tfus",
        condition="chronic_pain",
        region_name="Right Thalamic VPL",
        region_code="thalamus",
        mni_xyz=(18, -20, 6),
        method="tFUS_Kim",
        reference_dois=("10.1016/j.brs.2023.02.017",),
    ),
]

# ---------------------------------------------------------------------------
# Aggregate
# ---------------------------------------------------------------------------
ALL_TARGETS: list[TargetAtlasEntry] = (
    RTMS_MDD_TARGETS + RTMS_OTHER_TARGETS + TPS_AD_TARGETS + TFUS_TARGETS
)

# ---------------------------------------------------------------------------
# Seeds for personalized targeting
# ---------------------------------------------------------------------------
# sgACC seed — 10 mm sphere in MNI for DLPFC anticorrelation
SGACC_SEED_MNI: tuple[float, float, float] = (-6, 16, -10)
SGACC_SEED_RADIUS_MM: float = 10.0

# Left DLPFC search ROI for personalization (intersection of BA9 / BA46 / MFG)
DLPFC_L_SEARCH_ROI_MNI_BBOX: dict[str, tuple[float, float]] = {
    "x": (-50, -30),
    "y": ( 10, 60),
    "z": ( 10, 55),
}


# ---------------------------------------------------------------------------
# TPS / tFUS reference device parameters (from the targeting atlas + FDA)
# ---------------------------------------------------------------------------
TPS_NEUROLITH_DEFAULT: dict = {
    "device": "Storz Medical Neurolith",
    "energy_mj_mm2": 0.25,
    "pulse_duration_us": 3,
    "frequency_hz": 4,
    "penetration_depth_mm": 80,
    "focal_fwhm_mm": 5,
}

TFUS_FDA_LIMITS: dict = {
    "i_spta_derated_mw_cm2": 720,
    "mechanical_index_max": 1.9,
    "i_sppa_derated_w_cm2_max_clinical": 40,   # commonly used upper bound
    "typical_frequency_khz_range": (200, 1100),
}


# ---------------------------------------------------------------------------
# Normative database version strings (cited by every report)
# ---------------------------------------------------------------------------
NORM_DB_VERSION = "ISTAGING-v1"
NORM_DB_SOURCES = (
    "Habes et al. 2021 ISTAGING (N≈10000)",
    "UK Biobank imaging (~40000)",
    "ADNI 1/2/3 (~2500)",
    "ARIC-NCS (WMH normative)",
)

# MNI template
MNI_TEMPLATE = "MNI152NLin2009cAsym"
