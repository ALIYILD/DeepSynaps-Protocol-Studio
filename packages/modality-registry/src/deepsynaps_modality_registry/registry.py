import json
from pathlib import Path

from deepsynaps_core_schema import ModalityProfile


DATA_DIR = Path(__file__).resolve().parents[4] / "data" / "modalities"


def get_modality_profile(slug: str) -> ModalityProfile:
    record_path = DATA_DIR / f"{slug}.json"
    payload = json.loads(record_path.read_text(encoding="utf-8"))
    return ModalityProfile.model_validate(payload)
