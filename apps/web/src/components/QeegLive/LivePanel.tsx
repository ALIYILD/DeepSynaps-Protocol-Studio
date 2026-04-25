import React, { useMemo, useState } from 'react';
import { useLiveStream } from './useLiveStream';

type Props = {
  apiBase?: string; // e.g. http://127.0.0.1:8000
  token?: string | null;
};

function _liveQeegFeatureFlagEnabled() {
  try {
    const v = (typeof window !== 'undefined' && (window as any))
      ? (window as any).DEEPSYNAPS_ENABLE_LIVE_QEEG
      : (typeof globalThis !== 'undefined' ? (globalThis as any).DEEPSYNAPS_ENABLE_LIVE_QEEG : undefined);
    if (v === false || v === 'false' || v === 0 || v === '0') return false;
    return true;
  } catch (_) {
    return true;
  }
}

export function LivePanel(props: Props) {
  const apiBase = props.apiBase || (import.meta as any).env?.VITE_API_BASE_URL || 'http://127.0.0.1:8000';
  const [source, setSource] = useState<'lsl' | 'mock'>('lsl');
  const [streamName, setStreamName] = useState<string>('EEG');
  const [edfPath, setEdfPath] = useState<string>('');
  const [age, setAge] = useState<string>('');
  const [sex, setSex] = useState<string>('');

  const wsUrl = useMemo(() => {
    const wsBase = String(apiBase).replace(/^http/i, 'ws');
    const url = new URL(`${wsBase}/api/v1/qeeg/live/ws`);
    url.searchParams.set('source', source);
    if (source === 'lsl') url.searchParams.set('stream_name', streamName);
    if (source === 'mock') url.searchParams.set('edf_path', edfPath);
    if (age) url.searchParams.set('age', age);
    if (sex) url.searchParams.set('sex', sex);
    // NOTE: auth is via Authorization header in existing api.js fetch; browsers
    // can't set headers for plain WebSocket, so we pass token as query param
    // only if the backend supports it. Current backend expects Bearer header,
    // so keep this as a future enhancement hook.
    if (props.token) url.searchParams.set('token', props.token);
    return url.toString();
  }, [apiBase, source, streamName, edfPath, age, sex, props.token]);

  const sseUrl = useMemo(() => {
    const url = new URL(`${apiBase}/api/v1/qeeg/live/sse`);
    url.searchParams.set('source', source);
    if (source === 'lsl') url.searchParams.set('stream_name', streamName);
    if (source === 'mock') url.searchParams.set('edf_path', edfPath);
    if (age) url.searchParams.set('age', age);
    if (sex) url.searchParams.set('sex', sex);
    return url.toString();
  }, [apiBase, source, streamName, edfPath, age, sex]);

  const live = useLiveStream({ wsUrl, sseUrl, maxQueue: 4, reconnectMs: 1000 });

  if (!_liveQeegFeatureFlagEnabled()) {
    return (
      <div className="ds-card">
        <div className="ds-card__header"><h3>Live qEEG</h3></div>
        <div className="ds-card__body">
          <div style={{ color: 'var(--text-secondary)' }}>
            Live qEEG is disabled by feature flag.
          </div>
        </div>
      </div>
    );
  }

  const frame = live.lastFrame;
  const tbr = frame?.frame?.biomarkers?.tbr ?? null;
  const faa = frame?.frame?.biomarkers?.faa ?? null;
  const iapf = frame?.frame?.biomarkers?.iapf_hz ?? null;

  return (
    <div className="ds-card">
      <div className="ds-card__header">
        <h3>Live qEEG</h3>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          Monitoring only — not diagnostic.
        </div>
      </div>
      <div className="ds-card__body">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Source</label>
            <select value={source} onChange={(e) => setSource(e.target.value as any)}>
              <option value="lsl">LSL</option>
              <option value="mock">Mock EDF replay</option>
            </select>
          </div>
          {source === 'lsl' ? (
            <div>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>LSL stream name</label>
              <input value={streamName} onChange={(e) => setStreamName(e.target.value)} placeholder="EEG" />
            </div>
          ) : (
            <div>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>EDF path (server-local)</label>
              <input value={edfPath} onChange={(e) => setEdfPath(e.target.value)} placeholder="C:\\path\\to\\file.edf" />
            </div>
          )}
          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Age (optional)</label>
            <input value={age} onChange={(e) => setAge(e.target.value)} placeholder="e.g. 34" />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Sex (optional)</label>
            <select value={sex} onChange={(e) => setSex(e.target.value)}>
              <option value="">—</option>
              <option value="M">M</option>
              <option value="F">F</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
          <button className="btn" onClick={live.connect} disabled={live.status === 'connecting' || live.status === 'open'}>
            {live.status === 'open' ? 'Connected' : live.status === 'connecting' ? 'Connecting…' : 'Connect'}
          </button>
          <button className="btn btn-secondary" onClick={live.disconnect}>
            Disconnect
          </button>
          <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-secondary)' }}>
            Status: <strong>{live.status}</strong>{live.dropped ? ` · dropped ${live.dropped}` : ''}
          </div>
        </div>

        {live.error ? (
          <div style={{ marginTop: 10, color: 'var(--red-500)' }}>{live.error}</div>
        ) : null}

        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          <div className="ds-metric">
            <div className="ds-metric__label">TBR (Cz)</div>
            <div className="ds-metric__value">{tbr == null ? '—' : Number(tbr).toFixed(2)}</div>
          </div>
          <div className="ds-metric">
            <div className="ds-metric__label">FAA</div>
            <div className="ds-metric__value">{faa == null ? '—' : Number(faa).toFixed(2)}</div>
          </div>
          <div className="ds-metric">
            <div className="ds-metric__label">IAPF (Hz)</div>
            <div className="ds-metric__value">{iapf == null ? '—' : Number(iapf).toFixed(2)}</div>
          </div>
        </div>

        <div style={{ marginTop: 14, fontSize: 12, color: 'var(--text-secondary)' }}>
          Plotly streaming charts + live topomap rendering are implemented in the next UI pass; this panel currently
          validates transport, backpressure, and per-window feature payload shape.
        </div>
      </div>
    </div>
  );
}

