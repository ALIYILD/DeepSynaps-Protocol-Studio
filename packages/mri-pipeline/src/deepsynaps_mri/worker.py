"""
Celery worker — enqueues long-running MRI pipelines off the API process.

The broker URL is taken from ``CELERY_BROKER_URL`` (default Redis on
localhost). One task: ``run_pipeline_job``. It instantiates the pipeline,
writes MRIReport via db.save_report, and returns the analysis_id.
"""
from __future__ import annotations

import logging
import os

from celery import Celery

from . import db as db_mod
from .pipeline import run_pipeline
from .schemas import PatientMeta

log = logging.getLogger(__name__)

BROKER = os.environ.get("CELERY_BROKER_URL", "redis://localhost:6379/0")
BACKEND = os.environ.get("CELERY_RESULT_BACKEND", "redis://localhost:6379/1")

celery_app = Celery("deepsynaps_mri", broker=BROKER, backend=BACKEND)
celery_app.conf.update(
    task_track_started=True,
    task_time_limit=60 * 60 * 4,      # 4h hard limit
    worker_prefetch_multiplier=1,
)


@celery_app.task(bind=True, name="deepsynaps_mri.run_pipeline_job")
def run_pipeline_job(self, session_dir: str, patient_dict: dict,
                     out_dir: str, condition: str = "mdd") -> dict:
    """Run the pipeline, persist, return {analysis_id, pdf, html}."""
    patient = PatientMeta.model_validate(patient_dict)
    self.update_state(state="PROGRESS", meta={"stage": "starting"})
    report = run_pipeline(session_dir, patient, out_dir, condition=condition)
    db_mod.save_report(report)
    return {
        "analysis_id": str(report.analysis_id),
        "html": report.report_html_s3,
        "pdf": report.report_pdf_s3,
    }
