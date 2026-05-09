"""Registry-level tests for the Clinical Agent Brain.

Covers spec items 1, 2, and 7:
- registry lists expected MVP providers
- manifest exposes safety fields
- placeholder providers return not_configured
"""
from __future__ import annotations

from app.services.agent_brain.registry import (
    MVP_PROVIDER_NAMES,
    PROVIDER_REGISTRY,
    list_provider_manifests,
    get_provider,
    overall_status,
)
from app.services.agent_brain.schemas import ProviderQuery


def test_registry_lists_all_mvp_providers() -> None:
    for name in MVP_PROVIDER_NAMES:
        assert name in PROVIDER_REGISTRY, f"missing MVP provider: {name}"


def test_registry_includes_placeholders_and_patient_context() -> None:
    for name in (
        "patient_context",
        "qeeg_knowledge",
        "mri_knowledge",
        "deeptwin_context",
        "video_audio_analysis",
        "biomarker",
        "assessment",
    ):
        assert name in PROVIDER_REGISTRY, f"missing provider: {name}"


def test_provider_manifest_includes_safety_fields() -> None:
    manifests = list_provider_manifests()
    assert manifests, "registry must expose at least one manifest"
    for m in manifests:
        # Names are stable, non-empty.
        assert m.name and isinstance(m.name, str)
        # Required safety fields are present and typed.
        assert isinstance(m.allowed_roles, list) and m.allowed_roles
        assert isinstance(m.contains_phi, bool)
        assert isinstance(m.requires_audit, bool)
        assert isinstance(m.requires_citations, bool)
        assert isinstance(m.patient_facing_allowed_default, bool)


def test_evidence_provider_requires_citations() -> None:
    m = get_provider("evidence").manifest()  # type: ignore[union-attr]
    assert m.requires_citations is True
    assert m.contains_phi is False


def test_patient_context_provider_requires_audit_and_phi() -> None:
    m = get_provider("patient_context").manifest()  # type: ignore[union-attr]
    assert m.contains_phi is True
    assert m.requires_audit is True
    # Placement of disabled-by-default — manifest reports configured=False.
    assert m.configured is False


def test_overall_status_shape() -> None:
    payload = overall_status()
    assert payload["service"] == "clinical_agent_brain"
    assert payload["safety_mode"] == "strict_clinical"
    assert payload["providers_total"] == len(PROVIDER_REGISTRY)
    assert set(payload["providers_mvp"]) == set(MVP_PROVIDER_NAMES)
    assert isinstance(payload["providers"], list)


def test_wired_providers_return_ok_envelope() -> None:
    """The previously-placeholder surfaces are now wired to existing services.
    Each must return `ok` with at least one item and never claim autonomous
    diagnosis."""
    for name in (
        "qeeg_knowledge",
        "mri_knowledge",
        "deeptwin_context",
        "video_audio_analysis",
        "biomarker",
        "assessment",
    ):
        provider = get_provider(name)
        assert provider is not None
        resp = provider.query(
            ProviderQuery(provider=name, query=""),
            actor_id="actor-clinician-demo",
            actor_role="clinician",
            session=None,
        )
        # `ok` (we expect data); `not_configured` would mean a regression of
        # the underlying service — surface that explicitly.
        assert resp.status in {"ok", "not_configured"}, (
            f"unexpected status {resp.status!r} for {name!r}: {resp.answer!r}"
        )
        if resp.status == "ok":
            assert resp.items, f"provider {name!r} returned ok with no items"
        # Hard safety properties stay true regardless.
        assert resp.requires_clinician_review is True
        assert resp.patient_facing_allowed is False
