"""
Tests for scripts/perf-gate.sh.

Spins up a tiny stdlib HTTP server on a random port, runs the script
against it, and checks that perf-results.json contains the expected keys
with sane numeric values.
"""
import json
import os
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[3] / "scripts" / "perf-gate.sh"


class _HealthHandler(BaseHTTPRequestHandler):
    """Returns 200 OK immediately for every GET /health request."""

    def do_GET(self):  # noqa: N802
        body = b'{"status":"ok"}'
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_):
        pass  # silence server output during tests


def _start_server() -> tuple[HTTPServer, int]:
    server = HTTPServer(("127.0.0.1", 0), _HealthHandler)
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, port


def test_perf_gate_produces_json_with_expected_keys(tmp_path):
    """Script must write perf-results.json with p50_ms, p95_ms, p99_ms, samples."""
    server, port = _start_server()
    try:
        results_path = tmp_path / "perf-results.json"
        env = {**os.environ, "PERF_RESULTS_FILE": str(results_path), "PERF_N": "5"}
        result = subprocess.run(
            ["bash", str(SCRIPT), f"http://127.0.0.1:{port}"],
            capture_output=True,
            text=True,
            timeout=60,
            env=env,
        )
        assert result.returncode == 0, (
            f"Script exited {result.returncode}\nstdout: {result.stdout}\nstderr: {result.stderr}"
        )
        assert results_path.exists(), "perf-results.json was not created"
        data = json.loads(results_path.read_text())
        for key in ("p50_ms", "p95_ms", "p99_ms", "samples"):
            assert key in data, f"Missing key '{key}' in {data}"
        assert data["samples"] == 5
        assert 0 < data["p50_ms"] < 5000
        assert data["p50_ms"] <= data["p95_ms"] <= data["p99_ms"]
        # Stdout table must contain percentile labels
        assert "p50" in result.stdout
        assert "p95" in result.stdout
        assert "p99" in result.stdout
    finally:
        server.shutdown()
