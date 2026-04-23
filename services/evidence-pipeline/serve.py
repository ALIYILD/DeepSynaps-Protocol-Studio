"""Minimal HTTP API over evidence.db. Localhost only — stdlib only, zero deps.

Endpoints:
    GET /health
    GET /indications
    GET /papers?q=FTS&slug=rtms_mdd&grade=A&oa=1&limit=20
    GET /trials?slug=rtms_mdd&status=RECRUITING&limit=20
    GET /devices?slug=rtms_mdd&applicant=Neuronetics&limit=20
    GET /adverse?brand=NeuroStar&limit=20

Run:
    python3 serve.py            # 127.0.0.1:8811
    PORT=9000 python3 serve.py

Not production — this is a local read-only service for DeepSynaps Studio's
internal dev loop. Front-ends should call the Studio's `apps/api` in prod.
"""
from __future__ import annotations

import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, str(Path(__file__).parent))
import db
import query as q

PORT = int(os.environ.get("PORT", "8811"))
HOST = os.environ.get("HOST", "127.0.0.1")  # localhost only, explicit


def _rows_to_dicts(rows):
    return [dict(r) for r in rows]


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        sys.stderr.write("[serve] " + (fmt % args) + "\n")

    def _write_json(self, status: int, payload) -> None:
        body = json.dumps(payload, ensure_ascii=False, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "http://localhost:*")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):  # noqa: N802
        u = urlparse(self.path)
        params = {k: v[0] for k, v in parse_qs(u.query).items()}
        path = u.path.rstrip("/") or "/"
        try:
            conn = db.connect()

            if path == "/health":
                counts = {
                    "papers": conn.execute("SELECT count(*) FROM papers").fetchone()[0],
                    "trials": conn.execute("SELECT count(*) FROM trials").fetchone()[0],
                    "devices": conn.execute("SELECT count(*) FROM devices").fetchone()[0],
                    "adverse_events": conn.execute("SELECT count(*) FROM adverse_events").fetchone()[0],
                    "indications": conn.execute("SELECT count(*) FROM indications").fetchone()[0],
                }
                return self._write_json(200, {"ok": True, "counts": counts})

            if path == "/indications":
                rows = conn.execute(
                    "SELECT id, slug, label, modality, condition, evidence_grade, regulatory FROM indications ORDER BY slug"
                ).fetchall()
                return self._write_json(200, _rows_to_dicts(rows))

            if path == "/papers":
                rows = q.search_papers(
                    conn,
                    text=params.get("q"),
                    slug=params.get("slug"),
                    grade=params.get("grade"),
                    oa_only=params.get("oa") in {"1", "true"},
                    limit=int(params.get("limit", 20)),
                )
                return self._write_json(200, _rows_to_dicts(rows))

            if path == "/trials":
                rows = q.search_trials(
                    conn,
                    text=params.get("q"),
                    slug=params.get("slug"),
                    status=params.get("status"),
                    limit=int(params.get("limit", 20)),
                )
                return self._write_json(200, _rows_to_dicts(rows))

            if path == "/devices":
                rows = q.search_devices(
                    conn,
                    slug=params.get("slug"),
                    applicant=params.get("applicant"),
                    limit=int(params.get("limit", 20)),
                )
                return self._write_json(200, _rows_to_dicts(rows))

            if path == "/adverse":
                brand = params.get("brand")
                limit = int(params.get("limit", 20))
                where = []
                args = []
                if brand:
                    where.append("device_brand LIKE ?")
                    args.append(f"%{brand}%")
                sql = "SELECT mdr_report_key, device_brand, event_type, date_received FROM adverse_events"
                if where:
                    sql += " WHERE " + " AND ".join(where)
                sql += " ORDER BY date_received DESC LIMIT ?"
                args.append(limit)
                return self._write_json(200, _rows_to_dicts(conn.execute(sql, args).fetchall()))

            self._write_json(404, {"error": "unknown route", "path": path})
        except Exception as e:
            self._write_json(500, {"error": str(e)})


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"serving evidence.db at http://{HOST}:{PORT} — Ctrl-C to stop", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()


if __name__ == "__main__":
    main()
