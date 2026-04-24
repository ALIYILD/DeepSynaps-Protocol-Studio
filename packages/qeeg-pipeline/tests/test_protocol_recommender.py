"""Tests for :mod:`deepsynaps_qeeg.ai.protocol_recommender`."""
from __future__ import annotations

from deepsynaps_qeeg.ai import protocol_recommender as pr


EXPECTED_KEYS = {
    "primary_modality", "target_region", "dose", "session_plan",
    "contraindications", "expected_response_window_weeks",
    "citations", "confidence", "alternative_protocols", "rationale",
}


def _fake_medrag(*_args, **_kwargs):
    return [
        {"pmid": "11111111", "doi": "10.1/a", "title": "Fake paper A",
         "year": 2024, "url": "https://pubmed.ncbi.nlm.nih.gov/11111111/",
         "abstract": "A", "relevance": 1.0, "paper_id": "1",
         "evidence_chain": []},
        {"pmid": "22222222", "doi": "10.1/b", "title": "Fake paper B",
         "year": 2023, "url": "https://pubmed.ncbi.nlm.nih.gov/22222222/",
         "abstract": "B", "relevance": 0.9, "paper_id": "2",
         "evidence_chain": []},
        {"pmid": "33333333", "doi": "10.1/c", "title": "Fake paper C",
         "year": 2022, "url": "https://pubmed.ncbi.nlm.nih.gov/33333333/",
         "abstract": "C", "relevance": 0.8, "paper_id": "3",
         "evidence_chain": []},
    ]


def _fake_similar_cases(*_args, **_kwargs):
    return [
        {"case_id": f"syn-{i}", "similarity_score": 0.9 - 0.05 * i,
         "age": 40 + i, "sex": "M",
         "flagged_conditions": ["mdd_like"],
         "outcome": {"responder": i % 2 == 0, "response_delta": 0.1},
         "summary_deidentified": "n/a"}
        for i in range(10)
    ]


def _features_faa_positive() -> dict:
    return {
        "asymmetry": {"frontal_alpha_F3_F4": 0.35, "frontal_alpha_F7_F8": 0.2},
        "spectral": {
            "bands": {"delta": {"absolute_uv2": {}}},
            "peak_alpha_freq": {"O1": 10.0},
        },
        "flags": [],
    }


def _risk_scores_mdd() -> dict:
    return {
        "mdd_like": {"score": 0.72, "ci95": [0.6, 0.84]},
        "adhd_like": {"score": 0.2, "ci95": [0.1, 0.3]},
        "anxiety_like": {"score": 0.25, "ci95": [0.15, 0.35]},
        "cognitive_decline_like": {"score": 0.15, "ci95": [0.05, 0.25]},
        "tbi_residual_like": {"score": 0.1, "ci95": [0.02, 0.2]},
        "insomnia_like": {"score": 0.18, "ci95": [0.08, 0.28]},
        "disclaimer": "Neurophysiological similarity indices for research/wellness use only. NOT diagnostic.",
    }


def _zscores_empty() -> dict:
    return {"flagged": [], "norm_db_version": "toy-0.1"}


# -------------------------------------------------------------------- shape
def test_recommend_protocol_shape_primary():
    out = pr.recommend_protocol(
        _features_faa_positive(),
        _zscores_empty(),
        _risk_scores_mdd(),
        embedding=[0.1] * 16,
        flagged_conditions=["depression"],
        medrag_fn=_fake_medrag,
        similar_cases_fn=_fake_similar_cases,
    )
    assert EXPECTED_KEYS.issubset(out.keys())
    assert out["primary_modality"] == "rtms_10hz"
    assert out["target_region"] == "L_DLPFC"
    plan = out["session_plan"]
    assert set(plan.keys()) == {"induction", "consolidation", "maintenance"}
    for phase in plan.values():
        assert "sessions" in phase and "notes" in phase
    assert isinstance(out["alternative_protocols"], list)
    assert isinstance(out["citations"], list) and len(out["citations"]) <= 5


def test_recommend_protocol_sanitises_banned_words():
    # craft features with FAA trigger so we get a real primary
    feats = _features_faa_positive()
    rs = _risk_scores_mdd()
    out = pr.recommend_protocol(
        feats, _zscores_empty(), rs,
        embedding=[0.1] * 16,
        medrag_fn=_fake_medrag,
        similar_cases_fn=_fake_similar_cases,
    )
    rationale = out["rationale"].lower()
    assert "diagnos" not in rationale
    assert "treatment recommendation" not in rationale


def test_recommend_protocol_no_trigger_returns_low_confidence_stub():
    blank_feats = {
        "asymmetry": {"frontal_alpha_F3_F4": 0.0, "frontal_alpha_F7_F8": 0.0},
        "spectral": {
            "bands": {"delta": {"absolute_uv2": {"Fp1": 0.5, "Fp2": 0.5,
                                                 "F3": 0.5, "F4": 0.5, "Fz": 0.5}}},
            "peak_alpha_freq": {"O1": 10.0, "O2": 10.1},
        },
        "flags": [],
    }
    low_rs = {label: {"score": 0.1, "ci95": [0.02, 0.18]} for label in
              ("mdd_like", "adhd_like", "anxiety_like",
               "cognitive_decline_like", "tbi_residual_like",
               "insomnia_like")}
    low_rs["disclaimer"] = "x"
    out = pr.recommend_protocol(
        blank_feats, _zscores_empty(), low_rs,
        flagged_conditions=[],
        medrag_fn=_fake_medrag,
        similar_cases_fn=_fake_similar_cases,
    )
    assert out["confidence"] == "low"
    assert out["primary_modality"] == "observation"
    rationale = out["rationale"].lower()
    assert "diagnos" not in rationale
    assert "treatment recommendation" not in rationale


def test_recommend_protocol_alternatives_length_bound():
    # FAA + theta + alpha all trigger together for this feature bundle
    feats = {
        "asymmetry": {"frontal_alpha_F3_F4": 0.35, "frontal_alpha_F7_F8": 0.2},
        "spectral": {
            "bands": {
                "delta": {"absolute_uv2": {"Fp1": 0.5}},
                "alpha": {"absolute_uv2": {"Pz": 1.6, "O1": 1.6, "O2": 1.6}},
            },
            "peak_alpha_freq": {"O1": 10.0},
        },
        "flags": ["elevated_theta_at_Fz", "elevated_posterior_alpha"],
    }
    rs = {
        "mdd_like": {"score": 0.7, "ci95": [0.6, 0.8]},
        "adhd_like": {"score": 0.65, "ci95": [0.55, 0.75]},
        "anxiety_like": {"score": 0.62, "ci95": [0.5, 0.72]},
        "cognitive_decline_like": {"score": 0.1, "ci95": [0.0, 0.2]},
        "tbi_residual_like": {"score": 0.1, "ci95": [0.0, 0.2]},
        "insomnia_like": {"score": 0.1, "ci95": [0.0, 0.2]},
        "disclaimer": "x",
    }
    out = pr.recommend_protocol(
        feats, _zscores_empty(), rs,
        embedding=[0.05] * 16,
        flagged_conditions=["depression", "adhd", "anxiety"],
        medrag_fn=_fake_medrag,
        similar_cases_fn=_fake_similar_cases,
    )
    alts = out["alternative_protocols"]
    assert isinstance(alts, list)
    assert 0 <= len(alts) <= 2
    for alt in alts:
        assert EXPECTED_KEYS.issubset(alt.keys())


def test_recommend_protocol_rationale_length_bound():
    out = pr.recommend_protocol(
        _features_faa_positive(),
        _zscores_empty(),
        _risk_scores_mdd(),
        embedding=[0.0] * 16,
        medrag_fn=_fake_medrag,
        similar_cases_fn=_fake_similar_cases,
    )
    assert len(out["rationale"]) <= 1200


def test_recommend_protocol_citations_have_url():
    out = pr.recommend_protocol(
        _features_faa_positive(),
        _zscores_empty(),
        _risk_scores_mdd(),
        embedding=[0.0] * 16,
        medrag_fn=_fake_medrag,
        similar_cases_fn=_fake_similar_cases,
    )
    for cite in out["citations"]:
        assert {"n", "pmid", "doi", "title", "url"}.issubset(cite.keys())
