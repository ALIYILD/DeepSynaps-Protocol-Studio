from __future__ import annotations

from functools import lru_cache

from deepsynaps_core_schema import (
    BrainRegion,
    BrainRegionListResponse,
    QEEGBiomarker,
    QEEGBiomarkerListResponse,
    QEEGConditionMap,
    QEEGConditionMapListResponse,
)

from app.services.clinical_data import _read_csv_records, _split_values
from app.settings import CLINICAL_DATA_ROOT

_BRAIN_REGIONS_FILE = "brain_regions.csv"
_QEEG_BIOMARKERS_FILE = "qeeg_biomarkers.csv"
_QEEG_CONDITION_MAP_FILE = "qeeg_condition_map.csv"


@lru_cache(maxsize=1)
def _load_brain_regions() -> list[dict[str, str]]:
    return _read_csv_records(CLINICAL_DATA_ROOT / _BRAIN_REGIONS_FILE)


@lru_cache(maxsize=1)
def _load_qeeg_biomarkers() -> list[dict[str, str]]:
    return _read_csv_records(CLINICAL_DATA_ROOT / _QEEG_BIOMARKERS_FILE)


@lru_cache(maxsize=1)
def _load_qeeg_condition_map() -> list[dict[str, str]]:
    return _read_csv_records(CLINICAL_DATA_ROOT / _QEEG_CONDITION_MAP_FILE)


def list_brain_regions_from_csv() -> BrainRegionListResponse:
    records = _load_brain_regions()
    items: list[BrainRegion] = []
    for row in records:
        items.append(
            BrainRegion(
                id=row["Region_ID"],
                name=row["Region_Name"],
                abbreviation=row["Abbreviation"],
                lobe=row["Lobe"],
                depth=row["Depth"],
                eeg_position_10_20=row["EEG_Position_10_20"],
                brodmann_area=row["Brodmann_Area"],
                primary_functions=row["Primary_Functions"],
                fnon_network=row["FNON_Network"],
                key_conditions=row["Key_Conditions"],
                targetable_modalities=_split_values(row["Targetable_Modalities"]),
                notes=row["Notes"],
                review_status=row["Review_Status"],
            )
        )
    return BrainRegionListResponse(items=items, total=len(items))


def list_qeeg_biomarkers_from_csv() -> QEEGBiomarkerListResponse:
    records = _load_qeeg_biomarkers()
    items: list[QEEGBiomarker] = []
    for row in records:
        items.append(
            QEEGBiomarker(
                id=row["Band_ID"],
                band_name=row["Band_Name"],
                hz_range=row["Hz_Range"],
                normal_brain_state=row["Normal_Brain_State"],
                key_regions=row["Key_Regions"],
                eeg_positions=row["EEG_Positions"],
                pathological_increase=row["Pathological_Increase"],
                pathological_decrease=row["Pathological_Decrease"],
                associated_disorders=row["Associated_Disorders"],
                clinical_significance=row["Clinical_Significance"],
                review_status=row["Review_Status"],
            )
        )
    return QEEGBiomarkerListResponse(items=items, total=len(items))


def list_qeeg_condition_map_from_csv() -> QEEGConditionMapListResponse:
    records = _load_qeeg_condition_map()
    items: list[QEEGConditionMap] = []
    for row in records:
        items.append(
            QEEGConditionMap(
                id=row["Map_ID"],
                condition_id=row["Condition_ID"],
                condition_name=row["Condition_Name"],
                key_symptoms=row["Key_Symptoms"],
                qeeg_patterns=row["qEEG_Patterns"],
                key_qeeg_electrode_sites=row["Key_qEEG_Electrode_Sites"],
                affected_brain_regions=row["Affected_Brain_Regions"],
                primary_networks_disrupted=row["Primary_Networks_Disrupted"],
                network_dysfunction_pattern=row["Network_Dysfunction_Pattern"],
                recommended_neuromod_techniques=row["Recommended_Neuromod_Techniques"],
                primary_stimulation_targets=row["Primary_Stimulation_Targets"],
                stimulation_rationale=row["Stimulation_Rationale"],
                review_status=row["Review_Status"],
            )
        )
    return QEEGConditionMapListResponse(items=items, total=len(items))
