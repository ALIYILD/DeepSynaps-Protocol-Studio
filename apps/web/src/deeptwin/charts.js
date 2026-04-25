// DeepTwin chart builders (Plotly + custom SVG sparkline).
//
// We prefer Plotly because it's already loaded across the app (qEEG
// analyzer, brain-twin) and supports interactive overlays cheaply.
// Sparklines are tiny inline SVG to match the pattern in pages-patient.js.

const COLORS = {
  teal: '#00d4bc', blue: '#4a9eff', amber: '#ffb347', rose: '#ff6b9d',
  violet: '#a78bfa', red: '#ff6b6b', muted: 'rgba(255,255,255,.55)',
};

function ensurePlotly() {
  if (typeof window === 'undefined') return null;
  return window.Plotly || null;
}

export function sparklineSVG(values, opts = {}) {
  const w = opts.width ?? 120;
  const h = opts.height ?? 28;
  const stroke = opts.color ?? COLORS.teal;
  if (!values || values.length < 2) return `<svg width="${w}" height="${h}"></svg>`;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = (max - min) || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * (w - 2) + 1;
    const y = h - 2 - ((v - min) / range) * (h - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <polyline fill="none" stroke="${stroke}" stroke-width="1.5" points="${pts}"/>
  </svg>`;
}

const BASE_LAYOUT = {
  paper_bgcolor: 'rgba(0,0,0,0)',
  plot_bgcolor: 'rgba(0,0,0,0)',
  font: { color: 'rgba(255,255,255,.78)', family: 'Inter, system-ui, sans-serif', size: 11 },
  margin: { t: 24, r: 16, b: 36, l: 44 },
  xaxis: { gridcolor: 'rgba(255,255,255,.06)', zerolinecolor: 'rgba(255,255,255,.10)' },
  yaxis: { gridcolor: 'rgba(255,255,255,.06)', zerolinecolor: 'rgba(255,255,255,.10)' },
  showlegend: true,
  legend: { orientation: 'h', y: -0.18 },
};

const CONFIG = { responsive: true, displaylogo: false, modeBarButtonsToRemove: ['lasso2d', 'select2d'] };

export function buildTimeline(elId, events, overlays) {
  const Plotly = ensurePlotly();
  if (!Plotly) return;
  const kinds = (overlays && overlays.length) ? overlays : ['session', 'assessment', 'qeeg', 'symptom', 'biometric'];
  const palette = { session: COLORS.teal, assessment: COLORS.blue, qeeg: COLORS.violet, symptom: COLORS.rose, biometric: COLORS.amber };
  const kindLabels = { session: 'Sessions', assessment: 'Assessments', qeeg: 'qEEG', symptom: 'Symptom reports', biometric: 'Biometrics' };
  const traces = kinds.map(k => {
    const items = (events || []).filter(e => e.kind === k);
    return {
      x: items.map(e => e.ts),
      y: items.map(() => k),
      mode: 'markers',
      type: 'scatter',
      name: kindLabels[k] || k,
      marker: { size: 9, color: palette[k] || COLORS.muted, line: { width: 1, color: 'rgba(0,0,0,.4)' } },
      text: items.map(e => `${e.label}<br>severity: ${e.severity}`),
      hovertemplate: '%{text}<extra>%{x}</extra>',
    };
  });
  Plotly.newPlot(elId, traces, { ...BASE_LAYOUT, height: 280, yaxis: { ...BASE_LAYOUT.yaxis, type: 'category' } }, CONFIG);
}

export function buildCorrelationHeatmap(elId, matrix, labels) {
  const Plotly = ensurePlotly();
  if (!Plotly) return;
  const trace = {
    z: matrix, x: labels, y: labels, type: 'heatmap',
    colorscale: [[0, '#ff6b6b'], [0.5, '#1a1f2e'], [1, '#00d4bc']],
    zmin: -1, zmax: 1,
    hovertemplate: '%{y} ↔ %{x}<br>r = %{z:.2f}<extra></extra>',
    colorbar: { thickness: 12, len: 0.7 },
  };
  Plotly.newPlot(elId, [trace], { ...BASE_LAYOUT, height: 360, margin: { t: 10, r: 16, b: 80, l: 120 } }, CONFIG);
}

function buildBandTrace(name, x, point, ciLow, ciHigh, color) {
  return [
    { x: [...x, ...x.slice().reverse()],
      y: [...ciHigh, ...ciLow.slice().reverse()],
      fill: 'toself', fillcolor: color.replace(')', ',.18)').replace('rgb', 'rgba'),
      line: { color: 'rgba(0,0,0,0)' }, hoverinfo: 'skip', showlegend: false, name: name + ' band' },
    { x, y: point, mode: 'lines+markers', name, line: { color, width: 2 }, marker: { size: 5 } },
  ];
}

export function buildPrediction(elId, traces) {
  const Plotly = ensurePlotly();
  if (!Plotly) return;
  const palette = [COLORS.teal, COLORS.blue, COLORS.violet, COLORS.amber, COLORS.rose, COLORS.red];
  const all = [];
  (traces || []).slice(0, 6).forEach((t, i) => {
    const color = palette[i % palette.length];
    const rgb = hexToRgb(color);
    const fill = `rgba(${rgb},.15)`;
    all.push(
      { x: [...t.days, ...t.days.slice().reverse()],
        y: [...t.ci_high, ...t.ci_low.slice().reverse()],
        fill: 'toself', fillcolor: fill, line: { color: 'rgba(0,0,0,0)' },
        hoverinfo: 'skip', showlegend: false, name: t.metric + ' band' },
      { x: t.days, y: t.point, mode: 'lines', name: t.metric, line: { color, width: 2 } },
    );
  });
  Plotly.newPlot(elId, all, { ...BASE_LAYOUT, height: 320,
    xaxis: { ...BASE_LAYOUT.xaxis, title: 'Days from now' } }, CONFIG);
}

export function buildSimulationCurve(elId, simulations) {
  const Plotly = ensurePlotly();
  if (!Plotly) return;
  const palette = [COLORS.teal, COLORS.blue, COLORS.violet, COLORS.amber];
  const traces = [];
  simulations.forEach((sim, i) => {
    const color = palette[i % palette.length];
    const rgb = hexToRgb(color);
    const fill = `rgba(${rgb},.15)`;
    const xs = sim.predicted_curve?.x_days || [];
    const pt = sim.predicted_curve?.delta_outcome_score || [];
    const lo = sim.predicted_curve?.ci_low || [];
    const hi = sim.predicted_curve?.ci_high || [];
    traces.push(
      { x: [...xs, ...xs.slice().reverse()], y: [...hi, ...lo.slice().reverse()],
        fill: 'toself', fillcolor: fill, line: { color: 'rgba(0,0,0,0)' },
        hoverinfo: 'skip', showlegend: false, name: sim.scenario_id + ' band' },
      { x: xs, y: pt, mode: 'lines+markers',
        name: sim.scenario_id || `Scenario ${i + 1}`,
        line: { color, width: 2 }, marker: { size: 5 } },
    );
  });
  Plotly.newPlot(elId, traces, { ...BASE_LAYOUT, height: 320,
    xaxis: { ...BASE_LAYOUT.xaxis, title: 'Days' },
    yaxis: { ...BASE_LAYOUT.yaxis, title: 'Δ outcome score (model-estimated)' } }, CONFIG);
}

function hexToRgb(hex) {
  const m = hex.replace('#', '').match(/.{2}/g) || ['00', '00', '00'];
  return m.map(h => parseInt(h, 16)).join(',');
}
