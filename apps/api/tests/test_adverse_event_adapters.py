from __future__ import annotations

from app.adapters.meddra_adapter import MedDRAAdapter
from app.services.knowledge.adapters.faers_adapter import FAERSAdapter
from app.services.knowledge.adverse_event_inventory import build_adverse_event_inventory


def test_faers_adapter_imports_and_instantiates() -> None:
    adapter = FAERSAdapter({})
    assert adapter.source_name == "FAERS"
    assert adapter.source_version


def test_meddra_adapter_is_represented_as_terminology_mapping() -> None:
    adapter = MedDRAAdapter()
    rows = {row["key"]: row for row in build_adverse_event_inventory()}
    assert adapter.display_name.lower().startswith("meddra")
    assert rows["meddra"]["source_kind"] == "terminology"
    assert rows["meddra"]["lifecycle_state"] == "healthy"
