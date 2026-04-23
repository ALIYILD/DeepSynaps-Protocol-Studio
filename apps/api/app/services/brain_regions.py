from deepsynaps_core_schema import BrainRegionListResponse

from app.services.neuro_csv import list_brain_regions_from_csv


def list_brain_regions() -> BrainRegionListResponse:
    return list_brain_regions_from_csv()
