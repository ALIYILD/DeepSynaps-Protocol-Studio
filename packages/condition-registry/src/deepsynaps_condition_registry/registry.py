import json
from pathlib import Path

from deepsynaps_core_schema import ConditionProfile


DATA_DIR = Path(__file__).resolve().parents[4] / "data" / "conditions"


def get_condition_profile(slug: str) -> ConditionProfile:
    record_path = DATA_DIR / f"{slug}.json"
    payload = json.loads(record_path.read_text(encoding="utf-8"))
    return ConditionProfile.model_validate(payload)
