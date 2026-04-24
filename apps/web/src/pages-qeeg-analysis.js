/**
 * qEEG Analyzer — detail-panel renderer + upload/analyze flow
 *
 * Consumes the `AnalysisOut` shape defined in the cross-repo CONTRACT:
 * `C:/Users/yildi/OneDrive/Desktop/deepsynaps_qeeg_analyzer/CONTRACT.md` §3.
 *
 * Hosts the six CONTRACT §4 panels (quality strip, SpecParam, eLORETA ROI,
 * normative z-score heatmap, asymmetry/graph strip, AI narrative + citations).
 * Each panel guards against null fields so the renderer degrades gracefully
 * against legacy records that only carry the 5 global band-power values.
 *
 * Pure-render functions (no DOM access) are exported for unit testing under
 * `node --test`. Flow orchestrators that touch `document`, `window`, `setTimeout`
 * and `fetch` stay lazy so the tests can run without a DOM.
 */

// ── Desikan-Killiany ROI → lobe mapping (68 cortical ROIs) ────────────────────
// Values are the lobe bucket the UI groups ROIs into. Keys are normalized to
// lower-case without the "lh-"/"rh-" prefix so both sides fold into one group.
const DK_LOBE_MAP = {
  // Frontal
  'superiorfrontal': 'frontal',
  'rostralmiddlefrontal': 'frontal',
  'caudalmiddlefrontal': 'frontal',
  'parsopercularis': 'frontal',
  'parstriangularis': 'frontal',
  'parsorbitalis': 'frontal',
  'lateralorbitofrontal': 'frontal',
  'medialorbitofrontal': 'frontal',
  'precentral': 'frontal',
  'paracentral': 'frontal',
  'frontalpole': 'frontal',
  // Parietal
  'superiorparietal': 'parietal',
  'inferiorparietal': 'parietal',
  'supramarginal': 'parietal',
  'postcentral': 'parietal',
  'precuneus': 'parietal',
  // Temporal
  'superiortemporal': 'temporal',
  'middletemporal': 'temporal',
  'inferiortemporal': 'temporal',
  'bankssts': 'temporal',
  'fusiform': 'temporal',
  'transversetemporal': 'temporal',
  'entorhinal': 'temporal',
  'temporalpole': 'temporal',
  'parahippocampal': 'temporal',
  // Occipital
  'lateraloccipital': 'occipital',
  'lingual': 'occipital',
  'cuneus': 'occipital',
  'pericalcarine': 'occipital',
  // Cingulate
  'rostralanteriorcingulate': 'cingulate',
  'caudalanteriorcingulate': 'cingulate',
  'posteriorcingulate': 'cingulate',
  'isthmuscingulate': 'cingulate',
  // Insular
  'insula': 'insular',
};

const LOBE_ORDER = ['frontal', 'parietal', 'temporal', 'occipital', 'cingulate', 'insular'];
const LOBE_COLORS = {
  frontal: '#8b5cf6',
  parietal: '#00d4bc',
  temporal: '#3b82f6',
  occipital: '#f59e0b',
  cingulate: '#ec4899',
  insular: '#6366f1',
};

const BANDS = ['delta', 'theta', 'alpha', 'beta', 'gamma'];
const BAND_COLORS = {
  delta: '#6366f1',
  theta: '#8b5cf6',
  alpha: '#00d4bc',
  beta: '#3b82f6',
  gamma: '#f59e0b',
};

// ── Pure helpers (exported for tests) ─────────────────────────────────────────

export function classifyDkRoi(name) {
  if (!name || typeof name !== 'string') return null;
  const stripped = name
    .toLowerCase()
    .replace(/^(lh|rh|left|right)[-_]?/, '')
    .replace(/[-_ ]/g, '');
  return DK_LOBE_MAP[stripped] || null;
}

export function groupRoisByLobe(roiPowerMap) {
  const grouped = { frontal: [], parietal: [], temporal: [], occipital: [], cingulate: [], insular: [], other: [] };
  if (!roiPowerMap || typeof roiPowerMap !== 'object') return grouped;
  for (const [roi, val] of Object.entries(roiPowerMap)) {
    const lobe = classifyDkRoi(roi) || 'other';
    grouped[lobe].push({ roi, value: Number(val) || 0 });
  }
  for (const lobe of Object.keys(grouped)) {
    grouped[lobe].sort((a, b) => b.value - a.value);
  }
  return grouped;
}

/**
 * Colour the cell background for a z-score using a diverging red/blue scheme.
 *   |z| >= 2.58 → dark red (pos) / dark blue (neg)
 *   1.96 <= |z| < 2.58 → light red / light blue
 *   else → neutral.
 * Returns {bg, fg} CSS colour strings.
 */
export function zscoreCellStyle(z) {
  if (z == null || Number.isNaN(z)) return { bg: 'var(--border)', fg: 'var(--text-tertiary)' };
  const abs = Math.abs(z);
  if (abs >= 2.58) {
    return z > 0
      ? { bg: 'rgba(220, 38, 38, 0.85)', fg: '#fff' }
      : { bg: 'rgba(37, 99, 235, 0.85)', fg: '#fff' };
  }
  if (abs >= 1.96) {
    return z > 0
      ? { bg: 'rgba(248, 113, 113, 0.55)', fg: '#fff' }
      : { bg: 'rgba(96, 165, 250, 0.55)', fg: '#fff' };
  }
  return { bg: 'rgba(148, 163, 184, 0.12)', fg: 'var(--text-secondary)' };
}

/**
 * Colour the 1/f aperiodic slope.
 *   < -2.5 or > -0.5 → red (extreme)
 *   else → green.
 */
export function slopeColor(slope) {
  if (slope == null || Number.isNaN(slope)) return 'var(--text-tertiary)';
  if (slope < -2.5 || slope > -0.5) return 'var(--red)';
  return 'var(--green)';
}

/**
 * Colour PAF relative to the adult "normal" 9–11 Hz window.
 */
export function pafColor(hz) {
  if (hz == null || Number.isNaN(hz)) return 'var(--text-tertiary)';
  if (hz >= 9 && hz <= 11) return 'var(--green)';
  return 'var(--amber)';
}

// ── Payload shape helpers ─────────────────────────────────────────────────────

export function isLegacyAnalysis(analysis) {
  if (!analysis || typeof analysis !== 'object') return true;
  const a = analysis;
  return !a.quality_metrics && !a.aperiodic && !a.source_roi
    && !a.normative_zscores && !a.asymmetry && !a.graph_metrics
    && !a.connectivity;
}

/**
 * Pull per-channel absolute_uv2 values from the pipeline-shape band_powers and
 * fall back to the legacy flat {alpha_power, …} fields if the full shape is
 * missing. Returns {Fp1:{alpha:µV²,…}, …}.
 */
export function perChannelBandPowers(analysis, channels = []) {
  const out = {};
  if (!analysis) return out;
  const bp = analysis.band_powers;
  const bands = bp && bp.bands ? bp.bands : null;
  if (bands) {
    const chKeys = new Set(channels);
    // Collect channel names across every band so "legacy mode" doesn't silently
    // drop electrodes that appear in only one band's channel map.
    for (const bandKey of Object.keys(bands)) {
      const band = bands[bandKey];
      if (!band || !band.channels) continue;
      for (const ch of Object.keys(band.channels)) chKeys.add(ch);
    }
    for (const ch of chKeys) {
      out[ch] = {};
      for (const b of BANDS) {
        const band = bands[b];
        const entry = band?.channels?.[ch];
        if (entry && typeof entry === 'object') {
          out[ch][b] = Number(entry.absolute_uv2) || 0;
        } else if (typeof entry === 'number') {
          out[ch][b] = entry;
        }
      }
    }
  }
  return out;
}

// ── Stop polling helper (exported so tests can assert the loop exits) ────────

export async function pollAnalysisUntilDone(analysisId, apiClient, opts = {}) {
  const {
    intervalMs = 2000,
    timeoutMs = 60000,
    onTick = null,
    now = () => Date.now(),
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  } = opts;
  const started = now();
  let attempt = 0;
  while (true) {
    attempt += 1;
    const current = await apiClient.getQEEGAnalysis(analysisId);
    const status = current?.analysis_status || current?.status;
    if (onTick) onTick({ attempt, status, elapsedMs: now() - started, analysis: current });
    if (status === 'completed' || status === 'failed') {
      return current;
    }
    if (now() - started >= timeoutMs) {
      const err = new Error('qEEG analysis polling timed out');
      err.code = 'polling_timeout';
      err.lastAnalysis = current;
      throw err;
    }
    await sleep(intervalMs);
  }
}

// ── Safe HTML escape ─────────────────────────────────────────────────────────

export function esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Panel 1: Pipeline quality strip ──────────────────────────────────────────

export function renderQualityStrip(analysis) {
  const q = analysis?.quality_metrics;
  if (!q) return '';
  const bads = Array.isArray(q.bad_channels) ? q.bad_channels : [];
  const badChips = bads.length
    ? bads.map((c) => `<span class="qeeg-pill qeeg-pill--warn">${esc(c)}</span>`).join('')
    : '<span class="qeeg-pill qeeg-pill--ok">0 rejected</span>';
  const labels = q.ica_labels_dropped && typeof q.ica_labels_dropped === 'object'
    ? q.ica_labels_dropped
    : {};
  const totalLabelDropped = Object.values(labels).reduce((s, v) => s + (Number(v) || 0), 0) || 1;
  const labelBars = Object.entries(labels).map(([lab, n]) => {
    const pct = Math.round(((Number(n) || 0) / totalLabelDropped) * 100);
    return `<div class="qeeg-ic-bar">
      <span class="qeeg-ic-bar__label">${esc(lab)}</span>
      <div class="qeeg-ic-bar__track"><div class="qeeg-ic-bar__fill" style="width:${pct}%"></div></div>
      <span class="qeeg-ic-bar__val">${Number(n) || 0}</span>
    </div>`;
  }).join('');
  const retained = q.n_epochs_retained != null ? q.n_epochs_retained : '—';
  const total = q.n_epochs_total != null ? q.n_epochs_total : '—';
  const sfIn = q.sfreq_input != null ? `${q.sfreq_input} Hz` : '—';
  const sfOut = q.sfreq_output != null ? `${q.sfreq_output} Hz` : '—';
  const bp = Array.isArray(q.bandpass) ? `${q.bandpass[0]}–${q.bandpass[1]} Hz` : '—';
  const notch = q.notch_hz != null ? `${q.notch_hz} Hz` : '—';
  const pipeVersion = analysis.pipeline_version || q.pipeline_version || '—';
  const normVersion = analysis.norm_db_version || '—';
  return `<section class="qeeg-panel qeeg-panel--quality" data-section="quality">
    <header class="qeeg-panel__hdr">
      <h4>Pipeline quality</h4>
      <span class="qeeg-panel__sub">research / wellness use</span>
    </header>
    <div class="qeeg-quality-grid">
      <div class="qeeg-quality-block">
        <div class="qeeg-quality-block__label">Rejected channels</div>
        <div class="qeeg-pill-row">${badChips}</div>
      </div>
      <div class="qeeg-quality-block">
        <div class="qeeg-quality-block__label">ICA dropped (by label)</div>
        ${labelBars || '<span class="qeeg-muted">none</span>'}
      </div>
      <div class="qeeg-quality-block">
        <div class="qeeg-quality-block__label">Epochs retained</div>
        <div class="qeeg-quality-block__value">${esc(retained)} <span class="qeeg-muted">/ ${esc(total)}</span></div>
      </div>
      <div class="qeeg-quality-block">
        <div class="qeeg-quality-block__label">Sample rate</div>
        <div class="qeeg-quality-block__value">${esc(sfIn)} → ${esc(sfOut)}</div>
      </div>
      <div class="qeeg-quality-block">
        <div class="qeeg-quality-block__label">Bandpass · Notch</div>
        <div class="qeeg-quality-block__value">${esc(bp)} · ${esc(notch)}</div>
      </div>
    </div>
    <footer class="qeeg-panel__footer">
      <span class="qeeg-badge">pipeline ${esc(pipeVersion)}</span>
      <span class="qeeg-badge">norm-db ${esc(normVersion)}</span>
    </footer>
  </section>`;
}

// ── Panel 2: SpecParam (aperiodic + peak alpha) ──────────────────────────────

export function renderSpecParam(analysis) {
  const aper = analysis?.aperiodic;
  const paf = analysis?.peak_alpha_freq;
  if (!aper && !paf) return '';
  const slopes = aper?.slope || {};
  const rsq = aper?.r_squared || {};
  const channels = new Set([
    ...Object.keys(slopes),
    ...Object.keys(paf || {}),
  ]);
  if (channels.size === 0) return '';
  const rows = [...channels].sort().map((ch) => {
    const s = slopes[ch];
    const p = paf ? paf[ch] : null;
    const sFmt = s == null ? '—' : Number(s).toFixed(2);
    const pFmt = p == null ? '—' : `${Number(p).toFixed(2)} Hz`;
    const r2 = rsq[ch];
    return `<tr>
      <td class="qeeg-mono">${esc(ch)}</td>
      <td class="qeeg-mono" style="color:${slopeColor(s)}">${sFmt}</td>
      <td class="qeeg-mono qeeg-muted">${r2 != null ? Number(r2).toFixed(2) : '—'}</td>
      <td class="qeeg-mono" style="color:${pafColor(p)}">${pFmt}</td>
    </tr>`;
  }).join('');
  return `<section class="qeeg-panel" data-section="specparam">
    <header class="qeeg-panel__hdr">
      <h4>SpecParam — 1/f slope &amp; peak alpha</h4>
      <span class="qeeg-panel__sub">slope colour-coded at &lt; −2.5 / &gt; −0.5; PAF green within 9–11 Hz</span>
    </header>
    <div class="qeeg-specparam-scroll">
      <table class="qeeg-specparam-table">
        <thead><tr><th>Ch</th><th>1/f slope</th><th>R²</th><th>PAF</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </section>`;
}

// ── Panel 3: eLORETA ROI (Desikan-Killiany) ──────────────────────────────────

export function renderSourceRoi(analysis) {
  const src = analysis?.source_roi;
  if (!src || !src.roi_band_power) return '';
  const method = src.method || analysis?.source_roi_method || null;
  const bandBtns = BANDS.map((b) => `
    <button type="button" class="qeeg-roi-tab" data-band="${b}" aria-pressed="false">
      <span class="qeeg-dot" style="background:${BAND_COLORS[b]}"></span>${b}
    </button>`).join('');
  const banded = {};
  for (const band of BANDS) {
    const roiMap = src.roi_band_power[band];
    if (!roiMap) continue;
    banded[band] = groupRoisByLobe(roiMap);
  }
  const firstAvail = Object.keys(banded)[0] || 'alpha';
  const panels = Object.entries(banded).map(([band, grouped]) => {
    const maxV = Math.max(1e-9, ...Object.values(grouped).flat().map((o) => o.value));
    const lobeCards = LOBE_ORDER.map((lobe) => {
      const rois = grouped[lobe] || [];
      if (!rois.length) return '';
      const rows = rois.map(({ roi, value }) => {
        const pct = Math.max(2, Math.round((value / maxV) * 100));
        return `<div class="qeeg-roi-row">
          <span class="qeeg-roi-row__name" title="${esc(roi)}">${esc(roi)}</span>
          <div class="qeeg-roi-row__bar" style="background:${LOBE_COLORS[lobe]}33">
            <div style="width:${pct}%;background:${LOBE_COLORS[lobe]}"></div>
          </div>
          <span class="qeeg-roi-row__val qeeg-mono">${value.toFixed(2)}</span>
        </div>`;
      }).join('');
      return `<div class="qeeg-roi-lobe">
        <div class="qeeg-roi-lobe__hdr" style="color:${LOBE_COLORS[lobe]}">${lobe} <span class="qeeg-muted">· ${rois.length}</span></div>
        ${rows}
      </div>`;
    }).join('');
    return `<div class="qeeg-roi-body" data-roi-band="${band}" ${band === firstAvail ? '' : 'hidden'}>${lobeCards || '<div class="qeeg-muted">No ROIs mapped.</div>'}</div>`;
  }).join('');
  return `<section class="qeeg-panel" data-section="source-roi">
    <header class="qeeg-panel__hdr">
      <h4>Source-level ROI power (Desikan-Killiany)</h4>
      <span class="qeeg-panel__sub">${method ? `method: ${esc(method)}` : 'source method unreported'}</span>
    </header>
    <div class="qeeg-roi-tabs" role="tablist">${bandBtns}</div>
    ${panels}
  </section>`;
}

// ── Panel 4: Normative z-score heatmap ───────────────────────────────────────

export function renderZscoreHeatmap(analysis) {
  const nz = analysis?.normative_zscores;
  if (!nz || !nz.spectral || !nz.spectral.bands) return '';
  const bands = nz.spectral.bands;
  // Collect all channels across bands (pipeline emits only per-band channels).
  const channels = new Set();
  for (const b of BANDS) {
    const abs = bands[b]?.absolute_uv2;
    if (abs) Object.keys(abs).forEach((ch) => channels.add(ch));
  }
  if (channels.size === 0) return '';
  const flagMap = {};
  const flagged = Array.isArray(nz.flagged) ? nz.flagged : [];
  for (const f of flagged) {
    const m = (f.metric || '').match(/spectral\.bands\.(\w+)\.absolute_uv2/);
    if (!m) continue;
    flagMap[`${m[1]}:${f.channel}`] = f;
  }
  const chList = [...channels].sort();
  const header = BANDS.map((b) => `<th class="qeeg-mono">${b}</th>`).join('');
  const rows = chList.map((ch) => {
    const tds = BANDS.map((b) => {
      const z = bands[b]?.absolute_uv2?.[ch];
      const style = zscoreCellStyle(z);
      const zFmt = z == null ? '—' : Number(z).toFixed(2);
      const flag = flagMap[`${b}:${ch}`];
      const title = flag
        ? `${flag.metric} · ch=${flag.channel} · z=${Number(flag.z).toFixed(2)}`
        : `spectral.bands.${b}.absolute_uv2 · ${ch} · z=${zFmt}`;
      return `<td class="qeeg-z-cell qeeg-mono" style="background:${style.bg};color:${style.fg}" title="${esc(title)}">${zFmt}</td>`;
    }).join('');
    return `<tr><th class="qeeg-mono">${esc(ch)}</th>${tds}</tr>`;
  }).join('');
  return `<section class="qeeg-panel" data-section="zscores">
    <header class="qeeg-panel__hdr">
      <h4>Normative z-scores</h4>
      <span class="qeeg-panel__sub">|z| ≥ 1.96 shaded · ≥ 2.58 darker — for clinical reference only</span>
    </header>
    <div class="qeeg-z-scroll">
      <table class="qeeg-z-heatmap">
        <thead><tr><th></th>${header}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <footer class="qeeg-panel__footer">
      <span class="qeeg-z-legend"><span class="qeeg-z-swatch qeeg-z-swatch--neg-strong"></span>z ≤ −2.58</span>
      <span class="qeeg-z-legend"><span class="qeeg-z-swatch qeeg-z-swatch--neg"></span>−2.58 &lt; z ≤ −1.96</span>
      <span class="qeeg-z-legend"><span class="qeeg-z-swatch qeeg-z-swatch--neutral"></span>|z| &lt; 1.96</span>
      <span class="qeeg-z-legend"><span class="qeeg-z-swatch qeeg-z-swatch--pos"></span>1.96 ≤ z &lt; 2.58</span>
      <span class="qeeg-z-legend"><span class="qeeg-z-swatch qeeg-z-swatch--pos-strong"></span>z ≥ 2.58</span>
    </footer>
  </section>`;
}

// ── Panel 5: Asymmetry + graph strip ─────────────────────────────────────────

export function renderAsymmetryGraph(analysis) {
  const asym = analysis?.asymmetry;
  const graph = analysis?.graph_metrics;
  if (!asym && !graph) return '';
  const faa34 = asym?.frontal_alpha_F3_F4;
  const faa78 = asym?.frontal_alpha_F7_F8;
  const asymCard = asym ? `
    <div class="qeeg-card qeeg-card--asym">
      <div class="qeeg-card__hdr">Frontal alpha asymmetry</div>
      <div class="qeeg-asym-row">
        <span>F3 · F4</span>
        <span class="qeeg-mono">${faa34 != null ? Number(faa34).toFixed(3) : '—'}</span>
        <span class="qeeg-asym-hint">${faa34 != null && faa34 > 0 ? 'left hypoactivation — relevant to depression' : (faa34 != null && faa34 < 0 ? 'right hypoactivation' : '')}</span>
      </div>
      <div class="qeeg-asym-row">
        <span>F7 · F8</span>
        <span class="qeeg-mono">${faa78 != null ? Number(faa78).toFixed(3) : '—'}</span>
        <span class="qeeg-asym-hint">${faa78 != null && faa78 > 0 ? 'left hypoactivation pattern' : (faa78 != null && faa78 < 0 ? 'right hypoactivation' : '')}</span>
      </div>
      <div class="qeeg-muted qeeg-asym-foot">ln(F4) − ln(F3); for clinical reference only.</div>
    </div>` : '';
  let graphCard = '';
  if (graph && typeof graph === 'object') {
    const availBands = BANDS.filter((b) => graph[b]);
    const rows = availBands.map((b) => {
      const g = graph[b] || {};
      const fmt = (v) => (v == null || Number.isNaN(Number(v)) ? '—' : Number(v).toFixed(3));
      return `<tr><td class="qeeg-mono">${b}</td><td class="qeeg-mono">${fmt(g.clustering_coef)}</td><td class="qeeg-mono">${fmt(g.char_path_length)}</td><td class="qeeg-mono">${fmt(g.small_worldness)}</td></tr>`;
    }).join('');
    graphCard = `
      <div class="qeeg-card qeeg-card--graph">
        <div class="qeeg-card__hdr">Graph metrics</div>
        <table class="qeeg-graph-table">
          <thead><tr><th>band</th><th>clustering</th><th>CPL</th><th>small-worldness</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="4" class="qeeg-muted">no bands</td></tr>'}</tbody>
        </table>
      </div>`;
  }
  return `<section class="qeeg-panel" data-section="asymmetry-graph">
    <header class="qeeg-panel__hdr">
      <h4>Asymmetry &amp; network metrics</h4>
    </header>
    <div class="qeeg-two-col">${asymCard}${graphCard}</div>
  </section>`;
}

// ── Panel 6: AI narrative + citations ────────────────────────────────────────

export function renderAiNarrative(aiReport, analysis) {
  // aiReport may be null until user clicks "Generate". The shell is always
  // rendered so the action button has a home.
  const narrative = aiReport?.ai_narrative || aiReport?.data || null;
  const refs = Array.isArray(aiReport?.literature_refs) ? aiReport.literature_refs : [];
  const model = aiReport?.model_used || '—';
  const hash = aiReport?.prompt_hash || '—';
  const disclaimer = narrative?.disclaimer
    || 'For clinical reference only — not a diagnosis. Research/wellness use.';
  const completed = analysis?.analysis_status === 'completed';
  const btnDisabled = !completed ? 'disabled aria-disabled="true"' : '';
  const hasNarrative = !!narrative;
  const summary = narrative?.executive_summary || '';
  const bandAnalysis = narrative?.band_analysis || {};
  const biomarkers = Array.isArray(narrative?.key_biomarkers) ? narrative.key_biomarkers : [];
  const protocolRecs = Array.isArray(narrative?.protocol_recommendations)
    ? narrative.protocol_recommendations : [];
  const clinicalFlags = Array.isArray(narrative?.clinical_flags) ? narrative.clinical_flags : [];
  const findings = Array.isArray(narrative?.findings) ? narrative.findings : [];
  const confidence = narrative?.confidence_level || null;

  const renderCitations = (ids = []) => {
    if (!Array.isArray(ids) || !ids.length) return '';
    return ' ' + ids.map((n) => {
      const ref = refs.find((r) => r.n === n || r.index === n);
      const url = ref?.url || (ref?.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(ref.pmid)}/` : (ref?.doi ? `https://doi.org/${encodeURIComponent(ref.doi)}` : '#'));
      return `<sup><a class="qeeg-cite" href="${esc(url)}" target="_blank" rel="noopener">[${esc(n)}]</a></sup>`;
    }).join('');
  };

  const bandBlock = Object.entries(bandAnalysis).map(([b, txt]) => `
    <div class="qeeg-narr-row"><span class="qeeg-narr-row__band" style="color:${BAND_COLORS[b] || 'var(--text-secondary)'}">${esc(b)}</span><span>${esc(txt?.observation || txt?.text || txt || '')}${renderCitations(txt?.citations)}</span></div>
  `).join('');

  const findingBlock = findings.map((f) => `
    <div class="qeeg-narr-row"><span class="qeeg-narr-row__band">${esc(f.region || f.band || '')}</span><span>${esc(f.observation || '')}${renderCitations(f.citations)}</span></div>
  `).join('');

  const bioBlock = biomarkers.length
    ? `<ul class="qeeg-bullet">${biomarkers.map((b) => `<li>${esc(typeof b === 'string' ? b : (b.text || b.label || ''))}${renderCitations(b.citations)}</li>`).join('')}</ul>`
    : '';

  const protocolBlock = protocolRecs.length
    ? `<ul class="qeeg-bullet">${protocolRecs.map((p) => `<li>${esc(typeof p === 'string' ? p : (p.text || p.protocol || p.modality || ''))}${renderCitations(p.citations)}</li>`).join('')}</ul>`
    : '';

  const flagBlock = clinicalFlags.length
    ? `<ul class="qeeg-bullet qeeg-bullet--warn">${clinicalFlags.map((f) => `<li>${esc(typeof f === 'string' ? f : (f.text || f.label || ''))}</li>`).join('')}</ul>`
    : '';

  const refList = refs.length
    ? `<ol class="qeeg-refs">${refs.map((r) => {
        const url = r.url || (r.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(r.pmid)}/` : (r.doi ? `https://doi.org/${encodeURIComponent(r.doi)}` : '#'));
        const authors = r.authors ? ` ${esc(r.authors)}.` : '';
        const journal = r.journal ? ` <em>${esc(r.journal)}</em>` : '';
        const year = r.year ? ` (${esc(r.year)})` : '';
        return `<li value="${esc(r.n || r.index || '')}"><a href="${esc(url)}" target="_blank" rel="noopener">${esc(r.title || url)}</a>${authors}${journal}${year}</li>`;
      }).join('')}</ol>`
    : '';

  return `<section class="qeeg-panel qeeg-panel--ai" data-section="ai-narrative">
    <header class="qeeg-panel__hdr">
      <h4>AI interpretation</h4>
      <span class="qeeg-panel__sub">grounded in the DeepSynaps literature DB</span>
    </header>
    <div class="qeeg-ai-actions">
      <button class="btn btn-primary btn-sm" id="qeeg-ai-btn" data-action="generate-ai" ${btnDisabled}>
        ${hasNarrative ? 'Regenerate AI interpretation' : 'Generate AI interpretation'}
      </button>
      ${!completed ? '<span class="qeeg-muted">Available once analysis is completed.</span>' : ''}
    </div>
    ${hasNarrative ? `
      ${confidence ? `<div class="qeeg-confidence qeeg-confidence--${esc(confidence)}">confidence: ${esc(confidence)}</div>` : ''}
      ${summary ? `<div class="qeeg-narrative--summary">${esc(summary)}</div>` : ''}
      ${findingBlock ? `<h5 class="qeeg-narr-h">Findings</h5>${findingBlock}` : ''}
      ${bandBlock ? `<h5 class="qeeg-narr-h">By band</h5>${bandBlock}` : ''}
      ${bioBlock ? `<h5 class="qeeg-narr-h">Key biomarkers</h5>${bioBlock}` : ''}
      ${flagBlock ? `<h5 class="qeeg-narr-h">Clinical flags</h5>${flagBlock}` : ''}
      ${protocolBlock ? `<h5 class="qeeg-narr-h">Protocol suggestions</h5>${protocolBlock}` : ''}
      ${refList ? `<h5 class="qeeg-narr-h">References</h5>${refList}` : ''}
      <footer class="qeeg-panel__footer qeeg-panel__footer--mono">
        <span class="qeeg-muted">model: ${esc(model)} · prompt: ${esc(hash)}</span>
      </footer>
      <div class="qeeg-disclaimer">${esc(disclaimer)}</div>
    ` : '<div class="qeeg-muted">No AI narrative generated yet.</div>'}
  </section>`;
}

// ── Band-power card (shared for legacy + modern) ─────────────────────────────

function renderBandPowerCard(analysis) {
  const bands = analysis?.band_powers?.bands;
  if (bands) {
    // Aggregate per-channel absolute_uv2 into mean and show a quick bar.
    const entries = BANDS.map((b) => {
      const ch = bands[b]?.channels;
      if (!ch) return { band: b, mean: null };
      const vals = Object.values(ch).map((e) => (typeof e === 'number' ? e : Number(e?.absolute_uv2))).filter((v) => !Number.isNaN(v));
      const mean = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
      return { band: b, mean };
    });
    const max = Math.max(1e-9, ...entries.map((e) => (e.mean == null ? 0 : e.mean)));
    const rows = entries.map((e) => {
      const pct = e.mean == null ? 0 : Math.max(2, Math.round((e.mean / max) * 100));
      return `<div class="qeeg-bp-row">
        <span class="qeeg-bp-row__label" style="color:${BAND_COLORS[e.band]}">${e.band}</span>
        <div class="qeeg-bp-row__bar" style="background:${BAND_COLORS[e.band]}22">
          <div style="width:${pct}%;background:${BAND_COLORS[e.band]}"></div>
        </div>
        <span class="qeeg-bp-row__val qeeg-mono">${e.mean == null ? '—' : e.mean.toFixed(2)}</span>
      </div>`;
    }).join('');
    return `<section class="qeeg-panel" data-section="band-power">
      <header class="qeeg-panel__hdr"><h4>Band power (mean across channels, µV²)</h4></header>
      <div class="qeeg-bp-grid">${rows}</div>
    </section>`;
  }
  // Fall back to the legacy global values.
  const legacy = [
    { band: 'delta', val: analysis?.delta_power },
    { band: 'theta', val: analysis?.theta_power },
    { band: 'alpha', val: analysis?.alpha_power },
    { band: 'beta', val: analysis?.beta_power },
    { band: 'gamma', val: analysis?.gamma_power },
  ];
  const max = Math.max(1e-9, ...legacy.map((e) => Number(e.val) || 0));
  const rows = legacy.map((e) => {
    const v = Number(e.val) || 0;
    const pct = v === 0 ? 2 : Math.max(2, Math.round((v / max) * 100));
    return `<div class="qeeg-bp-row">
      <span class="qeeg-bp-row__label" style="color:${BAND_COLORS[e.band]}">${e.band}</span>
      <div class="qeeg-bp-row__bar" style="background:${BAND_COLORS[e.band]}22">
        <div style="width:${pct}%;background:${BAND_COLORS[e.band]}"></div>
      </div>
      <span class="qeeg-bp-row__val qeeg-mono">${v ? v.toFixed(2) : '—'}</span>
    </div>`;
  }).join('');
  return `<section class="qeeg-panel" data-section="band-power">
    <header class="qeeg-panel__hdr"><h4>Band power (legacy global values, µV²)</h4></header>
    <div class="qeeg-bp-grid">${rows}</div>
  </section>`;
}

// ── Full analyzer detail panel ───────────────────────────────────────────────

export function renderAnalyzerDetail(analysis, aiReport = null) {
  if (!analysis) return '<div class="qeeg-muted">No analysis loaded.</div>';
  const status = analysis.analysis_status || analysis.status || 'unknown';
  const statusBadge = `<span class="qeeg-status qeeg-status--${esc(status)}">${esc(status)}</span>`;
  const legacy = isLegacyAnalysis(analysis);
  const header = `<div class="qeeg-analyzer-hdr">
    <div>
      <div class="qeeg-analyzer-hdr__title">qEEG analysis</div>
      <div class="qeeg-analyzer-hdr__meta qeeg-muted">${esc(analysis.id || '').slice(0, 8)}… · ${esc(analysis.eyes_condition || '—').replace(/_/g, ' ')} · ${esc(analysis.recording_date || analysis.created_at || '').slice(0, 10)}</div>
    </div>
    <div class="qeeg-analyzer-hdr__actions">
      ${statusBadge}
      <button class="btn btn-sm" data-action="rerun-advanced">Re-run advanced analyses</button>
    </div>
  </div>`;
  if (status === 'failed') {
    return `${header}
      <div class="qeeg-panel qeeg-panel--error">
        <h4>Analysis failed</h4>
        <div>${esc(analysis.analysis_error || 'Unknown error — rerun the pipeline.')}</div>
      </div>`;
  }
  const panels = [
    renderBandPowerCard(analysis),
    renderQualityStrip(analysis),
    renderSpecParam(analysis),
    renderSourceRoi(analysis),
    renderZscoreHeatmap(analysis),
    renderAsymmetryGraph(analysis),
    renderAiNarrative(aiReport, analysis),
  ].filter(Boolean).join('');
  const legacyBanner = legacy
    ? '<div class="qeeg-legacy-ribbon">legacy record — only band power available. Six advanced panels appear once the new pipeline is run.</div>'
    : '';
  return `${header}${legacyBanner}${panels}`;
}

// ── Compare tab ───────────────────────────────────────────────────────────────

export function renderComparison(cmp) {
  if (!cmp) return '<div class="qeeg-muted">No comparison yet.</div>';
  const deltas = cmp.delta_powers || {};
  const summary = cmp.improvement_summary || cmp.summary || {};
  const narrative = cmp.ai_comparison_narrative || cmp.ai_narrative || null;
  const bandRows = BANDS.map((b) => {
    const d = deltas[b];
    const fmt = d == null ? '—' : (Number(d) >= 0 ? `+${Number(d).toFixed(2)}` : Number(d).toFixed(2));
    const color = d == null ? 'var(--text-tertiary)' : (Number(d) > 0 ? 'var(--green)' : (Number(d) < 0 ? 'var(--red)' : 'var(--text-tertiary)'));
    return `<tr><td class="qeeg-mono">${b}</td><td class="qeeg-mono" style="color:${color}">${fmt}</td></tr>`;
  }).join('');
  const summaryRows = Object.entries(summary).map(([k, v]) =>
    `<tr><td>${esc(k)}</td><td class="qeeg-mono">${esc(v)}</td></tr>`
  ).join('');
  return `<section class="qeeg-panel" data-section="compare">
    <header class="qeeg-panel__hdr"><h4>Compare — baseline vs follow-up</h4></header>
    <div class="qeeg-two-col">
      <div class="qeeg-card">
        <div class="qeeg-card__hdr">Δ Band power</div>
        <table class="qeeg-graph-table"><thead><tr><th>band</th><th>Δ µV²</th></tr></thead><tbody>${bandRows}</tbody></table>
      </div>
      <div class="qeeg-card">
        <div class="qeeg-card__hdr">Improvement summary</div>
        <table class="qeeg-graph-table"><tbody>${summaryRows || '<tr><td colspan="2" class="qeeg-muted">no summary</td></tr>'}</tbody></table>
      </div>
    </div>
    ${narrative ? `<div class="qeeg-narrative--summary">${esc(typeof narrative === 'string' ? narrative : JSON.stringify(narrative))}</div>` : ''}
  </section>`;
}

// ── Survey build (FormData payload helper) ────────────────────────────────────

export function buildSurveyFromForm(doc = (typeof document !== 'undefined' ? document : null)) {
  if (!doc) return {};
  const read = (id) => {
    const el = doc.getElementById(id);
    if (!el) return null;
    const v = el.value;
    return v == null || v === '' ? null : v;
  };
  const num = (id) => {
    const v = read(id);
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    eyes_condition: read('qr-eyes'),
    eeg_device: read('qr-device'),
    channels: num('qr-channels'),
    duration_minutes: num('qr-duration'),
    notes: read('qr-notes'),
    recording_date: read('qr-date'),
  };
}

// ── File-type detection ──────────────────────────────────────────────────────

export function isEdfLikeFile(filename) {
  if (!filename || typeof filename !== 'string') return false;
  const lower = filename.toLowerCase();
  return ['.edf', '.edf+', '.bdf', '.vhdr', '.set', '.fif'].some((ext) => lower.endsWith(ext));
}
