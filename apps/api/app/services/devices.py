from deepsynaps_core_schema import DeviceListResponse

from app.services.clinical_data import list_devices_from_clinical_data


def list_devices() -> DeviceListResponse:
    return list_devices_from_clinical_data()
