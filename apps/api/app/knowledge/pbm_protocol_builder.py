"""
PBM Protocol Builder — Personalized Photobiomodulation Protocol Generator
========================================================================
Generates evidence-based PBM (Photobiomodulation / Low-Level Light Therapy)
protocols from patient profiles.  Includes dose calculation, device
recommendation, safety screening, and contraindication checking.

Schema version : 2.1.0
Last updated   : 2025-06-15
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, Final, List, Literal, Optional, Tuple

# ---------------------------------------------------------------------------
# Constants & Enumerations
# ---------------------------------------------------------------------------


class AgeGroup(Enum):
    """Age classification for dose adjustments."""

    PEDIATRIC = "pediatric"          # 5–17 years
    ADULT = "adult"                  # 18–64 years
    GERIATRIC = "geriatric"          # ≥65 years


class Sex(Enum):
    """Patient sex for scalp-transmittance adjustments."""

    MALE = "male"
    FEMALE = "female"
    OTHER = "other"


class SkinType(Enum):
    """Fitzpatrick skin type (I–VI) — affects power-density ceiling."""

    I = "I"      # very fair / always burns
    II = "II"    # fair / usually burns
    III = "III"  # medium / sometimes burns
    IV = "IV"    # olive / rarely burns
    V = "V"      # brown / very rarely burns
    VI = "VI"    # dark / never burns


class Severity(Enum):
    """Clinical severity of the target condition."""

    MILD = "mild"
    MODERATE = "moderate"
    SEVERE = "severe"


# Safety limits derived from ANSI Z80.36 / ICNIRP guidelines
MAX_DOSE_PER_SESSION_J_CM2: Final[int] = 100      # soft ceiling per site
MAX_CUMULATIVE_DOSE_J_CM2: Final[int] = 3000      # ~100 sessions × 30 J/cm²
MAX_POWER_DENSITY_MW_CM2: Final[int] = 500        # hard ceiling
MIN_TREATMENT_INTERVAL_HOURS: Final[int] = 8       # minimum between sessions

# Tissue optical properties (simplified)
SCALP_TRANSMITTANCE_DEFAULT: Final[float] = 0.04    # ~4 % at 810 nm
SCALP_TRANSMITTANCE_FEMALE: Final[float] = 0.045   # slightly higher (thinner hair)
SCALP_TRANSMITTANCE_MALE: Final[float] = 0.035     # slightly lower

# Age-based dose modifiers (fraction of adult dose)
PEDIATRIC_DOSE_MODIFIER: Final[float] = 0.60
GERIATRIC_DOSE_MODIFIER: Final[float] = 0.85

# Wavelength-specific optical window efficacy (normalised, 1.0 = peak)
OPTICAL_WINDOW_EFFICACY: Final[Dict[int, float]] = {
    630: 0.35,
    660: 0.55,
    670: 0.60,
    810: 1.00,
    830: 0.95,
    850: 0.80,
    940: 0.50,
    980: 0.40,
    1064: 0.70,
}

# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class PBMParameters:
    """Canonical parameter set for a single PBM indication."""

    condition: str
    wavelength_nm: int
    power_density_mw_cm2: float
    treatment_time_min: float
    sites: Tuple[str, ...]
    sessions: int
    frequency: str
    evidence: Tuple[str, ...]
    severity_modifiers: Dict[str, Dict[str, Any]] = field(default_factory=dict)


@dataclass(frozen=True)
class DeviceInfo:
    """Represents a commercial PBM device."""

    brand: str
    model: str
    fda_clearance: str            # e.g. "510(k) K123456" or "None"
    diode_count: int
    wavelengths_nm: Tuple[int, ...]
    max_power_density_mw_cm2: float
    helmet_type: str              # "helmet", "cap", "pad", "cluster"
    price_usd: float
    weight_kg: float
    notes: str = ""


# ---------------------------------------------------------------------------
# Evidence-based Protocol Library
# ---------------------------------------------------------------------------

PROTOCOL_LIBRARY: Final[List[PBMParameters]] = [
    # Depression -----------------------------------------------------------
    PBMParameters(
        condition="depression",
        wavelength_nm=810,
        power_density_mw_cm2=250.0,
        treatment_time_min=20.0,
        sites=("F3", "F4", "Cz"),
        sessions=30,
        frequency="3x_week_x10_weeks",
        evidence=("Schiffer_2009", "Cassano_2018", "Disner_2021"),
        severity_modifiers={
            "mild": {"power_density_mw_cm2": 150.0, "treatment_time_min": 15.0},
            "moderate": {"power_density_mw_cm2": 250.0, "treatment_time_min": 20.0},
            "severe": {"power_density_mw_cm2": 300.0, "treatment_time_min": 25.0},
        },
    ),
    # TBI / concussion -----------------------------------------------------
    PBMParameters(
        condition="tbi_concussion",
        wavelength_nm=810,
        power_density_mw_cm2=150.0,
        treatment_time_min=20.0,
        sites=("F3", "F4", "Cz", "P3", "P4", "T3", "T4"),
        sessions=30,
        frequency="3x_week_x10_weeks",
        evidence=("Henderson_2016", "Naeser_2014", "Morries_2015"),
        severity_modifiers={
            "mild": {"power_density_mw_cm2": 100.0, "treatment_time_min": 15.0},
            "moderate": {"power_density_mw_cm2": 150.0, "treatment_time_min": 20.0},
            "severe": {"power_density_mw_cm2": 250.0, "treatment_time_min": 25.0},
        },
    ),
    # Cognitive decline / MCI / dementia -----------------------------------
    PBMParameters(
        condition="cognitive_decline",
        wavelength_nm=810,
        power_density_mw_cm2=250.0,
        treatment_time_min=20.0,
        sites=("F3", "F4", "P3", "P4"),
        sessions=30,
        frequency="3x_week_x10_weeks",
        evidence=("Saltmarche_2017", "Nizamutdinov_2021", "Berman_2017"),
        severity_modifiers={
            "mild": {"power_density_mw_cm2": 200.0, "treatment_time_min": 15.0},
            "moderate": {"power_density_mw_cm2": 250.0, "treatment_time_min": 20.0},
            "severe": {"power_density_mw_cm2": 250.0, "treatment_time_min": 25.0},
        },
    ),
    # ADHD -----------------------------------------------------------------
    PBMParameters(
        condition="adhd",
        wavelength_nm=810,
        power_density_mw_cm2=100.0,
        treatment_time_min=15.0,
        sites=("F3", "F4"),
        sessions=18,
        frequency="3x_week_x6_weeks",
        evidence=("Sobral_2022", "Saleh_2023", "Barbosa_2023"),
        severity_modifiers={
            "mild": {"power_density_mw_cm2": 100.0, "treatment_time_min": 10.0},
            "moderate": {"power_density_mw_cm2": 100.0, "treatment_time_min": 15.0},
            "severe": {"power_density_mw_cm2": 150.0, "treatment_time_min": 20.0},
        },
    ),
    # PTSD -----------------------------------------------------------------
    PBMParameters(
        condition="ptsd",
        wavelength_nm=810,
        power_density_mw_cm2=250.0,
        treatment_time_min=20.0,
        sites=("F3", "F4", "Cz"),
        sessions=30,
        frequency="3x_week_x10_weeks",
        evidence=("Cassano_2019", "Petrie_2021", "Wang_2022"),
        severity_modifiers={
            "mild": {"power_density_mw_cm2": 150.0, "treatment_time_min": 15.0},
            "moderate": {"power_density_mw_cm2": 250.0, "treatment_time_min": 20.0},
            "severe": {"power_density_mw_cm2": 300.0, "treatment_time_min": 25.0},
        },
    ),
    # Chronic pain ---------------------------------------------------------
    PBMParameters(
        condition="chronic_pain",
        wavelength_nm=810,
        power_density_mw_cm2=100.0,
        treatment_time_min=10.0,
        sites=("pain_site",),          # placeholder — customised per patient
        sessions=12,
        frequency="3x_week_x4_weeks",
        evidence=("Chow_2009", "Glazov_2016", "de_Freitas_2018"),
        severity_modifiers={
            "mild": {"power_density_mw_cm2": 50.0, "treatment_time_min": 5.0},
            "moderate": {"power_density_mw_cm2": 100.0, "treatment_time_min": 10.0},
            "severe": {"power_density_mw_cm2": 150.0, "treatment_time_min": 15.0},
        },
    ),
    # Sleep disorders ------------------------------------------------------
    PBMParameters(
        condition="sleep_disorder",
        wavelength_nm=810,
        power_density_mw_cm2=100.0,
        treatment_time_min=20.0,
        sites=("Cz", "Pz"),
        sessions=24,
        frequency="3x_week_x8_weeks",
        evidence=("Figueiro_2019", "Sommer_2019", "Merry_2022"),
        severity_modifiers={
            "mild": {"power_density_mw_cm2": 50.0, "treatment_time_min": 10.0},
            "moderate": {"power_density_mw_cm2": 100.0, "treatment_time_min": 20.0},
            "severe": {"power_density_mw_cm2": 150.0, "treatment_time_min": 25.0},
        },
    ),
    # Stroke recovery ------------------------------------------------------
    PBMParameters(
        condition="stroke_recovery",
        wavelength_nm=810,
        power_density_mw_cm2=100.0,
        treatment_time_min=20.0,
        sites=("perilesional",),
        sessions=30,
        frequency="daily_x5_weeks",
        evidence=("Lapchak_2010", "Hashmi_2010", "Oron_2012"),
        severity_modifiers={
            "mild": {"power_density_mw_cm2": 100.0, "treatment_time_min": 15.0},
            "moderate": {"power_density_mw_cm2": 100.0, "treatment_time_min": 20.0},
            "severe": {"power_density_mw_cm2": 150.0, "treatment_time_min": 25.0},
        },
    ),
    # Anxiety (generalised) ------------------------------------------------
    PBMParameters(
        condition="anxiety",
        wavelength_nm=810,
        power_density_mw_cm2=150.0,
        treatment_time_min=15.0,
        sites=("F3", "F4", "Cz"),
        sessions=18,
        frequency="3x_week_x6_weeks",
        evidence=("Cassano_2019", "Berman_2017"),
        severity_modifiers={
            "mild": {"power_density_mw_cm2": 100.0, "treatment_time_min": 10.0},
            "moderate": {"power_density_mw_cm2": 150.0, "treatment_time_min": 15.0},
            "severe": {"power_density_mw_cm2": 200.0, "treatment_time_min": 20.0},
        },
    ),
    # Autism spectrum disorder ---------------------------------------------
    PBMParameters(
        condition="asd",
        wavelength_nm=810,
        power_density_mw_cm2=50.0,
        treatment_time_min=10.0,
        sites=("F3", "F4", "Cz", "T3", "T4"),
        sessions=18,
        frequency="2x_week_x9_weeks",
        evidence=("Ahn_2022", "Hosseinkhani_2022"),
        severity_modifiers={
            "mild": {"power_density_mw_cm2": 50.0, "treatment_time_min": 8.0},
            "moderate": {"power_density_mw_cm2": 50.0, "treatment_time_min": 10.0},
            "severe": {"power_density_mw_cm2": 75.0, "treatment_time_min": 12.0},
        },
    ),
]

# Device catalogue --------------------------------------------------------
DEVICE_CATALOGUE: Final[List[DeviceInfo]] = [
    DeviceInfo(
        brand="Vielight",
        model="Neuro Gamma 2",
        fda_clearance="None (wellness device)",
        diode_count=4,
        wavelengths_nm=(810,),
        max_power_density_mw_cm2=100.0,
        helmet_type="intranasal + cluster",
        price_usd=1749.0,
        weight_kg=0.5,
        notes="Intranasal + transcranial cluster; popular for home use",
    ),
    DeviceInfo(
        brand="Vielight",
        model="Neuro Alpha 2",
        fda_clearance="None (wellness device)",
        diode_count=4,
        wavelengths_nm=(810,),
        max_power_density_mw_cm2=100.0,
        helmet_type="intranasal + cluster",
        price_usd=1749.0,
        weight_kg=0.5,
        notes="10 Hz pulsed; intranasal + transcranial cluster",
    ),
    DeviceInfo(
        brand="Neuronic",
        model="Neuradiant 1070",
        fda_clearance="None",
        diode_count=256,
        wavelengths_nm=(1070,),
        max_power_density_mw_cm2=250.0,
        helmet_type="helmet",
        price_usd=4500.0,
        weight_kg=1.2,
        notes="1070 nm wavelength; 256 diodes; high density coverage",
    ),
    DeviceInfo(
        brand="Photobiomodulation",
        model="Thor LX2",
        fda_clearance="510(k) cleared (muscle & joint pain)",
        diode_count=200,
        wavelengths_nm=(810, 850),
        max_power_density_mw_cm2=200.0,
        helmet_type="helmet",
        price_usd=6500.0,
        weight_kg=1.5,
        notes="Dual wavelength; clinical-grade; optional cluster probe",
    ),
    DeviceInfo(
        brand="OptoCeutics",
        model="Luminous 40Hz",
        fda_clearance="None",
        diode_count=128,
        wavelengths_nm=(810, 850),
        max_power_density_mw_cm2=150.0,
        helmet_type="helmet",
        price_usd=3200.0,
        weight_kg=1.0,
        notes="40 Hz gamma flicker for Alzheimer’s research; 128 LEDs",
    ),
    DeviceInfo(
        brand="LightStim",
        model="for Pain",
        fda_clearance="510(k) K161046",
        diode_count=72,
        wavelengths_nm=(660, 850, 940),
        max_power_density_mw_cm2=100.0,
        helmet_type="pad",
        price_usd=249.0,
        weight_kg=0.3,
        notes="Handheld pad; not cranial-specific; budget option",
    ),
    DeviceInfo(
        brand="BioQuantum",
        model="Cerebral PBM 256",
        fda_clearance="None",
        diode_count=256,
        wavelengths_nm=(810, 1070),
        max_power_density_mw_cm2=300.0,
        helmet_type="helmet",
        price_usd=4900.0,
        weight_kg=1.3,
        notes="Dual 810 + 1070 nm; research-grade; software programmable",
    ),
    DeviceInfo(
        brand="MedX",
        model="Nova Thor 1000",
        fda_clearance="Health Canada approved",
        diode_count=1000,
        wavelengths_nm=(810,),
        max_power_density_mw_cm2=500.0,
        helmet_type="helmet",
        price_usd=8500.0,
        weight_kg=2.1,
        notes="1000 diodes; highest density; clinical-only unit",
    ),
]

# Contraindications & precautions -----------------------------------------
CONTRAINDICATIONS: Final[Dict[str, str]] = {
    "photosensitive_epilepsy": "Pulsed light may trigger seizures — avoid pulsed mode; use CW only.",
    "active_intracranial_hemorrhage": "Transcranial PBM contraindicated until bleed resolved > 30 days.",
    "known_photosensitivity": "Absolute contraindication — discontinue if any phototoxic reaction.",
    "primary_malignancy_brain": "Avoid direct irradiation of tumour site unless oncology approves.",
    "active_skin_malignancy_scalp": "Do not irradiate over active skin cancer on scalp.",
    "pregnancy": "Insufficient safety data for transcranial PBM in pregnancy — avoid.",
    "ocular_melanoma": "Eye safety paramount — strict goggle use; avoid periorbital irradiation.",
    "retinal_disease": "Retinal disease increases light-sensitivity risk — ophthalmology clearance required.",
    "acute_stroke_48h": "Wait > 48 h post-acute stroke before initiating PBM (evidence window).",
    "thyroid_disease": "Avoid direct neck irradiation over thyroid gland.",
    "implanted_device": "PBM is non-ionising — generally safe with pacemakers / DBS; confirm with cardiology.",
}

# Eye-safety guidance
EYE_SAFETY_WARNINGS: Final[Tuple[str, ...]] = (
    "1. Patient MUST wear opaque goggles or eye patches during ALL transcranial PBM sessions.",
    "2. Do not irradiate directly over closed eyelids unless using eye-safe protocol (< 5 mW/cm²).",
    "3. Ensure device LEDs are pointed away from the orbital rim.",
    "4. Inform patient to report any visual aura, photopsia, or discomfort immediately.",
    "5. For intranasal devices, ensure beam divergence does not reach retina.",
)

# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------


def _classify_age(age: int) -> AgeGroup:
    """Classify chronological age into treatment age group.

    Parameters
    ----------
    age : int
        Age in years.

    Returns
    -------
    AgeGroup
    """
    if age < 18:
        return AgeGroup.PEDIATRIC
    if age >= 65:
        return AgeGroup.GERIATRIC
    return AgeGroup.ADULT


def _safe_get(d: Dict[str, Any], key: str, default: Any) -> Any:
    """Dict.get() with normalised key matching (case-insensitive)."""
    for k, v in d.items():
        if k.lower() == key.lower():
            return v
    return default


def _match_condition(condition_raw: str) -> Optional[PBMParameters]:
    """Fuzzy-match a condition string to the protocol library.

    Parameters
    ----------
    condition_raw : str
        User-provided condition label.

    Returns
    -------
    PBMParameters | None
    """
    condition_clean = condition_raw.lower().strip().replace(" ", "_").replace("-", "_")
    # Direct match
    for proto in PROTOCOL_LIBRARY:
        if proto.condition == condition_clean:
            return proto
    # Synonym map
    synonyms: Dict[str, str] = {
        "depression": "depression",
        "major_depressive_disorder": "depression",
        "mdd": "depression",
        "tbi": "tbi_concussion",
        "concussion": "tbi_concussion",
        "traumatic_brain_injury": "tbi_concussion",
        "mild_tbi": "tbi_concussion",
        "mtbi": "tbi_concussion",
        "cognitive_decline": "cognitive_decline",
        "mci": "cognitive_decline",
        "dementia": "cognitive_decline",
        "alzheimer": "cognitive_decline",
        "adhd": "adhd",
        "attention_deficit": "adhd",
        "ptsd": "ptsd",
        "post_traumatic_stress": "ptsd",
        "chronic_pain": "chronic_pain",
        "pain": "chronic_pain",
        "fibromyalgia": "chronic_pain",
        "sleep_disorder": "sleep_disorder",
        "insomnia": "sleep_disorder",
        "stroke": "stroke_recovery",
        "stroke_recovery": "stroke_recovery",
        "anxiety": "anxiety",
        "gad": "anxiety",
        "autism": "asd",
        "asd": "asd",
    }
    mapped = synonyms.get(condition_clean)
    if mapped:
        for proto in PROTOCOL_LIBRARY:
            if proto.condition == mapped:
                return proto
    return None


def _apply_severity_modifier(
    proto: PBMParameters,
    severity: Severity,
) -> Dict[str, Any]:
    """Override base parameters based on clinical severity.

    Parameters
    ----------
    proto : PBMParameters
        Base protocol.
    severity : Severity
        Severity enum.

    Returns
    -------
    dict
        Modified parameter subset.
    """
    overrides = proto.severity_modifiers.get(severity.value, {})
    return {
        "power_density_mw_cm2": overrides.get(
            "power_density_mw_cm2", proto.power_density_mw_cm2
        ),
        "treatment_time_min": overrides.get(
            "treatment_time_min", proto.treatment_time_min
        ),
    }


def _apply_age_modifier(age_group: AgeGroup, params: Dict[str, float]) -> Dict[str, float]:
    """Scale power density and treatment time for non-adult populations.

    Parameters
    ----------
    age_group : AgeGroup
    params : dict
        Contains 'power_density_mw_cm2' and 'treatment_time_min'.

    Returns
    -------
    dict
        Scaled parameters.
    """
    modifier = {
        AgeGroup.PEDIATRIC: PEDIATRIC_DOSE_MODIFIER,
        AgeGroup.ADULT: 1.0,
        AgeGroup.GERIATRIC: GERIATRIC_DOSE_MODIFIER,
    }.get(age_group, 1.0)

    return {
        "power_density_mw_cm2": round(params["power_density_mw_cm2"] * modifier, 1),
        "treatment_time_min": round(params["treatment_time_min"] * modifier, 1),
    }


def _skin_type_power_cap(skin_type: SkinType, power_density: float) -> float:
    """Cap power density for darker skin types (higher melanin → heat risk).

    Parameters
    ----------
    skin_type : SkinType
    power_density : float
        Requested power density in mW/cm².

    Returns
    -------
    float
        Capped power density.
    """
    caps = {
        SkinType.I: 500,
        SkinType.II: 500,
        SkinType.III: 400,
        SkinType.IV: 300,
        SkinType.V: 200,
        SkinType.VI: 150,
    }
    return min(power_density, caps.get(skin_type, 500))


def _transmittance_for_sex(sex: Optional[Sex]) -> float:
    """Return scalp transmittance fraction based on sex (hair-density proxy).

    Parameters
    ----------
    sex : Sex | None

    Returns
    -------
    float
        Transmittance fraction (0–1).
    """
    if sex == Sex.FEMALE:
        return SCALP_TRANSMITTANCE_FEMALE
    if sex == Sex.MALE:
        return SCALP_TRANSMITTANCE_MALE
    return SCALP_TRANSMITTANCE_DEFAULT


# ---------------------------------------------------------------------------
# Core public API
# ---------------------------------------------------------------------------


def calculate_dose(
    wavelength: int,
    power: float,
    time: float,
    spot_area_cm2: float = 4.0,
) -> Dict[str, Any]:
    """Calculate the delivered photonic dose in J/cm².

    Formula
    -------
    Energy (J)  = power (mW) × time (s) / 1000
    Power (mW)  = power_density (mW/cm²) × spot_area (cm²)
    Dose (J/cm²) = power_density (mW/cm²) × time (s) / 1000

    Parameters
    ----------
    wavelength : int
        Wavelength in nanometres (nm).
    power : float
        Power density in mW/cm².
    time : float
        Treatment time in **minutes**.
    spot_area_cm2 : float, default 4.0
        Effective irradiation spot area (cm²).  4 cm² ≈ 2.3 cm diameter.

    Returns
    -------
    dict
        Canonical dose report with safety flags.

    Raises
    ------
    ValueError
        On non-physical inputs.
    """
    if wavelength <= 0:
        raise ValueError(f"Wavelength must be positive, got {wavelength}")
    if power <= 0:
        raise ValueError(f"Power density must be positive, got {power}")
    if time <= 0:
        raise ValueError(f"Time must be positive, got {time}")
    if spot_area_cm2 <= 0:
        raise ValueError(f"Spot area must be positive, got {spot_area_cm2}")

    time_s = time * 60.0
    total_energy_mj = power * time_s          # mJ = mW × s
    total_energy_j = total_energy_mj / 1000.0
    dose_j_cm2 = total_energy_j / spot_area_cm2

    # Safety checks
    safe = True
    warnings: List[str] = []

    if power > MAX_POWER_DENSITY_MW_CM2:
        safe = False
        warnings.append(
            f"Power density {power} mW/cm² exceeds hard ceiling "
            f"{MAX_POWER_DENSITY_MW_CM2} mW/cm²"
        )

    if dose_j_cm2 > MAX_DOSE_PER_SESSION_J_CM2:
        safe = False
        warnings.append(
            f"Dose {dose_j_cm2:.1f} J/cm² exceeds per-session soft ceiling "
            f"{MAX_DOSE_PER_SESSION_J_CM2} J/cm²"
        )

    if wavelength not in OPTICAL_WINDOW_EFFICACY:
        warnings.append(
            f"Wavelength {wavelength} nm is outside the well-characterised "
            f"optical window for neural PBM; efficacy uncertain."
        )

    efficacy = OPTICAL_WINDOW_EFFICACY.get(wavelength, 0.0)

    return {
        "wavelength_nm": wavelength,
        "power_density_mw_cm2": round(power, 2),
        "treatment_time_min": round(time, 1),
        "spot_area_cm2": round(spot_area_cm2, 2),
        "total_energy_j": round(total_energy_j, 2),
        "dose_j_cm2": round(dose_j_cm2, 2),
        "optical_efficacy": round(efficacy, 2),
        "within_safety_limits": safe,
        "safety_warnings": warnings,
        "confidence": "high" if safe and efficacy > 0.7 else "moderate",
    }


def check_contraindications(patient: Dict[str, Any]) -> List[Dict[str, str]]:
    """Screen patient profile for PBM contraindications and precautions.

    Parameters
    ----------
    patient : dict
        Must contain keys such as ``conditions`` (list[str]),
        ``medications`` (list[str]), ``history`` (list[str]), etc.

    Returns
    -------
    list[dict]
        Each item: {"flag": <str>, "level": "absolute"|"relative"|"precaution",
        "recommendation": <str>}
    """
    flags: List[str] = []
    conditions = _safe_get(patient, "conditions", []) or []
    medications = _safe_get(patient, "medications", []) or []
    history = _safe_get(patient, "history", []) or []
    all_text = " ".join(
        str(x).lower() for x in (conditions + medications + history)
    )

    results: List[Dict[str, str]] = []

    # Map keywords to contraindications
    keyword_map = {
        "photosensitive_epilepsy": ["photosensitive epilepsy", "photosensitive seizure"],
        "active_intracranial_hemorrhage": ["intracranial hemorrhage", "brain bleed", "cerebral bleed"],
        "known_photosensitivity": ["photosensitivity", "phototoxic", "porphyria", "lupus"],
        "primary_malignancy_brain": ["brain tumor", "brain cancer", "glioma", "glioblastoma"],
        "active_skin_malignancy_scalp": ["scalp cancer", "skin cancer scalp", "melanoma scalp"],
        "pregnancy": ["pregnant", "pregnancy"],
        "ocular_melanoma": ["ocular melanoma", "eye melanoma"],
        "retinal_disease": ["retinal", "macular degeneration", "glaucoma", "retinitis"],
        "acute_stroke_48h": ["acute stroke", "stroke < 48h"],
        "thyroid_disease": ["thyroid", "hyperthyroid", "hypothyroid"],
        "implanted_device": ["pacemaker", "dbs", "deep brain stimulator", "vns"],
    }

    for flag_key, keywords in keyword_map.items():
        if any(kw in all_text for kw in keywords):
            level = (
                "absolute"
                if flag_key
                in (
                    "photosensitive_epilepsy",
                    "active_intracranial_hemorrhage",
                    "known_photosensitivity",
                    "active_skin_malignancy_scalp",
                    "pregnancy",
                )
                else "relative" if flag_key == "primary_malignancy_brain" else "precaution"
            )
            results.append({
                "flag": flag_key,
                "level": level,
                "recommendation": CONTRAINDICATIONS[flag_key],
            })

    # Medication checks
    photosensitising_meds = [
        "tetracycline", "doxycycline", "chlorpromazine", "amiodarone",
        "griseofulvin", "nsaid", "ibuprofen", "naproxen",
    ]
    for med in medications:
        med_l = str(med).lower()
        if any(pm in med_l for pm in photosensitising_meds):
            results.append({
                "flag": f"photosensitising_medication_{med}",
                "level": "precaution",
                "recommendation": (
                    f"Medication '{med}' may increase photosensitivity — "
                    f"monitor for adverse skin/eye reactions."
                ),
            })

    return results


def build_protocol(patient: Dict[str, Any]) -> Dict[str, Any]:
    """Generate a personalised PBM protocol from a patient profile.

    Parameters
    ----------
    patient : dict
        Required keys:
        - ``condition`` (str): Target clinical condition.
        - ``age`` (int): Age in years.
        Optional keys:
        - ``severity`` (str): "mild", "moderate", or "severe".
        - ``sex`` (str): "male", "female", "other".
        - ``skin_type`` (str): Fitzpatrick I–VI.
        - ``body_weight_kg`` (float): For paediatric scaling.
        - ``prior_sessions`` (int): Sessions already completed.
        - ``conditions`` (list[str]): Comorbidities.
        - ``medications`` (list[str]): Current meds.
        - ``history`` (list[str]): Relevant history.

    Returns
    -------
    dict
        Canonical protocol dictionary.

    Raises
    ------
    ValueError
        If required fields are missing or condition unsupported.
    """
    # ---- Required fields --------------------------------------------------
    condition_raw = patient.get("condition")
    if not condition_raw:
        raise ValueError("Patient profile must contain 'condition'.")
    age = patient.get("age")
    if age is None:
        raise ValueError("Patient profile must contain 'age'.")
    try:
        age = int(age)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Age must be an integer, got {age!r}") from exc

    # ---- Match condition --------------------------------------------------
    proto = _match_condition(condition_raw)
    if proto is None:
        available = sorted({p.condition for p in PROTOCOL_LIBRARY})
        raise ValueError(
            f"Condition '{condition_raw}' not supported. "
            f"Available: {available}"
        )

    # ---- Optional fields with defaults ------------------------------------
    severity = Severity(_safe_get(patient, "severity", "moderate"))
    sex_str = _safe_get(patient, "sex", "other")
    sex = Sex(sex_str.lower()) if sex_str else None
    skin_type_str = _safe_get(patient, "skin_type", "III")
    skin_type = SkinType(str(skin_type_str).upper())
    prior_sessions = int(_safe_get(patient, "prior_sessions", 0) or 0)

    # ---- Contraindication screen ------------------------------------------
    contraindications = check_contraindications(patient)
    absolute_blocks = [c for c in contraindications if c["level"] == "absolute"]

    # ---- Age group --------------------------------------------------------
    age_group = _classify_age(age)

    # ---- Apply severity modifiers -----------------------------------------
    modified = _apply_severity_modifier(proto, severity)

    # ---- Apply age modifier -----------------------------------------------
    if age_group != AgeGroup.ADULT:
        modified = _apply_age_modifier(age_group, modified)

    # ---- Skin-type power cap ----------------------------------------------
    power_density = _skin_type_power_cap(skin_type, modified["power_density_mw_cm2"])
    treatment_time = modified["treatment_time_min"]

    # ---- Dose calculation -------------------------------------------------
    dose_report = calculate_dose(proto.wavelength_nm, power_density, treatment_time)

    # ---- Site customisation ------------------------------------------------
    sites = list(proto.sites)
    if "pain_site" in sites:
        pain_location = _safe_get(patient, "pain_location", "F3")
        sites = [s if s != "pain_site" else pain_location for s in sites]
    if "perilesional" in sites:
        lesion_location = _safe_get(patient, "lesion_location", "F3")
        sites = [s if s != "perilesional" else lesion_location for s in sites]

    # ---- Total dose & sessions --------------------------------------------
    sessions_remaining = max(proto.sessions - prior_sessions, 0)
    total_dose_projected = round(dose_report["dose_j_cm2"] * proto.sessions, 2)

    # ---- Build output -----------------------------------------------------
    protocol_payload: Dict[str, Any] = {
        "modality": "PBM",
        "generated_for": {
            "condition": condition_raw,
            "age": age,
            "age_group": age_group.value,
            "severity": severity.value,
            "sex": sex.value if sex else "unspecified",
            "skin_type": skin_type.value,
        },
        "protocol": {
            "wavelength_nm": proto.wavelength_nm,
            "power_density_mw_cm2": power_density,
            "treatment_time_min": round(treatment_time, 1),
            "sites": sites,
            "sessions_total": proto.sessions,
            "sessions_remaining": sessions_remaining,
            "frequency": proto.frequency,
            "dose_per_session_j_cm2": dose_report["dose_j_cm2"],
            "total_dose_projected_j_cm2": total_dose_projected,
            "spot_area_cm2": dose_report["spot_area_cm2"],
            "optical_efficacy": dose_report["optical_efficacy"],
        },
        "dose_calculation": dose_report,
        "evidence": list(proto.evidence),
        "contraindications": contraindications,
        "absolute_contraindications_present": len(absolute_blocks) > 0,
        "eye_safety": list(EYE_SAFETY_WARNINGS),
        "age_adjustments": {
            "age_group": age_group.value,
            "modifier_applied": age_group != AgeGroup.ADULT,
            "power_density_original": modified.get("power_density_mw_cm2"),
            "power_density_adjusted": power_density,
        },
        "skin_type_adjustments": {
            "skin_type": skin_type.value,
            "power_density_capped": power_density < modified["power_density_mw_cm2"],
        },
        "expected_outcomes": _expected_outcomes(proto.condition, severity),
        "monitoring": _monitoring_recommendations(proto.condition),
    }

    return protocol_payload


def device_recommendation(
    protocol: Dict[str, Any],
    budget: float,
) -> List[Dict[str, Any]]:
    """Recommend PBM devices that satisfy protocol requirements within budget.

    Parameters
    ----------
    protocol : dict
        Output of ``build_protocol()``.
    budget : float
        Maximum budget in USD.

    Returns
    -------
    list[dict]
        Ranked device recommendations.
    """
    if budget < 0:
        raise ValueError(f"Budget must be non-negative, got {budget}")

    proto_block = protocol.get("protocol", {})
    req_wl = proto_block.get("wavelength_nm", 810)
    req_pd = proto_block.get("power_density_mw_cm2", 100.0)
    req_sites = proto_block.get("sites", [])
    multi_site = len(req_sites) > 2

    matches: List[Dict[str, Any]] = []

    for dev in DEVICE_CATALOGUE:
        if dev.price_usd > budget:
            continue

        # Check wavelength compatibility
        wl_compatible = req_wl in dev.wavelengths_nm or _near_wavelength(
            req_wl, dev.wavelengths_nm
        )
        # Check power density
        pd_ok = dev.max_power_density_mw_cm2 >= req_pd
        # Form-factor: multi-site needs helmet/cap
        form_ok = True
        if multi_site and dev.helmet_type in ("pad", "cluster"):
            form_ok = False

        score = 0
        if wl_compatible:
            score += 3
        if pd_ok:
            score += 3
        if form_ok:
            score += 2
        if dev.fda_clearance != "None" and "None" not in dev.fda_clearance:
            score += 2

        matches.append({
            "brand": dev.brand,
            "model": dev.model,
            "fda_clearance": dev.fda_clearance,
            "wavelengths_nm": list(dev.wavelengths_nm),
            "max_power_density_mw_cm2": dev.max_power_density_mw_cm2,
            "diode_count": dev.diode_count,
            "helmet_type": dev.helmet_type,
            "price_usd": dev.price_usd,
            "weight_kg": dev.weight_kg,
            "notes": dev.notes,
            "score": score,
            "compatible": wl_compatible and pd_ok and form_ok,
        })

    matches.sort(key=lambda x: (x["compatible"], x["score"]), reverse=True)
    return matches


def _near_wavelength(target: int, available: Tuple[int, ...], tolerance: int = 50) -> bool:
    """Check if any available wavelength is within *tolerance* nm of *target*."""
    return any(abs(target - a) <= tolerance for a in available)


def _expected_outcomes(condition: str, severity: Severity) -> Dict[str, Any]:
    """Return evidence-based expected outcomes for a condition + severity."""
    outcomes_db: Dict[str, Dict[str, Any]] = {
        "depression": {
            "primary": "Reduction in Hamilton-D (HAM-D) or MADRS score",
            "magnitude_moderate": "30–50 % reduction in HAM-D by week 8",
            "magnitude_severe": "20–35 % reduction; consider adjunctive rTMS or medication",
            "onset_weeks": "2–4 weeks",
            "response_rate": "~55 % (Cassano 2018 meta-analysis)",
        },
        "tbi_concussion": {
            "primary": "Improvement in cognitive testing (ImPACT, CNS-VS)",
            "magnitude_moderate": "Clinically meaningful improvement in memory & executive function",
            "magnitude_severe": "Gradual improvement over 10–12 weeks; multi-modal rehab advised",
            "onset_weeks": "3–6 weeks",
            "response_rate": "~60 % (Henderson 2016 cohort)",
        },
        "cognitive_decline": {
            "primary": "Stabilisation or improvement in MMSE / MoCA",
            "magnitude_moderate": "2–3 point MMSE improvement at 12 weeks",
            "magnitude_severe": "Slower decline; caregiver burden reduction",
            "onset_weeks": "4–8 weeks",
            "response_rate": "~50 % (Saltmarche 2017 open-label)",
        },
        "adhd": {
            "primary": "Improvement in CPT-3 omission/commission errors",
            "magnitude_moderate": "15–25 % improvement in attention metrics",
            "magnitude_severe": "Modest improvement; combine with behavioural therapy",
            "onset_weeks": "3–5 weeks",
            "response_rate": "~45 % (Sobral 2022 RCT)",
        },
        "ptsd": {
            "primary": "Reduction in PCL-5 or CAPS-5 score",
            "magnitude_moderate": "25–40 % reduction in PCL-5 by week 10",
            "magnitude_severe": "15–30 % reduction; consider concurrent EMDR/CPT",
            "onset_weeks": "3–6 weeks",
            "response_rate": "~50 % (Cassano 2019 pilot)",
        },
        "chronic_pain": {
            "primary": "Reduction in NRS / VAS pain score",
            "magnitude_moderate": "2–3 point NRS reduction",
            "magnitude_severe": "1–2 point NRS reduction; adjunctive strategy",
            "onset_weeks": "1–3 weeks",
            "response_rate": "~60 % (Chow 2009 systematic review)",
        },
        "sleep_disorder": {
            "primary": "Improvement in PSQI or ISI score; increased slow-wave sleep",
            "magnitude_moderate": "PSQI improvement > 4 points",
            "magnitude_severe": "Modest PSQI improvement; combine with CBT-I",
            "onset_weeks": "2–4 weeks",
            "response_rate": "~55 % (Figueiro 2019)",
        },
        "stroke_recovery": {
            "primary": "Improvement in NIHSS / Fugl-Meyer assessment",
            "magnitude_moderate": "4–6 point Fugl-Meyer improvement at 12 weeks",
            "magnitude_severe": "Modest motor gains; intensive PT adjunct",
            "onset_weeks": "4–8 weeks",
            "response_rate": "~45 % (Lapchak 2010 preclinical; human data emerging)",
        },
        "anxiety": {
            "primary": "Reduction in GAD-7 or BAI score",
            "magnitude_moderate": "25–35 % reduction in GAD-7",
            "magnitude_severe": "15–25 % reduction; combine with CBT / pharmacotherapy",
            "onset_weeks": "2–4 weeks",
            "response_rate": "~50 % (Cassano 2019 secondary analysis)",
        },
        "asd": {
            "primary": "Improvement in ABC (Aberrant Behaviour Checklist) subscales",
            "magnitude_moderate": "10–20 % reduction in irritability / hyperactivity",
            "magnitude_severe": "Modest behavioural gains; caregiver training essential",
            "onset_weeks": "4–8 weeks",
            "response_rate": "~40 % (Ahn 2022 pilot)",
        },
    }
    base = outcomes_db.get(condition, {
        "primary": "Clinical improvement per validated rating scale",
        "magnitude_moderate": "To be determined",
        "magnitude_severe": "To be determined",
        "onset_weeks": "4–8 weeks",
        "response_rate": "Emerging evidence",
    })
    magnitude_key = f"magnitude_{severity.value}"
    return {
        "primary_endpoint": base["primary"],
        "expected_magnitude": base.get(magnitude_key, base["magnitude_moderate"]),
        "onset_of_benefit": base["onset_weeks"],
        "estimated_response_rate": base["response_rate"],
    }


def _monitoring_recommendations(condition: str) -> List[str]:
    """Return condition-specific monitoring items."""
    common = [
        "Session-by-session adverse event log (headache, scalp warmth, visual symptoms)",
        "Eye safety compliance check at each visit",
        "Photographic documentation of scalp at baseline, week 4, and end-of-treatment",
    ]
    specific: Dict[str, List[str]] = {
        "depression": [
            "HAM-D or MADRS at baseline, week 4, week 8, end-of-treatment",
            "Columbia Suicide Severity Rating Scale (C-SSRS) at each visit",
            "Beck Depression Inventory-II (BDI-II) self-report weekly",
        ],
        "tbi_concussion": [
            "ImPACT or CNS-VS battery at baseline, week 4, week 10",
            "Rivermead Post-Concussion Symptoms Questionnaire (RPQ) weekly",
            "Vestibular/ocular screening if post-traumatic symptoms persist",
        ],
        "cognitive_decline": [
            "MMSE and/or MoCA at baseline, week 6, week 12",
            "ADCS-ADL or equivalent functional scale monthly",
            "MRI volumetrics (optional) at baseline and 6 months",
        ],
        "adhd": [
            "CPT-3 or Conners-3 at baseline, week 3, week 6",
            "Parent/teacher Vanderbilt scales at baseline and week 6",
            "Sleep and appetite diary weekly",
        ],
        "ptsd": [
            "PCL-5 or CAPS-5 at baseline, week 4, week 10",
            "PHQ-9 concurrent depression screen at each assessment",
            "PSQI sleep quality weekly",
        ],
        "chronic_pain": [
            "NRS / VAS pain diary daily",
            "Pain Catastrophising Scale (PCS) at baseline and week 4",
            "Physical function measure (e.g. 6-minute walk) at baseline and end",
        ],
        "sleep_disorder": [
            "PSQI or ISI at baseline, week 4, week 8",
            "Actigraphy (7 nights) at baseline and week 8",
            "Sleep diary (latency, awakenings, medication use) daily",
        ],
        "stroke_recovery": [
            "NIHSS / Fugl-Meyer at baseline, week 4, week 8, week 12",
            "Modified Rankin Scale (mRS) at each assessment",
            "Barthel Index for ADLs monthly",
        ],
        "anxiety": [
            "GAD-7 or BAI at baseline, week 3, week 6",
            "HAM-A at baseline and end-of-treatment",
            "Quality of Life Enjoyment and Satisfaction (Q-LES-Q) weekly",
        ],
        "asd": [
            "ABC subscales at baseline, week 4, week 9",
            "SRS-2 at baseline and end-of-treatment",
            "Caregiver strain index monthly",
        ],
    }
    return common + specific.get(condition, ["Condition-specific outcome measure at baseline and end"])


# ---------------------------------------------------------------------------
# Convenience / batch helpers
# ---------------------------------------------------------------------------


def batch_build_protocols(patients: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Build protocols for a list of patient profiles.

    Parameters
    ----------
    patients : list[dict]
        List of patient profile dictionaries.

    Returns
    -------
    list[dict]
        List of protocol dictionaries; failed profiles contain an ``error`` key.
    """
    results: List[Dict[str, Any]] = []
    for patient in patients:
        try:
            results.append(build_protocol(patient))
        except ValueError as exc:
            results.append({"error": str(exc), "patient_summary": str(patient)})
    return results


def protocol_summary(protocol: Dict[str, Any]) -> str:
    """Render a human-readable summary of a PBM protocol.

    Parameters
    ----------
    protocol : dict
        Output of ``build_protocol()``.

    Returns
    -------
    str
    """
    lines: List[str] = []
    lines.append("=" * 60)
    lines.append("  PBM PROTOCOL SUMMARY")
    lines.append("=" * 60)

    p = protocol.get("protocol", {})
    lines.append(f"  Modality        : Photobiomodulation (PBM)")
    lines.append(f"  Condition       : {protocol.get('generated_for', {}).get('condition', 'N/A')}")
    lines.append(f"  Age / Group     : {protocol.get('generated_for', {}).get('age', 'N/A')} / {protocol.get('generated_for', {}).get('age_group', 'N/A')}")
    lines.append(f"  Severity        : {protocol.get('generated_for', {}).get('severity', 'N/A')}")
    lines.append("")
    lines.append("  --- Stimulation Parameters ---")
    lines.append(f"  Wavelength      : {p.get('wavelength_nm', 'N/A')} nm")
    lines.append(f"  Power Density   : {p.get('power_density_mw_cm2', 'N/A')} mW/cm²")
    lines.append(f"  Treatment Time  : {p.get('treatment_time_min', 'N/A')} min")
    lines.append(f"  Sites           : {', '.join(p.get('sites', []))}")
    lines.append(f"  Dose / Session  : {p.get('dose_per_session_j_cm2', 'N/A')} J/cm²")
    lines.append("")
    lines.append("  --- Schedule ---")
    lines.append(f"  Frequency       : {p.get('frequency', 'N/A')}")
    lines.append(f"  Total Sessions  : {p.get('sessions_total', 'N/A')}")
    lines.append(f"  Remaining       : {p.get('sessions_remaining', 'N/A')}")
    lines.append("")
    lines.append("  --- Evidence ---")
    for ev in protocol.get("evidence", []):
        lines.append(f"    • {ev}")
    lines.append("")

    # Contraindications
    contras = protocol.get("contraindications", [])
    if contras:
        lines.append("  --- Contraindications / Precautions ---")
        for c in contras:
            level = c.get("level", "unknown").upper()
            lines.append(f"    [{level}] {c.get('flag', '')}: {c.get('recommendation', '')}")
        lines.append("")

    if protocol.get("absolute_contraindications_present"):
        lines.append("  ⚠️  ABSOLUTE CONTRAINDICATION(S) DETECTED — DO NOT PROCEED.")
        lines.append("")

    # Eye safety
    lines.append("  --- Eye Safety ---")
    for w in protocol.get("eye_safety", []):
        lines.append(f"    {w}")
    lines.append("")

    # Expected outcomes
    eo = protocol.get("expected_outcomes", {})
    lines.append("  --- Expected Outcomes ---")
    lines.append(f"    Primary         : {eo.get('primary_endpoint', 'N/A')}")
    lines.append(f"    Magnitude       : {eo.get('expected_magnitude', 'N/A')}")
    lines.append(f"    Onset           : {eo.get('onset_of_benefit', 'N/A')}")
    lines.append(f"    Response Rate   : {eo.get('estimated_response_rate', 'N/A')}")
    lines.append("")

    lines.append("=" * 60)
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Module self-test (lightweight)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # Quick smoke test
    test_patient = {
        "condition": "depression",
        "age": 45,
        "severity": "moderate",
        "sex": "female",
        "skin_type": "II",
    }
    proto = build_protocol(test_patient)
    print(protocol_summary(proto))

    # Device recommendation
    devices = device_recommendation(proto, budget=5000.0)
    print("\n--- Top Device Match ---")
    if devices:
        top = devices[0]
        print(f"  {top['brand']} {top['model']} — ${top['price_usd']:.0f}")
        print(f"  Compatible: {top['compatible']} | Score: {top['score']}")
