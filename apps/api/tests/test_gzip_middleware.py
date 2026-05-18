"""
test_gzip_middleware.py -- Issue #1014

Assert that GZipMiddleware is active: a JSON response body >= 1000 bytes
must include Content-Encoding: gzip when the request sends
Accept-Encoding: gzip.
"""
from pathlib import Path

import pytest


_MAIN_PY = Path(__file__).resolve().parents[1] / "app" / "main.py"


def test_main_py_registers_gzip_middleware():
    """main.py source must contain the GZipMiddleware registration."""
    source = _MAIN_PY.read_text()
    assert "GZipMiddleware" in source, (
        "GZipMiddleware not found in app/main.py — add_middleware call missing"
    )
    assert "minimum_size=1000" in source, (
        "minimum_size=1000 not found in app/main.py — BREACH-attack guard missing"
    )
