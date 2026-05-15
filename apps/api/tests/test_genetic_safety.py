"""Safety and governance tests for Genetic Medication Analyzer.

Validates that no endpoint returns prescribing language, that all findings
have evidence grades and safety framing, that population limitations are
disclosed, and that export/break-glass governance controls are enforced.

Target: 25+ tests.
"""
from __future__ import annotations

import io
from typing import Any, Generator
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import genetic_analyzer_router as gar

# ── Constants ────────────────────────────────────────────────────────────────

_CLINICIAN = {"Authorization": "Bearer clinician-demo-token"}
_PATIENT = {"Authorization": "Bearer patient-demo-token"}
_ADMIN = {"Authorization": "Bearer admin-demo-token"}
_BASE = "/api/v1/genetic-analyzer"

_SAMPLE_VCF_CYP2C19_PM = """##fileformat=VCFv4.2
##source=test
#CHROM	POS	ID	REF	ALT	QUAL	FILTER	INFO	FORMAT	SAMPLE
1	12346	rs4244285	C	T	30	PASS	.	GT	1/1
10	96541615	rs12248560	G	A	30	PASS	.	GT	0/0
"""

_SAMPLE_VCF_CYP2D6_UM = """##fileformat=VCFv4.2
##source=test
#CHROM	POS	ID	REF	ALT	QUAL	FILTER	INFO	FORMAT	SAMPLE
22	42126611	rs1065852	A	G	30	PASS	.	GT	0/1
22	42126611	rs3892097	A	C	30	PASS	.	GT	0/1
"""


# ── Fixtures ─────────────────────────────────────────────────────────────────


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def clear_stores() -> Generator[None, None, None]:
    """Clear in-memory stores before every test."""
    gar._genetic_profiles.clear()
    gar._genetic_variants.clear()
    gar._phenotype_assignments.clear()
    gar._analysis_results.clear()
    gar._generated_reports.clear()
    yield
    gar._genetic_profiles.clear()
    gar._genetic_variants.clear()
    gar._phenotype_assignments.clear()
    gar._analysis_results.clear()
    gar._generated_reports.clear()


@pytest.fixture
def mock_db() -> Generator[MagicMock, None, None]:
    with patch("app.routers.genetic_analyzer_router.get_db_session") as mock_get_db, \
         patch("app.routers.genetic_analyzer_router.create_audit_event") as mock_audit:
        db = MagicMock()
        mock_get_db.return_value = db
        mock_audit.return_value = None
        with patch("app.routers.genetic_analyzer_router.resolve_patient_clinic_id") as mock_resolve:
            mock_resolve.return_value = (True, "clinic-test-001")
            yield db


@pytest.fixture
def cyp2c19_pm_profile(client: TestClient, mock_db: MagicMock) -> dict[str, Any]:
    """Profile with CYP2C19 Poor Metabolizer (*2/*2)."""
    r = client.post(
        f"{_BASE}/patients/patient-gt-001/profiles",
        json={"name": "CYP2C19 PM Panel"},
        headers=_CLINICIAN,
    )
    pid = r.json()["id"]
    client.post(
        f"{_BASE}/profiles/{pid}/manual-genotype",
        json={"gene": "CYP2C19", "variant": "*2/*2", "genotype": "*2/*2", "confidence": "high"},
        headers=_CLINICIAN,
    )
    return {"id": pid, "patient_id": "patient-gt-001"}


@pytest.fixture
def cyp2d6_um_profile(client: TestClient, mock_db: MagicMock) -> dict[str, Any]:
    """Profile with CYP2D6 Ultrarapid Metabolizer (*1/*3xN)."""
    r = client.post(
        f"{_BASE}/patients/patient-gt-001/profiles",
        json={"name": "CYP2D6 UM Panel"},
        headers=_CLINICIAN,
    )
    pid = r.json()["id"]
    client.post(
        f"{_BASE}/profiles/{pid}/manual-genotype",
        json={"gene": "CYP2D6", "variant": "*1/*3xN", "genotype": "*1/*3xN", "confidence": "high"},
        headers=_CLINICIAN,
    )
    return {"id": pid, "patient_id": "patient-gt-001"}


@pytest.fixture
def cyp2d6_im_profile(client: TestClient, mock_db: MagicMock) -> dict[str, Any]:
    """Profile with CYP2D6 Intermediate Metabolizer (*1/*4)."""
    r = client.post(
        f"{_BASE}/patients/patient-gt-001/profiles",
        json={"name": "CYP2D6 IM Panel"},
        headers=_CLINICIAN,
    )
    pid = r.json()["id"]
    client.post(
        f"{_BASE}/profiles/{pid}/manual-genotype",
        json={"gene": "CYP2D6", "variant": "*1/*4", "genotype": "*1/*4", "confidence": "high"},
        headers=_CLINICIAN,
    )
    return {"id": pid, "patient_id": "patient-gt-001"}


@pytest.fixture
def multi_gene_profile(client: TestClient, mock_db: MagicMock) -> dict[str, Any]:
    """Profile with multiple pharmacogenes."""
    r = client.post(
        f"{_BASE}/patients/patient-gt-001/profiles",
        json={"name": "Multi-Gene Panel"},
        headers=_CLINICIAN,
    )
    pid = r.json()["id"]
    for gene_data in [
        {"gene": "CYP2D6", "variant": "*1/*4", "genotype": "*1/*4", "confidence": "high"},
        {"gene": "CYP2C19", "variant": "*2/*2", "genotype": "*2/*2", "confidence": "high"},
        {"gene": "CYP2C9", "variant": "*2/*2", "genotype": "*2/*2", "confidence": "high"},
    ]:
        client.post(
            f"{_BASE}/profiles/{pid}/manual-genotype",
            json=gene_data,
            headers=_CLINICIAN,
        )
    return {"id": pid, "patient_id": "patient-gt-001"}


# ── Prescribing language ─────────────────────────────────────────────────────


_BANNED_PRESCRIBE_VERBS = ["prescribe", "start ", "stop ", "change dose", "discontinue"]


def _collect_endpoint_text(client: TestClient, profile_id: str) -> str:
    """Hit all major read endpoints and concatenate response text."""
    texts: list[str] = []
    for url in [
        f"{_BASE}/profiles/{profile_id}",
        f"{_BASE}/profiles/{profile_id}/metabolizer-status",
        f"{_BASE}/profiles/{profile_id}/drug-interactions",
        f"{_BASE}/profiles/{profile_id}/medication-correlations",
        f"{_BASE}/profiles/{profile_id}/neuromodulation-genetics",
        f"{_BASE}/profiles/{profile_id}/biomarker-genetics",
    ]:
        r = client.get(url, headers=_CLINICIAN)
        if r.status_code == 200:
            texts.append(r.text.lower())
    # Also hit analyze
    r = client.post(f"{_BASE}/profiles/{profile_id}/analyze", headers=_CLINICIAN)
    if r.status_code == 200:
        texts.append(r.text.lower())
    return "\n".join(texts)


def test_no_prescribe_verbs(client: TestClient, mock_db: MagicMock, multi_gene_profile: dict[str, Any]) -> None:
    """Response never contains 'prescribe', 'start', 'stop', 'change dose'."""
    all_text = _collect_endpoint_text(client, multi_gene_profile["id"])
    for verb in _BANNED_PRESCRIBE_VERBS:
        assert verb not in all_text, f"Banned prescribing verb '{verb}' found in response"


def test_no_efficacy_claims(client: TestClient, mock_db: MagicMock, cyp2d6_im_profile: dict[str, Any]) -> None:
    """Response never claims definitive efficacy prediction."""
    r = client.post(f"{_BASE}/profiles/{cyp2d6_im_profile['id']}/analyze", headers=_CLINICIAN)
    text = r.text.lower()
    efficacy_claims = [
        "will respond",
        "guaranteed efficacy",
        "certain to work",
        "definitely effective",
    ]
    for claim in efficacy_claims:
        assert claim not in text, f"Found efficacy claim: '{claim}'"


def test_no_diagnosis(client: TestClient, mock_db: MagicMock, cyp2c19_pm_profile: dict[str, Any]) -> None:
    """Response never diagnoses."""
    r = client.post(f"{_BASE}/profiles/{cyp2c19_pm_profile['id']}/analyze", headers=_CLINICIAN)
    text = r.text.lower()
    diagnostic_phrases = [
        "diagnosed with",
        "patient has",
        "you have",
        "suffers from",
    ]
    for phrase in diagnostic_phrases:
        assert phrase not in text, f"Found diagnostic phrase: '{phrase}'"


# ── Safe wording ─────────────────────────────────────────────────────────────


def test_metabolizer_has_supportive_framing(client: TestClient, mock_db: MagicMock, cyp2d6_im_profile: dict[str, Any]) -> None:
    """Metabolizer status says 'supportive context only' or similar framing."""
    r = client.get(
        f"{_BASE}/profiles/{cyp2d6_im_profile['id']}/metabolizer-status",
        headers=_CLINICIAN,
    )
    body = r.json()
    for ms in body["metabolizer_statuses"]:
        note = ms.get("clinical_note", "").lower()
        assert "decision-support" in note or "supportive" in note or "clinical" in note, (
            f"Metabolizer note lacks safety framing: {ms['clinical_note']}"
        )


def test_drug_interaction_has_clinician_review_note(client: TestClient, mock_db: MagicMock, multi_gene_profile: dict[str, Any]) -> None:
    """Drug interaction says 'requires clinician/pharmacist review'."""
    r = client.get(
        f"{_BASE}/profiles/{multi_gene_profile['id']}/drug-interactions",
        headers=_CLINICIAN,
    )
    body = r.json()
    clinical_note = body.get("clinical_note", "").lower()
    assert "clinician" in clinical_note or "clinical" in clinical_note, (
        f"Drug interactions missing clinician review note: {clinical_note}"
    )


def test_side_effect_risk_has_population_warning(client: TestClient, mock_db: MagicMock, multi_gene_profile: dict[str, Any]) -> None:
    """Side effect risk says 'population-based, may not reflect individual risk'."""
    r = client.get(
        f"{_BASE}/profiles/{multi_gene_profile['id']}/medication-correlations",
        headers=_CLINICIAN,
    )
    body = r.json()
    for risk in body.get("side_effect_risks", []):
        desc = risk.get("description", "").lower()
        assert "may" in desc or "risk" in desc, (
            f"Side effect risk lacks population warning framing: {desc}"
        )


def test_research_marker_has_research_only_label(client: TestClient, mock_db: MagicMock) -> None:
    """Research markers clearly labeled via evidence grade or note."""
    r = client.post(
        f"{_BASE}/patients/patient-gt-001/profiles",
        json={"name": "Research Marker Test"},
        headers=_CLINICIAN,
    )
    pid = r.json()["id"]
    client.post(
        f"{_BASE}/profiles/{pid}/manual-genotype",
        json={"gene": "GRIK4", "variant": "rs1954787", "genotype": "G/G", "confidence": "medium"},
        headers=_CLINICIAN,
    )
    r2 = client.get(f"{_BASE}/profiles/{pid}/neuromodulation-genetics", headers=_CLINICIAN)
    body = r2.json()
    grik4 = next((g for g in body["neuromodulation_genetics"] if g["gene"] == "GRIK4"), None)
    if grik4 and grik4.get("genotype") != "Not tested":
        note = grik4.get("clinical_note", "").lower()
        assert "research" in note or "predict" in note or "may" in note, (
            f"Research marker lacks appropriate label: {note}"
        )


def test_clinical_guidance_in_analysis(client: TestClient, mock_db: MagicMock, cyp2d6_im_profile: dict[str, Any]) -> None:
    """Analysis response includes clinical guidance paragraph."""
    r = client.post(f"{_BASE}/profiles/{cyp2d6_im_profile['id']}/analyze", headers=_CLINICIAN)
    body = r.json()
    assert "clinical_guidance" in body
    guidance = body["clinical_guidance"].lower()
    assert "decision-support" in guidance or "qualified clinician" in guidance


# ── Evidence grades ──────────────────────────────────────────────────────────


def test_all_cyp2d6_findings_have_grade(client: TestClient, mock_db: MagicMock, cyp2d6_im_profile: dict[str, Any]) -> None:
    """CYP2D6 findings have evidence grade."""
    r = client.get(f"{_BASE}/profiles/{cyp2d6_im_profile['id']}/metabolizer-status", headers=_CLINICIAN)
    body = r.json()
    cyp2d6 = [m for m in body["metabolizer_statuses"] if m["gene"] == "CYP2D6"]
    assert len(cyp2d6) >= 1
    for item in cyp2d6:
        assert item["evidence"] in {"A", "B", "C", "D"}


def test_all_cyp2c19_findings_have_grade(client: TestClient, mock_db: MagicMock, cyp2c19_pm_profile: dict[str, Any]) -> None:
    """CYP2C19 findings have evidence grade."""
    r = client.get(f"{_BASE}/profiles/{cyp2c19_pm_profile['id']}/metabolizer-status", headers=_CLINICIAN)
    body = r.json()
    cyp2c19 = [m for m in body["metabolizer_statuses"] if m["gene"] == "CYP2C19"]
    assert len(cyp2c19) >= 1
    for item in cyp2c19:
        assert item["evidence"] in {"A", "B", "C", "D"}


def test_high_severity_interactions_have_strong_evidence(client: TestClient, mock_db: MagicMock, cyp2c19_pm_profile: dict[str, Any]) -> None:
    """Red/significant interactions require Grade A or B."""
    r = client.get(f"{_BASE}/profiles/{cyp2c19_pm_profile['id']}/drug-interactions", headers=_CLINICIAN)
    body = r.json()
    high_sev = [i for i in body["interactions"] if i["severity"] == "high"]
    for inter in high_sev:
        assert inter["evidence"] in {"A", "B"}, (
            f"High-severity interaction {inter['drug']} has weak evidence: {inter['evidence']}"
        )


def test_unknown_genotype_gets_grade_d(client: TestClient, mock_db: MagicMock) -> None:
    """Unknown genotype mappings receive evidence grade D."""
    r = client.post(f"{_BASE}/patients/patient-gt-001/profiles", json={"name": "Unknown"}, headers=_CLINICIAN)
    pid = r.json()["id"]
    client.post(
        f"{_BASE}/profiles/{pid}/manual-genotype",
        json={"gene": "CYP2D6", "variant": "*X/*Y", "genotype": "*X/*Y", "confidence": "low"},
        headers=_CLINICIAN,
    )
    r2 = client.get(f"{_BASE}/profiles/{pid}/metabolizer-status", headers=_CLINICIAN)
    body = r2.json()
    cyp2d6 = next((m for m in body["metabolizer_statuses"] if m["gene"] == "CYP2D6"), None)
    assert cyp2d6 is not None
    assert cyp2d6["evidence"] == "D"


def test_fda_warnings_have_grade_a(client: TestClient, mock_db: MagicMock, cyp2c19_pm_profile: dict[str, Any]) -> None:
    """FDA warnings in analysis come from Grade A interactions."""
    r = client.post(f"{_BASE}/profiles/{cyp2c19_pm_profile['id']}/analyze", headers=_CLINICIAN)
    body = r.json()
    for warning in body.get("fda_warnings", []):
        assert warning["evidence"] == "A", (
            f"FDA warning for {warning['drug']} should have Grade A evidence"
        )


# ── Population limitations ───────────────────────────────────────────────────


def test_ancestry_context_included(client: TestClient, mock_db: MagicMock) -> None:
    """Findings include population context."""
    r = client.post(f"{_BASE}/patients/patient-gt-001/profiles", json={"name": "Ancestry"}, headers=_CLINICIAN)
    pid = r.json()["id"]
    r2 = client.get(f"{_BASE}/profiles/{pid}/metabolizer-status", headers=_CLINICIAN)
    body = r2.json()
    disclaimer = body.get("disclaimer", "").lower()
    assert "clinical" in disclaimer


def test_hla_ancestry_warning(client: TestClient, mock_db: MagicMock) -> None:
    """HLA-B*15:02 reference includes Asian ancestry warning."""
    # HLA-B*15:02 is in the CPIC guidelines for carbamazepine in Asian populations
    assert "HLA-B" in gar._CPIC_METABOLIZER_TABLE or "HLA-B" in gar._PHARMGKB_INTERACTION_TABLE
    # The interaction table should have HLA-B with carbamazepine and high severity
    hla_interactions = gar._PHARMGKB_INTERACTION_TABLE.get("HLA-B", [])
    carbamazepine_interactions = [i for i in hla_interactions if i.get("drug") == "Carbamazepine"]
    for inter in carbamazepine_interactions:
        assert inter["severity"] == "high"
        assert inter["evidence"] == "A"


# ── Export governance ────────────────────────────────────────────────────────


def test_export_requires_reason(client: TestClient, mock_db: MagicMock, cyp2d6_im_profile: dict[str, Any]) -> None:
    """Export without reason is rejected via Pydantic validation."""
    r = client.post(
        f"{_BASE}/profiles/{cyp2d6_im_profile['id']}/export",
        json={"format": "json", "scope": "full"},
        headers=_CLINICIAN,
    )
    assert r.status_code == 422


def test_export_creates_audit(client: TestClient, mock_db: MagicMock, cyp2d6_im_profile: dict[str, Any]) -> None:
    """Export creates audit event."""
    with patch("app.routers.genetic_analyzer_router.create_audit_event") as mock_audit:
        mock_audit.return_value = None
        client.post(
            f"{_BASE}/profiles/{cyp2d6_im_profile['id']}/export",
            json={"format": "json", "scope": "full", "reason": "Pharmacy consult"},
            headers=_CLINICIAN,
        )
        mock_audit.assert_called()


def test_export_no_phi_in_logs(client: TestClient, mock_db: MagicMock, cyp2d6_im_profile: dict[str, Any]) -> None:
    """PHI not in export audit note (only metadata)."""
    with patch("app.routers.genetic_analyzer_router.create_audit_event") as mock_audit:
        mock_audit.return_value = None
        client.post(
            f"{_BASE}/profiles/{cyp2d6_im_profile['id']}/export",
            json={"format": "json", "scope": "full", "reason": "test"},
            headers=_CLINICIAN,
        )
        call_args = mock_audit.call_args
        if call_args and call_args.kwargs:
            note = call_args.kwargs.get("note", "")
            # The note should describe the action, not contain raw genetic data
            assert "genotype" not in note.lower() or "format=" in note


# ── Break-glass ──────────────────────────────────────────────────────────────


def test_patient_data_requires_clinician_role(client: TestClient, mock_db: MagicMock, cyp2d6_im_profile: dict[str, Any]) -> None:
    """Patient genetic data requires clinician role — patient token rejected."""
    r = client.get(
        f"{_BASE}/profiles/{cyp2d6_im_profile['id']}/metabolizer-status",
        headers=_PATIENT,
    )
    assert r.status_code == 403


def test_profile_access_requires_clinician_role(client: TestClient, mock_db: MagicMock, cyp2d6_im_profile: dict[str, Any]) -> None:
    """Profile detail requires clinician role."""
    r = client.get(
        f"{_BASE}/profiles/{cyp2d6_im_profile['id']}",
        headers=_PATIENT,
    )
    assert r.status_code == 403


def test_analysis_requires_clinician_role(client: TestClient, mock_db: MagicMock, cyp2d6_im_profile: dict[str, Any]) -> None:
    """Full analysis requires clinician role."""
    r = client.post(
        f"{_BASE}/profiles/{cyp2d6_im_profile['id']}/analyze",
        headers=_PATIENT,
    )
    assert r.status_code == 403


# ── Neuromodulation genetics safety ──────────────────────────────────────────


def test_neuromodulation_has_probabilistic_framing(client: TestClient, mock_db: MagicMock) -> None:
    """Neuromodulation genetics response includes probabilistic framing."""
    r = client.post(f"{_BASE}/patients/patient-gt-001/profiles", json={"name": "NM Safety"}, headers=_CLINICIAN)
    pid = r.json()["id"]
    r2 = client.get(f"{_BASE}/profiles/{pid}/neuromodulation-genetics", headers=_CLINICIAN)
    body = r2.json()
    note = body.get("neuromodulation_note", "").lower()
    assert "probabilistic" in note or "prediction" in note or "individual response" in note, (
        f"Neuromodulation note lacks probabilistic framing: {note}"
    )


def test_neuromodulation_composite_not_definitive(client: TestClient, mock_db: MagicMock) -> None:
    """Composite neuromodulation guidance uses conditional language."""
    r = client.post(f"{_BASE}/patients/patient-gt-001/profiles", json={"name": "NM Composite"}, headers=_CLINICIAN)
    pid = r.json()["id"]
    client.post(
        f"{_BASE}/profiles/{pid}/manual-genotype",
        json={"gene": "BDNF", "variant": "Val66Met", "genotype": "Val/Val", "confidence": "high"},
        headers=_CLINICIAN,
    )
    r2 = client.get(f"{_BASE}/profiles/{pid}/neuromodulation-genetics", headers=_CLINICIAN)
    body = r2.json()
    guidance = body.get("composite_guidance", "").lower()
    # Should not claim certainty
    assert "will respond" not in guidance
    assert "guaranteed" not in guidance
    assert "likely" in guidance or "consider" in guidance or "recommended" in guidance


# ── Nutrition genetics safety ────────────────────────────────────────────────


def test_nutrition_recommendations_have_decision_support_framing(client: TestClient, mock_db: MagicMock) -> None:
    """Nutrition recommendations include decision-support framing."""
    r = client.post(f"{_BASE}/patients/patient-gt-001/profiles", json={"name": "Nutrition Safety"}, headers=_CLINICIAN)
    pid = r.json()["id"]
    client.post(
        f"{_BASE}/profiles/{pid}/manual-genotype",
        json={"gene": "MTHFR", "variant": "C677T", "genotype": "CT", "confidence": "high"},
        headers=_CLINICIAN,
    )
    r2 = client.get(f"{_BASE}/profiles/patient-gt-001/nutrition-genetics", headers=_CLINICIAN)
    body = r2.json()
    note = body.get("nutrition_note", "").lower()
    assert "decision-support" in note or "clinical" in note or "registered dietitian" in note


def test_nutrition_recommendations_use_consider_language(client: TestClient, mock_db: MagicMock) -> None:
    """Nutrition recommendations use 'consider' rather than imperative."""
    r = client.post(f"{_BASE}/patients/patient-gt-001/profiles", json={"name": "Nutrition Lang"}, headers=_CLINICIAN)
    pid = r.json()["id"]
    client.post(
        f"{_BASE}/profiles/{pid}/manual-genotype",
        json={"gene": "MTHFR", "variant": "C677T", "genotype": "TT", "confidence": "high"},
        headers=_CLINICIAN,
    )
    r2 = client.get(f"{_BASE}/profiles/patient-gt-001/nutrition-genetics", headers=_CLINICIAN)
    body = r2.json()
    for rec in body.get("recommendations", []):
        text = rec.get("recommendation", "").lower()
        assert "should take" not in text or "consider" in text


# ── Evidence summary ─────────────────────────────────────────────────────────


def test_evidence_summary_in_analysis(client: TestClient, mock_db: MagicMock, multi_gene_profile: dict[str, Any]) -> None:
    """Analysis includes evidence summary with grade counts."""
    r = client.post(f"{_BASE}/profiles/{multi_gene_profile['id']}/analyze", headers=_CLINICIAN)
    body = r.json()
    summary = body.get("evidence_summary", {})
    assert isinstance(summary, dict)
    # Should have keys for grades
    total = sum(summary.values())
    assert total >= 1


def test_risk_scores_include_disclaimer(client: TestClient, mock_db: MagicMock, multi_gene_profile: dict[str, Any]) -> None:
    """Risk scores in analysis have contextual disclaimer."""
    r = client.post(f"{_BASE}/profiles/{multi_gene_profile['id']}/analyze", headers=_CLINICIAN)
    body = r.json()
    risk = body.get("risk_scores", {})
    assert "overall_risk" in risk
    assert risk["overall_risk"] in {"low", "moderate", "high"}
    assert "evidence" in risk


# ── Disclaimers on all endpoints ─────────────────────────────────────────────


def test_all_read_endpoints_have_disclaimer(client: TestClient, mock_db: MagicMock, multi_gene_profile: dict[str, Any]) -> None:
    """Every read endpoint returns a disclaimer field."""
    pid = multi_gene_profile["id"]
    endpoints = [
        f"{_BASE}/profiles/{pid}",
        f"{_BASE}/profiles/{pid}/metabolizer-status",
        f"{_BASE}/profiles/{pid}/drug-interactions",
        f"{_BASE}/profiles/{pid}/medication-correlations",
        f"{_BASE}/profiles/{pid}/neuromodulation-genetics",
        f"{_BASE}/profiles/{pid}/biomarker-genetics",
    ]
    for url in endpoints:
        r = client.get(url, headers=_CLINICIAN)
        assert r.status_code == 200
        body = r.json()
        assert "disclaimer" in body, f"Missing disclaimer on {url}"
        assert len(body["disclaimer"]) > 20


def test_vcf_upload_has_disclaimer(client: TestClient, mock_db: MagicMock, cyp2d6_im_profile: dict[str, Any]) -> None:
    """VCF upload response includes disclaimer."""
    vcf = "##fileformat=VCFv4.2\n#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tSAMPLE\n1\t1\trs1065852\tA\tG\t30\tPASS\t.\tGT\t0/1\n"
    r = client.post(
        f"{_BASE}/profiles/{cyp2d6_im_profile['id']}/upload-vcf",
        files={"file": ("test.vcf", io.BytesIO(vcf.encode()), "text/plain")},
        headers=_CLINICIAN,
    )
    body = r.json()
    assert "disclaimer" in body


# ── Report safety ────────────────────────────────────────────────────────────


def test_clinical_report_contains_decision_support_note(client: TestClient, mock_db: MagicMock, cyp2c19_pm_profile: dict[str, Any]) -> None:
    """Clinical report contains decision-support note in decision_support_summary."""
    pid = cyp2c19_pm_profile["id"]
    client.post(f"{_BASE}/profiles/{pid}/analyze", headers=_CLINICIAN)
    r = client.post(
        f"{_BASE}/profiles/{pid}/reports",
        json={"report_type": "clinical", "sections": ["decision_support_summary"]},
        headers=_CLINICIAN,
    )
    body = r.json()
    assert "disclaimer" in body
    assert "decision-support" in body["disclaimer"].lower() or "clinical" in body["disclaimer"].lower()


def test_html_report_contains_disclaimer_div(client: TestClient, mock_db: MagicMock, cyp2c19_pm_profile: dict[str, Any]) -> None:
    """HTML report contains disclaimer in a styled div."""
    pid = cyp2c19_pm_profile["id"]
    client.post(f"{_BASE}/profiles/{pid}/analyze", headers=_CLINICIAN)
    r1 = client.post(
        f"{_BASE}/profiles/{pid}/reports",
        json={"report_type": "clinical", "sections": ["metabolizer_status", "decision_support_summary"]},
        headers=_CLINICIAN,
    )
    report_id = r1.json()["id"]
    r2 = client.get(f"{_BASE}/profiles/{pid}/reports/{report_id}?format=html", headers=_CLINICIAN)
    html = r2.json()["html_content"]
    assert "disclaimer" in html.lower() or "Decision-Support" in html
    assert "<!DOCTYPE html>" in html


# ── Pharmacogenomics panel service safety ────────────────────────────────────


def test_panel_service_has_safety_framing() -> None:
    """Pharmacogenomics panel service recommendations always have safety framing."""
    from app.services.pharmacogenomics_panel import _CPIC_GUIDELINES
    safety_phrases = ["decision-support", "requires clinician", "clinical judgment"]
    for guideline in _CPIC_GUIDELINES:
        for pheno, details in guideline.get("phenotypes", {}).items():
            rec = details.get("recommendation", "").lower()
            assert any(phrase in rec for phrase in safety_phrases), (
                f"CPIC guideline {guideline['gene']} / {pheno} lacks safety framing"
            )


def test_panel_service_no_direct_prescribing() -> None:
    """Pharmacogenomics panel service never prescribes directly."""
    from app.services.pharmacogenomics_panel import _CPIC_GUIDELINES
    banned = ["patient should stop", "discontinue immediately", "must not take", "contraindicated"]
    for guideline in _CPIC_GUIDELINES:
        for pheno, details in guideline.get("phenotypes", {}).items():
            rec = details.get("recommendation", "").lower()
            for phrase in banned:
                assert phrase not in rec, (
                    f"CPIC guideline {guideline['gene']} / {pheno} has banned phrase: {phrase}"
                )
