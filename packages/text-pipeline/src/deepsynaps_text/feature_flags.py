"""Environment-driven feature flags for clinical text pipeline (pilot / prod toggles)."""

from __future__ import annotations

import os
from dataclasses import dataclass


def _truthy(name: str, default: bool = False) -> bool:
    v = os.environ.get(name)
    if v is None:
        return default
    return v.strip().lower() in ("1", "true", "yes", "on")


@dataclass(frozen=True)
class TextPipelineFeatureFlags:
    """Kill switches and pilot modes — read from env at load time."""

    persist_runs_to_disk: bool
    run_store_dir: str | None
    disable_llm_tasks: bool
    force_rules_entity_backend: bool


def load_text_pipeline_feature_flags() -> TextPipelineFeatureFlags:
    """
    Environment variables:

    - ``DEEPSYNAPS_TEXT_PERSIST_RUNS`` — save :class:`TextPipelineRun` to disk (default false).
    - ``DEEPSYNAPS_TEXT_RUN_STORE_DIR`` — directory for JSON run files (required if persist true).
    - ``DEEPSYNAPS_TEXT_DISABLE_LLM`` — reserved for future LLM pipeline nodes (default false).
    - ``DEEPSYNAPS_TEXT_RULES_ONLY_NLP`` — force ``rule`` entity backend (default false).
    """
    persist = _truthy("DEEPSYNAPS_TEXT_PERSIST_RUNS")
    store_dir = os.environ.get("DEEPSYNAPS_TEXT_RUN_STORE_DIR") or None
    if persist and not store_dir:
        raise ValueError(
            "DEEPSYNAPS_TEXT_PERSIST_RUNS is set but DEEPSYNAPS_TEXT_RUN_STORE_DIR is missing.",
        )
    return TextPipelineFeatureFlags(
        persist_runs_to_disk=persist,
        run_store_dir=store_dir,
        disable_llm_tasks=_truthy("DEEPSYNAPS_TEXT_DISABLE_LLM"),
        force_rules_entity_backend=_truthy("DEEPSYNAPS_TEXT_RULES_ONLY_NLP"),
    )
