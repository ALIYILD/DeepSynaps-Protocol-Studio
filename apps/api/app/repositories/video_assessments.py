"""Repository layer for Video Assessment data access.

Exposes model classes and query helpers used by video_assessment_router.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.persistence.models import Patient, User, VideoAssessmentSession

__all__ = ["Patient", "User", "VideoAssessmentSession"]


def get_video_session(db: Session, session_id: str) -> VideoAssessmentSession | None:
    return db.query(VideoAssessmentSession).filter(VideoAssessmentSession.id == session_id).first()
