from __future__ import annotations
"""DeepSynaps evidence DB — minimal stdio MCP server (no external deps).

Implements the MCP 2024-11-05 subset Claude Code actually uses:
  - initialize
  - tools/list
  - tools/call

Register once with:
    claude mcp add deepsynaps-evidence -s user -- python3 \
        /Users/<you>/Desktop/DeepSynaps-Protocol-Studio/services/evidence-pipeline/mcp_server.py

Exposed tools:
  evidence_list_indications
  evidence_query_papers   (q?, slug?, grade?, oa_only?, limit?)
  evidence_query_trials   (slug?, status?, q?, limit?)
  evidence_query_devices  (slug?, applicant?, limit?)
  evidence_health
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import db
import query as q


PROTOCOL_VERSION = "2024-11-05"
SERVER_INFO = {"name": "deepsynaps-evidence", "version": "0.1.0"}


TOOLS = [
    {
        "name": "evidence_list_indications",
        "description": "List every indication in the DeepSynaps evidence DB with its slug, modality, condition, and curated evidence grade (A-E).",
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "evidence_query_papers",
        "description": "Search papers in the evidence DB. Returns rows ranked by an informed score (publication-type tier + log-citations + recency + OA bonus). Every row has pmid, doi, title, year, journal, cited_by_count, is_oa, oa_url.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "q": {"type": "string", "description": "FTS5 query over title/abstract. Supports NEAR, OR, AND."},
                "slug": {"type": "string", "description": "Filter to one indication slug (e.g. 'rtms_mdd')."},
                "grade": {"type": "string", "enum": ["A", "B", "C", "D", "E"]},
                "oa_only": {"type": "boolean", "default": False},
                "limit": {"type": "integer", "default": 15, "minimum": 1, "maximum": 100},
            },
            "additionalProperties": False,
        },
    },
    {
        "name": "evidence_query_trials",
        "description": "Search ClinicalTrials.gov-registered trials in the evidence DB. Each row preserves the full intervention JSON, which is the richest open source of actual stimulation parameters (Hz, µs, mA, sessions).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "q": {"type": "string"},
                "slug": {"type": "string"},
                "status": {"type": "string", "description": "e.g. RECRUITING, COMPLETED, ACTIVE_NOT_RECRUITING"},
                "limit": {"type": "integer", "default": 15, "minimum": 1, "maximum": 100},
            },
            "additionalProperties": False,
        },
    },
    {
        "name": "evidence_query_devices",
        "description": "Search FDA device records (PMA, 510(k), HDE) in the evidence DB. Filterable by indication slug or applicant. Each row has kind, number (e.g. 'P130008'), trade_name, applicant, decision_date, product_code.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "slug": {"type": "string"},
                "applicant": {"type": "string"},
                "limit": {"type": "integer", "default": 20, "minimum": 1, "maximum": 100},
            },
            "additionalProperties": False,
        },
    },
    {
        "name": "evidence_health",
        "description": "Return row counts per table (papers, trials, devices, adverse_events, indications). Use to verify ingest state.",
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
]


def _rows(rows) -> list[dict]:
    return [dict(r) for r in rows]


def call_tool(name: str, args: dict) -> dict:
    conn = db.connect()
    if name == "evidence_list_indications":
        rows = conn.execute(
            "SELECT slug, label, modality, condition, evidence_grade, regulatory FROM indications ORDER BY slug"
        ).fetchall()
        return {"indications": _rows(rows)}
    if name == "evidence_query_papers":
        rows = q.search_papers(
            conn,
            text=args.get("q"),
            slug=args.get("slug"),
            grade=args.get("grade"),
            oa_only=bool(args.get("oa_only")),
            limit=int(args.get("limit", 15)),
        )
        return {"papers": _rows(rows)}
    if name == "evidence_query_trials":
        rows = q.search_trials(
            conn,
            text=args.get("q"),
            slug=args.get("slug"),
            status=args.get("status"),
            limit=int(args.get("limit", 15)),
        )
        return {"trials": _rows(rows)}
    if name == "evidence_query_devices":
        rows = q.search_devices(
            conn,
            slug=args.get("slug"),
            applicant=args.get("applicant"),
            limit=int(args.get("limit", 20)),
        )
        return {"devices": _rows(rows)}
    if name == "evidence_health":
        counts = {t: conn.execute(f"SELECT count(*) FROM {t}").fetchone()[0]
                  for t in ("papers", "trials", "devices", "adverse_events", "indications")}
        return {"ok": True, "counts": counts, "db_path": db.DB_PATH}
    raise ValueError(f"unknown tool: {name}")


def _send(obj: dict) -> None:
    s = json.dumps(obj, ensure_ascii=False, default=str)
    sys.stdout.write(s + "\n")
    sys.stdout.flush()


def _ok(req_id, result):
    _send({"jsonrpc": "2.0", "id": req_id, "result": result})


def _err(req_id, code: int, message: str):
    _send({"jsonrpc": "2.0", "id": req_id, "error": {"code": code, "message": message}})


def _handle(msg: dict) -> None:
    method = msg.get("method")
    rid = msg.get("id")
    params = msg.get("params") or {}

    if method == "initialize":
        return _ok(rid, {
            "protocolVersion": PROTOCOL_VERSION,
            "serverInfo": SERVER_INFO,
            "capabilities": {"tools": {}},
        })
    if method == "notifications/initialized":
        return  # notification — no response
    if method == "tools/list":
        return _ok(rid, {"tools": TOOLS})
    if method == "tools/call":
        name = params.get("name")
        args = params.get("arguments") or {}
        try:
            result = call_tool(name, args)
            return _ok(rid, {
                "content": [{"type": "text", "text": json.dumps(result, ensure_ascii=False, default=str)}],
                "isError": False,
            })
        except Exception as e:
            return _ok(rid, {
                "content": [{"type": "text", "text": f"error: {e}"}],
                "isError": True,
            })
    if method in {"ping", "shutdown"}:
        return _ok(rid, {})
    return _err(rid, -32601, f"method not found: {method}")


def main() -> None:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            continue
        try:
            _handle(msg)
        except Exception as e:
            _err(msg.get("id"), -32603, f"internal error: {e}")


if __name__ == "__main__":
    main()
