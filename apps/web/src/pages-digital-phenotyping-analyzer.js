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

function _snapshotCards(snapshot) {
  const rows = [
    ['Mobility stability', snapshot?.mobility_stability],
    ['Routine regularity', snapshot?.routine_regularity],
    ['Screen-time pattern', snapshot?.screen_time_pattern],
    ['Sleep timing proxy', snapshot?.sleep_timing_proxy],
    ['Sociability proxy', snapshot?.sociability_proxy],
    ['Activity level', snapshot?.activity_level],
    ['Anomaly score', snapshot?.anomaly_score],
    ['Data completeness', snapshot?.data_completeness],
  ];
  return rows.map(([label, m]) => {
    const v = m?.value != null ? Number(m.value).toFixed(2) : '—';
    const conf = m?.confidence != null ? `${Math.round(m.confidence * 100)}% conf.` : '';
    const cmp = m?.baseline_comparison ? String(m.baseline_comparison) : '';
    const sens = m?.privacy_sensitivity_level ? ` · ${m.privacy_sensitivity_level} sensitivity` : '';
    return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:12px 14px">
      <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:4px">${esc(label)}</div>
      <div style="font-weight:700;font-size:18px">${esc(v)}</div>
      <div style="font-size:11px;color:var(--text-secondary);margin-top:6px">${esc([cmp, conf].filter(Boolean).join(' · '))}${esc(sens)}</div>
    </div>`;
  }).join('');
}

function _domainsPanel(domains) {
  const list = Array.isArray(domains) ? domains : [];
  return list.map((d) => {
    const stats = d.summary_stats && typeof d.summary_stats === 'object'
      ? Object.entries(d.summary_stats).map(([k, v]) => `${k}: ${typeof v === 'number' ? v : JSON.stringify(v)}`).join('; ')
      : '';
    return `<div style="border-bottom:1px solid var(--border);padding:12px 0">
      <div style="font-weight:600">${esc(d.signal_domain)}</div>
      <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">
        Modalities: ${esc((d.collection_modalities || []).join(', '))} · Source: ${esc((d.source_types || []).join(', '))}
      </div>
      <div style="font-size:12px;margin-top:6px">${esc(stats)}</div>
      <div style="font-size:11px;color:var(--text-tertiary);margin-top:6px">Completeness: ${esc(d.completeness != null ? `${Math.round(d.completeness * 100)}%` : '—')}</div>
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

function _linksHtml(links) {
  const list = Array.isArray(links) ? links : [];
  return list.map((l) => {
    const pid = l.nav_page_id;
    return `<div style="margin-bottom:10px">
      <button type="button" class="btn btn-ghost btn-sm" data-nav-page="${esc(pid)}" style="min-height:44px">
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

function _auditPanel(events) {
  const list = Array.isArray(events) ? events : [];
  if (!list.length) return '<div style="font-size:12px;color:var(--text-tertiary)">No audit entries.</div>';
  return `<ul style="list-style:none;margin:0;padding:0;font-size:12px">${list.map((e) => `<li style="padding:6px 0;border-bottom:1px solid var(--border)">
    <span style="color:var(--text-tertiary)">${esc(e.timestamp)}</span> · ${esc(e.action)} — ${esc(e.summary || '')}
  </li>`).join('')}</ul>`;
}

function renderAnalyzerHtml(data, auditEvents) {
  const disclaimer = data.clinical_disclaimer || '';
  const auditList = Array.isArray(auditEvents) ? auditEvents : (data.audit_events || []);

  return `
    ${disclaimer ? `<div class="notice notice-info" style="margin-bottom:14px;font-size:12px;line-height:1.45">${esc(disclaimer)}</div>` : ''}
    <div style="font-size:12px;color:var(--text-tertiary);margin-bottom:12px">Generated ${esc(data.generated_at)} · window ${esc(data.analysis_window?.start)} → ${esc(data.analysis_window?.end)}</div>
    <h3 style="font-size:14px;margin:0 0 10px">Behavioral snapshot</h3>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;margin-bottom:22px">
      ${_snapshotCards(data.snapshot)}
    </div>
    <h3 style="font-size:14px;margin:0 0 10px">Signal domains</h3>
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:12px 16px;margin-bottom:22px">
      ${_domainsPanel(data.domains)}
    </div>
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
    <h3 style="font-size:14px;margin:0 0 10px">Multimodal connections</h3>
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:14px;margin-bottom:22px;font-size:12px">
      ${_linksHtml(data.multimodal_links)}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:14px">
        <div style="font-weight:600;margin-bottom:8px">Consent &amp; governance</div>
        ${_consentPanel(data.consent_state)}
      </div>
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:14px">
        <div style="font-weight:600;margin-bottom:8px">Audit</div>
        ${_auditPanel(auditList)}
      </div>
    </div>
    <div style="margin-top:18px;font-size:11px;color:var(--text-tertiary)">Pipeline: ${esc(data.provenance?.feature_pipeline_version)} · schema ${esc(data.schema_version)}</div>
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

  let patientId = '';
  try {
    patientId = String(window._dpaPatientId || window._clinicalPatientId || '').trim();
  } catch { patientId = ''; }

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
          <input id="dpa-patient-id" class="form-control" style="min-width:260px" placeholder="UUID / patient id" value="${esc(patientId)}" />
        </label>
        <button type="button" class="btn btn-primary" id="dpa-load">Load analyzer</button>
        <button type="button" class="btn btn-ghost btn-sm" id="dpa-recompute" style="min-height:44px">Recompute (stub)</button>
      </div>
      <div id="dpa-body"></div>
    </div>`;

  const $ = (id) => document.getElementById(id);

  let usingFixtures = false;

  function _syncDemoBanner() {
    const slot = $('dpa-demo-banner');
    if (!slot) return;
    slot.innerHTML = usingFixtures && isDemoSession() ? DEMO_FIXTURE_BANNER_HTML : '';
  }

  function wireNav(body) {
    body.querySelectorAll('[data-nav-page]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const p = btn.getAttribute('data-nav-page');
        try { navigate?.(p); } catch {}
      });
    });
  }

  async function loadPayload() {
    const body = $('dpa-body');
    if (!body) return;
    const pid = $('dpa-patient-id')?.value?.trim();
    if (!pid) {
      body.innerHTML = `<div class="notice notice-info" style="font-size:12px">Enter a patient id to load passive sensing summary.</div>`;
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
      if (isDemoSession()) {
        data = demoDigitalPhenotypingPayload(pid);
        auditEvents = data.audit_events || [];
        usingFixtures = true;
      } else {
        const msg = (e && e.message) || String(e);
        body.innerHTML = `<div style="color:#f87171;padding:14px;border-radius:12px;background:rgba(248,113,113,.08);font-size:13px">${esc(msg)}</div>`;
        return;
      }
    }

    _syncDemoBanner();
    body.innerHTML = renderAnalyzerHtml(data, auditEvents);
    wireNav(body);
  }

  $('dpa-load')?.addEventListener('click', () => { loadPayload(); });
  $('dpa-recompute')?.addEventListener('click', async () => {
    const pid = $('dpa-patient-id')?.value?.trim();
    if (!pid) return;
    try {
      await api.recomputeDigitalPhenotyping(pid);
    } catch { /* stub may 401 in non-demo */ }
    await loadPayload();
  });

  if (patientId) await loadPayload();
}
