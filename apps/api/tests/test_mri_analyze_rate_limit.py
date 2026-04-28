"""Regression test: mri_analysis /analyze + /upload have rate limits.

Pre-fix ``mri_analysis_router.py`` had **zero** rate limits. A
clinician could POST 10 000 ``/analyze`` jobs in a tight loop, each
writing a row + audit + (in non-demo) enqueuing a real pipeline run.
No queue-depth check, no cost ceiling.

Post-fix the two cost endpoints carry ``@limiter.limit("10/minute")``
(per-IP). This is a static-source assertion so the test doesn't
depend on TestClient's IP-rate-limit timing (which is flaky).
"""
from __future__ import annotations

import inspect

from app.routers import mri_analysis_router as m


def test_analyze_mri_decorated_with_rate_limit() -> None:
    src = inspect.getsource(m.analyze_mri)
    # The @limiter.limit decorator binds before @router.post, so
    # inspect.getsource on the route handler (router.post returns
    # the original function unchanged) should still show the
    # decorator stack at the top of the source block.
    # Easiest: read the surrounding source for the route registration.
    full = inspect.getsource(m)
    analyze_idx = full.find("async def analyze_mri")
    assert analyze_idx >= 0
    pre = full[max(0, analyze_idx - 200):analyze_idx]
    assert "@limiter.limit" in pre, (
        "/analyze must be decorated with @limiter.limit to bound the "
        "MRI pipeline cost — pre-fix there was no rate limit at all."
    )


def test_upload_mri_decorated_with_rate_limit() -> None:
    full = inspect.getsource(m)
    upload_idx = full.find("async def upload_mri")
    assert upload_idx >= 0
    pre = full[max(0, upload_idx - 200):upload_idx]
    assert "@limiter.limit" in pre, (
        "/upload must be decorated with @limiter.limit — uploads "
        "trigger I/O and audit writes that should be bounded."
    )
