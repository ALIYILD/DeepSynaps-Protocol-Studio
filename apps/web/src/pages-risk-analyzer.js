/**
 * Risk Analyzer — clinician workspace for safety stratification, formulation,
 * transparent prediction support, actions, and audit. Decision-support only.
 */
import { api } from './api.js';

const LS_GEO = 'ds_risk_analyzer_region';

function esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _isDemo() {
  try {
    return !!(import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO === '1');
  } catch {
    return false;
  }
}

const ORDER = [
  'suicide_risk', 'self_harm', 'mental_crisis', 'harm_to_others',
  'seizure_risk', 'implant_risk', 'medication_interaction', 'allergy',
];

const LEVEL_COLOR = {
  red: { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.45)', fg: '#f87171' },
  amber: { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.4)', fg: '#fbbf24' },
  green: { bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.35)', fg: '#4ade80' },
};

function _demoPayload(patientId) {
  return {
    schema_version: '1.0.0',
    patient_id: patientId,
    generated_at: new Date().toISOString(),
    safety_snapshot: ORDER.map((cat) => ({
      category: cat,
      label: cat.replace(/_/g, ' '),
      level: cat === 'suicide_risk' ? 'amber' : 'green',
      computed_level: cat === 'suicide_risk' ? 'amber' : 'green',
      confidence: 'medium',
      rationale: 'Demo data — connect to API for live stratification.',
      computed_at: new Date().toISOString(),
      data_sources: [],
      evidence_refs: [],
    })),
    formulation: {
      presenting_concerns: [],
      narrative_formulation: '',
      protective_factors: [],
      dynamic_drivers: [],
      access_to_means: { level: 'unknown', notes: '' },
      family_carer_concerns: '',
      clinician_concerns: '',
      safety_plan_status: { status: 'none' },
    },
    safety_plan: { status: 'none', summary: '' },
    assessment_evidence: [],
    prediction_support: [
      { analyzer_id: 'suicide_self_harm', title: 'Suicide / self-harm — short-horizon model estimate', score: 0.28, score_type: 'probability', band_label: 'lower', horizon_hours: 72, horizon_label: '72h', contributing_factors: [], confidence: { level: 'low', calibration_note: 'Demo layout', target_population_note: 'Demo' }, model: { id: 'demo', version: '0', kind: 'rule_based' }, computed_at: new Date().toISOString() },
      { analyzer_id: 'mental_crisis', title: 'Mental crisis — destabilization estimate', score: 0.15, score_type: 'index', band_label: 'baseline', horizon_hours: 48, horizon_label: '48h', contributing_factors: [], confidence: { level: 'low', calibration_note: 'Demo layout', target_population_note: 'Demo' }, model: { id: 'demo', version: '0', kind: 'rule_based' }, computed_at: new Date().toISOString() },
      { analyzer_id: 'harm_to_others', title: 'Harm to others — concern profile', score: 0.12, score_type: 'probability', band_label: 'lower', horizon_hours: 72, horizon_label: '72h', contributing_factors: [], confidence: { level: 'low', calibration_note: 'Demo layout', target_population_note: 'Demo' }, model: { id: 'demo', version: '0', kind: 'rule_based' }, computed_at: new Date().toISOString() },
      { analyzer_id: 'relapse_adherence', title: 'Relapse / adherence — research composite', score: 0.35, score_type: 'index', band_label: null, horizon_hours: 168, horizon_label: '7d', contributing_factors: [], confidence: { level: 'low', calibration_note: 'Demo layout', target_population_note: 'Demo' }, model: { id: 'demo', version: '0', kind: 'research_composite' }, computed_at: new Date().toISOString() },
    ],
    recommended_actions: [],
    audit_events: [],
  };
}

function crisisStripHtml(region) {
  const r = region || 'us';
  if (r === 'uk') {
    return `<div class="ra-crisis-strip" role="region" aria-label="Crisis resources">
      <strong>Crisis (UK):</strong> NHS 111 · Samaritans 116 123 · Emergency 999
    </div>`;
  }
  return `<div class="ra-crisis-strip" role="region" aria-label="Crisis resources">
    <strong>Crisis (US):</strong> 988 Suicide &amp; Crisis Lifeline · Emergency 911
  </div>`;
}

function renderSnapshotCard(c) {
  const lv = (c.level || 'green').toLowerCase();
  const pal = LEVEL_COLOR[lv] || LEVEL_COLOR.green;
  return `<div class="ra-snap-card" style="background:${pal.bg};border:1px solid ${pal.border}">
    <div class="ra-snap-title">${esc(c.label || c.category)}</div>
    <div class="ra-snap-level" style="color:${pal.fg}">${esc((c.level || '').toUpperCase())}</div>
    <div class="ra-snap-sub">${esc(c.confidence || '')} · ${esc((c.computed_at || '').slice(0, 16))}</div>
    <p class="ra-snap-rationale">${esc((c.rationale || '').slice(0, 220))}${(c.rationale || '').length > 220 ? '…' : ''}</p>
    ${c.override_level ? `<div class="ra-override-tag">Override active</div>` : ''}
  </div>`;
}

function renderPredictionCard(p) {
  const scoreLabel = p.score != null ? Number(p.score).toFixed(2) : '—';
  return `<div class="ra-pred-card">
    <div class="ra-pred-head">
      <span class="ra-chip">Model output</span>
      <span class="ra-pred-horizon">${esc(p.horizon_label || (p.horizon_hours ? p.horizon_hours + 'h' : ''))}</span>
    </div>
    <h4 class="ra-pred-title">${esc(p.title || p.analyzer_id)}</h4>
    <div class="ra-pred-score-row">
      <span class="ra-pred-score">${esc(scoreLabel)}</span>
      <span class="ra-pred-band">${esc(p.band_label || '')}</span>
    </div>
    <p class="ra-pred-cal">${esc((p.confidence && p.confidence.calibration_note) || '')}</p>
    <p class="ra-pred-pop">${esc((p.confidence && p.confidence.target_population_note) || '')}</p>
    ${(p.contributing_factors || []).length ? `<ul class="ra-factor-list">${p.contributing_factors.slice(0, 6).map((f) =>
      `<li><strong>${esc(f.name)}</strong> — ${esc(f.detail || '')}</li>`).join('')}</ul>` : ''}
  </div>`;
}

export async function pgRiskAnalyzer(setTopbar, navigate) {
  setTopbar('Risk Analyzer', '');
  const root = document.getElementById('page-content');
  if (!root) return;

  let patientId = window._selectedPatientId || window._profilePatientId || sessionStorage.getItem('ds_pat_selected_id');
  let payload = null;
  let err = null;
  let region = (typeof localStorage !== 'undefined' && localStorage.getItem(LS_GEO)) || 'us';
  let _handlersBound = false;

  const load = async () => {
    if (!patientId) {
      try {
        const res = await api.listPatients({ limit: 200 });
        const items = res?.items || (Array.isArray(res) ? res : []);
        if (items[0]) patientId = items[0].id;
      } catch { /* empty */ }
    }
    if (!patientId) {
      payload = _demoPayload('demo-patient');
      err = 'Select a patient from the roster or patient profile to load live data.';
      return;
    }
    try {
      payload = await api.getRiskAnalyzerPage(patientId);
      if (payload.error === 'patient_not_found') {
        err = 'Patient not found.';
        payload = _demoPayload(patientId);
      }
    } catch (e) {
      err = _isDemo() ? 'API unavailable — showing demo layout.' : (e.message || 'Failed to load');
      payload = _demoPayload(patientId);
    }
  };

  await load();

  const snap = payload.safety_snapshot || [];
  const snapSorted = [...snap].sort((a, b) => ORDER.indexOf(a.category) - ORDER.indexOf(b.category));

  const render = () => {
    const form = payload.formulation || {};
    const sp = payload.safety_plan || {};
    const showCrisis = snapSorted.some((c) =>
      ['suicide_risk', 'self_harm', 'mental_crisis'].includes(c.category) && c.level === 'red'
    ) || snapSorted.some((c) =>
      ['suicide_risk', 'self_harm', 'mental_crisis'].includes(c.category) && c.level === 'amber'
    );

    root.innerHTML = `
<style>
  .ra-wrap { max-width:1280px;margin:0 auto;padding:16px 20px 48px; }
  .ra-banner { background:rgba(0,212,188,0.08);border:1px solid rgba(0,212,188,0.25);border-radius:10px;padding:14px 18px;margin-bottom:16px;font-size:12.5px;line-height:1.55;color:var(--text-secondary); }
  .ra-banner strong { color:var(--text-primary); }
  .ra-crisis-strip { background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.35);color:#fecaca;padding:12px 16px;border-radius:8px;margin-bottom:16px;font-size:13px; }
  .ra-toolbar { display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:18px; }
  .ra-toolbar select { background:var(--bg-card);border:1px solid var(--border);color:var(--text-primary);padding:6px 10px;border-radius:8px;font-size:12px; }
  .ra-section { margin-bottom:28px; }
  .ra-section-h { font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--text-tertiary);margin:0 0 12px; }
  .ra-snap-grid { display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px; }
  .ra-snap-card { border-radius:10px;padding:12px 14px;min-height:120px; }
  .ra-snap-title { font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.04em; }
  .ra-snap-level { font-size:20px;font-weight:800;margin:6px 0 4px; }
  .ra-snap-sub { font-size:10px;color:var(--text-tertiary); }
  .ra-snap-rationale { font-size:11.5px;color:var(--text-secondary);margin:8px 0 0;line-height:1.45; }
  .ra-override-tag { display:inline-block;margin-top:8px;font-size:10px;padding:2px 8px;border-radius:4px;background:rgba(59,130,246,0.15);color:var(--blue); }
  .ra-two-col { display:grid;grid-template-columns:1fr 1fr;gap:16px; }
  @media (max-width:900px){ .ra-two-col { grid-template-columns:1fr; } }
  .ra-panel { background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px 18px; }
  .ra-panel label { display:block;font-size:11px;font-weight:600;color:var(--text-tertiary);margin-bottom:6px; }
  .ra-panel textarea, .ra-panel input { width:100%;box-sizing:border-box;background:rgba(0,0,0,0.2);border:1px solid var(--border);border-radius:8px;color:var(--text-primary);padding:10px 12px;font-size:13px;font-family:inherit;min-height:88px; }
  .ra-ev-line { border-bottom:1px solid var(--border);padding:10px 0;font-size:12px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap; }
  .ra-ev-kind { color:var(--teal);font-weight:600;font-size:11px;text-transform:uppercase; }
  .ra-pred-grid { display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px; }
  .ra-pred-card { background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:12px;padding:14px 16px; }
  .ra-pred-head { display:flex;justify-content:space-between;align-items:center;margin-bottom:8px; }
  .ra-chip { font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;background:rgba(139,92,246,0.15);color:#c4b5fd;padding:3px 8px;border-radius:4px; }
  .ra-pred-horizon { font-size:11px;color:var(--text-tertiary); }
  .ra-pred-title { font-size:14px;font-weight:700;margin:0 0 8px;color:var(--text-primary); }
  .ra-pred-score-row { display:flex;align-items:baseline;gap:12px;margin-bottom:8px; }
  .ra-pred-score { font-size:26px;font-weight:800;color:var(--text-primary); }
  .ra-pred-band { font-size:12px;color:var(--amber);font-weight:600; }
  .ra-pred-cal, .ra-pred-pop { font-size:11px;color:var(--text-tertiary);line-height:1.45;margin:0 0 6px; }
  .ra-factor-list { margin:8px 0 0;padding-left:18px;font-size:11.5px;color:var(--text-secondary); }
  .ra-act { display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--border); }
  .ra-act-pri { font-size:10px;font-weight:800;text-transform:uppercase;padding:2px 8px;border-radius:4px;background:rgba(245,158,11,0.15);color:var(--amber); }
  .ra-audit { font-size:11.5px;color:var(--text-secondary);border-bottom:1px solid var(--border);padding:8px 0; }
  .ra-err { background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);color:#fecaca;padding:10px 14px;border-radius:8px;margin-bottom:12px;font-size:12px; }
</style>
<div class="ra-wrap">
  ${err ? `<div class="ra-err">${esc(err)}</div>` : ''}
  <div class="ra-banner">
    <strong>Decision-support only.</strong> This workspace does not diagnose, predict suicide outcomes for individuals,
    or authorize discharge. Operational traffic lights are rule-based workflow signals. Model cards are adjunctive estimates —
    integrate with person-centred formulation and local protocol. Not for autonomous patient contact.
  </div>
  ${showCrisis ? crisisStripHtml(region) : ''}

  <div class="ra-toolbar">
    <button type="button" class="btn btn-primary btn-sm" id="ra-recompute">Recompute stratification</button>
    <button type="button" class="btn btn-outline btn-sm" id="ra-override-open">Category override…</button>
    <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-secondary);">
      Crisis strip region
      <select id="ra-region">
        <option value="us" ${region === 'us' ? 'selected' : ''}>United States</option>
        <option value="uk" ${region === 'uk' ? 'selected' : ''}>United Kingdom</option>
      </select>
    </label>
    ${patientId ? `<span style="font-size:11px;color:var(--text-tertiary)">Patient ID: ${esc(patientId)}</span>` : ''}
  </div>

  <section class="ra-section">
    <h3 class="ra-section-h">Safety snapshot (operational)</h3>
    <div class="ra-snap-grid">${snapSorted.map(renderSnapshotCard).join('') || '<p style="color:var(--text-tertiary)">No categories</p>'}</div>
  </section>

  <section class="ra-section ra-two-col">
    <div class="ra-panel">
      <h3 class="ra-section-h">Person-centred formulation</h3>
      <label>Narrative formulation</label>
      <textarea id="ra-narrative" placeholder="Collaborative formulation — drivers, context, meaning for this patient.">${esc(form.narrative_formulation || '')}</textarea>
      <label style="margin-top:12px;">Clinician concerns (session)</label>
      <textarea id="ra-clin-concerns" style="min-height:72px" placeholder="acute concerns not captured elsewhere">${esc(form.clinician_concerns || '')}</textarea>
      <label style="margin-top:12px;">Protective factors (one per line)</label>
      <textarea id="ra-protective" style="min-height:64px" placeholder="supports, reasons for living, engagement">${(form.protective_factors || []).join('\n')}</textarea>
      <label style="margin-top:12px;">Family / carer concerns</label>
      <textarea id="ra-carer" style="min-height:64px">${esc(form.family_carer_concerns || '')}</textarea>
      <label style="margin-top:12px;">Access to means</label>
      <select id="ra-means" style="width:100%;padding:8px;border-radius:8px;background:var(--bg-card);border:1px solid var(--border);color:var(--text-primary);">
        ${['unknown', 'none', 'some', 'significant'].map((m) =>
          `<option value="${m}" ${((form.access_to_means || {}).level === m) ? 'selected' : ''}>${m}</option>`).join('')}
      </select>
      <textarea id="ra-means-notes" style="min-height:52px;margin-top:8px" placeholder="Notes on means / environment">${esc((form.access_to_means || {}).notes || '')}</textarea>
      <button type="button" class="btn btn-primary btn-sm" style="margin-top:12px" id="ra-save-form">Save formulation</button>
    </div>
    <div class="ra-panel">
      <h3 class="ra-section-h">Safety plan status</h3>
      <label>Status</label>
      <select id="ra-sp-status" style="width:100%;padding:8px;border-radius:8px;margin-bottom:10px;background:var(--bg-card);border:1px solid var(--border);color:var(--text-primary);">
        ${['none', 'draft', 'active', 'needs_review', 'expired'].map((s) =>
          `<option value="${s}" ${(sp.status === s || form.safety_plan_status?.status === s) ? 'selected' : ''}>${s}</option>`).join('')}
      </select>
      <label>Summary</label>
      <textarea id="ra-sp-sum" style="min-height:80px">${esc(sp.summary || '')}</textarea>
      <button type="button" class="btn btn-primary btn-sm" style="margin-top:12px" id="ra-save-sp">Save safety plan</button>
    </div>
  </section>

  <section class="ra-section">
    <h3 class="ra-section-h">Assessment evidence</h3>
    <div class="ra-panel" style="padding:0 16px;">
      ${(payload.assessment_evidence || []).length
        ? payload.assessment_evidence.slice(0, 40).map((e) => `<div class="ra-ev-line">
            <span><span class="ra-ev-kind">${esc(e.kind)}</span> ${esc(e.label)} — ${esc(e.value_display)}</span>
            <span style="color:var(--text-tertiary);font-size:11px">${esc(e.observed_at || e.recorded_at || '')}</span>
          </div>`).join('')
        : '<p style="padding:16px;color:var(--text-tertiary);font-size:13px">No assessment rows returned. Complete PHQ-9 / C-SSRS or connect intake.</p>'}
    </div>
  </section>

  <section class="ra-section">
    <h3 class="ra-section-h">Prediction support (transparent models)</h3>
    <div class="ra-pred-grid">${(payload.prediction_support || []).map(renderPredictionCard).join('')}</div>
  </section>

  <section class="ra-section">
    <h3 class="ra-section-h">Recommended actions</h3>
    <div class="ra-panel">
      ${(payload.recommended_actions || []).length
        ? payload.recommended_actions.map((a) => `<div class="ra-act">
            <span class="ra-act-pri">${esc(a.priority)}</span>
            <div><strong>${esc(a.title)}</strong><div style="font-size:12px;color:var(--text-secondary);margin-top:4px">${esc(a.detail)}</div></div>
          </div>`).join('')
        : '<p style="color:var(--text-tertiary);font-size:13px">No templated actions.</p>'}
    </div>
  </section>

  <section class="ra-section">
    <h3 class="ra-section-h">Audit & overrides</h3>
    <div class="ra-panel">
      ${(payload.audit_events || []).slice(0, 25).map((ev) => `<div class="ra-audit">
        ${esc(ev.occurred_at || '')} · ${esc(ev.event_type || '')}
        ${ev.payload_summary ? ' — ' + esc(ev.payload_summary) : ''}
      </div>`).join('') || '<span style="color:var(--text-tertiary);font-size:12px">No audit rows.</span>'}
    </div>
  </section>
</div>`;

    if (!_handlersBound) {
      _handlersBound = true;
      root.addEventListener('change', (e) => {
        const t = e.target;
        if (t && t.id === 'ra-region') {
          region = t.value;
          try { localStorage.setItem(LS_GEO, region); } catch { /* empty */ }
          render();
        }
      });
      root.addEventListener('click', async (e) => {
        const t = e.target;
        if (!t) return;
        if (t.closest('#ra-recompute')) {
          if (!patientId) return;
          try {
            window._showToast?.('Recomputing…', 'info');
            payload = await api.recomputeRiskAnalyzer(patientId, {});
            err = null;
            render();
            window._showToast?.('Stratification recomputed.', 'success');
          } catch (err0) {
            window._showToast?.(err0.message || 'Recompute failed', 'error');
          }
          return;
        }
        if (t.closest('#ra-save-form')) {
          if (!patientId) return;
          const protective = (document.getElementById('ra-protective').value || '')
            .split('\n').map((s) => s.trim()).filter(Boolean);
          const body = {
            narrative_formulation: document.getElementById('ra-narrative').value,
            clinician_concerns: document.getElementById('ra-clin-concerns').value,
            protective_factors: protective,
            family_carer_concerns: document.getElementById('ra-carer').value,
            access_to_means: {
              level: document.getElementById('ra-means').value,
              notes: document.getElementById('ra-means-notes').value,
            },
          };
          try {
            const res = await api.saveRiskFormulation(patientId, body);
            if (res.formulation) payload.formulation = res.formulation;
            window._showToast?.('Formulation saved.', 'success');
            await load();
            render();
          } catch (err0) {
            window._showToast?.(err0.message || 'Save failed', 'error');
          }
          return;
        }
        if (t.closest('#ra-save-sp')) {
          if (!patientId) return;
          try {
            const res = await api.saveRiskSafetyPlan(patientId, {
              status: document.getElementById('ra-sp-status').value,
              summary: document.getElementById('ra-sp-sum').value,
            });
            if (res.safety_plan) payload.safety_plan = res.safety_plan;
            window._showToast?.('Safety plan saved.', 'success');
            await load();
            render();
          } catch (err0) {
            window._showToast?.(err0.message || 'Save failed', 'error');
          }
          return;
        }
        if (t.closest('#ra-override-open')) {
          if (!patientId) {
            window._showToast?.('Select a patient first.', 'error');
            return;
          }
          const modal = document.createElement('div');
          modal.className = 'modal-overlay';
          modal.innerHTML = `<div class="modal-panel card" style="max-width:420px;padding:20px">
            <h3 style="margin:0 0 12px;font-size:16px">Override traffic-light category</h3>
            <label style="font-size:11px">Category</label>
            <select id="ra-ov-cat" style="width:100%;margin-bottom:10px;padding:8px">${ORDER.map((c) =>
              `<option value="${c}">${c}</option>`).join('')}</select>
            <label style="font-size:11px">Level</label>
            <select id="ra-ov-lvl" style="width:100%;margin-bottom:10px;padding:8px">
              <option value="green">green</option><option value="amber">amber</option><option value="red">red</option>
            </select>
            <label style="font-size:11px">Reason (required)</label>
            <textarea id="ra-ov-reason" style="width:100%;min-height:72px;margin-bottom:12px"></textarea>
            <div style="display:flex;gap:10px;justify-content:flex-end">
              <button type="button" class="btn btn-outline btn-sm" id="ra-ov-cancel">Cancel</button>
              <button type="button" class="btn btn-primary btn-sm" id="ra-ov-ok">Apply override</button>
            </div>
          </div>`;
          document.body.appendChild(modal);
          const close = () => modal.remove();
          modal.querySelector('#ra-ov-cancel').addEventListener('click', close);
          modal.querySelector('#ra-ov-ok').addEventListener('click', async () => {
            const reason = modal.querySelector('#ra-ov-reason').value.trim();
            if (reason.length < 3) {
              window._showToast?.('Reason must be at least 3 characters.', 'error');
              return;
            }
            try {
              payload = await api.overrideRiskAnalyzerCategory(patientId, {
                category: modal.querySelector('#ra-ov-cat').value,
                level: modal.querySelector('#ra-ov-lvl').value,
                reason,
              });
              err = null;
              close();
              render();
              window._showToast?.('Override saved.', 'success');
            } catch (err0) {
              window._showToast?.(err0.message || 'Override failed', 'error');
            }
          });
          modal.addEventListener('click', (ev) => { if (ev.target === modal) close(); });
        }
      });
    }
  };

  render();
}
