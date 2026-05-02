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

const MODALITY_ORDER = ['bradykinesia', 'tremor', 'gait', 'posture', 'monitoring'];

const MODALITY_LABELS = {
  bradykinesia: 'Bradykinesia',
  tremor:       'Tremor',
  gait:         'Gait',
  posture:      'Posture',
  monitoring:   'Movement monitoring',
};

const MODALITY_TIPS = {
  bradykinesia: 'Slowed initiation, reduced amplitude on rapid alternating movement.',
  tremor:       'Rest, postural, or kinetic tremor — frequency and amplitude.',
  gait:         'Step length, cadence, arm swing, freezing.',
  posture:      'Sagittal/lateral lean, retropulsion on pull-test simulation.',
  monitoring:   'Spontaneous movement variability — psychomotor activation marker.',
};

function _severity(level) {
  return String(level || '').toLowerCase();
}

function _pillFor(level) {
  const lvl = _severity(level);
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
  const lvl = _severity(level);
  const bg = lvl === 'red' ? 'var(--red)'
    : lvl === 'amber' ? 'var(--amber)'
    : lvl === 'green' ? 'var(--green)'
    : 'var(--text-tertiary)';
  const title = lvl === 'red' ? 'Critical' : lvl === 'amber' ? 'Elevated' : lvl === 'green' ? 'Within range' : 'Unknown';
  return `<span title="${title}" aria-label="${title}" style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${bg};opacity:${lvl ? 1 : 0.35}"></span>`;
}

function _trendArrow(prevScore, currScore) {
  if (prevScore == null || currScore == null) return '<span style="color:var(--text-tertiary)" title="No prior capture">·</span>';
  const delta = currScore - prevScore;
  if (Math.abs(delta) < 2) return '<span title="Stable" style="color:var(--text-tertiary)">→</span>';
  if (delta > 0) return '<span title="Worsening" style="color:var(--red)">↑</span>';
  return '<span title="Improving" style="color:var(--green)">↓</span>';
}

function _skeletonChips(n = 5) {
  const chip = '<span style="display:inline-block;width:120px;height:24px;border-radius:12px;background:linear-gradient(90deg,rgba(255,255,255,.04),rgba(255,255,255,.08),rgba(255,255,255,.04));background-size:200% 100%;animation:dh2AttnPulse 1.6s ease-in-out infinite"></span>';
  return `<div style="display:flex;gap:8px;flex-wrap:wrap">${Array.from({ length: n }, () => chip).join('')}</div>`;
}

function _errorCard(message, retryLabel = 'Try again') {
  const safe = esc(message || 'We couldn’t load the movement profile right now.');
  return `<div role="alert" style="max-width:560px;margin:24px auto;padding:18px 20px;border:1px solid rgba(255,107,107,0.35);background:rgba(255,107,107,0.06);border-radius:12px">
    <div style="font-weight:600;margin-bottom:6px;color:var(--text-primary)">We couldn’t load the movement profile right now.</div>
    <div style="font-size:12px;color:var(--text-secondary);line-height:1.5;margin-bottom:12px">${safe}</div>
    <button type="button" class="btn btn-ghost btn-sm" data-action="retry" style="min-height:44px">${esc(retryLabel)}</button>
  </div>`;
}

function _emptyClinicCard() {
  return `<div style="max-width:560px;margin:48px auto;padding:24px;border:1px solid var(--border);border-radius:14px;background:var(--bg-card);text-align:center">
    <div style="font-size:15px;font-weight:600;margin-bottom:8px">No movement assessments captured yet.</div>
    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:14px;line-height:1.5">
      Capture a guided motor video from a patient detail page to populate this summary.
    </div>
  </div>`;
}

function _priorScoresFor(prior, modality) {
  if (!Array.isArray(prior)) return [];
  return prior
    .filter((p) => p && p.modality === modality && typeof p.score === 'number')
    .slice()
    .sort((a, b) => String(a.captured_at || '').localeCompare(String(b.captured_at || '')));
}

function _sparkline(points) {
  if (!Array.isArray(points) || points.length < 2) {
    return `<svg viewBox="0 0 120 32" width="120" height="32" style="display:block" aria-hidden="true"></svg>`;
  }
  const w = 120;
  const h = 32;
  const pad = 2;
  const min = 0;
  const max = 100;
  const step = (w - pad * 2) / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = pad + i * step;
    const y = h - pad - ((p.score - min) / (max - min)) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const last = points[points.length - 1];
  const lx = pad + (points.length - 1) * step;
  const ly = h - pad - ((last.score - min) / (max - min)) * (h - pad * 2);
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="display:block;color:var(--text-secondary)" role="img" aria-label="Trend across ${points.length} captures">
    <polyline fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" points="${coords}"/>
    <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="1.8" fill="currentColor"/>
  </svg>`;
}

function _modalitySeverityFromSummary(p, mod) {
  const m = p?.modalities?.[mod];
  if (!m) return null;
  return { severity: m.severity || null, score: typeof m.score === 'number' ? m.score : null };
}

function _patientTrendArrow(p) {
  let worst = '·';
  for (const mod of MODALITY_ORDER) {
    const cur = _modalitySeverityFromSummary(p, mod);
    if (!cur || cur.score == null) continue;
    const arrow = _trendArrow(cur.priorScore, cur.score);
    if (arrow.includes('↑')) return arrow;
    if (arrow.includes('↓') && worst === '·') worst = arrow;
  }
  return worst;
}

function _renderClinicTable(rows, sortKey, sortDir) {
  if (!Array.isArray(rows) || !rows.length) return _emptyClinicCard();
  const dir = sortDir === 'asc' ? 1 : -1;
  const rank = (l) => ({ red: 3, amber: 2, green: 1 }[_severity(l)] || 0);
  const worstSeverity = (p) => MODALITY_ORDER.reduce((acc, m) => Math.max(acc, rank(p?.modalities?.[m]?.severity)), 0);

  const sorted = rows.slice();
  sorted.sort((a, b) => {
    if (sortKey === 'name') return String(a.patient_name || '').localeCompare(String(b.patient_name || '')) * dir;
    if (sortKey === 'captured_at') return String(a.captured_at || '').localeCompare(String(b.captured_at || '')) * dir;
    if (sortKey === 'worst') return (worstSeverity(b) - worstSeverity(a)) * (dir === 1 ? 1 : -1);
    if (MODALITY_ORDER.includes(sortKey)) {
      return (rank(b?.modalities?.[sortKey]?.severity) - rank(a?.modalities?.[sortKey]?.severity)) * (dir === 1 ? 1 : -1);
    }
    return 0;
  });

  const sortInd = (k) => k === sortKey ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';
  const th = (key, label, align = 'left') =>
    `<th data-sort-key="${esc(key)}" title="Sort by ${esc(label)}" style="padding:8px 8px;text-align:${align};font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border);cursor:pointer;user-select:none">${esc(label)}${sortInd(key)}</th>`;

  const head = `<tr>
    ${th('name', 'Patient')}
    ${th('captured_at', 'Last capture')}
    ${MODALITY_ORDER.map((m) => th(m, MODALITY_LABELS[m], 'center')).join('')}
    <th style="padding:8px 8px;text-align:center;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border)">Trend</th>
    <th style="padding:8px 8px;text-align:right;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border)"></th>
  </tr>`;

  const body = sorted.map((p) => {
    const when = p.captured_at ? new Date(p.captured_at).toLocaleDateString() : '—';
    const cells = MODALITY_ORDER.map((m) => {
      const sev = p?.modalities?.[m]?.severity;
      return `<td style="padding:10px 8px;text-align:center;border-bottom:1px solid var(--border)">${_miniDot(sev)}</td>`;
    }).join('');
    const trend = _patientTrendArrow(p);
    return `<tr data-patient-id="${esc(p.patient_id)}" tabindex="0" role="button" style="cursor:pointer;min-height:44px"
      onmouseover="this.style.background='rgba(255,255,255,.03)'"
      onmouseout="this.style.background='transparent'">
      <td style="padding:10px;border-bottom:1px solid var(--border);font-weight:500">${esc(p.patient_name || 'Unknown')}</td>
      <td style="padding:10px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text-secondary)">${esc(when)}</td>
      ${cells}
      <td style="padding:10px 8px;text-align:center;border-bottom:1px solid var(--border);font-size:14px">${trend}</td>
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

function _topFactors(modality) {
  const cf = Array.isArray(modality?.contributing_factors) ? modality.contributing_factors : [];
  return cf.slice(0, 2);
}

function _renderModalityCard(modKey, modality, prior) {
  const score = (typeof modality?.score === 'number') ? modality.score : null;
  const sev = modality?.severity;
  const conf = (typeof modality?.confidence === 'number') ? `${Math.round(modality.confidence * 100)}%` : '—';
  const factors = _topFactors(modality);
  const factorsHtml = factors.length
    ? factors.map((f) => `<li style="margin-bottom:4px">${esc(f)}</li>`).join('')
    : '<li style="color:var(--text-tertiary)">No contributing factors recorded.</li>';
  const series = _priorScoresFor(prior, modKey);
  const trend = series.length >= 2
    ? _trendArrow(series[series.length - 2].score, series[series.length - 1].score)
    : '<span style="color:var(--text-tertiary)" title="No prior capture">·</span>';

  return `<div data-modality="${esc(modKey)}" style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:10px;min-height:220px">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
      <div>
        <div style="font-weight:600;font-size:13px">${esc(MODALITY_LABELS[modKey] || modKey)}</div>
        <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">${esc(MODALITY_TIPS[modKey] || '')}</div>
      </div>
      <div>${_pillFor(sev)}</div>
    </div>
    <div style="display:flex;align-items:baseline;gap:10px">
      <div style="font-size:22px;font-weight:600;font-variant-numeric:tabular-nums">${score == null ? '—' : esc(score)}</div>
      <div style="font-size:11px;color:var(--text-tertiary)">/ 100 &middot; conf ${esc(conf)} &middot; ${trend}</div>
    </div>
    <div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px">Top contributing factors</div>
    <ul style="margin:0;padding-left:16px;font-size:12px;line-height:1.5;color:var(--text-secondary)">${factorsHtml}</ul>
    <div style="margin-top:auto">${_sparkline(series)}</div>
  </div>`;
}

function _renderSourceVideoPanel(profile, navigate) {
  const sv = profile?.source_video || {};
  const rid = sv.recording_id || '';
  const dur = (typeof sv.duration_seconds === 'number') ? `${Math.floor(sv.duration_seconds / 60)}m ${sv.duration_seconds % 60}s` : '—';
  const when = sv.captured_at ? new Date(sv.captured_at).toLocaleString() : '—';
  const linkHtml = rid
    ? `<a href="#video-assessments?recording=${encodeURIComponent(rid)}" data-action="open-recording" data-recording-id="${esc(rid)}" class="btn btn-ghost btn-sm" style="min-height:44px;display:inline-flex;align-items:center;gap:6px" title="Open in Video Assessments">Open recording</a>`
    : `<span class="btn btn-ghost btn-sm" title="Recording playback not yet wired" aria-disabled="true" style="min-height:44px;opacity:.6;cursor:not-allowed">Open recording</span>`;
  return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
    <div>
      <div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Source video</div>
      <div style="font-size:13px;font-weight:600">${esc(rid || '—')}</div>
      <div style="font-size:11px;color:var(--text-secondary);margin-top:2px">${esc(when)} &middot; duration ${esc(dur)}</div>
    </div>
    <div>${linkHtml}</div>
  </div>`;
}

function _renderAnnotationForm() {
  return `<form data-annotation-form style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:10px">
    <div style="font-weight:600;font-size:13px">Add annotation</div>
    <textarea name="note" class="form-control" rows="2" placeholder="Clinical note on this capture (e.g. tremor amplitude, fall-risk concern, dose review)…" style="min-height:64px;width:100%"></textarea>
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
      <div style="font-size:12px;color:var(--text-tertiary)">No recomputes or annotations recorded yet.</div>
    </div>`;
  }
  const sorted = items.slice().sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  const rows = sorted.map((it) => {
    const when = it.created_at ? new Date(it.created_at).toLocaleString() : '—';
    const kind = String(it.kind || 'event').toLowerCase();
    const tag = kind === 'recompute'
      ? '<span class="pill pill-inactive" style="font-size:10px;padding:2px 8px">Recompute</span>'
      : '<span class="pill pill-active" style="font-size:10px;padding:2px 8px">Annotation</span>';
    return `<li style="padding:8px 10px;border-bottom:1px solid var(--border);font-size:12px;display:flex;flex-direction:column;gap:2px">
      <div style="display:flex;gap:8px;align-items:center;justify-content:space-between">
        <div style="display:flex;gap:8px;align-items:center">${tag}<span style="color:var(--text-tertiary);font-size:11px">${esc(it.actor || '—')}</span></div>
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
  const captured = profile?.captured_at ? new Date(profile.captured_at).toLocaleString() : 'Not yet captured.';
  const cards = MODALITY_ORDER.map((m) => _renderModalityCard(m, profile?.modalities?.[m], profile?.prior_scores)).join('');
  return `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin:12px 0 14px">
      <div style="font-size:12px;color:var(--text-tertiary)">Last capture: ${esc(captured)}</div>
      <button type="button" class="btn btn-ghost btn-sm" data-action="recompute" style="min-height:44px">Recompute</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px">${cards}</div>
    <div style="margin-top:18px;display:grid;grid-template-columns:1fr;gap:14px">
      ${_renderSourceVideoPanel(profile, navigate)}
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

async function _loadClinicSummary() {
  const personas = ANALYZER_DEMO_FIXTURES?.patients || [];
  const ids = personas.map((p) => p.id);
  const results = await Promise.all(
    ids.map((pid) => api.getMovementProfile(pid).then((r) => r).catch(() => null))
  );
  const patients = [];
  results.forEach((r, i) => {
    if (r && r.patient_id) patients.push(_enrichPatientName(r));
  });
  return { patients };
}

export async function pgMovementAnalyzer(setTopbar, navigate) {
  try {
    setTopbar({
      title: 'Movement Analyzer',
      subtitle: 'Track motor side-effects of psychiatric treatment',
    });
  } catch {
    try { setTopbar('Movement Analyzer', 'Motor side-effects tracking'); } catch {}
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
    <div class="ds-movement-analyzer-shell" style="max-width:1100px;margin:0 auto;padding:16px 20px 48px">
      <div id="mv-demo-banner"></div>
      <div style="padding:12px 14px;border-radius:12px;border:1px solid rgba(155,127,255,0.28);background:rgba(155,127,255,0.06);margin-bottom:14px;font-size:12px;line-height:1.45;color:var(--text-secondary)">
        <strong style="color:var(--text-primary)">Clinical decision-support.</strong>
        Movement scores quantify motor side-effects of psychiatric treatment — SSRI-induced tremor, post-ECT slowing, neuromodulation-related dyskinesia, psychomotor activation. Each score is a model output and requires clinician interpretation.
      </div>
      <div id="mv-breadcrumb" style="display:flex;align-items:center;gap:10px;margin-bottom:12px;font-size:12px"></div>
      <div id="mv-body"></div>
    </div>`;

  const $ = (id) => document.getElementById(id);

  function _syncDemoBanner() {
    const slot = $('mv-demo-banner');
    if (!slot) return;
    slot.innerHTML = usingFixtures && isDemoSession() ? DEMO_FIXTURE_BANNER_HTML : '';
  }

  function setBreadcrumb() {
    const bc = $('mv-breadcrumb');
    if (!bc) return;
    if (view === 'clinic') {
      bc.innerHTML = `<span style="font-weight:600">Clinic movement summary</span>`;
    } else {
      bc.innerHTML = `<button type="button" class="btn btn-ghost btn-sm" id="mv-back" style="min-height:44px">← Back to clinic</button>
        <span style="color:var(--text-tertiary)">/</span>
        <span style="font-weight:600">${esc(activePatientName || 'Patient')}</span>`;
      $('mv-back')?.addEventListener('click', () => {
        view = 'clinic';
        render();
      });
    }
  }

  async function loadClinic() {
    const body = $('mv-body');
    if (!body) return;
    body.innerHTML = `<div style="padding:18px;background:var(--bg-card);border:1px solid var(--border);border-radius:14px">${_skeletonChips(5)}</div>`;
    try {
      summaryCache = await _loadClinicSummary();
      if ((!summaryCache || !summaryCache.patients?.length) && isDemoSession()) {
        summaryCache = ANALYZER_DEMO_FIXTURES.movement.clinic_summary();
        usingFixtures = true;
      } else if (summaryCache && summaryCache.patients?.length) {
        usingFixtures = false;
      }
    } catch (e) {
      if (isDemoSession() && ANALYZER_DEMO_FIXTURES?.movement) {
        summaryCache = ANALYZER_DEMO_FIXTURES.movement.clinic_summary();
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
    const body = $('mv-body');
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
    const body = $('mv-body');
    if (!body || !activePatientId) return;
    body.innerHTML = `<div style="padding:18px;background:var(--bg-card);border:1px solid var(--border);border-radius:14px">${_skeletonChips(5)}</div>`;
    try {
      const [profile, audit] = await Promise.all([
        api.getMovementProfile(activePatientId),
        api.getMovementAudit(activePatientId).catch(() => ({ items: [] })),
      ]);
      profileCache = profile;
      auditCache = audit;
      if ((!profile || !profile.modalities) && isDemoSession() && ANALYZER_DEMO_FIXTURES?.movement) {
        profileCache = ANALYZER_DEMO_FIXTURES.movement.patient_profile(activePatientId);
        auditCache = ANALYZER_DEMO_FIXTURES.movement.patient_audit(activePatientId);
        usingFixtures = true;
      } else if (profileCache) {
        usingFixtures = false;
      }
    } catch (e) {
      if (isDemoSession() && ANALYZER_DEMO_FIXTURES?.movement) {
        profileCache = ANALYZER_DEMO_FIXTURES.movement.patient_profile(activePatientId);
        auditCache = ANALYZER_DEMO_FIXTURES.movement.patient_audit(activePatientId);
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

  function wirePatientDetail() {
    const body = $('mv-body');
    if (!body) return;

    body.querySelector('[data-action="recompute"]')?.addEventListener('click', async (ev) => {
      const btn = ev.currentTarget;
      const old = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Recomputing…';
      try {
        if (!usingFixtures) {
          await api.recomputeMovement(activePatientId);
        }
        await loadPatient();
      } catch (e) {
        btn.disabled = false;
        btn.textContent = old;
        body.insertAdjacentHTML('afterbegin', _errorCard((e && e.message) || String(e)));
      }
    });

    body.querySelector('[data-action="open-recording"]')?.addEventListener('click', (ev) => {
      ev.preventDefault();
      const rid = ev.currentTarget.getAttribute('data-recording-id');
      try {
        if (rid) {
          window._mvOpenRecording = rid;
          navigate?.('video-assessments');
        }
      } catch {}
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
            id: `demo-mv-aud-${Date.now()}`,
            kind: 'annotation',
            actor: 'Dr. A. Yildirim',
            message: note,
            created_at: new Date().toISOString(),
          };
        } else {
          added = await api.addMovementAnnotation(activePatientId, { message: note });
        }
        const items = Array.isArray(auditCache?.items) ? auditCache.items.slice() : [];
        items.unshift(added);
        auditCache = { ...(auditCache || {}), items };
        form.reset();
        body.innerHTML = _renderPatientDetail(profileCache, auditCache, navigate);
        wirePatientDetail();
      } catch (e) {
        if (errSlot) errSlot.textContent = (e && e.message) || String(e);
      } finally {
        if (submit && !submit.isConnected) return;
        submit.disabled = false;
        submit.textContent = 'Save annotation';
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

export default { pgMovementAnalyzer };
