"""Tests for /api/v1/evidence/*.

Covers the path where evidence.db is MISSING (503 with a clear message —
the doctor-facing failure mode), the path where it is PRESENT but empty
(200 with empty arrays), and auth gating. A tiny fixture SQLite DB is
built in-test so we don't depend on a live ingest.
"""
from __future__ import annotations

import os
import sqlite3
import tempfile
import json
from pathlib import Path

from fastapi.testclient import TestClient

PIPELINE = Path(__file__).resolve().parents[3] / "services" / "evidence-pipeline"


def _write_csv(path: Path, fieldnames: list[str], rows: list[dict[str, object]]) -> None:
    import csv

    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def _build_research_bundle(root: Path) -> None:
    _write_csv(
        root / "neuromodulation_master_database_enriched.csv",
        [
            "paper_key",
            "title",
            "authors",
            "journal",
            "journal_normalized",
            "year",
            "doi",
            "pmid",
            "pmcid",
            "primary_modality",
            "canonical_modalities",
            "indication_tags",
            "population_tags",
            "target_tags",
            "parameter_signal_tags",
            "study_type_normalized",
            "evidence_tier",
            "protocol_relevance_score",
            "cited_by_count",
            "is_open_access",
            "record_url",
            "source_exports",
            "research_summary",
            "abstract_status",
            "paper_confidence_score",
            "priority_score",
            "trial_match_count",
            "trial_signal_score",
            "fda_match_count",
            "fda_signal_score",
            "real_world_evidence_flag",
            "outcome_snippet_count",
            "trial_protocol_parameter_summary",
            "regulatory_clinical_signal",
            "source",
            "id",
            "ai_ingestion_text",
        ],
        [
            {
                "paper_key": "pmid|100",
                "title": "High confidence rTMS trial for depression",
                "authors": "Doe J",
                "journal": "Brain Stimulation",
                "journal_normalized": "Brain Stimulation",
                "year": 2024,
                "doi": "10.1000/example1",
                "pmid": "100",
                "pmcid": "",
                "primary_modality": "transcranial_magnetic_stimulation",
                "canonical_modalities": "transcranial_magnetic_stimulation",
                "indication_tags": "depression",
                "population_tags": "adult",
                "target_tags": "left_dlpfc",
                "parameter_signal_tags": "10_hz;theta_burst",
                "study_type_normalized": "randomized_controlled_trial",
                "evidence_tier": "high",
                "protocol_relevance_score": 90,
                "cited_by_count": 120,
                "is_open_access": "Y",
                "record_url": "https://example.org/paper1",
                "source_exports": "pubmed;europepmc",
                "research_summary": "Randomized sham-controlled rTMS trial with strong outcome data.",
                "abstract_status": "ok",
                "paper_confidence_score": 88,
                "priority_score": 140,
                "trial_match_count": 3,
                "trial_signal_score": 76,
                "fda_match_count": 2,
                "fda_signal_score": 21,
                "real_world_evidence_flag": "Y",
                "outcome_snippet_count": 4,
                "trial_protocol_parameter_summary": "freq_hz=10 | target=left dlpfc | sham/control",
                "regulatory_clinical_signal": "3 prioritized trials / score 76 | 2 relevant 510(k) devices / score 21",
                "source": "MED",
                "id": "100",
                "ai_ingestion_text": "depression rtms randomized sham left dlpfc",
            },
            {
                "paper_key": "pmid|101",
                "title": "Lower confidence neuromodulation review",
                "authors": "Doe A",
                "journal": "Journal of Reviews",
                "journal_normalized": "Journal of Reviews",
                "year": 2018,
                "doi": "10.1000/example2",
                "pmid": "101",
                "pmcid": "",
                "primary_modality": "transcranial_magnetic_stimulation",
                "canonical_modalities": "transcranial_magnetic_stimulation",
                "indication_tags": "depression",
                "population_tags": "adult",
                "target_tags": "",
                "parameter_signal_tags": "",
                "study_type_normalized": "systematic_review",
                "evidence_tier": "moderate",
                "protocol_relevance_score": 30,
                "cited_by_count": 20,
                "is_open_access": "N",
                "record_url": "https://example.org/paper2",
                "source_exports": "pubmed",
                "research_summary": "Narrative review.",
                "abstract_status": "ok",
                "paper_confidence_score": 35,
                "priority_score": 20,
                "trial_match_count": 0,
                "trial_signal_score": 0,
                "fda_match_count": 0,
                "fda_signal_score": 0,
                "real_world_evidence_flag": "N",
                "outcome_snippet_count": 0,
                "trial_protocol_parameter_summary": "",
                "regulatory_clinical_signal": "",
                "source": "MED",
                "id": "101",
                "ai_ingestion_text": "depression review",
            },
        ],
    )
    _write_csv(root / "raw" / "neuromodulation_all_papers_master.csv", ["title"], [])
    _write_csv(root / "derived" / "neuromodulation_ai_ingestion_dataset.csv", ["paper_key"], [])
    _write_csv(root / "derived" / "neuromodulation_evidence_graph.csv", ["indication"], [])
    _write_csv(root / "derived" / "neuromodulation_protocol_template_candidates.csv", ["modality"], [])
    _write_csv(root / "derived" / "neuromodulation_safety_contraindication_signals.csv", ["paper_key"], [])
    _write_csv(
        root / "derived" / "neuromodulation_indication_modality_summary.csv",
        [
            "indication",
            "modality",
            "paper_count",
            "evidence_weight_sum",
            "citation_sum",
            "top_study_types",
            "top_targets",
            "top_parameter_tags",
        ],
        [
            {
                "indication": "major_depressive_disorder",
                "modality": "transcranial_direct_current_stimulation",
                "paper_count": 44,
                "evidence_weight_sum": 96,
                "citation_sum": 320,
                "top_study_types": "randomized_controlled_trial:10;systematic_review:3",
                "top_targets": "left_dlpfc:18;dlpfc:8",
                "top_parameter_tags": "double_blind:6;frequency_signal:1",
            }
        ],
    )
    _write_csv(
        root / "top_condition_exact_protocols.csv",
        [
            "condition_slug",
            "condition_label",
            "protocol_id",
            "protocol_name",
            "modality_name",
            "modality_id",
            "target_region",
            "coil_or_electrode_placement",
            "evidence_grade",
        ],
        [
            {
                "condition_slug": "major-depressive-disorder",
                "condition_label": "Major Depressive Disorder",
                "protocol_id": "PRO-003",
                "protocol_name": "tDCS Left DLPFC for MDD",
                "modality_name": "tDCS (Transcranial Direct Current Stimulation)",
                "modality_id": "MOD-003",
                "target_region": "Left DLPFC",
                "coil_or_electrode_placement": "Anode at F3; Cathode at Fp2",
                "evidence_grade": "EV-B",
            }
        ],
    )
    _write_csv(root / "protocol_parameter_candidates.csv", ["condition_slug"], [])
    _write_csv(root / "contraindication_safety_schema.csv", ["condition_slug"], [])
    (root / "top_condition_knowledge_base.json").write_text(json.dumps({}), encoding="utf-8")


def _build_fixture_db(path: str) -> None:
    """Create a minimal evidence.db with one indication + one paper + one trial.

    Also applies every `migrations/*.sql` so the new enrichment columns exist
    and the router's SELECTs don't break. Idempotent — safe on a fresh file.
    """
    with open(PIPELINE / "schema.sql") as f:
        schema = f.read()
    conn = sqlite3.connect(path)
    conn.executescript(schema)
    # Migration scripts reference this ledger; create it before applying.
    conn.executescript(
        "CREATE TABLE IF NOT EXISTS schema_migrations "
        "(filename TEXT PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);"
    )
    for migration in sorted((PIPELINE / "migrations").glob("*.sql")):
        with open(migration, encoding="utf-8") as mf:
            conn.executescript(mf.read())
    conn.execute(
        "INSERT INTO indications(slug, label, modality, condition, evidence_grade, regulatory) "
        "VALUES ('rtms_mdd', 'rTMS for MDD', 'rTMS', 'Major depressive disorder', 'A', 'FDA-cleared 2008')"
    )
    ind_id = conn.execute("SELECT id FROM indications WHERE slug='rtms_mdd'").fetchone()[0]
    conn.execute(
        "INSERT INTO papers(pmid, doi, title, abstract, year, journal, authors_json, "
        "pub_types_json, cited_by_count, is_oa, oa_url, sources_json, last_ingested) "
        "VALUES ('29726344', '10.1016/s0140-6736(18)30295-2', "
        "'THREE-D: iTBS non-inferiority RCT', 'Landmark rTMS RCT.', 2018, 'Lancet', "
        "'[\"Blumberger DM\"]', '[\"Randomized Controlled Trial\"]', 1249, 1, "
        "'https://example/pdf', '[\"pubmed\"]', '2026-04-12T00:00:00Z')"
    )
    paper_id = conn.execute("SELECT id FROM papers LIMIT 1").fetchone()[0]
    conn.execute(
        "INSERT INTO paper_indications(paper_id, indication_id) VALUES (?, ?)",
        (paper_id, ind_id),
    )
    conn.execute(
        "INSERT INTO trials(nct_id, title, phase, status, enrollment, conditions_json, "
        "interventions_json, outcomes_json, brief_summary, raw_json) "
        "VALUES ('NCT00000000', 'Test trial', 'PHASE3', 'COMPLETED', 100, "
        "'[\"Depression\"]', '[{\"name\":\"10Hz rTMS L-DLPFC\"}]', '[]', 'Summary', '{}')"
    )
    trial_id = conn.execute("SELECT id FROM trials WHERE nct_id='NCT00000000'").fetchone()[0]
    conn.execute(
        "INSERT INTO trial_indications(trial_id, indication_id) VALUES (?, ?)",
        (trial_id, ind_id),
    )
    conn.commit()
    conn.close()


def test_evidence_health_returns_503_when_db_missing(client: TestClient, auth_headers) -> None:
    # Point EVIDENCE_DB_PATH at a non-existent file.
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        missing = Path(tmp) / "nope.db"
        os.environ["EVIDENCE_DB_PATH"] = str(missing)
        r = client.get("/api/v1/evidence/health", headers=auth_headers["clinician"])
        assert r.status_code == 503
        assert "ingest" in r.json()["detail"].lower() or "not found" in r.json()["detail"].lower()
    os.environ.pop("EVIDENCE_DB_PATH", None)


def test_evidence_endpoints_work_with_fixture_db(client: TestClient, auth_headers) -> None:
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        db_path = str(Path(tmp) / "evidence.db")
        _build_fixture_db(db_path)
        os.environ["EVIDENCE_DB_PATH"] = db_path
        try:
            r = client.get("/api/v1/evidence/health", headers=auth_headers["clinician"])
            assert r.status_code == 200, r.text
            counts = r.json()["counts"]
            assert counts["papers"] == 1
            assert counts["indications"] == 1

            r = client.get("/api/v1/evidence/indications", headers=auth_headers["clinician"])
            assert r.status_code == 200
            inds = r.json()
            assert len(inds) == 1 and inds[0]["slug"] == "rtms_mdd"

            r = client.get(
                "/api/v1/evidence/papers?indication=rtms_mdd&limit=5",
                headers=auth_headers["clinician"],
            )
            assert r.status_code == 200
            papers = r.json()
            assert papers and papers[0]["pmid"] == "29726344"
            assert "Randomized Controlled Trial" in papers[0]["pub_types"]

            r = client.get(
                "/api/v1/evidence/trials?indication=rtms_mdd",
                headers=auth_headers["clinician"],
            )
            assert r.status_code == 200
            trials = r.json()
            assert trials and trials[0]["nct_id"] == "NCT00000000"
            assert trials[0]["interventions"][0]["name"].startswith("10Hz rTMS")
        finally:
            os.environ.pop("EVIDENCE_DB_PATH", None)


def test_evidence_health_requires_auth(client: TestClient) -> None:
    r = client.get("/api/v1/evidence/health")
    assert r.status_code in (401, 403), r.text


def test_evidence_papers_filters_oa_only(client: TestClient, auth_headers) -> None:
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        db_path = str(Path(tmp) / "evidence.db")
        _build_fixture_db(db_path)
        os.environ["EVIDENCE_DB_PATH"] = db_path
        try:
            r = client.get(
                "/api/v1/evidence/papers?indication=rtms_mdd&oa_only=true",
                headers=auth_headers["clinician"],
            )
            assert r.status_code == 200
            papers = r.json()
            assert all(p["is_oa"] for p in papers)
        finally:
            os.environ.pop("EVIDENCE_DB_PATH", None)


def test_research_papers_use_enriched_bundle_ranking(client: TestClient, auth_headers) -> None:
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        bundle_root = Path(tmp) / "bundle"
        _build_research_bundle(bundle_root)
        os.environ["DEEPSYNAPS_NEUROMODULATION_RESEARCH_BUNDLE_ROOT"] = str(bundle_root)
        try:
            r = client.get(
                "/api/v1/evidence/research/papers?modality=transcranial_magnetic_stimulation"
                "&ranking_mode=clinical&min_confidence=40&with_trial_signal=true&limit=5",
                headers=auth_headers["clinician"],
            )
            assert r.status_code == 200, r.text
            rows = r.json()
            assert len(rows) == 1
            assert rows[0]["title"] == "High confidence rTMS trial for depression"
            assert rows[0]["paper_confidence_score"] == 88
            assert rows[0]["trial_signal_score"] == 76
            assert rows[0]["ranking_mode"] == "clinical"
        finally:
            os.environ.pop("DEEPSYNAPS_NEUROMODULATION_RESEARCH_BUNDLE_ROOT", None)


def test_research_protocol_coverage_uses_bundle_summary(client: TestClient, auth_headers) -> None:
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        bundle_root = Path(tmp) / "bundle"
        _build_research_bundle(bundle_root)
        os.environ["DEEPSYNAPS_NEUROMODULATION_RESEARCH_BUNDLE_ROOT"] = str(bundle_root)
        try:
            r = client.get(
                "/api/v1/evidence/research/protocol-coverage?limit=5",
                headers=auth_headers["clinician"],
            )
            assert r.status_code == 200, r.text
            payload = r.json()
            assert payload["generated_from"] == "neuromodulation_indication_modality_summary.csv"
            assert payload["rows"]
            assert payload["rows"][0]["condition"] == "Major Depressive Disorder"
            assert payload["rows"][0]["modality"] == "Transcranial Direct Current Stimulation"
            assert payload["rows"][0]["coverage"] > 0
        finally:
            os.environ.pop("DEEPSYNAPS_NEUROMODULATION_RESEARCH_BUNDLE_ROOT", None)
