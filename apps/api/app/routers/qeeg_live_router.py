from __future__ import annotations

import asyncio
import json
import os
import time
from typing import Any, AsyncIterator, Literal

from fastapi import APIRouter, Depends, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.entitlements import require_feature
from app.errors import ApiServiceError
from app.packages import Feature


router = APIRouter(prefix="/api/v1/qeeg/live", tags=["qeeg-live"])


def _feature_flag_enabled() -> bool:
    # Ops can disable without redeploy in dev/staging by env var.
    v = os.getenv("DEEPSYNAPS_FEATURE_LIVE_QEEG", "0")
    return v in {"1", "true", "TRUE", "yes", "YES"}


def _gate(actor: AuthenticatedActor) -> None:
    if not _feature_flag_enabled():
        raise ApiServiceError(
            code="feature_disabled",
            message="Live qEEG is currently disabled.",
            status_code=403,
        )
    require_minimum_role(actor, "clinician", warnings=["Monitoring only — not diagnostic."])
    require_feature(
        actor.package_id,
        Feature.LIVE_QEEG,
        message="Your plan does not include live qEEG monitoring.",
    )


def _load_streaming():
    try:
        from deepsynaps_qeeg.streaming import (  # type: ignore
            LSLSource,
            MockSource,
            RollingFeatures,
            compute_quality_indicators,
            zscore_window,
        )
    except Exception as exc:  # pragma: no cover
        raise ApiServiceError(
            code="streaming_unavailable",
            message="Live qEEG streaming dependencies are not available on this server.",
            warnings=[str(exc)],
            status_code=503,
        ) from exc

    return LSLSource, MockSource, RollingFeatures, compute_quality_indicators, zscore_window


async def _stream_frames(
    *,
    request: Request | None,
    source_kind: Literal["lsl", "mock"],
    stream_name: str | None,
    edf_path: str | None,
    age: int | None,
    sex: str | None,
    line_freq_hz: float,
) -> AsyncIterator[dict[str, Any]]:
    LSLSource, MockSource, RollingFeatures, compute_quality_indicators, zscore_window = _load_streaming()

    if source_kind == "lsl":
        if not stream_name:
            raise ApiServiceError(code="missing_stream_name", message="stream_name is required for LSL.", status_code=400)
        source = LSLSource(stream_name=stream_name)
        win_iter = source.windows()
    else:
        if not edf_path:
            # In test environments we allow a synthetic mock source so WS smoke
            # tests don't require a real EDF fixture on disk.
            if os.getenv("DEEPSYNAPS_APP_ENV") == "test":
                import numpy as np

                from deepsynaps_qeeg.streaming.lsl_source import Window  # type: ignore

                sfreq = 250.0
                ch_names = [
                    "Fp1", "Fp2", "F7", "F3", "Fz", "F4", "F8",
                    "T7", "C3", "Cz", "C4", "T8",
                    "P7", "P3", "Pz", "P4", "P8",
                    "O1", "O2",
                ]
                n_ch = len(ch_names)
                win_n = int(round(sfreq * 1.0))
                hop_n = int(round(sfreq * 0.25))
                rng = np.random.default_rng(123)
                # Pre-generate a buffer of 10 seconds for deterministic streaming.
                total_n = int(round(sfreq * 10.0))
                data = rng.standard_normal((n_ch, total_n)) * 1e-6
                data += (2.0e-6) * np.sin(2 * np.pi * 10.0 * np.arange(total_n) / sfreq)

                async def _synthetic():
                    i = 0
                    while i + win_n <= total_n:
                        yield Window(data=data[:, i : i + win_n].copy(), sfreq=sfreq, ch_names=list(ch_names), t0_unix=None)
                        i += hop_n
                        await asyncio.sleep(0.0)

                win_iter = _synthetic()
            else:
                raise ApiServiceError(code="missing_edf_path", message="edf_path is required for mock source.", status_code=400)
        else:
            source = MockSource(edf_path=edf_path, realtime=False)
            win_iter = source.windows()

    rolling: RollingFeatures | None = None
    seq = 0

    async for w in win_iter:
        if request is not None and await request.is_disconnected():
            break
        if rolling is None:
            rolling = RollingFeatures(sfreq=float(w.sfreq), ch_names=list(w.ch_names))

        frame = rolling.update(w.data, t0_unix=w.t0_unix)
        quality = compute_quality_indicators(w.data, sfreq=float(w.sfreq), line_freq_hz=float(line_freq_hz))
        z = zscore_window(frame, age=age, sex=sex)

        out = {
            "type": "frame",
            "seq": seq,
            "t_unix": time.time(),
            "frame": frame,
            "quality": quality,
            "zscores": z,
            "disclaimer": "Monitoring only — not diagnostic.",
        }
        seq += 1
        yield out


@router.get("/sse")
async def qeeg_live_sse(
    request: Request,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    source: Literal["lsl", "mock"] = Query(default="lsl"),
    stream_name: str | None = Query(default=None),
    edf_path: str | None = Query(default=None),
    age: int | None = Query(default=None, ge=0, le=120),
    sex: str | None = Query(default=None),
    line_freq_hz: float = Query(default=50.0, ge=45.0, le=65.0),
    token: str | None = Query(default=None),
) -> StreamingResponse:
    # EventSource cannot set Authorization headers; accept token= as a fallback.
    if token and (not getattr(actor, "token_id", None)):
        actor = get_authenticated_actor(authorization=f"Bearer {token}")
    _gate(actor)

    async def sse_gen() -> AsyncIterator[str]:
        async for payload in _stream_frames(
            request=request,
            source_kind=source,
            stream_name=stream_name,
            edf_path=edf_path,
            age=age,
            sex=sex,
            line_freq_hz=line_freq_hz,
        ):
            yield f"event: frame\ndata: {json.dumps(payload)}\n\n"

    return StreamingResponse(
        sse_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.websocket("/ws")
async def qeeg_live_ws(
    websocket: WebSocket,
) -> None:
    # WebSockets cannot attach Authorization headers from browsers; accept a
    # `token=` query param and map it to the same JWT actor resolution.
    token = websocket.query_params.get("token")
    actor = get_authenticated_actor(authorization=f"Bearer {token}" if token else None)
    _gate(actor)
    await websocket.accept()

    # Query params: source=lsl|mock, stream_name=..., edf_path=..., age=..., sex=...
    qp = dict(websocket.query_params)
    source = qp.get("source", "lsl")
    stream_name = qp.get("stream_name")
    edf_path = qp.get("edf_path")
    try:
        age = int(qp["age"]) if "age" in qp and qp["age"] != "" else None
    except Exception:
        age = None
    sex = qp.get("sex") or None
    try:
        line_freq_hz = float(qp.get("line_freq_hz", "50") or 50.0)
    except Exception:
        line_freq_hz = 50.0

    q: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=4)
    stop = asyncio.Event()

    async def producer() -> None:
        try:
            async for payload in _stream_frames(
                request=None,
                source_kind=("mock" if source == "mock" else "lsl"),
                stream_name=stream_name,
                edf_path=edf_path,
                age=age,
                sex=sex,
                line_freq_hz=line_freq_hz,
            ):
                if stop.is_set():
                    break
                try:
                    q.put_nowait(payload)
                except asyncio.QueueFull:
                    # Backpressure: drop the oldest frame, keep latest.
                    try:
                        _ = q.get_nowait()
                    except Exception:
                        pass
                    try:
                        q.put_nowait(payload)
                    except Exception:
                        pass
        finally:
            stop.set()

    async def consumer() -> None:
        while not stop.is_set():
            payload = await q.get()
            try:
                await websocket.send_text(json.dumps(payload))
            except Exception:
                stop.set()
                break

    prod_task = asyncio.create_task(producer())
    cons_task = asyncio.create_task(consumer())
    try:
        # Keep the socket open; ignore client messages for now (reserved).
        while not stop.is_set():
            try:
                await websocket.receive_text()
            except Exception:
                stop.set()
                break
    except WebSocketDisconnect:
        stop.set()
    finally:
        stop.set()
        for t in (prod_task, cons_task):
            if not t.done():
                t.cancel()
        await asyncio.gather(prod_task, cons_task, return_exceptions=True)

