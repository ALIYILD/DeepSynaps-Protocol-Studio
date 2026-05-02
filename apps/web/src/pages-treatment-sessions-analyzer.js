/**
 * Treatment Sessions Analyzer + Protocol Intelligence — neuromodulation course workspace.
 * Decision-support only; does not prescribe or modify treatment.
 */

import { api } from './api.js';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _demoPayload() {
  const t = new Date().toISOString();
  return {
    schema_version: '1.0.0',
    generated_at: t,
    patient_id: 'demo',
    provenance: { source: 'demo', source_ref: 'offline', extracted_at: t },
    page_title: 'Treatment Sessions Analyzer + Protocol Intelligence',
    disclaimer_refs: [],
    planning_snapshot: {
      updated_at: t,
      provenance: { source: 'demo', source_ref: 'static', extracted_at: t },
      modality: 'TMS',
      candidate_protocols: [
        {
          id: 'cpr_1',
          created_at: t,
          provenance: { source: 'demo', source_ref: 'static', extracted_at: t },
          modality: 'TMS',
          protocol_key: 'HF_L_DLPFC',
          label: 'High-frequency left DLPFC (illustrative)',
          waveform_family: 'rTMS',
          evidence_strength: 'moderate',
          confidence: 0.62,
          rank: 1,
          rationale_bullets: [
            'Illustrative candidate for preview builds.',
            'Verify against clinic protocol and device labeling.',
          ],
          evidence_link_ids: [],
          contraindication_hits: [],
          requires_clinician_review: true,
        },
      ],
      candidate_targets: [
        {
          id: 'tr_1',
          created_at: t,
          provenance: { source: 'demo', source_ref: 'static', extracted_at: t },
          modality: 'TMS',
          anatomical_target: 'left_DLPFC',
          coordinate_space: '',
          coordinates_mm: [],
          confidence: 0.48,
          mri_anchor_study_id: null,
          uncertainty_mm: null,
          biomarker_role: 'predictive',
          notes: 'Demo target hypothesis — not patient-specific.',
        },
      ],
      response_probability: { point: 0.58, ci: [0.42, 0.74], horizon: '12_weeks' },
      session_count_estimate: { median: 30, range: [24, 36], unit: 'sessions' },
      modality_suitability: { status: 'preview_demo', flags: [] },
      uncertainty: { level: 'medium', drivers: ['demo_dataset'] },
      why_summary:
        'Preview data shows layout only. Connect a patient for course-linked estimates.',
      biomarker_roles_used: { predictive: ['demo'], responsive: [] },
      confidence: 0.4,
    },
    course: {
      id: 'demo-course',
      updated_at: t,
      provenance: { source: 'demo', source_ref: 'static', extracted_at: t },
      modality: 'TMS',
      indication_context: { type: 'clinical', condition_codes: ['demo'] },
      wellness_mode: false,
      protocol_status: { name: 'demo_protocol', version: '', started_on: t },
      phase: 'acute',
      planned_sessions: 36,
      completed_sessions: 8,
      missed_sessions: 1,
      last_session_at: t,
      response_status: 'partial_response',
      side_effect_burden: { score: 0.2, tier: 'low' },
      linked_analyzer_ids: { mri: [], qeeg: [], assessments: [], biometrics: [] },
    },
    sessions: [
      {
        id: 'demo-s1',
        session_index: 8,
        started_at: t,
        ended_at: null,
        timezone: 'UTC',
        provenance: { source: 'demo', source_ref: 'static', extracted_at: t },
        modality: 'TMS',
        protocol_label: 'HF_L_DLPFC',
        target: { label: 'left_DLPFC', confidence: 0.5 },
        parameters: { duration_minutes: 37, provenance: { source: 'demo', source_ref: 'static', extracted_at: t }, confidence: 0.5 },
        duration_minutes: 37,
        status: 'completed',
        attendance: 'full',
        patient_experience: {},
        acute_side_effects: [],
        linked_pre_measures: [],
        linked_post_measures: [],
        linked_analyzers_impacted: [],
        severity_for_monitoring: 'routine',
        urgency: 'none',
      },
    ],
    multimodal_contributors: [
      {
        id: 'mmc_demo',
        updated_at: t,
        provenance: { source: 'demo', source_ref: 'static', extracted_at: t },
        domain: 'qeeg',
        biomarker_role: 'predictive',
        summary: 'Demo contributor row — link qEEG/MRI for live summaries.',
        relevance_score: 0.5,
        confidence: 0.5,
        data_quality: 'demo',
        linked_artifact_ids: [],
        linked_analyzer_route: '/?page=qeeg-analysis',
        impacted_predictions: ['response_probability'],
        caveats: [],
      },
    ],
    outcome_trends: [],
    side_effect_events: [],
    optimization_prompts: [],
    recommendations: [
      {
        id: 'trec_demo',
        created_at: t,
        provenance: { source: 'demo', source_ref: 'static', extracted_at: t },
        kind: 'clinician_review',
        title: 'Select a patient to load live decision-support data',
        body: 'This workspace aggregates sessions, courses, and multimodal links from your clinic record.',
        priority: 'low',
        decision_support_only: true,
        clinician_review_required: true,
        structured: {},
        evidence_link_ids: [],
        confidence: 1,
        time_horizon: 'n/a',
      },
    ],
    evidence_links: [],
    audit_events: [],
    data_gaps: [{ domain: 'all', impact: 'demo_mode' }],
    prediction_horizon: { label: 'demo', start: t, end: t },
    meta: { rules_engine_version: 'demo', forecast_note: 'Offline preview' },
  };
}

function _isDemoBuild() {
  try {
    return !!(import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO === '1');
  } catch {
    return false;
  }
}

function _section(title, bodyHtml) {
  return `<section style="margin-bottom:20px;background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:14px 16px">
    <h2 style="margin:0 0 10px;font-size:14px;font-weight:600;color:var(--text-primary)">${esc(title)}</h2>
    ${bodyHtml}
  </section>`;
}

function _renderPlanning(ps) {
  if (!ps) return '<p style="font-size:12px;color:var(--text-tertiary)">No planning snapshot.</p>';
  const probs = ps.response_probability || {};
  const sess = ps.session_count_estimate || {};
  const unc = ps.uncertainty || {};
  const protos = Array.isArray(ps.candidate_protocols) ? ps.candidate_protocols : [];
  const protoList = protos
    .slice(0, 4)
    .map(
      (p) =>
        `<li style="margin-bottom:6px"><strong>${esc(p.label || p.protocol_key)}</strong>
        <span style="color:var(--text-tertiary)"> · conf ${esc(p.confidence ?? '—')}</span></li>`,
    )
    .join('');
  const targets = Array.isArray(ps.candidate_targets) ? ps.candidate_targets : [];
  const tgtList = targets
    .slice(0, 3)
    .map(
      (x) =>
        `<li style="margin-bottom:6px">${esc(x.anatomical_target || '—')}
        <span style="color:var(--text-tertiary)"> · ${esc(x.biomarker_role || '')}</span></li>`,
    )
    .join('');
  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;font-size:12px">
      <div><div style="color:var(--text-tertiary);font-size:11px;text-transform:uppercase;letter-spacing:.4px">Response (prob.)</div>
        <div style="font-size:20px;font-weight:600">${esc(probs.point ?? '—')}</div>
        <div style="color:var(--text-tertiary)">CI: ${esc((probs.ci || []).join(' – '))}</div></div>
      <div><div style="color:var(--text-tertiary);font-size:11px;text-transform:uppercase">Sessions (est.)</div>
        <div style="font-size:20px;font-weight:600">${esc(sess.median ?? '—')}</div>
        <div style="color:var(--text-tertiary)">Range: ${esc((sess.range || []).join(' – '))} ${esc(sess.unit || '')}</div></div>
      <div><div style="color:var(--text-tertiary);font-size:11px;text-transform:uppercase">Uncertainty</div>
        <div>${esc(unc.level || '—')}</div>
        <div style="color:var(--text-tertiary)">${esc((unc.drivers || []).join(', '))}</div></div>
    </div>
    <p style="font-size:12px;color:var(--text-secondary);margin:12px 0 8px;line-height:1.45">${esc(ps.why_summary || '')}</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div><div style="font-size:11px;color:var(--text-tertiary);margin-bottom:6px">Protocol candidates</div><ul style="margin:0;padding-left:18px">${protoList || '<li>—</li>'}</ul></div>
      <div><div style="font-size:11px;color:var(--text-tertiary);margin-bottom:6px">Target candidates</div><ul style="margin:0;padding-left:18px">${tgtList || '<li>—</li>'}</ul></div>
    </div>`;
}

function _renderCourse(c) {
  if (!c) return '<p style="font-size:12px;color:var(--text-tertiary)">No active course in payload.</p>';
  return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;font-size:12px">
    <div><span style="color:var(--text-tertiary)">Modality</span><br/><strong>${esc(c.modality)}</strong></div>
    <div><span style="color:var(--text-tertiary)">Phase</span><br/><strong>${esc(c.phase)}</strong></div>
    <div><span style="color:var(--text-tertiary)">Completed / planned</span><br/><strong>${esc(c.completed_sessions)} / ${esc(c.planned_sessions)}</strong></div>
    <div><span style="color:var(--text-tertiary)">Missed</span><br/><strong>${esc(c.missed_sessions)}</strong></div>
    <div><span style="color:var(--text-tertiary)">Response status</span><br/><strong>${esc(c.response_status)}</strong></div>
    <div><span style="color:var(--text-tertiary)">Side-effect burden</span><br/><strong>${esc(c.side_effect_burden?.tier)}</strong></div>
  </div>`;
}

function _renderTimeline(rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) {
    return '<p style="font-size:12px;color:var(--text-tertiary)">No sessions in range.</p>';
  }
  const tableRows = list
    .slice(-25)
    .map(
      (s) => `<tr>
      <td style="padding:8px;border-bottom:1px solid var(--border);white-space:nowrap">${esc(s.started_at)}</td>
      <td style="padding:8px;border-bottom:1px solid var(--border)">${esc(s.modality)}</td>
      <td style="padding:8px;border-bottom:1px solid var(--border)">${esc(s.protocol_label)}</td>
      <td style="padding:8px;border-bottom:1px solid var(--border)">${esc(s.status)}</td>
      <td style="padding:8px;border-bottom:1px solid var(--border)">${esc(s.duration_minutes)} min</td>
    </tr>`,
    )
    .join('');
  return `<div style="overflow:auto;border-radius:10px;border:1px solid var(--border)">
    <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:520px">
      <thead><tr style="text-align:left;color:var(--text-tertiary);font-size:11px;text-transform:uppercase">
        <th style="padding:8px;border-bottom:1px solid var(--border)">When</th>
        <th style="padding:8px;border-bottom:1px solid var(--border)">Modality</th>
        <th style="padding:8px;border-bottom:1px solid var(--border)">Protocol</th>
        <th style="padding:8px;border-bottom:1px solid var(--border)">Status</th>
        <th style="padding:8px;border-bottom:1px solid var(--border)">Duration</th>
      </tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>`;
}

function _renderContributors(items) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return '<p style="font-size:12px;color:var(--text-tertiary)">None.</p>';
  return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px">
    ${list
      .map(
        (m) => `<div style="border:1px solid var(--border);border-radius:10px;padding:10px;font-size:12px">
        <div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:6px">
          <strong>${esc(m.domain)}</strong>
          <span class="pill pill-pending" style="font-size:10px">${esc(m.biomarker_role)}</span>
        </div>
        <div style="color:var(--text-secondary);line-height:1.45;margin-bottom:8px">${esc(m.summary)}</div>
        <button type="button" class="btn btn-ghost btn-sm tsa-open-route" data-page="${esc((m.linked_analyzer_route || '').replace(/^.*[?&]page=/, '').split('&')[0] || '')}" style="min-height:40px">Open analyzer</button>
      </div>`,
      )
      .join('')}
  </div>`;
}

function _renderOutcomes(trends) {
  const t = Array.isArray(trends) ? trends : [];
  if (!t.length) return '<p style="font-size:12px;color:var(--text-tertiary)">No linked outcome series yet.</p>';
  return t
    .map(
      (o) => `<div style="margin-bottom:10px;font-size:12px">
      <strong>${esc(o.measure_key)}</strong>
      <span style="color:var(--text-tertiary)"> · ${esc(o.points?.length || 0)} points</span>
    </div>`,
    )
    .join('');
}

function _renderSideFx(events) {
  const ev = Array.isArray(events) ? events : [];
  if (!ev.length) return '<p style="font-size:12px;color:var(--text-tertiary)">No adverse events linked.</p>';
  return `<ul style="margin:0;padding-left:18px;font-size:12px">${ev
    .map(
      (e) =>
        `<li style="margin-bottom:6px"><strong>${esc(e.category)}</strong> · ${esc(e.occurred_at)}
        ${e.sa_flag ? ' <span class="pill" style="background:rgba(255,107,107,0.12);color:var(--red)">SAE flag</span>' : ''}</li>`,
    )
    .join('')}</ul>`;
}

function _renderOptimization(prompts) {
  const p = Array.isArray(prompts) ? prompts : [];
  if (!p.length) return '<p style="font-size:12px;color:var(--text-tertiary)">No optimization prompts.</p>';
  return p
    .map(
      (x) => `<div style="padding:10px;border:1px dashed var(--border);border-radius:10px;margin-bottom:8px;font-size:12px">
      <strong>${esc(x.title)}</strong>
      <div style="color:var(--text-secondary);margin-top:6px">${esc(x.detail)}</div>
    </div>`,
    )
    .join('');
}

function _renderAudit(rows) {
  const r = Array.isArray(rows) ? rows : [];
  if (!r.length) {
    return '<p style="font-size:12px;color:var(--text-tertiary)">No review events yet — overrides and sign-offs will appear here.</p>';
  }
  return r.map((a) => `<div style="font-size:12px;padding:6px 0;border-bottom:1px solid var(--border)">${esc(JSON.stringify(a))}</div>`).join('');
}

export async function pgTreatmentSessionsAnalyzer(setTopbar, navigate) {
  try {
    setTopbar({
      title: 'Treatment Sessions Analyzer',
      subtitle: 'Protocol intelligence · neuromodulation course (decision-support)',
    });
  } catch {
    try {
      setTopbar('Treatment Sessions Analyzer', 'Protocol intelligence');
    } catch {}
  }

  const el = document.getElementById('content');
  if (!el) return;

  let patientId = window._selectedPatientId || window._profilePatientId || null;

  el.innerHTML = `
    <div class="ds-tsa-shell" style="max-width:1120px;margin:0 auto;padding:16px 20px 48px">
      <div style="padding:12px 14px;border-radius:12px;border:1px solid rgba(255,180,90,0.35);background:rgba(255,180,90,0.07);margin-bottom:14px;font-size:12px;line-height:1.5;color:var(--text-secondary)">
        <strong style="color:var(--text-primary)">Clinical decision-support only.</strong>
        This workspace does not prescribe, program devices, or change parameters automatically.
        All protocol, target, and dose implications require clinician review and documentation.
        Probabilities and session ranges reflect uncertainty — they are not guarantees.
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:14px">
        <label style="font-size:12px;color:var(--text-tertiary)">Patient</label>
        <input type="text" class="form-control" id="tsa-patient-id" placeholder="Patient ID" value="${esc(patientId || '')}" style="max-width:280px;min-height:44px" autocomplete="off" />
        <button type="button" class="btn btn-primary btn-sm" id="tsa-load" style="min-height:44px">Load</button>
        <button type="button" class="btn btn-ghost btn-sm" id="tsa-pick-patients" style="min-height:44px">Patients…</button>
      </div>
      <div id="tsa-body"><div style="color:var(--text-tertiary);font-size:13px">Select a patient and load.</div></div>
    </div>`;

  async function loadPayload() {
    const body = document.getElementById('tsa-body');
    const inp = document.getElementById('tsa-patient-id');
    patientId = (inp?.value || '').trim() || null;
    if (!patientId) {
      if (_isDemoBuild()) {
        render(_demoPayload());
        return;
      }
      body.innerHTML =
        '<div style="color:var(--amber);font-size:13px">Enter a patient ID, or enable demo preview.</div>';
      return;
    }
    window._selectedPatientId = patientId;
    body.innerHTML =
      '<div style="padding:24px;color:var(--text-tertiary)">Loading…</div>';
    try {
      const data = await api.getTreatmentSessionsAnalyzer(patientId);
      render(data);
    } catch (e) {
      const msg = (e && e.message) || String(e);
      if (_isDemoBuild()) {
        render(_demoPayload());
        body.insertAdjacentHTML(
          'afterbegin',
          `<div style="padding:10px;margin-bottom:12px;border-radius:10px;border:1px solid var(--border);font-size:12px;color:var(--text-secondary)">API unavailable (${esc(msg)}). Showing demo layout.</div>`,
        );
        return;
      }
      body.innerHTML = `<div role="alert" style="padding:14px;border-radius:12px;border:1px solid rgba(255,107,107,0.35);background:rgba(255,107,107,0.06);font-size:13px">${esc(msg)}</div>`;
    }
  }

  function render(payload) {
    const body = document.getElementById('tsa-body');
    if (!body || !payload) return;
    const gaps = Array.isArray(payload.data_gaps) ? payload.data_gaps : [];
    const gapBanner =
      gaps.length && !_isDemoBuild()
        ? `<div style="padding:10px 12px;margin-bottom:12px;border-radius:10px;border:1px solid var(--border);background:rgba(255,255,255,.03);font-size:12px;color:var(--text-secondary)">
        <strong>Data gaps:</strong> ${esc(gaps.map((g) => g.domain).join(', '))} — forecasts may be wider until linked.
      </div>`
        : '';

    body.innerHTML = `
      ${gapBanner}
      ${_section('Protocol planning snapshot', _renderPlanning(payload.planning_snapshot))}
      ${_section('Treatment course snapshot', _renderCourse(payload.course))}
      ${_section('Session timeline', _renderTimeline(payload.sessions))}
      ${_section('Multimodal contributors', _renderContributors(payload.multimodal_contributors))}
      ${_section('Outcomes & response', _renderOutcomes(payload.outcome_trends))}
      ${_section('Side-effects & tolerability', _renderSideFx(payload.side_effect_events))}
      ${_section('Protocol optimization prompts', _renderOptimization(payload.optimization_prompts))}
      ${_section('Recommendations', `<ul style="margin:0;padding-left:18px;font-size:12px">${(payload.recommendations || [])
        .map((r) => `<li style="margin-bottom:8px"><strong>${esc(r.title)}</strong> — ${esc(r.body)}</li>`)
        .join('')}</ul>`)}
      ${_section('Audit / review', _renderAudit(payload.audit_events))}
      <div style="font-size:11px;color:var(--text-tertiary);margin-top:12px">
        Generated ${esc(payload.generated_at)} · schema ${esc(payload.schema_version)}
        ${payload.meta?.rules_engine_version ? ` · ${esc(payload.meta.rules_engine_version)}` : ''}
      </div>`;

    body.querySelectorAll('.tsa-open-route').forEach((btn) => {
      btn.addEventListener('click', () => {
        const page = (btn.getAttribute('data-page') || '').trim();
        if (!page) return;
        try {
          navigate?.(page);
        } catch {
          window.location.href = `/?page=${encodeURIComponent(page)}`;
        }
      });
    });
  }

  document.getElementById('tsa-load')?.addEventListener('click', () => loadPayload());
  document.getElementById('tsa-pick-patients')?.addEventListener('click', () => {
    try {
      navigate?.('patients-v2');
    } catch {}
  });

  if (patientId) loadPayload();
  else if (_isDemoBuild()) render(_demoPayload());
}
