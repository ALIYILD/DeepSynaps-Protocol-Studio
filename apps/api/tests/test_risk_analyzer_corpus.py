"""Risk Analyzer ↔ evidence intelligence target mapping."""
from app.services.evidence_intelligence import TARGET_CONCEPTS, normalize_target_name
from app.services.risk_analyzer_payload import RISK_LITERATURE_TARGETS


def test_risk_literature_targets_exist_in_concepts() -> None:
    for _cat, target in RISK_LITERATURE_TARGETS.items():
        n = normalize_target_name(target)
        assert n in TARGET_CONCEPTS, f"missing TARGET_CONCEPTS key for {target} (normalized: {n})"
