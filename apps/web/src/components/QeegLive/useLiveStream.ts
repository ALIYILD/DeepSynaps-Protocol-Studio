import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type LiveFrame = any;

type LiveStreamState = {
  status: 'idle' | 'connecting' | 'open' | 'reconnecting' | 'error' | 'closed';
  lastFrame: LiveFrame | null;
  dropped: number;
  error: string | null;
};

type LiveStreamOpts = {
  wsUrl: string;
  sseUrl?: string;
  maxQueue?: number; // bounded queue for backpressure
  reconnectMs?: number;
};

export function useLiveStream(opts: LiveStreamOpts) {
  const { wsUrl, sseUrl, maxQueue = 4, reconnectMs = 1000 } = opts;
  const [state, setState] = useState<LiveStreamState>({
    status: 'idle',
    lastFrame: null,
    dropped: 0,
    error: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const queueRef = useRef<LiveFrame[]>([]);
  const droppedRef = useRef(0);
  const closedByUserRef = useRef(false);
  const reconnectTimerRef = useRef<number | null>(null);

  const flush = useCallback(() => {
    const q = queueRef.current;
    if (!q.length) return;
    const frame = q[q.length - 1]; // keep latest
    queueRef.current = [];
    setState((s) => ({ ...s, lastFrame: frame, dropped: droppedRef.current }));
  }, []);

  const scheduleReconnect = useCallback((mode: 'ws' | 'sse') => {
    if (closedByUserRef.current) return;
    if (reconnectTimerRef.current != null) window.clearTimeout(reconnectTimerRef.current);
    setState((s) => ({ ...s, status: 'reconnecting' }));
    reconnectTimerRef.current = window.setTimeout(() => {
      if (mode === 'ws') connectWs();
      else connectSse();
    }, reconnectMs);
  }, [reconnectMs]);

  const connectSse = useCallback(() => {
    if (!sseUrl) {
      setState((s) => ({ ...s, status: 'error', error: 'SSE fallback not configured.' }));
      return;
    }
    try {
      esRef.current?.close();
    } catch {}
    setState((s) => ({ ...s, status: 'connecting', error: null }));
    const es = new EventSource(sseUrl);
    esRef.current = es;
    es.onopen = () => setState((s) => ({ ...s, status: 'open', error: null }));
    es.onerror = () => {
      try { es.close(); } catch {}
      scheduleReconnect('sse');
    };
    es.addEventListener('frame', (ev: MessageEvent) => {
      try {
        const parsed = JSON.parse(String(ev.data || '{}'));
        const q = queueRef.current;
        if (q.length >= maxQueue) {
          q.shift();
          droppedRef.current += 1;
        }
        q.push(parsed);
        flush();
      } catch (e: any) {
        setState((s) => ({ ...s, status: 'error', error: e?.message || 'Bad SSE frame' }));
      }
    });
  }, [sseUrl, maxQueue, flush, scheduleReconnect]);

  const connectWs = useCallback(() => {
    try {
      wsRef.current?.close();
    } catch {}
    setState((s) => ({ ...s, status: 'connecting', error: null }));
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
    } catch (e: any) {
      setState((s) => ({ ...s, status: 'error', error: e?.message || 'Failed to create WebSocket' }));
      if (sseUrl) connectSse();
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => setState((s) => ({ ...s, status: 'open', error: null }));
    ws.onclose = () => {
      if (closedByUserRef.current) {
        setState((s) => ({ ...s, status: 'closed' }));
        return;
      }
      // Prefer WS reconnect; fall back to SSE if WS keeps failing.
      scheduleReconnect('ws');
    };
    ws.onerror = () => {
      // If WS errors immediately, try SSE fallback.
      if (sseUrl) connectSse();
      else setState((s) => ({ ...s, status: 'error', error: 'WebSocket error' }));
    };
    ws.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(String(ev.data || '{}'));
        const q = queueRef.current;
        if (q.length >= maxQueue) {
          q.shift();
          droppedRef.current += 1;
        }
        q.push(parsed);
        flush();
      } catch (e: any) {
        setState((s) => ({ ...s, status: 'error', error: e?.message || 'Bad WS frame' }));
      }
    };
  }, [wsUrl, sseUrl, maxQueue, flush, scheduleReconnect, connectSse]);

  const connect = useCallback(() => {
    closedByUserRef.current = false;
    droppedRef.current = 0;
    queueRef.current = [];
    connectWs();
  }, [connectWs]);

  const disconnect = useCallback(() => {
    closedByUserRef.current = true;
    if (reconnectTimerRef.current != null) window.clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
    try { wsRef.current?.close(); } catch {}
    try { esRef.current?.close(); } catch {}
    wsRef.current = null;
    esRef.current = null;
    setState((s) => ({ ...s, status: 'closed' }));
  }, []);

  useEffect(() => {
    return () => disconnect();
  }, [disconnect]);

  return useMemo(() => ({ ...state, connect, disconnect }), [state, connect, disconnect]);
}

