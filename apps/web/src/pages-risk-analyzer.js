/**
 * Risk Analyzer — clinic-wide and per-patient risk-stratification surface.
 *
 * Wraps the existing `risk_stratification_router.py` endpoints:
 *   GET  /api/v1/risk/clinic/summary
 *   GET  /api/v1/risk/patient/{patient_id}
 *   GET  /api/v1/risk/patient/{patient_id}/audit
 *   POST /api/v1/risk/patient/{patient_id}/{category}/override
 *   POST /api/v1/risk/patient/{patient_id}/recompute
 *
 * Two views inside one page (no extra routing):
 *   1. Clinic summary table (default landing) with traffic-light pills per
 *      category and per-row drill-in.
 *   2. Patient detail with 8 category cards, override form, recompute, and
 *      an audit-trail panel.
 *
 * Decision-support only — every traffic light is a model output, not a
 * validated finding. Clinician override is always available.
 */

import { api } from './api.js';
import { isDemoSession } from './demo-session.js';
import { ANALYZER_DEMO_FIXTURES, DEMO_FIXTURE_BANNER_HTML } from './demo-fixtures-analyzers.js';

function _isEmptyClinicSummary(s) {
  return !s || !Array.isArray(s.patients) || s.patients.length === 0;
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const CATEGORY_ORDER = [
  'safety',
  'clinical_deterioration',
  'medication',
  'adherence',
  'engagement',
  'wellbeing',
  'caregiver',
  'logistics',
];

const LEVEL_TO_PILL = {
  red: 'pill-pending',
  amber: 'pill-pending',
  green: 'pill-active',
};

function _pillFor(level) {
  const lvl = String(level || '').toLowerCase();
  if (lvl === 'red') {
    return '<span class="pill" style="background:rgba(255,107,107,0.12);color:var(--red);border:1px solid rgba(255,107,107,0.25)">Critical</span>';
  }
  if (lvl === 'amber') {
    return '<span class="pill pill-pending">Elevated</span>';
  }
  if (lvl === 'green') {
    return '<span class="pill pill-active">Clear</span>';
  }
  return '<span class="pill pill-inactive">Unknown</span>';
}

function _dotFor(level) {
  const lvl = String(level || '').toLowerCase();
  const cls = lvl === 'red' ? 'dh2-attn-chip--red'
    : lvl === 'amber' ? 'dh2-attn-chip--amber'
    : lvl === 'green' ? 'dh2-attn-chip--violet'
    : 'dh2-attn-chip--muted';
  if (lvl === 'green') {
    return '<span class="dh2-attn-dot" style="background:var(--green)"></span>';
  }
  return `<span class="dh2-attn-chip ${cls}" style="border:none;background:transparent;padding:0;min-height:0;min-width:0;display:inline-flex"><span class="dh2-attn-dot"></span></span>`;
}

function _labelFor(category, fallback) {
  const map = {
    safety:                 'Safety',
    clinical_deterioration: 'Clinical deterioration',
    medication:             'Medication',
    adherence:              'Adherence',
    engagement:             'Engagement',
    wellbeing:              'Wellbeing',
    caregiver:              'Caregiver',
    logistics:              'Logistics',
  };
  return map[category] || fallback || category || '—';
}

function _skeletonChips(n = 8) {
  const chip = '<span style="display:inline-block;width:90px;height:22px;border-radius:11px;background:linear-gradient(90deg,rgba(255,255,255,.04),rgba(255,255,255,.08),rgba(255,255,255,.04));background-size:200% 100%;animation:dh2AttnPulse 1.6s ease-in-out infinite"></span>';
  return `<div style="display:flex;gap:8px;flex-wrap:wrap">${Array.from({ length: n }, () => chip).join('')}</div>`;
}

function _emptyClinicCard() {
  return `<div style="max-width:520px;margin:48px auto;padding:24px;border:1px solid var(--border);border-radius:14px;background:var(--bg-card);text-align:center">
    <div style="font-size:15px;font-weight:600;margin-bottom:8px">No patients yet</div>
    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:14px;line-height:1.5">
      Risk stratification runs once you have at least one active patient on file.
    </div>
    <button type="button" class="btn btn-primary btn-sm" id="ra-go-patients">Add a patient</button>
  </div>`;
}

function _errorCard(message, retryLabel = 'Try again') {
  const safe = esc(message || 'We couldn’t reach the risk model right now.');
  return `<div role="alert" style="max-width:560px;margin:24px auto;padding:18px 20px;border:1px solid rgba(255,107,107,0.35);background:rgba(255,107,107,0.06);border-radius:12px">
    <div style="font-weight:600;margin-bottom:6px;color:var(--text-primary)">We couldn’t reach the risk model right now.</div>
    <div style="font-size:12px;color:var(--text-secondary);line-height:1.5;margin-bottom:12px">${safe}</div>
    <button type="button" class="btn btn-ghost btn-sm" data-action="retry">${esc(retryLabel)}</button>
  </div>`;
}

function _topContributingFactors(cat) {
  const refs = Array.isArray(cat.evidence_refs) ? cat.evidence_refs : [];
  const sources = Array.isArray(cat.data_sources) ? cat.data_sources : [];
  const items = [];
  for (const r of refs) {
    if (items.length >= 2) break;
    if (typeof r === 'string') items.push(r);
    else if (r && typeof r === 'object') items.push(r.label || r.name || r.id || JSON.stringify(r));
  }
  for (const s of sources) {
    if (items.length >= 2) break;
    if (typeof s === 'string' && !items.includes(s)) items.push(s);
  }
  if (!items.length && cat.rationale) items.push(String(cat.rationale).split(/\.\s|\n/)[0]);
  return items.slice(0, 2);
}

function _categoryTableHeader() {
  const cells = CATEGORY_ORDER.map((c) => `<th style="padding:8px 6px;text-align:center;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border)" data-sort-key="${esc(c)}" title="Sort by ${esc(_labelFor(c))}">${esc(_labelFor(c))}</th>`).join('');
  return `<tr>
    <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border)" data-sort-key="patient">Patient</th>
    <th style="padding:8px 10px;text-align:center;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border)" data-sort-key="worst">Worst</th>
    ${cells}
  </tr>`;
}

function _miniDot(level) {
  const lvl = String(level || '').toLowerCase();
  const bg = lvl === 'red' ? 'var(--red)'
    : lvl === 'amber' ? 'var(--amber)'
    : lvl === 'green' ? 'var(--green)'
    : 'var(--text-tertiary)';
  const title = lvl === 'red' ? 'Critical' : lvl === 'amber' ? 'Elevated' : lvl === 'green' ? 'Clear' : 'Unknown';
  return `<span title="${title}" aria-label="${title}" style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${bg};opacity:${lvl ? 1 : 0.35}"></span>`;
}

function _renderClinicTable(summary, sortKey) {
  const patients = Array.isArray(summary?.patients) ? summary.patients.slice() : [];
  if (!patients.length) return _emptyClinicCard();

  const rank = (l) => ({ red: 3, amber: 2, green: 1 }[String(l || '').toLowerCase()] || 0);
  if (sortKey === 'patient') {
    patients.sort((a, b) => String(a.patient_name || '').localeCompare(String(b.patient_name || '')));
  } else if (sortKey === 'worst') {
    patients.sort((a, b) => rank(b.worst_level) - rank(a.worst_level));
  } else if (sortKey && CATEGORY_ORDER.includes(sortKey)) {
    patients.sort((a, b) => {
      const al = (a.categories || []).find((c) => c.category === sortKey)?.level;
      const bl = (b.categories || []).find((c) => c.category === sortKey)?.level;
      return rank(bl) - rank(al);
    });
  }

  const rows = patients.map((p) => {
    const byCat = new Map((p.categories || []).map((c) => [c.category, c]));
    const cells = CATEGORY_ORDER.map((cat) => {
      const c = byCat.get(cat);
      return `<td style="padding:8px 6px;text-align:center;border-bottom:1px solid var(--border)">${_miniDot(c?.level)}</td>`;
    }).join('');
    return `<tr data-patient-id="${esc(p.patient_id)}" tabindex="0" role="button"
      style="cursor:pointer;min-height:44px"
      onmouseover="this.style.background='rgba(255,255,255,.03)'"
      onmouseout="this.style.background='transparent'">
      <td style="padding:10px;border-bottom:1px solid var(--border);font-weight:500">${esc(p.patient_name || 'Unknown')}</td>
      <td style="padding:10px;text-align:center;border-bottom:1px solid var(--border)">${_pillFor(p.worst_level)}</td>
      ${cells}
    </tr>`;
  }).join('');

  return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;overflow:auto">
    <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:760px">
      <thead>${_categoryTableHeader()}</thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function _renderCategoryCard(cat) {
  const factors = _topContributingFactors(cat);
  const factorsHtml = factors.length
    ? factors.map((f) => `<li style="margin-bottom:4px">${esc(f)}</li>`).join('')
    : '<li style="color:var(--text-tertiary)">No contributing factors recorded.</li>';
  const overridden = !!cat.override_level;
  const score = cat.confidence ? `<span style="font-size:11px;color:var(--text-tertiary);margin-left:8px">conf: ${esc(cat.confidence)}</span>` : '';
  return `<div data-category="${esc(cat.category)}" style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:10px;min-height:180px">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
      <div style="font-weight:600;font-size:13px">${esc(_labelFor(cat.category, cat.label))}</div>
      <div>${_pillFor(cat.level)}</div>
    </div>
    <div style="font-size:11px;color:var(--text-secondary)">
      Computed: ${esc(cat.computed_level || '—')}${score}${overridden ? ` <span style="color:var(--amber)">• overridden</span>` : ''}
    </div>
    <div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px">Top contributing factors</div>
    <ul style="margin:0;padding-left:16px;font-size:12px;line-height:1.5;color:var(--text-secondary)">${factorsHtml}</ul>
    <div style="margin-top:auto;display:flex;gap:8px">
      <button type="button" class="btn btn-ghost btn-sm" data-action="override" data-category="${esc(cat.category)}" style="min-height:44px">Override…</button>
    </div>
  </div>`;
}

function _renderOverrideForm(cat) {
  return `<div data-override-form="${esc(cat.category)}" style="margin-top:10px;padding:12px;border:1px dashed var(--border);border-radius:10px;background:rgba(255,255,255,.02)">
    <div style="font-size:12px;font-weight:600;margin-bottom:8px">Override ${esc(_labelFor(cat.category, cat.label))}</div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <label style="font-size:11px;color:var(--text-tertiary)">Level</label>
      <select class="form-control" data-role="override-level" style="max-width:140px;min-height:44px">
        <option value="green">Clear</option>
        <option value="amber" selected>Elevated</option>
        <option value="red">Critical</option>
      </select>
    </div>
    <div style="margin-top:8px">
      <label style="display:block;font-size:11px;color:var(--text-tertiary);margin-bottom:4px">Reason (required)</label>
      <textarea class="form-control" data-role="override-reason" rows="2" placeholder="Clinical rationale for the override…" style="width:100%;min-height:44px"></textarea>
    </div>
    <div style="margin-top:10px;display:flex;gap:8px">
      <button type="button" class="btn btn-primary btn-sm" data-action="override-submit" data-category="${esc(cat.category)}" style="min-height:44px">Save override</button>
      <button type="button" class="btn btn-ghost btn-sm" data-action="override-cancel" data-category="${esc(cat.category)}" style="min-height:44px">Cancel</button>
    </div>
  </div>`;
}

function _renderAudit(audit) {
  const items = Array.isArray(audit?.items) ? audit.items : [];
  if (!items.length) {
    return '<div style="font-size:12px;color:var(--text-tertiary);padding:10px">No risk-level changes recorded yet.</div>';
  }
  const rows = items.map((it) => {
    const when = it.created_at ? new Date(it.created_at).toLocaleString() : '—';
    const trigger = it.trigger || '—';
    return `<li style="padding:8px 10px;border-bottom:1px solid var(--border);font-size:12px;display:flex;justify-content:space-between;gap:10px">
      <span><strong>${esc(_labelFor(it.category))}</strong>: ${esc(it.previous_level || '—')} → ${esc(it.new_level)} <span style="color:var(--text-tertiary)">(${esc(trigger)})</span></span>
      <span style="color:var(--text-tertiary);white-space:nowrap">${esc(when)}</span>
    </li>`;
  }).join('');
  return `<ul style="list-style:none;margin:0;padding:0">${rows}</ul>`;
}

function _renderPatientDetail(profile, audit) {
  const cats = Array.isArray(profile?.categories) ? profile.categories : [];
  const ordered = CATEGORY_ORDER.map((id) => cats.find((c) => c.category === id)).filter(Boolean);
  const rest = cats.filter((c) => !CATEGORY_ORDER.includes(c.category));
  const all = [...ordered, ...rest];
  const grid = all.map(_renderCategoryCard).join('');
  const computed = profile?.computed_at
    ? `Last computed ${new Date(profile.computed_at).toLocaleString()}`
    : 'Not yet computed.';

  return `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin:12px 0 14px">
      <div style="font-size:12px;color:var(--text-tertiary)">${esc(computed)}</div>
      <button type="button" class="btn btn-ghost btn-sm" data-action="recompute" style="min-height:44px">Recompute</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px">${grid}</div>
    <div style="margin-top:18px;background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px">
      <div style="font-weight:600;font-size:13px;margin-bottom:8px">Audit trail</div>
      ${_renderAudit(audit)}
    </div>`;
}

export async function pgRiskAnalyzer(setTopbar, navigate) {
  try {
    setTopbar({
      title: 'Risk Analyzer',
      subtitle: 'Patient-level risk stratification • 8 categories',
    });
  } catch {
    try { setTopbar('Risk Analyzer', 'Risk stratification'); } catch {}
  }

  const el = document.getElementById('content');
  if (!el) return;

  let view = 'clinic';
  let summaryCache = null;
  let sortKey = 'worst';
  let activePatientId = null;
  let activePatientName = '';
  let usingFixtures = false;

  try {
    const handoff = typeof window !== 'undefined' ? window._riskAnalyzerPatientId : null;
    if (handoff && String(handoff).trim()) {
      activePatientId = String(handoff).trim();
      activePatientName = 'Patient';
      view = 'patient';
      window._riskAnalyzerPatientId = null;
    }
  } catch {}

  el.innerHTML = `
    <div class="ds-risk-analyzer-shell" style="max-width:1100px;margin:0 auto;padding:16px 20px 48px">
      <div id="ra-demo-banner"></div>
      <div style="padding:12px 14px;border-radius:12px;border:1px solid rgba(155,127,255,0.28);background:rgba(155,127,255,0.06);margin-bottom:14px;font-size:12px;line-height:1.45;color:var(--text-secondary)">
        <strong style="color:var(--text-primary)">Clinical decision-support.</strong>
        Traffic lights are model outputs. Clinician review is required before acting; every override is audited.
      </div>
      <div id="ra-breadcrumb" style="display:flex;align-items:center;gap:10px;margin-bottom:12px;font-size:12px"></div>
      <div id="ra-body"></div>
    </div>`;

  const $ = (id) => document.getElementById(id);

  function _syncDemoBanner() {
    const slot = $('ra-demo-banner');
    if (!slot) return;
    slot.innerHTML = usingFixtures && isDemoSession() ? DEMO_FIXTURE_BANNER_HTML : '';
  }


  function setBreadcrumb() {
    const bc = $('ra-breadcrumb');
    if (!bc) return;
    if (view === 'clinic') {
      bc.innerHTML = `<span style="font-weight:600">Clinic risk summary</span>`;
    } else {
      bc.innerHTML = `<button type="button" class="btn btn-ghost btn-sm" id="ra-back" style="min-height:44px">← Back to clinic</button>
        <span style="color:var(--text-tertiary)">/</span>
        <span style="font-weight:600">${esc(activePatientName || 'Patient')}</span>`;
      $('ra-back')?.addEventListener('click', () => { view = 'clinic'; render(); });
    }
  }

  async function loadClinic() {
    const body = $('ra-body');
    if (!body) return;
    body.innerHTML = `<div style="padding:18px;background:var(--bg-card);border:1px solid var(--border);border-radius:14px">
      ${_skeletonChips(6)}
    </div>`;
    try {
      summaryCache = await api.getClinicRiskSummary();
      if (_isEmptyClinicSummary(summaryCache) && isDemoSession()) {
        summaryCache = ANALYZER_DEMO_FIXTURES.risk.clinic_summary;
        usingFixtures = true;
      } else {
        usingFixtures = false;
      }
    } catch (e) {
      if (isDemoSession()) {
        summaryCache = ANALYZER_DEMO_FIXTURES.risk.clinic_summary;
        usingFixtures = true;
      } else {
        const msg = (e && e.message) || String(e);
        body.innerHTML = _errorCard(msg);
        body.querySelector('[data-action="retry"]')?.addEventListener('click', loadClinic);
        return;
      }
    }
    _syncDemoBanner();
    body.innerHTML = _renderClinicTable(summaryCache, sortKey);
    body.querySelector('#ra-go-patients')?.addEventListener('click', () => {
      try { navigate?.('patients-v2'); } catch {}
    });
    body.querySelectorAll('[data-sort-key]').forEach((th) => {
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => {
        sortKey = th.getAttribute('data-sort-key');
        body.innerHTML = _renderClinicTable(summaryCache, sortKey);
        wireRowClicks();
        wireSortHeaders();
      });
    });
    wireRowClicks();
    wireSortHeaders();
  }

  function wireSortHeaders() {
    const body = $('ra-body');
    body?.querySelectorAll('[data-sort-key]').forEach((th) => {
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => {
        sortKey = th.getAttribute('data-sort-key');
        body.innerHTML = _renderClinicTable(summaryCache, sortKey);
        wireRowClicks();
        wireSortHeaders();
      });
    });
  }

  function wireRowClicks() {
    const body = $('ra-body');
    body?.querySelectorAll('tr[data-patient-id]').forEach((tr) => {
      const pid = tr.getAttribute('data-patient-id');
      const open = () => {
        activePatientId = pid;
        const p = (summaryCache?.patients || []).find((x) => x.patient_id === pid);
        activePatientName = p?.patient_name || 'Patient';
        view = 'patient';
        render();
      };
      tr.addEventListener('click', open);
      tr.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); }
      });
    });
  }

  async function loadPatient() {
    const body = $('ra-body');
    if (!body || !activePatientId) return;
    body.innerHTML = `<div style="padding:18px;background:var(--bg-card);border:1px solid var(--border);border-radius:14px">
      ${_skeletonChips(8)}
    </div>`;
    try {
      let [profile, audit] = await Promise.all([
        api.getPatientRiskProfile(activePatientId),
        api.getRiskAudit(activePatientId).catch(() => ({ items: [] })),
      ]);
      if ((!profile || !Array.isArray(profile.categories) || profile.categories.length === 0) && isDemoSession()) {
        profile = ANALYZER_DEMO_FIXTURES.risk.patient_profile(activePatientId);
        audit = ANALYZER_DEMO_FIXTURES.risk.patient_audit(activePatientId);
        usingFixtures = true;
      }
      _syncDemoBanner();
      body.innerHTML = _renderPatientDetail(profile, audit);
      wirePatientDetail(profile);
    } catch (e) {
      if (isDemoSession()) {
        const profile = ANALYZER_DEMO_FIXTURES.risk.patient_profile(activePatientId);
        const audit = ANALYZER_DEMO_FIXTURES.risk.patient_audit(activePatientId);
        usingFixtures = true;
        _syncDemoBanner();
        body.innerHTML = _renderPatientDetail(profile, audit);
        wirePatientDetail(profile);
        return;
      }
      const msg = (e && e.message) || String(e);
      body.innerHTML = _errorCard(msg);
      body.querySelector('[data-action="retry"]')?.addEventListener('click', loadPatient);
    }
  }

  function wirePatientDetail(profile) {
    const body = $('ra-body');
    if (!body) return;

    body.querySelector('[data-action="recompute"]')?.addEventListener('click', async (ev) => {
      const btn = ev.currentTarget;
      const old = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Recomputing…';
      try {
        await api.recomputeRisk(activePatientId);
        await loadPatient();
      } catch (e) {
        btn.disabled = false;
        btn.textContent = old;
        body.insertAdjacentHTML('afterbegin', _errorCard((e && e.message) || String(e)));
      }
    });

    body.querySelectorAll('[data-action="override"]').forEach((b) => {
      b.addEventListener('click', () => {
        const cat = b.getAttribute('data-category');
        const card = body.querySelector(`[data-category="${cat}"]`);
        if (!card) return;
        if (card.querySelector(`[data-override-form="${cat}"]`)) return;
        const meta = (profile?.categories || []).find((c) => c.category === cat) || { category: cat };
        card.insertAdjacentHTML('beforeend', _renderOverrideForm(meta));
        const form = card.querySelector(`[data-override-form="${cat}"]`);
        form?.querySelector('[data-action="override-cancel"]')?.addEventListener('click', () => form.remove());
        form?.querySelector('[data-action="override-submit"]')?.addEventListener('click', async () => {
          const level = form.querySelector('[data-role="override-level"]').value;
          const reason = form.querySelector('[data-role="override-reason"]').value.trim();
          if (!reason) {
            form.querySelector('[data-role="override-reason"]').focus();
            return;
          }
          const submit = form.querySelector('[data-action="override-submit"]');
          submit.disabled = true;
          submit.textContent = 'Saving…';
          try {
            await api.overrideRiskCategory(activePatientId, cat, { level, reason });
            await loadPatient();
          } catch (e) {
            submit.disabled = false;
            submit.textContent = 'Save override';
            form.insertAdjacentHTML('beforeend', `<div style="margin-top:8px;color:var(--red);font-size:11px">${esc((e && e.message) || String(e))}</div>`);
          }
        });
      });
    });
  }

  function render() {
    setBreadcrumb();
    if (view === 'clinic') loadClinic();
    else loadPatient();
  }

  render();
}

export default { pgRiskAnalyzer };
