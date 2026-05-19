"""Phase 4 — NeuroSimo stub: never available, always reports False."""
from __future__ import annotations


def test_has_neurosimo_is_false():
    from app.services.neuroimaging.neurosimo_stub import HAS_NEUROSIMO
    assert HAS_NEUROSIMO is False
