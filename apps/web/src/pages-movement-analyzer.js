/**
 * Movement Analyzer — clinician-reviewed motor/movement decision support.
 * Does not provide autonomous diagnosis, fall-risk final determination, or protocol selection.
 */
import { api } from './api.js';
import { isDemoSession } from './demo-session.js';
import { ANALYZER_DEMO_FIXTURES, DEMO_FIXTURE_BANNER_HTML } from './demo-fixtures-analyzers.js';

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Map backend multimodal_links analyzer_id to app nav page id */
export function analyzerIdToNavPage(analyzerId) {
  const id = String(analyzerId || '').toLowerCase();
  const map = {
    deeptwin: 'deeptwin',
    'video-assessments': 'video-assessments',
    wearables: 'wearables',
    'live-session': 'live-session',
    'voice-analyzer': 'voice-analyzer',
    'clinician-wellness': 'clinician-wellness',
    'medication-analyzer': 'medication-analyzer',
    'treatment-sessions-analyzer': 'treatment-sessions-analyzer',
    'risk-analyzer': 'risk-analyzer',
    'assessments-v2': 'assessments-v2',
    'mri-analysis': 'mri-analysis',
    'qeeg-launcher': 'qeeg-launcher',
  };
  if (map[id]) return map[id];
  return id || null;
}

/** Prefer GET /audit items; fall back to audit_tail embedded in workspace payload */
export function mergeMovementAuditItems(profile, auditResponse) {
  const fromAudit = auditResponse && Array.isArray(auditResponse.items) ? auditResponse.items : [];
  const fromProfile = profile && Array.isArray(profile.audit_tail) ? profile.audit_tail : [];
  if (fromAudit.length) return fromAudit;
  return fromProfile;
}

const MODALITY_ORDER = ['bradykinesia', 'tremor', 'gait', 'posture', 'monitoring'];

const MODALITY_LABELS = {
  bradykinesia: 'Bradykinesia cue',
  tremor:       'Tremor cue',
  gait:         'Gait / activity cue',
  posture:      'Posture / balance cue',
  monitoring:   'Movement variability cue',
};

const MODALITY_TIPS = {
  bradykinesia: 'Model-assisted summary from available tasks — not a diagnosis.',
  tremor:       'Movement-analysis cue — requires clinician review; not a tremor diagnosis.',
  gait:         'Steps / proxy signals only unless instrumented gait data exists.',
  posture:      'Video-derived proxy when present — not a balance or fall-risk determination.',
  monitoring:   'Passive variability marker — interpret with exam and context.',
};

function _severity(level) {
  return String(level || '').toLowerCase();
}

function _pillFor(level) {
  const lvl = _severity(level);
  if (lvl === 'red') {
    return '<span class="pill" style="background:rgba(255,107,107,0.12);color:var(--red);border:1px solid rgba(255,107,107,0.25)">Movement cue — review</span>';
  }
  if (lvl === 'amber') {
    return '<span class="pill pill-pending">Elevated cue — review</span>';
  }
  if (lvl === 'green') {
    return '<span class="pill pill-active">Lower concern (model)</span>';
  }
  return '<span class="pill pill-inactive">Unknown / sparse data</span>';
}

function _miniDot(level) {
  const lvl = _severity(level);
  const bg = lvl === 'red' ? 'var(--red)'
    : lvl === 'amber' ? 'var(--amber)'
    : lvl === 'green' ? 'var(--green)'
    : 'var(--text-tertiary)';
  const title = lvl === 'red' ? 'Movement cue — review' : lvl === 'amber' ? 'Elevated cue — review' : lvl === 'green' ? 'Lower concern (model)' : 'Unknown';
  return `<span title="${title}" aria-label="${title}" style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${bg};opacity:${lvl ? 1 : 0.35}"></span>`;
}

function _trendArrow(prevScore, currScore) {
  if (prevScore == null || currScore == null) return '<span style="color:var(--text-tertiary)" title="No prior capture">·</span>';
  const delta = currScore - prevScore;
  if (Math.abs(delta) < 2) return '<span title="Stable (model)" style="color:var(--text-tertiary)">→</span>';
  if (delta > 0) return '<span title="Model signal increased — not worsening diagnosis" style="color:var(--red)">↑</span>';
  return '<span title="Model signal decreased" style="color:var(--green)">↓</span>';
}

function _skeletonChips(n = 5) {
  const chip = '<span style="display:inline-block;width:120px;height:24px;border-radius:12px;background:linear-gradient(90deg,rgba(255,255,255,.04),rgba(255,255,255,.08),rgba(255,255,255,.04));background-size:200% 100%;animation:dh2AttnPulse 1.6s ease-in-out infinite"></span>';
  return `<div style="display:flex;gap:8px;flex-wrap:wrap">${Array.from({ length: n }, () => chip).join('')}</div>`;
}

function _errorCard(message, retryLabel = 'Try again') {
  const safe = esc(message || 'We couldn’t load the movement workspace right now.');
  return `<div role="alert" style="max-width:560px;margin:24px auto;padding:18px 20px;border:1px solid rgba(255,107,107,0.35);background:rgba(255,107,107,0.06);border-radius:12px">
    <div style="font-weight:600;margin-bottom:6px;color:var(--text-primary)">We couldn’t load the movement workspace right now.</div>
    <div style="font-size:12px;color:var(--text-secondary);line-height:1.5;margin-bottom:12px">${safe}</div>
    <button type="button" class="btn btn-ghost btn-sm" data-action="retry" style="min-height:44px">${esc(retryLabel)}</button>
  </div>`;
}

function _emptyClinicCard() {
  return `<div style="max-width:640px;margin:48px auto;padding:24px;border:1px solid var(--border);border-radius:14px;background:var(--bg-card);text-align:center">
    <div style="font-size:15px;font-weight:600;margin-bottom:8px">No movement workspace rows loaded</div>
    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:14px;line-height:1.5">
      Sparse or absent digital movement signals do <strong>not</strong> rule out clinical movement concerns.
      Select a patient, connect Video / wearables / shared wellness data, or capture tasks per clinic workflow.
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
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="display:block;color:var(--text-secondary)" role="img" aria-label="Model score trend across ${points.length} captures">
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

function _movementCueBanner(severity) {
  const lvl = _severity(severity);
  if (lvl !== 'red' && lvl !== 'amber') return '';
  return `<div role="note" style="font-size:11px;line-height:1.45;padding:8px 10px;border-radius:8px;margin-bottom:8px;background:rgba(155,127,255,0.08);border:1px solid rgba(155,127,255,0.22);color:var(--text-secondary)">
    <strong style="color:var(--text-primary)">Movement-analysis cue — requires clinician review.</strong> Not a diagnosis, fall-risk determination, or treatment eligibility decision.
  </div>`;
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
    `<th scope="col" data-sort-key="${esc(key)}" title="Sort by ${esc(label)}" style="padding:8px 8px;text-align:${align};font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border);cursor:pointer;user-select:none">${esc(label)}${sortInd(key)}</th>`;

  const head = `<tr>
    ${th('name', 'Patient')}
    ${th('captured_at', 'Last capture')}
    ${MODALITY_ORDER.map((m) => th(m, MODALITY_LABELS[m].replace(' cue', ''), 'center')).join('')}
    <th scope="col" style="padding:8px 8px;text-align:center;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border)">Trend</th>
    <th scope="col" style="padding:8px 8px;text-align:right;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border)"></th>
  </tr>`;

  const body = sorted.map((p) => {
    const when = p.captured_at ? new Date(p.captured_at).toLocaleDateString() : '—';
    const cells = MODALITY_ORDER.map((m) => {
      const sev = p?.modalities?.[m]?.severity;
      return `<td style="padding:10px 8px;text-align:center;border-bottom:1px solid var(--border)">${_miniDot(sev)}</td>`;
    }).join('');
    const trend = _patientTrendArrow(p);
    return `<tr data-patient-id="${esc(p.patient_id)}" tabindex="0" role="button" aria-label="Open movement workspace for ${esc(p.patient_name || 'patient')}" style="cursor:pointer;min-height:44px"
      onmouseover="this.style.background='rgba(255,255,255,.03)'"
      onmouseout="this.style.background='transparent'">
      <td style="padding:10px;border-bottom:1px solid var(--border);font-weight:500">${esc(p.patient_name || 'Unknown')}</td>
      <td style="padding:10px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text-secondary)">${esc(when)}</td>
      ${cells}
      <td style="padding:10px 8px;text-align:center;border-bottom:1px solid var(--border);font-size:14px">${trend}</td>
      <td style="padding:10px;text-align:right;border-bottom:1px solid var(--border)">
        <button type="button" class="btn btn-ghost btn-sm" data-action="open-patient" data-patient-id="${esc(p.patient_id)}" style="min-height:44px">Open</button>
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
  return cf.slice(0, 3);
}

function _renderModalityCard(modKey, modality, prior) {
  const score = (typeof modality?.score === 'number') ? modality.score : null;
  const sev = modality?.severity;
  const conf = (typeof modality?.confidence === 'number') ? `${Math.round(modality.confidence * 100)}%` : '—';
  const factors = _topFactors(modality);
  const factorsHtml = factors.length
    ? factors.map((f) => `<li style="margin-bottom:4px">${esc(f)}</li>`).join('')
    : '<li style="color:var(--text-tertiary)">No source-backed factors listed — data may be sparse.</li>';
  const series = _priorScoresFor(prior, modKey);
  const trend = series.length >= 2
    ? _trendArrow(series[series.length - 2].score, series[series.length - 1].score)
    : '<span style="color:var(--text-tertiary)" title="No prior capture">·</span>';
  const cueBanner = _movementCueBanner(sev);

  return `<div data-modality="${esc(modKey)}" style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:10px;min-height:240px">
    ${cueBanner}
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
      <div>
        <h3 style="margin:0;font-weight:600;font-size:13px">${esc(MODALITY_LABELS[modKey] || modKey)}</h3>
        <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">${esc(MODALITY_TIPS[modKey] || '')}</div>
      </div>
      <div>${_pillFor(sev)}</div>
    </div>
    <div style="display:flex;align-items:baseline;gap:10px">
      <div style="font-size:22px;font-weight:600;font-variant-numeric:tabular-nums" aria-label="Model composite score">${score == null ? '—' : esc(String(score))}</div>
      <div style="font-size:11px;color:var(--text-tertiary)">composite (0–100) · uncertainty ${esc(conf)} · ${trend}</div>
    </div>
    <div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px">Source factors / labels</div>
    <ul style="margin:0;padding-left:16px;font-size:12px;line-height:1.5;color:var(--text-secondary)">${factorsHtml}</ul>
    <div style="margin-top:auto">${_sparkline(series)}</div>
  </div>`;
}

function _renderSourceVideoPanel(profile, navigate) {
  const sv = profile?.source_video || {};
  const rid = sv.recording_id || '';
  const dur = (typeof sv.duration_seconds === 'number') ? `${Math.floor(sv.duration_seconds / 60)}m ${sv.duration_seconds % 60}s` : '—';
  const when = sv.captured_at ? new Date(sv.captured_at).toLocaleString() : '—';
  const metaNote = !rid && sv.captured_at
    ? '<div style="font-size:11px;color:var(--amber);margin-top:6px">Video analysis metadata present; recording ID not linked — open Video Analyzer from the patient or timeline.</div>'
    : '';
  const linkHtml = rid
    ? `<button type="button" class="btn btn-ghost btn-sm" data-action="open-recording" data-recording-id="${esc(rid)}" style="min-height:44px;display:inline-flex;align-items:center;gap:6px" title="Open in Video Assessments">Open in Video</button>`
    : `<span class="btn btn-ghost btn-sm" title="No recording id on file — use Video Analyzer to locate captures" aria-disabled="true" style="min-height:44px;opacity:.6;cursor:not-allowed">Open in Video</span>`;
  return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
    <div>
      <div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Video / posture source</div>
      <div style="font-size:13px;font-weight:600">${rid ? esc(rid) : '— (metadata only)'}</div>
      <div style="font-size:11px;color:var(--text-secondary);margin-top:2px">${esc(when)} · duration ${esc(dur)}</div>
      ${metaNote}
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">${linkHtml}
      <button type="button" class="btn btn-ghost btn-sm" data-action="go-video-assessments" style="min-height:44px" title="Upload or record tasks in Video Assessments">Video Assessments</button>
    </div>
  </div>`;
}

function _renderWorkflowNav(patientId, usingFixtures) {
  const pid = patientId || '';
  const dis = !pid ? 'disabled' : '';
  const titleWear = usingFixtures ? 'Demo — use live API for device sync' : 'Biometrics / wearables summaries';
  return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px">
    <h3 style="margin:0 0 8px;font-size:13px;font-weight:600">Capture &amp; import</h3>
    <p style="margin:0 0 10px;font-size:11px;color:var(--text-secondary)">Uploads and device sync use existing clinic modules — this page aggregates signals for review only.</p>
    <div style="display:flex;flex-wrap:wrap;gap:8px">
      <button type="button" class="btn btn-ghost btn-sm" data-action="go-video-assessments" style="min-height:44px">Upload / record video</button>
      <button type="button" class="btn btn-ghost btn-sm" data-action="go-wearables" ${dis} style="min-height:44px;${!pid ? 'opacity:.55' : ''}" title="${esc(titleWear)}">Wearables / IMU</button>
      <button type="button" class="btn btn-ghost btn-sm" data-action="go-documents" ${dis} style="min-height:44px;${!pid ? 'opacity:.55' : ''}" title="Patient documents">Documents</button>
    </div>
  </div>`;
}

function _renderDataAvailability(profile) {
  const sources = Array.isArray(profile?.signal_sources) ? profile.signal_sources : [];
  const comp = profile?.completeness?.overall;
  const gen = profile?.generated_at ? new Date(profile.generated_at).toLocaleString() : '—';
  if (!sources.length) {
    return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px">
      <h3 style="margin:0 0 8px;font-size:13px;font-weight:600">Data availability</h3>
      <p style="margin:0;font-size:12px;color:var(--text-secondary)">No signal-source rows in this payload. Workspace generated: ${esc(gen)}${comp != null ? ` · completeness ${Math.round(Number(comp) * 100)}%` : ''}.</p>
    </div>`;
  }
  const rows = sources.map((s) => {
    const qc = Array.isArray(s.qc_flags) && s.qc_flags.length ? esc(s.qc_flags.join(', ')) : '—';
    const conf = typeof s.confidence === 'number' ? `${Math.round(s.confidence * 100)}%` : '—';
    const last = s.last_received_at ? new Date(s.last_received_at).toLocaleString() : '—';
    return `<tr>
      <td style="padding:8px;border-bottom:1px solid var(--border);font-size:12px">${esc(s.source_id || '—')}</td>
      <td style="padding:8px;border-bottom:1px solid var(--border);font-size:12px">${esc(s.source_modality || '—')}</td>
      <td style="padding:8px;border-bottom:1px solid var(--border);font-size:12px">${last}</td>
      <td style="padding:8px;border-bottom:1px solid var(--border);font-size:12px">${conf}</td>
      <td style="padding:8px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text-secondary)">${qc}</td>
    </tr>`;
  }).join('');
  return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px;overflow:auto">
    <h3 style="margin:0 0 10px;font-size:13px;font-weight:600">Data availability matrix</h3>
    <p style="margin:0 0 10px;font-size:11px;color:var(--text-secondary)">Generated ${esc(gen)}${comp != null ? ` · workspace completeness ~${Math.round(Number(comp) * 100)}%` : ''}. Missing streams reduce confidence — they do not imply “all clear.”</p>
    <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:640px">
      <thead><tr>
        <th scope="col" style="text-align:left;padding:8px;border-bottom:1px solid var(--border);font-size:10px;color:var(--text-tertiary)">Source</th>
        <th scope="col" style="text-align:left;padding:8px;border-bottom:1px solid var(--border);font-size:10px;color:var(--text-tertiary)">Modality</th>
        <th scope="col" style="text-align:left;padding:8px;border-bottom:1px solid var(--border);font-size:10px;color:var(--text-tertiary)">Last received</th>
        <th scope="col" style="text-align:left;padding:8px;border-bottom:1px solid var(--border);font-size:10px;color:var(--text-tertiary)">Confidence</th>
        <th scope="col" style="text-align:left;padding:8px;border-bottom:1px solid var(--border);font-size:10px;color:var(--text-tertiary)">QC / gaps</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function _renderFlags(profile) {
  const flags = Array.isArray(profile?.flags) ? profile.flags : [];
  if (!flags.length) {
    return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px">
      <h3 style="margin:0 0 8px;font-size:13px;font-weight:600">Movement cues / flags</h3>
      <p style="margin:0;font-size:12px;color:var(--text-secondary)">No rule-based flags in this snapshot — absence does not exclude clinical concern.</p>
    </div>`;
  }
  const items = flags.map((f) => `<li style="margin-bottom:10px;font-size:12px;line-height:1.5;color:var(--text-secondary)">
    <strong style="color:var(--text-primary)">${esc(f.title || f.flag_id || 'Flag')}</strong>
    ${f.detail ? `<div>${esc(f.detail)}</div>` : ''}
    <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">Movement-analysis cue — requires clinician review · confidence ${typeof f.confidence === 'number' ? `${Math.round(f.confidence * 100)}%` : '—'}</div>
  </li>`).join('');
  return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px">
    <h3 style="margin:0 0 10px;font-size:13px;font-weight:600">Movement cues / flags</h3>
    <ul style="margin:0;padding-left:18px">${items}</ul>
  </div>`;
}

function _renderGovernance(profile) {
  const disc = profile?.clinical_disclaimer || 'Decision-support only; clinician interpretation required.';
  const interp = profile?.clinical_interpretation;
  const hypo = Array.isArray(interp?.hypotheses) ? interp.hypotheses : [];
  const hypoHtml = hypo.length
    ? hypo.map((h) => `<li style="margin-bottom:8px;font-size:12px;color:var(--text-secondary)">${esc(h.statement || '')}${h.caveat ? `<div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">${esc(h.caveat)}</div>` : ''}</li>`).join('')
    : '<li style="font-size:12px;color:var(--text-secondary)">Movement-analysis rules require clinic governance review where institutional policy applies.</li>';
  const evidence = Array.isArray(profile?.evidence_links) ? profile.evidence_links : [];
  const evHtml = evidence.length
    ? evidence.slice(0, 6).map((e) => `<li style="font-size:11px;color:var(--text-secondary);margin-bottom:6px"><strong>${esc(e.title || e.id)}</strong> (${esc(e.source_type || 'rule')}) — ${esc(e.snippet || '')}</li>`).join('')
    : '<li style="font-size:12px;color:var(--text-secondary)">No linked evidence snippets in payload — cite clinic policy and primary literature at the point of care.</li>';

  return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px">
    <h3 style="margin:0 0 8px;font-size:13px;font-weight:600">Evidence / governance</h3>
    <p style="margin:0 0 10px;font-size:12px;color:var(--text-secondary)">${esc(disc)}</p>
    <div style="font-size:11px;font-weight:600;color:var(--text-tertiary);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">Interpretation hypotheses</div>
    <ul style="margin:0 0 12px;padding-left:18px">${hypoHtml}</ul>
    <div style="font-size:11px;font-weight:600;color:var(--text-tertiary);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">Evidence links (workspace)</div>
    <ul style="margin:0;padding-left:18px">${evHtml}</ul>
  </div>`;
}

function _renderLinkedModules(profile, patientId) {
  const links = Array.isArray(profile?.multimodal_links) ? profile.multimodal_links : [];
  const extra = [
    { nav: 'patient-profile', label: 'Patient profile', title: 'Open patient chart' },
    { nav: 'protocol-studio', label: 'Protocol Studio', title: 'Draft protocol context only — not auto-approved from movement' },
    { nav: 'brainmap-v2', label: 'Brain Map Planner', title: 'Planning context' },
    { nav: 'biomarkers', label: 'Biomarkers', title: 'Labs / biomarkers' },
    { nav: 'documents-v2', label: 'Documents', title: 'Clinical documents' },
    { nav: 'schedule-v2', label: 'Schedule', title: 'Calendar' },
    { nav: 'clinician-inbox', label: 'Inbox', title: 'Workflow inbox' },
    { nav: 'monitor', label: 'Devices / monitor', title: 'Wearables & devices hub' },
    { nav: 'session-execution', label: 'Live session', title: 'Session execution' },
  ];
  const fromPayload = links.map((l) => {
    const page = analyzerIdToNavPage(l.analyzer_id);
    if (!page) return '';
    return `<button type="button" class="btn btn-ghost btn-sm" data-action="nav-module" data-nav-page="${esc(page)}" style="min-height:40px" title="${esc(l.relation || 'Linked analyzer')}">${esc(l.label || page)}</button>`;
  }).join('');
  const hardcoded = extra.map((x) =>
    `<button type="button" class="btn btn-ghost btn-sm" data-action="nav-module" data-nav-page="${esc(x.nav)}" style="min-height:40px" title="${esc(x.title)}">${esc(x.label)}</button>`
  ).join('');
  return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px">
    <h3 style="margin:0 0 8px;font-size:13px;font-weight:600">Linked modules</h3>
    <p style="margin:0 0 10px;font-size:11px;color:var(--text-secondary)">Navigation opens the selected workspace for <strong>review context</strong> — not automated protocol matching, eligibility, or treatment selection.</p>
    <div style="display:flex;flex-wrap:wrap;gap:8px">${fromPayload}${hardcoded}</div>
  </div>`;
}

function _renderAiSummary(profile) {
  const snap = profile?.snapshot || {};
  const summary = snap.phenotype_summary || profile?.clinical_interpretation?.summary || '';
  const oc = snap.overall_concern;
  const oconf = snap.overall_confidence;
  if (!summary && oc == null) {
    return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px">
      <h3 style="margin:0 0 8px;font-size:13px;font-weight:600">AI-assisted / multimodal summary</h3>
      <p style="margin:0;font-size:12px;color:var(--text-secondary)">No summary block returned — sources may be sparse.</p>
    </div>`;
  }
  return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px">
    <h3 style="margin:0 0 8px;font-size:13px;font-weight:600">AI-assisted / multimodal summary</h3>
    <p style="margin:0 0 8px;font-size:12px;color:var(--text-secondary);line-height:1.5">${esc(summary || '')}</p>
    <div style="font-size:11px;color:var(--text-tertiary)">Overall trajectory context: ${esc(oc || '—')} · confidence ${oconf != null ? esc(String(oconf)) : '—'} · requires clinician review</div>
  </div>`;
}

function _renderRecommendations(profile) {
  const recs = Array.isArray(profile?.recommendations) ? profile.recommendations : [];
  if (!recs.length) return '';
  const items = recs.map((r) => `<li style="font-size:12px;color:var(--text-secondary);margin-bottom:8px">
    <strong style="color:var(--text-primary)">${esc(r.kind || 'review')}</strong> — ${esc(r.rationale || '')}
    <span style="font-size:11px;color:var(--text-tertiary)"> (priority ${esc(r.priority || '—')} · not a treatment directive)</span>
  </li>`).join('');
  return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px">
    <h3 style="margin:0 0 8px;font-size:13px;font-weight:600">Suggested review actions (workspace)</h3>
    <ul style="margin:0;padding-left:18px">${items}</ul>
    <p style="margin:8px 0 0;font-size:11px;color:var(--text-tertiary)">These are documentation prompts for clinician follow-up — not protocol approval or medication changes.</p>
  </div>`;
}

function _renderAnnotationForm(demoLocalOnly) {
  const hint = demoLocalOnly
    ? '<p style="margin:0 0 8px;font-size:11px;color:var(--amber)">Demo session: annotations are stored in-browser for this sample only — not persisted to the clinic record.</p>'
    : '';
  return `<form data-annotation-form style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:10px">
    <div style="font-weight:600;font-size:13px">Clinician note (audit trail)</div>
    ${hint}
    <textarea name="note" class="form-control" rows="3" placeholder="Clinical observation (required to save). Describe exam findings, medication context, or review rationale — not an autonomous diagnosis." style="min-height:72px;width:100%" aria-label="Clinician annotation note"></textarea>
    <div style="display:flex;gap:8px;align-items:center;justify-content:flex-end">
      <span data-form-error style="color:var(--red);font-size:11px;margin-right:auto"></span>
      <button type="submit" class="btn btn-primary btn-sm" style="min-height:44px">Save note to audit trail</button>
    </div>
  </form>`;
}

function _renderAuditPanel(audit, demoLabel) {
  const items = Array.isArray(audit?.items) ? audit.items : [];
  const banner = demoLabel
    ? `<div style="font-size:11px;color:var(--amber);margin-bottom:8px">${esc(demoLabel)}</div>`
    : '';
  if (!items.length) {
    return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px">
      <div style="font-weight:600;font-size:13px;margin-bottom:8px">Audit trail</div>
      ${banner}
      <div style="font-size:12px;color:var(--text-tertiary)">No recomputes or annotations recorded yet — absence does not imply review occurred.</div>
    </div>`;
  }
  const sorted = items.slice().sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  const rows = sorted.map((it) => {
    const when = it.created_at ? new Date(it.created_at).toLocaleString() : '—';
    const kind = String(it.kind || 'event').toLowerCase();
    let tag = '<span class="pill pill-active" style="font-size:10px;padding:2px 8px">Event</span>';
    if (kind === 'recompute') {
      tag = '<span class="pill pill-inactive" style="font-size:10px;padding:2px 8px">Recompute</span>';
    } else if (kind === 'annotation' || kind === 'annotate') {
      tag = '<span class="pill pill-active" style="font-size:10px;padding:2px 8px">Note</span>';
    } else if (kind === 'review_ack') {
      tag = '<span class="pill" style="font-size:10px;padding:2px 8px;background:rgba(155,127,255,0.12);border:1px solid rgba(155,127,255,0.25)">Review ack</span>';
    } else if (kind === 'export_download') {
      tag = '<span class="pill pill-inactive" style="font-size:10px;padding:2px 8px">Export</span>';
    }
    const actor = it.actor && String(it.actor).length < 40 ? it.actor : (it.actor_id || '—');
    return `<li style="padding:8px 10px;border-bottom:1px solid var(--border);font-size:12px;display:flex;flex-direction:column;gap:2px">
      <div style="display:flex;gap:8px;align-items:center;justify-content:space-between">
        <div style="display:flex;gap:8px;align-items:center">${tag}<span style="color:var(--text-tertiary);font-size:11px">${esc(actor)}</span></div>
        <span style="color:var(--text-tertiary);white-space:nowrap;font-size:11px">${esc(when)}</span>
      </div>
      <div style="color:var(--text-secondary);line-height:1.5">${esc(it.message || '')}</div>
    </li>`;
  }).join('');
  return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px">
    <div style="font-weight:600;font-size:13px;margin-bottom:8px">Audit trail</div>
    ${banner}
    <ul style="list-style:none;margin:0;padding:0">${rows}</ul>
  </div>`;
}

function _renderPatientDetail(profile, audit, navigate, opts) {
  const optsSafe = opts || {};
  const captured = profile?.captured_at ? new Date(profile.captured_at).toLocaleString() : 'Not yet captured.';
  const staleNote = profile?.generated_at
    ? `<span style="font-size:11px;color:var(--text-tertiary)">Workspace generated: ${esc(new Date(profile.generated_at).toLocaleString())}</span>`
    : '';
  const cards = MODALITY_ORDER.map((m) => _renderModalityCard(m, profile?.modalities?.[m], profile?.prior_scores)).join('');
  const recomputeBtn = optsSafe.usingFixtures
    ? `<button type="button" class="btn btn-ghost btn-sm" data-action="recompute" disabled title="Demo sample — recomputation is not persisted" style="min-height:44px;opacity:.7">Recompute (disabled in demo)</button>`
    : `<button type="button" class="btn btn-ghost btn-sm" data-action="recompute" style="min-height:44px">Recompute workspace</button>`;
  const exportBtn = optsSafe.usingFixtures
    ? `<button type="button" class="btn btn-ghost btn-sm" data-action="export-json" disabled title="Export requires a live API session" style="min-height:44px;opacity:.65">Export JSON</button>`
    : `<button type="button" class="btn btn-ghost btn-sm" data-action="export-json" style="min-height:44px" title="Download workspace JSON (audit logged)">Export JSON</button>`;

  return `<section aria-label="Patient movement workspace">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin:12px 0 14px;flex-wrap:wrap">
      <div>
        <div style="font-size:12px;color:var(--text-tertiary)">Last capture reference: ${esc(captured)}</div>
        ${staleNote ? `<div style="margin-top:4px">${staleNote}</div>` : ''}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${recomputeBtn}
        ${exportBtn}
        <button type="button" class="btn btn-ghost btn-sm" data-action="refresh-patient" style="min-height:44px">Refresh</button>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;margin-bottom:14px">${cards}</div>
    <div style="display:grid;grid-template-columns:1fr;gap:14px">
      ${_renderWorkflowNav(optsSafe.patientId, !!optsSafe.usingFixtures)}
      ${_renderAiSummary(profile)}
      ${_renderDataAvailability(profile)}
      ${_renderFlags(profile)}
      ${_renderSourceVideoPanel(profile, navigate)}
      ${_renderRecommendations(profile)}
      ${_renderGovernance(profile)}
      ${_renderLinkedModules(profile, optsSafe.patientId)}
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px">
        <h3 style="margin:0 0 8px;font-size:13px;font-weight:600">Clinician review acknowledgment</h3>
        <p style="margin:0 0 10px;font-size:11px;color:var(--text-secondary)">Records that you reviewed this workspace (audit only — not a legal sign-off). Requires a short note.</p>
        <form data-review-ack-form style="display:flex;flex-direction:column;gap:10px">
          <textarea name="review_note" class="form-control" rows="2" placeholder="e.g. Reviewed cues with patient; correlate with exam." style="min-height:56px;width:100%" aria-label="Review acknowledgment note"></textarea>
          <div style="display:flex;gap:8px;align-items:center;justify-content:flex-end;flex-wrap:wrap">
            <span data-review-form-error style="color:var(--red);font-size:11px;margin-right:auto"></span>
            <button type="submit" class="btn btn-secondary btn-sm" data-action="review-submit" style="min-height:44px">Mark workspace reviewed</button>
          </div>
        </form>
      </div>
      ${_renderAnnotationForm(!!optsSafe.demoAnnotationLocal)}
      ${_renderAuditPanel(audit, optsSafe.auditDemoLabel)}
    </div>
  </section>`;
}

function _patientDisplayName(p) {
  if (!p) return '';
  const fn = (p.first_name || '').trim();
  const ln = (p.last_name || '').trim();
  const joined = `${fn} ${ln}`.trim();
  return joined || p.patient_name || p.name || '';
}

function _enrichPatientName(p) {
  const personas = ANALYZER_DEMO_FIXTURES?.patients || [];
  if (p.patient_name) return p;
  const match = personas.find((x) => x.id === p.patient_id);
  return { ...p, patient_name: match ? match.name : p.patient_id };
}

async function _loadClinicSummaryFromApi() {
  let list = [];
  try {
    const res = await api.listPatients({ limit: 200, sort: 'last_activity' });
    list = res?.items || (Array.isArray(res) ? res : []) || [];
  } catch {
    list = [];
  }
  const ids = list.map((p) => p.id).filter(Boolean);
  const results = await Promise.all(
    ids.map((pid) => api.getMovementProfile(pid).then((r) => r).catch(() => null))
  );
  const byId = new Map();
  list.forEach((rec, i) => {
    const prof = results[i];
    if (!prof || !prof.patient_id) return;
    const name = _patientDisplayName(rec) || prof.patient_name || rec.id;
    const row = { ...prof, patient_id: rec.id, patient_name: name };
    byId.set(rec.id, _enrichPatientName(row));
  });
  return { patients: Array.from(byId.values()), roster: list };
}

export async function pgMovementAnalyzer(setTopbar, navigate) {
  try {
    setTopbar({
      title: 'Movement Analyzer',
      subtitle: 'Clinician-reviewed movement & motor decision support',
    });
  } catch {
    try { setTopbar('Movement Analyzer', 'Motor decision support'); } catch {}
  }

  const el = document.getElementById('content');
  if (!el) return;

  let view = 'clinic';
  let summaryCache = null;
  let rosterCache = [];
  let activePatientId = null;
  let activePatientName = '';
  let profileCache = null;
  let auditCache = null;
  let sortKey = 'worst';
  let sortDir = 'desc';
  let usingFixtures = false;
  let demoAnnotationLocal = false;

  el.innerHTML = `
    <div class="ds-movement-analyzer-shell" style="max-width:1100px;margin:0 auto;padding:16px 20px 48px">
      <div id="mv-demo-banner"></div>
      <div style="padding:12px 14px;border-radius:12px;border:1px solid rgba(155,127,255,0.28);background:rgba(155,127,255,0.06);margin-bottom:14px;font-size:12px;line-height:1.45;color:var(--text-secondary)">
        <strong style="color:var(--text-primary)">Clinical decision-support — movement review workspace.</strong>
        Summaries fuse passive sensors and chart context where available. Outputs are <strong>movement-analysis cues</strong>, not autonomous neurological diagnosis, fall-risk final determination, treatment eligibility, protocol approval, or medication recommendations. Every finding requires clinician interpretation.
      </div>
      <div id="mv-toolbar" style="margin-bottom:12px;display:flex;flex-wrap:wrap;gap:10px;align-items:center"></div>
      <div id="mv-breadcrumb" style="display:flex;align-items:center;gap:10px;margin-bottom:12px;font-size:12px"></div>
      <div id="mv-body"></div>
    </div>`;

  const $ = (id) => document.getElementById(id);

  function _syncDemoBanner() {
    const slot = $('mv-demo-banner');
    if (!slot) return;
    slot.innerHTML = usingFixtures && isDemoSession() ? DEMO_FIXTURE_BANNER_HTML : '';
  }

  function renderToolbar() {
    const tb = $('mv-toolbar');
    if (!tb) return;
    const opts = (rosterCache || []).map((p) => {
      const label = esc(_patientDisplayName(p) || p.id);
      const sel = p.id === activePatientId ? ' selected' : '';
      return `<option value="${esc(p.id)}"${sel}>${label}</option>`;
    }).join('');
    tb.innerHTML = `
      <button type="button" class="btn btn-ghost btn-sm" id="mv-back-clinic" style="min-height:44px;display:${view === 'patient' ? 'inline-flex' : 'none'}">← Clinic summary</button>
      <label style="font-size:12px;color:var(--text-secondary);display:flex;align-items:center;gap:8px">
        <span>Select patient</span>
        <select id="mv-patient-select" class="form-control" style="min-width:220px;max-width:min(420px,90vw)" aria-label="Select patient for movement workspace">
          <option value="">— Choose patient —</option>
          ${opts}
        </select>
      </label>
      <button type="button" class="btn btn-ghost btn-sm" id="mv-refresh" style="min-height:44px">Refresh data</button>
      <button type="button" class="btn btn-ghost btn-sm" id="mv-nav-dashboard" style="min-height:44px" title="Return to dashboard">Dashboard</button>
    `;
    const selEl = $('mv-patient-select');
    if (selEl && activePatientId) selEl.value = activePatientId;
    $('mv-back-clinic')?.addEventListener('click', () => {
      view = 'clinic';
      activePatientId = null;
      render();
    });
    $('mv-refresh')?.addEventListener('click', () => {
      if (view === 'clinic') loadClinic();
      else loadPatient();
    });
    $('mv-nav-dashboard')?.addEventListener('click', () => {
      try { navigate?.('home'); } catch {}
    });
    selEl?.addEventListener('change', (ev) => {
      const v = String(ev.target.value || '').trim();
      if (!v) return;
      activePatientId = v;
      const hit = rosterCache.find((x) => x.id === v);
      activePatientName = _patientDisplayName(hit) || profileCache?.patient_name || v;
      view = 'patient';
      render();
    });
  }

  function setBreadcrumb() {
    const bc = $('mv-breadcrumb');
    if (!bc) return;
    if (view === 'clinic') {
      bc.innerHTML = `<span style="font-weight:600">Clinic movement summary</span>`;
    } else {
      bc.innerHTML = `<span style="color:var(--text-tertiary)">Patient:</span> <span style="font-weight:600">${esc(activePatientName || activePatientId)}</span>`;
    }
    renderToolbar();
    const back = $('mv-back-clinic');
    if (back) back.style.display = view === 'patient' ? 'inline-flex' : 'none';
  }

  async function loadClinic() {
    const body = $('mv-body');
    if (!body) return;
    body.innerHTML = `<div style="padding:18px;background:var(--bg-card);border:1px solid var(--border);border-radius:14px">${_skeletonChips(5)}</div>`;
    demoAnnotationLocal = false;
    try {
      const loaded = await _loadClinicSummaryFromApi();
      summaryCache = { patients: loaded.patients || [] };
      rosterCache = loaded.roster || [];
      if ((!summaryCache.patients?.length) && isDemoSession() && ANALYZER_DEMO_FIXTURES?.movement) {
        summaryCache = ANALYZER_DEMO_FIXTURES.movement.clinic_summary();
        rosterCache = (summaryCache.patients || []).map((p) => ({
          id: p.patient_id,
          first_name: (p.patient_name || '').split(' ')[0] || '',
          last_name: (p.patient_name || '').split(' ').slice(1).join(' ') || '',
        }));
        usingFixtures = true;
      } else if (summaryCache.patients?.length) {
        usingFixtures = false;
      }
    } catch (e) {
      if (isDemoSession() && ANALYZER_DEMO_FIXTURES?.movement) {
        summaryCache = ANALYZER_DEMO_FIXTURES.movement.clinic_summary();
        rosterCache = (summaryCache.patients || []).map((p) => ({
          id: p.patient_id,
          first_name: (p.patient_name || '').split(' ')[0] || '',
          last_name: (p.patient_name || '').split(' ').slice(1).join(' ') || '',
        }));
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
    setBreadcrumb();
  }

  function wireClinicRows() {
    const body = $('mv-body');
    body?.querySelectorAll('tr[data-patient-id]').forEach((tr) => {
      const pid = tr.getAttribute('data-patient-id');
      const open = () => {
        const p = (summaryCache?.patients || []).find((x) => x.patient_id === pid);
        activePatientId = pid;
        activePatientName = p?.patient_name || pid;
        const sel = $('mv-patient-select');
        if (sel) sel.value = pid;
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
        const sel = $('mv-patient-select');
        if (sel) sel.value = pid;
        view = 'patient';
        render();
      });
    });
  }

  async function loadPatient() {
    const body = $('mv-body');
    if (!body || !activePatientId) return;
    body.innerHTML = `<div style="padding:18px;background:var(--bg-card);border:1px solid var(--border);border-radius:14px">${_skeletonChips(5)}</div>`;
    demoAnnotationLocal = false;
    try {
      const prof = await api.getMovementProfile(activePatientId);
      profileCache = prof;
      let auditResp = await api.getMovementAudit(activePatientId).catch(() => null);
      const merged = mergeMovementAuditItems(profileCache, auditResp);
      auditCache = { patient_id: activePatientId, items: merged };
      if (profileCache) {
        activePatientName = profileCache.patient_name || activePatientName;
      }
      const missingModalities = !profileCache?.modalities || !Object.keys(profileCache.modalities).length;
      if ((missingModalities || !profileCache?.patient_id) && isDemoSession() && ANALYZER_DEMO_FIXTURES?.movement) {
        profileCache = ANALYZER_DEMO_FIXTURES.movement.patient_profile(activePatientId);
        auditCache = { patient_id: activePatientId, items: ANALYZER_DEMO_FIXTURES.movement.patient_audit(activePatientId)?.items || [] };
        usingFixtures = true;
        demoAnnotationLocal = true;
      } else if (profileCache) {
        usingFixtures = false;
      }
    } catch (e) {
      if (isDemoSession() && ANALYZER_DEMO_FIXTURES?.movement) {
        profileCache = ANALYZER_DEMO_FIXTURES.movement.patient_profile(activePatientId);
        auditCache = { patient_id: activePatientId, items: ANALYZER_DEMO_FIXTURES.movement.patient_audit(activePatientId)?.items || [] };
        usingFixtures = true;
        demoAnnotationLocal = true;
      } else {
        const msg = (e && e.message) || String(e);
        body.innerHTML = _errorCard(msg);
        body.querySelector('[data-action="retry"]')?.addEventListener('click', loadPatient);
        return;
      }
    }
    _syncDemoBanner();
    const auditDemoLabel = usingFixtures && isDemoSession() ? 'Sample audit events for offline demo — not a real patient record.' : '';
    body.innerHTML = _renderPatientDetail(profileCache, auditCache, navigate, {
      usingFixtures,
      patientId: activePatientId,
      demoAnnotationLocal,
      auditDemoLabel,
    });
    wirePatientDetail();
  }

  function wirePatientDetail() {
    const body = $('mv-body');
    if (!body) return;

    function goWithPatient(pageId) {
      if (!activePatientId) return;
      try {
        window._profilePatientId = activePatientId;
        window._selectedPatientId = activePatientId;
        navigate?.(pageId);
      } catch {}
    }

    body.querySelectorAll('[data-action="go-video-assessments"]').forEach((btn) => {
      btn.addEventListener('click', () => goWithPatient('video-assessments'));
    });
    body.querySelectorAll('[data-action="go-wearables"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.disabled || !activePatientId) return;
        goWithPatient('wearables');
      });
    });
    body.querySelectorAll('[data-action="go-documents"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.disabled || !activePatientId) return;
        goWithPatient('documents-v2');
      });
    });

    body.querySelector('[data-action="export-json"]')?.addEventListener('click', async (ev) => {
      const btn = ev.currentTarget;
      if (btn.disabled || usingFixtures) return;
      const old = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Preparing…';
      try {
        const { blob, filename } = await api.exportMovementWorkspace(activePatientId);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || `movement-workspace-${activePatientId.slice(0, 8)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        const fresh = await api.getMovementAudit(activePatientId).catch(() => null);
        if (fresh && Array.isArray(fresh.items)) {
          auditCache = fresh;
          body.innerHTML = _renderPatientDetail(profileCache, auditCache, navigate, {
            usingFixtures,
            patientId: activePatientId,
            demoAnnotationLocal,
            auditDemoLabel: usingFixtures && isDemoSession() ? 'Sample audit events for offline demo — not a real patient record.' : '',
          });
          wirePatientDetail();
        }
      } catch (e) {
        body.insertAdjacentHTML('afterbegin', _errorCard((e && e.message) || String(e)));
      } finally {
        if (btn.isConnected) {
          btn.disabled = false;
          btn.textContent = old;
        }
      }
    });

    body.querySelector('[data-review-ack-form]')?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const form = ev.currentTarget;
      const err = form.querySelector('[data-review-form-error]');
      if (err) err.textContent = '';
      const note = String(new FormData(form).get('review_note') || '').trim();
      if (!note) {
        if (err) err.textContent = 'Enter a short review note.';
        form.querySelector('textarea')?.focus();
        return;
      }
      const submit = form.querySelector('[data-action="review-submit"]');
      if (submit) {
        submit.disabled = true;
        submit.textContent = 'Saving…';
      }
      try {
        if (usingFixtures && demoAnnotationLocal) {
          const added = {
            id: `demo-mv-rev-${Date.now()}`,
            kind: 'review_ack',
            actor: 'Demo clinician (sample)',
            message: note,
            created_at: new Date().toISOString(),
          };
          const items = Array.isArray(auditCache?.items) ? auditCache.items.slice() : [];
          items.unshift(added);
          auditCache = { ...(auditCache || {}), items };
        } else {
          await api.ackMovementReview(activePatientId, { note });
          const freshAudit = await api.getMovementAudit(activePatientId).catch(() => null);
          auditCache = freshAudit && Array.isArray(freshAudit.items)
            ? freshAudit
            : { patient_id: activePatientId, items: [] };
        }
        form.reset();
        body.innerHTML = _renderPatientDetail(profileCache, auditCache, navigate, {
          usingFixtures,
          patientId: activePatientId,
          demoAnnotationLocal,
          auditDemoLabel: usingFixtures && isDemoSession() ? 'Sample audit events for offline demo — not a real patient record.' : '',
        });
        wirePatientDetail();
      } catch (e) {
        if (err) err.textContent = (e && e.message) || String(e);
      } finally {
        const sub = form.querySelector('[data-action="review-submit"]');
        if (sub && sub.isConnected) {
          sub.disabled = false;
          sub.textContent = 'Mark workspace reviewed';
        }
      }
    });

    body.querySelectorAll('[data-action="nav-module"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const page = btn.getAttribute('data-nav-page');
        if (!page) return;
        try {
          if (page === 'patient-profile') {
            window._profilePatientId = activePatientId;
            window._selectedPatientId = activePatientId;
          }
          navigate?.(page);
        } catch {}
      });
    });

    body.querySelector('[data-action="recompute"]')?.addEventListener('click', async (ev) => {
      const btn = ev.currentTarget;
      if (btn.disabled) return;
      const old = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Recomputing…';
      try {
        await api.recomputeMovement(activePatientId);
        await loadPatient();
      } catch (e) {
        btn.disabled = false;
        btn.textContent = old;
        body.insertAdjacentHTML('afterbegin', _errorCard((e && e.message) || String(e)));
      }
    });

    body.querySelector('[data-action="refresh-patient"]')?.addEventListener('click', () => loadPatient());

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
        if (errSlot) errSlot.textContent = 'Enter a clinical note before saving.';
        form.querySelector('textarea')?.focus();
        return;
      }
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      submit.textContent = 'Saving…';
      try {
        if (usingFixtures && demoAnnotationLocal) {
          const added = {
            id: `demo-mv-aud-${Date.now()}`,
            kind: 'annotation',
            actor: 'Demo clinician (sample)',
            message: note,
            created_at: new Date().toISOString(),
          };
          const items = Array.isArray(auditCache?.items) ? auditCache.items.slice() : [];
          items.unshift(added);
          auditCache = { ...(auditCache || {}), items };
        } else {
          await api.addMovementAnnotation(activePatientId, { message: note });
          const freshAudit = await api.getMovementAudit(activePatientId).catch(() => null);
          auditCache = freshAudit && Array.isArray(freshAudit.items)
            ? freshAudit
            : { patient_id: activePatientId, items: [] };
        }
        form.reset();
        body.innerHTML = _renderPatientDetail(profileCache, auditCache, navigate, {
          usingFixtures,
          patientId: activePatientId,
          demoAnnotationLocal,
          auditDemoLabel: usingFixtures && isDemoSession() ? 'Sample audit events for offline demo — not a real patient record.' : '',
        });
        wirePatientDetail();
      } catch (e) {
        if (errSlot) errSlot.textContent = (e && e.message) || String(e);
      } finally {
        if (submit && submit.isConnected) {
          submit.disabled = false;
          submit.textContent = 'Save note to audit trail';
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

export default { pgMovementAnalyzer };
