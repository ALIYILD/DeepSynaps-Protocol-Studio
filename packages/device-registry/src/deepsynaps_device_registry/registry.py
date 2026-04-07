import json
from pathlib import Path

from deepsynaps_core_schema import DeviceProfile


DATA_DIR = Path(__file__).resolve().parents[4] / "data" / "devices"


def get_device_profile(slug: str) -> DeviceProfile:
    record_path = DATA_DIR / f"{slug}.json"
    payload = json.loads(record_path.read_text(encoding="utf-8"))
    return DeviceProfile.model_validate(payload)
