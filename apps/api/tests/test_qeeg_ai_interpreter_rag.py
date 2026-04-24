"""Tests for the refactored ``qeeg_ai_interpreter`` (CONTRACT §5).

Exercises:

* ``generate_ai_report`` with the new ``features`` / ``zscores`` /
  ``flagged_conditions`` kwargs (CONTRACT §1.1 / §1.2).
* The RAG call is mocked via ``app.services.qeeg_rag.query_literature``.
* The LLM call is mocked via ``app.services.chat_service._llm_chat_async``.
* Numbered ``literature_refs`` top-level key is populated.
* Banned-word sanitiser replaces "diagnose/diagnostic/diagnosis" and
  "treatment recommendation" in ``executive_summary`` + ``findings[*].observation``.
* ``match_condition_patterns`` accepts BOTH the legacy and CONTRACT §1.1 shapes.
"""
from __future__ import annotations

import asyncio
import json
from unittest import mock


def _run(coro):
    return asyncio.run(coro)


# ── Fixtures ────────────────────────────────────────────────────────────────

_FAKE_RAG = [
    {
        "pmid": "30000001",
        "doi": "10.1/adhd-tbr",
        "title": "Elevated theta/beta ratio in ADHD",
        "authors": ["Smith J", "Doe A"],
        "year": 2023,
        "journal": "Clin Neurophysiol",
        "abstract": "TBR at Cz discriminates ADHD from controls.",
        "relevance_score": 0.91,
    },
    {
        "pmid": "30000002",
        "doi": "10.1/tdcs-adhd",
        "title": "tDCS in ADHD: meta-analysis",
        "authors": ["Rossi G"],
        "year": 2022,
        "journal": "Brain Stim",
        "abstract": "Left DLPFC anodal tDCS improves attention.",
        "relevance_score": 0.82,
    },
    {
        "pmid": None,
        "doi": "10.1/nfb-adhd",
        "title": "Neurofeedback for childhood ADHD",
        "authors": ["Lee H"],
        "year": 2021,
        "journal": "J Neurotherapy",
        "abstract": "SMR/theta protocols reduce inattention scores.",
        "relevance_score": 0.75,
    },
]


def _legacy_band_powers() -> dict:
    """Legacy Studio band-powers payload used by the old test path."""
    return {
        "bands": {
            "theta": {"hz_range": [4.0, 8.0], "channels": {
                "Fz": {"absolute_uv2": 18.0, "relative_pct": 28.0},
                "Cz": {"absolute_uv2": 15.0, "relative_pct": 26.0},
            }},
            "beta": {"hz_range": [13.0, 30.0], "channels": {
                "Fz": {"absolute_uv2": 7.0, "relative_pct": 10.0},
                "Cz": {"absolute_uv2": 5.0, "relative_pct": 9.0},
            }},
            "alpha": {"hz_range": [8.0, 13.0], "channels": {
                "F3": {"absolute_uv2": 10.0, "relative_pct": 18.0},
                "F4": {"absolute_uv2": 12.0, "relative_pct": 20.0},
            }},
        },
        "derived_ratios": {
            "theta_beta_ratio": {"channels": {"Fz": 2.57, "Cz": 3.4}},
            "frontal_alpha_asymmetry": {"F3_F4": 0.18},
        },
    }


def _features_contract_1_1() -> dict:
    """CONTRACT §1.1-shaped features dict."""
    return {
        "spectral": {
            "bands": {
                "theta": {
                    "absolute_uv2": {"Fz": 18.0, "Cz": 15.0},
                    "relative":     {"Fz": 0.28, "Cz": 0.26},
                },
                "beta": {
                    "absolute_uv2": {"Fz": 7.0, "Cz": 5.0},
                    "relative":     {"Fz": 0.10, "Cz": 0.09},
                },
                "alpha": {
                    "absolute_uv2": {"F3": 10.0, "F4": 12.0},
                    "relative":     {"F3": 0.18, "F4": 0.20},
                },
            },
            "aperiodic": {"slope": {"Cz": 1.2}, "offset": {"Cz": -2.3}, "r_squared": {"Cz": 0.92}},
            "peak_alpha_freq": {"Oz": 9.8},
        },
        "asymmetry": {"frontal_alpha_F3_F4": 0.18, "frontal_alpha_F7_F8": 0.05},
        "connectivity": {},
        "graph": {},
        "source": {"roi_band_power": {}, "method": "eLORETA"},
    }


# ── Tests ───────────────────────────────────────────────────────────────────


def test_generate_ai_report_new_features_path_embeds_refs_and_sanitises_banned_words():
    """features + zscores + flagged_conditions → refs populated + banned words sanitised."""
    from app.services import qeeg_ai_interpreter

    # Mocked LLM response contains BOTH banned words (should be sanitised) AND
    # numbered citations (should survive).
    fake_llm_json = {
        "executive_summary": (
            "The diagnosis of ADHD is suggested by elevated theta/beta ratio [1]. "
            "A treatment recommendation is anodal tDCS over L-DLPFC [2]."
        ),
        "findings": [
            {
                "region": "central",
                "band": "theta",
                "observation": (
                    "Elevated Cz TBR of 3.4 is diagnostic of attention dysregulation [1]."
                ),
                "citations": [1],
            },
            {
                "region": "frontal",
                "band": "alpha",
                "observation": "Right-dominant frontal alpha asymmetry F3-F4=0.18 [3].",
                "citations": [3],
            },
        ],
        "band_analysis": {},
        "key_biomarkers": {},
        "condition_correlations": [],
        "protocol_recommendations": [],
        "clinical_flags": [],
        "confidence_level": "moderate",
        "disclaimer": "For research/wellness reference only.",
    }

    async def _fake_llm(**kwargs):
        return json.dumps(fake_llm_json)

    async def _fake_rag(conditions, modalities, *, top_k=10, db_session=None):
        # Return only the first 3 fake refs to prove numbering starts at 1 and
        # respects the returned count.
        return _FAKE_RAG[:3]

    with mock.patch(
        "app.services.chat_service._llm_chat_async", side_effect=_fake_llm
    ), mock.patch(
        "app.services.qeeg_rag.query_literature", side_effect=_fake_rag
    ):
        result = _run(qeeg_ai_interpreter.generate_ai_report(
            features=_features_contract_1_1(),
            zscores={
                "spectral": {},
                "flagged": [
                    {"metric": "spectral.bands.theta.absolute_uv2", "channel": "Fz", "z": 2.81},
                ],
                "norm_db_version": "toy-0.1",
            },
            flagged_conditions=["adhd"],
            quality={
                "n_channels_input": 19,
                "n_channels_rejected": 1,
                "bad_channels": ["T7"],
                "n_epochs_total": 60,
                "n_epochs_retained": 52,
                "ica_components_dropped": 3,
                "ica_labels_dropped": {"eye": 2, "muscle": 1},
                "pipeline_version": "0.1.0",
            },
            patient_context="Male, 12y, inattentive presentation",
            condition_matches=[],
            report_type="standard",
        ))

    # ── literature_refs at top-level, numbering starts at 1 ────────────────
    assert "literature_refs" in result
    refs = result["literature_refs"]
    assert isinstance(refs, list) and len(refs) == 3
    assert refs[0]["n"] == 1
    assert refs[1]["n"] == 2
    assert refs[2]["n"] == 3
    # URL selection: PMID > DOI > empty
    assert refs[0]["url"] == "https://pubmed.ncbi.nlm.nih.gov/30000001/"
    assert refs[1]["url"] == "https://pubmed.ncbi.nlm.nih.gov/30000002/"
    assert refs[2]["url"] == "https://doi.org/10.1/nfb-adhd"  # no pmid → falls back to DOI

    # ── Banned-word sanitiser fired on exec summary + findings[*].observation ─
    data = result["data"]
    lower_exec = data["executive_summary"].lower()
    assert "diagnose" not in lower_exec
    assert "diagnosis" not in lower_exec
    assert "treatment recommendation" not in lower_exec
    assert "protocol consideration" in lower_exec  # replacement happened

    for f in data["findings"]:
        obs_lower = f["observation"].lower()
        assert "diagnose" not in obs_lower
        assert "diagnosis" not in obs_lower
        assert "diagnostic" not in obs_lower
        # Citations survive intact.
        assert "[" in f["observation"]

    # Numbered citations survive in exec summary.
    assert "[1]" in data["executive_summary"]

    # CONTRACT §5.4 top-level keys
    assert set(result.keys()) >= {
        "data", "literature_refs", "prompt_hash", "model_used", "source", "success",
    }


def test_generate_ai_report_legacy_band_powers_path_still_works():
    """Legacy callers passing only band_powers= should still get a valid report."""
    from app.services import qeeg_ai_interpreter

    fake_llm_json = {
        "executive_summary": "Elevated Cz TBR suggests attention dysregulation [1].",
        "findings": [
            {"region": "central", "band": "theta", "observation": "Cz TBR=3.4 [1]", "citations": [1]},
        ],
        "band_analysis": {},
        "key_biomarkers": {},
        "condition_correlations": [],
        "protocol_recommendations": [],
        "clinical_flags": [],
        "confidence_level": "moderate",
        "disclaimer": "For research/wellness reference only.",
    }

    async def _fake_llm(**kwargs):
        return json.dumps(fake_llm_json)

    async def _fake_rag(conditions, modalities, *, top_k=10, db_session=None):
        return _FAKE_RAG[:2]

    with mock.patch(
        "app.services.chat_service._llm_chat_async", side_effect=_fake_llm
    ), mock.patch(
        "app.services.qeeg_rag.query_literature", side_effect=_fake_rag
    ):
        result = _run(qeeg_ai_interpreter.generate_ai_report(
            band_powers=_legacy_band_powers(),
            flagged_conditions=["adhd"],
            report_type="standard",
        ))

    assert result["success"] is True
    assert result["source"] == "llm"
    assert len(result["literature_refs"]) == 2
    assert result["literature_refs"][0]["n"] == 1
    assert result["data"]["executive_summary"].startswith("Elevated")


def test_match_condition_patterns_accepts_both_shapes():
    """match_condition_patterns should work with legacy band_powers AND CONTRACT §1.1 features."""
    from app.services import qeeg_ai_interpreter

    # Legacy shape
    legacy_matches = qeeg_ai_interpreter.match_condition_patterns(_legacy_band_powers())
    assert isinstance(legacy_matches, list)

    # CONTRACT §1.1 shape — should be adapted internally
    features_matches = qeeg_ai_interpreter.match_condition_patterns(_features_contract_1_1())
    assert isinstance(features_matches, list)

    # Both shapes should produce non-error output (may or may not yield matches
    # depending on CSV content, but must return a list without raising).


def test_modality_map_resolves_to_top_3_modalities():
    """_modalities_for_conditions picks up to 3 unique modalities."""
    from app.services.qeeg_ai_interpreter import _modalities_for_conditions, MODALITY_MAP

    assert "adhd" in MODALITY_MAP
    mods = _modalities_for_conditions(["adhd"])
    assert len(mods) == 3
    assert all(isinstance(m, str) for m in mods)

    # Unknown condition → default modalities (not empty)
    default_mods = _modalities_for_conditions(["totally_unknown_condition"])
    assert len(default_mods) == 3


def test_literature_refs_url_prefers_pmid_over_doi():
    """URL builder: PMID wins, then DOI, then empty."""
    from app.services.qeeg_ai_interpreter import _build_literature_refs

    refs = _build_literature_refs([
        {"pmid": "12345", "doi": "10.1/a", "title": "A", "year": 2020},
        {"pmid": None,    "doi": "10.1/b", "title": "B", "year": 2021},
        {"pmid": None,    "doi": None,     "title": "C", "year": 2022},
    ])
    assert refs[0]["url"] == "https://pubmed.ncbi.nlm.nih.gov/12345/"
    assert refs[1]["url"] == "https://doi.org/10.1/b"
    assert refs[2]["url"] == ""
    assert [r["n"] for r in refs] == [1, 2, 3]


def test_empty_rag_result_yields_empty_literature_refs():
    """No refs returned from RAG → empty literature_refs but still valid report."""
    from app.services import qeeg_ai_interpreter

    fake_llm_json = {
        "executive_summary": "No specific findings.",
        "findings": [],
        "band_analysis": {},
        "key_biomarkers": {},
        "condition_correlations": [],
        "protocol_recommendations": [],
        "clinical_flags": [],
        "confidence_level": "low",
        "disclaimer": "For research/wellness reference only.",
    }

    async def _fake_llm(**kwargs):
        return json.dumps(fake_llm_json)

    async def _fake_rag(conditions, modalities, *, top_k=10, db_session=None):
        return []

    with mock.patch(
        "app.services.chat_service._llm_chat_async", side_effect=_fake_llm
    ), mock.patch(
        "app.services.qeeg_rag.query_literature", side_effect=_fake_rag
    ):
        result = _run(qeeg_ai_interpreter.generate_ai_report(
            features=_features_contract_1_1(),
            flagged_conditions=["adhd"],
            report_type="standard",
        ))

    assert result["literature_refs"] == []
    assert result["data"]["findings"] == []


def test_deterministic_fallback_when_llm_returns_empty():
    """Empty LLM response → deterministic fallback payload with literature_refs preserved."""
    from app.services import qeeg_ai_interpreter

    async def _empty_llm(**kwargs):
        return ""

    async def _fake_rag(conditions, modalities, *, top_k=10, db_session=None):
        return _FAKE_RAG[:2]

    with mock.patch(
        "app.services.chat_service._llm_chat_async", side_effect=_empty_llm
    ), mock.patch(
        "app.services.qeeg_rag.query_literature", side_effect=_fake_rag
    ):
        result = _run(qeeg_ai_interpreter.generate_ai_report(
            features=_features_contract_1_1(),
            flagged_conditions=["adhd"],
            report_type="standard",
        ))

    assert result["source"] == "deterministic_stub"
    assert result["model_used"] is None
    assert len(result["literature_refs"]) == 2
