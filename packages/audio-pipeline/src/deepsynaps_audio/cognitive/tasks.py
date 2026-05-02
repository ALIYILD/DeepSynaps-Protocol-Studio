"""Per-task cognitive subscores (picture description, semantic / phonemic fluency)."""

from __future__ import annotations

from typing import Any, Mapping

from ..schemas import Session


def task_subscores(session: Session) -> Mapping[str, Any]:
    """Per-task cognitive subscores keyed by ``task_protocol`` slug.

    TODO: v2 module — different feature subsets are diagnostic for
    different tasks (e.g. semantic-cluster size for category fluency,
    information-unit count for picture description). Return a dict
    mapping task slug → typed subscore object.
    """

    raise NotImplementedError(
        "cognitive.tasks.task_subscores: v2 module — see AUDIO_ANALYZER_STACK.md §7."
    )
