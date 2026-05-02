/**
 * Digital Phenotyping Analyzer — passive smartphone/wearable behavioral signals.
 *
 * Wraps GET /api/v1/digital-phenotyping/analyzer/patient/{patient_id}
 * and related consent / audit / recompute endpoints.
 *
 * Decision-support only — passive data do not diagnose; clinical correlation required.
 */

import { api } from './api.js';
import { isDemoSession } from './demo-session.js';
import { EVIDENCE_TOTAL_PAPERS } from './evidence-dataset.js';
import {
  DEMO_FIXTURE_BANNER_HTML,
  demoDigitalPhenotypingPayload,
} from './demo-fixtures-analyzers.js';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _fmtEvidenceK(n) {
  const x = Number(n) || 0;
  return x >= 1000 ? `${(x / 1000).toFixed(1).replace(/\.0$/, '')}K` : String(x);
}

/** Resolve patient id from global clinical context (same pattern as qEEG / roster). */
function _effectivePatientIdFromContext() {
  try {
    return String(
      window._dpaPatientId
        || window._selectedPatientId
        || window._profilePatientId
        || window._currentPatientId
        || window._qeegPatientId
        || window._clinicalPatientId
        || '',
    ).trim();
  } catch {
    return '';
  }
}

const SNAPSHOT_META = {
  mobility_stability: { title: 'Mobility stability', unit: 'index', hint: 'Higher = more stable mobility patterns vs baseline.' },
  routine_regularity: { title: 'Routine regularity', unit: 'index', hint: 'Day-to-day schedule consistency (proxy).' },
  screen_time_pattern: { title: 'Screen-time pattern', unit: '× baseline', hint: '1.0 = personal baseline; &gt;1 more screen use than baseline.' },
  sleep_timing_proxy: { title: 'Sleep timing proxy', unit: 'index', hint: 'Timing consistency from device proxies — not PSG.' },
  sociability_proxy: { title: 'Sociability proxy', unit: 'index', hint: 'Metadata-only communication patterns when consented.' },
  activity_level: { title: 'Activity level', unit: 'index', hint: 'Steps / motion-derived activity vs baseline.' },
  anomaly_score: { title: 'Anomaly score', unit: 'index', hint: 'Combined deviation signal — lower burden ≠ lower clinical concern alone.' },
  data_completeness: { title: 'Data completeness', unit: '% window', hint: 'Fraction of expected passive samples present — affects confidence.' },
};

function _formatSnapshotValue(key, m) {
  if (!m || m.value == null || Number.isNaN(Number(m.value))) return '—';
  const v = Number(m.value);
  if (key === 'data_completeness') return `${Math.round(v * 100)}%`;
  if (key === 'screen_time_pattern') return `${v.toFixed(2)}×`;
  return v.toFixed(2);
}

function _snapshotCards(snapshot) {
  const keys = Object.keys(SNAPSHOT_META);
  return keys.map((key) => {
    const meta = SNAPSHOT_META[key];
    const m = snapshot?.[key];
    const v = _formatSnapshotValue(key, m);
    const conf = m?.confidence != null ? `${Math.round(m.confidence * 100)}% confidence` : '';
    const comp = m?.completeness != null ? `${Math.round(m.completeness * 100)}% data` : '';
    const cmp = m?.baseline_comparison ? String(m.baseline_comparison) : '';
    const sens = m?.privacy_sensitivity_level ? `${m.privacy_sensitivity_level} sensitivity` : '';
    const sub = [cmp, conf, comp].filter(Boolean).join(' · ');
    return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:12px 14px" title="${esc(meta.hint)}">
      <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:4px">${esc(meta.title)}</div>
      <div style="font-weight:700;font-size:18px">${esc(v)} <span style="font-size:11px;font-weight:500;color:var(--text-tertiary)">${esc(meta.unit)}</span></div>
      <div style="font-size:11px;color:var(--text-secondary);margin-top:6px">${esc(sub)}${sens ? ` · ${esc(sens)}` : ''}</div>
    </div>`;
  }).join('');
}

function _domainsPanel(domains, consentState) {
  const enabled = consentState?.domains_enabled || {};
  const list = Array.isArray(domains) ? domains : [];
  return list.map((d) => {
    const domainKey = d.signal_domain;
    const consentOk = enabled[domainKey] !== false;
    const stats = d.summary_stats && typeof d.summary_stats === 'object'
      ? Object.entries(d.summary_stats).map(([k, v]) => `${k}: ${typeof v === 'number' ? v : JSON.stringify(v)}`).join('; ')
      : '';
    const muted = !consentOk ? 'opacity:0.55' : '';
    const badge = !consentOk
      ? '<span class="pill pill-inactive" style="margin-left:8px;font-size:10px">Not consented</span>'
      : '';
    return `<div style="border-bottom:1px solid var(--border);padding:12px 0;${muted}">
      <div style="font-weight:600;display:flex;align-items:center;flex-wrap:wrap">${esc(domainKey)}${badge}</div>
      ${consentOk ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:4px">
        Modalities: ${esc((d.collection_modalities || []).join(', '))} · Source: ${esc((d.source_types || []).join(', '))}
      </div>
      <div style="font-size:12px;margin-top:6px">${esc(stats)}</div>
      <div style="font-size:11px;color:var(--text-tertiary);margin-top:6px">Completeness: ${esc(d.completeness != null ? `${Math.round(d.completeness * 100)}%` : '—')}</div>`
        : '<div style="font-size:12px;color:var(--text-tertiary);margin-top:6px">Patient consent does not include this domain — metrics are withheld.</div>'}
    </div>`;
  }).join('');
}

function _flagsPanel(flags) {
  const list = Array.isArray(flags) ? flags : [];
  if (!list.length) {
    return '<div style="font-size:12px;color:var(--text-tertiary)">No behavioral indicator flags in this window.</div>';
  }
  return list.map((f) => `<div style="background:rgba(155,127,255,0.06);border:1px solid rgba(155,127,255,0.22);border-radius:12px;padding:12px;margin-bottom:10px">
    <div style="font-weight:600">${esc(f.label)}</div>
    <div style="font-size:12px;color:var(--text-secondary);margin-top:6px">${esc(f.detail)}</div>
    <div style="font-size:11px;color:var(--text-tertiary);margin-top:8px">${esc(f.statement_type || '')} · severity ${esc(f.severity)} · confidence ${f.confidence != null ? Math.round(f.confidence * 100) + '%' : '—'}</div>
    ${Array.isArray(f.caveats) && f.caveats.length ? `<ul style="margin:8px 0 0 18px;font-size:11px;color:var(--text-secondary)">${f.caveats.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
  </div>`).join('');
}

function _recommendationsPanel(recs) {
  const list = Array.isArray(recs) ? recs : [];
  if (!list.length) {
    return '<div style="font-size:12px;color:var(--text-tertiary)">No system suggestions for this window.</div>';
  }
  return list.map((r) => {
    const targets = Array.isArray(r.targets) ? r.targets : [];
    const btns = targets.map((tid) =>
      `<button type="button" class="btn btn-ghost btn-sm" data-nav-page="${esc(tid)}" style="margin:4px 8px 0 0;min-height:40px">${esc(tid)}</button>`,
    ).join('');
    return `<div style="border-bottom:1px solid var(--border);padding:12px 0">
      <div style="font-weight:600">${esc(r.title)} <span style="font-size:11px;color:var(--text-tertiary)">${esc(r.priority || '')}</span></div>
      <div style="font-size:12px;color:var(--text-secondary);margin-top:6px">${esc(r.detail)}</div>
      ${btns ? `<div style="margin-top:10px">${btns}</div>` : ''}
    </div>`;
  }).join('');
}

function _linksHtml(links) {
  const list = Array.isArray(links) ? links : [];
  return list.map((l) => {
    const pid = l.nav_page_id;
    const extra = pid === 'research-evidence'
      ? ' data-dpa-evidence="search:digital phenotyping passive sensing"'
      : '';
    return `<div style="margin-bottom:10px">
      <button type="button" class="btn btn-ghost btn-sm" data-nav-page="${esc(pid)}"${extra} style="min-height:44px">
        ${esc(l.title)} →
      </button>
      <span style="font-size:11px;color:var(--text-tertiary);margin-left:8px">${esc(l.relevance_note || '')}</span>
    </div>`;
  }).join('');
}

function _consentPanel(consent) {
  if (!consent) return '';
  const dom = consent.domains_enabled || {};
  const rows = Object.entries(dom).map(([k, v]) => `<li><strong>${esc(k)}</strong>: ${v ? 'enabled' : 'off'}</li>`).join('');
  return `<div style="font-size:12px;line-height:1.5">
    <div style="margin-bottom:8px">Consent scope <strong>${esc(consent.consent_scope_version)}</strong> · updated ${esc(consent.updated_at)}</div>
    <div style="margin-bottom:8px">${esc(consent.visibility_note || '')}</div>
    <div>Retention (summary): ${esc(String(consent.retention_summary_days || '—'))} days</div>
    <ul style="margin:8px 0 0 18px">${rows}</ul>
  </div>`;
}

function _consentEditor(consent) {
  const dom = consent?.domains_enabled || {};
  const keys = Object.keys(dom);
  if (!keys.length) return '';
  const checks = keys.map((k) => `<label style="display:flex;align-items:center;gap:8px;font-size:12px;margin:6px 0;cursor:pointer">
    <input type="checkbox" data-dpa-domain="${esc(k)}" ${dom[k] ? 'checked' : ''} />
    <span>${esc(k)}</span>
  </label>`).join('');
  return `<div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border)">
    <div style="font-size:12px;font-weight:600;margin-bottom:6px">Update consent (clinic)</div>
    <p style="font-size:11px;color:var(--text-tertiary);margin:0 0 8px;line-height:1.4">Toggles are stored on the server and drive which domains appear below. Use your org’s consent workflow; this is a technical control only.</p>
    ${checks}
    <button type="button" class="btn btn-sm btn-primary" id="dpa-save-consent" style="margin-top:10px;min-height:40px">Save consent</button>
    <div id="dpa-consent-status" style="font-size:11px;margin-top:8px;color:var(--text-tertiary)"></div>
  </div>`;
}

function _auditPanel(events) {
  const list = Array.isArray(events) ? events : [];
  if (!list.length) return '<div style="font-size:12px;color:var(--text-tertiary)">No audit entries.</div>';
  return `<ul style="list-style:none;margin:0;padding:0;font-size:12px">${list.map((e) => `<li style="padding:6px 0;border-bottom:1px solid var(--border)">
    <span style="color:var(--text-tertiary)">${esc(e.timestamp)}</span> · ${esc(e.action)} — ${esc(e.summary || '')}
  </li>`).join('')}</ul>`;
}

function _observationsTable(rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) {
    return '<div style="font-size:12px;color:var(--text-tertiary)">No rows yet — add an EMA check-in or a device note below.</div>';
  }
  return `<table style="width:100%;font-size:11px;border-collapse:collapse">
    <thead><tr style="text-align:left;color:var(--text-tertiary)"><th style="padding:4px 6px">When</th><th style="padding:4px 6px">Source</th><th style="padding:4px 6px">Kind</th><th style="padding:4px 6px">Summary</th></tr></thead>
    <tbody>${list.slice(0, 12).map((o) => {
    const p = o.payload || {};
    const sum = [p.mood_0_10 != null ? `mood ${p.mood_0_10}` : '', p.anxiety_0_10 != null ? `anx ${p.anxiety_0_10}` : '', p.sleep_hours != null ? `sleep ${p.sleep_hours}h` : '', p.notes || p.note].filter(Boolean).join(' · ');
    return `<tr style="border-top:1px solid var(--border)"><td style="padding:6px;white-space:nowrap">${esc(String(o.recorded_at || '').slice(0, 16))}</td><td style="padding:6px">${esc(o.source)}</td><td style="padding:6px">${esc(o.kind)}</td><td style="padding:6px">${esc(sum || '—')}</td></tr>`;
  }).join('')}
    </tbody></table>`;
}

function _localDatetimeInputValue() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function _dataIntakePanel(data) {
  const prov = data.provenance || {};
  const manualN = prov.mvp_manual_observations_14d;
  const devN = prov.mvp_device_observations_14d;
  const localNow = _localDatetimeInputValue();
  return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:14px;margin-bottom:22px">
    <div style="font-weight:600;margin-bottom:6px">Data intake (MVP)</div>
    <p style="font-size:12px;color:var(--text-secondary);margin:0 0 12px;line-height:1.45">
      Passive phone streams are not ingested yet. Add <strong>patient-reported check-ins</strong> here and link <strong>wearables</strong> under Biometrics (device sync).
      Last 14 days: <strong>${esc(String(manualN ?? 0))}</strong> manual · <strong>${esc(String(devN ?? 0))}</strong> device notes.
      Total stored rows: <strong>${esc(String(data.mvp_observations_total ?? 0))}</strong>.
    </p>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;margin-bottom:12px">
      <label style="font-size:11px;display:flex;flex-direction:column;gap:4px">Recorded at (local)
        <input type="datetime-local" id="dpa-m-obs-time" class="form-control" value="${esc(localNow)}" />
      </label>
      <label style="font-size:11px;display:flex;flex-direction:column;gap:4px">Mood (0–10)
        <input type="number" id="dpa-m-mood" class="form-control" min="0" max="10" step="0.1" placeholder="optional" />
      </label>
      <label style="font-size:11px;display:flex;flex-direction:column;gap:4px">Anxiety (0–10)
        <input type="number" id="dpa-m-anx" class="form-control" min="0" max="10" step="0.1" placeholder="optional" />
      </label>
      <label style="font-size:11px;display:flex;flex-direction:column;gap:4px">Sleep (hours)
        <input type="number" id="dpa-m-sleep" class="form-control" min="0" max="24" step="0.25" placeholder="optional" />
      </label>
    </div>
    <label style="font-size:11px;display:block;margin-bottom:10px">Notes
      <textarea id="dpa-m-notes" class="form-control" rows="2" placeholder="Optional context"></textarea>
    </label>
    <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:14px">
      <button type="button" class="btn btn-primary btn-sm" id="dpa-save-manual-obs" style="min-height:40px">Save EMA check-in</button>
      <button type="button" class="btn btn-ghost btn-sm" id="dpa-log-device-note" style="min-height:40px">Log device sync note</button>
      <button type="button" class="btn btn-ghost btn-sm" data-nav-page="wearables" style="min-height:40px">Open Biometrics / sync</button>
      <span id="dpa-data-status" style="font-size:11px;color:var(--text-tertiary)"></span>
    </div>
    <div style="font-weight:600;font-size:12px;margin-bottom:6px">Recent observations</div>
    ${_observationsTable(data.mvp_observations)}
  </div>`;
}

function renderAnalyzerHtml(data, auditEvents) {
  const disclaimer = data.clinical_disclaimer || '';
  const auditList = Array.isArray(auditEvents) ? auditEvents : (data.audit_events || []);
  const pname = data.patient_display_name || '';
  const pid = data.patient_id || '';

  return `
    <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:16px;padding:14px 16px;background:var(--bg-card);border:1px solid var(--border);border-radius:14px">
      <div>
        <div style="font-weight:700;font-size:16px">${esc(pname || 'Patient')}</div>
        <div style="font-size:12px;color:var(--text-tertiary);margin-top:4px">ID <code style="font-size:11px">${esc(pid)}</code></div>
      </div>
      <div style="font-size:11px;color:var(--text-tertiary);text-align:right">Analysis window (UTC)<br/>
        <strong style="color:var(--text-secondary)">${esc(data.analysis_window?.start)} → ${esc(data.analysis_window?.end)}</strong>
      </div>
    </div>
    ${disclaimer ? `<div class="notice notice-info" style="margin-bottom:14px;font-size:12px;line-height:1.45">${esc(disclaimer)}</div>` : ''}
    <div style="font-size:12px;color:var(--text-tertiary);margin-bottom:12px">Generated ${esc(data.generated_at)}</div>
    <h3 style="font-size:14px;margin:0 0 10px">Behavioral snapshot</h3>
    <p style="font-size:12px;color:var(--text-secondary);margin:-4px 0 12px;line-height:1.45">Indices are unitless model summaries (not raw hours). Hover a card for a short definition.</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:10px;margin-bottom:22px">
      ${_snapshotCards(data.snapshot)}
    </div>
    <h3 style="font-size:14px;margin:0 0 10px">Signal domains</h3>
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:12px 16px;margin-bottom:22px">
      ${_domainsPanel(data.domains, data.consent_state)}
    </div>
    ${_dataIntakePanel(data)}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:22px">
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:14px">
        <div style="font-weight:600;margin-bottom:8px">Baseline &amp; deviation</div>
        <div style="font-size:12px;color:var(--text-secondary);line-height:1.5">
          Method: ${esc(data.baseline_profile?.method)} · confidence ${data.baseline_profile?.confidence != null ? Math.round(data.baseline_profile.confidence * 100) + '%' : '—'}<br/>
          Weekday/weekend deltas (screen hours / steps): ${esc(data.baseline_profile?.weekday_weekend_delta?.screen_hours)} / ${esc(data.baseline_profile?.weekday_weekend_delta?.steps)}
        </div>
        <div style="margin-top:10px;font-size:12px;font-weight:600">Recent deviations</div>
        <ul style="margin:8px 0 0 18px;font-size:12px;color:var(--text-secondary)">
          ${(data.deviations || []).map((d) => `<li>${esc(d.summary)} (${esc(d.signal_domain)})</li>`).join('') || '<li>None flagged</li>'}
        </ul>
      </div>
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:14px">
        <div style="font-weight:600;margin-bottom:8px">Clinical meaning (decision-support)</div>
        ${_flagsPanel(data.clinical_flags)}
      </div>
    </div>
    <h3 style="font-size:14px;margin:0 0 10px">Suggested next steps</h3>
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:12px 16px;margin-bottom:22px;font-size:12px">
      ${_recommendationsPanel(data.recommendations)}
    </div>
    <h3 style="font-size:14px;margin:0 0 10px">Multimodal connections</h3>
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:14px;margin-bottom:22px;font-size:12px">
      ${_linksHtml(data.multimodal_links)}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:14px">
        <div style="font-weight:600;margin-bottom:8px">Consent &amp; governance</div>
        ${_consentPanel(data.consent_state)}
        ${_consentEditor(data.consent_state)}
      </div>
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:14px">
        <div style="font-weight:600;margin-bottom:8px">Audit</div>
        ${_auditPanel(auditList)}
      </div>
    </div>
    <div style="margin-top:18px;font-size:11px;color:var(--text-tertiary)">Pipeline: ${esc(data.provenance?.feature_pipeline_version)} · schema ${esc(data.schema_version)} · sources: ${esc((data.provenance?.data_sources || []).join(', ') || 'stub')}</div>
  `;
}

export async function pgDigitalPhenotypingAnalyzer(setTopbar, navigate) {
  try {
    setTopbar({
      title: 'Digital Phenotyping Analyzer',
      subtitle: 'Passive behavior signals · baseline & change · multimodal context',
    });
  } catch {
    try { setTopbar('Digital Phenotyping Analyzer', 'Passive sensing'); } catch {}
  }

  const el = document.getElementById('content');
  if (!el) return;

  const initialPid = _effectivePatientIdFromContext();

  el.innerHTML = `
    <div class="ds-dpa-shell" style="max-width:1100px;margin:0 auto;padding:16px 20px 48px">
      <div id="dpa-demo-banner"></div>
      <div style="padding:12px 14px;border-radius:12px;border:1px solid rgba(155,127,255,0.28);background:rgba(155,127,255,0.06);margin-bottom:14px;font-size:12px;line-height:1.45;color:var(--text-secondary)">
        <strong style="color:var(--text-primary)">Clinical decision-support.</strong>
        Smartphone-derived metrics are <strong>behavioral indicators</strong>, not diagnoses.
        Screen time and location are reviewed here as <strong>digital phenotype domains</strong> (not separate analyzers).
        Correlate with interview, assessments, and other modalities.
      </div>
      <div style="padding:12px 14px;border-radius:12px;border:1px solid rgba(59,130,246,0.25);background:rgba(59,130,246,0.06);margin-bottom:18px;font-size:12px;line-height:1.45;color:var(--text-secondary)">
        <strong style="color:var(--text-primary)">Privacy &amp; consent.</strong>
        Only streams enabled in the patient consent profile are collected; access is role-governed and audited.
        High-sensitivity domains (e.g. location, communication metadata) require explicit scope.
      </div>
      <div style="margin-bottom:14px;display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end">
        <label style="font-size:12px;display:flex;flex-direction:column;gap:4px">Patient ID
          <input id="dpa-patient-id" class="form-control" style="min-width:280px" placeholder="UUID — prefilled from roster when available" value="${esc(initialPid)}" autocomplete="off" />
        </label>
        <button type="button" class="btn btn-primary" id="dpa-load">Load analyzer</button>
        <button type="button" class="btn btn-ghost btn-sm" id="dpa-recompute" style="min-height:44px" title="Trigger backend recomputation when ingest is connected">Refresh analysis</button>
      </div>
      <div id="dpa-research-strip" style="margin-bottom:18px;padding:14px 16px;border-radius:14px;border:1px solid rgba(45,212,191,0.28);background:rgba(45,212,191,0.06);font-size:12px;line-height:1.45;color:var(--text-secondary)">
        <div style="font-weight:600;color:var(--text-primary);margin-bottom:8px">Research &amp; multimodal studio</div>
        <p style="margin:0 0 12px;font-size:12px">
          For <strong>literature and protocols</strong>, use Research Evidence (<strong>${esc(_fmtEvidenceK(EVIDENCE_TOTAL_PAPERS))}</strong> curated papers).
          Analyzer metrics below remain <strong>stub until passive ingest</strong> ships — safe for workflow / consent / audit demos, not for outcome claims.
        </p>
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
          <span style="font-size:11px;color:var(--text-tertiary);margin-right:4px">Quick open:</span>
          <button type="button" class="btn btn-ghost btn-sm" data-dpa-quick="research-evidence|search|digital phenotyping passive sensing mobile health" style="min-height:40px">Evidence search</button>
          <button type="button" class="btn btn-ghost btn-sm" data-dpa-quick="research-evidence|aiml|machine learning digital biomarker relapse" style="min-height:40px">AI / ML tab</button>
          <button type="button" class="btn btn-ghost btn-sm" data-dpa-quick="qeeg-analysis||" style="min-height:40px">qEEG</button>
          <button type="button" class="btn btn-ghost btn-sm" data-dpa-quick="assessments-v2||" style="min-height:40px">Assessments</button>
          <button type="button" class="btn btn-ghost btn-sm" data-dpa-quick="wearables||" style="min-height:40px">Biometrics</button>
          <button type="button" class="btn btn-ghost btn-sm" data-dpa-quick="protocol-studio||" style="min-height:40px">Protocol Studio</button>
          <button type="button" class="btn btn-ghost btn-sm" data-dpa-quick="session-execution||" style="min-height:40px">Sessions</button>
          <button type="button" class="btn btn-ghost btn-sm" data-dpa-quick="live-session||" style="min-height:40px">Virtual Care</button>
          <button type="button" class="btn btn-ghost btn-sm" data-dpa-quick="deeptwin||" style="min-height:40px">DeepTwin</button>
          <button type="button" class="btn btn-ghost btn-sm" data-dpa-quick="ai-agent-v2||" style="min-height:40px">AI agents</button>
        </div>
      </div>
      <div id="dpa-body"></div>
    </div>`;

  const $ = (id) => document.getElementById(id);

  let usingFixtures = false;

  function _pidInput() {
    return $('dpa-patient-id')?.value?.trim() || '';
  }

  function _applyPatientContextForPage(page, patientId) {
    if (!patientId) return;
    try {
      if (page === 'qeeg-analysis') window._qeegPatientId = patientId;
      if (page === 'deeptwin') window._deeptwinPatientId = patientId;
    } catch { /* noop */ }
  }

  function _applyResearchEvidenceQuick(tab, query) {
    try {
      window._resEvidenceTab = tab || 'search';
      window._reSearch = window._reSearch || {};
      if (query) window._reSearch[tab || 'search'] = query;
    } catch { /* noop */ }
  }

  function _parseEvidenceAttr(attr) {
    if (!attr) return null;
    const idx = attr.indexOf(':');
    if (idx === -1) return { tab: 'search', q: attr.trim() };
    return { tab: attr.slice(0, idx).trim(), q: attr.slice(idx + 1).trim() };
  }

  /** Delegated handler for quick-link strip (outside #dpa-body). */
  function _onShellClick(ev) {
    const qbtn = ev.target?.closest?.('[data-dpa-quick]');
    if (qbtn) {
      const raw = qbtn.getAttribute('data-dpa-quick') || '';
      const parts = raw.split('|');
      const page = parts[0];
      const tab = parts[1] || '';
      const q = (parts[2] != null ? parts.slice(2).join('|') : '') || '';
      if (page === 'research-evidence' && (tab || q)) {
        _applyResearchEvidenceQuick(tab || 'search', q);
      }
      _applyPatientContextForPage(page, _pidInput());
      try { navigate?.(page); } catch {}
      return;
    }
  }

  const shell = el.querySelector('.ds-dpa-shell');
  shell?.addEventListener('click', _onShellClick);

  function _syncDemoBanner() {
    const slot = $('dpa-demo-banner');
    if (!slot) return;
    slot.innerHTML = usingFixtures && isDemoSession() ? DEMO_FIXTURE_BANNER_HTML : '';
  }

  function wireNav(body) {
    body.querySelectorAll('[data-nav-page]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const p = btn.getAttribute('data-nav-page');
        const evAttr = btn.getAttribute('data-dpa-evidence');
        if (evAttr) {
          const parsed = _parseEvidenceAttr(evAttr);
          if (parsed) _applyResearchEvidenceQuick(parsed.tab, parsed.q);
        }
        _applyPatientContextForPage(p, _pidInput());
        try { navigate?.(p); } catch {}
      });
    });
  }

  function wireDataIntake(body) {
    const manualBtn = body.querySelector('#dpa-save-manual-obs');
    const devBtn = body.querySelector('#dpa-log-device-note');
    const statusEl = body.querySelector('#dpa-data-status');

    async function postManual() {
      const pid = _pidInput();
      if (!pid) return;
      const recordedAt = body.querySelector('#dpa-m-obs-time')?.value;
      const mood = body.querySelector('#dpa-m-mood')?.value;
      const anx = body.querySelector('#dpa-m-anx')?.value;
      const sleep = body.querySelector('#dpa-m-sleep')?.value;
      const notes = body.querySelector('#dpa-m-notes')?.value?.trim();
      const payload = {
        kind: 'ema_checkin',
        recorded_at: recordedAt ? new Date(recordedAt).toISOString() : undefined,
        notes: notes || undefined,
        mood_0_10: mood !== '' && mood != null ? Number(mood) : undefined,
        anxiety_0_10: anx !== '' && anx != null ? Number(anx) : undefined,
        sleep_hours: sleep !== '' && sleep != null ? Number(sleep) : undefined,
      };
      if (statusEl) statusEl.textContent = 'Saving…';
      try {
        await api.addDigitalPhenotypingManualObservation(pid, payload);
        if (statusEl) statusEl.textContent = 'Saved.';
        await loadPayload();
      } catch (e) {
        if (statusEl) statusEl.textContent = (e && e.message) || 'Save failed.';
      }
    }

    async function postDeviceNote() {
      const pid = _pidInput();
      if (!pid) return;
      const notes = body.querySelector('#dpa-m-notes')?.value?.trim() || 'Wearable / device sync acknowledged';
      const recordedAt = body.querySelector('#dpa-m-obs-time')?.value;
      if (statusEl) statusEl.textContent = 'Logging…';
      try {
        await api.createDigitalPhenotypingObservation(pid, {
          source: 'device_sync',
          kind: 'wearables_sync_checkin',
          recorded_at: recordedAt ? new Date(recordedAt).toISOString() : undefined,
          payload: { note: notes },
        });
        if (statusEl) statusEl.textContent = 'Device note logged.';
        await loadPayload();
      } catch (e) {
        if (statusEl) statusEl.textContent = (e && e.message) || 'Log failed.';
      }
    }

    manualBtn?.addEventListener('click', () => { postManual(); });
    devBtn?.addEventListener('click', () => { postDeviceNote(); });
  }

  function wireConsentSave(body) {
    const btn = body.querySelector('#dpa-save-consent');
    if (!btn) return;
    const status = body.querySelector('#dpa-consent-status');
    const pid = $('dpa-patient-id')?.value?.trim();
    if (!pid) return;
    btn.addEventListener('click', async () => {
      const domains = {};
      body.querySelectorAll('input[data-dpa-domain]').forEach((el) => {
        const k = el.getAttribute('data-dpa-domain');
        if (k) domains[k] = el.checked;
      });
      btn.disabled = true;
      if (status) status.textContent = 'Saving…';
      try {
        await api.updateDigitalPhenotypingConsent(pid, {
          domains,
          consent_scope_version: '2026.04',
        });
        if (status) status.textContent = 'Saved. Refreshing view…';
        await loadPayload();
      } catch (e) {
        if (status) {
          status.textContent = (e && e.message) || 'Save failed (check session or use a real clinic account).';
        }
      } finally {
        btn.disabled = false;
      }
    });
  }

  async function loadPayload() {
    const body = $('dpa-body');
    if (!body) return;
    const pid = $('dpa-patient-id')?.value?.trim();
    if (!pid) {
      body.innerHTML = `<div class="notice notice-info" style="font-size:12px">Enter a patient id, or select a patient in the roster so their id appears above.</div>`;
      return;
    }
    try { window._dpaPatientId = pid; } catch {}

    body.innerHTML = `<div style="padding:24px;color:var(--text-tertiary)">Loading…</div>`;
    usingFixtures = false;

    let data = null;
    let auditEvents = [];

    try {
      data = await api.getDigitalPhenotypingAnalyzer(pid);
      const thin = !data || (!data.snapshot && !data.domains);
      if (thin && isDemoSession()) {
        data = demoDigitalPhenotypingPayload(pid);
        usingFixtures = true;
      }
      try {
        const a = await api.getDigitalPhenotypingAudit(pid);
        if (a && Array.isArray(a.events)) auditEvents = a.events;
        else auditEvents = data.audit_events || [];
      } catch {
        auditEvents = data.audit_events || [];
      }
    } catch (e) {
      const status = e && e.status;
      if (status === 404) {
        body.innerHTML = `<div class="notice notice-info" style="font-size:13px;line-height:1.5">
          <strong>Patient not found.</strong> Check the identifier, or open this analyzer from the patient chart after the patient is registered in your clinic.
        </div>`;
        return;
      }
      if (isDemoSession()) {
        data = demoDigitalPhenotypingPayload(pid);
        auditEvents = data.audit_events || [];
        usingFixtures = true;
      } else {
        const msg = (e && e.message) || String(e);
        body.innerHTML = `<div style="color:#f87171;padding:14px;border-radius:12px;background:rgba(248,113,113,.08);font-size:13px;line-height:1.45">
          <strong>Unable to load analyzer.</strong><br/>${esc(msg)}
          <div style="margin-top:10px;font-size:12px;color:var(--text-secondary)">If you recently changed clinic or role, refresh the page. For access issues, contact your administrator.</div>
        </div>`;
        return;
      }
    }

    _syncDemoBanner();
    body.innerHTML = renderAnalyzerHtml(data, auditEvents);
    wireNav(body);
    wireDataIntake(body);
    wireConsentSave(body);
  }

  $('dpa-load')?.addEventListener('click', () => { loadPayload(); });
  $('dpa-patient-id')?.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); loadPayload(); }
  });
  $('dpa-recompute')?.addEventListener('click', async () => {
    const pid = $('dpa-patient-id')?.value?.trim();
    if (!pid) return;
    try {
      await api.recomputeDigitalPhenotyping(pid);
    } catch { /* backend may not implement fully */ }
    await loadPayload();
  });

  if (initialPid) await loadPayload();
}
