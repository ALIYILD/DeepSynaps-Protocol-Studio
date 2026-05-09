"""Repo-native local knowledge bundle loader for AI grounding.

This service reads the generated knowledge assets checked into
``data/courseware/knowledge-kb`` and distils them into a compact prompt block
that can be injected into general Studio AI surfaces.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[4]
KB_ROOT = REPO_ROOT / "data" / "courseware" / "knowledge-kb"
INDEX_PATH = KB_ROOT / "index.json"
COURSE_PATH = KB_ROOT / "qeeg-certificate-course.json"
RESEARCH_PATH = KB_ROOT / "qeeg-course-research-library.json"
SESSIONS_PATH = KB_ROOT / "qeeg-germany-session-library.json"


def _read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


@lru_cache(maxsize=1)
def load_local_knowledge_bundle() -> dict[str, Any]:
    """Return the repo-native knowledge bundle as a single dict."""
    return {
        "index": _read_json(INDEX_PATH),
        "courseware": _read_json(COURSE_PATH),
        "research": _read_json(RESEARCH_PATH),
        "sessions": _read_json(SESSIONS_PATH),
    }


def _score_text(haystack: str, needles: list[str]) -> int:
    score = 0
    for needle in needles:
        if needle and needle in haystack:
            score += 1
    return score


def search_local_knowledge(query: str, limit: int = 6) -> list[dict[str, Any]]:
    """Search courseware modules and research items using simple lexical ranking."""
    text = (query or "").strip().lower()
    if not text:
        return []
    needles = [part for part in text.split() if part]
    bundle = load_local_knowledge_bundle()
    rows: list[tuple[int, dict[str, Any]]] = []

    for module in bundle.get("courseware", {}).get("teaching_modules", []) or []:
        if not isinstance(module, dict):
            continue
        haystack = " ".join(
            [
                str(module.get("title", "")),
                str(module.get("summary", "")),
                " ".join(str(tag) for tag in module.get("focus_tags", [])[:6]),
                str(module.get("clinical_use", "")),
            ]
        ).lower()
        score = _score_text(haystack, needles)
        if text in haystack:
            score += 3
        if score:
            rows.append(
                (
                    score,
                    {
                        "kind": "courseware_module",
                        "resource_slug": bundle.get("courseware", {}).get("resource_slug"),
                        "title": module.get("title"),
                        "summary": module.get("summary"),
                        "tags": module.get("focus_tags", []),
                    },
                )
            )

    for item in bundle.get("research", {}).get("research_items", []) or []:
        if not isinstance(item, dict):
            continue
        haystack = " ".join(
            [
                str(item.get("title", "")),
                str(item.get("summary", "")),
                str(item.get("search_preview", "")),
                " ".join(str(tag) for tag in item.get("topical_tags", [])[:8]),
            ]
        ).lower()
        score = _score_text(haystack, needles)
        if text in haystack:
            score += 3
        if score:
            rows.append(
                (
                    score,
                    {
                        "kind": "research_item",
                        "resource_slug": bundle.get("research", {}).get("resource_slug"),
                        "title": item.get("title"),
                        "summary": item.get("summary"),
                        "year": item.get("year"),
                        "tags": item.get("topical_tags", []),
                    },
                )
            )

    rows.sort(
        key=lambda pair: (
            -pair[0],
            -int(pair[1].get("year") or 0),
            str(pair[1].get("title") or "").lower(),
        )
    )
    return [item for _, item in rows[: max(limit, 1)]]


def get_local_knowledge_summary() -> dict[str, Any]:
    """Return high-level stats for the checked-in local knowledge corpus."""
    bundle = load_local_knowledge_bundle()
    courseware = bundle.get("courseware", {})
    research = bundle.get("research", {})
    sessions = bundle.get("sessions", {})
    return {
        "resource_count": len(bundle.get("index", {}).get("resources", []) or []),
        "courseware_modules": len(courseware.get("teaching_modules", []) or []),
        "research_items": len(research.get("research_items", []) or []),
        "session_count": sessions.get("session_count") or 0,
        "asset_count": sessions.get("asset_count") or 0,
        "resource_slugs": [
            str(resource.get("resource_slug"))
            for resource in bundle.get("index", {}).get("resources", []) or []
            if isinstance(resource, dict) and resource.get("resource_slug")
        ],
    }


def render_local_knowledge_prompt(query: str, limit: int = 4) -> str:
    """Render a compact prompt-safe block from the local knowledge corpus."""
    matches = search_local_knowledge(query, limit=limit)
    if matches:
        rows = []
        for item in matches:
            title = str(item.get("title") or "Untitled")
            summary = str(item.get("summary") or "").strip()
            if len(summary) > 180:
                summary = summary[:177].rstrip() + "..."
            if item.get("kind") == "research_item":
                year = item.get("year") or "n.d."
                rows.append(f"- Research: {title} ({year}) — {summary}")
            else:
                rows.append(f"- Courseware: {title} — {summary}")
        return "\n".join(rows)

    summary = get_local_knowledge_summary()
    return "\n".join(
        [
            "- Local qEEG courseware bundle is available in-repo for grounding.",
            (
                f"- Corpus snapshot: {summary['courseware_modules']} teaching modules, "
                f"{summary['research_items']} local research items, "
                f"{summary['session_count']} anonymized session summaries."
            ),
            "- Prefer repo-native courseware and local paper summaries when relevant before falling back to generic model knowledge.",
        ]
    )
