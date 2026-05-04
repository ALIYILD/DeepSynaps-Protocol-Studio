"""Postgres writers for ``video_analyses``, ``video_clips``, and the MedRAG bridge.

Mirrors the writer pattern in ``deepsynaps_mri/db.py``. Connections use the
shared ``deepsynaps`` Postgres from ``deepsynaps_db/``; pgvector is required
for the embedding column.
"""

from __future__ import annotations

from .schemas import VideoAnalysisReport


def save_video_analysis(report: VideoAnalysisReport) -> str:
    """Insert a ``video_analyses`` row and return the row UUID.

    TODO(impl): SQLAlchemy session, JSONB columns for ``tasks``,
    ``monitoring_events``, ``longitudinal``; embedding stays NULL until the
    video foundation-model bundle ships in v1.3.
    """

    _ = report
    raise NotImplementedError


def bridge_to_medrag(report: VideoAnalysisReport) -> None:
    """Insert ``kg_entities`` rows for new biomarkers / events found in this
    analysis, and ``kg_relations`` rows linking biomarkers to candidate
    conditions.

    TODO(impl): see ``medrag_extensions/06_migration_video.sql`` for the
    target schema.
    """

    _ = report
    raise NotImplementedError


__all__ = ["bridge_to_medrag", "save_video_analysis"]
