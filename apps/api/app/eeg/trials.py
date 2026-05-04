"""ERP trial rows — import, sync, class vocabulary (M5)."""

from __future__ import annotations

import csv
import io
import json
import uuid
from typing import Any

TRIAL_CLASSES: tuple[str, ...] = (
    "Target",
    "NonTarget",
    "Non-target",
    "Go",
    "NoGo",
    "No-go",
    "Standard",
    "Deviant",
    "Novel",
    "Omision",
    "Omission",
    "Catch",
    "Neutral",
)


def _norm_class(raw: str) -> str:
    s = (raw or "").strip()
    return s if s else "Standard"


def parse_trials_csv(text: str) -> list[dict[str, Any]]:
    """CSV columns: time_ms (required), class, response_ms."""
    f = io.StringIO(text)
    r = csv.DictReader(f)
    out: list[dict[str, Any]] = []
    if not r.fieldnames:
        return out
    lower = {h.lower().strip(): h for h in r.fieldnames if h}
    tkey = None
    for cand in ("time_ms", "time", "onset_ms", "t_ms"):
        if cand in lower:
            tkey = lower[cand]
            break
    if not tkey:
        return out
    ckey = None
    for cand in ("class", "type", "stimulus", "cond"):
        if cand in lower:
            ckey = lower[cand]
            break
    resp_key = None
    for cand in ("response_ms", "rt_ms", "rt"):
        if cand in lower:
            resp_key = lower[cand]
            break
    idx = 0
    for row in r:
        try:
            tms = float(str(row.get(tkey, "")).strip())
        except (TypeError, ValueError):
            continue
        cls = _norm_class(str(row.get(ckey, "Standard") if ckey else "Standard"))
        resp = None
        if resp_key and row.get(resp_key) not in (None, ""):
            try:
                resp = float(str(row.get(resp_key)).strip())
            except (TypeError, ValueError):
                resp = None
        onset_sec = tms / 1000.0
        idx += 1
        out.append(
            {
                "id": str(uuid.uuid4()),
                "index": idx,
                "onsetSec": onset_sec,
                "endSec": onset_sec + 0.001,
                "class": cls,
                "included": True,
                "responseMs": resp,
            }
        )
    return out


def parse_trials_json(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, dict) and "trials" in payload:
        payload = payload["trials"]
    if not isinstance(payload, list):
        return []
    out: list[dict[str, Any]] = []
    idx = 0
    for row in payload:
        if not isinstance(row, dict):
            continue
        tms = row.get("time_ms", row.get("timeMs", row.get("onset_ms")))
        if tms is None:
            continue
        try:
            tms = float(tms)
        except (TypeError, ValueError):
            continue
        idx += 1
        cls = _norm_class(str(row.get("class", row.get("type", "Standard"))))
        resp = row.get("response_ms", row.get("responseMs"))
        try:
            resp_f = float(resp) if resp is not None else None
        except (TypeError, ValueError):
            resp_f = None
        onset_sec = tms / 1000.0
        out.append(
            {
                "id": str(row.get("id") or uuid.uuid4()),
                "index": int(row.get("index", idx)),
                "onsetSec": onset_sec,
                "endSec": float(row.get("endSec", onset_sec + 0.001)),
                "class": cls,
                "included": bool(row.get("included", True)),
                "responseMs": resp_f,
            }
        )
    return out


def parse_trials_import(body: str, content_type: str | None) -> list[dict[str, Any]]:
    ct = (content_type or "").lower()
    if "json" in ct or body.strip().startswith("["):
        try:
            return parse_trials_json(json.loads(body))
        except json.JSONDecodeError:
            return []
    return parse_trials_csv(body)


def apply_sync_ms(trials: list[dict[str, Any]], delta_ms: float, classes: list[str] | None) -> None:
    """Shift onset/end by delta_ms for all trials or filtered classes."""
    want = None if not classes else {c.strip() for c in classes if c.strip()}
    dt_sec = delta_ms / 1000.0
    for tr in trials:
        cls = str(tr.get("class", ""))
        if want is not None and cls not in want:
            continue
        tr["onsetSec"] = float(tr.get("onsetSec", 0)) + dt_sec
        if tr.get("endSec") is not None:
            tr["endSec"] = float(tr["endSec"]) + dt_sec


def trials_to_viewer_rows(trials: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Shape expected by Studio TrialBar / ERP."""
    out: list[dict[str, Any]] = []
    for tr in trials:
        cls = str(tr.get("class", "Standard"))
        kind_map = {
            "Go": "Go",
            "NoGo": "NoGo",
            "No-go": "NoGo",
            "Target": "Target",
            "NonTarget": "NonTarget",
            "Non-target": "NonTarget",
            "Standard": "NonTarget",
            "Deviant": "Target",
            "Novel": "Target",
        }
        kind = kind_map.get(cls, "NonTarget")
        out.append(
            {
                "id": str(tr["id"]),
                "index": int(tr.get("index", 0)),
                "startSec": float(tr.get("onsetSec", 0)),
                "endSec": float(tr.get("endSec", tr.get("onsetSec", 0) + 0.001)),
                "kind": kind,
                "included": bool(tr.get("included", True)),
                "stimulusClass": cls,
                "responseMs": tr.get("responseMs"),
            }
        )
    return out
