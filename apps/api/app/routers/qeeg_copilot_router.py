"""qEEG Copilot WebSocket endpoint (Upgrade 10 of CONTRACT_V2).

Exposes a single WebSocket at ``/api/v1/qeeg-copilot/{analysis_id}``.

Message protocol (JSON over text frames, one JSON object per frame)::

    # → server
    {"type": "message", "content": "explain: theta_beta_ratio"}
    {"type": "ping"}

    # ← server
    {"type": "welcome", "analysis_id": "...", "stubbed": bool,
     "disclaimer": str}
    {"type": "reply", "tool": str|None, "content": str,
     "tool_result": Any|None}
    {"type": "refusal", "content": "Please consult your clinician."}
    {"type": "error",   "content": str}
    {"type": "pong"}

The endpoint mocks the LLM dispatch with a deterministic rule-based
handler (see :func:`deepsynaps_qeeg.ai.copilot.mock_llm_tool_dispatch`)
so it is fully unit-testable without any network access. A real
backend can swap in by wrapping the dispatcher or setting the
``DEEPSYNAPS_COPILOT_BACKEND`` env var (future work).
"""
from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from app.database import get_db_session
from app.persistence.models import QEEGAIReport, QEEGAnalysis

_log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/qeeg-copilot", tags=["qeeg-copilot"])


WELCOME_DISCLAIMER = (
    "I can explain qEEG features, similarity indices, and the current "
    "protocol recommendation. I do not diagnose or prescribe. For any "
    "clinical decisions please consult your clinician."
)


def _load_copilot() -> Any:
    """Best-effort import of the copilot scaffold module."""
    try:
        from deepsynaps_qeeg.ai import copilot as _copilot  # type: ignore[import-not-found]

        return _copilot
    except Exception as exc:  # pragma: no cover
        _log.warning("Copilot scaffold unavailable: %s", exc)
        return None


def _latest_recommendation(db: Session, analysis_id: str) -> dict:
    """Pull the most recent :class:`ProtocolRecommendation` for an analysis.

    Falls back to the last AI report's ``protocol_suggestions`` list when
    no migration-038 recommendation column is populated.
    """
    row: QEEGAnalysis | None = (
        db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    )
    if row and getattr(row, "protocol_recommendation_json", None):
        try:
            data = json.loads(row.protocol_recommendation_json)
            if isinstance(data, dict):
                return data
        except (TypeError, ValueError):
            pass

    # Fallback: most recent QEEGAIReport
    report = (
        db.query(QEEGAIReport)
        .filter_by(analysis_id=analysis_id)
        .order_by(QEEGAIReport.created_at.desc())
        .first()
    )
    if report and report.protocol_suggestions_json:
        try:
            data = json.loads(report.protocol_suggestions_json)
            if isinstance(data, list) and data:
                first = data[0]
                if isinstance(first, dict):
                    return first
            if isinstance(data, dict):
                return data
        except (TypeError, ValueError):
            pass
    return {}


def _analysis_snapshot(analysis: QEEGAnalysis) -> dict:
    """Decode a compact context snapshot from a QEEGAnalysis row."""

    def _maybe(col: str) -> Any:
        raw = getattr(analysis, col, None)
        if not raw:
            return None
        try:
            return json.loads(raw)
        except (TypeError, ValueError):
            return None

    return {
        "features": _maybe("band_powers_json"),
        "zscores": _maybe("normative_zscores_json"),
        "risk_scores": _maybe("risk_scores_json"),
        "brain_age": _maybe("brain_age_json"),
        "explainability": _maybe("explainability_json"),
    }


@router.websocket("/{analysis_id}")
async def copilot_ws(
    websocket: WebSocket,
    analysis_id: str,
    db: Session = Depends(get_db_session),
) -> None:
    """Copilot chat WebSocket. See module docstring for the message protocol."""
    await websocket.accept()

    copilot = _load_copilot()

    # ── Load the analysis context ────────────────────────────────────────
    analysis = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if analysis is None:
        await websocket.send_json(
            {
                "type": "error",
                "content": f"Analysis '{analysis_id}' not found.",
            }
        )
        await websocket.close(code=1008)
        return

    # Build the system prompt from the analysis snapshot (best-effort).
    snapshot = _analysis_snapshot(analysis)
    recommendation = _latest_recommendation(db, analysis_id)
    system_prompt: str = ""
    if copilot is not None:
        try:
            system_prompt = copilot.render_system_prompt(
                analysis_id=analysis_id,
                features=snapshot["features"],
                zscores=snapshot["zscores"],
                risk_scores=snapshot["risk_scores"],
                recommendation=recommendation,
                papers=[],
            )
        except Exception as exc:  # pragma: no cover — should not happen
            _log.warning("render_system_prompt failed: %s", exc)
            system_prompt = ""

    # ── Send welcome message ─────────────────────────────────────────────
    await websocket.send_json(
        {
            "type": "welcome",
            "analysis_id": analysis_id,
            "stubbed": copilot is None,
            "disclaimer": WELCOME_DISCLAIMER,
            "system_prompt_preview": (system_prompt[:400] if system_prompt else None),
        }
    )

    dispatch_context: dict[str, Any] = {
        "db": db,
        "analysis_id": analysis_id,
        "recommendation": recommendation,
        "features": snapshot["features"],
    }

    # ── Message loop ─────────────────────────────────────────────────────
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                message = json.loads(raw)
            except (TypeError, ValueError):
                message = {"type": "message", "content": raw}

            msg_type = (message or {}).get("type", "message")
            content = (message or {}).get("content", "")

            if msg_type == "ping":
                await websocket.send_json({"type": "pong"})
                continue

            if msg_type != "message":
                await websocket.send_json(
                    {"type": "error", "content": f"Unknown message type '{msg_type}'"}
                )
                continue

            if not isinstance(content, str):
                await websocket.send_json(
                    {"type": "error", "content": "Message content must be a string."}
                )
                continue

            if copilot is None:
                await websocket.send_json(
                    {
                        "type": "reply",
                        "tool": None,
                        "content": (
                            "Copilot is running in stub mode — the "
                            "deepsynaps_qeeg.ai.copilot module is not "
                            "installed on this worker."
                        ),
                        "tool_result": None,
                    }
                )
                continue

            # ── Safety check ────────────────────────────────────────────
            if copilot.is_unsafe_query(content):
                await websocket.send_json(
                    {"type": "refusal", "content": copilot.REFUSAL_MESSAGE}
                )
                continue

            # ── Tool dispatch (mock LLM) ────────────────────────────────
            try:
                result = copilot.mock_llm_tool_dispatch(content, dispatch_context)
            except Exception as exc:  # pragma: no cover
                _log.exception("copilot dispatch failed")
                await websocket.send_json(
                    {
                        "type": "error",
                        "content": f"{type(exc).__name__}: {exc}",
                    }
                )
                continue

            await websocket.send_json(
                {
                    "type": "reply",
                    "tool": result.get("tool"),
                    "content": result.get("reply", ""),
                    "tool_result": result.get("result"),
                }
            )

    except WebSocketDisconnect:
        _log.info("Copilot client disconnected (analysis=%s)", analysis_id)
        return
    except Exception as exc:  # pragma: no cover
        _log.exception("Copilot WS loop crashed for %s", analysis_id)
        try:
            await websocket.send_json(
                {"type": "error", "content": f"{type(exc).__name__}: {exc}"}
            )
            await websocket.close(code=1011)
        except Exception:
            pass
