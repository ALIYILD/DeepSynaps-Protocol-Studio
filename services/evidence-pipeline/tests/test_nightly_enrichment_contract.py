from __future__ import annotations

from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "scripts" / "nightly-enrichment.sh"


def test_nightly_defaults_to_uncapped_routing() -> None:
    text = SCRIPT_PATH.read_text()
    assert 'ROUTE_TOP="${ROUTE_TOP:-0}"' in text
    assert "step 5/13 route_indications.py --clear --top $ROUTE_TOP" in text


def test_nightly_reroutes_after_missing_trial_ingest() -> None:
    text = SCRIPT_PATH.read_text()
    assert 'step 9/13 ingest_missing_trials.py --limit 100' in text
    assert 'step 10/13 route_indications.py --clear --top $ROUTE_TOP' in text


def test_nightly_avoids_all_trials_and_repairs_protocols() -> None:
    text = SCRIPT_PATH.read_text()
    assert '--source trials --all-trials' not in text
    assert 'repair_paper_protocols' in text
    assert 'repair_ctgov_protocols' in text
