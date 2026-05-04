"""Seed MedRAG ``kg_entities`` with the Video Analyzer's biomarker + event types.

Run after ``06_migration_video.sql``. Idempotent — uses ``ON CONFLICT DO
NOTHING`` on the entity natural key.

TODO(impl): connect to the shared ``deepsynaps`` Postgres, INSERT one row per
biomarker in ``constants.MOVEMENT_BIOMARKERS`` and one row per event in
``constants.MONITORING_EVENTS``. Also INSERT the canonical relations
``movement_biomarker_for``, ``task_validates_biomarker``,
``monitoring_event_for``, ``video_proxy_of``.
"""

from __future__ import annotations


def main() -> int:
    raise NotImplementedError


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
