"""Pytest config for worker tests.

Adds `apps/worker` to sys.path so `app.jobs` (the worker's `app` package, not
the api's `app` package) is importable without an editable install. We
intentionally do NOT chain into the api conftest — those tests boot the
FastAPI app and pin DEEPSYNAPS_APP_ENV=test, both of which would corrupt the
environment-based assertions exercised here.
"""
from __future__ import annotations

import sys
from pathlib import Path

WORKER_ROOT = Path(__file__).resolve().parents[1]
if str(WORKER_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKER_ROOT))
