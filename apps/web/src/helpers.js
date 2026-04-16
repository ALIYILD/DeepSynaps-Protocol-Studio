// ── Render helpers ─────────────────────────────────────────────────────────

// Role-based feature gating — returns content if role is allowed, fallback otherwise
export function roleGate(allowedRoles, currentRole, content, fallback = '') {
  if (!allowedRoles.includes(currentRole)) return fallback;
  return content;
}

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

// Section divider
export function sectionDivider(title) {
  return `<div style="font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:1.2px;padding:16px 0 8px;border-bottom:1px solid var(--border);margin-bottom:12px">${title}</div>`;
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

// ── Loading Skeleton ──────────────────────────────────────────────────────────
export function loadingSkeleton(count = 3) {
  const cards = Array.from({ length: count }, () => `
    <div class="ds-skeleton-card">
      <div class="ds-skeleton-line" style="width:40%;height:14px;margin-bottom:12px"></div>
      <div class="ds-skeleton-line" style="width:100%;height:10px;margin-bottom:8px"></div>
      <div class="ds-skeleton-line" style="width:75%;height:10px;margin-bottom:8px"></div>
      <div class="ds-skeleton-line" style="width:55%;height:10px"></div>
    </div>
  `).join('');
  return `<div class="ds-skeleton-wrap">${cards}</div>`;
}

// ── Error State ──────────────────────────────────────────────────────────────
export function errorState(message, retryFnName) {
  const retryBtn = retryFnName
    ? `<button class="btn btn-primary btn-sm" onclick="${retryFnName}()" style="margin-top:12px">Retry</button>`
    : '';
  return `<div class="ds-error-state">
    <div class="ds-error-icon">⚠</div>
    <div class="ds-error-title">Something went wrong</div>
    <div class="ds-error-msg">${message || 'An unexpected error occurred. Please try again.'}</div>
    ${retryBtn}
  </div>`;
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
window._showToast = showToast;

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

// ── Activity Item ────────────────────────────────────────────────────────────
export function activityItem(icon, title, subtitle, time) {
  return `<div class="ds-activity-item">
    <div style="width:28px;height:28px;border-radius:50%;background:var(--bg-surface-2);display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0">${icon}</div>
    <div style="flex:1;min-width:0">
      <div style="font-size:12.5px;color:var(--text-primary);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${title}</div>
      <div style="font-size:11px;color:var(--text-tertiary)">${subtitle}</div>
    </div>
    <div style="font-size:10px;color:var(--text-tertiary);flex-shrink:0">${time}</div>
  </div>`;
}

// ── Confirmation Modal ───────────────────────────────────────────────────────
export function confirmModal(title, message, confirmLabel = 'Confirm', onConfirm = '') {
  return `<div class="ds-modal-overlay" onclick="if(event.target===this)this.remove()">
    <div class="ds-modal">
      <div style="font-size:15px;font-weight:600;color:var(--text-primary);margin-bottom:8px">${title}</div>
      <div style="font-size:12.5px;color:var(--text-secondary);margin-bottom:20px;line-height:1.6">${message}</div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-ghost btn-sm" onclick="this.closest('.ds-modal-overlay').remove()">Cancel</button>
        <button class="btn btn-primary btn-sm" onclick="${onConfirm};this.closest('.ds-modal-overlay').remove()">${confirmLabel}</button>
      </div>
    </div>
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
