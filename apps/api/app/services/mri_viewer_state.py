"""MRI viewer state persistence service (Phase 2 feature).

Handles saving and retrieving per-user viewer state (slice position, ROI
visibility, overlay alpha, etc.) for resumable MRI analysis viewing sessions.

Added 2026-05-09 as part of MRI DeepDive Phase 2/4 (Backend + DB).
"""
from __future__ import annotations

import json
import logging
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.persistence.models import MriViewerState

_log = logging.getLogger(__name__)


def save_viewer_state(
    db: Session,
    analysis_id: str,
    user_id: str,
    state: dict[str, Any],
) -> MriViewerState:
    """Save or update viewer state for a user × analysis pair.

    Parameters
    ----------
    db : Session
        SQLAlchemy session.
    analysis_id : str
        MRI analysis UUID.
    user_id : str
        User ID.
    state : dict
        Viewer state payload (slice_index, roi_visibility, overlay_alpha, etc.).

    Returns
    -------
    MriViewerState
        The saved or updated model instance.
    """
    existing = db.query(MriViewerState).filter_by(
        analysis_id=analysis_id, user_id=user_id
    ).first()

    state_json = json.dumps(state)

    if existing:
        existing.state_json = state_json
        db.flush()
        _log.info(
            "Updated viewer state for analysis=%s user=%s",
            analysis_id,
            user_id,
        )
    else:
        new_state = MriViewerState(
            analysis_id=analysis_id,
            user_id=user_id,
            state_json=state_json,
        )
        db.add(new_state)
        db.flush()
        _log.info(
            "Created viewer state for analysis=%s user=%s",
            analysis_id,
            user_id,
        )
        existing = new_state

    return existing


def get_viewer_state(
    db: Session,
    analysis_id: str,
    user_id: str,
) -> Optional[dict[str, Any]]:
    """Retrieve saved viewer state for a user × analysis pair.

    Parameters
    ----------
    db : Session
        SQLAlchemy session.
    analysis_id : str
        MRI analysis UUID.
    user_id : str
        User ID.

    Returns
    -------
    dict or None
        Parsed state_json if found, else None.
    """
    row = db.query(MriViewerState).filter_by(
        analysis_id=analysis_id, user_id=user_id
    ).first()

    if not row:
        return None

    if not row.state_json:
        return None

    try:
        return json.loads(row.state_json)
    except (json.JSONDecodeError, ValueError) as exc:
        _log.warning(
            "Failed to parse viewer state for analysis=%s user=%s: %s",
            analysis_id,
            user_id,
            exc,
        )
        return None
