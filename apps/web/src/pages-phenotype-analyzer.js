/**
 * Phenotype Analyzer — clinician workspace for registry-linked phenotype
 * hypothesis labels (assignments), not autonomous diagnosis or protocol choice.
 *
 * Backend: GET/POST/DELETE /api/v1/phenotype-assignments, GET registry phenotypes.
 * No server-side "phenotype recompute" in this product slice — assignments are
 * explicit clinician actions; refreshing reloads from the API.
 */
import { api } from './api.js';
import { currentUser } from './auth.js';
import { isDemoSession } from './demo-session.js';
import { ANALYZER_DEMO_FIXTURES, DEMO_FIXTURE_BANNER_HTML } from './demo-fixtures-analyzers.js';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _canEditAssignments() {
  const r = String(currentUser?.role || '').toLowerCase();
  /* Matches phenotype_router POST/DELETE: require_minimum_role(actor, "clinician"). */
  return r === 'clinician' || r === 'admin';
}

const _CHIP_TINTS = [
  { bg: 'rgba(155,127,255,0.12)', fg: 'var(--violet,#9b7fff)', border: 'rgba(155,127,255,0.30)' },
  { bg: 'rgba(96,165,250,0.12)',  fg: 'var(--blue,#60a5fa)',   border: 'rgba(96,165,250,0.30)' },
  { bg: 'rgba(45,212,191,0.12)',  fg: 'var(--teal,#2dd4bf)',   border: 'rgba(45,212,191,0.30)' },
];

function _tintFor(id) {
  const key = String(id || '');
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return _CHIP_TINTS[h % _CHIP_TINTS.length];
}

function _skeletonChips(n = 6) {
  const chip = '<span style="display:inline-block;width:140px;height:24px;border-radius:12px;background:linear-gradient(90deg,rgba(255,255,255,.04),rgba(255,255,255,.08),rgba(255,255,255,.04));background-size:200% 100%;animation:dh2AttnPulse 1.6s ease-in-out infinite"></span>';
  return `<div style="display:flex;gap:8px;flex-wrap:wrap">${Array.from({ length: n }, () => chip).join('')}</div>`;
}

function _errorCard(message, retryLabel = 'Try again') {
  const safe = esc(message || 'We couldn’t load phenotype data right now.');
  return `<div role="alert" style="max-width:560px;margin:24px auto;padding:18px 20px;border:1px solid rgba(255,107,107,0.35);background:rgba(255,107,107,0.06);border-radius:12px">
    <div style="font-weight:600;margin-bottom:6px;color:var(--text-primary)">We couldn’t load phenotype workspace data.</div>
    <div style="font-size:12px;color:var(--text-secondary);line-height:1.5;margin-bottom:12px">${safe}</div>
    <button type="button" class="btn btn-ghost btn-sm" data-action="retry" style="min-height:44px">${esc(retryLabel)}</button>
  </div>`;
}

function _patientRestrictedBanner() {
  return `<div role="note" style="padding:12px 14px;border-radius:12px;border:1px solid rgba(251,191,36,0.35);background:rgba(251,191,36,0.08);margin-bottom:14px;font-size:12px;line-height:1.45;color:var(--text-secondary)">
    <strong style="color:var(--text-primary)">Clinician workspace.</strong>
    Phenotype hypothesis review and assignments are intended for clinical roles. If you need access, contact your clinic administrator.
  </div>`;
}

function _emptyClinicCard() {
  return `<div style="max-width:560px;margin:48px auto;padding:24px;border:1px solid var(--border);border-radius:14px;background:var(--bg-card);text-align:center">
    <div style="font-size:15px;font-weight:600;margin-bottom:8px">No phenotype assignments recorded</div>
    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:14px;line-height:1.5">
      Absence of assignments here does <strong>not</strong> mean “no clinical concern” — it may reflect data that has not been linked or reviewed in this workspace yet. Select a patient to document hypothesis labels or open the patient chart.
    </div>
  </div>`;
}

function _emptyPatientCard(patientName) {
  return `<div style="margin:14px 0;padding:18px 20px;border:1px dashed var(--border);border-radius:12px;background:rgba(255,255,255,.02);text-align:center">
    <div style="font-weight:600;margin-bottom:6px">No registry-linked phenotype hypotheses for ${esc(patientName || 'this patient')}</div>
    <div style="font-size:12px;color:var(--text-secondary)">Add a label from the registry below (clinician roles) or open the patient chart to gather source data first.</div>
  </div>`;
}

function _aggregateClinicSummary(catalog, assignments) {
  const byPhenotype = new Map();
  for (const a of assignments) {
    const pid = a.phenotype_id || '';
    if (!byPhenotype.has(pid)) {
      const def = (catalog || []).find((c) => c.id === pid) || {};
      byPhenotype.set(pid, {
        phenotype_id: pid,
        phenotype_name: a.phenotype_name || def.name || pid,
        domain: a.domain || def.domain || '',
        patients: [],
      });
    }
    byPhenotype.get(pid).patients.push({
      patient_id: a.patient_id,
      patient_name: a.patient_name || a.patient_id,
      assignment_id: a.id,
      confidence: a.confidence,
      assigned_at: a.assigned_at,
    });
  }
  return Array.from(byPhenotype.values());
}

function _renderClinicTable(rows, sortKey, sortDir) {
  if (!Array.isArray(rows) || !rows.length) return _emptyClinicCard();
  const sorted = rows.slice();
  const dir = sortDir === 'asc' ? 1 : -1;
  const cmp = (a, b) => {
    const av = sortKey === 'patient_count' ? a.patients.length : a[sortKey];
    const bv = sortKey === 'patient_count' ? b.patients.length : b[sortKey];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  };
  sorted.sort(cmp);

  const sortIndicator = (key) => key === sortKey ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';
  const th = (key, label, align = 'left') =>
    `<th data-sort-key="${esc(key)}" style="padding:8px 10px;text-align:${align};font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border);cursor:pointer;user-select:none">${esc(label)}${sortIndicator(key)}</th>`;

  const body = sorted.map((r) => {
    const tint = _tintFor(r.phenotype_id);
    const chip = `<span class="pill" style="background:${tint.bg};color:${tint.fg};border:1px solid ${tint.border};font-size:11px;padding:2px 8px;min-height:22px">${esc(r.phenotype_name)} <span style="opacity:.75">(hypothesis label)</span></span>`;
    const patients = r.patients.map((p) => {
      return `<a href="#" data-patient-link="${esc(p.patient_id)}" style="color:var(--text-secondary);text-decoration:none;border-bottom:1px dotted var(--border);font-size:12px;margin-right:10px;display:inline-block;padding:2px 0;min-height:24px;line-height:20px">${esc(p.patient_name)}</a>`;
    }).join('');
    return `<tr style="vertical-align:top">
      <td style="padding:10px;border-bottom:1px solid var(--border)">${chip}<div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">${esc(r.domain || '—')}</div></td>
      <td style="padding:10px;text-align:center;border-bottom:1px solid var(--border);font-variant-numeric:tabular-nums;font-weight:600">${esc(r.patients.length)}</td>
      <td style="padding:10px;border-bottom:1px solid var(--border)">${patients}</td>
    </tr>`;
  }).join('');

  return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;overflow:auto">
    <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:680px">
      <thead><tr>
        ${th('phenotype_name', 'Hypothesis label')}
        ${th('patient_count', 'Patients', 'center')}
        ${th('domain', 'Linked patients')}
      </tr></thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

function _renderAssignmentChip(a, registry) {
  const tint = _tintFor(a.phenotype_id);
  const def = (registry || []).find((r) => r.id === a.phenotype_id);
  const name = a.phenotype_name || def?.name || a.phenotype_id;
  const canEdit = _canEditAssignments();
  return `<span data-assignment-chip="${esc(a.id)}" data-phenotype-id="${esc(a.phenotype_id)}" class="pill"
    style="display:inline-flex;align-items:center;gap:8px;background:${tint.bg};color:${tint.fg};border:1px solid ${tint.border};padding:6px 10px;font-size:12px;min-height:32px;cursor:pointer;margin:0 6px 6px 0">
    <button type="button" data-action="show-detail" data-phenotype-id="${esc(a.phenotype_id)}"
      style="background:transparent;border:none;color:inherit;cursor:pointer;font:inherit;padding:0;min-height:28px;text-align:left"
      title="View registry entry for this hypothesis label">${esc(name)}</button>
    ${canEdit ? `<button type="button" data-action="remove-assignment" data-assignment-id="${esc(a.id)}"
      title="Remove this hypothesis label from the chart (does not delete source data)"
      aria-label="Remove assignment"
      style="background:transparent;border:none;color:inherit;cursor:pointer;font-size:14px;line-height:1;padding:0 2px;min-height:28px;min-width:28px">✕</button>` : ''}
  </span>`;
}

function _renderAssignmentsBlock(assignments, registry, patientName) {
  if (!Array.isArray(assignments) || !assignments.length) {
    return `<div data-assignments-slot>${_emptyPatientCard(patientName)}</div>`;
  }
  const chips = assignments.map((a) => _renderAssignmentChip(a, registry)).join('');
  return `<div data-assignments-slot>
    <div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Clinician-recorded hypothesis labels (registry)</div>
    <div style="display:flex;flex-wrap:wrap;align-items:center">${chips}</div>
    <div style="font-size:11px;color:var(--text-tertiary);margin-top:6px">Each chip opens the registry definition. Labels are for documentation and care-team alignment — not a confirmed diagnosis.</div>
  </div>`;
}

function _renderAssignForm(registry) {
  if (!_canEditAssignments()) {
    return `<p style="font-size:12px;color:var(--text-tertiary);margin-top:12px">Assignment actions require a clinician or admin role.</p>`;
  }
  const opts = (registry || []).map((r) =>
    `<option value="${esc(r.id)}">${esc(r.name)}${r.domain ? ` — ${esc(r.domain)}` : ''}</option>`
  ).join('');
  return `<form data-assign-form style="margin-top:18px;padding:14px;border:1px dashed var(--border);border-radius:12px;background:rgba(255,255,255,.02);display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px">
    <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--text-tertiary)">
      Registry hypothesis
      <input list="ph-registry-options" class="form-control" name="phenotype_id" required placeholder="Search the registry…" autocomplete="off" style="min-height:44px" aria-label="Phenotype registry search">
      <datalist id="ph-registry-options">${opts}</datalist>
    </label>
    <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--text-tertiary)">
      Clinician confidence
      <select class="form-control" name="confidence" style="min-height:44px" aria-label="Confidence in this hypothesis label">
        <option value="">—</option>
        <option value="high">High</option>
        <option value="moderate">Moderate</option>
        <option value="low">Low</option>
      </select>
    </label>
    <label style="grid-column:1 / -1;display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--text-tertiary)">
      Rationale / evidence note (recommended)
      <textarea class="form-control" name="rationale" rows="2" placeholder="Source assessments, interview, or modalities supporting this documentation…" style="min-height:44px"></textarea>
    </label>
    <div style="grid-column:1 / -1;display:flex;gap:8px;justify-content:flex-end;align-items:center">
      <span data-form-error style="color:var(--red);font-size:11px;margin-right:auto"></span>
      <button type="submit" class="btn btn-primary btn-sm" style="min-height:44px">Save hypothesis label</button>
    </div>
  </form>`;
}

function _renderRegistryPanel(def) {
  if (!def) {
    return `<div style="margin-top:14px;padding:14px;border:1px solid var(--border);border-radius:12px;background:var(--bg-card);font-size:12px;color:var(--text-tertiary)">
      Select a hypothesis chip above to view registry text (education / operational context only).
    </div>`;
  }
  const tint = _tintFor(def.id);
  const list = (label, val) => {
    const v = val == null || val === '' ? '—' : val;
    return `<div style="display:flex;gap:8px;font-size:12px;margin-top:4px"><span style="color:var(--text-tertiary);min-width:180px">${esc(label)}</span><span style="color:var(--text-secondary)">${esc(v)}</span></div>`;
  };
  const modalities = Array.isArray(def.suggested_modalities) && def.suggested_modalities.length
    ? def.suggested_modalities.join(', ')
    : (def.candidate_modalities || '—');
  return `<div style="margin-top:14px;padding:14px 16px;border:1px solid ${tint.border};background:${tint.bg};border-radius:12px">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:6px">
      <div style="font-weight:600;font-size:13px;color:${tint.fg}">${esc(def.name || def.id)}</div>
      <div style="font-size:11px;color:var(--text-tertiary)">${esc(def.domain || '')}</div>
    </div>
    <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:8px">Registry reference — <strong>not</strong> a system diagnosis. Context for team discussion and documentation.</div>
    <div style="font-size:12px;color:var(--text-secondary);line-height:1.5;margin-bottom:8px">${esc(def.description || '—')}</div>
    ${list('Associated presentation notes (not diagnostic)', def.associated_conditions)}
    ${list('Anatomical / target notes (non-prescriptive)', def.possible_target_regions)}
    ${list('Modality families sometimes discussed in literature / ops', modalities)}
    ${list('Typical assessment inputs (varies by site)', def.assessment_inputs_needed)}
    ${list('Registry evidence grade (operational)', def.evidence_level)}
  </div>`;
}

function _statusPill(status) {
  if (status === 'ok') return '<span class="pill pill-active" style="font-size:10px">Available</span>';
  if (status === 'stale') return '<span class="pill pill-pending" style="font-size:10px">Possibly stale</span>';
  if (status === 'empty') return '<span class="pill pill-inactive" style="font-size:10px">None linked</span>';
  if (status === 'error') return '<span class="pill" style="font-size:10px;background:rgba(255,107,107,0.12);color:var(--red)">Check failed</span>';
  if (status === 'unknown') return '<span class="pill pill-inactive" style="font-size:10px">Unknown</span>';
  return '<span class="pill pill-inactive" style="font-size:10px">—</span>';
}

/**
 * @param {Record<string, { status: string, detail: string, asOf?: string }>} matrix
 */
function _renderDataMatrix(matrix) {
  const rows = [
    { key: 'assessments', label: 'Assessments & scales', page: 'assessments-v2' },
    { key: 'qeeg', label: 'qEEG analyses', page: 'qeeg-analysis' },
    { key: 'mri', label: 'MRI analyses', page: 'mri-analysis' },
    { key: 'wearables', label: 'Biometrics / wearables', page: 'wearables' },
    { key: 'labs', label: 'Labs / biomarkers', page: 'labs-analyzer' },
    { key: 'documents', label: 'Documents', page: 'documents-v2' },
  ];
  const body = rows.map((r) => {
    const m = matrix[r.key] || { status: 'unknown', detail: 'Not loaded' };
    return `<tr>
      <td style="padding:8px 10px;border-bottom:1px solid var(--border)">${esc(r.label)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid var(--border)">${_statusPill(m.status)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text-secondary)">${esc(m.detail || '—')}</td>
      <td style="padding:8px 10px;border-bottom:1px solid var(--border);text-align:right">
        <button type="button" class="btn btn-ghost btn-sm" data-nav-page="${esc(r.page)}" data-nav-label="${esc(r.label)}" style="min-height:36px">Open</button>
      </td>
    </tr>`;
  }).join('');
  return `<div style="margin-top:16px">
    <div style="font-size:12px;font-weight:600;margin-bottom:6px">Data availability (patient-linked)</div>
    <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:8px;line-height:1.45">
      Probes your clinic’s linked records; “none linked” can mean data lives elsewhere, permissions differ, or integration is still in progress. It is <strong>not</strong> reassurance of absence of need for care.
    </div>
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;overflow:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:520px" aria-label="Data availability matrix">
        <thead><tr>
          <th style="text-align:left;padding:8px 10px;font-size:10px;font-weight:600;color:var(--text-tertiary)">Source</th>
          <th style="text-align:left;padding:8px 10px;font-size:10px;font-weight:600;color:var(--text-tertiary)">Status</th>
          <th style="text-align:left;padding:8px 10px;font-size:10px;font-weight:600;color:var(--text-tertiary)">Detail</th>
          <th style="text-align:right;padding:8px 10px;font-size:10px;font-weight:600;color:var(--text-tertiary)">Module</th>
        </tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  </div>`;
}

function _renderQuickLinks() {
  const links = [
    { page: 'patient-profile', label: 'Patient profile / chart' },
    { page: 'deeptwin', label: 'DeepTwin (context)' },
    { page: 'protocol-studio', label: 'Protocol Studio' },
    { page: 'brainmap-v2', label: 'Brain Map Planner' },
    { page: 'risk-analyzer', label: 'Risk Analyzer' },
    { page: 'medication-analyzer', label: 'Medication Analyzer' },
    { page: 'treatment-sessions-analyzer', label: 'Treatment Sessions' },
    { page: 'video-assessments', label: 'Video analysis' },
    { page: 'voice-analyzer', label: 'Voice analysis' },
    { page: 'text-analyzer', label: 'Text analysis' },
    { page: 'digital-phenotyping-analyzer', label: 'Digital behaviour' },
    { page: 'handbooks-v2', label: 'Handbooks' },
    { page: 'schedule-v2', label: 'Schedule' },
    { page: 'clinician-inbox', label: 'Inbox' },
    { page: 'live-session', label: 'Virtual Care / live session' },
  ];
  const btns = links.map((l) =>
    `<button type="button" class="btn btn-ghost btn-sm" data-nav-page="${esc(l.page)}" data-nav-label="${esc(l.label)}" style="min-height:40px;margin:4px 6px 4px 0">${esc(l.label)}</button>`
  ).join('');
  return `<div style="margin-top:18px;padding:14px;border:1px solid var(--border);border-radius:12px;background:rgba(255,255,255,.02)">
    <div style="font-size:12px;font-weight:600;margin-bottom:6px">Linked modules</div>
    <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:10px;line-height:1.45">
      Opens the selected workspace with the current patient context where the app supports it. DeepTwin and Protocol Studio are for <strong>draft context</strong> — not autonomous treatment or protocol approval.
    </div>
    <div style="display:flex;flex-wrap:wrap;align-items:center">${btns}</div>
  </div>`;
}

function _renderGovernancePanel(usingFixtures) {
  const evidence = usingFixtures
    ? 'Demo registry slice — replace with your clinic’s governed catalogue when signed in to a live tenant.'
    : 'Registry CSV / API — confirm local governance for how hypothesis labels may be used in documentation.';
  const ai = 'No autonomous phenotype scoring runs on this page. Assignments are explicit clinician entries stored via the API (or labelled demo rows in preview).';
  return `<div style="margin-top:18px;padding:14px;border:1px dashed rgba(155,127,255,0.35);border-radius:12px;background:rgba(155,127,255,0.04)">
    <div style="font-size:12px;font-weight:600;margin-bottom:6px">Evidence & governance</div>
    <ul style="margin:0;padding-left:18px;font-size:12px;color:var(--text-secondary);line-height:1.55">
      <li>${esc(evidence)}</li>
      <li>${esc(ai)}</li>
      <li>If your clinic has not configured phenotype governance, treat all labels as provisional documentation pending policy review.</li>
    </ul>
  </div>`;
}

function _renderCombinedAudit(assignments, auditItems, auditNote) {
  const auditRows = (auditItems || []).slice(0, 40).map((ev) => {
    const when = ev.created_at ? new Date(ev.created_at).toLocaleString() : '—';
    const act = esc(ev.action || 'event');
    const aid = esc(ev.actor_id || '');
    const pid = esc(ev.patient_id || '');
    return `<li style="margin-bottom:8px;line-height:1.45"><span style="color:var(--text-tertiary);white-space:nowrap">${esc(when)}</span> · <code style="font-size:11px">${act}</code>${aid ? ` · ${aid}` : ''}${pid ? ` · patient ${pid}` : ''}</li>`;
  }).join('');
  const assignRows = (assignments || []).slice(0, 12).map((a) => {
    const when = a.assigned_at ? new Date(a.assigned_at).toLocaleString() : '—';
    return `<li style="margin-bottom:6px"><span style="color:var(--text-tertiary)">${esc(when)}</span> — <strong>${esc(a.phenotype_name || a.phenotype_id)}</strong> (hypothesis label)${a.confidence ? ` · ${esc(a.confidence)} confidence` : ''}${a.clinician_id ? ` · ${esc(a.clinician_id)}` : ''}</li>`;
  }).join('');
  const auditIntro = auditNote
    ? `<div style="font-size:11px;color:var(--amber);margin-bottom:8px">${esc(auditNote)}</div>`
    : `<div style="font-size:11px;color:var(--text-tertiary);margin-bottom:8px">
      Server-side audit includes workspace navigation/export signals when logged in to the API. Demo preview sessions may skip the network.
    </div>`;
  return `<div style="margin-top:18px;padding:14px;border:1px solid var(--border);border-radius:12px;background:var(--bg-card)">
    <div style="font-size:12px;font-weight:600;margin-bottom:6px">Workflow audit (API)</div>
    ${auditIntro}
    <ul style="list-style:none;margin:0 0 14px 0;padding:0;font-size:12px;color:var(--text-secondary);max-height:200px;overflow:auto" data-audit-server-list>${auditRows || '<li style="color:var(--text-tertiary)">No server audit events loaded.</li>'}</ul>
    <div style="font-size:12px;font-weight:600;margin-bottom:6px">Registry assignment history (this load)</div>
    <ul style="list-style:none;margin:0;padding:0;font-size:12px;color:var(--text-secondary);max-height:200px;overflow:auto">${assignRows || '<li style="color:var(--text-tertiary)">No hypothesis labels recorded for this patient in this view.</li>'}</ul>
  </div>`;
}

function _renderPatientDetail(patientName, assignments, registry, selectedPhenotypeId, dataMatrixHtml, usingFixtures, auditHtml) {
  const def = selectedPhenotypeId ? (registry || []).find((r) => r.id === selectedPhenotypeId) : null;
  const roleNote = String(currentUser?.role || '').toLowerCase() === 'patient' ? _patientRestrictedBanner() : '';
  return `${roleNote}
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin:12px 0 14px;flex-wrap:wrap">
      <div>
        <div style="font-size:12px;color:var(--text-tertiary)">${esc(assignments.length)} recorded hypothesis label${assignments.length === 1 ? '' : 's'}</div>
        <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">All labels require clinician judgement — not a system-confirmed diagnosis.</div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
        ${assignments.length ? _confidenceSummary(assignments) : ''}
        <button type="button" class="btn btn-ghost btn-sm" data-action="refresh-patient" style="min-height:44px">Refresh data</button>
        <button type="button" class="btn btn-ghost btn-sm" data-action="export-summary" style="min-height:44px">Export summary (JSON)</button>
      </div>
    </div>
    ${_renderAssignmentsBlock(assignments, registry, patientName)}
    ${_renderAssignForm(registry)}
    <div data-registry-panel>${_renderRegistryPanel(def)}</div>
    ${dataMatrixHtml}
    ${_renderQuickLinks()}
    ${_renderGovernancePanel(usingFixtures)}
    ${auditHtml}`;
}

function _confidenceSummary(assignments) {
  const counts = { high: 0, moderate: 0, low: 0, none: 0 };
  for (const a of assignments) {
    const c = String(a.confidence || '').toLowerCase();
    if (counts[c] != null) counts[c] += 1;
    else counts.none += 1;
  }
  const parts = [];
  if (counts.high)     parts.push(`<span class="pill pill-active">${counts.high} high</span>`);
  if (counts.moderate) parts.push(`<span class="pill pill-pending">${counts.moderate} moderate</span>`);
  if (counts.low)      parts.push(`<span class="pill pill-review">${counts.low} low</span>`);
  if (!parts.length)   return '';
  return `<div style="display:flex;gap:6px;align-items:center" title="Clinician-entered confidence in the hypothesis label">${parts.join('')}</div>`;
}

function _normaliseList(resp) {
  if (Array.isArray(resp?.items)) return resp.items;
  if (Array.isArray(resp)) return resp;
  return [];
}

function _enrichAssignmentsWithNames(items) {
  const personas = ANALYZER_DEMO_FIXTURES?.patients || [];
  return items.map((it) => {
    if (it.patient_name) return it;
    const match = personas.find((p) => p.id === it.patient_id);
    return { ...it, patient_name: match ? match.name : it.patient_id };
  });
}

function _isoMax(dates) {
  const ts = dates.map((d) => Date.parse(d)).filter((t) => !Number.isNaN(t));
  if (!ts.length) return null;
  return new Date(Math.max(...ts)).toISOString();
}

async function _probeDataMatrix(patientId) {
  const matrix = {
    assessments: { status: 'unknown', detail: '—' },
    qeeg: { status: 'unknown', detail: '—' },
    mri: { status: 'unknown', detail: '—' },
    wearables: { status: 'unknown', detail: '—' },
    labs: { status: 'unknown', detail: '—' },
    documents: { status: 'unknown', detail: '—' },
  };

  const run = async (key, promise, okDetail, emptyDetail) => {
    try {
      const resp = await promise;
      let items = [];
      if (key === 'labs' && resp?.results) {
        items = resp.results;
      } else {
        const rawItems = resp?.items ?? resp?.analyses ?? resp?.records;
        items = Array.isArray(rawItems) ? rawItems : _normaliseList(resp?.items ?? resp?.analyses ?? resp?.records ?? resp);
      }
      if (key === 'wearables' && resp && typeof resp === 'object' && !items.length) {
        const w = resp.summary || resp.window || resp.series;
        if (w) items = [{ _wearable_probe: true }];
      }
      const n = items.length;
      let asOf = null;
      if (key === 'qeeg' && items[0]?.updated_at) asOf = items[0].updated_at;
      else if (key === 'mri' && items[0]?.completed_at) asOf = items[0].completed_at;
      else if (items.length) {
        asOf = _isoMax(items.map((x) => x.updated_at || x.created_at || x.completed_at || x.uploaded_at).filter(Boolean));
      }
      const staleDays = 180;
      let status = 'ok';
      if (!n) status = 'empty';
      else if (asOf) {
        const days = (Date.now() - Date.parse(asOf)) / 86400000;
        if (days > staleDays) status = 'stale';
      }
      const detail = !n ? emptyDetail : `${n} linked${asOf ? ` · last activity ${new Date(asOf).toLocaleDateString()}` : ''}`;
      matrix[key] = { status, detail: okDetail ? `${detail} · ${okDetail}` : detail, asOf };
    } catch {
      matrix[key] = { status: 'error', detail: 'Could not reach service — check auth / API' };
    }
  };

  await Promise.all([
    run('assessments', api.listAssessments(patientId), '', 'No assessments linked to this patient id'),
    run('qeeg', api.listPatientQEEGAnalyses(patientId, { limit: 20 }), '', 'No qEEG analyses stored for this patient'),
    run('mri', api.listPatientMRIAnalyses(patientId), '', 'No completed MRI analyses for this patient'),
    run('wearables', api.getPatientWearableSummary(patientId, 30), '', 'No wearable summary — integration or consent may be missing'),
    run('labs', api.getLabsProfile(patientId), '', 'No labs profile — add results in Labs Analyzer'),
    run('documents', api.listDocuments({ patient_id: patientId, limit: 50 }), '', 'No documents indexed for this patient'),
  ]);

  return matrix;
}

function _renderPatientSelectOptions(patients, activeId) {
  const opts = ['<option value="">Select patient…</option>'];
  for (const p of patients) {
    const id = p.id || p.patient_id;
    const name = p.name || p.display_name || p.full_name || id;
    const sel = id === activeId ? ' selected' : '';
    opts.push(`<option value="${esc(id)}"${sel}>${esc(name)}</option>`);
  }
  return opts.join('');
}

export async function pgPhenotypeAnalyzer(setTopbar, navigate) {
  try {
    setTopbar({
      title: 'Phenotype Analyzer',
      subtitle: 'Clinician-reviewed hypothesis labels · multimodal context',
    });
  } catch {
    try { setTopbar('Phenotype Analyzer', 'Hypothesis labels · review'); } catch {}
  }

  const el = document.getElementById('content');
  if (!el) return;

  let view = 'clinic';
  let registryCache = [];
  let allAssignmentsCache = [];
  let patientAssignmentsCache = [];
  let activePatientId = null;
  let activePatientName = '';
  let selectedPhenotypeId = null;
  let sortKey = 'patient_count';
  let sortDir = 'desc';
  let usingFixtures = false;
  let patientsRoster = [];
  let dataMatrixHtml = '';

  el.innerHTML = `
    <div class="ds-phenotype-analyzer-shell" style="max-width:1100px;margin:0 auto;padding:16px 20px 48px">
      <div id="ph-demo-banner"></div>
      <div style="padding:12px 14px;border-radius:12px;border:1px solid rgba(155,127,255,0.28);background:rgba(155,127,255,0.06);margin-bottom:14px;font-size:12px;line-height:1.45;color:var(--text-secondary)">
        <strong style="color:var(--text-primary)">Clinical decision-support — requires clinician review.</strong>
        Phenotype <em>hypothesis</em> labels document stratification thinking for team alignment. They are not diagnoses, eligibility decisions, protocol-selection picks, or autonomous treatment recommendations. Missing data does not imply clinical clearance.
      </div>
      <div id="ph-toolbar" style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:12px;font-size:12px"></div>
      <div id="ph-breadcrumb" style="display:flex;align-items:center;gap:10px;margin-bottom:12px;font-size:12px"></div>
      <div id="ph-body"></div>
    </div>`;

  const $ = (id) => document.getElementById(id);

  function _syncDemoBanner() {
    const slot = $('ph-demo-banner');
    if (!slot) return;
    slot.innerHTML = usingFixtures && isDemoSession() ? DEMO_FIXTURE_BANNER_HTML : '';
  }

  async function _emitPageAudit(event, note = '') {
    try {
      if (!api.getToken?.()) return;
      if (usingFixtures && isDemoSession()) return;
      await api.postPhenotypeAuditEvent({
        event,
        patient_id: activePatientId || undefined,
        note: note || undefined,
        using_demo_data: false,
      });
    } catch {
      /* non-blocking */
    }
  }

  function _wireNavigate(container) {
    if (!container) return;
    container.querySelectorAll('[data-nav-page]').forEach((b) => {
      b.addEventListener('click', () => {
        const page = b.getAttribute('data-nav-page');
        const label = b.getAttribute('data-nav-label') || page || '';
        if (!page) return;
        void _emitPageAudit('open_linked_module', `page=${page}; label=${String(label).slice(0, 120)}`);
        try {
          if (activePatientId) {
            window._profilePatientId = activePatientId;
            window._selectedPatientId = activePatientId;
          }
          navigate?.(page, activePatientId ? { id: activePatientId } : {});
        } catch (e) {
          alert((e && e.message) || String(e));
        }
      });
    });
  }

  function _wireOpenPatientChart(container) {
    container?.querySelector('[data-action="open-chart"]')?.addEventListener('click', () => {
      if (!activePatientId) return;
      void _emitPageAudit('open_patient_chart', 'toolbar');
      try {
        window.openPatient?.(activePatientId);
        navigate?.('patient-profile', { id: activePatientId });
      } catch (e) {
        alert((e && e.message) || String(e));
      }
    });
  }

  function renderToolbar() {
    const tb = $('ph-toolbar');
    if (!tb) return;
    if (view === 'clinic') {
      tb.innerHTML = `
        <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--text-tertiary);min-width:220px">
          Open patient workspace
          <select id="ph-patient-select" class="form-control" style="min-height:44px" aria-label="Select patient for phenotype workspace">${_renderPatientSelectOptions(patientsRoster, activePatientId)}</select>
        </label>
        <button type="button" class="btn btn-primary btn-sm" id="ph-open-patient" style="min-height:44px;margin-top:18px">Open</button>
        <button type="button" class="btn btn-ghost btn-sm" id="ph-go-patients" style="min-height:44px;margin-top:18px">Patient list</button>
        <button type="button" class="btn btn-ghost btn-sm" id="ph-refresh-clinic" style="min-height:44px;margin-top:18px">Refresh</button>`;
      $('ph-open-patient')?.addEventListener('click', () => {
        const sel = $('ph-patient-select');
        const pid = sel?.value;
        if (!pid) {
          alert('Choose a patient first.');
          return;
        }
        const p = patientsRoster.find((x) => (x.id || x.patient_id) === pid);
        _openPatient(pid, p?.name || p?.display_name || pid);
      });
      $('ph-go-patients')?.addEventListener('click', () => { try { navigate?.('patients-v2'); } catch {} });
      $('ph-refresh-clinic')?.addEventListener('click', () => { loadClinic(); });
    } else {
      tb.innerHTML = `
        <button type="button" class="btn btn-ghost btn-sm" data-action="open-chart" style="min-height:44px">Open patient chart</button>
        <button type="button" class="btn btn-ghost btn-sm" id="ph-back-clinic" style="min-height:44px">Back to clinic summary</button>`;
      $('ph-back-clinic')?.addEventListener('click', () => {
        view = 'clinic';
        selectedPhenotypeId = null;
        activePatientId = null;
        render();
      });
      _wireOpenPatientChart(tb);
    }
  }

  function setBreadcrumb() {
    const bc = $('ph-breadcrumb');
    if (!bc) return;
    if (view === 'clinic') {
      bc.innerHTML = `<span style="font-weight:600">Clinic phenotype overview</span>`;
    } else {
      bc.innerHTML = `<button type="button" class="btn btn-ghost btn-sm" id="ph-back" style="min-height:44px">← Back to clinic</button>
        <span style="color:var(--text-tertiary)">/</span>
        <span style="font-weight:600">${esc(activePatientName || 'Patient')}</span>`;
      $('ph-back')?.addEventListener('click', () => {
        view = 'clinic';
        selectedPhenotypeId = null;
        activePatientId = null;
        render();
      });
    }
  }

  function _openPatient(pid, pname) {
    activePatientId = pid;
    activePatientName = pname || pid;
    selectedPhenotypeId = null;
    view = 'patient';
    render();
  }

  async function _loadRegistry() {
    if (registryCache.length) return registryCache;
    try {
      const resp = await api.phenotypes();
      const items = _normaliseList(resp);
      if (items.length) {
        registryCache = items;
        return registryCache;
      }
    } catch {
      // fall through to fixtures
    }
    if (isDemoSession() && ANALYZER_DEMO_FIXTURES?.phenotype?.catalog) {
      registryCache = ANALYZER_DEMO_FIXTURES.phenotype.catalog.slice();
      usingFixtures = true;
    }
    return registryCache;
  }

  async function _loadPatientsRoster() {
    try {
      const resp = await api.listPatients({ limit: 200 });
      patientsRoster = _normaliseList(resp);
    } catch {
      patientsRoster = [];
    }
    if ((!patientsRoster.length) && isDemoSession() && ANALYZER_DEMO_FIXTURES?.patients?.length) {
      patientsRoster = ANALYZER_DEMO_FIXTURES.patients.map((p) => ({ id: p.id, name: p.name }));
    }
  }

  async function loadClinic() {
    const body = $('ph-body');
    if (!body) return;
    body.innerHTML = `<div style="padding:18px;background:var(--bg-card);border:1px solid var(--border);border-radius:14px">
      ${_skeletonChips(6)}
    </div>`;
    await _loadPatientsRoster();
    let assignments = null;
    try {
      const [regResp, asgResp] = await Promise.all([
        _loadRegistry(),
        api.listPhenotypeAssignments().catch(() => null),
      ]);
      registryCache = regResp || registryCache;
      assignments = _normaliseList(asgResp);
      if ((!assignments || !assignments.length) && isDemoSession() && ANALYZER_DEMO_FIXTURES?.phenotype) {
        assignments = ANALYZER_DEMO_FIXTURES.phenotype.all_assignments.slice();
        usingFixtures = true;
      } else if (assignments && assignments.length) {
        usingFixtures = false;
      }
    } catch (e) {
      if (isDemoSession() && ANALYZER_DEMO_FIXTURES?.phenotype) {
        assignments = ANALYZER_DEMO_FIXTURES.phenotype.all_assignments.slice();
        usingFixtures = true;
      } else {
        const msg = (e && e.message) || String(e);
        body.innerHTML = _errorCard(msg);
        body.querySelector('[data-action="retry"]')?.addEventListener('click', loadClinic);
        _syncDemoBanner();
        renderToolbar();
        return;
      }
    }
    allAssignmentsCache = _enrichAssignmentsWithNames(assignments || []);
    _syncDemoBanner();
    const rows = _aggregateClinicSummary(registryCache, allAssignmentsCache);
    body.innerHTML = _renderClinicTable(rows, sortKey, sortDir);
    body.querySelectorAll('[data-sort-key]').forEach((th) => {
      th.addEventListener('click', () => {
        const k = th.getAttribute('data-sort-key');
        if (k === sortKey) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        else { sortKey = k; sortDir = 'desc'; }
        const next = _aggregateClinicSummary(registryCache, allAssignmentsCache);
        body.innerHTML = _renderClinicTable(next, sortKey, sortDir);
        wireClinicLinks();
      });
    });
    wireClinicLinks();
    renderToolbar();
  }

  function wireClinicLinks() {
    const body = $('ph-body');
    body?.querySelectorAll('[data-patient-link]').forEach((a) => {
      a.addEventListener('click', (ev) => {
        ev.preventDefault();
        const pid = a.getAttribute('data-patient-link');
        const pname = a.textContent || pid;
        _openPatient(pid, pname);
      });
    });
  }

  async function loadPatient() {
    const body = $('ph-body');
    if (!body || !activePatientId) return;
    body.innerHTML = `<div style="padding:18px;background:var(--bg-card);border:1px solid var(--border);border-radius:14px">
      <div style="font-size:12px;color:var(--text-tertiary);margin-bottom:8px">Loading patient-linked context…</div>
      ${_skeletonChips(4)}
    </div>`;
    renderToolbar();
    let assignments = null;
    try {
      const [, asgResp] = await Promise.all([
        _loadRegistry(),
        api.listPhenotypeAssignments({ patient_id: activePatientId }).catch(() => null),
      ]);
      assignments = _normaliseList(asgResp);
      if ((!assignments || !assignments.length) && isDemoSession() && ANALYZER_DEMO_FIXTURES?.phenotype) {
        assignments = ANALYZER_DEMO_FIXTURES.phenotype.assignments_for(activePatientId);
        usingFixtures = true;
      }
    } catch (e) {
      if (isDemoSession() && ANALYZER_DEMO_FIXTURES?.phenotype) {
        assignments = ANALYZER_DEMO_FIXTURES.phenotype.assignments_for(activePatientId);
        usingFixtures = true;
      } else {
        const msg = (e && e.message) || String(e);
        body.innerHTML = _errorCard(msg);
        body.querySelector('[data-action="retry"]')?.addEventListener('click', loadPatient);
        return;
      }
    }
    patientAssignmentsCache = _enrichAssignmentsWithNames(assignments || []);
    _syncDemoBanner();

    let matrix = {};
    try {
      matrix = await _probeDataMatrix(activePatientId);
    } catch {
      matrix = {};
    }
    dataMatrixHtml = _renderDataMatrix(matrix);

    let auditItems = [];
    let auditNote = '';
    if (!usingFixtures && api.getToken?.()) {
      try {
        const ar = await api.listPhenotypeAuditEvents({ patient_id: activePatientId, limit: 40 });
        auditItems = Array.isArray(ar?.items) ? ar.items : [];
      } catch {
        auditNote = 'Could not load server audit trail — check API session.';
      }
    } else if (usingFixtures && isDemoSession()) {
      auditNote = 'Demo fixture session — phenotype audit API calls are skipped in offline preview.';
    }
    const auditHtml = _renderCombinedAudit(patientAssignmentsCache, auditItems, auditNote);

    body.innerHTML = _renderPatientDetail(
      activePatientName,
      patientAssignmentsCache,
      registryCache,
      selectedPhenotypeId,
      dataMatrixHtml,
      usingFixtures,
      auditHtml,
    );
    void _emitPageAudit('workspace_view', 'patient_workspace_loaded');
    _wireNavigate(body);
    wirePatientDetail();
  }

  function _refreshAssignmentsInPlace() {
    const body = $('ph-body');
    if (!body) return;
    const slot = body.querySelector('[data-assignments-slot]');
    if (slot) {
      const next = _renderAssignmentsBlock(patientAssignmentsCache, registryCache, activePatientName);
      const tmp = document.createElement('div');
      tmp.innerHTML = next;
      slot.replaceWith(tmp.firstElementChild);
    }
    wireAssignmentChips();
  }

  function _refreshRegistryPanel() {
    const body = $('ph-body');
    if (!body) return;
    const def = selectedPhenotypeId ? (registryCache || []).find((r) => r.id === selectedPhenotypeId) : null;
    const slot = body.querySelector('[data-registry-panel]');
    if (slot) slot.innerHTML = _renderRegistryPanel(def);
  }

  function wireAssignmentChips() {
    const body = $('ph-body');
    if (!body) return;
    body.querySelectorAll('[data-action="show-detail"]').forEach((b) => {
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        selectedPhenotypeId = b.getAttribute('data-phenotype-id');
        _refreshRegistryPanel();
      });
    });
    body.querySelectorAll('[data-action="remove-assignment"]').forEach((b) => {
      b.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        const aid = b.getAttribute('data-assignment-id');
        if (!aid) return;
        const target = patientAssignmentsCache.find((a) => a.id === aid);
        const label = target?.phenotype_name || 'this hypothesis label';
        const ok = window.confirm(`Remove "${label}" from ${activePatientName}? This removes the documentation row only — source recordings remain in their modules.`);
        if (!ok) return;
        b.disabled = true;
        const old = b.textContent;
        b.textContent = '…';
        try {
          if (!usingFixtures) {
            await api.deletePhenotypeAssignment(aid);
          }
          patientAssignmentsCache = patientAssignmentsCache.filter((a) => a.id !== aid);
          allAssignmentsCache = allAssignmentsCache.filter((a) => a.id !== aid);
          if (!usingFixtures) {
            loadPatient();
          } else {
            _refreshAssignmentsInPlace();
          }
        } catch (e) {
          b.disabled = false;
          b.textContent = old;
          alert((e && e.message) || String(e));
        }
      });
    });
  }

  function wirePatientDetail() {
    const body = $('ph-body');
    if (!body) return;

    wireAssignmentChips();
    _wireNavigate(body);

    body.querySelector('[data-action="refresh-patient"]')?.addEventListener('click', () => {
      loadPatient();
    });

    body.querySelector('[data-action="export-summary"]')?.addEventListener('click', () => {
      try {
        void _emitPageAudit('export_summary', 'json_download');
        const payload = {
          exported_at: new Date().toISOString(),
          patient_id: activePatientId,
          patient_name: activePatientName,
          demo_fixture: !!(usingFixtures && isDemoSession()),
          assignments: patientAssignmentsCache,
          governance_note: 'Phenotype hypothesis labels — clinician-reviewed documentation only; not a diagnosis.',
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        const safeId = String(activePatientId || 'patient').replace(/[^\w.-]+/g, '_');
        a.href = URL.createObjectURL(blob);
        a.download = `phenotype-hypothesis-summary_${safeId}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
      } catch (e) {
        alert((e && e.message) || String(e));
      }
    });

    body.querySelector('[data-assign-form]')?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (!_canEditAssignments()) {
        alert('Your role cannot record phenotype hypothesis labels.');
        return;
      }
      const form = ev.currentTarget;
      const fd = new FormData(form);
      const errSlot = form.querySelector('[data-form-error]');
      if (errSlot) errSlot.textContent = '';
      const raw = String(fd.get('phenotype_id') || '').trim();
      const def = (registryCache || []).find((r) => r.id === raw)
        || (registryCache || []).find((r) => String(r.name || '').toLowerCase() === raw.toLowerCase());
      if (!def) {
        if (errSlot) errSlot.textContent = 'Pick a hypothesis label from the registry list.';
        form.querySelector('input[name="phenotype_id"]')?.focus();
        return;
      }
      const payload = {
        patient_id: activePatientId,
        phenotype_id: def.id,
        phenotype_name: def.name,
        domain: def.domain || null,
        confidence: String(fd.get('confidence') || '').trim() || null,
        rationale: String(fd.get('rationale') || '').trim() || null,
        qeeg_supported: false,
      };
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      submit.textContent = 'Saving…';
      try {
        let added;
        if (usingFixtures) {
          added = {
            id: `demo-pha-${Date.now()}`,
            clinician_id: 'demo-clinician',
            assigned_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            ...payload,
          };
        } else {
          added = await api.assignPhenotype(payload);
        }
        const enriched = _enrichAssignmentsWithNames([{ ...added, patient_name: activePatientName }])[0];
        patientAssignmentsCache = [enriched, ...patientAssignmentsCache];
        allAssignmentsCache = [enriched, ...allAssignmentsCache];
        form.reset();
        loadPatient();
      } catch (e) {
        if (errSlot) errSlot.textContent = (e && e.message) || String(e);
      } finally {
        submit.disabled = false;
        submit.textContent = 'Save hypothesis label';
      }
    });
  }

  function render() {
    setBreadcrumb();
    renderToolbar();
    if (view === 'clinic') loadClinic();
    else loadPatient();
  }

  render();
}

export default { pgPhenotypeAnalyzer };
