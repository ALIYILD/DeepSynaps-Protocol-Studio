from __future__ import annotations


def test_findings_extraction_yields_at_least_one():
    from deepsynaps_qeeg.pipeline import PipelineResult
    from deepsynaps_qeeg.narrative import extract_findings

    r = PipelineResult()
    r.features = {
        "spectral": {"bands": {"alpha": {"absolute_uv2": {"Fz": 12.3}, "relative": {}}}},
    }
    r.zscores = {
        "flagged": [
            {"metric": "spectral.bands.alpha.absolute_uv2", "channel": "Fz", "z": 2.3},
        ],
        "norm_db_version": "toy",
    }
    findings = extract_findings(r)
    assert isinstance(findings, list)
    assert len(findings) >= 1
    f0 = findings[0]
    assert f0.region == "Fz"
    assert f0.band == "alpha"
    assert f0.severity == "significant"


def test_retrieve_evidence_returns_expected_shape(monkeypatch):
    from deepsynaps_qeeg.narrative.retrieve import retrieve_evidence
    from deepsynaps_qeeg.narrative.types import Finding

    # Patch MedRAG module-level retrieve used by narrative.retrieve
    import deepsynaps_qeeg.ai.medrag as medrag_mod

    def fake_retrieve(eeg_features, patient_meta, *, k=10, db_session=None):  # noqa: ARG001
        return [
            {
                "paper_id": "30000001",
                "relevance": 1.0,
                "evidence_chain": [],
                "pmid": "30000001",
                "doi": "10.0000/toy.1",
                "title": "Toy paper",
                "year": 2020,
                "url": "https://doi.org/10.0000/toy.1",
                "abstract": "A toy abstract",
            }
        ][: int(k)]

    monkeypatch.setattr(medrag_mod, "retrieve", fake_retrieve)

    f = Finding(
        region="Fz",
        band="alpha",
        metric="spectral.bands.alpha.absolute_uv2",
        value=12.3,
        z=2.1,
        direction="elevated",
        severity="significant",
    )
    cits = retrieve_evidence(f, top_k=5)
    assert isinstance(cits, list)
    assert len(cits) >= 1
    c0 = cits[0]
    assert c0.citation_id.startswith("C")
    assert c0.pmid == "30000001"
    assert c0.doi == "10.0000/toy.1"


def test_safety_rejects_hallucinated_citations():
    from deepsynaps_qeeg.narrative.safety import check_citations

    ok, reason = check_citations(
        text_markdown="This is a claim. [C999]",
        allowed_citation_ids={"C1"},
    )
    assert ok is False
    assert "unknown citation" in reason.lower()

