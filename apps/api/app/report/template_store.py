"""Load built-in JSON templates shipped under app/report/templates/."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

_DIR = Path(__file__).resolve().parent / "templates"


@lru_cache(maxsize=32)
def load_builtin_template(template_id: str) -> dict:
    path = _DIR / f"{template_id}.json"
    if not path.is_file():
        raise FileNotFoundError(template_id)
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def list_builtin_templates() -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    if not _DIR.is_dir():
        return out
    for p in sorted(_DIR.glob("*.json")):
        try:
            with p.open(encoding="utf-8") as f:
                data = json.load(f)
            out.append(
                {
                    "id": data.get("id", p.stem),
                    "title": data.get("title", p.stem),
                    "defaultRenderer": data.get("defaultRenderer", "internal"),
                }
            )
        except json.JSONDecodeError:
            continue
    return out
