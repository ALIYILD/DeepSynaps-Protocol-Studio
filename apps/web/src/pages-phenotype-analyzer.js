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
  const safe = esc(message || 'We couldn’t load phenotype assignments right now.');
  return `<div role="alert" style="max-width:560px;margin:24px auto;padding:18px 20px;border:1px solid rgba(255,107,107,0.35);background:rgba(255,107,107,0.06);border-radius:12px">
    <div style="font-weight:600;margin-bottom:6px;color:var(--text-primary)">We couldn’t load phenotype assignments right now.</div>
    <div style="font-size:12px;color:var(--text-secondary);line-height:1.5;margin-bottom:12px">${safe}</div>
    <button type="button" class="btn btn-ghost btn-sm" data-action="retry" style="min-height:44px">${esc(retryLabel)}</button>
  </div>`;
}

function _emptyClinicCard() {
  return `<div style="max-width:560px;margin:48px auto;padding:24px;border:1px solid var(--border);border-radius:14px;background:var(--bg-card);text-align:center">
    <div style="font-size:15px;font-weight:600;margin-bottom:8px">No phenotype assignments yet</div>
    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:14px;line-height:1.5">
      Phenotype subtyping informs modality selection and outcome prediction. Assign one from a patient's detail page to populate this summary.
    </div>
  </div>`;
}

function _emptyPatientCard(patientName) {
  return `<div style="margin:14px 0;padding:18px 20px;border:1px dashed var(--border);border-radius:12px;background:rgba(255,255,255,.02);text-align:center">
    <div style="font-weight:600;margin-bottom:6px">No phenotypes assigned yet for ${esc(patientName || 'this patient')}</div>
    <div style="font-size:12px;color:var(--text-secondary)">Use the form above to assign one from the registry.</div>
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
    const chip = `<span class="pill" style="background:${tint.bg};color:${tint.fg};border:1px solid ${tint.border};font-size:11px;padding:2px 8px;min-height:22px">${esc(r.phenotype_name)}</span>`;
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
        ${th('phenotype_name', 'Phenotype')}
        ${th('patient_count', 'Patients', 'center')}
        ${th('domain', 'Carriers')}
      </tr></thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

function _renderAssignmentChip(a, registry) {
  const tint = _tintFor(a.phenotype_id);
  const def = (registry || []).find((r) => r.id === a.phenotype_id);
  const name = a.phenotype_name || def?.name || a.phenotype_id;
  return `<span data-assignment-chip="${esc(a.id)}" data-phenotype-id="${esc(a.phenotype_id)}" class="pill"
    style="display:inline-flex;align-items:center;gap:8px;background:${tint.bg};color:${tint.fg};border:1px solid ${tint.border};padding:6px 10px;font-size:12px;min-height:32px;cursor:pointer;margin:0 6px 6px 0">
    <button type="button" data-action="show-detail" data-phenotype-id="${esc(a.phenotype_id)}"
      style="background:transparent;border:none;color:inherit;cursor:pointer;font:inherit;padding:0;min-height:28px">${esc(name)}</button>
    <button type="button" data-action="remove-assignment" data-assignment-id="${esc(a.id)}"
      title="Remove this phenotype assignment"
      style="background:transparent;border:none;color:inherit;cursor:pointer;font-size:14px;line-height:1;padding:0 2px;min-height:28px;min-width:28px">✕</button>
  </span>`;
}

function _renderAssignmentsBlock(assignments, registry, patientName) {
  if (!Array.isArray(assignments) || !assignments.length) {
    return `<div data-assignments-slot>${_emptyPatientCard(patientName)}</div>`;
  }
  const chips = assignments.map((a) => _renderAssignmentChip(a, registry)).join('');
  return `<div data-assignments-slot>
    <div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Current assignments</div>
    <div style="display:flex;flex-wrap:wrap;align-items:center">${chips}</div>
    <div style="font-size:11px;color:var(--text-tertiary);margin-top:6px">Click a chip to view its registry definition. ✕ removes the assignment.</div>
  </div>`;
}

function _renderAssignForm(registry) {
  const opts = (registry || []).map((r) =>
    `<option value="${esc(r.id)}">${esc(r.name)}${r.domain ? ` — ${esc(r.domain)}` : ''}</option>`
  ).join('');
  return `<form data-assign-form style="margin-top:18px;padding:14px;border:1px dashed var(--border);border-radius:12px;background:rgba(255,255,255,.02);display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px">
    <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--text-tertiary)">
      Phenotype
      <input list="ph-registry-options" class="form-control" name="phenotype_id" required placeholder="Search the registry…" autocomplete="off" style="min-height:44px">
      <datalist id="ph-registry-options">${opts}</datalist>
    </label>
    <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--text-tertiary)">
      Confidence
      <select class="form-control" name="confidence" style="min-height:44px">
        <option value="">—</option>
        <option value="high">High</option>
        <option value="moderate">Moderate</option>
        <option value="low">Low</option>
      </select>
    </label>
    <label style="grid-column:1 / -1;display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--text-tertiary)">
      Rationale (optional)
      <textarea class="form-control" name="rationale" rows="2" placeholder="What evidence supports this assignment?" style="min-height:44px"></textarea>
    </label>
    <div style="grid-column:1 / -1;display:flex;gap:8px;justify-content:flex-end;align-items:center">
      <span data-form-error style="color:var(--red);font-size:11px;margin-right:auto"></span>
      <button type="submit" class="btn btn-primary btn-sm" style="min-height:44px">Assign phenotype</button>
    </div>
  </form>`;
}

function _renderRegistryPanel(def) {
  if (!def) {
    return `<div style="margin-top:14px;padding:14px;border:1px solid var(--border);border-radius:12px;background:var(--bg-card);font-size:12px;color:var(--text-tertiary)">
      Select a phenotype chip above to see its registry definition.
    </div>`;
  }
  const tint = _tintFor(def.id);
  const list = (label, val) => {
    const v = val == null || val === '' ? '—' : val;
    return `<div style="display:flex;gap:8px;font-size:12px;margin-top:4px"><span style="color:var(--text-tertiary);min-width:160px">${esc(label)}</span><span style="color:var(--text-secondary)">${esc(v)}</span></div>`;
  };
  const modalities = Array.isArray(def.suggested_modalities) && def.suggested_modalities.length
    ? def.suggested_modalities.join(', ')
    : (def.candidate_modalities || '—');
  return `<div style="margin-top:14px;padding:14px 16px;border:1px solid ${tint.border};background:${tint.bg};border-radius:12px">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:6px">
      <div style="font-weight:600;font-size:13px;color:${tint.fg}">${esc(def.name || def.id)}</div>
      <div style="font-size:11px;color:var(--text-tertiary)">${esc(def.domain || '')}</div>
    </div>
    <div style="font-size:12px;color:var(--text-secondary);line-height:1.5;margin-bottom:8px">${esc(def.description || '—')}</div>
    ${list('Associated conditions', def.associated_conditions)}
    ${list('Possible target regions', def.possible_target_regions)}
    ${list('Suggested protocol families', modalities)}
    ${list('Assessment inputs needed', def.assessment_inputs_needed)}
    ${list('Evidence level', def.evidence_level)}
  </div>`;
}

function _renderPatientDetail(patientName, assignments, registry, selectedPhenotypeId) {
  const def = selectedPhenotypeId ? (registry || []).find((r) => r.id === selectedPhenotypeId) : null;
  return `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin:12px 0 14px">
      <div style="font-size:12px;color:var(--text-tertiary)">${esc(assignments.length)} active phenotype${assignments.length === 1 ? '' : 's'}</div>
      <div>${assignments.length ? _confidenceSummary(assignments) : ''}</div>
    </div>
    ${_renderAssignmentsBlock(assignments, registry, patientName)}
    ${_renderAssignForm(registry)}
    <div data-registry-panel>${_renderRegistryPanel(def)}</div>`;
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
  return `<div style="display:flex;gap:6px;align-items:center">${parts.join('')}</div>`;
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

export async function pgPhenotypeAnalyzer(setTopbar, navigate) {
  try {
    setTopbar({
      title: 'Phenotype Analyzer',
      subtitle: 'Subtype assignments · modality matching',
    });
  } catch {
    try { setTopbar('Phenotype Analyzer', 'Subtype assignments'); } catch {}
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

  el.innerHTML = `
    <div class="ds-phenotype-analyzer-shell" style="max-width:1100px;margin:0 auto;padding:16px 20px 48px">
      <div id="ph-demo-banner"></div>
      <div style="padding:12px 14px;border-radius:12px;border:1px solid rgba(155,127,255,0.28);background:rgba(155,127,255,0.06);margin-bottom:14px;font-size:12px;line-height:1.45;color:var(--text-secondary)">
        <strong style="color:var(--text-primary)">Clinical decision-support.</strong>
        Phenotype subtyping informs modality selection and outcome prediction. Assignments are clinician judgements — the registry surfaces candidate modalities, never an automatic prescription.
      </div>
      <div id="ph-breadcrumb" style="display:flex;align-items:center;gap:10px;margin-bottom:12px;font-size:12px"></div>
      <div id="ph-body"></div>
    </div>`;

  const $ = (id) => document.getElementById(id);

  function _syncDemoBanner() {
    const slot = $('ph-demo-banner');
    if (!slot) return;
    slot.innerHTML = usingFixtures && isDemoSession() ? DEMO_FIXTURE_BANNER_HTML : '';
  }

  function setBreadcrumb() {
    const bc = $('ph-breadcrumb');
    if (!bc) return;
    if (view === 'clinic') {
      bc.innerHTML = `<span style="font-weight:600">Clinic phenotype summary</span>`;
    } else {
      bc.innerHTML = `<button type="button" class="btn btn-ghost btn-sm" id="ph-back" style="min-height:44px">← Back to clinic</button>
        <span style="color:var(--text-tertiary)">/</span>
        <span style="font-weight:600">${esc(activePatientName || 'Patient')}</span>`;
      $('ph-back')?.addEventListener('click', () => {
        view = 'clinic';
        selectedPhenotypeId = null;
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
    } catch (e) {
      // fall through to fixtures
    }
    if (isDemoSession() && ANALYZER_DEMO_FIXTURES?.phenotype?.catalog) {
      registryCache = ANALYZER_DEMO_FIXTURES.phenotype.catalog.slice();
      usingFixtures = true;
    }
    return registryCache;
  }

  async function loadClinic() {
    const body = $('ph-body');
    if (!body) return;
    body.innerHTML = `<div style="padding:18px;background:var(--bg-card);border:1px solid var(--border);border-radius:14px">
      ${_skeletonChips(6)}
    </div>`;
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
      ${_skeletonChips(4)}
    </div>`;
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
    body.innerHTML = _renderPatientDetail(activePatientName, patientAssignmentsCache, registryCache, selectedPhenotypeId);
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
        const label = target?.phenotype_name || 'this phenotype';
        const ok = window.confirm(`Remove "${label}" from ${activePatientName}? This cannot be undone.`);
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
          _refreshAssignmentsInPlace();
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

    body.querySelector('[data-assign-form]')?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const form = ev.currentTarget;
      const fd = new FormData(form);
      const errSlot = form.querySelector('[data-form-error]');
      if (errSlot) errSlot.textContent = '';
      const raw = String(fd.get('phenotype_id') || '').trim();
      const def = (registryCache || []).find((r) => r.id === raw)
        || (registryCache || []).find((r) => String(r.name || '').toLowerCase() === raw.toLowerCase());
      if (!def) {
        if (errSlot) errSlot.textContent = 'Pick a phenotype from the registry.';
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
      submit.textContent = 'Assigning…';
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
        _refreshAssignmentsInPlace();
      } catch (e) {
        if (errSlot) errSlot.textContent = (e && e.message) || String(e);
      } finally {
        submit.disabled = false;
        submit.textContent = 'Assign phenotype';
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

export default { pgPhenotypeAnalyzer };
