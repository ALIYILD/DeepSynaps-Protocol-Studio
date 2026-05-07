#!/usr/bin/env python3
"""Post-deploy qEEG smoke test for staging/production.

Flow:
1. Create a temporary patient
2. Upload a qEEG recording
3. Trigger ``/analyze-mne``
4. Poll until completed/failed
5. Call ``/report-pdf``

Use this after deploy to prove the real API + worker + report stack.
"""
from __future__ import annotations

import argparse
import json
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

import httpx


def _make_synthetic_edf() -> Path:
    try:
        import mne
        import numpy as np
    except Exception as exc:  # pragma: no cover
        raise RuntimeError(
            "mne and numpy are required to synthesize an EDF; "
            "pass --edf-path instead"
        ) from exc

    tmpdir = Path(tempfile.mkdtemp(prefix="qeeg-smoke-"))
    edf_path = tmpdir / "synthetic_qeeg.edf"
    sfreq = 250.0
    secs = 60
    ch_names = [
        "Fp1", "Fp2", "F7", "F3", "Fz", "F4", "F8", "T3", "C3", "Cz",
        "C4", "T4", "T5", "P3", "Pz", "P4", "T6", "O1", "O2",
    ]
    info = mne.create_info(ch_names, sfreq, ch_types="eeg")
    t = np.arange(int(sfreq * secs)) / sfreq
    sig = np.vstack([
        20e-6 * np.sin(2 * np.pi * 10 * t + i * 0.1)
        + 8e-6 * np.sin(2 * np.pi * 6 * t)
        + 2e-6 * np.random.default_rng(42 + i).standard_normal(t.shape[0])
        for i in range(len(ch_names))
    ])
    raw = mne.io.RawArray(sig, info, verbose="ERROR")
    raw.set_montage("standard_1020", on_missing="ignore")
    mne.export.export_raw(edf_path, raw, fmt="edf", overwrite=True)
    return edf_path


def _expect(resp: httpx.Response, expected: int, context: str) -> dict[str, Any]:
    if resp.status_code != expected:
        raise RuntimeError(
            f"{context} failed: HTTP {resp.status_code} {resp.text[:600]}"
        )
    return resp.json()


def main() -> int:
    parser = argparse.ArgumentParser(description="Run deployed qEEG smoke test")
    parser.add_argument("--base-url", required=True, help="API base URL, e.g. https://deepsynaps-studio.fly.dev")
    parser.add_argument("--token", required=True, help="Clinician bearer token")
    parser.add_argument("--edf-path", help="Existing EDF/BDF/FIF file to upload")
    parser.add_argument("--timeout-sec", type=int, default=180, help="Poll timeout for async analysis")
    parser.add_argument("--require-pdf", action="store_true", help="Fail if report route does not generate a PDF")
    args = parser.parse_args()

    edf_path = Path(args.edf_path) if args.edf_path else _make_synthetic_edf()
    if not edf_path.exists():
        raise RuntimeError(f"EDF path does not exist: {edf_path}")

    headers = {"Authorization": f"Bearer {args.token}"}
    base_url = args.base_url.rstrip("/")

    with httpx.Client(base_url=base_url, headers=headers, timeout=60.0) as client:
        patient_payload = {
            "first_name": "qEEG",
            "last_name": "Smoke",
            "dob": "1990-01-01",
            "gender": "F",
        }
        patient = _expect(
            client.post("/api/v1/patients", json=patient_payload),
            201,
            "create patient",
        )
        patient_id = patient["id"]

        with edf_path.open("rb") as fh:
            upload = _expect(
                client.post(
                    "/api/v1/qeeg-analysis/upload",
                    data={"patient_id": patient_id, "eyes_condition": "awake_ec"},
                    files={"file": (edf_path.name, fh, "application/octet-stream")},
                ),
                201,
                "upload qEEG file",
            )
        analysis_id = upload["id"]

        analyze = _expect(
            client.post(f"/api/v1/qeeg-analysis/{analysis_id}/analyze-mne"),
            200,
            "queue qEEG analysis",
        )
        if analyze.get("execution_mode") != "celery":
            raise RuntimeError(
                f"expected execution_mode=celery, got {analyze.get('execution_mode')!r}"
            )

        deadline = time.time() + args.timeout_sec
        final_payload: dict[str, Any] | None = None
        while time.time() < deadline:
            poll = _expect(
                client.get(f"/api/v1/qeeg-analysis/{analysis_id}"),
                200,
                "poll qEEG analysis",
            )
            status = poll.get("analysis_status")
            if status in {"completed", "failed"}:
                final_payload = poll
                break
            time.sleep(2)

        if final_payload is None:
            raise RuntimeError("analysis poll timed out before completion")
        if final_payload.get("analysis_status") != "completed":
            raise RuntimeError(
                f"analysis finished in non-completed state: {json.dumps(final_payload)[:800]}"
            )

        report = _expect(
            client.post(f"/api/v1/qeeg-viz/{analysis_id}/report-pdf"),
            200,
            "generate qEEG report",
        )
        if not report.get("html_generated"):
            raise RuntimeError("report route succeeded but html_generated was false")
        if args.require_pdf and not report.get("pdf_generated"):
            raise RuntimeError("report route did not generate a PDF in a PDF-required smoke run")

    summary = {
        "patient_id": patient_id,
        "analysis_id": analysis_id,
        "execution_mode": analyze.get("execution_mode"),
        "queue_job_id": analyze.get("queue_job_id"),
        "analysis_status": final_payload.get("analysis_status"),
        "pipeline_version": final_payload.get("pipeline_version"),
        "norm_db_version": final_payload.get("norm_db_version"),
        "report_html_generated": report.get("html_generated"),
        "report_pdf_generated": report.get("pdf_generated"),
    }
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"qEEG deploy smoke failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
