"""Repo-native qEEG course research library search utilities."""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[5]
RESEARCH_LIBRARY_PATH = (
    REPO_ROOT / "data" / "courseware" / "knowledge-kb" / "qeeg-course-research-library.json"
)


def _coerce_text(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False)


@lru_cache(maxsize=1)
def _load_payload() -> dict[str, object]:
    if not RESEARCH_LIBRARY_PATH.exists():
        return {"research_items": []}
    try:
        return json.loads(RESEARCH_LIBRARY_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {"research_items": []}


class LocalResearchAtlas:
    """Read-only access to the generated local qEEG course research library."""

    @staticmethod
    def all_items() -> list[dict[str, object]]:
        payload = _load_payload()
        items = payload.get("research_items")
        if isinstance(items, list):
            return items
        return []

    @staticmethod
    def top_items(limit: int = 5) -> list[dict[str, object]]:
        if limit <= 0:
            return []
        return LocalResearchAtlas.all_items()[:limit]


def search_local_research(query: str, limit: int = 5) -> list[dict[str, object]]:
    """Return simple ranked matches from the local qEEG course research library."""
    text = (query or "").strip().lower()
    if not text:
        return []
    needles = [part for part in text.split() if part]
    scored: list[tuple[int, dict[str, object]]] = []
    for item in LocalResearchAtlas.all_items():
        haystack = " ".join(
            [
                _coerce_text(item.get("title")),
                _coerce_text(item.get("summary")),
                _coerce_text(item.get("search_preview")),
                " ".join(str(tag) for tag in item.get("topical_tags", [])),
            ]
        ).lower()
        score = 0
        for needle in needles:
            if needle in haystack:
                score += 1
        if text in haystack:
            score += 3
        if score:
            scored.append((score, item))
    scored.sort(
        key=lambda pair: (
            -pair[0],
            -int(pair[1].get("year") or 0),
            str(pair[1].get("title", "")).lower(),
        )
    )
    return [item for _, item in scored[: max(limit, 1)]]


def local_research_prompt_block(limit: int = 4) -> str:
    """Render a short bullet list of available local research anchors."""
    rows = []
    for item in LocalResearchAtlas.top_items(limit=limit):
        title = str(item.get("title", "Untitled"))
        year = item.get("year") or "n.d."
        tags = ", ".join(str(tag) for tag in item.get("topical_tags", [])[:3])
        rows.append(f"- {title} ({year}) [{tags}]")
    return "\n".join(rows) if rows else "(none)"
