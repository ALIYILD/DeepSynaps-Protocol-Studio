from app.routers.export_router import (
    ExportHandbookDocxRequest,
    ExportPatientGuideDocxRequest,
    ExportProtocolDocxRequest,
    _ProtocolDocxAdapter,
)


def test_protocol_export_requests_accept_standards_reference_metadata() -> None:
    payload = {
        "condition_name": "Major Depressive Disorder",
        "modality_name": "tDCS",
        "device_name": "Soterix",
        "standards_guideline_references": [
            {
                "source": "FDA Guidance",
                "url": "https://www.fda.gov/medical-devices/",
                "source_kind": "regulatory_guidance",
                "jurisdiction": "us",
                "lifecycle_state": "degraded",
            }
        ],
        "governance_caveat": "Decision support only. Not legal or regulatory advice.",
    }

    protocol = ExportProtocolDocxRequest(**payload)
    handbook = ExportHandbookDocxRequest(
        condition_name=payload["condition_name"],
        modality_name=payload["modality_name"],
        device_name=payload["device_name"],
        standards_guideline_references=payload["standards_guideline_references"],
        governance_caveat=payload["governance_caveat"],
    )
    guide = ExportPatientGuideDocxRequest(
        condition_name=payload["condition_name"],
        modality_name=payload["modality_name"],
        standards_guideline_references=payload["standards_guideline_references"],
        governance_caveat=payload["governance_caveat"],
    )

    assert protocol.standards_guideline_references[0]["source"] == "FDA Guidance"
    assert handbook.governance_caveat.startswith("Decision support only")
    assert guide.standards_guideline_references[0]["lifecycle_state"] == "degraded"

    adapter = _ProtocolDocxAdapter(
        condition_name="Major Depressive Disorder",
        modality_name="tDCS",
        device_name="Soterix",
        evidence_grade="A",
        approval_badge="review",
        standards_guideline_references=protocol.standards_guideline_references,
        governance_caveat=protocol.governance_caveat,
    )
    assert adapter.standards_guideline_references[0]["source_kind"] == "regulatory_guidance"
    assert adapter.governance_caveat.endswith("advice.")
