"""
Postgres adapter for the MRI Analyzer.

Persists :class:`~deepsynaps_mri.schemas.MRIReport` rows into ``mri_analyses``
using the **same column layout** as ``apps/api`` Alembic migration ``039``
(``*_json`` ``Text`` blobs). This replaces the legacy insert shape that targeted
``medrag_extensions/04_migration_mri.sql`` only.

Standalone CLI / Celery workers should set ``DATABASE_URL`` or ``DEEPSYNAPS_DSN``
to the same Postgres URL as the Studio API when sharing one database.

Environment:

* ``DEEPSYNAPS_DSN`` — preferred by historical callers
* ``DATABASE_URL`` — Studio API convention (used if ``DEEPSYNAPS_DSN`` unset)
"""
from __future__ import annotations

import json
import logging
import os
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterator
from uuid import UUID

from .schemas import MRIReport, Modality, PatientMeta, Sex

log = logging.getLogger(__name__)

DEFAULT_DSN = os.environ.get(
    "DEEPSYNAPS_DSN",
    os.environ.get("DATABASE_URL", "postgresql://localhost:5432/deepsynaps"),
)


@contextmanager
def connect(dsn: str | None = None) -> Iterator[Any]:
    """Yields a psycopg3 connection; registers pgvector types when available."""
    import psycopg

    conn = psycopg.connect(dsn or DEFAULT_DSN, autocommit=False)
    try:
        try:
            from pgvector.psycopg import register_vector

            register_vector(conn)
        except ImportError:
            pass
        yield conn
    finally:
        conn.close()


def _dump_json_blob(value: Any) -> str | None:
    if value is None:
        return None
    return json.dumps(value, default=str)


def save_report(
    report: MRIReport,
    embedding: list[float] | None = None,
    *,
    dsn: str | None = None,
    state: str = "SUCCESS",
) -> UUID:
    """Insert or update one ``mri_analyses`` row (Studio schema).

    Uses ``ON CONFLICT (analysis_id) DO UPDATE`` so Celery retries and CLI
    re-runs remain idempotent for the same ``analysis_id``.
    """
    payload = report.model_dump(mode="json")
    pid = report.patient.patient_id
    age = report.patient.age
    sex_val = report.patient.sex.value if report.patient.sex else None

    modalities_present_json = _dump_json_blob([m.value for m in report.modalities_present])
    structural_json = _dump_json_blob(payload.get("structural"))
    functional_json = _dump_json_blob(payload.get("functional"))
    diffusion_json = _dump_json_blob(payload.get("diffusion"))
    stim_targets_json = _dump_json_blob(payload.get("stim_targets", []))
    medrag_query_json = _dump_json_blob(payload.get("medrag_query", {}))
    overlays_json = _dump_json_blob(payload.get("overlays", {}))
    qc_json = _dump_json_blob(payload.get("qc", {}))
    embedding_json = _dump_json_blob(embedding) if embedding is not None else None

    analysis_str = str(report.analysis_id)
    created = datetime.now(timezone.utc)

    with connect(dsn) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO mri_analyses (
                  analysis_id, patient_id, created_at,
                  modalities_present_json, structural_json, functional_json, diffusion_json,
                  stim_targets_json, medrag_query_json, overlays_json, qc_json,
                  embedding_json,
                  pipeline_version, norm_db_version,
                  age, sex, state
                ) VALUES (
                  %s, %s, %s,
                  %s, %s, %s, %s,
                  %s, %s, %s, %s,
                  %s,
                  %s, %s,
                  %s, %s, %s
                )
                ON CONFLICT (analysis_id) DO UPDATE SET
                  patient_id = EXCLUDED.patient_id,
                  modalities_present_json = EXCLUDED.modalities_present_json,
                  structural_json = EXCLUDED.structural_json,
                  functional_json = EXCLUDED.functional_json,
                  diffusion_json = EXCLUDED.diffusion_json,
                  stim_targets_json = EXCLUDED.stim_targets_json,
                  medrag_query_json = EXCLUDED.medrag_query_json,
                  overlays_json = EXCLUDED.overlays_json,
                  qc_json = EXCLUDED.qc_json,
                  embedding_json = EXCLUDED.embedding_json,
                  pipeline_version = EXCLUDED.pipeline_version,
                  norm_db_version = EXCLUDED.norm_db_version,
                  age = EXCLUDED.age,
                  sex = EXCLUDED.sex,
                  state = EXCLUDED.state
                RETURNING analysis_id;
                """,
                (
                    analysis_str,
                    pid,
                    created,
                    modalities_present_json,
                    structural_json,
                    functional_json,
                    diffusion_json,
                    stim_targets_json,
                    medrag_query_json,
                    overlays_json,
                    qc_json,
                    embedding_json,
                    str(report.pipeline_version)[:16],
                    str(report.norm_db_version)[:16],
                    age,
                    sex_val,
                    state,
                ),
            )
            new_id = cur.fetchone()[0]
        conn.commit()
    return UUID(str(new_id))


def load_report(analysis_id: str | UUID, dsn: str | None = None) -> MRIReport:
    """Load an ``MRIReport`` from ``mri_analyses`` (Studio columns)."""
    with connect(dsn) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT analysis_id, patient_id, age, sex,
                       modalities_present_json, structural_json, functional_json, diffusion_json,
                       stim_targets_json, medrag_query_json, overlays_json, qc_json,
                       pipeline_version, norm_db_version
                FROM mri_analyses WHERE analysis_id = %s
                """,
                (str(analysis_id),),
            )
            row = cur.fetchone()
    if not row:
        raise LookupError(f"analysis_id {analysis_id} not found")

    def _loads(raw: str | None) -> Any:
        if raw is None or raw == "":
            return None
        return json.loads(raw)

    # 0 analysis_id, 1 patient_id, 2 age, 3 sex,
    # 4 modalities, 5 structural, 6 functional, 7 diffusion,
    # 8 stim_targets, 9 medrag_query, 10 overlays, 11 qc,
    # 12 pipeline_version, 13 norm_db_version
    _aid, patient_id, age, sex_s = row[0], row[1], row[2], row[3]
    modalities_raw = _loads(row[4]) or []
    modalities: list[Modality] = []
    for m in modalities_raw:
        try:
            modalities.append(Modality(str(m)))
        except ValueError:
            log.warning("skip unknown modality %r", m)

    sex_enum = None
    if sex_s:
        try:
            sx = str(sex_s).strip().upper()
            if sx in {"F", "M", "O"}:
                sex_enum = Sex(sx)
            elif sx == "OTHER":
                sex_enum = Sex.OTHER
        except ValueError:
            sex_enum = None

    patient = PatientMeta(
        patient_id=str(patient_id),
        age=int(age) if age is not None else None,
        sex=sex_enum,
    )

    qc = _loads(row[11]) or {}
    medrag_q = _loads(row[9]) or {}
    if isinstance(medrag_q, list):
        medrag_q = {"findings": [], "conditions": []}
    if not isinstance(medrag_q, dict):
        medrag_q = {"findings": [], "conditions": []}

    data: dict[str, Any] = {
        "analysis_id": _aid if isinstance(_aid, UUID) else UUID(str(_aid)),
        "patient": patient,
        "modalities_present": modalities,
        "qc": qc,
        "structural": _loads(row[5]),
        "functional": _loads(row[6]),
        "diffusion": _loads(row[7]),
        "stim_targets": _loads(row[8]) or [],
        "medrag_query": medrag_q,
        "overlays": _loads(row[10]) or {},
        "pipeline_version": row[12] or "0.1.0",
        "norm_db_version": row[13] or "ISTAGING-v1",
        "qc_warnings": [],
        "clinical_summary": {},
        "saved_evidence_citations": [],
    }

    return MRIReport.model_validate(data)
