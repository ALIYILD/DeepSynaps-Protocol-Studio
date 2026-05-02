"""Postgres writer for the ``audio_analyses`` table.

Schema mirrors ``qeeg_analyses`` and ``mri_analyses`` so the portal
can render a unified longitudinal timeline per patient. See
``CLAUDE.md`` for the SQL DDL.
"""

from __future__ import annotations

from .schemas import ReportBundle


def write_audio_analysis(bundle: ReportBundle) -> str:
    """Persist a :class:`ReportBundle` into ``audio_analyses`` and return the row id.

    TODO: implement in PR #4 alongside
    ``medrag_extensions/06_migration_audio.sql``. Use the same
    ``psycopg`` + ``sqlalchemy`` stack as ``deepsynaps_qeeg.db`` /
    ``deepsynaps_mri.db``. Stamp ``pipeline_version``,
    ``model_versions``, ``norm_db_version``, ``file_hash`` on every
    row.
    """

    raise NotImplementedError(
        "db.write_audio_analysis: implement in PR #4 "
        "(see AUDIO_ANALYZER_STACK.md §9)."
    )
