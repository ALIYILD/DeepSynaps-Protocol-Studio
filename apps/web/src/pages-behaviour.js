/**
 * Behaviour Page — clinician workspace for behavioral interventions and observations.
 *
 * Scope: active behavioral protocols, observation logs, outcome tracking,
 * and safety flags for patients under neuromodulation care.
 *
 * Decision-support only. Behavioral observations are not diagnostic labels.
 */

import { api } from './api.js';
import { currentUser } from './auth.js';
import { isDemoSession } from './demo-session.js';
import { ANALYZER_DEMO_FIXTURES as PREVIEW_FIXTURES, DEMO_FIXTURE_BANNER_HTML as PREVIEW_FIXTURE_BANNER_HTML } from './demo-fixtures-analyzers.js';

const CLINICAL_BEHAVIOUR_ROLES = new Set(['clinician', 'admin', 'clinic-admin', 'supervisor']);

const PROTOCOL_ORDER = [
  'cbt_i',
  'behavioral_activation',
  'exposure_therapy',
  'dbt_skills',
  'act',
  'parent_training',
  'social_skills',
  'relaxation_training',
  'other',
];

const PROTOCOL_LABELS = {
  cbt_i: 'CBT-I (Cognitive Behavioural Therapy for Insomnia)',
  behavioral_activation: 'Behavioral Activation',
  exposure_therapy: 'Exposure Therapy',
  dbt_skills: 'DBT Skills Training',
  act: 'Acceptance & Commitment Therapy',
  parent_training: 'Parent Training / PCIT',
  social_skills: 'Social Skills Training',
  relaxation_training: 'Relaxation / Biofeedback',
  other: 'Other Behavioural Protocol',
};

const OUTCOME_LABELS = {
  phq9: 'PHQ-9',
  gad7: 'GAD-7',
  cssrs: 'C-SSRS',
  activation: 'Behavioral Activation Scale',
  sleep_efficiency: 'Sleep Efficiency %',
  panic_frequency: 'Panic Frequency / week',
  custom: 'Custom Outcome',
};

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _statusKey(s) {
  return String(s || '').toLowerCase();
}

function _protocolPill(status) {
  const s = _statusKey(status);
  if (s === 'active') return '<span class="pill pill-active">Active</span>';
  if (s === 'paused') return '<span class="pill pill-pending">Paused</span>';
  if (s === 'completed') return '<span class="pill" style="background:rgba(45,212,191,0.12);color:var(--teal-400);border:1px solid rgba(45,212,191,0.25)">Completed</span>';
  if (s === 'discontinued') return '<span class="pill pill-inactive">Discontinued</span>';
  return '<span class="pill pill-inactive">—</span>';
}

function _outcomeTrendArrow(trend) {
  const t = String(trend || '').toLowerCase();
  if (t === 'improving') return '<span title="Improving" style="color:var(--green)">↓</span>';
  if (t === 'worsening') return '<span title="Worsening" style="color:var(--red)">↑</span>';
  if (t === 'stable') return '<span title="Stable" style="color:var(--text-tertiary)">→</span>';
  return '<span style="color:var(--text-tertiary)">·</span>';
}

function _safetyFlagPill(level) {
  const s = _statusKey(level);
  if (s === 'critical') {
    return '<span class="pill" style="background:rgba(255,107,107,0.16);color:var(--red);border:1px solid rgba(255,107,107,0.32);font-weight:700">⚠ Critical</span>';
  }
  if (s === 'high') {
    return '<span class="pill" style="background:rgba(255,176,87,0.14);color:var(--amber);border:1px solid rgba(255,176,87,0.30)">High</span>';
  }
  if (s === 'moderate') {
    return '<span class="pill" style="background:rgba(96,165,250,0.12);color:var(--blue);border:1px solid rgba(96,165,250,0.25)">Moderate</span>';
  }
  if (s === 'low') {
    return '<span class="pill pill-inactive">Low</span>';
  }
  return '<span class="pill pill-inactive">—</span>';
}

function _renderPreviewBanner() {
  return `<div role="status" style="padding:10px 14px;border-radius:10px;border:1px solid rgba(251,191,36,0.35);background:rgba(251,191,36,0.08);margin-bottom:14px;font-size:12px;color:var(--text-secondary);line-height:1.45">
    <strong style="color:var(--amber)">Preview workspace:</strong> Full behavioural backend integration is pending. Data shown is minimal or synthetic — not for clinical decision-making.
  </div>`;
}

function _miniTrendDots(values) {
  if (!Array.isArray(values) || values.length === 0) return '';
  const max = Math.max(...values.filter((v) => typeof v === 'number' && Number.isFinite(v)));
  const min = Math.min(...values.filter((v) => typeof v === 'number' && Number.isFinite(v)));
  const range = max - min || 1;
  const dots = values
    .map((v) => {
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        return '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--text-tertiary);opacity:0.25;margin:0 2px"></span>';
      }
      const h = Math.max(2, Math.min(14, 2 + ((v - min) / range) * 12));
      const color = v > min + range * 0.7 ? 'var(--red)' : v > min + range * 0.4 ? 'var(--amber)' : 'var(--green)';
      return `<span style="display:inline-block;width:6px;height:${h.toFixed(0)}px;border-radius:3px;background:${color};margin:0 2px;vertical-align:middle"></span>`;
    })
    .join('');
  return `<span style="display:inline-flex;align-items:flex-end;height:16px" aria-hidden="true">${dots}</span>`;
}

function _errorCard(message) {
  const safe = esc(message || '');
  return `<div role="alert" style="max-width:560px;margin:24px auto;padding:18px 20px;border:1px solid rgba(255,107,107,0.35);background:rgba(255,107,107,0.06);border-radius:12px">
    <div style="font-weight:600;margin-bottom:6px;color:var(--text-primary)">We couldn’t load the behaviour workspace right now.</div>
    <div style="font-size:12px;color:var(--text-secondary);line-height:1.5;margin-bottom:12px">${safe}</div>
    <button type="button" class="btn btn-ghost btn-sm" data-action="retry" style="min-height:44px">Try again</button>
  </div>`;
}

function _emptyState(title, body) {
  return `<div style="padding:32px 16px;text-align:center;border:1px dashed var(--border);border-radius:12px">
    <div style="font-size:2rem;margin-bottom:8px">📝</div>
    <div style="font-weight:600;font-size:13px;margin-bottom:4px;color:var(--text-primary)">${esc(title)}</div>
    <div style="font-size:12px;color:var(--text-secondary);line-height:1.5">${esc(body)}</div>
  </div>`;
}

export function canUseBehaviourWorkspace(role, opts = {}) {
  const r = String(role || '').trim().toLowerCase();
  if (!r) return Boolean(opts.allowUnknown);
  return CLINICAL_BEHAVIOUR_ROLES.has(r);
}

export function applyBehaviourPatientContext(pageId, patientId, win = globalThis?.window) {
  const pid = String(patientId || '').trim();
  if (!pid || !win) return;
  try { win._selectedPatientId = pid; } catch {}
  try { win._profilePatientId = pid; } catch {}
  if (pageId === 'behaviour') {
    try { win._behaviourPatientId = pid; } catch {}
  }
}

function _normalizeBehaviourProfile(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const protocols = Array.isArray(raw.protocols) ? raw.protocols : [];
  const observations = Array.isArray(raw.observations) ? raw.observations : [];
  const outcomes = Array.isArray(raw.outcomes) ? raw.outcomes : [];
  const safetyFlags = Array.isArray(raw.safety_flags) ? raw.safety_flags : (Array.isArray(raw.safetyFlags) ? raw.safetyFlags : []);
  return {
    patient_id: raw.patient_id || raw.patientId || '',
    patient_name: raw.patient_name || raw.patientName || 'Patient',
    protocols,
    observations,
    outcomes,
    safety_flags: safetyFlags,
    last_reviewed_at: raw.last_reviewed_at || raw.lastReviewedAt || null,
    reviewed_by: raw.reviewed_by || raw.reviewedBy || null,
  };
}

function _normalizeClinicSummary(raw) {
  if (!raw || typeof raw !== 'object') return { patients: [], total_active_protocols: 0, total_flags: 0 };
  const patients = Array.isArray(raw.patients) ? raw.patients : [];
  return {
    patients,
    total_active_protocols: raw.total_active_protocols ?? raw.totalActiveProtocols ?? patients.reduce((sum, p) => sum + (p.active_protocol_count || 0), 0),
    total_flags: raw.total_flags ?? raw.totalFlags ?? patients.reduce((sum, p) => sum + (p.flag_count || 0), 0),
  };
}

function _renderClinicSummary(summary, navigate, demoMode) {
  const patients = summary.patients || [];
  const empty = patients.length === 0;

  const rows = patients
    .map((p) => {
      const pid = esc(p.patient_id || p.id || '');
      const name = esc(p.patient_name || p.name || 'Unknown');
      const flags = Number(p.flag_count || p.flags || 0);
      const active = Number(p.active_protocol_count || p.activeProtocols || 0);
      const lastObs = p.last_observation_at ? new Date(p.last_observation_at).toLocaleDateString() : '—';
      const worstFlag = String(p.worst_flag || p.worstFlag || '').toLowerCase();
      const flagDot = worstFlag === 'critical' ? 'var(--red)' : worstFlag === 'high' ? 'var(--amber)' : worstFlag === 'moderate' ? 'var(--blue)' : 'var(--text-tertiary)';
      return `<tr style="cursor:pointer" data-pid="${pid}" data-action="open-patient">
        <td style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:13px">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${flagDot};flex-shrink:0"></span>
            <span style="font-weight:600">${name}</span>
          </div>
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:12px;color:var(--text-secondary);text-align:center">${active}</td>
        <td style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:12px;color:var(--text-secondary);text-align:center">${flags > 0 ? `<strong style="color:var(--red)">${flags}</strong>` : '—'}</td>
        <td style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:12px;color:var(--text-secondary);white-space:nowrap">${lastObs}</td>
      </tr>`;
    })
    .join('');

  return `
    <div style="margin-bottom:20px">
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px">
        <div style="flex:1;min-width:180px;padding:14px 16px;border:1px solid var(--border);border-radius:12px;background:var(--bg-card)">
          <div style="font-size:12px;color:var(--text-secondary);margin-bottom:4px">Patients with active protocols</div>
          <div style="font-size:22px;font-weight:700">${patients.length}</div>
        </div>
        <div style="flex:1;min-width:180px;padding:14px 16px;border:1px solid var(--border);border-radius:12px;background:var(--bg-card)">
          <div style="font-size:12px;color:var(--text-secondary);margin-bottom:4px">Total active protocols</div>
          <div style="font-size:22px;font-weight:700">${summary.total_active_protocols || 0}</div>
        </div>
        <div style="flex:1;min-width:180px;padding:14px 16px;border:1px solid var(--border);border-radius:12px;background:var(--bg-card)">
          <div style="font-size:12px;color:var(--text-secondary);margin-bottom:4px">Open safety flags</div>
          <div style="font-size:22px;font-weight:700;color:${summary.total_flags > 0 ? 'var(--red)' : 'inherit'}">${summary.total_flags || 0}</div>
        </div>
      </div>
      ${empty
        ? _emptyState('No behavioural data', demoMode
          ? 'Demo roster is empty — this clinic has no sample behavioural records.'
          : 'Behavioural interventions and observations will appear here once documented for patients under care.')
        : `<div style="border:1px solid var(--border);border-radius:12px;overflow:hidden;background:var(--bg-card)">
            <table style="width:100%;border-collapse:collapse">
              <thead>
                <tr style="text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.03em;color:var(--text-tertiary)">
                  <th style="padding:10px 12px;border-bottom:1px solid var(--border);font-weight:600">Patient</th>
                  <th style="padding:10px 12px;border-bottom:1px solid var(--border);font-weight:600;text-align:center">Active</th>
                  <th style="padding:10px 12px;border-bottom:1px solid var(--border);font-weight:600;text-align:center">Flags</th>
                  <th style="padding:10px 12px;border-bottom:1px solid var(--border);font-weight:600">Last observation</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>`}
    </div>`;
}

function _renderPatientDetail(profile, audit, demoMode) {
  const p = _normalizeBehaviourProfile(profile);
  if (!p) {
    return _emptyState('No behavioural profile', 'This patient does not have any recorded behavioural interventions or observations.');
  }

  const protocols = p.protocols || [];
  const observations = p.observations || [];
  const outcomes = p.outcomes || [];
  const safetyFlags = p.safety_flags || [];

  const protocolRows = PROTOCOL_ORDER.filter((k) => protocols.some((pr) => _statusKey(pr.type || pr.protocol_type) === k))
    .map((k) => {
      const pr = protocols.find((x) => _statusKey(x.type || x.protocol_type) === k);
      return `<tr>
        <td style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:13px">
          <div style="font-weight:500">${esc(PROTOCOL_LABELS[k] || pr.label || pr.name || k)}</div>
          ${pr.notes ? `<div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">${esc(pr.notes)}</div>` : ''}
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:12px;white-space:nowrap">${_protocolPill(pr.status)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:12px;color:var(--text-secondary);white-space:nowrap">${pr.started_at ? new Date(pr.started_at).toLocaleDateString() : '—'}</td>
      </tr>`;
    })
    .join('');

  const otherProtocols = protocols.filter((pr) => !PROTOCOL_ORDER.includes(_statusKey(pr.type || pr.protocol_type)));
  const otherRows = otherProtocols
    .map((pr) => `<tr>
      <td style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:13px">
        <div style="font-weight:500">${esc(pr.label || pr.name || pr.type || 'Protocol')}</div>
        ${pr.notes ? `<div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">${esc(pr.notes)}</div>` : ''}
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:12px;white-space:nowrap">${_protocolPill(pr.status)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:12px;color:var(--text-secondary);white-space:nowrap">${pr.started_at ? new Date(pr.started_at).toLocaleDateString() : '—'}</td>
    </tr>`)
    .join('');

  const obsRows = observations
    .slice(0, 50)
    .map((obs) => `<tr>
      <td style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:12px;color:var(--text-secondary);white-space:nowrap">${obs.recorded_at ? new Date(obs.recorded_at).toLocaleDateString() : '—'}</td>
      <td style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:13px">${esc(obs.category || 'Observation')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:13px">${esc(obs.note || obs.notes || obs.description || '—')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:12px;color:var(--text-secondary);white-space:nowrap">${esc(obs.recorded_by || obs.clinician || '—')}</td>
    </tr>`)
    .join('');

  const outcomeCards = outcomes
    .map((o) => {
      const key = _statusKey(o.type || o.outcome_type || 'custom');
      const label = esc(OUTCOME_LABELS[key] || o.label || o.name || 'Outcome');
      const latest = typeof o.latest_value === 'number' && Number.isFinite(o.latest_value) ? o.latest_value : null;
      const previous = typeof o.previous_value === 'number' && Number.isFinite(o.previous_value) ? o.previous_value : null;
      const trend = String(o.trend || '').toLowerCase();
      const history = Array.isArray(o.history) ? o.history : [];
      const values = history.map((h) => (typeof h === 'number' ? h : h?.value));
      const delta = latest != null && previous != null ? latest - previous : null;
      const deltaHtml = delta != null
        ? `<span style="font-size:12px;margin-left:6px;color:${delta < 0 ? 'var(--green)' : delta > 0 ? 'var(--red)' : 'var(--text-tertiary)'}">${delta > 0 ? '+' : ''}${delta.toFixed(1)}</span>`
        : '';
      return `<div style="padding:12px 14px;border:1px solid var(--border);border-radius:10px;background:var(--bg-card);min-width:180px;flex:1">
        <div style="font-size:11px;color:var(--text-secondary);margin-bottom:4px">${label}</div>
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
          <span style="font-size:20px;font-weight:700">${latest != null ? latest.toFixed(1) : '—'}</span>
          ${deltaHtml}
          ${_outcomeTrendArrow(trend)}
        </div>
        <div style="margin-bottom:4px">${_miniTrendDots(values)}</div>
        <div style="font-size:11px;color:var(--text-tertiary)">${history.length} reading${history.length !== 1 ? 's' : ''}</div>
      </div>`;
    })
    .join('');

  const flagRows = safetyFlags
    .sort((a, b) => {
      const rank = { critical: 0, high: 1, moderate: 2, low: 3 };
      return (rank[_statusKey(a.level)] ?? 99) - (rank[_statusKey(b.level)] ?? 99);
    })
    .map((f) => `<tr>
      <td style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:12px;white-space:nowrap">${_safetyFlagPill(f.level)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:13px">
        <div style="font-weight:500">${esc(f.category || 'Safety flag')}</div>
        ${f.description ? `<div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">${esc(f.description)}</div>` : ''}
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:12px;color:var(--text-secondary);white-space:nowrap">${f.raised_at ? new Date(f.raised_at).toLocaleDateString() : '—'}</td>
      <td style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:12px;color:var(--text-secondary);white-space:nowrap">${f.raised_by || '—'}</td>
    </tr>`)
    .join('');

  const lastReview = p.last_reviewed_at
    ? `Last reviewed ${new Date(p.last_reviewed_at).toLocaleDateString()}${p.reviewed_by ? ` by ${esc(p.reviewed_by)}` : ''}`
    : 'Not yet reviewed';

  return `
    <div style="margin-bottom:18px">
      <div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px">${esc(lastReview)}</div>

      <div style="padding:12px 14px;border-radius:12px;border:1px solid rgba(155,127,255,0.28);background:rgba(155,127,255,0.06);margin-bottom:16px;font-size:12px;line-height:1.45;color:var(--text-secondary)">
        <strong style="color:var(--text-primary)">Clinical decision-support.</strong>
        Behavioural observations and outcome scores are adjunctive to clinical judgment. They do not diagnose, replace structured assessment, or autonomously trigger safety actions. Clinician review is required.
      </div>

      ${safetyFlags.length > 0 ? `
        <div style="margin-bottom:20px">
          <h3 style="font-size:14px;font-weight:600;margin:0 0 10px;color:var(--text-primary)">Safety flags</h3>
          <div style="border:1px solid var(--border);border-radius:12px;overflow:hidden;background:var(--bg-card)">
            <table style="width:100%;border-collapse:collapse">
              <thead>
                <tr style="text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.03em;color:var(--text-tertiary)">
                  <th style="padding:10px 12px;border-bottom:1px solid var(--border);font-weight:600">Level</th>
                  <th style="padding:10px 12px;border-bottom:1px solid var(--border);font-weight:600">Category</th>
                  <th style="padding:10px 12px;border-bottom:1px solid var(--border);font-weight:600">Date</th>
                  <th style="padding:10px 12px;border-bottom:1px solid var(--border);font-weight:600">Raised by</th>
                </tr>
              </thead>
              <tbody>${flagRows}</tbody>
            </table>
          </div>
        </div>
      ` : ''}

      <div style="margin-bottom:20px">
        <h3 style="font-size:14px;font-weight:600;margin:0 0 10px;color:var(--text-primary)">Active behavioural protocols</h3>
        ${protocols.length === 0
          ? _emptyState('No protocols', 'No behavioural protocols are recorded for this patient.')
          : `<div style="border:1px solid var(--border);border-radius:12px;overflow:hidden;background:var(--bg-card)">
              <table style="width:100%;border-collapse:collapse">
                <thead>
                  <tr style="text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.03em;color:var(--text-tertiary)">
                    <th style="padding:10px 12px;border-bottom:1px solid var(--border);font-weight:600">Protocol</th>
                    <th style="padding:10px 12px;border-bottom:1px solid var(--border);font-weight:600">Status</th>
                    <th style="padding:10px 12px;border-bottom:1px solid var(--border);font-weight:600">Started</th>
                  </tr>
                </thead>
                <tbody>${protocolRows}${otherRows}</tbody>
              </table>
            </div>`}
      </div>

      <div style="margin-bottom:20px">
        <h3 style="font-size:14px;font-weight:600;margin:0 0 10px;color:var(--text-primary)">Outcome tracking</h3>
        ${outcomes.length === 0
          ? _emptyState('No outcomes', 'Record behavioural outcome scores to track change over time.')
          : `<div style="display:flex;gap:12px;flex-wrap:wrap">${outcomeCards}</div>`}
      </div>

      <div style="margin-bottom:20px">
        <h3 style="font-size:14px;font-weight:600;margin:0 0 10px;color:var(--text-primary)">Observation log</h3>
        ${observations.length === 0
          ? _emptyState('No observations', 'Behavioural observations from clinicians and caregivers will appear here.')
          : `<div style="border:1px solid var(--border);border-radius:12px;overflow:hidden;background:var(--bg-card)">
              <table style="width:100%;border-collapse:collapse">
                <thead>
                  <tr style="text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.03em;color:var(--text-tertiary)">
                    <th style="padding:10px 12px;border-bottom:1px solid var(--border);font-weight:600">Date</th>
                    <th style="padding:10px 12px;border-bottom:1px solid var(--border);font-weight:600">Category</th>
                    <th style="padding:10px 12px;border-bottom:1px solid var(--border);font-weight:600">Note</th>
                    <th style="padding:10px 12px;border-bottom:1px solid var(--border);font-weight:600">Recorded by</th>
                  </tr>
                </thead>
                <tbody>${obsRows}</tbody>
              </table>
            </div>`}
      </div>

      ${demoMode ? '' : `
        <div style="padding:12px 14px;border-radius:10px;border:1px dashed var(--border);background:rgba(255,255,255,0.02);font-size:12px;color:var(--text-secondary);line-height:1.5">
          <strong style="color:var(--text-primary)">Integration note:</strong> This workspace is designed to connect with structured behavioural protocol registries and outcome score APIs. When backend endpoints are available, patient data will populate automatically.
        </div>
      `}
    </div>`;
}

export async function pgBehaviour(setTopbar, navigate) {
  try {
    setTopbar({
      title: 'Behaviour',
      subtitle: 'Behavioural interventions & observations',
    });
  } catch {
    try { setTopbar('Behaviour', 'Behavioural workspace'); } catch {}
  }

  const el = document.getElementById('content');
  if (!el) return;

  const demoMode = isDemoSession();
  const role = String(currentUser?.role || '').trim().toLowerCase();
  if (!canUseBehaviourWorkspace(role, { allowUnknown: demoMode })) {
    el.innerHTML = `
      <div class="auth-required-notice" style="max-width:520px;margin:48px auto;padding:24px">
        <div class="auth-required-icon" aria-hidden="true">📝</div>
        <div class="auth-required-text" style="line-height:1.5">
          The Behaviour workspace is restricted to clinical staff. It surfaces behavioural protocols, observations, and outcome data intended for licensed clinician review — not patient self-service.
        </div>
        <button type="button" class="btn btn-primary" onclick="window._nav('dashboard')">Back to clinic home</button>
      </div>`;
    return;
  }

  let view = 'clinic';
  let summaryCache = null;
  let profileCache = null;
  let activePatientId = null;
  let activePatientName = '';
  let usingFixtures = false;

  try {
    const handoff = typeof window !== 'undefined' ? window._behaviourPatientId : null;
    if (handoff && String(handoff).trim()) {
      activePatientId = String(handoff).trim();
      activePatientName = 'Patient';
      view = 'patient';
      window._behaviourPatientId = null;
    }
  } catch {}

  el.innerHTML = `
    <div class="ds-behaviour-shell" style="max-width:1100px;margin:0 auto;padding:16px 20px 48px">
      <div id="bh-demo-banner"></div>
      <div id="bh-breadcrumb" style="display:flex;align-items:center;gap:10px;margin-bottom:12px;font-size:12px"></div>
      <div id="bh-body"></div>
    </div>`;

  const $ = (id) => document.getElementById(id);

  function _syncDemoBanner() {
    const slot = $('bh-demo-banner');
    if (!slot) return;
    slot.innerHTML = usingFixtures && isDemoSession() ? PREVIEW_FIXTURE_BANNER_HTML : '';
  }

  function setBreadcrumb() {
    const bc = $('bh-breadcrumb');
    if (!bc) return;
    if (view === 'clinic') {
      bc.innerHTML = `<span style="color:var(--text-tertiary)">Clinic overview</span>`;
    } else {
      bc.innerHTML = `<a href="#" data-action="back-to-clinic" style="color:var(--text-secondary);text-decoration:none">← Clinic overview</a><span style="color:var(--text-tertiary)"> / ${esc(activePatientName)}</span>`;
    }
  }

  function wireBreadcrumb() {
    const bc = $('bh-breadcrumb');
    if (!bc) return;
    bc.querySelector('[data-action="back-to-clinic"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      view = 'clinic';
      activePatientId = null;
      activePatientName = '';
      render();
    });
  }

  async function loadClinic() {
    const body = $('bh-body');
    if (!body) return;
    body.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-tertiary)">Loading clinic summary…</div>';

    try {
      let summary = null;
      try {
        summary = await api.getBehaviourClinicSummary();
      } catch (apiErr) {
        summary = null;
      }

      const normalized = _normalizeClinicSummary(summary);
      if (!normalized.patients.length || summary?.preview_note) {
        const fixtures = PREVIEW_FIXTURES?.behaviour;
        if (demoMode && fixtures?.clinic_summary) {
          summary = fixtures.clinic_summary();
          usingFixtures = true;
        } else {
          summary = normalized;
          usingFixtures = false;
        }
      } else {
        summary = normalized;
        usingFixtures = false;
      }

      summaryCache = summary;
      _syncDemoBanner();
      body.innerHTML = _renderPreviewBanner() + _renderClinicSummary(summary, navigate, demoMode);
      wireClinic();
    } catch (e) {
      const fixtures = PREVIEW_FIXTURES?.behaviour;
      if (demoMode && fixtures?.clinic_summary) {
        summaryCache = fixtures.clinic_summary();
        usingFixtures = true;
        _syncDemoBanner();
        body.innerHTML = _renderPreviewBanner() + _renderClinicSummary(summaryCache, navigate, demoMode);
        wireClinic();
      } else {
        body.innerHTML = _errorCard((e && e.message) || String(e));
        body.querySelector('[data-action="retry"]')?.addEventListener('click', loadClinic);
      }
    }
  }

  function wireClinic() {
    const body = $('bh-body');
    if (!body) return;
    body.querySelectorAll('[data-action="open-patient"]').forEach((row) => {
      row.addEventListener('click', () => {
        const pid = row.getAttribute('data-pid');
        if (!pid) return;
        activePatientId = pid;
        activePatientName = row.querySelector('span[style*="font-weight:600"]')?.textContent || 'Patient';
        view = 'patient';
        render();
      });
    });
  }

  async function loadPatient() {
    const body = $('bh-body');
    if (!body) return;
    body.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-tertiary)">Loading patient profile…</div>';

    try {
      let profile = null;
      try {
        profile = await api.getBehaviourPatientProfile(activePatientId);
      } catch (apiErr) {
        profile = null;
      }

      let audit = { items: [] };
      try {
        const auditResp = await api.getBehaviourPatientAudit(activePatientId);
        audit = auditResp?.items ? auditResp : { items: [] };
      } catch (apiErr) {
        audit = { items: [] };
      }

      const isPreviewData = !profile || profile?.protocols?.length === 0 && profile?.observations?.length === 0;
      if (isPreviewData) {
        const fixtures = PREVIEW_FIXTURES?.behaviour;
        if (demoMode && fixtures?.patient_profile) {
          profile = fixtures.patient_profile(activePatientId);
          audit = fixtures.patient_audit?.(activePatientId) || { items: [] };
          usingFixtures = true;
        }
      } else {
        usingFixtures = false;
      }

      profileCache = profile;
      activePatientName = profile?.patient_name || profile?.patientName || activePatientName || 'Patient';
      applyBehaviourPatientContext('behaviour', activePatientId);
      _syncDemoBanner();
      body.innerHTML = _renderPreviewBanner() + _renderPatientDetail(profile, audit, demoMode);
      wirePatient();
    } catch (e) {
      const fixtures = PREVIEW_FIXTURES?.behaviour;
      if (demoMode && fixtures?.patient_profile) {
        profileCache = fixtures.patient_profile(activePatientId);
        const audit = fixtures.patient_audit?.(activePatientId) || { items: [] };
        usingFixtures = true;
        activePatientName = profileCache?.patient_name || profileCache?.patientName || activePatientName || 'Patient';
        applyBehaviourPatientContext('behaviour', activePatientId);
        _syncDemoBanner();
        body.innerHTML = _renderPreviewBanner() + _renderPatientDetail(profileCache, audit, demoMode);
        wirePatient();
      } else {
        body.innerHTML = _errorCard((e && e.message) || String(e));
        body.querySelector('[data-action="retry"]')?.addEventListener('click', loadPatient);
      }
    }
  }

  function wirePatient() {
    const body = $('bh-body');
    if (!body) return;
    // Patient-level interactivity can be wired here (e.g. add observation forms)
  }

  function render() {
    setBreadcrumb();
    wireBreadcrumb();
    if (view === 'clinic') {
      loadClinic();
    } else {
      loadPatient();
    }
  }

  render();
}

export default { pgBehaviour };
