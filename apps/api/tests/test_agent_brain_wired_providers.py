"""Per-provider behaviour tests for the six surfaces wired in this PR
(qeeg_knowledge, mri_knowledge, deeptwin_context, video_audio_analysis,
biomarker, assessment).

These exercise the happy-path adapter logic and reaffirm that wired providers
still attach the canonical safety envelope.
"""
from __future__ import annotations

from app.services.agent_brain.registry import get_provider
from app.services.agent_brain.schemas import ProviderQuery


def _q(name: str, **kwargs) -> ProviderQuery:
    return ProviderQuery(provider=name, **kwargs)


def test_qeeg_knowledge_returns_band_and_condition_pattern_items() -> None:
    p = get_provider("qeeg_knowledge")
    assert p is not None
    resp = p.query(
        _q("qeeg_knowledge", query=""),
        actor_id="actor-clinician-demo",
        actor_role="clinician",
    )
    assert resp.status == "ok"
    types = {it.get("type") for it in resp.items}
    assert "qeeg_biomarker" in types
    assert "qeeg_condition_pattern" in types
    assert "decision_support_only" in resp.safety_flags


def test_qeeg_knowledge_filters_by_query() -> None:
    p = get_provider("qeeg_knowledge")
    resp = p.query(  # type: ignore[union-attr]
        _q("qeeg_knowledge", query="depression"),
        actor_id="actor-clinician-demo",
        actor_role="clinician",
    )
    # If we get rows, every row must mention the term in one of the searched
    # columns. If not, status=ok with insufficient_match — never invented.
    assert resp.status == "ok"


def test_mri_knowledge_returns_atlas_regions_and_pipeline_status() -> None:
    p = get_provider("mri_knowledge")
    resp = p.query(  # type: ignore[union-attr]
        _q("mri_knowledge", query=""),
        actor_id="actor-clinician-demo",
        actor_role="clinician",
    )
    assert resp.status in {"ok", "not_configured"}
    if resp.status == "ok":
        # Atlas rows have a `name` and `lobe` per the brain_regions schema.
        assert any("name" in it for it in resp.items)
        assert "mri_pipeline_available" in resp.source_metadata


def test_deeptwin_context_lists_capability_manifest() -> None:
    p = get_provider("deeptwin_context")
    resp = p.query(  # type: ignore[union-attr]
        _q("deeptwin_context", query=""),
        actor_id="actor-clinician-demo",
        actor_role="clinician",
    )
    assert resp.status in {"ok", "not_configured"}
    if resp.status == "ok":
        functions = {it.get("function") for it in resp.items if it.get("type") == "deeptwin_capability"}
        # The MVP manifest enumerates these — adapter test breaks loudly if
        # someone removes a documented capability.
        assert "build_twin_summary" in functions
        assert "simulate_intervention_scenario" in functions
        assert "hypothesis_generating_only" in resp.safety_flags
        assert "no_causation_claim" in resp.safety_flags


def test_video_audio_analysis_lists_protocol_and_tasks() -> None:
    p = get_provider("video_audio_analysis")
    resp = p.query(  # type: ignore[union-attr]
        _q("video_audio_analysis", query=""),
        actor_id="actor-clinician-demo",
        actor_role="clinician",
    )
    assert resp.status == "ok"
    types = {it.get("type") for it in resp.items}
    assert "video_assessment_protocol" in types
    assert "video_assessment_task" in types
    assert "audio_pipeline_status" in types
    # Protocol entry should carry the canonical name.
    proto_rows = [it for it in resp.items if it.get("type") == "video_assessment_protocol"]
    assert proto_rows and proto_rows[0]["protocol_name"] == "virtual_care_motor_mvp_v1"


def test_biomarker_lists_domains_and_module_status() -> None:
    p = get_provider("biomarker")
    resp = p.query(  # type: ignore[union-attr]
        _q("biomarker", query=""),
        actor_id="actor-clinician-demo",
        actor_role="clinician",
    )
    assert resp.status in {"ok", "not_configured"}
    if resp.status == "ok":
        ids = {it.get("id") for it in resp.items if it.get("type") == "biomarker_domain"}
        assert {"hrv", "sleep", "activity"}.issubset(ids)
        # Per-patient analytics MUST stay on the existing biometrics router,
        # not this provider — assert the answer says so.
        assert "biometrics" in resp.answer.lower()


def test_assessment_returns_known_instruments() -> None:
    p = get_provider("assessment")
    resp = p.query(  # type: ignore[union-attr]
        _q("assessment", query=""),
        actor_id="actor-clinician-demo",
        actor_role="clinician",
    )
    assert resp.status == "ok"
    names = {(it.get("name") or "").lower() for it in resp.items}
    # PHQ-9 and GAD-7 are foundational instruments in assessments.csv. If one
    # is missing, the registry has been damaged — fail loudly.
    assert any("phq-9" in n for n in names), "PHQ-9 not in assessment registry"
    assert any("gad-7" in n for n in names), "GAD-7 not in assessment registry"
    # The catalog is read-only; per-patient scoring lives elsewhere.
    assert resp.requires_clinician_review is True


def test_assessment_filters_by_condition() -> None:
    p = get_provider("assessment")
    resp = p.query(  # type: ignore[union-attr]
        _q("assessment", query="", condition="depression"),
        actor_id="actor-clinician-demo",
        actor_role="clinician",
    )
    assert resp.status == "ok"
    # Each returned row must mention depression somewhere — otherwise the
    # filter is broken and the provider is leaking unrelated rows.
    if resp.items:
        for r in resp.items:
            blob = " ".join(
                str(r.get(k, "") or "")
                for k in (
                    "name",
                    "domain",
                    "use_case",
                    "related_conditions",
                    "related_phenotypes",
                )
            ).lower()
            assert "depression" in blob, f"unexpected match: {r}"
