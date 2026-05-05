from __future__ import annotations

from app.qeeg.registry import build_registry


def test_qeeg_105_registry_has_105_unique_codes() -> None:
    reg = build_registry()
    codes = [a.code for a in reg.analyses]
    assert len(codes) == 105
    assert len(set(codes)) == 105

