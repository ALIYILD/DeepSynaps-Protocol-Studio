from deepsynaps_core_schema import EvidenceListResponse

from app.services.clinical_data import list_evidence_from_clinical_data


def list_evidence() -> EvidenceListResponse:
    return list_evidence_from_clinical_data()
