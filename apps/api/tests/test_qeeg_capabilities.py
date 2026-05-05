from __future__ import annotations

import re
from typing import Any


def _get_json(client) -> dict[str, Any]:
    resp = client.get("/api/v1/qeeg/capabilities")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert isinstance(data["generated_at"], str) and data["generated_at"]
    assert isinstance(data["features"], list) and data["features"]
    return data


def test_qeeg_capabilities_endpoint_returns_200(client):
    data = _get_json(client)
    ids = {f["id"] for f in data["features"]}
    # Minimal smoke: contract-required ids exist.
    for required in (
        "mne_ingest",
        "pyprep_preprocess",
        "ica",
        "iclabel",
        "autoreject",
        "spectral_bandpower",
        "specparam",
        "paf",
        "coherence",
        "wpli",
        "graph_metrics",
        "source_localization",
        "source_roi_bandpower",
        "normative_zscore",
        "gamlss_norms",
        "report_html",
        "report_pdf",
        "visual_topomaps",
        "live_streaming_lsl",
        "rag_literature",
        "recommender",
        "ai_adjacents",
        "wineeg_reference_library",
    ):
        assert required in ids


def test_qeeg_capabilities_wineeg_reference_is_reference_only(client):
    data = _get_json(client)
    wineeg = data["wineeg_reference"]
    assert wineeg["status"] == "reference_only"
    assert wineeg["native_file_ingestion"] is False
    assert "No native WinEEG compatibility" in (wineeg.get("caveat") or "")

    # Also verify the feature row.
    row = next(f for f in data["features"] if f["id"] == "wineeg_reference_library")
    assert row["status"] == "reference_only"


def test_qeeg_capabilities_normative_db_is_labeled_toy_or_configured(client, monkeypatch):
    # Baseline should be either toy/configured/unavailable; ensure it is one of these.
    data = _get_json(client)
    assert data["normative_database"]["status"] in {"toy", "configured", "unavailable"}

    # When a normative CSV path is configured and readable, status must be configured.
    # (The endpoint intentionally does NOT claim configured when the path is missing.)
    from pathlib import Path
    import tempfile

    with tempfile.NamedTemporaryFile(prefix="toy_norms_", suffix=".csv", delete=False) as fp:
        fp.write(b"age,sex,feature,mean,std\n30,m,alpha,1.0,0.1\n")
        fp.flush()
        norm_path = fp.name

    monkeypatch.setenv("DEEPSYNAPS_QEEG_NORM_CSV_PATH", norm_path)
    data2 = _get_json(client)
    assert data2["normative_database"]["status"] == "configured"
    assert data2["normative_database"]["version"]

    try:
        Path(norm_path).unlink(missing_ok=True)
    except Exception:
        pass


def test_qeeg_capabilities_missing_optional_deps_report_unavailable(client, monkeypatch):
    # Simulate that optional deps do not exist even if installed in the env.
    import importlib.util as _iu

    real_find_spec = _iu.find_spec

    def fake_find_spec(name: str, *args, **kwargs):
        if name in {
            "pyprep",
            "mne_icalabel",
            "autoreject",
            "specparam",
            "mne_connectivity",
            "networkx",
            "nibabel",
            "pandas",
            "weasyprint",
            "matplotlib",
            "psycopg",
            "pylsl",
            "pcntk",
            "torch",
            "captum",
        }:
            return None
        return real_find_spec(name, *args, **kwargs)

    monkeypatch.setattr(_iu, "find_spec", fake_find_spec)

    data = _get_json(client)
    idx = {f["id"]: f for f in data["features"]}

    assert idx["pyprep_preprocess"]["status"] in {"fallback", "unavailable"}
    assert idx["iclabel"]["status"] == "unavailable"
    assert idx["autoreject"]["status"] == "unavailable"
    assert idx["specparam"]["status"] == "unavailable"
    assert idx["coherence"]["status"] in {"unavailable", "fallback"}
    assert idx["wpli"]["status"] in {"unavailable", "fallback"}
    assert idx["graph_metrics"]["status"] in {"unavailable", "fallback"}
    assert idx["report_pdf"]["status"] == "unavailable"
    assert idx["visual_topomaps"]["status"] in {"unavailable", "fallback"}
    assert idx["rag_literature"]["status"] in {"unavailable", "fallback"}
    assert idx["live_streaming_lsl"]["status"] in {"unavailable", "experimental"}
    assert idx["gamlss_norms"]["status"] in {"unavailable", "experimental"}


def test_qeeg_capabilities_no_secrets_exposed(client, monkeypatch):
    # Inject a fake token-like env var and ensure it is not echoed back.
    monkeypatch.setenv("NETLIFY_AUTH_TOKEN", "shh-secret-token")
    monkeypatch.setenv("FLY_ACCESS_TOKEN", "shh-secret-token-2")

    data = _get_json(client)
    txt = str(data)
    assert "shh-secret-token" not in txt
    assert "shh-secret-token-2" not in txt

    # Also ensure no generic token patterns appear in notes (defensive).
    assert not re.search(r"AKIA[0-9A-Z]{16}", txt)

