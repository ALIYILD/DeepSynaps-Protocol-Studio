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

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, require_patient_owner
from app.database import get_db_session
from app.persistence.models import QEEGAIReport, QEEGAnalysis
from app.registries.auth import DEMO_ACTOR_TOKENS
from app.repositories.patients import resolve_patient_clinic_id
from app.settings import get_settings

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
        "safety_cockpit": _maybe("safety_cockpit_json"),
        "red_flags": _maybe("red_flags_json"),
        "normative_metadata": _maybe("normative_metadata_json"),
        "interpretability_status": getattr(analysis, "interpretability_status", None),
        "medication_confounds": getattr(analysis, "medication_confounds", None),
    }


def _resolve_ws_actor(token: str | None) -> AuthenticatedActor | None:
    """Best-effort actor resolution from a token in the WS query string.

    WebSockets cannot easily carry Authorization headers from browsers, so
    the convention is `?token=<jwt>`. Mirrors the demo+JWT logic in
    `app.auth.get_authenticated_actor` but returns None on any failure
    instead of raising — the caller closes the socket with code 1008.
    """
    if not token:
        return None
    settings = get_settings()
    if settings.app_env in ("development", "test"):
        demo = DEMO_ACTOR_TOKENS.get(token)
        if demo is not None:
            # Lift clinic_id from DB if a matching User row exists (mirrors
            # the additive change in get_authenticated_actor).
            from app.database import SessionLocal
            from app.repositories.users import get_user_by_id
            clinic_id = None
            try:
                _db = SessionLocal()
                try:
                    _u = get_user_by_id(_db, demo.actor_id)
                    if _u is not None and _u.clinic_id:
                        clinic_id = _u.clinic_id
                finally:
                    _db.close()
            except Exception:
                pass
            return AuthenticatedActor(
                actor_id=demo.actor_id,
                display_name=demo.display_name,
                role=demo.role,
                package_id=demo.package_id,
                token_id=token,
                clinic_id=clinic_id,
            )
    try:
        from app.services.auth_service import decode_token
        from app.database import SessionLocal
        from app.repositories.users import get_user_by_id
        payload = decode_token(token)
        if not payload or payload.get("type") != "access":
            return None
        user_id = payload.get("sub")
        if not user_id:
            return None
        _db = SessionLocal()
        try:
            user = get_user_by_id(_db, user_id)
        finally:
            _db.close()
        if user is None:
            return None
        clinic_id = user.clinic_id or payload.get("clinic_id")
        return AuthenticatedActor(
            actor_id=user_id,
            display_name=user.display_name,
            role=payload.get("role", "guest"),
            package_id=payload.get("package_id", "explorer"),
            token_id=token,
            clinic_id=clinic_id,
        )
    except Exception:
        return None


# Per-actor LLM message-rate cap on the Copilot WebSocket. WebSockets
# aren't naturally instrumented by SlowAPI's per-route limiter (the
# limit decorator targets HTTP routes via FastAPI's Request param), so
# we enforce a token-bucket-style cap manually in the message loop.
# 20 messages/min/actor matches the HTTP-side `@limiter.limit("20/minute")`
# pattern used by every other LLM-touching route in the codebase.
_COPILOT_MAX_MESSAGES_PER_MIN = 20
# Max bytes in a single user `content` payload before we refuse the
# turn. Pre-fix this was uncapped, so a clinician (or compromised
# token) could paste megabytes into the LLM prompt → cost-DoS.
_COPILOT_MAX_CONTENT_BYTES = 8_000


@router.websocket("/{analysis_id}")
async def copilot_ws(
    websocket: WebSocket,
    analysis_id: str,
    token: str | None = Query(default=None),
    db: Session = Depends(get_db_session),
) -> None:
    """Copilot chat WebSocket. See module docstring for the message protocol.

    Requires an auth token. The WebSocket protocol does not allow
    custom request headers from a vanilla ``new WebSocket(url)``, but
    modern Sec-WebSocket-Protocol negotiation and reverse-proxies that
    forward ``Authorization`` from the upgrade request both DO. The
    auth resolution prefers the header path so the token never lands
    in proxy access logs / browser history; the ``?token=`` query
    parameter is kept as a fallback for legacy callers.

    Without a valid token (or with one that doesn't match the
    analysis's clinic) the socket is rejected with code 1008.
    """
    await websocket.accept()

    # Prefer the Authorization header so the token isn't logged in
    # the request URL. Fall back to ``?token=`` for legacy clients.
    raw_token: str | None = None
    auth_header = websocket.headers.get("authorization") or ""
    if auth_header.lower().startswith("bearer "):
        raw_token = auth_header[7:].strip()
    if not raw_token:
        raw_token = token  # legacy path

    actor = _resolve_ws_actor(raw_token)
    if actor is None or actor.role == "guest":
        await websocket.send_json({"type": "error", "content": "Authentication required."})
        await websocket.close(code=1008)
        return

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

    # Cross-clinic ownership gate — the analysis must belong to a patient
    # in the actor's clinic (or actor must be admin). Pre-fix the
    # ``if exists`` branch silently passed when the patient row had been
    # deleted (orphan-bypass IDOR) — an attacker could read a stale
    # analysis_id whose patient_id no longer resolved. Now refuse for
    # non-admins on the orphan path too.
    try:
        exists, clinic_id = resolve_patient_clinic_id(db, analysis.patient_id)
        if exists:
            require_patient_owner(actor, clinic_id)
        elif actor.role != "admin":
            raise PermissionError("orphaned-patient analysis is admin-only")
    except Exception:
        await websocket.send_json({"type": "error", "content": "Access denied for this analysis."})
        await websocket.close(code=1008)
        return

    # Build the system prompt from the analysis snapshot (best-effort).
    snapshot = _analysis_snapshot(analysis)
    recommendation = _latest_recommendation(db, analysis_id)
    system_prompt: str = ""
    workflow_reference: str | None = None
    if copilot is not None:
        try:
            from deepsynaps_qeeg.knowledge import format_wineeg_workflow_context

            workflow_reference = format_wineeg_workflow_context()
            system_prompt = copilot.render_system_prompt(
                analysis_id=analysis_id,
                features=snapshot["features"],
                zscores=snapshot["zscores"],
                risk_scores=snapshot["risk_scores"],
                recommendation=recommendation,
                papers=[],
                medication_confounds=snapshot.get("medication_confounds"),
                workflow_reference=workflow_reference,
            )
        except Exception as exc:  # pragma: no cover — should not happen
            _log.warning("render_system_prompt failed: %s", exc)
            system_prompt = ""

    # ── Send welcome message ─────────────────────────────────────────────
    # NOTE: pre-fix this echoed the first 400 chars of the rendered
    # system prompt back to the client, leaking the prompt template
    # plus the (PHI-shaped) features/zscores/risk_scores snapshot.
    # Drop the preview from the wire — debug it server-side instead.
    await websocket.send_json(
        {
            "type": "welcome",
            "analysis_id": analysis_id,
            "stubbed": copilot is None,
            "disclaimer": WELCOME_DISCLAIMER,
        }
    )

    # Sliding-window rate bucket for this socket. Pre-fix the message
    # loop dispatched into the LLM with no throttle — a single
    # authenticated client could drive arbitrary Anthropic / OpenAI
    # spend by sending continuous `message` frames. The bucket below
    # enforces ``_COPILOT_MAX_MESSAGES_PER_MIN`` per actor, mirroring
    # the HTTP-route ``@limiter.limit("20/minute")`` we use elsewhere.
    import time as _time
    _msg_window: list[float] = []

    dispatch_context: dict[str, Any] = {
        "db": db,
        "analysis_id": analysis_id,
        "recommendation": recommendation,
        "features": snapshot["features"],
        "zscores": snapshot["zscores"],
        "risk_scores": snapshot["risk_scores"],
        "safety_cockpit": snapshot.get("safety_cockpit"),
        "red_flags": snapshot.get("red_flags"),
        "normative_metadata": snapshot.get("normative_metadata"),
        "interpretability_status": snapshot.get("interpretability_status"),
        "medication_confounds": snapshot.get("medication_confounds"),
        "workflow_reference": workflow_reference,
    }

    # Conversation history (used by :func:`real_llm_tool_dispatch`). Each
    # entry is an Anthropic-shaped role/content dict; the OpenAI branch
    # accepts the same shape via the tolerant ``_dispatch_openai`` loop.
    session_history: list[dict[str, Any]] = []

    # Determine whether the real streaming dispatch is available. When
    # the scaffold is present we prefer it; a safety-net fallback to
    # ``mock_llm_tool_dispatch`` is used if the coroutine crashes.
    real_dispatch = (
        getattr(copilot, "real_llm_tool_dispatch", None) if copilot else None
    )

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
            # Phase 5 — optional ``scope`` field. When the UI sends
            # ``scope="raw_page"`` (the new "Run on this raw page" chip),
            # we prepend a short instruction to the user message so the
            # LLM/tool dispatch is biased toward raw-page tools (auto-clean,
            # filter recommendations, channel explanations) rather than
            # downstream interpretation tools.
            scope = (message or {}).get("scope")

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

            # Per-message size cap — refuse mega-payloads at the
            # boundary so they never reach the LLM provider.
            if len(content) > _COPILOT_MAX_CONTENT_BYTES:
                await websocket.send_json(
                    {
                        "type": "error",
                        "content": (
                            "Message exceeds "
                            f"{_COPILOT_MAX_CONTENT_BYTES} bytes; trim "
                            "before resubmitting."
                        ),
                    }
                )
                continue

            # Sliding 60-second rate bucket per socket / actor.
            _now = _time.time()
            _msg_window[:] = [t for t in _msg_window if _now - t < 60.0]
            if len(_msg_window) >= _COPILOT_MAX_MESSAGES_PER_MIN:
                await websocket.send_json(
                    {
                        "type": "error",
                        "content": (
                            "Rate limit reached "
                            f"({_COPILOT_MAX_MESSAGES_PER_MIN}/min). "
                            "Slow down to avoid LLM-cost throttling."
                        ),
                    }
                )
                continue
            _msg_window.append(_now)

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

            # Phase 5 — raw-page scope hint. Prepended to the user content
            # so it survives any tool-dispatch summarisation. Keeps the
            # protocol additive: clients that don't send ``scope`` are
            # unaffected.
            if scope == "raw_page":
                content = (
                    "[scope=raw_page — focus on raw-data cleaning tools: "
                    "filters, montages, channel explanations, auto-clean, "
                    "ICA. Do not propose downstream interpretation.] "
                    + str(content)
                )

            # ── Preferred path: real streaming dispatch ─────────────────
            if real_dispatch is not None:
                final_text = ""
                final_tool: Any = None
                streamed_ok = True
                try:
                    async for chunk in real_dispatch(
                        content,
                        dispatch_context,
                        history=session_history,
                    ):
                        # Additive streaming frame. Clients that only
                        # understand the legacy ``reply`` event simply
                        # ignore ``llm_delta``.
                        await websocket.send_json(
                            {"type": "llm_delta", "chunk": chunk}
                        )
                        ctype = (chunk or {}).get("type")
                        if ctype == "final":
                            final_text = chunk.get("text", "") or ""
                            final_tool = chunk.get("tool")
                        elif ctype == "error":
                            streamed_ok = False
                            await websocket.send_json(
                                {
                                    "type": "error",
                                    "content": chunk.get("text", "") or "",
                                }
                            )
                except Exception as exc:  # pragma: no cover — crash-safe
                    _log.exception("real_llm_tool_dispatch crashed")
                    streamed_ok = False
                    await websocket.send_json(
                        {
                            "type": "error",
                            "content": f"{type(exc).__name__}: {exc}",
                        }
                    )

                if streamed_ok and final_text:
                    # Persist to history so follow-up turns see context.
                    session_history.append(
                        {"role": "user", "content": content}
                    )
                    session_history.append(
                        {"role": "assistant", "content": final_text}
                    )
                    await websocket.send_json(
                        {
                            "type": "reply",
                            "tool": final_tool,
                            "content": final_text,
                            "tool_result": None,
                        }
                    )
                    continue
                # streaming failed → fall through to mock dispatch as a
                # safety net so the client always gets a ``reply`` frame.

            # ── Fallback: mock LLM dispatch ─────────────────────────────
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

            reply_text = result.get("reply", "") or ""
            if reply_text:
                session_history.append(
                    {"role": "user", "content": content}
                )
                session_history.append(
                    {"role": "assistant", "content": reply_text}
                )
            await websocket.send_json(
                {
                    "type": "reply",
                    "tool": result.get("tool"),
                    "content": reply_text,
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
