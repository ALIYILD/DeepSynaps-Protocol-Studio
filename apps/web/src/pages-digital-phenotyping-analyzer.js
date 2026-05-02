import { api } from './api.js';
import { isDemoSession } from './demo-session.js';
import { ANALYZER_DEMO_FIXTURES, DEMO_FIXTURE_BANNER_HTML } from './demo-fixtures-analyzers.js';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const SIGNAL_ORDER = ['sleep', 'mobility', 'social', 'typing_cadence', 'screen_time', 'voice_diary'];

const SIGNAL_LABELS = {
  sleep:          'Sleep',
  mobility:       'Activity / Mobility',
  social:         'Social engagement',
  typing_cadence: 'Typing cadence',
  screen_time:    'Screen time',
  voice_diary:    'Voice diary cadence',
};

const SIGNAL_TIPS = {
  sleep:          'Average sleep hours from device-derived sleep proxy.',
  mobility:       'Steps/day and time-out-of-home derived from passive motion + GPS.',
  social:         'Outbound communication count vs personal baseline (metadata only).',
  typing_cadence: 'Inter-key interval and word-pause distribution — psychomotor proxy.',
  screen_time:    'Total daily screen-time share vs personal baseline.',
  voice_diary:    'Voluntary voice diary submission cadence + speech rate.',
};

function _sevKey(s) {
  return String(s || '').toLowerCase();
}

function _pillFor(level) {
  const lvl = _sevKey(level);
  if (lvl === 'red') {
    return '<span class="pill" style="background:rgba(255,107,107,0.12);color:var(--red);border:1px solid rgba(255,107,107,0.25)">Critical</span>';
  }
  if (lvl === 'amber') {
    return '<span class="pill pill-pending">Elevated</span>';
  }
  if (lvl === 'green') {
    return '<span class="pill pill-active">Within range</span>';
  }
  return '<span class="pill pill-inactive">Unknown</span>';
}

function _miniDot(level) {
  const lvl = _sevKey(level);
  const bg = lvl === 'red' ? 'var(--red)'
    : lvl === 'amber' ? 'var(--amber)'
    : lvl === 'green' ? 'var(--green)'
    : 'var(--text-tertiary)';
  const title = lvl === 'red' ? 'Critical' : lvl === 'amber' ? 'Elevated' : lvl === 'green' ? 'Within range' : 'Unknown';
  return `<span title="${title}" aria-label="${title}" style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${bg};opacity:${lvl ? 1 : 0.35}"></span>`;
}

function _trendArrow(trend) {
  const t = String(trend || '').toLowerCase();
  if (t === 'improving') return '<span title="Improving" style="color:var(--green)">↓</span>';
  if (t === 'worsening') return '<span title="Worsening" style="color:var(--red)">↑</span>';
  if (t === 'stable')    return '<span title="Stable" style="color:var(--text-tertiary)">→</span>';
  return '<span style="color:var(--text-tertiary)">·</span>';
}

function _skeletonChips(n = 5) {
  const chip = '<span style="display:inline-block;width:120px;height:24px;border-radius:12px;background:linear-gradient(90deg,rgba(255,255,255,.04),rgba(255,255,255,.08),rgba(255,255,255,.04));background-size:200% 100%;animation:dh2AttnPulse 1.6s ease-in-out infinite"></span>';
  return `<div style="display:flex;gap:8px;flex-wrap:wrap">${Array.from({ length: n }, () => chip).join('')}</div>`;
}

function _errorCard(message) {
  const safe = esc(message || '');
  return `<div role="alert" style="max-width:560px;margin:24px auto;padding:18px 20px;border:1px solid rgba(255,107,107,0.35);background:rgba(255,107,107,0.06);border-radius:12px">
    <div style="font-weight:600;margin-bottom:6px;color:var(--text-primary)">We couldn’t load the digital phenotyping profile right now.</div>
    <div style="font-size:12px;color:var(--text-secondary);line-height:1.5;margin-bottom:12px">${safe}</div>
    <button type="button" class="btn btn-ghost btn-sm" data-action="retry" style="min-height:44px">Try again</button>
  </div>`;
}

function _emptyClinicCard() {
  return `<div style="max-width:560px;margin:48px auto;padding:24px;border:1px solid var(--border);border-radius:14px;background:var(--bg-card);text-align:center">
    <div style="font-size:15px;font-weight:600;margin-bottom:8px">No digital phenotyping signals captured yet.</div>
    <div style="font-size:12px;color:var(--text-secondary);line-height:1.5">
      Patients log via the mobile companion or a paired wearable. Once consent is granted and a 14-day window is collected, signals appear here.
    </div>
  </div>`;
}

function _sparkline(history) {
  if (!Array.isArray(history) || history.length < 2) {
    return `<svg viewBox="0 0 120 32" width="120" height="32" style="display:block" aria-hidden="true"></svg>`;
  }
  const w = 120;
  const h = 32;
  const pad = 2;
  let min = Math.min(...history);
  let max = Math.max(...history);
  if (min === max) { min -= 1; max += 1; }
  const step = (w - pad * 2) / (history.length - 1);
  const coords = history.map((v, i) => {
    const x = pad + i * step;
    const y = h - pad - ((v - min) / (max - min)) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const lastIdx = history.length - 1;
  const lx = pad + lastIdx * step;
  const ly = h - pad - ((history[lastIdx] - min) / (max - min)) * (h - pad * 2);
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="display:block;color:var(--text-secondary)" role="img" aria-label="Last ${history.length} days">
    <polyline fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" points="${coords}"/>
    <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="1.8" fill="currentColor"/>
  </svg>`;
}

function _flagPill(label, severity) {
  const lvl = _sevKey(severity);
  const color = lvl === 'red' ? 'var(--red)' : lvl === 'amber' ? 'var(--amber)' : lvl === 'green' ? 'var(--green)' : 'var(--text-secondary)';
  const bg = lvl === 'red' ? 'rgba(255,107,107,0.14)' : lvl === 'amber' ? 'rgba(255,176,87,0.14)' : lvl === 'green' ? 'rgba(96,200,140,0.10)' : 'rgba(255,255,255,0.04)';
  const border = lvl === 'red' ? 'rgba(255,107,107,0.30)' : lvl === 'amber' ? 'rgba(255,176,87,0.30)' : lvl === 'green' ? 'rgba(96,200,140,0.30)' : 'var(--border)';
  return `<span class="pill" style="background:${bg};color:${color};border:1px solid ${border};font-size:10.5px;padding:2px 8px;min-height:24px">${esc(label)}</span>`;
}

function _renderClinicTable(rows, sortKey, sortDir) {
  if (!Array.isArray(rows) || !rows.length) return _emptyClinicCard();
  const dir = sortDir === 'asc' ? 1 : -1;
  const sevRank = (s) => ({ red: 3, amber: 2, green: 1 }[_sevKey(s)] || 0);
  const trendRank = (t) => ({ worsening: 3, stable: 2, improving: 1 }[String(t || '').toLowerCase()] || 0);

  const sorted = rows.slice();
  sorted.sort((a, b) => {
    if (sortKey === 'name') return String(a.patient_name || '').localeCompare(String(b.patient_name || '')) * dir;
    if (sortKey === 'captured_at') return String(a.captured_at || '').localeCompare(String(b.captured_at || '')) * dir;
    if (sortKey === 'worst') return (sevRank(b.worst_severity) - sevRank(a.worst_severity)) * (dir === 1 ? 1 : -1);
    if (sortKey === 'trend') return (trendRank(b.trend) - trendRank(a.trend)) * (dir === 1 ? 1 : -1);
    return 0;
  });

  const sortInd = (k) => k === sortKey ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';
  const th = (key, label, align = 'left') =>
    `<th data-sort-key="${esc(key)}" title="Sort by ${esc(label)}" style="padding:8px 8px;text-align:${align};font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border);cursor:pointer;user-select:none">${esc(label)}${sortInd(key)}</th>`;

  const head = `<tr>
    ${th('name', 'Patient')}
    ${th('captured_at', 'Last observation')}
    <th style="padding:8px 8px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border)">Signal flags</th>
    ${th('worst', 'Worst', 'center')}
    ${th('trend', 'Trend', 'center')}
    <th style="padding:8px 8px;text-align:right;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border)"></th>
  </tr>`;

  const body = sorted.map((p) => {
    const when = p.captured_at ? new Date(p.captured_at).toLocaleDateString() : '—';
    const flags = Array.isArray(p.flags) ? p.flags : [];
    const flagsHtml = flags.length
      ? flags.map((f) => _flagPill(f.label, f.severity)).join(' ')
      : '<span style="color:var(--text-tertiary);font-size:11px">No signal data</span>';
    const sevTint = p.worst_severity === 'red'
      ? 'border-left:3px solid var(--red)'
      : p.worst_severity === 'amber'
        ? 'border-left:3px solid var(--amber)'
        : 'border-left:3px solid var(--green)';
    return `<tr data-patient-id="${esc(p.patient_id)}" tabindex="0" role="button" style="cursor:pointer;min-height:44px;${sevTint}"
      onmouseover="this.style.background='rgba(255,255,255,.03)'"
      onmouseout="this.style.background='transparent'">
      <td style="padding:10px;border-bottom:1px solid var(--border);font-weight:500">${esc(p.patient_name || 'Unknown')}</td>
      <td style="padding:10px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text-secondary)">${esc(when)}</td>
      <td style="padding:10px;border-bottom:1px solid var(--border);font-size:12px;display:flex;flex-wrap:wrap;gap:4px;min-width:240px">${flagsHtml}</td>
      <td style="padding:10px 8px;text-align:center;border-bottom:1px solid var(--border)">${_miniDot(p.worst_severity)}</td>
      <td style="padding:10px 8px;text-align:center;border-bottom:1px solid var(--border);font-size:14px">${_trendArrow(p.trend)}</td>
      <td style="padding:10px;text-align:right;border-bottom:1px solid var(--border)">
        <button type="button" class="btn btn-ghost btn-sm" data-action="open-patient" data-patient-id="${esc(p.patient_id)}" style="min-height:44px">View</button>
      </td>
    </tr>`;
  }).join('');

  return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;overflow:auto">
    <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:820px">
      <thead>${head}</thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

function _formatScore(signal) {
  if (!signal) return '—';
  if (signal.score == null) return '—';
  const num = Number(signal.score);
  if (!Number.isFinite(num)) return String(signal.score);
  const sign = num > 0 && /%/.test(String(signal.unit || '')) ? '+' : '';
  return `${sign}${num}`;
}

function _renderSignalCard(key, signal, navigate) {
  const factors = Array.isArray(signal?.contributing_factors) ? signal.contributing_factors.slice(0, 2) : [];
  const factorsHtml = factors.length
    ? factors.map((f) => `<li style="margin-bottom:4px">${esc(f)}</li>`).join('')
    : '<li style="color:var(--text-tertiary)">No contributing factors recorded.</li>';
  const score = _formatScore(signal);
  const unit = signal?.unit || '';
  const baseline = signal?.baseline_label || '';
  return `<div data-signal="${esc(key)}" style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:10px;min-height:220px">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
      <div>
        <div style="font-weight:600;font-size:13px">${esc(SIGNAL_LABELS[key] || key)}</div>
        <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">${esc(SIGNAL_TIPS[key] || '')}</div>
      </div>
      <div>${_pillFor(signal?.severity)}</div>
    </div>
    <div style="display:flex;align-items:baseline;gap:10px">
      <div style="font-size:22px;font-weight:600;font-variant-numeric:tabular-nums">${esc(score)}</div>
      <div style="font-size:11px;color:var(--text-tertiary)">${esc(unit)}${baseline ? ' · ' + esc(baseline) : ''}</div>
    </div>
    <div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px">Top contributing factors</div>
    <ul style="margin:0;padding-left:16px;font-size:12px;line-height:1.5;color:var(--text-secondary)">${factorsHtml}</ul>
    <div style="margin-top:auto">${_sparkline(signal?.history)}</div>
  </div>`;
}

function _renderCrossModalCallouts(crossModal) {
  const list = Array.isArray(crossModal) ? crossModal : [];
  if (!list.length) {
    return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px">
      <div style="font-weight:600;font-size:13px;margin-bottom:8px">Cross-modal context</div>
      <div style="font-size:12px;color:var(--text-tertiary)">No cross-modal correlations flagged for this window.</div>
    </div>`;
  }
  const cards = list.map((c) => {
    const linksHtml = (Array.isArray(c.linked_pages) ? c.linked_pages : [])
      .map((p) => `<button type="button" class="btn btn-ghost btn-sm" data-nav-page="${esc(p)}" style="min-height:32px;font-size:11px;padding:4px 10px;margin-right:4px">${esc(p)} →</button>`)
      .join('');
    return `<div style="border-bottom:1px solid var(--border);padding:10px 0">
      <div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">${esc(SIGNAL_LABELS[c.signal] || c.signal || 'Signal')} — what this means</div>
      <div style="font-size:12px;color:var(--text-secondary);line-height:1.5">${esc(c.message || '')}</div>
      ${linksHtml ? `<div style="margin-top:6px">${linksHtml}</div>` : ''}
    </div>`;
  }).join('');
  return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px">
    <div style="font-weight:600;font-size:13px;margin-bottom:8px">Cross-modal context</div>
    ${cards}
  </div>`;
}

function _renderObservationForm() {
  const today = new Date().toISOString().slice(0, 16);
  return `<form data-observation-form style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:10px">
    <div style="font-weight:600;font-size:13px">Add observation</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px">
      <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--text-tertiary)">Recorded at
        <input name="recorded_at" type="datetime-local" class="form-control" value="${esc(today)}" required style="min-height:36px"/>
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--text-tertiary)">Mood (0–10)
        <input name="mood_0_10" type="number" min="0" max="10" step="0.1" class="form-control" style="min-height:36px"/>
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--text-tertiary)">Anxiety (0–10)
        <input name="anxiety_0_10" type="number" min="0" max="10" step="0.1" class="form-control" style="min-height:36px"/>
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--text-tertiary)">Sleep (h)
        <input name="sleep_hours" type="number" min="0" max="24" step="0.25" class="form-control" style="min-height:36px"/>
      </label>
    </div>
    <textarea name="notes" class="form-control" rows="2" placeholder="Optional notes (e.g. EMA check-in context)…" style="min-height:48px;width:100%"></textarea>
    <div style="display:flex;gap:8px;align-items:center;justify-content:flex-end">
      <span data-form-error style="color:var(--red);font-size:11px;margin-right:auto"></span>
      <button type="submit" class="btn btn-primary btn-sm" style="min-height:44px">Add observation</button>
    </div>
  </form>`;
}

function _renderAnnotationForm() {
  return `<form data-annotation-form style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:10px">
    <div style="font-weight:600;font-size:13px">Add annotation</div>
    <textarea name="note" class="form-control" rows="2" placeholder="Clinical note (e.g. flag sleep loss + social drop, escalate review)…" style="min-height:64px;width:100%"></textarea>
    <div style="display:flex;gap:8px;align-items:center;justify-content:flex-end">
      <span data-form-error style="color:var(--red);font-size:11px;margin-right:auto"></span>
      <button type="submit" class="btn btn-primary btn-sm" style="min-height:44px">Save annotation</button>
    </div>
  </form>`;
}

function _renderAuditPanel(audit) {
  const items = Array.isArray(audit?.items) ? audit.items : [];
  if (!items.length) {
    return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px">
      <div style="font-weight:600;font-size:13px;margin-bottom:8px">Audit trail</div>
      <div style="font-size:12px;color:var(--text-tertiary)">No recomputes, observations, or annotations recorded yet.</div>
    </div>`;
  }
  const sorted = items.slice().sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  const tagFor = (k) => {
    const kind = String(k || 'event').toLowerCase();
    if (kind === 'recompute')   return '<span class="pill pill-inactive" style="font-size:10px;padding:2px 8px">Recompute</span>';
    if (kind === 'annotation')  return '<span class="pill pill-active" style="font-size:10px;padding:2px 8px">Annotation</span>';
    if (kind === 'observation') return '<span class="pill pill-pending" style="font-size:10px;padding:2px 8px">Observation</span>';
    return '<span class="pill pill-inactive" style="font-size:10px;padding:2px 8px">Event</span>';
  };
  const rows = sorted.map((it) => {
    const when = it.created_at ? new Date(it.created_at).toLocaleString() : '—';
    return `<li style="padding:8px 10px;border-bottom:1px solid var(--border);font-size:12px;display:flex;flex-direction:column;gap:2px">
      <div style="display:flex;gap:8px;align-items:center;justify-content:space-between">
        <div style="display:flex;gap:8px;align-items:center">${tagFor(it.kind)}<span style="color:var(--text-tertiary);font-size:11px">${esc(it.actor || '—')}</span></div>
        <span style="color:var(--text-tertiary);white-space:nowrap;font-size:11px">${esc(when)}</span>
      </div>
      <div style="color:var(--text-secondary);line-height:1.5">${esc(it.message || '')}</div>
    </li>`;
  }).join('');
  return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px">
    <div style="font-weight:600;font-size:13px;margin-bottom:8px">Audit trail</div>
    <ul style="list-style:none;margin:0;padding:0">${rows}</ul>
  </div>`;
}

function _renderPatientDetail(profile, audit, navigate) {
  const captured = profile?.captured_at ? new Date(profile.captured_at).toLocaleString() : 'No observation recorded.';
  const cards = SIGNAL_ORDER.map((k) => _renderSignalCard(k, profile?.signals?.[k], navigate)).join('');
  return `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin:12px 0 14px">
      <div style="font-size:12px;color:var(--text-tertiary)">Last observation: ${esc(captured)}</div>
      <button type="button" class="btn btn-ghost btn-sm" data-action="recompute" style="min-height:44px">Recompute</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px">${cards}</div>
    <div style="margin-top:18px">${_renderCrossModalCallouts(profile?.cross_modal)}</div>
    <div style="margin-top:18px;display:grid;grid-template-columns:1fr;gap:14px">
      ${_renderObservationForm()}
      ${_renderAnnotationForm()}
      ${_renderAuditPanel(audit)}
    </div>`;
}

function _enrichPatientName(p) {
  const personas = ANALYZER_DEMO_FIXTURES?.patients || [];
  if (p.patient_name) return p;
  const match = personas.find((x) => x.id === p.patient_id);
  return { ...p, patient_name: match ? match.name : p.patient_id };
}

function _projectFromBackendPayload(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.signals && typeof raw.signals === 'object') return raw;
  const snap = raw.snapshot || {};
  const sevFromCmp = (cmp) => {
    const c = String(cmp || '').toLowerCase();
    if (c === 'above' || c === 'below') return 'amber';
    if (c === 'within') return 'green';
    return null;
  };
  const signals = {
    sleep: snap.sleep_timing_proxy ? {
      score: snap.sleep_timing_proxy.value, unit: 'index',
      severity: sevFromCmp(snap.sleep_timing_proxy.baseline_comparison),
      baseline_label: 'baseline window',
      contributing_factors: snap.sleep_timing_proxy.notes || ['Derived from sleep timing proxy.'],
      history: [],
    } : null,
    mobility: snap.mobility_stability ? {
      score: snap.mobility_stability.value, unit: 'index',
      severity: sevFromCmp(snap.mobility_stability.baseline_comparison),
      baseline_label: 'baseline window',
      contributing_factors: ['Mobility stability index from passive GPS / motion.'],
      history: [],
    } : null,
    social: snap.sociability_proxy ? {
      score: snap.sociability_proxy.value, unit: 'index',
      severity: sevFromCmp(snap.sociability_proxy.baseline_comparison),
      baseline_label: 'baseline window',
      contributing_factors: ['Communication metadata-derived sociability proxy.'],
      history: [],
    } : null,
    typing_cadence: snap.activity_level ? {
      score: snap.activity_level.value, unit: 'index',
      severity: sevFromCmp(snap.activity_level.baseline_comparison),
      baseline_label: 'baseline window',
      contributing_factors: ['Activity-level proxy (typing cadence not yet ingested).'],
      history: [],
    } : null,
    screen_time: snap.screen_time_pattern ? {
      score: snap.screen_time_pattern.value, unit: '× baseline',
      severity: sevFromCmp(snap.screen_time_pattern.baseline_comparison),
      baseline_label: 'baseline window',
      contributing_factors: ['Screen-time pattern vs baseline.'],
      history: [],
    } : null,
    voice_diary: snap.routine_regularity ? {
      score: snap.routine_regularity.value, unit: 'index',
      severity: sevFromCmp(snap.routine_regularity.baseline_comparison),
      baseline_label: 'baseline window',
      contributing_factors: ['Routine regularity index (voice diary cadence proxy).'],
      history: [],
    } : null,
  };
  return {
    patient_id: raw.patient_id,
    patient_name: raw.patient_display_name || raw.patient_id,
    captured_at: raw.generated_at,
    signals,
    cross_modal: [],
  };
}

async function _loadClinicSummary() {
  const personas = ANALYZER_DEMO_FIXTURES?.patients || [];
  const ids = personas.map((p) => p.id);
  const results = await Promise.all(
    ids.map((pid) => api.getDigitalPhenotypingProfile(pid).then((r) => r).catch(() => null))
  );
  const SIGNAL_KEYS = ['sleep', 'mobility', 'social', 'typing_cadence', 'screen_time', 'voice_diary'];
  const sevRank = (s) => ({ red: 3, amber: 2, green: 1 }[_sevKey(s)] || 0);
  const patients = [];
  results.forEach((raw) => {
    const r = _projectFromBackendPayload(raw);
    if (r && r.patient_id && r.signals) {
      const enriched = _enrichPatientName(r);
      const flags = SIGNAL_KEYS.map((k) => ({
        key: k,
        label: k.replace('_', ' '),
        severity: enriched.signals?.[k]?.severity || null,
      })).filter((f) => f.severity);
      const worst = flags.reduce((acc, f) => Math.max(acc, sevRank(f.severity)), 0);
      const reds = flags.filter((f) => f.severity === 'red').length;
      const greens = flags.filter((f) => f.severity === 'green').length;
      const trend = greens > reds ? 'improving' : reds > greens ? 'worsening' : 'stable';
      patients.push({
        patient_id: enriched.patient_id,
        patient_name: enriched.patient_name,
        captured_at: enriched.captured_at,
        flags,
        worst_severity: worst === 3 ? 'red' : worst === 2 ? 'amber' : 'green',
        trend,
      });
    }
  });
  return { patients };
}

export async function pgDigitalPhenotypingAnalyzer(setTopbar, navigate) {
  try {
    setTopbar({
      title: 'Digital Phenotyping Analyzer',
      subtitle: 'Passive smartphone & wearable behavioral signals',
    });
  } catch {
    try { setTopbar('Digital Phenotyping Analyzer', 'Passive behavioral signals'); } catch {}
  }

  const el = document.getElementById('content');
  if (!el) return;

  let view = 'clinic';
  let summaryCache = null;
  let activePatientId = null;
  let activePatientName = '';
  let profileCache = null;
  let auditCache = null;
  let sortKey = 'worst';
  let sortDir = 'desc';
  let usingFixtures = false;

  el.innerHTML = `
    <div class="ds-dp-analyzer-shell" style="max-width:1100px;margin:0 auto;padding:16px 20px 48px">
      <div id="dp-demo-banner"></div>
      <div style="padding:12px 14px;border-radius:12px;border:1px solid rgba(155,127,255,0.28);background:rgba(155,127,255,0.06);margin-bottom:14px;font-size:12px;line-height:1.45;color:var(--text-secondary)">
        <strong style="color:var(--text-primary)">Clinical decision-support.</strong>
        Passive smartphone and wearable signals (sleep, mobility, social engagement, typing cadence, screen time, voice diary cadence) act as objective behavioral health markers. They do not diagnose — interpret alongside interview, assessments, and other modalities.
      </div>
      <div id="dp-breadcrumb" style="display:flex;align-items:center;gap:10px;margin-bottom:12px;font-size:12px"></div>
      <div id="dp-body"></div>
    </div>`;

  const $ = (id) => document.getElementById(id);

  function _syncDemoBanner() {
    const slot = $('dp-demo-banner');
    if (!slot) return;
    slot.innerHTML = usingFixtures && isDemoSession() ? DEMO_FIXTURE_BANNER_HTML : '';
  }

  function setBreadcrumb() {
    const bc = $('dp-breadcrumb');
    if (!bc) return;
    if (view === 'clinic') {
      bc.innerHTML = `<span style="font-weight:600">Clinic digital phenotyping summary</span>`;
    } else {
      bc.innerHTML = `<button type="button" class="btn btn-ghost btn-sm" id="dp-back" style="min-height:44px">← Back to clinic</button>
        <span style="color:var(--text-tertiary)">/</span>
        <span style="font-weight:600">${esc(activePatientName || 'Patient')}</span>`;
      $('dp-back')?.addEventListener('click', () => {
        view = 'clinic';
        render();
      });
    }
  }

  async function loadClinic() {
    const body = $('dp-body');
    if (!body) return;
    body.innerHTML = `<div style="padding:18px;background:var(--bg-card);border:1px solid var(--border);border-radius:14px">${_skeletonChips(5)}</div>`;
    try {
      summaryCache = await _loadClinicSummary();
      if ((!summaryCache || !summaryCache.patients?.length) && isDemoSession() && ANALYZER_DEMO_FIXTURES?.digitalPhenotyping?.clinic_summary) {
        summaryCache = ANALYZER_DEMO_FIXTURES.digitalPhenotyping.clinic_summary();
        usingFixtures = true;
      } else if (summaryCache && summaryCache.patients?.length) {
        usingFixtures = false;
      }
    } catch (e) {
      if (isDemoSession() && ANALYZER_DEMO_FIXTURES?.digitalPhenotyping?.clinic_summary) {
        summaryCache = ANALYZER_DEMO_FIXTURES.digitalPhenotyping.clinic_summary();
        usingFixtures = true;
      } else {
        const msg = (e && e.message) || String(e);
        body.innerHTML = _errorCard(msg);
        body.querySelector('[data-action="retry"]')?.addEventListener('click', loadClinic);
        return;
      }
    }
    _syncDemoBanner();
    body.innerHTML = _renderClinicTable(summaryCache?.patients || [], sortKey, sortDir);
    body.querySelectorAll('[data-sort-key]').forEach((th) => {
      th.addEventListener('click', () => {
        const k = th.getAttribute('data-sort-key');
        if (k === sortKey) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        else { sortKey = k; sortDir = k === 'name' ? 'asc' : 'desc'; }
        body.innerHTML = _renderClinicTable(summaryCache?.patients || [], sortKey, sortDir);
        wireClinicRows();
      });
    });
    wireClinicRows();
  }

  function wireClinicRows() {
    const body = $('dp-body');
    body?.querySelectorAll('tr[data-patient-id]').forEach((tr) => {
      const pid = tr.getAttribute('data-patient-id');
      const open = () => {
        const p = (summaryCache?.patients || []).find((x) => x.patient_id === pid);
        activePatientId = pid;
        activePatientName = p?.patient_name || pid;
        view = 'patient';
        render();
      };
      tr.addEventListener('click', (ev) => {
        if (ev.target?.closest && ev.target.closest('[data-action]')) return;
        open();
      });
      tr.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); }
      });
    });
    body?.querySelectorAll('[data-action="open-patient"]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const pid = btn.getAttribute('data-patient-id');
        const p = (summaryCache?.patients || []).find((x) => x.patient_id === pid);
        activePatientId = pid;
        activePatientName = p?.patient_name || pid;
        view = 'patient';
        render();
      });
    });
  }

  async function loadPatient() {
    const body = $('dp-body');
    if (!body || !activePatientId) return;
    body.innerHTML = `<div style="padding:18px;background:var(--bg-card);border:1px solid var(--border);border-radius:14px">${_skeletonChips(5)}</div>`;
    try {
      const [rawProfile, audit] = await Promise.all([
        api.getDigitalPhenotypingProfile(activePatientId),
        api.getPhenotypingAudit(activePatientId).catch(() => ({ items: [] })),
      ]);
      const projected = _projectFromBackendPayload(rawProfile);
      profileCache = projected;
      auditCache = audit && Array.isArray(audit.items)
        ? audit
        : (audit && Array.isArray(audit.events))
          ? { items: audit.events.map((e) => ({ id: e.event_id, kind: e.action, actor: e.actor_role, message: e.summary, created_at: e.timestamp })) }
          : { items: [] };
      const thin = !projected || !projected.signals || !Object.values(projected.signals).some(Boolean);
      if (thin && isDemoSession() && ANALYZER_DEMO_FIXTURES?.digitalPhenotyping?.patient_profile) {
        profileCache = ANALYZER_DEMO_FIXTURES.digitalPhenotyping.patient_profile(activePatientId);
        auditCache = ANALYZER_DEMO_FIXTURES.digitalPhenotyping.patient_audit(activePatientId);
        usingFixtures = true;
      } else if (profileCache) {
        usingFixtures = false;
      }
    } catch (e) {
      if (isDemoSession() && ANALYZER_DEMO_FIXTURES?.digitalPhenotyping?.patient_profile) {
        profileCache = ANALYZER_DEMO_FIXTURES.digitalPhenotyping.patient_profile(activePatientId);
        auditCache = ANALYZER_DEMO_FIXTURES.digitalPhenotyping.patient_audit(activePatientId);
        usingFixtures = true;
      } else {
        const msg = (e && e.message) || String(e);
        body.innerHTML = _errorCard(msg);
        body.querySelector('[data-action="retry"]')?.addEventListener('click', loadPatient);
        return;
      }
    }
    _syncDemoBanner();
    body.innerHTML = _renderPatientDetail(profileCache, auditCache, navigate);
    wirePatientDetail();
  }

  function _rerenderPatient() {
    const body = $('dp-body');
    if (!body) return;
    body.innerHTML = _renderPatientDetail(profileCache, auditCache, navigate);
    wirePatientDetail();
  }

  function wirePatientDetail() {
    const body = $('dp-body');
    if (!body) return;

    body.querySelectorAll('[data-nav-page]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const p = btn.getAttribute('data-nav-page');
        try { navigate?.(p); } catch {}
      });
    });

    body.querySelector('[data-action="recompute"]')?.addEventListener('click', async (ev) => {
      const btn = ev.currentTarget;
      const old = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Recomputing…';
      try {
        if (!usingFixtures) {
          await api.recomputeDigitalPhenotyping(activePatientId);
        }
        await loadPatient();
      } catch (e) {
        btn.disabled = false;
        btn.textContent = old;
        body.insertAdjacentHTML('afterbegin', _errorCard((e && e.message) || String(e)));
      }
    });

    body.querySelector('[data-observation-form]')?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const form = ev.currentTarget;
      const errSlot = form.querySelector('[data-form-error]');
      if (errSlot) errSlot.textContent = '';
      const fd = new FormData(form);
      const recordedRaw = String(fd.get('recorded_at') || '').trim();
      if (!recordedRaw) {
        if (errSlot) errSlot.textContent = 'Recorded-at is required.';
        return;
      }
      const numOrNull = (k) => {
        const raw = fd.get(k);
        if (raw === null || raw === '') return null;
        const n = Number(raw);
        return Number.isFinite(n) ? n : null;
      };
      const payload = {
        source: 'manual',
        kind: 'ema_checkin',
        recorded_at: new Date(recordedRaw).toISOString(),
        payload: {
          mood_0_10: numOrNull('mood_0_10'),
          anxiety_0_10: numOrNull('anxiety_0_10'),
          sleep_hours: numOrNull('sleep_hours'),
          notes: String(fd.get('notes') || '').trim() || null,
        },
      };
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      submit.textContent = 'Adding…';
      try {
        if (usingFixtures) {
          const auditAdd = {
            id: `demo-dp-aud-${Date.now()}`,
            kind: 'observation',
            actor: 'Patient (EMA)',
            message: `EMA mood ${payload.payload.mood_0_10 ?? '—'}, anxiety ${payload.payload.anxiety_0_10 ?? '—'}, sleep ${payload.payload.sleep_hours ?? '—'} h.`,
            created_at: new Date().toISOString(),
          };
          auditCache = { ...(auditCache || {}), items: [auditAdd, ...((auditCache?.items) || [])] };
        } else {
          await api.addPhenotypingObservation(activePatientId, payload);
          await loadPatient();
          return;
        }
        form.reset();
        _rerenderPatient();
      } catch (e) {
        if (errSlot) errSlot.textContent = (e && e.message) || String(e);
      } finally {
        if (submit && submit.isConnected) {
          submit.disabled = false;
          submit.textContent = 'Add observation';
        }
      }
    });

    body.querySelector('[data-annotation-form]')?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const form = ev.currentTarget;
      const errSlot = form.querySelector('[data-form-error]');
      if (errSlot) errSlot.textContent = '';
      const note = String(new FormData(form).get('note') || '').trim();
      if (!note) {
        if (errSlot) errSlot.textContent = 'Add a short clinical note before saving.';
        form.querySelector('textarea')?.focus();
        return;
      }
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      submit.textContent = 'Saving…';
      try {
        let added;
        if (usingFixtures) {
          added = {
            id: `demo-dp-aud-${Date.now()}`,
            kind: 'annotation',
            actor: 'Dr. A. Yildirim',
            message: note,
            created_at: new Date().toISOString(),
          };
        } else {
          const resp = await api.addPhenotypingAnnotation(activePatientId, { note });
          added = {
            id: (resp && resp.id) || `dp-${Date.now()}`,
            kind: 'annotation',
            actor: 'You',
            message: note,
            created_at: new Date().toISOString(),
          };
        }
        const items = Array.isArray(auditCache?.items) ? auditCache.items.slice() : [];
        items.unshift(added);
        auditCache = { ...(auditCache || {}), items };
        form.reset();
        _rerenderPatient();
      } catch (e) {
        if (errSlot) errSlot.textContent = (e && e.message) || String(e);
      } finally {
        if (submit && submit.isConnected) {
          submit.disabled = false;
          submit.textContent = 'Save annotation';
        }
      }
    });
  }

  function render() {
    setBreadcrumb();
    if (view === 'clinic') loadClinic();
    else loadPatient();
  }

  render();
}

export default { pgDigitalPhenotypingAnalyzer };
