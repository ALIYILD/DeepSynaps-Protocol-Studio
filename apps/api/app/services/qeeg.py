from deepsynaps_core_schema import QEEGBiomarkerListResponse, QEEGConditionMapListResponse

from app.services.neuro_csv import list_qeeg_biomarkers_from_csv, list_qeeg_condition_map_from_csv


def list_qeeg_biomarkers() -> QEEGBiomarkerListResponse:
    return list_qeeg_biomarkers_from_csv()


def list_qeeg_condition_map() -> QEEGConditionMapListResponse:
    return list_qeeg_condition_map_from_csv()
