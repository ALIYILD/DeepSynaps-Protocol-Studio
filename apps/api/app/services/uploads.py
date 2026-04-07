from dataclasses import dataclass

from deepsynaps_core_schema import CaseSummaryRequest, CaseSummaryResponse, UploadedAsset

from app.auth import AuthenticatedActor, require_minimum_role
from app.registries.shared import standard_disclaimers


@dataclass(frozen=True, slots=True)
class ParsedUploadAsset:
    type: str
    file_name: str
    summary: str
    parser_status: str


def build_case_summary(payload: CaseSummaryRequest, actor: AuthenticatedActor) -> CaseSummaryResponse:
    require_minimum_role(
        actor,
        "clinician",
        warnings=["Upload review requires clinician or admin access."],
    )
    uploads = prepare_upload_manifest(payload.uploads)
    upload_types = {item.type for item in uploads}
    return CaseSummaryResponse(
        presenting_symptoms=(
            ["Motor slowing", "Gait hesitation", "Fatigue during task switching"]
            if "Intake Form" in upload_types
            else ["Symptoms pending structured intake context"]
        ),
        relevant_findings=[
            *(
                ["Imaging reviewed with no independent automated interpretation"]
                if "MRI Report" in upload_types
                else []
            ),
            *(
                ["qEEG metadata suggests mixed frontal asymmetry comments requiring clinician review"]
                if "qEEG Summary" in upload_types
                else []
            ),
            *(
                ["Clinician notes describe balance concerns and symptom clustering"]
                if "Clinician Notes" in upload_types
                else []
            ),
        ],
        red_flags=[
            "Implant and medication review status must be confirmed by a professional.",
            *(
                ["Imaging references require direct clinician interpretation before use"]
                if "MRI Report" in upload_types
                else []
            ),
        ],
        possible_targets=["Motor initiation support", "Gait-related symptom monitoring", "Fatigue tracking"],
        suggested_modalities=["TPS", "Neurofeedback"] if "qEEG Summary" in upload_types else ["TPS", "TMS"],
        disclaimers=standard_disclaimers(include_draft=True, include_off_label=True),
    )


def prepare_upload_manifest(uploads: list[UploadedAsset]) -> list[ParsedUploadAsset]:
    return [
        ParsedUploadAsset(
            type=upload.type,
            file_name=upload.file_name,
            summary=upload.summary,
            parser_status="simulated_metadata_ingestion",
        )
        for upload in uploads
    ]
