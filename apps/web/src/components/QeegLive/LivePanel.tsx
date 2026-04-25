import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveStream } from './useLiveStream';
import { renderTopoHeatmap } from '../../brain-map-svg.js';

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
  const [bandForTopo, setBandForTopo] = useState<'alpha' | 'theta' | 'beta'>('alpha');

  const wsUrl = useMemo(() => {
    const wsBase = String(apiBase).replace(/^http/i, 'ws');
    const url = new URL(`${wsBase}/api/v1/qeeg/live/ws`);
    url.searchParams.set('source', source);
    if (source === 'lsl') url.searchParams.set('stream_name', streamName);
    if (source === 'mock') url.searchParams.set('edf_path', edfPath);
    if (age) url.searchParams.set('age', age);
    if (sex) url.searchParams.set('sex', sex);
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
    if (props.token) url.searchParams.set('token', props.token);
    return url.toString();
  }, [apiBase, source, streamName, edfPath, age, sex, props.token]);

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

  // ── Plotly streaming bar chart (band totals) ─────────────────────────────
  const plotElRef = useRef<HTMLDivElement | null>(null);
  const plotReadyRef = useRef(false);
  const lastTopomapAtRef = useRef<number>(0);
  const [topomapHtml, setTopomapHtml] = useState<string>('');
  const [zStrip, setZStrip] = useState<Array<{ label: string; z: number }>>([]);

  const bandTotals = useMemo(() => {
    const bands = frame?.frame?.spectral?.bands || {};
    const out: Record<string, number> = {};
    for (const k of ['delta', 'theta', 'alpha', 'beta', 'gamma']) {
      const abs = bands?.[k]?.absolute_uv2 || {};
      const vals = Object.values(abs).map((v: any) => Number(v || 0));
      out[k] = vals.reduce((a, b) => a + b, 0);
    }
    return out;
  }, [frame]);

  useEffect(() => {
    let cancelled = false;
    async function ensurePlot() {
      if (!plotElRef.current) return;
      const Plotly = (await import('plotly.js-dist-min')).default as any;
      if (cancelled) return;
      const x = ['delta', 'theta', 'alpha', 'beta', 'gamma'];
      const y = x.map((k) => bandTotals[k] ?? 0);
      if (!plotReadyRef.current) {
        await Plotly.newPlot(
          plotElRef.current,
          [
            {
              type: 'bar',
              x,
              y,
              marker: { color: ['#64748b', '#38bdf8', '#a78bfa', '#34d399', '#fbbf24'] },
            },
          ],
          {
            margin: { l: 36, r: 12, t: 22, b: 30 },
            height: 220,
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            font: { color: 'rgba(226,232,240,0.9)' },
            yaxis: { title: 'µV² (sum)', zeroline: false, gridcolor: 'rgba(148,163,184,0.12)' },
            xaxis: { tickfont: { size: 11 } },
          },
          { displayModeBar: false, responsive: true }
        );
        plotReadyRef.current = true;
      } else {
        await Plotly.react(
          plotElRef.current,
          [
            {
              type: 'bar',
              x,
              y,
              marker: { color: ['#64748b', '#38bdf8', '#a78bfa', '#34d399', '#fbbf24'] },
            },
          ],
          {
            margin: { l: 36, r: 12, t: 22, b: 30 },
            height: 220,
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            font: { color: 'rgba(226,232,240,0.9)' },
            yaxis: { title: 'µV² (sum)', zeroline: false, gridcolor: 'rgba(148,163,184,0.12)' },
            xaxis: { tickfont: { size: 11 } },
          },
          { displayModeBar: false, responsive: true }
        );
      }
    }
    if (frame) ensurePlot();
    return () => {
      cancelled = true;
    };
  }, [frame, bandTotals]);

  // ── Live topomap (refresh 1s) ────────────────────────────────────────────
  useEffect(() => {
    if (!frame) return;
    const now = Date.now();
    if (now - lastTopomapAtRef.current < 1000) return;
    lastTopomapAtRef.current = now;
    const bands = frame?.frame?.spectral?.bands || {};
    const rel = bands?.[bandForTopo]?.relative || {};
    try {
      setTopomapHtml(
        renderTopoHeatmap(rel, { band: `${bandForTopo} (rel)`, unit: '%', size: 220, colorScale: 'warm' })
      );
    } catch {
      setTopomapHtml('');
    }
  }, [frame, bandForTopo]);

  // ── Z-score strip (top |z|) ──────────────────────────────────────────────
  useEffect(() => {
    if (!frame) return;
    const z = frame?.zscores?.spectral?.bands || {};
    const rows: Array<{ label: string; z: number }> = [];
    for (const band of Object.keys(z || {})) {
      const abs = z?.[band]?.absolute_uv2 || {};
      for (const [ch, v] of Object.entries(abs)) {
        const zv = Number(v);
        if (!Number.isFinite(zv)) continue;
        rows.push({ label: `${band}·${ch}`, z: zv });
      }
    }
    rows.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
    setZStrip(rows.slice(0, 12));
  }, [frame]);

  const quality = frame?.quality || null;
  const chip = (label: string, value: string, tone: 'good' | 'warn' | 'bad') => {
    const bg = tone === 'good' ? 'rgba(16,185,129,0.10)' : tone === 'warn' ? 'rgba(245,158,11,0.10)' : 'rgba(239,68,68,0.10)';
    const br = tone === 'good' ? 'rgba(16,185,129,0.25)' : tone === 'warn' ? 'rgba(245,158,11,0.25)' : 'rgba(239,68,68,0.25)';
    const fg = tone === 'good' ? 'rgba(167,243,208,0.95)' : tone === 'warn' ? 'rgba(253,230,138,0.95)' : 'rgba(254,202,202,0.95)';
    return (
      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', padding: '4px 8px', borderRadius: 999, border: `1px solid ${br}`, background: bg, color: fg, fontSize: 11, fontWeight: 700 }}>
        {label}<span style={{ opacity: 0.85, fontWeight: 600 }}>{value}</span>
      </span>
    );
  };

  const flat = Number(quality?.flatline_frac ?? 0);
  const clip = Number(quality?.clipping_frac ?? 0);
  const line = Number(quality?.line_noise_ratio ?? 0);

  const flatTone = flat < 0.05 ? 'good' : flat < 0.15 ? 'warn' : 'bad';
  const clipTone = clip < 0.01 ? 'good' : clip < 0.03 ? 'warn' : 'bad';
  const lineTone = line < 0.08 ? 'good' : line < 0.15 ? 'warn' : 'bad';

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

        <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {chip('Flatline', `${(flat * 100).toFixed(1)}%`, flatTone as any)}
          {chip('Clipping', `${(clip * 100).toFixed(2)}%`, clipTone as any)}
          {chip('Line', `${(line * 100).toFixed(1)}%`, lineTone as any)}
          {chip('Disclaimer', 'Monitoring only', 'warn')}
        </div>

        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 12, alignItems: 'start' }}>
          <div className="ds-card" style={{ margin: 0 }}>
            <div className="ds-card__header"><h3 style={{ fontSize: 13, margin: 0 }}>Band power (streaming)</h3></div>
            <div className="ds-card__body">
              <div ref={plotElRef} />
            </div>
          </div>

          <div className="ds-card" style={{ margin: 0 }}>
            <div className="ds-card__header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: 13, margin: 0 }}>Topomap</h3>
              <select value={bandForTopo} onChange={(e) => setBandForTopo(e.target.value as any)} style={{ fontSize: 12 }}>
                <option value="alpha">alpha</option>
                <option value="theta">theta</option>
                <option value="beta">beta</option>
              </select>
            </div>
            <div className="ds-card__body">
              <div dangerouslySetInnerHTML={{ __html: topomapHtml || '<div style="color:var(--text-secondary);font-size:12px">No topomap yet.</div>' }} />
            </div>
          </div>
        </div>

        <div style={{ marginTop: 14 }} className="ds-card">
          <div className="ds-card__header">
            <h3 style={{ fontSize: 13, margin: 0 }}>Z-score strip (largest |z|)</h3>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Monitoring only — not diagnostic.</div>
          </div>
          <div className="ds-card__body">
            {zStrip.length ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0,1fr))', gap: 8 }}>
                {zStrip.map((r) => {
                  const tone = Math.abs(r.z) < 1.0 ? 'good' : Math.abs(r.z) < 2.0 ? 'warn' : 'bad';
                  return (
                    <div key={r.label} style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 700 }}>{r.label}</div>
                      <div style={{ marginTop: 2, fontSize: 14, fontWeight: 800 }}>
                        <span style={{ color: tone === 'bad' ? 'var(--red-500)' : tone === 'warn' ? 'var(--amber)' : 'var(--green-400)' }}>
                          {r.z.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>No z-scores yet (provide age + sex for norms).</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

