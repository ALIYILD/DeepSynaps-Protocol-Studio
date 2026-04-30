from __future__ import annotations

import json
from functools import lru_cache
from importlib import resources
from typing import Any

_REQUIRED_WORKFLOW_CATEGORIES = (
    "recording_setup",
    "impedance",
    "montage",
    "filters",
    "artifact_marking",
    "ica_pca",
    "events_and_labels",
    "spectra",
    "band_power",
    "asymmetry",
    "coherence",
    "average_coherence",
    "interaction_diagrams",
    "bispectrum_bicoherence",
    "erp_sync",
    "source_analysis_loreta",
    "reporting",
)


@lru_cache(maxsize=1)
def load_wineeg_reference_library() -> dict[str, Any]:
    raw = resources.files(__package__).joinpath("wineeg_reference_library.json").read_text(
        encoding="utf-8"
    )
    return json.loads(raw)


def required_workflow_categories() -> tuple[str, ...]:
    return _REQUIRED_WORKFLOW_CATEGORIES


def validate_wineeg_reference_library(data: dict[str, Any] | None = None) -> dict[str, Any]:
    library = data or load_wineeg_reference_library()
    categories = {
        str(item.get("category"))
        for item in library.get("workflows", [])
        if isinstance(item, dict) and item.get("category")
    }
    missing = [cat for cat in _REQUIRED_WORKFLOW_CATEGORIES if cat not in categories]
    return {
        "valid": not missing and library.get("native_file_ingestion") is False,
        "missing_categories": missing,
        "native_file_ingestion": library.get("native_file_ingestion"),
    }


def manual_analysis_checklist() -> list[dict[str, Any]]:
    library = load_wineeg_reference_library()
    lookup = {item["category"]: item for item in library.get("workflows", []) if isinstance(item, dict)}
    ordered = [
        ("recording_setup", "Confirm recording metadata, condition, and preservation of original raw EEG."),
        ("impedance", "Check impedance status or explicitly document that impedance data is unavailable."),
        ("montage", "Confirm current montage and reference before asymmetry or coherence review."),
        ("filters", "Review high-pass, low-pass, notch, and resampling settings."),
        ("artifact_marking", "Mark blink, muscle, movement, line-noise, and flat/electrode-pop artifacts."),
        ("ica_pca", "Review ICA/PCA cleanup support and document any accepted removals."),
        ("events_and_labels", "Add event markers or segment labels relevant to interpretation."),
        ("spectra", "Inspect spectra and topographic context after quality control."),
        ("band_power", "Review absolute and relative band power with state and medication caveats."),
        ("asymmetry", "Check asymmetry only after montage and artifact review."),
        ("coherence", "Check coherence only after adequate artifact and channel quality review."),
        ("reporting", "Write manual findings with channels, bands, confounds, and clinician note."),
    ]
    items: list[dict[str, Any]] = []
    for category, action in ordered:
        row = lookup.get(category, {})
        items.append(
            {
                "category": category,
                "title": row.get("title", category.replace("_", " ").title()),
                "action": action,
                "safety_notes": list(row.get("safety_notes", [])),
            }
        )
    return items


def format_wineeg_workflow_context(max_workflows: int = 6, max_concepts: int = 4) -> str:
    library = load_wineeg_reference_library()
    workflows = library.get("workflows", [])[:max_workflows]
    concepts = library.get("concepts", [])[:max_concepts]
    lines = [
        "WinEEG-style workflow reference only.",
        "Do not claim native WinEEG compatibility or equivalence.",
        "Decision-support only. Clinician review required.",
    ]
    if workflows:
        lines.append("Workflow hints:")
        for item in workflows:
            if not isinstance(item, dict):
                continue
            lines.append(
                f"- {item.get('title', 'Workflow')}: {item.get('description', '')}".strip()
            )
    if concepts:
        lines.append("Concept reminders:")
        for item in concepts:
            if not isinstance(item, dict):
                continue
            caveats = item.get("caveats", [])
            caveat = f" Caveat: {caveats[0]}" if caveats else ""
            lines.append(f"- {item.get('label', 'Concept')}: {item.get('summary', '')}{caveat}")
    return "\n".join(lines)
