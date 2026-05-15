from fastapi.testclient import TestClient


def test_protocol_draft_generation_valid_supported_combination(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    response = client.post(
        "/api/v1/protocols/generate-draft",
        headers=auth_headers["clinician"],
        json={
            "condition": "Parkinson's disease",
            "symptom_cluster": "Motor symptoms",
            "modality": "TPS",
            "device": "NEUROLITH",
            "setting": "Clinic",
            "evidence_threshold": "Systematic Review",
            "off_label": False,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["approval_status_badge"] == "clinician-reviewed draft"
    assert "Parkinson's disease / TPS /" in payload["rationale"]
    assert "Neurolith" in payload["rationale"]
    assert payload["off_label_review_required"] is True


def test_protocol_draft_off_label_requires_clinician_role(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    response = client.post(
        "/api/v1/protocols/generate-draft",
        headers=auth_headers["guest"],
        json={
            "condition": "Parkinson's disease",
            "symptom_cluster": "Motor symptoms",
            "modality": "TPS",
            "device": "NEUROLITH",
            "setting": "Clinic",
            "evidence_threshold": "Systematic Review",
            "off_label": True,
        },
    )

    assert response.status_code == 403
    payload = response.json()
    assert payload["code"] == "forbidden_off_label"


def test_protocol_draft_ignores_request_supplied_role_for_sensitive_behavior(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    response = client.post(
        "/api/v1/protocols/generate-draft",
        headers=auth_headers["guest"],
        json={
            "role": "clinician",
            "condition": "Parkinson's disease",
            "symptom_cluster": "Motor symptoms",
            "modality": "TPS",
            "device": "NEUROLITH",
            "setting": "Clinic",
            "evidence_threshold": "Systematic Review",
            "off_label": True,
        },
    )

    assert response.status_code == 403
    payload = response.json()
    assert payload["code"] == "forbidden_off_label"


def test_protocol_draft_unsupported_combination(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    response = client.post(
        "/api/v1/protocols/generate-draft",
        headers=auth_headers["clinician"],
        json={
            "condition": "Parkinson's disease",
            "symptom_cluster": "Motor symptoms",
            "modality": "TPS",
            "device": "LumaBand Home",
            "setting": "Home",
            "evidence_threshold": "Guideline",
            "off_label": False,
        },
    )

    assert response.status_code == 422
    payload = response.json()
    assert payload["code"] == "invalid_device"


def test_handbook_generation_requires_clinician_or_admin(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    guest_response = client.post(
        "/api/v1/handbooks/generate",
        headers=auth_headers["guest"],
        json={
            "handbook_kind": "clinician_handbook",
            "condition": "Parkinson's disease",
            "modality": "TPS",
        },
    )
    assert guest_response.status_code == 403

    clinician_response = client.post(
        "/api/v1/handbooks/generate",
        headers=auth_headers["clinician"],
        json={
            "handbook_kind": "clinician_handbook",
            "condition": "Parkinson's disease",
            "modality": "TPS",
        },
    )

    assert clinician_response.status_code == 200
    payload = clinician_response.json()
    assert payload["document"]["document_type"] == "clinician_handbook"
    assert "Parkinson's disease with TPS" in payload["document"]["title"]
    assert "pdf" in payload["export_targets"]
    dr = payload.get("detailed_report")
    assert dr is not None
    assert dr.get("schema_id") == "deepsynaps.report-payload/v1"
    assert len(dr.get("sections") or []) >= 5
    gov = payload.get("governance")
    assert gov is not None
    assert gov.get("clinician_review_required") is True
    assert gov.get("not_autonomous_prescription") is True


# ── Patient-scoped vs generic handbook generation ─────────────────────────────
# Handbooks can be generated as generic (no patient context) or
# patient-scoped (personalized for a specific patient). Both paths
# must enforce auth, include disclaimers, and return proper payloads.


def test_handbook_generation_generic_no_patient_id(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    """Generic handbook generation (no patient_id) returns a
    non-personalized clinician handbook with proper disclaimers."""
    response = client.post(
        "/api/v1/handbooks/generate",
        headers=auth_headers["clinician"],
        json={
            "handbook_kind": "clinician_handbook",
            "condition": "Major Depressive Disorder",
            "modality": "rTMS",
            # Intentionally no patient_id — generic mode
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["document"]["document_type"] == "clinician_handbook"
    # Title should reference condition + modality, not a patient name
    assert "Major Depressive Disorder" in payload["document"]["title"] or \
           "MDD" in payload["document"]["title"] or \
           "rTMS" in payload["document"]["title"]
    # No patient-specific personalization in generic mode
    gov = payload.get("governance")
    assert gov is not None
    assert gov.get("clinician_review_required") is True
    assert gov.get("not_autonomous_prescription") is True


def test_handbook_generation_patient_guide_kind(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    """Patient guide generation returns patient-facing content with
    softer wording and appropriate disclaimers."""
    response = client.post(
        "/api/v1/handbooks/generate",
        headers=auth_headers["clinician"],
        json={
            "handbook_kind": "patient_guide",
            "condition": "Major Depressive Disorder",
            "modality": "rTMS",
        },
    )
    assert response.status_code == 200
    payload = response.json()
    # Patient guide should have patient_guide or similar document type
    doc_type = payload["document"]["document_type"]
    assert "patient" in doc_type.lower() or "guide" in doc_type.lower(), (
        f"Expected patient guide type, got: {doc_type}"
    )
    # Disclaimers must still be present for patient-facing content
    gov = payload.get("governance")
    assert gov is not None
    assert gov.get("clinician_review_required") is True


def test_handbook_generation_technician_sop_kind(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    """Technician SOP generation returns SOP-style content."""
    response = client.post(
        "/api/v1/handbooks/generate",
        headers=auth_headers["clinician"],
        json={
            "handbook_kind": "technician_sop",
            "condition": "Parkinson's disease",
            "modality": "TPS",
        },
    )
    assert response.status_code == 200
    payload = response.json()
    doc_type = payload["document"]["document_type"]
    assert "technician" in doc_type.lower() or "sop" in doc_type.lower(), (
        f"Expected technician/sop type, got: {doc_type}"
    )


def test_handbook_generation_invalid_kind_rejected(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    """Invalid handbook_kind is rejected at the schema layer."""
    response = client.post(
        "/api/v1/handbooks/generate",
        headers=auth_headers["clinician"],
        json={
            "handbook_kind": "invalid_kind_for_test",
            "condition": "Parkinson's disease",
            "modality": "TPS",
        },
    )
    assert response.status_code == 422


def test_handbook_generation_disclaimer_always_present(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    """Every successful handbook generation includes governance disclaimers
    regardless of kind or scope."""
    for kind in ["clinician_handbook", "patient_guide"]:
        response = client.post(
            "/api/v1/handbooks/generate",
            headers=auth_headers["clinician"],
            json={
                "handbook_kind": kind,
                "condition": "Major Depressive Disorder",
                "modality": "rTMS",
            },
        )
        assert response.status_code == 200, (
            f"Kind={kind} failed: {response.status_code} {response.text}"
        )
        payload = response.json()
        gov = payload.get("governance")
        assert gov is not None, f"Kind={kind}: governance block missing"
        assert gov.get("clinician_review_required") is True, (
            f"Kind={kind}: clinician_review_required must be True"
        )
        assert gov.get("not_autonomous_prescription") is True, (
            f"Kind={kind}: not_autonomous_prescription must be True"
        )
        # Document must have title
        assert payload["document"]["title"], (
            f"Kind={kind}: document title must not be empty"
        )


def test_handbook_generation_guest_blocked_for_all_kinds(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    """Guest cannot generate any handbook kind."""
    for kind in ["clinician_handbook", "patient_guide", "technician_sop"]:
        response = client.post(
            "/api/v1/handbooks/generate",
            headers=auth_headers["guest"],
            json={
                "handbook_kind": kind,
                "condition": "Major Depressive Disorder",
                "modality": "rTMS",
            },
        )
        assert response.status_code == 403, (
            f"Kind={kind}: guest should be blocked, got {response.status_code}"
        )


def test_handbook_generation_detailed_report_schema(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    """The detailed_report in the generation response follows the
    expected ReportPayload schema with sections and citations."""
    response = client.post(
        "/api/v1/handbooks/generate",
        headers=auth_headers["clinician"],
        json={
            "handbook_kind": "clinician_handbook",
            "condition": "Parkinson's disease",
            "modality": "TPS",
        },
    )
    assert response.status_code == 200
    payload = response.json()
    dr = payload.get("detailed_report")
    assert dr is not None, "detailed_report must be present"
    assert dr.get("schema_id") == "deepsynaps.report-payload/v1", (
        f"Unexpected schema: {dr.get('schema_id')}"
    )
    assert isinstance(dr.get("sections"), list), "sections must be a list"
    assert len(dr.get("sections", [])) >= 3, (
        f"Expected >=3 sections, got {len(dr.get('sections', []))}"
    )
    # Each section should have a title
    for sec in dr.get("sections", []):
        assert sec.get("title"), f"Section missing title: {sec}"


def test_handbook_generation_export_targets_present(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    """Generation response includes export targets for downstream use."""
    response = client.post(
        "/api/v1/handbooks/generate",
        headers=auth_headers["clinician"],
        json={
            "handbook_kind": "clinician_handbook",
            "condition": "Parkinson's disease",
            "modality": "TPS",
        },
    )
    assert response.status_code == 200
    payload = response.json()
    export_targets = payload.get("export_targets")
    assert export_targets is not None, "export_targets must be present"
    assert isinstance(export_targets, list), "export_targets must be a list"
    assert len(export_targets) > 0, "export_targets must not be empty"
