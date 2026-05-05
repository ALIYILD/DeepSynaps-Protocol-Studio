from __future__ import annotations


def test_qeeg_105_registry_has_105_unique_codes_with_tier_and_status() -> None:
    from app.qeeg.registry import list_analyses

    analyses = list_analyses()
    assert len(analyses) == 105
    codes = [a.code for a in analyses]
    assert len(set(codes)) == 105

    for a in analyses:
        assert isinstance(a.code, str) and a.code.strip()
        assert getattr(a, "tier", None) is not None
        assert getattr(a, "status", None) is not None
        assert a.tier.value in {"T1", "T2", "T3"}
        assert isinstance(a.status.value, str) and a.status.value.strip()

