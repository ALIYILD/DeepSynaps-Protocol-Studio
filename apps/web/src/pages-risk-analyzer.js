/**
 * Risk Analyzer — clinician risk-review workspace (decision-support only).
 *
 * Primary payload: GET /api/v1/risk/analyzer/patient/{patient_id}
 * Falls back to legacy stratification profile shape when needed.
 *
 * Mutations:
 *   POST /api/v1/risk/analyzer/patient/{id}/recompute
 *   POST /api/v1/risk/analyzer/patient/{id}/override  body:{ category, level, reason }
 *
 * Demo/offline: when `isDemoSession()` and API is unavailable, uses
 * `ANALYZER_DEMO_FIXTURES.risk` — always labelled as demo sample data.
 */

import { api } from './api.js';
import { isDemoSession } from './demo-session.js';
import { currentUser } from './auth.js';
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

/** Merge workspace / legacy API shapes into a single view model */
export function normalizeRiskWorkspace(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const snap = Array.isArray(raw.safety_snapshot) ? raw.safety_snapshot : null;
  const cats = Array.isArray(raw.categories) ? raw.categories : null;
  const safety_snapshot = (snap && snap.length ? snap : cats) || [];
  return { ...raw, safety_snapshot };
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

function _pillFor(level) {
  const lvl = String(level || '').toLowerCase();
  if (lvl === 'red') {
    return '<span class="pill" style="background:rgba(255,107,107,0.12);color:var(--red);border:1px solid rgba(255,107,107,0.25)">Critical</span>';
  }
  if (lvl === 'amber') {
    return '<span class="pill pill-pending">Elevated</span>';
  }
  if (lvl === 'green') {
    return '<span class="pill pill-active">Lower concern (review context)</span>';
  }
  return '<span class="pill pill-inactive">Unknown / insufficient data</span>';
}

function _labelFor(category, fallback) {
  const map = {
    safety: 'Safety',
    clinical_deterioration: 'Clinical deterioration',
    medication: 'Medication',
    adherence: 'Adherence',
    engagement: 'Engagement',
    wellbeing: 'Wellbeing',
    caregiver: 'Caregiver',
    logistics: 'Logistics',
  };
  return map[category] || fallback || category || '—';
}

function _skeletonChips(n = 8) {
  const chip = '<span style="display:inline-block;width:90px;height:22px;border-radius:11px;background:linear-gradient(90deg,rgba(255,255,255,.04),rgba(255,255,255,.08),rgba(255,255,255,.04));background-size:200% 100%;animation:dh2AttnPulse 1.6s ease-in-out infinite"></span>';
  return `<div style="display:flex;gap:8px;flex-wrap:wrap">${Array.from({ length: n }, () => chip).join('')}</div>`;
}

function _emptyClinicCard() {
  return `<div style="max-width:520px;margin:48px auto;padding:24px;border:1px solid var(--border);border-radius:14px;background:var(--bg-card);text-align:center">
    <div style="font-size:15px;font-weight:600;margin-bottom:8px">No stratification data for active patients</div>
    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:14px;line-height:1.5">
      This view lists patients with active status in your clinic. Risk categories are computed from available chart data — absence from this list does not imply absence of clinical risk.
    </div>
    <button type="button" class="btn btn-primary btn-sm" id="ra-go-patients">Open patient roster</button>
  </div>`;
}

function _errorCard(message, retryLabel = 'Try again') {
  const safe = esc(message || 'We couldn’t load risk data right now.');
  return `<div role="alert" style="max-width:560px;margin:24px auto;padding:18px 20px;border:1px solid rgba(255,107,107,0.35);background:rgba(255,107,107,0.06);border-radius:12px">
    <div style="font-weight:600;margin-bottom:6px;color:var(--text-primary)">Unable to load risk workspace</div>
    <div style="font-size:12px;color:var(--text-secondary);line-height:1.5;margin-bottom:12px">${safe}</div>
    <button type="button" class="btn btn-ghost btn-sm" data-action="retry">${esc(retryLabel)}</button>
  </div>`;
}

/** Human-readable factor line; never pass through raw "demo_fixture" as clinical text */
export function formatFactorLine(ref, opts = {}) {
  const demo = !!opts.demoMode;
  const s = typeof ref === 'string' ? ref : (ref && typeof ref === 'object'
    ? (ref.label || ref.name || ref.detail || ref.id || '')
    : '');
  const t = String(s || '').trim();
  if (!t) return '';
  if (demo && /demo_fixture/i.test(t)) {
    return 'Demo sample factor (not patient chart data)';
  }
  if (/^demo_fixture$/i.test(t)) {
    return 'Sample data placeholder';
  }
  return t;
}

function _topContributingFactors(cat, demoMode) {
  const refs = Array.isArray(cat.evidence_refs) ? cat.evidence_refs : [];
  const sources = Array.isArray(cat.data_sources) ? cat.data_sources : [];
  const items = [];
  for (const r of refs) {
    if (items.length >= 3) break;
    const line = formatFactorLine(r, { demoMode });
    if (line && !items.includes(line)) items.push(line);
  }
  for (const s of sources) {
    if (items.length >= 3) break;
    const line = formatFactorLine(s, { demoMode });
    if (line && !items.includes(line)) items.push(line);
  }
  if (!items.length && cat.rationale) {
    const first = String(cat.rationale).split(/\.\s|\n/)[0];
    if (first) items.push(formatFactorLine(first, { demoMode }));
  }
  return items.slice(0, 3);
}

function _confidenceNote(cat) {
  const c = cat.confidence;
  if (c == null || c === '') return '';
  const raw = String(c);
  if (/^(high|medium|low|no_data)$/i.test(raw)) {
    return `Confidence band: ${raw.replace(/_/g, ' ')}`;
  }
  if (/^\d+(\.\d+)?$/.test(raw)) {
    return `Model confidence index: ${raw} (not a probability of safety)`;
  }
  return `Confidence / data quality: ${esc(raw)}`;
}

function _categoryTableHeader() {
  const cells = CATEGORY_ORDER.map((c) => `<th style="padding:8px 6px;text-align:center;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border)" data-sort-key="${esc(c)}" title="Sort by ${esc(_labelFor(c))}">${esc(_labelFor(c))}</th>`).join('');
  return `<tr>
    <th scope="col" style="padding:8px 10px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border)" data-sort-key="patient">Patient</th>
    <th scope="col" style="padding:8px 10px;text-align:center;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border)" data-sort-key="worst">Worst</th>
    ${cells}
  </tr>`;
}

function _miniDot(level) {
  const lvl = String(level || '').toLowerCase();
  const bg = lvl === 'red' ? 'var(--red)'
    : lvl === 'amber' ? 'var(--amber)'
    : lvl === 'green' ? 'var(--green)'
    : 'var(--text-tertiary)';
  const title = lvl === 'red' ? 'Critical' : lvl === 'amber' ? 'Elevated' : lvl === 'green' ? 'Lower concern' : 'Unknown';
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
    <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:760px" aria-label="Clinic risk summary by patient">
      <thead>${_categoryTableHeader()}</thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function _renderCategoryCard(cat, demoMode) {
  const factors = _topContributingFactors(cat, demoMode);
  const factorsHtml = factors.length
    ? factors.map((f) => `<li style="margin-bottom:4px">${esc(f)}</li>`).join('')
    : '<li style="color:var(--text-tertiary)">No contributing factors recorded in chart extracts for this category.</li>';
  const overridden = !!cat.override_level;
  const confHtml = _confidenceNote(cat);
  const confBlock = confHtml ? `<div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">${esc(confHtml)}</div>` : '';
  const method = cat.provenance?.engine || cat.provenance?.source
    ? `<span style="font-size:10px;color:var(--text-tertiary)">${esc(cat.provenance?.engine || cat.provenance?.source || '')}</span>`
    : '';
  return `<div data-category="${esc(cat.category)}" style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:10px;min-height:200px">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
      <div style="font-weight:600;font-size:13px">${esc(_labelFor(cat.category, cat.label))}</div>
      <div>${_pillFor(cat.level)}</div>
    </div>
    <div style="font-size:11px;color:var(--text-secondary)">
      Model level: ${esc(cat.computed_level || '—')}${overridden ? ` <span style="color:var(--amber)">• clinician override applied</span>` : ''}
      ${method ? `<span style="display:block;margin-top:4px">${method}</span>` : ''}
      ${confBlock}
    </div>
    <div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px">Contributing factors (sources)</div>
    <ul style="margin:0;padding-left:16px;font-size:12px;line-height:1.5;color:var(--text-secondary)">${factorsHtml}</ul>
    ${cat.rationale ? `<div style="font-size:11px;color:var(--text-tertiary);line-height:1.45;border-left:2px solid var(--border);padding-left:8px"><em>Rationale</em> — ${esc(cat.rationale)}</div>` : ''}
    <div style="margin-top:auto;display:flex;gap:8px">
      <button type="button" class="btn btn-ghost btn-sm" data-action="override" data-category="${esc(cat.category)}" style="min-height:44px" aria-label="Override ${_labelFor(cat.category, cat.label)}">Override…</button>
    </div>
  </div>`;
}

function _renderOverrideForm(cat) {
  return `<div data-override-form="${esc(cat.category)}" style="margin-top:10px;padding:12px;border:1px dashed var(--border);border-radius:10px;background:rgba(255,255,255,.02)">
    <div style="font-size:12px;font-weight:600;margin-bottom:8px">Clinician override — ${_labelFor(cat.category, cat.label)}</div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <label style="font-size:11px;color:var(--text-tertiary)">Displayed level</label>
      <select class="form-control" data-role="override-level" aria-label="Override level" style="max-width:160px;min-height:44px">
        <option value="green">Lower concern (green)</option>
        <option value="amber" selected>Elevated (amber)</option>
        <option value="red">Critical (red)</option>
      </select>
    </div>
    <div style="margin-top:8px">
      <label style="display:block;font-size:11px;color:var(--text-tertiary);margin-bottom:4px">Reason (required for audit)</label>
      <textarea class="form-control" data-role="override-reason" rows="3" placeholder="Document clinical rationale; overrides are audited." style="width:100%;min-height:44px" aria-required="true"></textarea>
    </div>
    <div style="margin-top:10px;display:flex;gap:8px">
      <button type="button" class="btn btn-primary btn-sm" data-action="override-submit" data-category="${esc(cat.category)}" style="min-height:44px">Save override</button>
      <button type="button" class="btn btn-ghost btn-sm" data-action="override-cancel" data-category="${esc(cat.category)}" style="min-height:44px">Cancel</button>
    </div>
  </div>`;
}

/** Normalize audit entries from stratification list or analyzer merged events */
export function flattenAuditForUi(input) {
  const chunks = [];
  if (Array.isArray(input?.audit_events) && input.audit_events.length) chunks.push(...input.audit_events);
  if (Array.isArray(input?.items) && input.items.length) chunks.push(...input.items);
  if (Array.isArray(input?.events) && input.events.length) chunks.push(...input.events);
  const raw = chunks.length ? chunks : (Array.isArray(input) ? input : []);
  return raw.map((it) => {
    if (it.created_at && it.category && it.trigger !== undefined) {
      return {
        category: it.category,
        previous_level: it.previous_level,
        new_level: it.new_level,
        trigger: it.trigger || 'change',
        occurred_at: it.created_at,
        source: 'risk_stratification_audit',
        summary: null,
      };
    }
    if (it.created_at && it.category) {
      return {
        category: it.category,
        previous_level: it.previous_level,
        new_level: it.new_level,
        trigger: it.trigger || 'change',
        occurred_at: it.created_at,
        source: 'risk_stratification_audit',
        summary: null,
      };
    }
    return {
      category: it.category || 'workspace event',
      previous_level: it.previous_level,
      new_level: it.new_level || '—',
      trigger: it.event_type || it.trigger || 'event',
      occurred_at: it.occurred_at || it.created_at,
      source: it.source || 'risk_analyzer',
      summary: it.payload_summary,
    };
  }).sort((a, b) => {
    const ta = new Date(a.occurred_at || 0).getTime();
    const tb = new Date(b.occurred_at || 0).getTime();
    return tb - ta;
  });
}

function _renderAudit(auditInput, demoMode) {
  const items = flattenAuditForUi(auditInput);
  if (!items.length) {
    return '<div style="font-size:12px;color:var(--text-tertiary);padding:10px">No risk audit entries recorded yet for this patient.</div>';
  }
  const rows = items.map((it) => {
    const when = it.occurred_at ? new Date(it.occurred_at).toLocaleString() : '—';
    const trig = esc(it.trigger || '—');
    const src = demoMode ? `${esc(it.source || '')} · demo sample` : esc(it.source || '');
    const sum = it.summary ? `<div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">${esc(it.summary)}</div>` : '';
    return `<li style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:12px">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
        <span><strong>${esc(_labelFor(it.category))}</strong>: ${esc(it.previous_level || '—')} → ${esc(it.new_level || '—')} <span style="color:var(--text-tertiary)">(${trig})</span></span>
        <span style="color:var(--text-tertiary);white-space:nowrap">${esc(when)}</span>
      </div>
      <div style="font-size:10px;color:var(--text-tertiary);margin-top:4px">Source: ${src}</div>
      ${sum}
    </li>`;
  }).join('');
  return `<ul style="list-style:none;margin:0;padding:0" aria-label="Risk audit trail">${rows}</ul>`;
}

function _stalenessBanner(ws) {
  const cats = ws?.safety_snapshot || [];
  const times = cats.map((c) => c.computed_at).filter(Boolean);
  let latest = null;
  for (const t of times) {
    const d = new Date(t);
    if (!Number.isNaN(d.getTime()) && (!latest || d > latest)) latest = d;
  }
  if (!latest) {
    return `<div role="status" style="padding:10px 12px;border-radius:10px;border:1px solid var(--border);background:rgba(255,255,255,.02);font-size:12px;color:var(--text-secondary);margin-bottom:12px">
      Stratification timestamps unavailable — treat outputs as needing verification against source charts.
    </div>`;
  }
  const ageH = (Date.now() - latest.getTime()) / 3600000;
  if (ageH <= 24) return '';
  return `<div role="status" style="padding:10px 12px;border-radius:10px;border:1px solid rgba(255,180,80,0.35);background:rgba(255,180,80,0.06);font-size:12px;color:var(--text-secondary);margin-bottom:12px">
    <strong>Stale stratification:</strong> last category computation ${latest.toLocaleString()} (${Math.round(ageH)}h ago). Recompute after chart updates; do not rely on older lights as an exhaustive safety screen.
  </div>`;
}

function _safetyReviewBanner(ws, demoMode) {
  const cats = ws?.safety_snapshot || [];
  const safety = cats.find((c) => c.category === 'safety');
  const level = String(safety?.level || '').toLowerCase();
  if (level !== 'red' && level !== 'amber') return '';

  const evidence = Array.isArray(ws?.assessment_evidence) ? ws.assessment_evidence : [];
  const phq = evidence.find((e) => e.kind === 'phq9_item9');
  const i9 = phq?.raw_value?.item_9 ?? phq?.value_display;

  return `<div role="alert" style="padding:12px 14px;border-radius:12px;border:1px solid rgba(255,107,107,0.45);background:rgba(255,107,107,0.08);margin-bottom:14px;font-size:12px;line-height:1.55;color:var(--text-secondary)">
    <div style="font-weight:700;color:var(--text-primary);margin-bottom:6px">Safety domain — requires clinician review</div>
    <p style="margin:0 0 8px">This workspace applies rule-based indices to chart-linked data. It does <strong>not</strong> perform emergency triage, determine suicide risk as a final diagnosis, or notify emergency services.</p>
    <p style="margin:0 0 8px">Follow your <strong>clinic safety protocol</strong> for self-harm / violence / safeguarding concerns. PHQ-9 item 9 and related fields are cues for face-to-face assessment — not standalone eligibility decisions.</p>
    ${phq ? `<p style="margin:0;font-size:11px;color:var(--text-tertiary)">Latest linked PHQ-9 item 9 field in extracts: ${esc(String(i9 ?? '—'))} (verify in Assessments / source record).</p>` : ''}
    ${demoMode ? '<p style="margin:8px 0 0;font-size:11px;color:var(--amber)">Demo sample — not a real patient safety determination.</p>' : ''}
  </div>`;
}

function _policyBanner(ws) {
  const prov = ws?.provenance?.sources;
  const asm = ws?.provenance?.assembler_version;
  const bits = [];
  if (Array.isArray(prov) && prov.length) bits.push(`Sources: ${prov.join(', ')}`);
  if (asm) bits.push(`Assembler: ${asm}`);
  if (!bits.length) return '';
  return `<div style="font-size:11px;color:var(--text-tertiary);margin-bottom:10px;line-height:1.45">${esc(bits.join(' · '))}</div>`;
}

function _renderPredictionSupport(cards, demoMode) {
  if (!Array.isArray(cards) || !cards.length) return '';
  const blocks = cards.map((card) => {
    const title = esc(card.title || card.analyzer_id || 'Index');
    const score = card.score != null ? esc(String(card.score)) : '—';
    const kind = esc(card.model?.kind || 'index');
    const note = (card.confidence && (card.confidence.calibration_note || card.confidence.level))
      ? esc(card.confidence.calibration_note || card.confidence.level)
      : '';
    return `<div style="padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:rgba(255,255,255,.02);margin-bottom:8px">
      <div style="font-weight:600;font-size:12px">${title} <span style="font-weight:400;color:var(--text-tertiary)">(${kind})</span></div>
      <div style="font-size:11px;color:var(--text-secondary);margin-top:4px">Score: ${score} — adjunctive index, not a diagnosis.</div>
      ${note ? `<div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">${note}</div>` : ''}
      ${demoMode ? '<div style="font-size:10px;color:var(--amber);margin-top:4px">Demo / offline session — verify against API when online.</div>' : ''}
    </div>`;
  }).join('');
  return `<div style="margin-top:16px">
    <h3 style="font-size:13px;font-weight:600;margin:0 0 8px;color:var(--text-primary)">AI-assisted / model indices (review required)</h3>
    <p style="font-size:11px;color:var(--text-tertiary);margin:0 0 10px;line-height:1.45">Short-horizon indices combine PROMs and operational signals. They do not replace structured assessment or crisis workflows.</p>
    ${blocks}
  </div>`;
}

function _renderRecommendedActions(actions, demoMode) {
  if (!Array.isArray(actions) || !actions.length) return '';
  const rows = actions.map((a) => {
    const d = esc(a.detail || '');
    const t = esc(a.title || '');
    const pri = esc(a.priority || '');
    return `<li style="margin-bottom:8px;font-size:12px;line-height:1.45"><span style="color:var(--text-tertiary);text-transform:uppercase;font-size:10px">${pri}</span> — <strong>${t}</strong><br/><span style="color:var(--text-secondary)">${d}</span></li>`;
  }).join('');
  return `<div style="margin-top:14px;padding:12px;border-radius:12px;border:1px solid var(--border);background:var(--bg-card)">
    <h3 style="font-size:13px;font-weight:600;margin:0 0 8px">Suggested review steps (rules — not orders)</h3>
    <p style="font-size:11px;color:var(--text-tertiary);margin:0 0 10px">Template prompts only. Your clinic policy governs escalation; this app does not dispatch notifications unless your organization wires that workflow.</p>
    <ul style="margin:0;padding-left:18px;color:var(--text-secondary)">${rows}</ul>
    ${demoMode ? '<p style="font-size:11px;color:var(--amber);margin:10px 0 0">Demo sample actions.</p>' : ''}
  </div>`;
}

function _renderLinkedToolbar(patientId) {
  const pid = encodeURIComponent(patientId);
  const links = [
    ['Patient profile', `window._selectedPatientId='${pid}';window._profilePatientId='${pid}';window._nav('patient-profile')`, 'Open patient chart summary'],
    ['Assessments', `window._selectedPatientId='${pid}';window._nav('assessments-hub')`, 'Open assessments hub'],
    ['Documents', `window._selectedPatientId='${pid}';window._nav('documents-hub')`, 'Documents hub'],
    ['Inbox', `window._nav('clinician-inbox')`, 'Clinician inbox'],
    ['Schedule', `window._nav('scheduling-hub')`, 'Scheduling hub'],
    ['Live session', `window._selectedPatientId='${pid}';window._nav('live-session')`, 'Virtual care / live session'],
    ['DeepTwin', `window._selectedPatientId='${pid}';window._profilePatientId='${pid}';window._nav('deeptwin')`, 'DeepTwin workspace'],
    ['Biomarkers', `window._nav('biomarkers')`, 'Biomarker maps'],
    ['qEEG', `window._selectedPatientId='${pid}';window._nav('qeeg-analysis')`, 'qEEG analysis'],
    ['MRI', `window._selectedPatientId='${pid}';window._nav('mri-analysis')`, 'MRI analysis'],
    ['Video', `window._selectedPatientId='${pid}';window._nav('video-assessments')`, 'Video assessments'],
    ['Voice', `window._selectedPatientId='${pid}';window._nav('voice-analyzer')`, 'Voice analyzer'],
    ['Text / notes', `window._selectedPatientId='${pid}';window._nav('text-analyzer')`, 'Text analyzer'],
    ['Protocol Studio', `window._nav('protocol-studio')`, 'Protocol Studio'],
  ];
  const btns = links.map(([label, cmd, title]) =>
    `<button type="button" class="btn btn-ghost btn-sm" style="min-height:40px;white-space:nowrap" title="${esc(title)}" onclick="(function(){try{${cmd}}catch(e){console.error(e)}})()">${esc(label)}</button>`).join('');
  return `<div style="margin:14px 0;padding:12px;border-radius:12px;border:1px solid var(--border);background:rgba(255,255,255,.02)">
    <div style="font-size:12px;font-weight:600;margin-bottom:8px;color:var(--text-primary)">Linked workflows</div>
    <div style="display:flex;flex-wrap:wrap;gap:8px">${btns}</div>
    <p style="font-size:10px;color:var(--text-tertiary);margin:10px 0 0;line-height:1.4">Opens Studio modules with the selected patient where supported. Some modules need chart context configured separately.</p>
  </div>`;
}

function _renderPatientDetail(workspace, auditBundle, demoMode, patientId) {
  const ws = normalizeRiskWorkspace(workspace) || {};
  const cats = Array.isArray(ws.safety_snapshot) ? ws.safety_snapshot : [];
  const ordered = CATEGORY_ORDER.map((id) => cats.find((c) => c.category === id)).filter(Boolean);
  const rest = cats.filter((c) => !CATEGORY_ORDER.includes(c.category));
  const all = [...ordered, ...rest];
  const grid = all.map((c) => _renderCategoryCard(c, demoMode)).join('');

  const genAt = ws.generated_at ? new Date(ws.generated_at).toLocaleString() : null;
  const stale = _stalenessBanner(ws);
  const safety = _safetyReviewBanner(ws, demoMode);
  const policy = _policyBanner(ws);
  const predict = _renderPredictionSupport(ws.prediction_support, demoMode);
  const actions = _renderRecommendedActions(ws.recommended_actions, demoMode);
  const toolbar = _renderLinkedToolbar(patientId);

  const headerTime = genAt ? `Workspace generated ${genAt}` : '';

  return `${toolbar}
    ${policy}
    ${stale}
    ${safety}
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin:12px 0 14px;flex-wrap:wrap">
      <div>
        <div style="font-size:12px;color:var(--text-tertiary)">${esc(headerTime)}</div>
        <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">Operational traffic lights are rule-based stratification outputs — not diagnoses. Green does not guarantee absence of risk when data are missing or stale.</div>
      </div>
      <button type="button" class="btn btn-ghost btn-sm" data-action="recompute" style="min-height:44px" aria-label="Recompute risk stratification">Recompute stratification</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px">${grid}</div>
    ${predict}
    ${actions}
    <div style="margin-top:18px;background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px">
      <h2 style="font-size:14px;font-weight:600;margin:0 0 8px;color:var(--text-primary)">Audit trail</h2>
      <p style="font-size:11px;color:var(--text-tertiary);margin:0 0 10px;line-height:1.45">Overrides and recomputes are persisted when signed in with clinician privileges and a reachable API.</p>
      ${_renderAudit(auditBundle, demoMode)}
    </div>`;
}

/** Match FastAPI `require_minimum_role(..., "clinician")` on risk endpoints (technician ≥ clinician in ROLE_ORDER). */
const CLINICAL_RISK_ROLES = new Set(['clinician', 'admin', 'clinic-admin', 'supervisor', 'reviewer', 'technician']);

export async function pgRiskAnalyzer(setTopbar, navigate) {
  try {
    setTopbar({
      title: 'Risk Analyzer',
      subtitle: 'Clinician risk review • decision-support only',
    });
  } catch {
    try { setTopbar('Risk Analyzer', 'Risk stratification'); } catch {}
  }

  const el = document.getElementById('content');
  if (!el) return;

  const role = currentUser?.role || 'guest';
  if (!CLINICAL_RISK_ROLES.has(role)) {
    el.innerHTML = `
      <div class="auth-required-notice" style="max-width:520px;margin:48px auto;padding:24px">
        <div class="auth-required-icon" aria-hidden="true">🛡️</div>
        <div class="auth-required-text" style="line-height:1.5">
          The Risk Analyzer is restricted to clinical staff. It surfaces sensitive risk stratification and audit data intended for licensed clinician review — not patient self-service.
        </div>
        <button type="button" class="btn btn-primary" onclick="window._nav('dashboard')">Back to clinic home</button>
      </div>`;
    return;
  }

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
        Outputs are rule-based / model-assisted indices linked to chart data where available. They are not diagnoses, emergency determinations, prescriptions, or autonomous safeguarding actions. Clinician review is required before operational decisions.
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
      bc.innerHTML = `<span style="font-weight:600">Clinic risk summary</span>
        <button type="button" class="btn btn-ghost btn-sm" id="ra-select-patient" style="margin-left:8px;min-height:44px" title="Choose patient from roster">Select patient…</button>`;
      $('ra-select-patient')?.addEventListener('click', () => {
        try { navigate?.('patients-v2'); } catch {}
      });
    } else {
      bc.innerHTML = `<button type="button" class="btn btn-ghost btn-sm" id="ra-back" style="min-height:44px" aria-label="Back to clinic summary">← Back to clinic</button>
        <span style="color:var(--text-tertiary)">/</span>
        <span style="font-weight:600">${esc(activePatientName || 'Patient')}</span>`;
      $('ra-back')?.addEventListener('click', () => { view = 'clinic'; render(); });
    }
  }

  async function loadClinic() {
    const body = $('ra-body');
    if (!body) return;
    body.innerHTML = `<div style="padding:18px;background:var(--bg-card);border:1px solid var(--border);border-radius:14px" aria-busy="true">
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
    wireRowClicks();
    wireSortHeaders();
  }

  function wireSortHeaders() {
    const bodyEl = $('ra-body');
    bodyEl?.querySelectorAll('[data-sort-key]').forEach((th) => {
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => {
        sortKey = th.getAttribute('data-sort-key');
        bodyEl.innerHTML = _renderClinicTable(summaryCache, sortKey);
        wireRowClicks();
        wireSortHeaders();
      });
    });
  }

  function wireRowClicks() {
    const bodyEl = $('ra-body');
    bodyEl?.querySelectorAll('tr[data-patient-id]').forEach((tr) => {
      const pid = tr.getAttribute('data-patient-id');
      const open = () => {
        activePatientId = pid;
        const p = (summaryCache?.patients || []).find((x) => x.patient_id === pid);
        activePatientName = p?.patient_name || 'Patient';
        try {
          sessionStorage.setItem('ds_pat_selected_id', pid);
        } catch {}
        window._selectedPatientId = pid;
        window._profilePatientId = pid;
        view = 'patient';
        render();
      };
      tr.addEventListener('click', open);
      tr.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); }
      });
    });
  }

  function demoWorkspaceFor(pid) {
    const profile = ANALYZER_DEMO_FIXTURES.risk.patient_profile(pid);
    const audit = ANALYZER_DEMO_FIXTURES.risk.patient_audit(pid);
    return {
      workspace: normalizeRiskWorkspace({
        ...profile,
        patient_display_name: profile.patient_name ? `${profile.patient_name} (demo sample)` : 'Demo sample patient',
        safety_snapshot: profile.categories,
        generated_at: profile.computed_at,
        prediction_support: [],
        recommended_actions: [],
        assessment_evidence: [],
        provenance: { sources: ['demo_sample'], assembler_version: 'demo_fixture' },
      }),
      auditBundle: audit,
    };
  }

  async function loadPatient() {
    const body = $('ra-body');
    if (!body || !activePatientId) return;
    body.innerHTML = `<div style="padding:18px;background:var(--bg-card);border:1px solid var(--border);border-radius:14px" aria-busy="true">
      ${_skeletonChips(8)}
    </div>`;

    const demoMode = isDemoSession();

    try {
      let workspace = null;
      let auditBundle = { items: [], audit_events: [] };

      try {
        workspace = await api.getRiskAnalyzerPage(activePatientId);
        if (workspace?.error === 'patient_not_found') {
          throw new Error('Patient not found');
        }
        workspace = normalizeRiskWorkspace(workspace);
        // Server merges stratification + analyzer audits into audit_events — do not double-fetch getRiskAudit.
        auditBundle = {
          audit_events: workspace.audit_events || [],
          items: [],
        };
      } catch (primaryErr) {
        const strat = await api.getPatientRiskProfile(activePatientId).catch(() => null);
        if (strat && Array.isArray(strat.categories)) {
          workspace = normalizeRiskWorkspace({
            patient_id: activePatientId,
            generated_at: strat.computed_at,
            safety_snapshot: strat.categories,
            prediction_support: [],
            recommended_actions: [],
            assessment_evidence: [],
            provenance: { sources: ['risk_stratification'], assembler_version: 'legacy_profile_fallback' },
          });
          auditBundle = await api.getRiskAudit(activePatientId).catch(() => ({ items: [] }));
        } else {
          throw primaryErr;
        }
      }

      const snapEmpty = !workspace?.safety_snapshot?.length;
      if ((snapEmpty || !workspace) && demoMode) {
        const d = demoWorkspaceFor(activePatientId);
        workspace = d.workspace;
        auditBundle = d.auditBundle;
        usingFixtures = true;
      } else {
        usingFixtures = false;
      }

      _syncDemoBanner();

      const displayName = workspace?.patient_display_name
        || activePatientName
        || workspace?.patient_id
        || 'Patient';
      activePatientName = displayName;

      body.innerHTML = _renderPatientDetail(workspace, auditBundle, demoMode || usingFixtures, activePatientId);
      wirePatientDetail(workspace, demoMode || usingFixtures);
    } catch (e) {
      if (demoMode) {
        const d = demoWorkspaceFor(activePatientId);
        usingFixtures = true;
        _syncDemoBanner();
        activePatientName = d.workspace?.patient_display_name || activePatientName;
        body.innerHTML = _renderPatientDetail(d.workspace, d.auditBundle, true, activePatientId);
        wirePatientDetail(d.workspace, true);
        return;
      }
      const msg = (e && e.message) || String(e);
      body.innerHTML = _errorCard(msg);
      body.querySelector('[data-action="retry"]')?.addEventListener('click', loadPatient);
    }
  }

  function wirePatientDetail(workspace, demoMode) {
    const body = $('ra-body');
    if (!body) return;

    body.querySelector('[data-action="recompute"]')?.addEventListener('click', async (ev) => {
      const btn = ev.currentTarget;
      const old = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Recomputing…';
      try {
        if (demoMode) {
          body.insertAdjacentHTML('afterbegin', `<div role="status" style="margin-bottom:12px;padding:10px 12px;border-radius:10px;border:1px solid var(--amber);background:rgba(255,180,80,0.08);font-size:12px">
            Recompute is demo-only offline — sign in to the API for persisted stratification.
          </div>`);
          await loadPatient();
          return;
        }
        await api.recomputeRiskAnalyzer(activePatientId, {});
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
        const meta = (workspace?.safety_snapshot || []).find((c) => c.category === cat) || { category: cat };
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
            if (demoMode) {
              form.insertAdjacentHTML('beforeend', `<div style="margin-top:8px;color:var(--amber);font-size:11px">Override is not persisted in offline demo — use a signed-in clinician session with the API.</div>`);
              submit.disabled = false;
              submit.textContent = 'Save override';
              return;
            }
            await api.overrideRiskAnalyzerCategory(activePatientId, {
              category: cat,
              level,
              reason,
            });
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
