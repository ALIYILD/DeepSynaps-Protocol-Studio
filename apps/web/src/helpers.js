// ── Render helpers ─────────────────────────────────────────────────────────

// Clinical-domain badges — explicit, scannable at a glance
export function evidenceBadge(grade) {
  const map = {
    'EV-A': { bg: 'rgba(0,212,188,0.12)',  color: 'var(--teal)',          label: 'EV-A', title: 'Grade A — High quality evidence (RCTs, systematic reviews)' },
    'EV-B': { bg: 'rgba(74,158,255,0.12)', color: 'var(--blue)',          label: 'EV-B', title: 'Grade B — Moderate evidence (controlled studies)' },
    'EV-C': { bg: 'rgba(255,181,71,0.12)', color: 'var(--amber)',         label: 'EV-C', title: 'Grade C — Limited evidence (case series, expert opinion)' },
    'EV-D': { bg: 'rgba(255,107,107,0.12)',color: 'var(--red)',           label: 'EV-D', title: 'Grade D — Insufficient evidence — use with caution' },
    // Legacy single-letter grades
    'A': { bg: 'rgba(0,212,188,0.12)',  color: 'var(--teal)',  label: 'EV-A', title: 'Grade A — High quality evidence (RCTs, systematic reviews)' },
    'B': { bg: 'rgba(74,158,255,0.12)', color: 'var(--blue)',  label: 'EV-B', title: 'Grade B — Moderate evidence (controlled studies)' },
    'C': { bg: 'rgba(255,181,71,0.12)', color: 'var(--amber)', label: 'EV-C', title: 'Grade C — Limited evidence (case series, expert opinion)' },
    'D': { bg: 'rgba(255,107,107,0.12)',color: 'var(--red)',   label: 'EV-D', title: 'Grade D — Insufficient evidence — use with caution' },
  };
  const s = map[grade] || { bg: 'rgba(255,255,255,0.06)', color: 'var(--text-tertiary)', label: grade || '—', title: 'Evidence grade not specified' };
  return `<span title="${s.title}" style="cursor:help;font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;background:${s.bg};color:${s.color};font-family:var(--font-mono);letter-spacing:0.5px">${s.label}</span>`;
}

export function labelBadge(onLabel) {
  const on = String(onLabel).toLowerCase().startsWith('on');
  return on
    ? `<span title="On-label: this treatment is approved for the stated indication" style="cursor:help;font-size:10px;font-weight:600;padding:2px 7px;border-radius:4px;background:rgba(0,212,188,0.08);color:var(--teal)">On-label</span>`
    : `<span title="Off-label: this treatment is used outside its approved indication — additional documentation required" style="cursor:help;font-size:10px;font-weight:600;padding:2px 7px;border-radius:4px;background:rgba(255,181,71,0.1);color:var(--amber)">⚠ Off-label</span>`;
}

export function safetyBadge(warnings = []) {
  if (!warnings || warnings.length === 0) return '';
  const tip = warnings.slice(0, 5).join(' | ');
  return `<span title="${tip}" style="cursor:help;font-size:10px;font-weight:600;padding:2px 7px;border-radius:4px;background:rgba(255,107,107,0.1);color:var(--red)">⚠ ${warnings.length} flag${warnings.length > 1 ? 's' : ''}</span>`;
}

export function approvalBadge(status) {
  const map = {
    pending_approval: { bg: 'rgba(255,181,71,0.12)', color: 'var(--amber)', label: 'Awaiting Approval', title: 'Awaiting clinical supervisor approval before treatment can begin' },
    approved:         { bg: 'rgba(74,158,255,0.12)', color: 'var(--blue)',  label: 'Approved',          title: 'Approved — ready to start treatment sessions' },
    active:           { bg: 'rgba(0,212,188,0.12)',  color: 'var(--teal)',  label: 'In Treatment',      title: 'Active — treatment sessions in progress' },
    paused:           { bg: 'rgba(255,181,71,0.12)', color: 'var(--amber)', label: 'Paused',            title: 'Treatment paused — follow up with patient before resuming' },
    completed:        { bg: 'rgba(74,222,128,0.12)', color: 'var(--green)', label: 'Completed',         title: 'Full course of treatment completed' },
    discontinued:     { bg: 'rgba(255,107,107,0.12)',color: 'var(--red)',   label: 'Discontinued',      title: 'Treatment discontinued — see clinical notes for reason' },
    draft:            { bg: 'rgba(255,255,255,0.06)', color: 'var(--text-tertiary)', label: 'Draft',    title: 'Draft — not yet submitted for approval' },
  };
  const s = map[status] || { bg: 'rgba(255,255,255,0.06)', color: 'var(--text-tertiary)', label: status?.replace(/_/g, ' ') || '—', title: '' };
  return `<span title="${s.title}" style="cursor:help;font-size:10.5px;font-weight:600;padding:3px 9px;border-radius:5px;background:${s.bg};color:${s.color}">${s.label}</span>`;
}

// Registry-backed select — renders <select> with fetched options; falls back to static list
export function registrySelect(id, label, options, selected = '') {
  const opts = options.map(o =>
    typeof o === 'string'
      ? `<option value="${o}" ${selected === o ? 'selected' : ''}>${o}</option>`
      : `<option value="${o.value}" ${selected === o.value ? 'selected' : ''}>${o.label}</option>`
  ).join('');
  return `<div class="form-group">
    <label class="form-label">${label}</label>
    <select id="${id}" class="form-control"><option value="">Select…</option>${opts}</select>
  </div>`;
}

// ── Doctor-friendly UX primitives ─────────────────────────────────────────────
//
// These helpers turn analyzer pages from input-first ("upload audio, here are
// some 0..1 numbers") into clinical-question-first ("here is what this patient
// looks like, ranked by severity"). They follow three rules:
//
//   1. The page hero leads with the question a clinician is actually asking.
//   2. Numeric model outputs are wrapped with a severity band ONLY when the
//      banding is calibration-aware (percentile vs reference distribution) or
//      explicitly provided by the caller — never auto-classified from a raw
//      score, because model-specific thresholds are a clinical-safety
//      concern.
//   3. Every band carries a tooltip explaining what it means.
//
// Designed for analyzer pages (Voice, Risk, Phenotype, etc.) and additive —
// safe to drop alongside existing rendering without removing the raw values
// underneath.

/**
 * Render a numeric clinical score as a coloured severity-band pill with a
 * monospace numeric chip beside it.
 *
 *   clinicalBand(78, { kind: 'percentile', helpText: 'Cognitive speech score …' })
 *   clinicalBand(0.74, { kind: 'score', band: 'elevated', scaleLabel: '0–1', confidence: 0.82 })
 *
 * - When `kind === 'percentile'` and no explicit band is passed, the band is
 *   auto-classified using the standard low / moderate / elevated / high
 *   percentile cutoffs (50 / 80 / 95). Percentiles are calibration-aware by
 *   definition, so this is safe.
 * - When `kind === 'score'`, the caller MUST pass `band` for the pill to
 *   show severity colours; otherwise a neutral numeric chip is rendered with
 *   the optional scale label. This avoids inventing thresholds on raw model
 *   output where the cutoff depends on the specific model.
 * - `confidence`, when supplied, is appended to the tooltip.
 */
export function clinicalBand(value, opts = {}) {
  const { kind = 'score', band = null, scaleLabel = '', confidence = null, helpText = '' } = opts;
  if (value == null || Number.isNaN(Number(value))) {
    return `<span style="font-size:11px;color:var(--text-tertiary)">—</span>`;
  }

  let resolvedBand = band;
  if (!resolvedBand && kind === 'percentile') {
    const p = Number(value);
    if (p >= 95) resolvedBand = 'high';
    else if (p >= 80) resolvedBand = 'elevated';
    else if (p >= 50) resolvedBand = 'moderate';
    else resolvedBand = 'low';
  }

  const palette = {
    low:      { bg: 'rgba(74,222,128,0.10)',  color: 'var(--green)', label: 'Low',      tipText: 'Within typical range' },
    moderate: { bg: 'rgba(74,158,255,0.10)',  color: 'var(--blue)',  label: 'Moderate', tipText: 'Within range to watch — re-check if a trend appears' },
    elevated: { bg: 'rgba(255,181,71,0.10)',  color: 'var(--amber)', label: 'Elevated', tipText: 'Above typical range — clinical correlation suggested' },
    high:     { bg: 'rgba(255,107,107,0.12)', color: 'var(--red)',   label: 'High',     tipText: 'Notably above range — review against examination' },
  };
  const s = resolvedBand ? palette[resolvedBand] : null;
  const numStr = typeof value === 'number' ? Number(value).toFixed(2) : String(value);
  const tip = (helpText || (s ? s.tipText : 'Numeric score'))
    + (kind === 'percentile' ? ' (percentile vs reference distribution)' : '')
    + (confidence != null ? ` · model confidence ${Number(confidence).toFixed(2)}` : '');

  if (s) {
    return `<span title="${tip}" style="cursor:help;display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:600;padding:3px 9px;border-radius:6px;background:${s.bg};color:${s.color};border:1px solid ${s.color}33">
      <span>${s.label}</span>
      <span style="opacity:.7;font-family:var(--font-mono)">${numStr}${kind === 'percentile' ? 'p' : ''}</span>
    </span>`;
  }
  return `<span title="${tip}" style="cursor:help;display:inline-block;font-size:11px;font-weight:600;padding:3px 9px;border-radius:6px;background:rgba(255,255,255,0.06);color:var(--text-secondary);border:1px solid rgba(255,255,255,0.1);font-family:var(--font-mono)">
    ${scaleLabel ? `<span style="font-weight:500;margin-right:4px;color:var(--text-tertiary)">${scaleLabel}</span>` : ''}${numStr}
  </span>`;
}

/**
 * Doctor-facing page hero that leads with the clinical question the page
 * answers, plus an alert chip that surfaces flagged signals at the very
 * top — before any input UI. When `flagCount === 0` the hero shows a calm
 * "no active flags" state, so the page never silently looks empty.
 *
 *   drHero({
 *     question: "Has this patient's voice changed in ways that suggest mood, cognition, or motor concerns?",
 *     howToRead: "Findings render as Low / Moderate / Elevated / High …",
 *     flagCount: 2,
 *     flagSummary: 'PD voice screening elevated · cognitive speech moderate'
 *   })
 */
export function drHero(opts = {}) {
  const { question = '', howToRead = '', flagCount = 0, flagSummary = '' } = opts;
  const hasFlags = Number(flagCount) > 0;
  const chip = hasFlags
    ? `<div role="status" style="display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:600;padding:4px 10px;border-radius:999px;background:rgba(255,107,107,.10);color:var(--red);border:1px solid rgba(255,107,107,.28);margin-bottom:10px">
        <span>⚠ ${flagCount} flag${flagCount > 1 ? 's' : ''} for review</span>
        ${flagSummary ? `<span style="opacity:.85;font-weight:500">· ${flagSummary}</span>` : ''}
      </div>`
    : `<div role="status" style="display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:500;padding:4px 10px;border-radius:999px;background:rgba(74,222,128,.08);color:var(--green);border:1px solid rgba(74,222,128,.22);margin-bottom:10px">
        <span>✓ No active flags for this patient</span>
      </div>`;

  return `<section class="dr-hero" style="margin-bottom:18px;padding:16px 20px;border-radius:14px;border:1px solid var(--border);background:linear-gradient(180deg, rgba(255,255,255,.02), rgba(255,255,255,0))" aria-labelledby="dr-hero-q">
    ${chip}
    ${question ? `<h2 id="dr-hero-q" style="margin:0 0 6px;font-size:15px;font-weight:600;line-height:1.4">${question}</h2>` : ''}
    ${howToRead ? `<p style="margin:0;font-size:12px;color:var(--text-secondary);line-height:1.5">${howToRead}</p>` : ''}
  </section>`;
}

/**
 * Compact "vs prior" trajectory chip with arrow + percent change.
 *
 *   trajectoryChip(0.62, 0.78, { direction: 'lower-better', priorLabel: 'vs Apr 24' })
 *     → "↓ 21% vs Apr 24" (green pill — improvement when lower-better)
 *   trajectoryChip(0.78, 0.62, { direction: 'lower-better' })
 *     → "↑ 26% vs prior" (red pill — worsening ≥10%)
 *
 * `direction` defaults to 'lower-better' (most clinical scores: PHQ-9,
 * dysarthria severity, fall risk — improvement means the number went down).
 * Pass `direction: 'higher-better'` for metrics where higher is good
 * (cognitive scores on a healthy-side scale, adherence rates, etc.).
 *
 * Returns "" when prior or current is null/NaN, or when prior is 0 (can't
 * compute % change) — graceful no-op.
 */
export function trajectoryChip(current, prior, opts = {}) {
  if (current == null || prior == null) return '';
  const c = Number(current); const p = Number(prior);
  if (Number.isNaN(c) || Number.isNaN(p) || p === 0) return '';
  const delta = c - p;
  const pct = (delta / Math.abs(p)) * 100;
  const direction = opts.direction || 'lower-better';
  const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '·';
  const isImprovement = direction === 'lower-better' ? delta < 0 : delta > 0;
  const isWorsening = direction === 'lower-better' ? delta > 0 : delta < 0;

  let bg, color, label;
  if (Math.abs(pct) < 1) {
    bg = 'rgba(255,255,255,0.06)'; color = 'var(--text-secondary)'; label = '~stable';
  } else if (isImprovement) {
    bg = 'rgba(74,222,128,0.10)'; color = 'var(--green)'; label = `${arrow} ${Math.abs(pct).toFixed(0)}%`;
  } else if (isWorsening) {
    const big = Math.abs(pct) >= 10;
    bg = big ? 'rgba(255,107,107,0.12)' : 'rgba(255,181,71,0.10)';
    color = big ? 'var(--red)' : 'var(--amber)';
    label = `${arrow} ${Math.abs(pct).toFixed(0)}%`;
  } else {
    bg = 'rgba(255,255,255,0.06)'; color = 'var(--text-secondary)'; label = '~stable';
  }
  const priorLabel = opts.priorLabel || 'vs prior';
  const tip = opts.helpText || `Change vs prior measurement: ${pct > 0 ? '+' : ''}${pct.toFixed(1)}% (${direction === 'lower-better' ? 'lower is better' : 'higher is better'})`;
  return `<span title="${tip}" style="cursor:help;display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;padding:3px 8px;border-radius:6px;background:${bg};color:${color};border:1px solid ${color}33">
    <span>${label}</span>
    <span style="opacity:.7;font-weight:500;font-size:10px">${priorLabel}</span>
  </span>`;
}

// Governance flag row
export function govFlag(text, severity = 'warn') {
  const col = severity === 'error' ? 'var(--red)' : 'var(--amber)';
  const bg  = severity === 'error' ? 'rgba(255,107,107,0.07)' : 'rgba(255,181,71,0.07)';
  return `<div style="display:flex;align-items:flex-start;gap:8px;padding:8px 10px;border-radius:6px;background:${bg};border:1px solid ${col}33;margin-bottom:6px">
    <span style="color:${col};font-size:12px;flex-shrink:0">⚠</span>
    <span style="font-size:11.5px;color:${col};line-height:1.5">${text}</span>
  </div>`;
}

export function cardWrap(title, body, action = '') {
  return `<div class="card">
    <div class="card-header"><h3>${title}</h3>${action}</div>
    <div class="card-body">${body}</div>
  </div>`;
}

export function fr(k, v) {
  return `<div class="field-row"><span>${k}</span><span>${v}</span></div>`;
}

export function evBar(l, p, c) {
  return `<div class="ev-row">
    <div class="ev-label">${l}</div>
    <div class="ev-track"><div class="ev-fill" style="width:${p}%;background:${c}"></div></div>
    <span style="font-size:11px;color:var(--text-tertiary);width:28px;text-align:right">${p}%</span>
  </div>`;
}

export function pillSt(st) {
  const m = { active: 'pill-active', pending: 'pill-pending', review: 'pill-review', inactive: 'pill-inactive', completed: 'pill-active', draft: 'pill-pending' };
  const labels = {
    active: 'Active', pending: 'Pending', review: 'Under Review',
    inactive: 'Inactive', completed: 'Completed', draft: 'Draft',
    pending_activation: 'Pending Activation',
  };
  const label = labels[st] || (st ? st.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '—');
  return `<span class="pill ${m[st] || 'pill-inactive'}">${label}</span>`;
}

export function initials(n) {
  if (!n) return '?';
  return n.split(' ').map(x => x[0]).join('').toUpperCase().slice(0, 2);
}

export function tag(t) {
  return `<span class="tag">${t}</span>`;
}

export function spinner() {
  return `<div class="spinner">${Array.from({ length: 5 }, (_, i) =>
    `<div class="ai-dot" style="animation-delay:${i * 0.12}s"></div>`).join('')}</div>`;
}

export function emptyState(icon, titleOrMsg, subtitle, actionLabel, actionFn) {
  // 2-arg form (legacy): emptyState(icon, msg) — inline simple version
  if (!subtitle) {
    return `<div style="text-align:center;padding:48px 0;color:var(--text-tertiary)">
    <div style="font-size:32px;margin-bottom:12px;opacity:.4">${icon}</div>
    <div style="font-size:13px">${titleOrMsg}</div>
  </div>`;
  }
  // 3-5 arg form: full card with title, subtitle, optional action button
  const btn = actionLabel && actionFn
    ? `<button class="btn btn-primary" onclick="${actionFn}">${actionLabel}</button>`
    : '';
  return `<div class="empty-state">
    <div class="empty-state-icon">${icon}</div>
    <h3>${titleOrMsg}</h3>
    <p>${subtitle}</p>
    ${btn}
  </div>`;
}

export function spark(data, color, label) {
  const max = Math.max(...data), min = Math.min(...data);
  const h = 54, w = 290, p = 5;
  const pts = data.map((v, i) => `${p + (i / (data.length - 1)) * (w - p * 2)},${h - p - ((v - min) / (max - min || 1)) * (h - p * 2)}`).join(' ');
  const dots = data.map((v, i) => {
    const x = p + (i / (data.length - 1)) * (w - p * 2);
    const y = h - p - ((v - min) / (max - min || 1)) * (h - p * 2);
    return `<circle cx="${x}" cy="${y}" r="3" fill="${color}"/>`;
  }).join('');
  return `<div style="margin-bottom:16px">
    <div style="display:flex;justify-content:space-between;margin-bottom:5px">
      <span style="font-size:11.5px;color:var(--text-secondary)">${label}</span>
      <span style="font-size:12.5px;font-weight:600;color:${color};font-family:var(--font-mono)">${data[data.length - 1]}</span>
    </div>
    <svg width="100%" viewBox="0 0 ${w} ${h}">
      <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" opacity=".7"/>
      ${dots}
    </svg>
    <div style="display:flex;justify-content:space-between;margin-top:2px">
      ${data.map((_, i) => `<span style="font-size:9px;color:var(--text-tertiary)">S${i + 1}</span>`).join('')}
    </div>
  </div>`;
}

// EEG map
const EEG_CH = [
  { id: 'Fp1', x: 145, y: 52 }, { id: 'Fp2', x: 215, y: 52 },
  { id: 'F7', x: 94, y: 90 }, { id: 'F3', x: 140, y: 88 }, { id: 'Fz', x: 180, y: 83 }, { id: 'F4', x: 222, y: 88 }, { id: 'F8', x: 268, y: 90 },
  { id: 'T3', x: 68, y: 145 }, { id: 'C3', x: 128, y: 138 }, { id: 'Cz', x: 180, y: 133 }, { id: 'C4', x: 232, y: 138 }, { id: 'T4', x: 293, y: 145 },
  { id: 'T5', x: 82, y: 200 }, { id: 'P3', x: 137, y: 192 }, { id: 'Pz', x: 180, y: 188 }, { id: 'P4', x: 225, y: 192 }, { id: 'T6', x: 280, y: 200 },
  { id: 'O1', x: 145, y: 242 }, { id: 'Oz', x: 180, y: 250 }, { id: 'O2', x: 215, y: 242 },
];

const BAND_DATA = {
  alpha: { Fp1: .28, Fp2: .55, F7: .32, F3: .18, Fz: .38, F4: .52, F8: .48, T3: .42, C3: .35, Cz: .44, C4: .60, T4: .58, T5: .55, P3: .62, Pz: .70, P4: .68, T6: .60, O1: .78, Oz: .82, O2: .80 },
  theta: { Fp1: .72, Fp2: .65, F7: .60, F3: .68, Fz: .55, F4: .50, F8: .48, T3: .45, C3: .40, Cz: .38, C4: .35, T4: .32, T5: .30, P3: .28, Pz: .25, P4: .22, T6: .28, O1: .20, Oz: .18, O2: .22 },
  beta: { Fp1: .35, Fp2: .38, F7: .30, F3: .42, Fz: .45, F4: .40, F8: .35, T3: .28, C3: .38, Cz: .50, C4: .42, T4: .30, T5: .25, P3: .32, Pz: .35, P4: .30, T6: .28, O1: .22, Oz: .20, O2: .24 },
};
const BAND_HI = { alpha: ['F3', 'Fz'], theta: ['Fp1', 'Fp2', 'F3'], beta: ['Cz', 'Fz'] };

function bandColor(v, b) {
  if (b === 'alpha') return v > .6 ? '#4a9eff' : v > .3 ? '#2d7fe0' : '#1a3d6e';
  if (b === 'theta') return v > .6 ? '#9b7fff' : v > .3 ? '#6b4de0' : '#2d1d6e';
  return v > .6 ? '#ff6b6b' : v > .3 ? '#e04d4d' : '#6e1d1d';
}

// ── Toast Notifications ──────────────────────────────────────────────────────
export function showToast(message, type = 'success') {
  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
  const colors = {
    success: 'var(--teal)',
    error:   'var(--red)',
    warning: 'var(--amber)',
    info:    'var(--blue)',
  };
  const bgs = {
    success: 'rgba(0,212,188,0.12)',
    error:   'rgba(255,107,107,0.12)',
    warning: 'rgba(255,181,71,0.12)',
    info:    'rgba(74,158,255,0.12)',
  };
  let container = document.getElementById('ds-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'ds-toast-container';
    container.style.cssText = 'position:fixed;top:68px;right:16px;z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = 'ds-toast';
  if (type === 'error') {
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
  } else {
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
  }
  toast.setAttribute('aria-atomic', 'true');
  toast.style.cssText = `pointer-events:auto;display:flex;align-items:center;gap:10px;padding:10px 16px;border-radius:var(--radius-md);background:${bgs[type] || bgs.info};border:1px solid ${colors[type] || colors.info}33;color:${colors[type] || colors.info};font-size:12.5px;font-weight:500;font-family:var(--font-body);box-shadow:0 8px 32px rgba(0,0,0,0.3);transform:translateX(120%);transition:transform 0.3s cubic-bezier(0.4,0,0.2,1),opacity 0.3s;min-width:240px;max-width:380px`;
  toast.innerHTML = `<span style="font-size:15px;font-weight:700;flex-shrink:0">${icons[type] || icons.info}</span><span style="flex:1">${message}</span><button onclick="this.parentElement.remove()" style="background:none;border:none;color:inherit;cursor:pointer;font-size:14px;padding:0 2px;opacity:0.6">✕</button>`;
  container.appendChild(toast);
  requestAnimationFrame(() => { toast.style.transform = 'translateX(0)'; });
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(120%)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
if (typeof window !== 'undefined') window._showToast = showToast;

// ── Stat Card ──────────────────────────────────────────────────────────────
export function statCard(icon, label, value, color = 'var(--teal)', trend = '') {
  const trendHtml = trend ? `<span style="font-size:10px;color:${trend.startsWith('+') ? 'var(--green)' : trend.startsWith('-') ? 'var(--red)' : 'var(--text-tertiary)'};margin-left:6px">${trend}</span>` : '';
  return `<div class="ds-stat-card">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <div style="width:32px;height:32px;border-radius:var(--radius-sm);background:${color}15;display:flex;align-items:center;justify-content:center;font-size:16px">${icon}</div>
      <span style="font-size:11px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px">${label}</span>
    </div>
    <div style="font-size:24px;font-weight:700;color:var(--text-primary);font-family:var(--font-display)">${value}${trendHtml}</div>
  </div>`;
}

export function brainMapSVG(band = 'alpha') {
  const data = BAND_DATA[band] || BAND_DATA.alpha;
  const hi = BAND_HI[band] || [];
  const nodes = EEG_CH.map(ch => {
    const v = data[ch.id] || .3, col = bandColor(v, band), isHi = hi.includes(ch.id);
    return `<g>
      <circle cx="${ch.x}" cy="${ch.y}" r="${isHi ? 12 : 9}" fill="${col}" opacity="${isHi ? 1 : .8}" ${isHi ? 'filter="url(#glow)"' : ''}/>
      ${isHi ? `<circle cx="${ch.x}" cy="${ch.y}" r="14" fill="none" stroke="${col}" stroke-width="1" opacity=".4"/>` : ''}
      <text x="${ch.x}" y="${ch.y + 1}" text-anchor="middle" dominant-baseline="middle" font-size="6.5" font-weight="600" fill="#fff" font-family="'DM Sans',sans-serif">${ch.id}</text>
    </g>`;
  }).join('');
  return `<svg viewBox="30 20 310 265" width="100%" style="max-height:240px">
    <defs><filter id="glow"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    <ellipse cx="180" cy="148" rx="140" ry="140" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
    <line x1="180" y1="18" x2="180" y2="8" stroke="rgba(255,255,255,0.15)" stroke-width="1.5"/>
    <rect x="34" y="138" width="10" height="22" rx="3" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
    <rect x="316" y="138" width="10" height="22" rx="3" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
    <line x1="180" y1="20" x2="180" y2="276" stroke="rgba(255,255,255,0.05)" stroke-width=".5" stroke-dasharray="3,3"/>
    <line x1="44" y1="148" x2="316" y2="148" stroke="rgba(255,255,255,0.05)" stroke-width=".5" stroke-dasharray="3,3"/>
    ${nodes}
  </svg>`;
}
