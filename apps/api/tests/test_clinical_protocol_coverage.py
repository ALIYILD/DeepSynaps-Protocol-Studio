"""Critical protocol linkage invariants (see clinical_protocol_coverage)."""

from app.services.clinical_data import EXPECTED_COUNTS, EXPECTED_TOTAL_RECORDS, load_clinical_dataset
from app.services.clinical_protocol_coverage import (
    CRITICAL_CONDITION_MODALITY_PAIRS,
    assert_critical_protocol_coverage,
)


def test_expected_total_matches_sum_of_table_counts() -> None:
    assert EXPECTED_TOTAL_RECORDS == sum(EXPECTED_COUNTS.values())


def test_critical_condition_modality_pairs_have_protocol_rows() -> None:
    bundle = load_clinical_dataset()
    assert_critical_protocol_coverage(bundle.tables)
    present = {(p["Condition_ID"], p["Modality_ID"]) for p in bundle.tables["protocols"]}
    for pair in CRITICAL_CONDITION_MODALITY_PAIRS:
        assert pair in present
