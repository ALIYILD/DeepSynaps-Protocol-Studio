"""
Postgres adapter for the MRI Analyzer.

Reuses the DeepSynaps Studio DB (same Postgres instance used by the qEEG
analyzer + MedRAG paper store). Adds two concerns:

* write/read of ``mri_analyses`` (MRIReport JSONB + pgvector embedding)
* thin helper to run a MedRAGQuery against kg_entities via SQL

The heavy retrieval is delegated to the existing qEEG MedRAG module at
``deepsynaps_qeeg_analyzer/medrag/src/retrieval.py`` — we only need an
ergonomic wrapper here.
"""
from __future__ import annotations

import json
import logging
import os
from contextlib import contextmanager
from typing import Iterator
from uuid import UUID

from .schemas import MRIReport

log = logging.getLogger(__name__)

DEFAULT_DSN = os.environ.get("DEEPSYNAPS_DSN", "postgresql://localhost:5432/deepsynaps")


@contextmanager
def connect(dsn: str | None = None) -> Iterator[object]:
    """Yields a psycopg3 connection with pgvector types registered."""
    import psycopg
    from pgvector.psycopg import register_vector

    conn = psycopg.connect(dsn or DEFAULT_DSN, autocommit=False)
    try:
        register_vector(conn)
        yield conn
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# MRI analysis persistence
# ---------------------------------------------------------------------------
def save_report(report: MRIReport, embedding: list[float] | None = None,
                dsn: str | None = None) -> UUID:
    """Insert an MRIReport row into ``mri_analyses`` and return its id.

    Table schema lives in ``medrag_extensions/04_migration_mri.sql`` — this
    function assumes that migration has been applied.
    """
    import psycopg
    from pgvector.psycopg import Vector

    payload = report.model_dump(mode="json")

    with connect(dsn) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO mri_analyses (
                  analysis_id, patient_id,
                  modalities_present,
                  structural, functional, diffusion,
                  stim_targets, medrag_query, overlays,
                  qc, pipeline_version, norm_db_version,
                  embedding
                ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                RETURNING analysis_id;
                """,
                (
                    str(report.analysis_id),
                    report.patient.patient_id,
                    [m.value for m in report.modalities_present],
                    psycopg.types.json.Jsonb(payload.get("structural")),
                    psycopg.types.json.Jsonb(payload.get("functional")),
                    psycopg.types.json.Jsonb(payload.get("diffusion")),
                    psycopg.types.json.Jsonb(payload.get("stim_targets", [])),
                    psycopg.types.json.Jsonb(payload.get("medrag_query", {})),
                    psycopg.types.json.Jsonb(payload.get("overlays", {})),
                    psycopg.types.json.Jsonb(payload.get("qc", {})),
                    report.pipeline_version,
                    report.norm_db_version,
                    Vector(embedding) if embedding is not None else None,
                ),
            )
            new_id = cur.fetchone()[0]
        conn.commit()
    return new_id


def load_report(analysis_id: str | UUID, dsn: str | None = None) -> MRIReport:
    with connect(dsn) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT payload_json FROM mri_analyses WHERE analysis_id = %s;
                """,
                (str(analysis_id),),
            )
            row = cur.fetchone()
    if not row:
        raise LookupError(f"analysis_id {analysis_id} not found")
    return MRIReport.model_validate(row[0])
