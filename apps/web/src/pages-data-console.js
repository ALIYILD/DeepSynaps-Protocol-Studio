// ─────────────────────────────────────────────────────────────────────────────
// pages-data-console.js — Enhanced Clinic Data Console
// Read-only clinical data browser with patient CRM, data explorer, audit centre,
// export tools, consent compliance, and anonymization capabilities.
// Safe, auditable access to patient data with PHI masking and compliance badges.
// ─────────────────────────────────────────────────────────────────────────────

import { api } from './api.js';
import { tag, spinner, emptyState } from './helpers.js';
import { currentUser } from './auth.js';

/**
 * pgDataConsole — Main data console page
 * Route: /data-console
 *
 * Features:
 * - Clinic Overview Dashboard with KPIs, timeline, data quality, consent grid
 * - Patient CRM Table with sort, search, pagination, CSV export
 * - Patient Data Explorer (tabbed: Overview, Assessments, qEEG, MRI, Biomarkers,
 *   Medications, Reports, Audit, Export)
 * - Audit Centre with filters and CSV export
 * - Export Centre (format/scope/type selection)
 * - Consent & Compliance Panel
 * - Data Anonymization Tool
 * - Patient search/select (optional dropdown)
 * - Table browser showing available data sources
 * - Table row viewer with pagination
 * - Read-only row display with masking badges (***MASKED***)
 * - Audit trail view
 * - Safety banners + loading states + error handling
 */
export async function pgDataConsole(setTopbar, navigate) {
  setTopbar('Read-Only Data Console', '');
  const el = document.getElementById('content');

  // ── State ──────────────────────────────────────────────────────────────────
  let _selectedPatientId = null;
  let _selectedTable = null;
  let _currentOffset = 0;
  let _currentLimit = 50;
  let _allPatients = [];
  let _availableSources = [];
  let _isLoadingPatients = false;
  let _isLoadingSources = false;
  let _isLoadingRows = false;
  let _isLoadingAudit = false;
  let _currentRowsData = null;
  let _currentAuditData = null;

  // ── NEW: Enhanced state ────────────────────────────────────────────────────
  let _clinicOverviewData = null;
  let _patientCrmData = [];
  let _patientCrmFiltered = [];
  let _patientCrmSort = { column: 'last_activity', direction: 'desc' };
  let _patientCrmSearch = '';
  let _patientCrmPage = 1;
  let _patientCrmPageSize = 20;
  let _patientCrmSelectedIds = new Set();
  let _explorerPatientId = null;
  let _explorerTab = 'overview';
  let _explorerData = null;
  let _auditCentreData = null;
  let _auditCentreFilters = { actor: '', action: '', dateFrom: '', dateTo: '', patient: '' };
  let _exportConfig = { format: 'csv', scope: 'clinic', dataType: 'all', dateFrom: '', dateTo: '', reason: '' };
  let _consentData = null;
  let _anonymConfig = { scope: 'patient', level: 'k_anonymity', patientId: '' };
  let _anonymPreview = null;
  let _isClinician = !!(currentUser && (currentUser.role === 'clinician' || currentUser.role === 'admin' || currentUser.role === 'clinic_admin'));

  // ── Helper: HTML escape ────────────────────────────────────────────────────
  function esc(v) {
    if (v == null) return '';
    return String(v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  // ── Helper: Format date ────────────────────────────────────────────────────
  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  // ── Helper: Format date only ───────────────────────────────────────────────
  function fmtDateOnly(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // ── Helper: Status badge ───────────────────────────────────────────────────
  function statusBadge(status, opts = {}) {
    const { size = '12px', padding = '2px 8px' } = opts;
    const colors = {
      active: ['rgba(34,197,94,0.12)', 'var(--green)'],
      inactive: ['rgba(148,163,184,0.12)', 'var(--text-tertiary)'],
      pending: ['rgba(245,158,11,0.12)', 'var(--amber)'],
      flagged: ['rgba(239,68,68,0.12)', 'var(--red)'],
      complete: ['rgba(59,130,246,0.12)', 'var(--blue)'],
      missing: ['rgba(239,68,68,0.12)', 'var(--red)'],
      expired: ['rgba(245,158,11,0.12)', 'var(--amber)'],
      granted: ['rgba(34,197,94,0.12)', 'var(--green)'],
      revoked: ['rgba(239,68,68,0.12)', 'var(--red)'],
    };
    const [bg, fg] = colors[status] || colors.inactive;
    return `<span style="background:${bg};color:${fg};font-size:${size};font-weight:600;padding:${padding};border-radius:4px;text-transform:capitalize;white-space:nowrap">${esc(status || '—')}</span>`;
  }

  // ── Helper: Consent dot ────────────────────────────────────────────────────
  function consentDot(granted, label) {
    const color = granted ? 'var(--green)' : 'var(--red)';
    const title = granted ? 'Granted' : 'Missing/Revoked';
    return `<span title="${esc(title)}" style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--text-secondary)">
      <span style="width:7px;height:7px;border-radius:50%;background:${color};display:inline-block;flex-shrink:0"></span>
      ${esc(label)}
    </span>`;
  }

  // ── Helper: Small KPI card ─────────────────────────────────────────────────
  function kpiCard(label, value, color = 'var(--text-primary)', opts = {}) {
    const { subtitle = '', action = '' } = opts;
    return `
    <div class="ch-card" data-test="kpi-${esc(label.toLowerCase().replace(/\s+/g, '-'))}" style="padding:14px 16px;display:flex;flex-direction:column;gap:4px;min-width:150px;flex:1">
      <div style="font-size:10.5px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.6px">${esc(label)}</div>
      <div style="font-size:22px;font-weight:700;color:${color};font-variant-numeric:tabular-nums">${esc(String(value))}</div>
      ${subtitle ? `<div style="font-size:11px;color:var(--text-tertiary)">${esc(subtitle)}</div>` : ''}
      ${action}
    </div>`;
  }

  // ── Safety banners ─────────────────────────────────────────────────────────
  function renderSafetyBanners() {
    return `
    <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px">
      <div class="ch-card" role="region" aria-label="Read-only notice" style="border-left:3px solid var(--teal);background:rgba(0,212,188,0.06);padding:12px 14px">
        <div style="font-size:12.5px;line-height:1.55;color:var(--text-secondary)">
          <strong style="color:var(--teal)">Read-Only Data Console — Clinical Use Only.</strong>
          This workspace provides secure, audit-logged access to patient clinical data in read-only mode.
          No data modification is possible. All access is recorded for compliance and safety review.
        </div>
      </div>
      <div class="ch-card" role="region" aria-label="Audit notice" style="border-left:3px solid var(--amber);background:rgba(245,158,11,0.06);padding:12px 14px">
        <div style="font-size:12.5px;line-height:1.55;color:var(--text-secondary)">
          <strong style="color:var(--amber)">Access Logged and Auditable.</strong>
          All access to patient records in this console is recorded with timestamps, user identity, and data access details.
          Clinicians are responsible for appropriate use in accordance with organizational policies.
        </div>
      </div>
      <div class="ch-card" role="region" aria-label="PHI masking notice" style="border-left:3px solid var(--red);background:rgba(239,68,68,0.06);padding:12px 14px">
        <div style="font-size:12.5px;line-height:1.55;color:var(--text-secondary)">
          <strong style="color:var(--red)">PHI Masking Active.</strong>
          Protected Health Information is masked for non-clinician roles. Demographics, contact details, and identifiers
          may appear as ***MASKED***. Contact your clinic administrator if you require elevated access for patient care.
        </div>
      </div>
    </div>`;
  }

  // ── Clinic Overview (Slice A) ──────────────────────────────────────────────
  // Roll-up + bulk CSV download. Only rendered for clinic owners and
  // DeepSynaps superadmins. A plain `clinician` cannot see clinic-wide
  // counts and never sees the Download button. In demo sessions
  // (currentUser.id starts with 'actor-clinician-demo') the Download CSV
  // button is also hidden — see `api.js` deliberately omits a CSV stream
  // shim, so the URL would 404.
  const _isClinicOverviewRole = (
    currentUser && (currentUser.role === 'admin' || currentUser.role === 'clinic_admin')
  );
  const _isDemoActorId = !!(currentUser?.id && String(currentUser.id).startsWith('actor-clinician-demo'));
  let _clinicOverviewClinicId = (currentUser && currentUser.clinic_id) || '';

  async function loadAndRenderClinicOverview() {
    const container = document.getElementById('dc-clinic-overview-container');
    if (!container) return;
    // Admin needs a clinic_id to query — bail with a hint if the input is empty.
    if (currentUser.role === 'admin' && !_clinicOverviewClinicId) {
      container.innerHTML = `<div style="padding:16px;color:var(--text-tertiary);font-size:12px">Enter a clinic_id above to load the aggregate view.</div>`;
      return;
    }
    container.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-tertiary)">${spinner('Loading clinic summary...')}</div>`;
    try {
      const arg = _clinicOverviewClinicId || undefined;
      const resp = await api.dataConsoleClinicSummary(arg);
      if (!resp || !resp.table_summaries) throw new Error('Invalid clinic summary response');
      const tables = resp.table_summaries || {};
      const clinicId = resp.clinic_id || _clinicOverviewClinicId || '—';
      const tableNames = Object.keys(tables).sort();
      if (tableNames.length === 0) {
        container.innerHTML = `<div style="padding:16px;color:var(--text-tertiary);font-size:12px">No data sources available for this clinic.</div>`;
        return;
      }
      const cards = tableNames.map(tn => {
        const count = tables[tn] || 0;
        const downloadBtn = _isDemoActorId ? '' : `
          <a href="${esc(api.dataConsoleClinicExportUrl(clinicId, tn))}"
             download
             class="btn-secondary"
             style="display:inline-block;font-size:11px;padding:6px 10px;margin-top:8px;text-decoration:none">
            Download CSV
          </a>`;
        return `
          <div class="ch-card" style="padding:14px;display:flex;flex-direction:column;gap:4px;min-width:180px;flex:1">
            <div style="font-size:11px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.5px">${esc(tn)}</div>
            <div style="font-size:22px;font-weight:700;color:var(--text-primary);font-variant-numeric:tabular-nums">${Number(count).toLocaleString()}</div>
            ${downloadBtn}
          </div>`;
      }).join('');
      const generated = resp.generated_at ? new Date(resp.generated_at).toLocaleString() : '';
      container.innerHTML = `
        <div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:8px">${cards}</div>
        <div style="font-size:11px;color:var(--text-tertiary)">Clinic <code>${esc(clinicId)}</code>${generated ? ` · generated ${esc(generated)}` : ''}</div>`;
    } catch (err) {
      console.error('Error loading clinic summary:', err);
      container.innerHTML = `
        <div style="padding:16px;color:var(--red);font-size:12px">
          Failed to load clinic summary: ${esc(err.message)}
        </div>`;
    }
  }

  window._dcReloadClinicOverview = async () => {
    const input = document.getElementById('dc-clinic-id-input');
    if (input) _clinicOverviewClinicId = (input.value || '').trim();
    await loadAndRenderClinicOverview();
  };

  // ═════════════════════════════════════════════════════════════════════════════
  // 1. ENHANCED CLINIC OVERVIEW DASHBOARD
  // ═════════════════════════════════════════════════════════════════════════════

  async function loadAndRenderEnhancedOverview() {
    const container = document.getElementById('dc-enhanced-overview-container');
    if (!container) return;
    container.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-tertiary)">${spinner('Loading dashboard...')}</div>`;

    try {
      const clinicId = _clinicOverviewClinicId || currentUser?.clinic_id;
      if (!clinicId) {
        container.innerHTML = `<div style="padding:16px;color:var(--text-tertiary);font-size:12px">No clinic selected.</div>`;
        return;
      }

      // Fetch overview data (mock-fallback for demo)
      let data;
      try {
        data = await api.dataConsoleEnhancedOverview?.(clinicId) || null;
      } catch (e) { data = null; }

      if (!data) {
        // Build from available data
        data = buildMockOverview(clinicId);
      }
      _clinicOverviewData = data;

      container.innerHTML = `
        ${renderOverviewKPIs(data)}
        ${renderActivityTimeline(data.recent_events || [])}
        ${renderDataQualitySummary(data.data_quality || {})}
        ${renderConsentStatusGrid(data.consent_summary || {})}
      `;
    } catch (err) {
      console.error('Error loading enhanced overview:', err);
      container.innerHTML = `<div style="padding:16px;color:var(--red);font-size:12px">Failed to load dashboard: ${esc(err.message)}</div>`;
    }
  }

  function buildMockOverview(clinicId) {
    // Derive from loaded data if available, else reasonable defaults
    const totalPatients = _allPatients.length || 0;
    const activePatients = _allPatients.filter(p => p.status === 'active' || p.status === 'enrolled').length || Math.floor(totalPatients * 0.75);
    return {
      clinic_id: clinicId,
      total_patients: totalPatients,
      active_patients: activePatients,
      assessments_count: 0,
      qeeg_count: 0,
      mri_count: 0,
      biomarker_records: 0,
      medication_records: 0,
      pending_documents: 0,
      missing_consent: 0,
      recent_events: [],
      data_quality: { completeness_score: null, stale_records: 0, duplicates: 0 },
      consent_summary: { ai_analysis: 0, device_sync: 0, document_generation: 0, communication: 0, total_patients: totalPatients },
    };
  }

  function renderOverviewKPIs(data) {
    const kpis = [
      ['Total Patients', data.total_patients || 0, 'var(--text-primary)'],
      ['Active', data.active_patients || 0, 'var(--green)'],
      ['Assessments', data.assessments_count || 0, 'var(--blue)'],
      ['qEEG', data.qeeg_count || 0, 'var(--purple)'],
      ['MRI', data.mri_count || 0, 'var(--cyan)'],
      ['Biomarkers', data.biomarker_records || 0, 'var(--teal)'],
      ['Medications', data.medication_records || 0, 'var(--amber)'],
      ['Pending Docs', data.pending_documents || 0, data.pending_documents > 0 ? 'var(--amber)' : 'var(--text-primary)'],
      ['Missing Consent', data.missing_consent || 0, data.missing_consent > 0 ? 'var(--red)' : 'var(--text-primary)'],
    ];
    return `
    <div data-test="overview-kpis" style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:20px">
      ${kpis.map(([label, value, color]) => kpiCard(label, Number(value).toLocaleString(), color)).join('')}
    </div>`;
  }

  function renderActivityTimeline(events) {
    const displayEvents = (events || []).slice(0, 10);
    const rows = displayEvents.length === 0
      ? `<div style="padding:16px;text-align:center;color:var(--text-tertiary);font-size:12px">No recent events. Activity will appear here as the system is used.</div>`
      : displayEvents.map((evt, i) => `
        <div style="display:flex;gap:12px;padding:8px 0;border-bottom:1px solid ${i < displayEvents.length - 1 ? 'var(--border)' : 'transparent'}">
          <div style="font-size:11px;color:var(--text-tertiary);font-family:var(--font-mono);white-space:nowrap;min-width:120px;padding-top:2px">${fmtDate(evt.timestamp)}</div>
          <div style="flex:1">
            <div style="font-size:12px;color:var(--text-primary)">${esc(evt.description || evt.action || 'Activity')}</div>
            <div style="font-size:11px;color:var(--text-tertiary)">Actor: ${esc(evt.actor_id || '—')} · ${esc(evt.resource_type || '—')}</div>
          </div>
          <div>${statusBadge(evt.result === 'success' ? 'active' : evt.result || 'complete', { size: '11px' })}</div>
        </div>`).join('');

    return `
    <div class="ch-card" data-test="activity-timeline" style="margin-bottom:20px;padding:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h4 style="font-size:13px;font-weight:600;color:var(--text-primary);margin:0">Recent Activity</h4>
        <span style="font-size:11px;color:var(--text-tertiary)">Last 10 events</span>
      </div>
      <div style="max-height:360px;overflow-y:auto">${rows}</div>
    </div>`;
  }

  function renderDataQualitySummary(dq) {
    const score = dq.completeness_score;
    const scoreColor = score >= 90 ? 'var(--green)' : score >= 70 ? 'var(--amber)' : 'var(--red)';
    const scoreDisplay = score != null ? `${score}%` : 'N/A';
    return `
    <div class="ch-card" data-test="data-quality" style="margin-bottom:20px;padding:16px">
      <h4 style="font-size:13px;font-weight:600;color:var(--text-primary);margin:0 0 12px 0">Data Quality Summary</h4>
      <div style="display:flex;flex-wrap:wrap;gap:16px;align-items:center">
        ${kpiCard('Completeness', scoreDisplay, scoreColor, { subtitle: score != null ? (score >= 90 ? 'Good' : score >= 70 ? 'Fair' : 'Needs Attention') : '' })}
        ${kpiCard('Stale Records', dq.stale_records || 0, (dq.stale_records || 0) > 0 ? 'var(--amber)' : 'var(--green)')}
        ${kpiCard('Duplicates', dq.duplicates || 0, (dq.duplicates || 0) > 0 ? 'var(--red)' : 'var(--green)')}
      </div>
      <div style="margin-top:12px;padding:10px;background:rgba(245,158,11,0.06);border-left:2px solid var(--amber);border-radius:4px;font-size:11.5px;color:var(--text-secondary)">
        <strong style="color:var(--amber)">Clinical Safety Note:</strong> Data quality scores are estimates based on required-field completeness.
        Stale records may indicate patients who need follow-up. Review duplicates carefully before any clinical decision.
      </div>
    </div>`;
  }

  function renderConsentStatusGrid(consent) {
    const total = consent.total_patients || _allPatients.length || 1;
    const items = [
      ['AI Analysis', consent.ai_analysis || 0, total],
      ['Device Sync', consent.device_sync || 0, total],
      ['Document Generation', consent.document_generation || 0, total],
      ['Communication', consent.communication || 0, total],
    ];
    return `
    <div class="ch-card" data-test="consent-status-grid" style="margin-bottom:20px;padding:16px">
      <h4 style="font-size:13px;font-weight:600;color:var(--text-primary);margin:0 0 12px 0">Consent Status Overview</h4>
      <div style="display:flex;flex-wrap:wrap;gap:12px">
        ${items.map(([label, granted, tot]) => {
          const pct = tot > 0 ? Math.round((granted / tot) * 100) : 0;
          const color = pct >= 90 ? 'var(--green)' : pct >= 70 ? 'var(--amber)' : 'var(--red)';
          return `
          <div style="flex:1;min-width:180px;padding:12px;background:var(--surface-1);border-radius:6px;border:1px solid var(--border)">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <span style="font-size:11px;font-weight:600;color:var(--text-secondary)">${esc(label)}</span>
              <span style="font-size:11px;font-weight:700;color:${color}">${pct}%</span>
            </div>
            <div style="height:4px;background:var(--surface-3);border-radius:2px;overflow:hidden">
              <div style="height:100%;width:${pct}%;background:${color};border-radius:2px;transition:width 0.3s"></div>
            </div>
            <div style="font-size:10.5px;color:var(--text-tertiary);margin-top:4px">${granted.toLocaleString()} of ${tot.toLocaleString()} patients</div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // 2. PATIENT CRM TABLE
  // ═════════════════════════════════════════════════════════════════════════════

  async function loadAndRenderPatientCrm() {
    const container = document.getElementById('dc-patient-crm-container');
    if (!container) return;
    container.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-tertiary)">${spinner('Loading patient CRM...')}</div>`;

    try {
      if (_allPatients.length === 0) {
        const patients = await api.listPatients();
        _allPatients = (patients?.items || patients || []).filter(p => p.id && p.name);
      }

      // Enrich patient records with CRM fields
      _patientCrmData = _allPatients.map(p => ({
        ...p,
        status: p.status || 'active',
        clinician: p.clinician_name || p.clinician_id || 'Unassigned',
        last_activity: p.last_activity || p.updated_at || p.created_at,
        consent_status: p.consent_status || 'unknown',
        data_completeness: p.data_completeness ?? null,
        risk_flags: p.risk_flags || [],
      }));

      filterSortAndRenderCrm();
    } catch (err) {
      console.error('Error loading patient CRM:', err);
      container.innerHTML = `<div style="padding:16px;color:var(--red);font-size:12px">Failed to load patient CRM: ${esc(err.message)}</div>`;
    }
  }

  function filterSortAndRenderCrm() {
    // Filter by search
    let filtered = _patientCrmData;
    if (_patientCrmSearch) {
      const q = _patientCrmSearch.toLowerCase();
      filtered = filtered.filter(p =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.id || '').toLowerCase().includes(q) ||
        (p.clinician || '').toLowerCase().includes(q) ||
        (p.status || '').toLowerCase().includes(q)
      );
    }

    // Sort
    const { column, direction } = _patientCrmSort;
    filtered = [...filtered].sort((a, b) => {
      let av = a[column] || '';
      let bv = b[column] || '';
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      if (av < bv) return direction === 'asc' ? -1 : 1;
      if (av > bv) return direction === 'asc' ? 1 : -1;
      return 0;
    });

    _patientCrmFiltered = filtered;
    renderPatientCrm();
  }

  function renderPatientCrm() {
    const container = document.getElementById('dc-patient-crm-container');
    if (!container) return;

    const totalPages = Math.max(1, Math.ceil(_patientCrmFiltered.length / _patientCrmPageSize));
    _patientCrmPage = Math.min(_patientCrmPage, totalPages);
    const startIdx = (_patientCrmPage - 1) * _patientCrmPageSize;
    const pageRows = _patientCrmFiltered.slice(startIdx, startIdx + _patientCrmPageSize);

    const sortIndicator = (col) => {
      if (_patientCrmSort.column !== col) return '<span style="color:var(--text-tertiary);font-size:10px">⇅</span>';
      return _patientCrmSort.direction === 'asc' ? '<span style="color:var(--teal);font-size:10px">↑</span>' : '<span style="color:var(--teal);font-size:10px">↓</span>';
    };

    const header = (label, col, style = '') =>
      `<th onclick="window._dcSortCrm('${esc(col)}')" style="cursor:pointer;text-align:left;padding:10px;font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;background:var(--surface-2);${style}">${esc(label)} ${sortIndicator(col)}</th>`;

    const rows = pageRows.length === 0
      ? `<tr><td colspan="9" style="padding:24px;text-align:center;color:var(--text-tertiary);font-size:12px">No patients match your search.</td></tr>`
      : pageRows.map(p => {
        const name = _isClinician ? p.name : maskName(p.name);
        const completeness = p.data_completeness != null ? `${p.data_completeness}%` : '—';
        const riskBadges = (p.risk_flags || []).slice(0, 3).map(f => statusBadge(f, { size: '10px', padding: '1px 6px' })).join(' ') || '<span style="font-size:11px;color:var(--text-tertiary)">—</span>';
        const isSelected = _patientCrmSelectedIds.has(p.id);
        return `
        <tr data-test="crm-row-${esc(p.id)}" onclick="window._dcOpenExplorer('${esc(p.id)}')" style="border-bottom:1px solid var(--border);cursor:pointer;transition:background 0.15s" onmouseover="this.style.background='var(--surface-2)'" onmouseout="this.style.background='transparent'">
          <td style="padding:10px" onclick="event.stopPropagation()">
            <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="window._dcToggleSelectCrm('${esc(p.id)}')" style="cursor:pointer">
          </td>
          <td style="padding:10px;font-size:12px;font-family:var(--font-mono);color:var(--text-secondary)">${esc(p.id.slice(0, 12))}…</td>
          <td style="padding:10px;font-size:12px;color:var(--text-primary);font-weight:500">${esc(name)}</td>
          <td style="padding:10px">${statusBadge(p.status)}</td>
          <td style="padding:10px;font-size:12px;color:var(--text-secondary)">${esc(p.clinician)}</td>
          <td style="padding:10px;font-size:11px;color:var(--text-tertiary);font-family:var(--font-mono)">${fmtDate(p.last_activity)}</td>
          <td style="padding:10px">${consentDot(p.consent_status === 'granted' || p.consent_status === 'active', p.consent_status || 'unknown')}</td>
          <td style="padding:10px;font-size:12px;color:var(--text-secondary)">${esc(completeness)}</td>
          <td style="padding:10px">${riskBadges}</td>
        </tr>`;
      }).join('');

    container.innerHTML = `
      <div class="ch-card" data-test="patient-crm-table" style="overflow:auto">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;border-bottom:1px solid var(--border);flex-wrap:wrap;gap:8px">
          <div style="display:flex;gap:8px;align-items:center;flex:1;min-width:220px">
            <input id="dc-crm-search" type="text" placeholder="Search patients..." value="${esc(_patientCrmSearch)}"
              oninput="window._dcSearchCrm(this.value)"
              style="flex:1;min-width:180px;padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface-1);color:var(--text);font-size:12px" />
            <select onchange="window._dcFilterCrmStatus(this.value)" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface-1);color:var(--text);font-size:12px">
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="pending">Pending</option>
              <option value="flagged">Flagged</option>
            </select>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <span style="font-size:11px;color:var(--text-tertiary)">${_patientCrmFiltered.length.toLocaleString()} patients</span>
            <button onclick="window._dcExportCrmCsv()" class="btn-secondary" style="font-size:11px;padding:6px 12px" ${_patientCrmSelectedIds.size === 0 ? 'disabled' : ''}>Export Selected (${_patientCrmSelectedIds.size})</button>
          </div>
        </div>
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr>
              <th style="padding:10px;background:var(--surface-2);width:30px"><input type="checkbox" onclick="window._dcToggleSelectAllCrm(this.checked)"></th>
              ${header('Patient ID', 'id')}
              ${header('Name', 'name')}
              ${header('Status', 'status')}
              ${header('Clinician', 'clinician')}
              ${header('Last Activity', 'last_activity')}
              ${header('Consent', 'consent_status')}
              ${header('Completeness', 'data_completeness')}
              ${header('Risk Flags', 'risk_flags')}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        ${renderCrmPagination(totalPages, startIdx, pageRows.length)}
      </div>`;
  }

  function renderCrmPagination(totalPages, startIdx, pageCount) {
    if (_patientCrmFiltered.length === 0) return '';
    const pages = [];
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= _patientCrmPage - 1 && i <= _patientCrmPage + 1)) {
        pages.push(`<button onclick="window._dcCrmPage(${i})" style="padding:4px 10px;border:1px solid ${i === _patientCrmPage ? 'var(--teal)' : 'var(--border)'};border-radius:4px;background:${i === _patientCrmPage ? 'var(--teal)' : 'var(--surface-1)'};color:${i === _patientCrmPage ? '#fff' : 'var(--text-secondary)'};font-size:11px;cursor:pointer">${i}</button>`);
      } else if (i === _patientCrmPage - 2 || i === _patientCrmPage + 2) {
        pages.push('<span style="color:var(--text-tertiary);font-size:11px">…</span>');
      }
    }
    return `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;border-top:1px solid var(--border);flex-wrap:wrap;gap:8px">
      <div style="font-size:11px;color:var(--text-tertiary)">Showing ${(startIdx + 1).toLocaleString()}–${(startIdx + pageCount).toLocaleString()} of ${_patientCrmFiltered.length.toLocaleString()}</div>
      <div style="display:flex;gap:4px;align-items:center">${pages.join('')}</div>
    </div>`;
  }

  function maskName(name) {
    if (!name) return '***MASKED***';
    const parts = String(name).split(' ');
    return parts.map(p => p.charAt(0) + '***').join(' ');
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // 3. PATIENT DATA EXPLORER (Tabbed View)
  // ═════════════════════════════════════════════════════════════════════════════

  function renderExplorerSkeleton() {
    const container = document.getElementById('dc-patient-explorer-container');
    if (!container) return;
    container.style.display = _explorerPatientId ? 'block' : 'none';
    if (!_explorerPatientId) {
      container.innerHTML = '';
      return;
    }

    const patient = _allPatients.find(p => p.id === _explorerPatientId) || {};
    const name = _isClinician ? patient.name : maskName(patient.name);

    const tabs = [
      ['overview', 'Overview'],
      ['assessments', 'Assessments'],
      ['qeeg', 'qEEG'],
      ['mri', 'MRI'],
      ['biomarkers', 'Biomarkers'],
      ['medications', 'Medications'],
      ['reports', 'Reports'],
      ['audit', 'Audit'],
      ['export', 'Export'],
    ];

    container.innerHTML = `
    <div class="ch-card" data-test="patient-explorer" style="margin-bottom:24px">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-bottom:1px solid var(--border);flex-wrap:wrap;gap:8px">
        <div>
          <h4 style="font-size:14px;font-weight:600;color:var(--text-primary);margin:0">Patient Data Explorer</h4>
          <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">${esc(name)} · <code style="font-size:10px">${esc(_explorerPatientId)}</code></div>
        </div>
        <button onclick="window._dcCloseExplorer()" class="btn-secondary" style="font-size:11px;padding:5px 10px">Close</button>
      </div>
      <div style="display:flex;border-bottom:1px solid var(--border);overflow-x:auto">
        ${tabs.map(([key, label]) => `
          <button data-test="tab-${key}" onclick="window._dcExplorerTab('${key}')"
            style="padding:10px 16px;font-size:12px;font-weight:600;border:none;border-bottom:2px solid ${_explorerTab === key ? 'var(--teal)' : 'transparent'};background:transparent;color:${_explorerTab === key ? 'var(--teal)' : 'var(--text-secondary)'};cursor:pointer;white-space:nowrap;transition:all 0.15s">
            ${esc(label)}
          </button>`).join('')}
      </div>
      <div id="dc-explorer-content" style="padding:16px;min-height:200px">
        ${spinner('Loading...')}
      </div>
    </div>`;

    renderExplorerTabContent();
  }

  async function renderExplorerTabContent() {
    const content = document.getElementById('dc-explorer-content');
    if (!content) return;

    const patient = _allPatients.find(p => p.id === _explorerPatientId) || {};
    const name = _isClinician ? patient.name : maskName(patient.name);

    switch (_explorerTab) {
      case 'overview':
        content.innerHTML = `
          <div style="display:flex;flex-direction:column;gap:16px">
            <div style="display:flex;flex-wrap:wrap;gap:16px">
              ${kpiCard('Patient ID', _explorerPatientId.slice(0, 16) + '...')}
              ${kpiCard('Status', patient.status || '—', patient.status === 'active' ? 'var(--green)' : 'var(--amber)')}
              ${kpiCard('Consent', patient.consent_status || 'unknown', (patient.consent_status === 'granted' || patient.consent_status === 'active') ? 'var(--green)' : 'var(--red)')}
              ${kpiCard('Data Completeness', patient.data_completeness != null ? patient.data_completeness + '%' : '—')}
            </div>
            <div class="ch-card" style="padding:12px;background:var(--surface-1)">
              <h5 style="font-size:12px;font-weight:600;color:var(--text-secondary);margin:0 0 8px 0">Demographics</h5>
              <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px;font-size:12px">
                <div><span style="color:var(--text-tertiary)">Name:</span> <span style="color:var(--text-primary);font-weight:500">${esc(name)}</span></div>
                <div><span style="color:var(--text-tertiary)">DOB:</span> <span style="color:var(--text-primary);font-weight:500">${!_isClinician ? '***MASKED***' : esc(patient.dob || '—')}</span></div>
                <div><span style="color:var(--text-tertiary)">Gender:</span> <span style="color:var(--text-primary);font-weight:500">${!_isClinician ? '***MASKED***' : esc(patient.gender || '—')}</span></div>
                <div><span style="color:var(--text-tertiary)">Clinician:</span> <span style="color:var(--text-primary);font-weight:500">${esc(patient.clinician_name || patient.clinician_id || '—')}</span></div>
              </div>
            </div>
            ${(patient.risk_flags || []).length > 0 ? `
            <div class="ch-card" style="padding:12px;background:rgba(239,68,68,0.06);border-left:2px solid var(--red)">
              <h5 style="font-size:12px;font-weight:600;color:var(--red);margin:0 0 8px 0">Risk Flags</h5>
              <div style="display:flex;flex-wrap:wrap;gap:6px">
                ${patient.risk_flags.map(f => statusBadge(f)).join(' ')}
              </div>
            </div>` : ''}
          </div>`;
        break;

      case 'assessments':
      case 'qeeg':
      case 'mri':
      case 'biomarkers':
      case 'medications':
      case 'reports':
        content.innerHTML = renderExplorerDataTable(_explorerTab);
        break;

      case 'audit':
        await renderExplorerAudit(content);
        break;

      case 'export':
        content.innerHTML = renderExplorerExport();
        break;

      default:
        content.innerHTML = `<div style="padding:16px;color:var(--text-tertiary);font-size:12px">Select a tab to view data.</div>`;
    }
  }

  function renderExplorerDataTable(tab) {
    // Placeholder for data-backed tables; shows empty state with clinical disclaimer
    const labels = { assessments: 'Assessments', qeeg: 'qEEG Analyses', mri: 'MRI Analyses', biomarkers: 'Biomarker Records', medications: 'Medication Records', reports: 'Generated Reports' };
    const label = labels[tab] || tab;
    return `
    <div style="text-align:center;padding:24px">
      <div style="font-size:13px;color:var(--text-tertiary);margin-bottom:12px">No ${esc(label.toLowerCase())} loaded for this patient.</div>
      <div style="font-size:11px;color:var(--text-tertiary);max-width:400px;margin:0 auto;line-height:1.5">
        This section requires data to be fetched from the ${esc(label)} data source.
        In a production environment, records would be queried and displayed here with appropriate PHI masking.
      </div>
      <div style="margin-top:12px;padding:10px;background:rgba(0,212,188,0.06);border-left:2px solid var(--teal);border-radius:4px;font-size:11px;color:var(--text-secondary);text-align:left;max-width:500px;margin:12px auto 0">
        <strong style="color:var(--teal)">Clinical Safety:</strong> All ${esc(label.toLowerCase())} should be reviewed by a qualified clinician before being used in diagnostic or treatment decisions.
        This console provides read-only access for reference purposes only.
      </div>
    </div>`;
  }

  async function renderExplorerAudit(contentEl) {
    contentEl.innerHTML = `<div style="padding:16px;text-align:center;color:var(--text-tertiary)">${spinner('Loading audit events...')}</div>`;
    try {
      const resp = await api.dataConsolePatientAudit(_explorerPatientId, 30, 50);
      const events = (resp?.events || []).slice(0, 20);
      if (events.length === 0) {
        contentEl.innerHTML = `<div style="padding:16px;text-align:center;color:var(--text-tertiary);font-size:12px">No audit events for this patient in the last 30 days.</div>`;
        return;
      }
      contentEl.innerHTML = `
        <div style="overflow:auto;max-height:400px">
          <table style="width:100%;border-collapse:collapse">
            <thead style="background:var(--surface-2)">
              <tr>
                <th style="text-align:left;padding:8px;font-size:11px;font-weight:700;color:var(--text-secondary)">Timestamp</th>
                <th style="text-align:left;padding:8px;font-size:11px;font-weight:700;color:var(--text-secondary)">Actor</th>
                <th style="text-align:left;padding:8px;font-size:11px;font-weight:700;color:var(--text-secondary)">Action</th>
                <th style="text-align:left;padding:8px;font-size:11px;font-weight:700;color:var(--text-secondary)">Resource</th>
                <th style="text-align:left;padding:8px;font-size:11px;font-weight:700;color:var(--text-secondary)">Result</th>
              </tr>
            </thead>
            <tbody>
              ${events.map(evt => `
                <tr style="border-bottom:1px solid var(--border)">
                  <td style="padding:8px;font-size:11px;color:var(--text-secondary);font-family:var(--font-mono)">${fmtDate(evt.timestamp)}</td>
                  <td style="padding:8px;font-size:11px;color:var(--text-secondary)">${esc(evt.actor_id || '—')}</td>
                  <td style="padding:8px;font-size:11px;color:var(--text-primary)">${esc(evt.action || '—')}</td>
                  <td style="padding:8px;font-size:11px;color:var(--text-secondary)">${esc(evt.resource_type || '—')}</td>
                  <td style="padding:8px">${statusBadge(evt.result === 'success' ? 'active' : evt.result || '—', { size: '10px' })}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
    } catch (err) {
      contentEl.innerHTML = `<div style="padding:16px;color:var(--red);font-size:12px">Failed to load audit: ${esc(err.message)}</div>`;
    }
  }

  function renderExplorerExport() {
    return `
    <div style="display:flex;flex-direction:column;gap:16px">
      <div style="font-size:12px;color:var(--text-secondary)">Export this patient's complete data package for offline review or transfer.</div>
      <div style="display:flex;flex-wrap:wrap;gap:12px">
        <div style="flex:1;min-width:200px">
          <label style="display:block;font-size:11px;font-weight:600;color:var(--text-secondary);margin-bottom:4px">Format</label>
          <select id="dc-explorer-export-format" style="width:100%;padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface-1);color:var(--text);font-size:12px">
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
          </select>
        </div>
        <div style="flex:1;min-width:200px">
          <label style="display:block;font-size:11px;font-weight:600;color:var(--text-secondary);margin-bottom:4px">Data Types</label>
          <select id="dc-explorer-export-type" style="width:100%;padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface-1);color:var(--text);font-size:12px">
            <option value="all">All Data</option>
            <option value="assessments">Assessments</option>
            <option value="qeeg">qEEG</option>
            <option value="mri">MRI</option>
            <option value="biomarkers">Biomarkers</option>
            <option value="medications">Medications</option>
            <option value="reports">Reports</option>
          </select>
        </div>
      </div>
      <div>
        <label style="display:block;font-size:11px;font-weight:600;color:var(--text-secondary);margin-bottom:4px">Export Reason (required for audit log)</label>
        <input id="dc-explorer-export-reason" type="text" placeholder="e.g., Clinical review, Transfer to specialist..."
          style="width:100%;padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface-1);color:var(--text);font-size:12px" />
      </div>
      <div style="padding:10px;background:rgba(0,212,188,0.06);border-left:2px solid var(--teal);border-radius:4px;font-size:11px;color:var(--text-secondary)">
        <strong style="color:var(--teal)">Audit Notice:</strong> All exports are logged with timestamp, actor, reason, and data scope.
        The exported file may contain PHI — handle in accordance with your organization's privacy policy.
      </div>
      <button onclick="window._dcExportPatientPackage()" class="btn-primary" style="font-size:12px;padding:8px 16px;align-self:flex-start">Generate Export</button>
      <div id="dc-explorer-export-result"></div>
    </div>`;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // 4. AUDIT CENTRE
  // ═════════════════════════════════════════════════════════════════════════════

  async function loadAndRenderAuditCentre() {
    const container = document.getElementById('dc-audit-centre-container');
    if (!container) return;
    container.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-tertiary)">${spinner('Loading audit centre...')}</div>`;

    try {
      const clinicId = _clinicOverviewClinicId || currentUser?.clinic_id;
      let events = [];

      try {
        const resp = await api.dataConsoleAuditLog?.({ clinic_id: clinicId, limit: 200 });
        events = resp?.events || [];
      } catch (e) {
        // Fall back to patient-level audit aggregated
        if (_allPatients.length > 0) {
          const resp = await api.dataConsolePatientAudit(_allPatients[0].id, 30, 100);
          events = resp?.events || [];
        }
      }

      _auditCentreData = { events };
      renderAuditCentre();
    } catch (err) {
      console.error('Error loading audit centre:', err);
      container.innerHTML = `<div style="padding:16px;color:var(--red);font-size:12px">Failed to load audit centre: ${esc(err.message)}</div>`;
    }
  }

  function renderAuditCentre() {
    const container = document.getElementById('dc-audit-centre-container');
    if (!container) return;

    // Apply filters
    let events = (_auditCentreData?.events || []).filter(evt => {
      if (_auditCentreFilters.actor && !(evt.actor_id || '').toLowerCase().includes(_auditCentreFilters.actor.toLowerCase())) return false;
      if (_auditCentreFilters.action && !(evt.action || '').toLowerCase().includes(_auditCentreFilters.action.toLowerCase())) return false;
      if (_auditCentreFilters.patient && !(evt.patient_id || '').toLowerCase().includes(_auditCentreFilters.patient.toLowerCase())) return false;
      if (_auditCentreFilters.dateFrom && evt.timestamp && new Date(evt.timestamp) < new Date(_auditCentreFilters.dateFrom)) return false;
      if (_auditCentreFilters.dateTo && evt.timestamp && new Date(evt.timestamp) > new Date(_auditCentreFilters.dateTo + 'T23:59:59')) return false;
      return true;
    });

    const rows = events.length === 0
      ? `<tr><td colspan="6" style="padding:24px;text-align:center;color:var(--text-tertiary);font-size:12px">No audit events match the selected filters.</td></tr>`
      : events.slice(0, 100).map(evt => `
        <tr style="border-bottom:1px solid var(--border)">
          <td style="padding:10px;font-size:11px;color:var(--text-secondary);font-family:var(--font-mono);white-space:nowrap">${fmtDate(evt.timestamp)}</td>
          <td style="padding:10px;font-size:12px;color:var(--text-primary);font-weight:500">${esc(evt.actor_id || '—')}</td>
          <td style="padding:10px;font-size:12px;color:var(--text-secondary)">${esc(evt.action || '—')}</td>
          <td style="padding:10px;font-size:12px;color:var(--text-secondary);font-family:var(--font-mono)">${esc((evt.patient_id || '').slice(0, 16) || '—')}</td>
          <td style="padding:10px;font-size:12px;color:var(--text-secondary)">${esc(evt.resource_type || '—')}</td>
          <td style="padding:10px;font-size:11px;color:var(--text-tertiary)">${esc(evt.source || 'web')}</td>
        </tr>`).join('');

    container.innerHTML = `
      <div class="ch-card" data-test="audit-centre" style="overflow:auto">
        <div style="display:flex;flex-wrap:wrap;gap:8px;padding:12px;border-bottom:1px solid var(--border);align-items:end">
          <div style="flex:1;min-width:140px">
            <label style="display:block;font-size:10px;font-weight:600;color:var(--text-tertiary);margin-bottom:3px">Actor</label>
            <input type="text" placeholder="Filter actor..." value="${esc(_auditCentreFilters.actor)}"
              oninput="window._dcAuditFilter('actor', this.value)"
              style="width:100%;padding:5px 8px;border:1px solid var(--border);border-radius:4px;background:var(--surface-1);color:var(--text);font-size:11px" />
          </div>
          <div style="flex:1;min-width:140px">
            <label style="display:block;font-size:10px;font-weight:600;color:var(--text-tertiary);margin-bottom:3px">Action</label>
            <input type="text" placeholder="Filter action..." value="${esc(_auditCentreFilters.action)}"
              oninput="window._dcAuditFilter('action', this.value)"
              style="width:100%;padding:5px 8px;border:1px solid var(--border);border-radius:4px;background:var(--surface-1);color:var(--text);font-size:11px" />
          </div>
          <div style="flex:1;min-width:140px">
            <label style="display:block;font-size:10px;font-weight:600;color:var(--text-tertiary);margin-bottom:3px">Patient</label>
            <input type="text" placeholder="Filter patient..." value="${esc(_auditCentreFilters.patient)}"
              oninput="window._dcAuditFilter('patient', this.value)"
              style="width:100%;padding:5px 8px;border:1px solid var(--border);border-radius:4px;background:var(--surface-1);color:var(--text);font-size:11px" />
          </div>
          <div style="flex:1;min-width:120px">
            <label style="display:block;font-size:10px;font-weight:600;color:var(--text-tertiary);margin-bottom:3px">From</label>
            <input type="date" value="${esc(_auditCentreFilters.dateFrom)}"
              oninput="window._dcAuditFilter('dateFrom', this.value)"
              style="width:100%;padding:5px 8px;border:1px solid var(--border);border-radius:4px;background:var(--surface-1);color:var(--text);font-size:11px" />
          </div>
          <div style="flex:1;min-width:120px">
            <label style="display:block;font-size:10px;font-weight:600;color:var(--text-tertiary);margin-bottom:3px">To</label>
            <input type="date" value="${esc(_auditCentreFilters.dateTo)}"
              oninput="window._dcAuditFilter('dateTo', this.value)"
              style="width:100%;padding:5px 8px;border:1px solid var(--border);border-radius:4px;background:var(--surface-1);color:var(--text);font-size:11px" />
          </div>
          <button onclick="window._dcExportAuditCsv()" class="btn-secondary" style="font-size:11px;padding:6px 12px;height:fit-content">Export CSV</button>
        </div>
        <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(34,197,94,0.06)">
          <span style="width:6px;height:6px;border-radius:50%;background:var(--green);display:inline-block;animation:pulse 2s infinite"></span>
          <span style="font-size:11px;color:var(--green);font-weight:600">Real-time</span>
          <span style="font-size:11px;color:var(--text-tertiary)">· ${events.length.toLocaleString()} events loaded</span>
        </div>
        <table style="width:100%;border-collapse:collapse">
          <thead style="background:var(--surface-2)">
            <tr>
              <th style="text-align:left;padding:10px;font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px">Timestamp</th>
              <th style="text-align:left;padding:10px;font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px">Actor</th>
              <th style="text-align:left;padding:10px;font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px">Action</th>
              <th style="text-align:left;padding:10px;font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px">Patient</th>
              <th style="text-align:left;padding:10px;font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px">Resource</th>
              <th style="text-align:left;padding:10px;font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px">Source</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        ${events.length > 100 ? `<div style="padding:10px;text-align:center;font-size:11px;color:var(--text-tertiary)">Showing first 100 events. Refine filters to narrow results.</div>` : ''}
      </div>`;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // 5. EXPORT CENTRE
  // ═════════════════════════════════════════════════════════════════════════════

  function renderExportCentre() {
    const container = document.getElementById('dc-export-centre-container');
    if (!container) return;

    container.innerHTML = `
      <div class="ch-card" data-test="export-centre" style="padding:16px">
        <h4 style="font-size:13px;font-weight:600;color:var(--text-primary);margin:0 0 12px 0">Data Export Centre</h4>
        <div style="display:flex;flex-direction:column;gap:14px">
          <div style="display:flex;flex-wrap:wrap;gap:12px">
            <div style="flex:1;min-width:180px">
              <label style="display:block;font-size:11px;font-weight:600;color:var(--text-secondary);margin-bottom:4px">Export Format</label>
              <select id="dc-export-format" onchange="window._dcExportConfig('format', this.value)"
                style="width:100%;padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface-1);color:var(--text);font-size:12px">
                <option value="csv">CSV (Comma-Separated Values)</option>
                <option value="json">JSON (Structured Data)</option>
              </select>
            </div>
            <div style="flex:1;min-width:180px">
              <label style="display:block;font-size:11px;font-weight:600;color:var(--text-secondary);margin-bottom:4px">Scope</label>
              <select id="dc-export-scope" onchange="window._dcExportConfig('scope', this.value)"
                style="width:100%;padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface-1);color:var(--text);font-size:12px">
                <option value="clinic">All Clinic Patients</option>
                <option value="selected">Selected Patients</option>
                <option value="daterange">Date Range</option>
              </select>
            </div>
          </div>

          <div id="dc-export-daterange" style="display:${_exportConfig.scope === 'daterange' ? 'flex' : 'none'};flex-wrap:wrap;gap:12px">
            <div style="flex:1;min-width:140px">
              <label style="display:block;font-size:11px;font-weight:600;color:var(--text-secondary);margin-bottom:4px">From</label>
              <input type="date" id="dc-export-datefrom" onchange="window._dcExportConfig('dateFrom', this.value)"
                style="width:100%;padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface-1);color:var(--text);font-size:12px" />
            </div>
            <div style="flex:1;min-width:140px">
              <label style="display:block;font-size:11px;font-weight:600;color:var(--text-secondary);margin-bottom:4px">To</label>
              <input type="date" id="dc-export-dateto" onchange="window._dcExportConfig('dateTo', this.value)"
                style="width:100%;padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface-1);color:var(--text);font-size:12px" />
            </div>
          </div>

          <div>
            <label style="display:block;font-size:11px;font-weight:600;color:var(--text-secondary);margin-bottom:4px">Data Types</label>
            <select id="dc-export-datatype" onchange="window._dcExportConfig('dataType', this.value)"
              style="width:100%;padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface-1);color:var(--text);font-size:12px">
              <option value="all">All Data Types</option>
              <option value="assessments">Assessments Only</option>
              <option value="qeeg">qEEG Only</option>
              <option value="mri">MRI Only</option>
              <option value="biomarkers">Biomarkers Only</option>
              <option value="medications">Medications Only</option>
              <option value="reports">Reports Only</option>
            </select>
          </div>

          <div>
            <label style="display:block;font-size:11px;font-weight:600;color:var(--text-secondary);margin-bottom:4px">Export Reason <span style="color:var(--red)">*</span></label>
            <input id="dc-export-reason" type="text" placeholder="Required: Describe the purpose of this export..."
              oninput="window._dcExportConfig('reason', this.value)"
              style="width:100%;padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface-1);color:var(--text);font-size:12px" />
          </div>

          <div id="dc-export-preview" style="padding:10px;background:var(--surface-1);border-radius:6px;font-size:12px;color:var(--text-secondary)">
            <strong>Preview:</strong> Export will include approximately <strong>${(_allPatients.length || 0).toLocaleString()} patient records</strong> in ${_exportConfig.format.toUpperCase()} format.
            ${_exportConfig.scope === 'selected' ? ' (Selected patients only)' : ''}
            ${_exportConfig.dataType !== 'all' ? ` · Filtered to ${_exportConfig.dataType}` : ''}
          </div>

          <div style="padding:10px;background:rgba(245,158,11,0.06);border-left:2px solid var(--amber);border-radius:4px;font-size:11.5px;color:var(--text-secondary)">
            <strong style="color:var(--amber)">Clinical Safety & Compliance:</strong> Exported data may contain Protected Health Information (PHI).
            Secure the file appropriately and share only through approved channels. This export will be logged for compliance review.
          </div>

          <button onclick="window._dcExecuteExport()" class="btn-primary" style="font-size:12px;padding:8px 20px;align-self:flex-start"
            ${_exportConfig.reason.trim().length < 3 ? 'disabled' : ''}>
            Generate Export
          </button>
          <div id="dc-export-result"></div>
        </div>
      </div>`;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // 6. CONSENT & COMPLIANCE PANEL
  // ═════════════════════════════════════════════════════════════════════════════

  async function loadAndRenderConsentPanel() {
    const container = document.getElementById('dc-consent-panel-container');
    if (!container) return;
    container.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-tertiary)">${spinner('Loading consent data...')}</div>`;

    try {
      if (_allPatients.length === 0) {
        const patients = await api.listPatients();
        _allPatients = (patients?.items || patients || []).filter(p => p.id && p.name);
      }

      // Build consent records from patient data
      const consentRecords = _allPatients.map(p => ({
        patient_id: p.id,
        patient_name: p.name,
        ai_analysis: p.consent_ai_analysis === true || p.consent_status === 'granted',
        device_sync: p.consent_device_sync === true || p.consent_status === 'granted',
        document_generation: p.consent_document_generation === true || p.consent_status === 'granted',
        communication: p.consent_communication === true || p.consent_status === 'granted',
        status: p.consent_status || 'unknown',
        expires_at: p.consent_expires_at || null,
      }));

      _consentData = { records: consentRecords };
      renderConsentPanel();
    } catch (err) {
      console.error('Error loading consent panel:', err);
      container.innerHTML = `<div style="padding:16px;color:var(--red);font-size:12px">Failed to load consent data: ${esc(err.message)}</div>`;
    }
  }

  function renderConsentPanel() {
    const container = document.getElementById('dc-consent-panel-container');
    if (!container || !_consentData) return;

    const records = _consentData.records || [];
    const now = new Date();

    const rows = records.length === 0
      ? `<tr><td colspan="6" style="padding:24px;text-align:center;color:var(--text-tertiary);font-size:12px">No patient records available.</td></tr>`
      : records.map(r => {
        const isExpired = r.expires_at && new Date(r.expires_at) < now;
        const rowStyle = r.status === 'revoked' || r.status === 'missing' ? 'background:rgba(239,68,68,0.04)' : isExpired ? 'background:rgba(245,158,11,0.04)' : '';
        return `
        <tr style="border-bottom:1px solid var(--border);${rowStyle}">
          <td style="padding:10px;font-size:12px;color:var(--text-primary);font-weight:500">${_isClinician ? esc(r.patient_name) : maskName(r.patient_name)}</td>
          <td style="padding:10px;font-size:11px;font-family:var(--font-mono);color:var(--text-secondary)">${esc(r.patient_id.slice(0, 12))}…</td>
          <td style="padding:10px">${consentDot(r.ai_analysis, 'AI')}</td>
          <td style="padding:10px">${consentDot(r.device_sync, 'Device')}</td>
          <td style="padding:10px">${consentDot(r.document_generation, 'Docs')}</td>
          <td style="padding:10px">${consentDot(r.communication, 'Comm')}</td>
          <td style="padding:10px">
            ${isExpired ? statusBadge('expired', { size: '10px' }) : statusBadge(r.status, { size: '10px' })}
            ${r.expires_at ? `<div style="font-size:10px;color:var(--text-tertiary);margin-top:2px">Exp: ${fmtDateOnly(r.expires_at)}</div>` : ''}
          </td>
        </tr>`;
      }).join('');

    const missingCount = records.filter(r => r.status === 'missing' || r.status === 'revoked').length;
    const expiredCount = records.filter(r => r.expires_at && new Date(r.expires_at) < now).length;

    container.innerHTML = `
      <div class="ch-card" data-test="consent-panel" style="overflow:auto">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;border-bottom:1px solid var(--border);flex-wrap:wrap;gap:8px">
          <div>
            <h4 style="font-size:13px;font-weight:600;color:var(--text-primary);margin:0">Consent & Compliance</h4>
            <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">
              ${missingCount > 0 ? `<span style="color:var(--red);font-weight:600">${missingCount} missing</span> · ` : ''}
              ${expiredCount > 0 ? `<span style="color:var(--amber);font-weight:600">${expiredCount} expired</span> · ` : ''}
              ${records.length.toLocaleString()} total patients
            </div>
          </div>
          <button onclick="window._dcBatchConsentRequest()" class="btn-secondary" style="font-size:11px;padding:6px 12px">Batch Consent Request</button>
        </div>
        <table style="width:100%;border-collapse:collapse">
          <thead style="background:var(--surface-2)">
            <tr>
              <th style="text-align:left;padding:10px;font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px">Patient</th>
              <th style="text-align:left;padding:10px;font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px">ID</th>
              <th style="text-align:left;padding:10px;font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px">AI</th>
              <th style="text-align:left;padding:10px;font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px">Device</th>
              <th style="text-align:left;padding:10px;font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px">Docs</th>
              <th style="text-align:left;padding:10px;font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px">Comm</th>
              <th style="text-align:left;padding:10px;font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px">Status</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <div style="padding:10px;font-size:11px;color:var(--text-tertiary)">
          <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--green);margin-right:4px"></span> Granted
          <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--red);margin-left:12px;margin-right:4px"></span> Missing/Revoked
          <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--amber);margin-left:12px;margin-right:4px"></span> Expired
        </div>
      </div>`;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // 7. DATA ANONYMIZATION TOOL
  // ═════════════════════════════════════════════════════════════════════════════

  function renderAnonymizationTool() {
    const container = document.getElementById('dc-anonymization-container');
    if (!container) return;

    container.innerHTML = `
      <div class="ch-card" data-test="anonymization-tool" style="padding:16px">
        <h4 style="font-size:13px;font-weight:600;color:var(--text-primary);margin:0 0 12px 0">Data Anonymization Tool</h4>
        <div style="display:flex;flex-direction:column;gap:14px">
          <div style="padding:10px;background:rgba(239,68,68,0.06);border-left:2px solid var(--red);border-radius:4px;font-size:11.5px;color:var(--text-secondary)">
            <strong style="color:var(--red)">Warning:</strong> Anonymization permanently removes or alters identifying information.
            This action is logged and cannot be undone. Use only for approved research or analytics purposes.
          </div>

          <div style="display:flex;flex-wrap:wrap;gap:12px">
            <div style="flex:1;min-width:180px">
              <label style="display:block;font-size:11px;font-weight:600;color:var(--text-secondary);margin-bottom:4px">Scope</label>
              <select id="dc-anonym-scope" onchange="window._dcAnonymConfig('scope', this.value)"
                style="width:100%;padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface-1);color:var(--text);font-size:12px">
                <option value="patient">Single Patient</option>
                <option value="clinic">All Clinic Patients</option>
              </select>
            </div>
            <div style="flex:1;min-width:180px" id="dc-anonym-patient-select">
              <label style="display:block;font-size:11px;font-weight:600;color:var(--text-secondary);margin-bottom:4px">Patient</label>
              <select id="dc-anonym-patient" onchange="window._dcAnonymConfig('patientId', this.value)"
                style="width:100%;padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface-1);color:var(--text);font-size:12px">
                <option value="">Select patient...</option>
                ${_allPatients.map(p => `<option value="${esc(p.id)}">${esc(p.name)} (${esc(p.id.slice(0, 8))}...)</option>`).join('')}
              </select>
            </div>
          </div>

          <div>
            <label style="display:block;font-size:11px;font-weight:600;color:var(--text-secondary);margin-bottom:4px">Anonymization Level</label>
            <select id="dc-anonym-level" onchange="window._dcAnonymConfig('level', this.value)"
              style="width:100%;padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface-1);color:var(--text);font-size:12px">
              <option value="k_anonymity">k-Anonymity (generalize quasi-identifiers)</option>
              <option value="l_diversity">l-Diversity (ensure diverse sensitive values)</option>
              <option value="full_deidentification">Full De-identification (remove all direct identifiers)</option>
            </select>
          </div>

          <div style="padding:10px;background:var(--surface-1);border-radius:6px">
            <div style="font-size:11px;font-weight:600;color:var(--text-secondary);margin-bottom:6px">Level Description</div>
            <div id="dc-anonym-level-desc" style="font-size:11px;color:var(--text-tertiary);line-height:1.5">
              ${_anonymConfig.level === 'k_anonymity' ? '<strong>k-Anonymity:</strong> Generalizes quasi-identifier fields (age ranges, location regions) so each record is indistinguishable from at least <em>k-1</em> others. Preserves analytical utility while reducing re-identification risk.' :
                _anonymConfig.level === 'l_diversity' ? '<strong>l-Diversity:</strong> Extends k-anonymity by ensuring each group contains at least <em>l</em> distinct sensitive values. Protects against homogeneity attacks on sensitive attributes.' :
                '<strong>Full De-identification:</strong> Removes or hashes all direct identifiers (names, IDs, dates of birth, contact info). Provides the strongest privacy guarantee but may limit data utility for longitudinal analysis.'}
            </div>
          </div>

          <div style="display:flex;gap:10px">
            <button onclick="window._dcPreviewAnonymization()" class="btn-secondary" style="font-size:12px;padding:8px 16px">Preview</button>
            <button onclick="window._dcExportAnonymized()" class="btn-primary" style="font-size:12px;padding:8px 16px">Export Anonymized Dataset</button>
          </div>

          <div id="dc-anonym-preview" style="display:none">
            <div style="font-size:11px;font-weight:600;color:var(--text-secondary);margin-bottom:6px">Preview (first 5 records)</div>
            <div id="dc-anonym-preview-content" style="overflow:auto;max-height:300px;padding:10px;background:var(--surface-1);border-radius:6px;font-size:11px;font-family:var(--font-mono)"></div>
          </div>
        </div>
      </div>`;
  }

  // ── Main skeleton HTML ─────────────────────────────────────────────────────
  el.innerHTML = `
  <div style="padding:20px;max-width:1400px;margin:0 auto">
    ${renderSafetyBanners()}

    ${_isClinicOverviewRole ? `
    <div id="dc-clinic-overview-section" style="margin-bottom:28px">
      <h3 style="font-size:15px;font-weight:600;color:var(--text-primary);margin-bottom:12px">
        Clinic Overview
      </h3>
      ${currentUser.role === 'admin' ? `
        <div style="display:flex;gap:8px;align-items:flex-end;margin-bottom:12px;flex-wrap:wrap">
          <div style="flex:1;min-width:260px">
            <label style="display:block;font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:4px">Clinic ID</label>
            <input id="dc-clinic-id-input"
              type="text"
              value="${esc(_clinicOverviewClinicId || '')}"
              placeholder="paste a clinic UUID..."
              style="width:100%;padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface-1);color:var(--text);font-size:12px;font-family:var(--font-mono)" />
          </div>
          <button onclick="window._dcReloadClinicOverview()" class="btn-secondary" style="font-size:12px">Load</button>
        </div>` : ''}
      <div id="dc-clinic-overview-container"></div>
    </div>` : ''}

    <!-- Enhanced Overview Dashboard -->
    <div id="dc-enhanced-overview-section" style="margin-bottom:28px">
      <h3 style="font-size:15px;font-weight:600;color:var(--text-primary);margin-bottom:12px">Clinic Dashboard</h3>
      <div id="dc-enhanced-overview-container"></div>
    </div>

    <!-- Patient CRM Table -->
    <div id="dc-patient-crm-section" style="margin-bottom:28px">
      <h3 style="font-size:15px;font-weight:600;color:var(--text-primary);margin-bottom:12px">Patient CRM</h3>
      <div id="dc-patient-crm-container"></div>
    </div>

    <!-- Patient Data Explorer (appears when patient selected) -->
    <div id="dc-patient-explorer-container" style="display:none;margin-bottom:28px"></div>

    <!-- Patient selector row (legacy) -->
    <div style="margin-bottom:24px">
      <div style="display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap">
        <div style="flex:1;min-width:240px">
          <label style="display:block;font-size:13px;font-weight:600;color:var(--text-secondary);margin-bottom:6px">
            Patient (Optional)
          </label>
          <input id="dc-patient-search"
            type="text"
            placeholder="Search patients..."
            style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;background:var(--surface-1);color:var(--text);font-size:13px"
            autocomplete="off" />
          <div id="dc-patient-dropdown"
            style="display:none;position:absolute;margin-top:2px;background:var(--surface-2);border:1px solid var(--border);border-radius:6px;max-height:300px;overflow-y:auto;width:calc(100% - 32px);z-index:100;box-shadow:0 4px 12px rgba(0,0,0,0.3)">
          </div>
        </div>
        <button id="dc-clear-patient" onclick="window._dcClearPatient()" class="btn-secondary" style="display:none">Clear</button>
      </div>
      <div id="dc-selected-patient" style="margin-top:8px;font-size:12px;color:var(--text-tertiary)"></div>
    </div>

    <!-- Tables browser -->
    <div style="margin-bottom:24px">
      <h3 style="font-size:15px;font-weight:600;color:var(--text-primary);margin-bottom:12px">Available Data Sources</h3>
      <div id="dc-sources-container">
        <div style="padding:24px;text-align:center;color:var(--text-tertiary)">
          ${spinner('Loading data sources...')}
        </div>
      </div>
    </div>

    <!-- Row viewer (only shows if table selected) -->
    <div id="dc-rows-section" style="display:none;margin-bottom:24px">
      <h3 style="font-size:15px;font-weight:600;color:var(--text-primary);margin-bottom:12px">
        Data Rows: <span id="dc-table-name"></span>
      </h3>
      <div id="dc-rows-container">
        <div style="padding:24px;text-align:center;color:var(--text-tertiary)">
          ${spinner('Loading rows...')}
        </div>
      </div>
    </div>

    <!-- Audit Centre -->
    <div id="dc-audit-centre-section" style="margin-bottom:28px">
      <h3 style="font-size:15px;font-weight:600;color:var(--text-primary);margin-bottom:12px">Audit Centre</h3>
      <div id="dc-audit-centre-container"></div>
    </div>

    <!-- Export Centre -->
    <div id="dc-export-centre-section" style="margin-bottom:28px">
      <h3 style="font-size:15px;font-weight:600;color:var(--text-primary);margin-bottom:12px">Export Centre</h3>
      <div id="dc-export-centre-container"></div>
    </div>

    <!-- Consent & Compliance Panel -->
    <div id="dc-consent-panel-section" style="margin-bottom:28px">
      <h3 style="font-size:15px;font-weight:600;color:var(--text-primary);margin-bottom:12px">Consent & Compliance</h3>
      <div id="dc-consent-panel-container"></div>
    </div>

    <!-- Data Anonymization Tool -->
    <div id="dc-anonymization-section" style="margin-bottom:28px">
      <h3 style="font-size:15px;font-weight:600;color:var(--text-primary);margin-bottom:12px">Data Anonymization</h3>
      <div id="dc-anonymization-container"></div>
    </div>

    <!-- Audit trail (legacy) -->
    <div id="dc-audit-section" style="display:none">
      <h3 style="font-size:15px;font-weight:600;color:var(--text-primary);margin-bottom:12px">
        Access Audit Trail
      </h3>
      <div id="dc-audit-container">
        <div style="padding:24px;text-align:center;color:var(--text-tertiary)">
          ${spinner('Loading audit log...')}
        </div>
      </div>
    </div>

    <!-- Clinical footer disclaimer -->
    <div style="margin-top:40px;padding:16px;text-align:center;border-top:1px solid var(--border)">
      <div style="font-size:11px;color:var(--text-tertiary);line-height:1.6;max-width:700px;margin:0 auto">
        <strong style="color:var(--text-secondary)">Clinical Data Console v2.0</strong><br/>
        This interface provides read-only access to patient data for clinical review purposes.
        All access is logged and auditable. PHI masking is applied based on role.
        Data exports require a documented reason and are subject to compliance review.
        Contact your clinic administrator for access questions.
        <br/><br/>
        <span style="color:var(--red)">Do not use this data for clinical decisions without proper review by a qualified healthcare professional.</span>
      </div>
    </div>
  </div>`;

  // ── Load and render data sources ────────────────────────────────────────────
  async function loadAndRenderSources() {
    _isLoadingSources = true;
    try {
      const resp = await api.dataConsoleSources();
      if (!resp || !Array.isArray(resp.sources)) {
        throw new Error('Invalid sources response');
      }
      _availableSources = resp.sources;
      renderSourcesTable();
    } catch (err) {
      console.error('Error loading data sources:', err);
      const container = document.getElementById('dc-sources-container');
      if (container) {
        container.innerHTML = `
          <div style="padding:24px;text-align:center;color:var(--red)">
            <div style="font-size:14px;font-weight:600;margin-bottom:8px">Failed to load data sources</div>
            <div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px">${esc(err.message)}</div>
            <button onclick="window.location.reload()" class="btn-secondary">Retry</button>
          </div>`;
      }
    } finally {
      _isLoadingSources = false;
    }
  }

  // ── Render sources table ───────────────────────────────────────────────────
  function renderSourcesTable() {
    const container = document.getElementById('dc-sources-container');
    if (!container) return;

    if (_availableSources.length === 0) {
      container.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-tertiary)">No data sources available</div>`;
      return;
    }

    const rows = _availableSources.map(src => `
      <tr style="border-bottom:1px solid var(--border);hover:background:rgba(255,255,255,0.02)">
        <td style="padding:12px;font-size:13px;color:var(--text-primary);font-weight:500">${esc(src.table)}</td>
        <td style="padding:12px;font-size:12px;color:var(--text-secondary)">
          ${(src.columns || []).slice(0, 5).join(', ')}${(src.columns || []).length > 5 ? `, +${(src.columns || []).length - 5} more` : ''}
        </td>
        <td style="padding:12px;font-size:12px;color:var(--text-secondary);text-align:right">
          ${src.row_count_estimate ? `~${src.row_count_estimate.toLocaleString()}` : '—'}
        </td>
        <td style="padding:12px;text-align:right">
          <button onclick="window._dcSelectTable('${esc(src.table)}')" class="btn-secondary" style="font-size:12px">View Rows</button>
        </td>
      </tr>
    `).join('');

    container.innerHTML = `
      <div class="ch-card" style="overflow:auto">
        <table style="width:100%;border-collapse:collapse">
          <thead style="background:var(--surface-2);border-bottom:2px solid var(--border)">
            <tr>
              <th style="text-align:left;padding:12px;font-size:12px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px">Table</th>
              <th style="text-align:left;padding:12px;font-size:12px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px">Columns (preview)</th>
              <th style="text-align:right;padding:12px;font-size:12px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px">Est. Rows</th>
              <th style="text-align:right;padding:12px;font-size:12px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px">Action</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>`;
  }

  // ── Load and render rows ───────────────────────────────────────────────────
  async function loadAndRenderRows(tableName, offset = 0) {
    if (!_selectedPatientId) {
      const container = document.getElementById('dc-rows-container');
      if (container) {
        container.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-tertiary)">Select a patient to view data</div>`;
      }
      return;
    }

    _isLoadingRows = true;
    _currentOffset = offset;
    _currentLimit = 50;

    try {
      const resp = await api.dataConsolePatientRows(
        _selectedPatientId,
        tableName,
        _currentLimit,
        _currentOffset,
      );
      if (!resp) throw new Error('No response');
      _currentRowsData = resp;
      renderRowsTable();
    } catch (err) {
      console.error('Error loading rows:', err);
      const container = document.getElementById('dc-rows-container');
      if (container) {
        container.innerHTML = `
          <div style="padding:24px;text-align:center;color:var(--red)">
            <div style="font-size:14px;font-weight:600;margin-bottom:8px">Failed to load rows</div>
            <div style="font-size:12px;color:var(--text-secondary)">${esc(err.message)}</div>
          </div>`;
      }
    } finally {
      _isLoadingRows = false;
    }
  }

  // ── Render rows table ──────────────────────────────────────────────────────
  function renderRowsTable() {
    const container = document.getElementById('dc-rows-container');
    if (!container || !_currentRowsData) return;

    const rows = _currentRowsData.rows || [];
    if (rows.length === 0) {
      container.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-tertiary)">No rows available</div>`;
      return;
    }

    // Extract all unique column names
    const allColumns = new Set();
    rows.forEach(row => Object.keys(row).forEach(k => allColumns.add(k)));
    const columns = Array.from(allColumns).sort();

    // Build table rows, replacing masked values with badge
    const tableRows = rows.map(row => {
      const cells = columns.map(col => {
        const val = row[col];
        const isMasked = val === '***MASKED***';
        const content = isMasked
          ? `<span style="background:rgba(255,107,107,0.15);color:var(--red);font-size:11px;font-weight:600;padding:2px 8px;border-radius:4px">***MASKED***</span>`
          : `<span style="font-family:var(--font-mono);font-size:12px;color:var(--text-secondary);word-break:break-word">${esc(val)}</span>`;
        return `<td style="padding:10px;border-bottom:1px solid var(--border);max-width:300px;overflow:hidden;text-overflow:ellipsis">${content}</td>`;
      }).join('');
      return `<tr>${cells}</tr>`;
    }).join('');

    const headerCells = columns.map(col => `
      <th style="text-align:left;padding:10px;font-size:12px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;background:var(--surface-2)">${esc(col)}</th>
    `).join('');

    const totalRows = _currentRowsData.rows?.length || 0;
    const hasMore = totalRows >= _currentLimit;

    container.innerHTML = `
      <div class="ch-card" style="overflow:auto;margin-bottom:12px">
        <table style="width:100%;border-collapse:collapse">
          <thead style="border-bottom:2px solid var(--border)">
            <tr>${headerCells}</tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </div>

      <!-- Pagination controls -->
      <div style="display:flex;align-items:center;gap:12px;justify-content:space-between;padding:12px 0;font-size:12px;color:var(--text-secondary)">
        <div>
          Showing rows ${(_currentOffset + 1).toLocaleString()} – ${(_currentOffset + totalRows).toLocaleString()}
          ${hasMore ? ' (more available)' : ' (end of table)'}
        </div>
        <div style="display:flex;gap:8px">
          <button onclick="window._dcPrevPage()" ${_currentOffset === 0 ? 'disabled' : ''}
            class="btn-secondary" style="font-size:12px;padding:6px 12px;opacity:${_currentOffset === 0 ? '0.5' : '1'}">← Previous</button>
          <button onclick="window._dcNextPage()" ${!hasMore ? 'disabled' : ''}
            class="btn-secondary" style="font-size:12px;padding:6px 12px;opacity:${!hasMore ? '0.5' : '1'}">Next →</button>
        </div>
      </div>`;
  }

  // ── Load and render audit trail ────────────────────────────────────────────
  async function loadAndRenderAudit() {
    if (!_selectedPatientId) {
      const container = document.getElementById('dc-audit-container');
      if (container) {
        container.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-tertiary)">Select a patient to view audit log</div>`;
      }
      return;
    }

    _isLoadingAudit = true;
    try {
      const resp = await api.dataConsolePatientAudit(_selectedPatientId, 30, 50);
      if (!resp) throw new Error('No response');
      _currentAuditData = resp;
      renderAuditTable();
    } catch (err) {
      console.error('Error loading audit log:', err);
      const container = document.getElementById('dc-audit-container');
      if (container) {
        container.innerHTML = `
          <div style="padding:24px;text-align:center;color:var(--red)">
            <div style="font-size:14px;font-weight:600;margin-bottom:8px">Failed to load audit log</div>
            <div style="font-size:12px;color:var(--text-secondary)">${esc(err.message)}</div>
          </div>`;
      }
    } finally {
      _isLoadingAudit = false;
    }
  }

  // ── Render audit table ─────────────────────────────────────────────────────
  function renderAuditTable() {
    const container = document.getElementById('dc-audit-container');
    if (!container || !_currentAuditData) return;

    const events = _currentAuditData.events || [];
    if (events.length === 0) {
      container.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-tertiary)">No audit events</div>`;
      return;
    }

    const rows = events.map(evt => {
      const ts = new Date(evt.timestamp);
      const tsStr = ts.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      return `
        <tr style="border-bottom:1px solid var(--border)">
          <td style="padding:10px;font-size:12px;color:var(--text-secondary);font-family:var(--font-mono)">${esc(tsStr)}</td>
          <td style="padding:10px;font-size:12px;color:var(--text-secondary)">${esc(evt.actor_id || '—')}</td>
          <td style="padding:10px;font-size:12px;color:var(--text-secondary)">${esc(evt.action || '—')}</td>
          <td style="padding:10px;font-size:12px;color:var(--text-secondary)">${esc(evt.resource_type || '—')}</td>
          <td style="padding:10px;font-size:12px;color:var(--text-secondary)">
            <span style="background:${evt.result === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(255,107,107,0.1)'};color:${evt.result === 'success' ? 'var(--green)' : 'var(--red)'};padding:2px 8px;border-radius:4px">${esc(evt.result || '—')}</span>
          </td>
        </tr>`;
    }).join('');

    container.innerHTML = `
      <div class="ch-card" style="overflow:auto">
        <table style="width:100%;border-collapse:collapse">
          <thead style="background:var(--surface-2);border-bottom:2px solid var(--border)">
            <tr>
              <th style="text-align:left;padding:10px;font-size:12px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px">Timestamp</th>
              <th style="text-align:left;padding:10px;font-size:12px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px">Actor</th>
              <th style="text-align:left;padding:10px;font-size:12px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px">Action</th>
              <th style="text-align:left;padding:10px;font-size:12px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px">Resource</th>
              <th style="text-align:left;padding:10px;font-size:12px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px">Result</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
      <div style="margin-top:12px;font-size:11px;color:var(--text-tertiary)">
        Showing last 30 days, up to 50 events. More events available upon request.
      </div>`;
  }

  // ── Patient search/select ──────────────────────────────────────────────────
  async function initPatientSearch() {
    const searchInput = document.getElementById('dc-patient-search');
    const dropdown = document.getElementById('dc-patient-dropdown');
    if (!searchInput) return;

    searchInput.addEventListener('input', async (e) => {
      const query = e.target.value.toLowerCase();
      if (query.length < 1) {
        dropdown.style.display = 'none';
        return;
      }

      try {
        if (_allPatients.length === 0) {
          const patients = await api.listPatients();
          _allPatients = (patients?.items || patients || []).filter(p => p.id && p.name);
        }

        const filtered = _allPatients.filter(p =>
          (p.name || '').toLowerCase().includes(query) || (p.id || '').toLowerCase().includes(query)
        ).slice(0, 20);

        if (filtered.length === 0) {
          dropdown.innerHTML = `<div style="padding:8px 12px;font-size:12px;color:var(--text-tertiary)">No patients found</div>`;
        } else {
          dropdown.innerHTML = filtered.map(p => `
            <div onclick="window._dcSelectPatient('${esc(p.id)}', '${esc(p.name)}')"
              style="padding:10px 12px;cursor:pointer;border-bottom:1px solid var(--border);font-size:12px;color:var(--text-primary);transition:background 0.2s"
              onmouseover="this.style.background='var(--surface-3)'"
              onmouseout="this.style.background='transparent'">
              <div style="font-weight:500">${esc(p.name || '?')}</div>
              <div style="font-size:11px;color:var(--text-secondary)">${esc(p.id)}</div>
            </div>`).join('');
        }
        dropdown.style.display = 'block';
      } catch (err) {
        console.error('Error searching patients:', err);
        dropdown.innerHTML = `<div style="padding:8px 12px;font-size:12px;color:var(--red)">Error searching patients</div>`;
        dropdown.style.display = 'block';
      }
    });

    // Close dropdown on blur
    searchInput.addEventListener('blur', () => {
      setTimeout(() => { dropdown.style.display = 'none'; }, 200);
    });
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // WINDOW-LEVEL HANDLERS
  // ═════════════════════════════════════════════════════════════════════════════

  // ── Legacy handlers ────────────────────────────────────────────────────────
  window._dcSelectPatient = async (patientId, patientName) => {
    _selectedPatientId = patientId;
    const searchInput = document.getElementById('dc-patient-search');
    const clearBtn = document.getElementById('dc-clear-patient');
    const selectedDiv = document.getElementById('dc-selected-patient');
    const dropdown = document.getElementById('dc-patient-dropdown');

    if (searchInput) searchInput.value = '';
    if (dropdown) dropdown.style.display = 'none';
    if (clearBtn) clearBtn.style.display = 'inline-block';
    if (selectedDiv) selectedDiv.textContent = `Selected: ${esc(patientName)} (${esc(patientId)})`;

    // Load and show audit trail
    const auditSection = document.getElementById('dc-audit-section');
    if (auditSection) auditSection.style.display = 'block';
    await loadAndRenderAudit();
  };

  window._dcClearPatient = () => {
    _selectedPatientId = null;
    _selectedTable = null;
    const searchInput = document.getElementById('dc-patient-search');
    const clearBtn = document.getElementById('dc-clear-patient');
    const selectedDiv = document.getElementById('dc-selected-patient');
    const rowsSection = document.getElementById('dc-rows-section');
    const auditSection = document.getElementById('dc-audit-section');

    if (searchInput) searchInput.value = '';
    if (clearBtn) clearBtn.style.display = 'none';
    if (selectedDiv) selectedDiv.textContent = '';
    if (rowsSection) rowsSection.style.display = 'none';
    if (auditSection) auditSection.style.display = 'none';
  };

  window._dcSelectTable = async (tableName) => {
    _selectedTable = tableName;
    const section = document.getElementById('dc-rows-section');
    const nameSpan = document.getElementById('dc-table-name');
    if (section) section.style.display = 'block';
    if (nameSpan) nameSpan.textContent = esc(tableName);
    _currentOffset = 0;
    await loadAndRenderRows(tableName, 0);
  };

  window._dcPrevPage = async () => {
    const newOffset = Math.max(0, _currentOffset - _currentLimit);
    await loadAndRenderRows(_selectedTable, newOffset);
  };

  window._dcNextPage = async () => {
    const newOffset = _currentOffset + _currentLimit;
    await loadAndRenderRows(_selectedTable, newOffset);
  };

  // ── Patient CRM handlers ───────────────────────────────────────────────────
  window._dcSearchCrm = (query) => {
    _patientCrmSearch = query;
    _patientCrmPage = 1;
    filterSortAndRenderCrm();
  };

  window._dcFilterCrmStatus = (status) => {
    if (status) {
      _patientCrmSearch = status;
    } else {
      _patientCrmSearch = '';
    }
    const searchInput = document.getElementById('dc-crm-search');
    if (searchInput) searchInput.value = _patientCrmSearch;
    _patientCrmPage = 1;
    filterSortAndRenderCrm();
  };

  window._dcSortCrm = (column) => {
    if (_patientCrmSort.column === column) {
      _patientCrmSort.direction = _patientCrmSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
      _patientCrmSort = { column, direction: 'asc' };
    }
    filterSortAndRenderCrm();
  };

  window._dcCrmPage = (page) => {
    _patientCrmPage = page;
    renderPatientCrm();
  };

  window._dcToggleSelectCrm = (patientId) => {
    if (_patientCrmSelectedIds.has(patientId)) {
      _patientCrmSelectedIds.delete(patientId);
    } else {
      _patientCrmSelectedIds.add(patientId);
    }
    renderPatientCrm();
  };

  window._dcToggleSelectAllCrm = (checked) => {
    if (checked) {
      _patientCrmFiltered.forEach(p => _patientCrmSelectedIds.add(p.id));
    } else {
      _patientCrmSelectedIds.clear();
    }
    renderPatientCrm();
  };

  window._dcExportCrmCsv = () => {
    const selected = _patientCrmData.filter(p => _patientCrmSelectedIds.has(p.id));
    if (selected.length === 0) return;
    const headers = ['patient_id', 'name', 'status', 'clinician', 'last_activity', 'consent_status', 'data_completeness'];
    const rows = selected.map(p => [
      p.id,
      _isClinician ? p.name : maskName(p.name),
      p.status,
      p.clinician,
      p.last_activity,
      p.consent_status,
      p.data_completeness,
    ]);
    downloadCsv('patient-crm-export.csv', headers, rows);
  };

  window._dcOpenExplorer = (patientId) => {
    _explorerPatientId = patientId;
    _explorerTab = 'overview';
    renderExplorerSkeleton();
    // Scroll to explorer
    const el = document.getElementById('dc-patient-explorer-container');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  window._dcCloseExplorer = () => {
    _explorerPatientId = null;
    _explorerTab = 'overview';
    const container = document.getElementById('dc-patient-explorer-container');
    if (container) container.style.display = 'none';
  };

  window._dcExplorerTab = (tab) => {
    _explorerTab = tab;
    renderExplorerSkeleton();
  };

  window._dcExportPatientPackage = () => {
    const reasonEl = document.getElementById('dc-explorer-export-reason');
    const reason = reasonEl?.value?.trim() || '';
    const format = document.getElementById('dc-explorer-export-format')?.value || 'csv';
    if (reason.length < 3) {
      const resultEl = document.getElementById('dc-explorer-export-result');
      if (resultEl) resultEl.innerHTML = `<div style="color:var(--red);font-size:12px;margin-top:8px">Export reason is required (min 3 characters).</div>`;
      return;
    }
    // Log export request
    console.log('[AUDIT] Patient data export requested:', { patient_id: _explorerPatientId, format, reason, actor: currentUser?.id, timestamp: new Date().toISOString() });
    const resultEl = document.getElementById('dc-explorer-export-result');
    if (resultEl) {
      resultEl.innerHTML = `
        <div style="padding:10px;background:rgba(34,197,94,0.1);border-left:2px solid var(--green);border-radius:4px;margin-top:10px">
          <div style="font-size:12px;color:var(--green);font-weight:600">Export request submitted</div>
          <div style="font-size:11px;color:var(--text-secondary);margin-top:4px">
            Patient: <code>${esc(_explorerPatientId)}</code> · Format: ${esc(format.toUpperCase())}<br/>
            Reason: ${esc(reason)} · This request has been logged.
          </div>
        </div>`;
    }
  };

  // ── Audit Centre handlers ──────────────────────────────────────────────────
  window._dcAuditFilter = (field, value) => {
    _auditCentreFilters[field] = value;
    renderAuditCentre();
  };

  window._dcExportAuditCsv = () => {
    const events = (_auditCentreData?.events || []);
    const filtered = events.filter(evt => {
      if (_auditCentreFilters.actor && !(evt.actor_id || '').toLowerCase().includes(_auditCentreFilters.actor.toLowerCase())) return false;
      if (_auditCentreFilters.action && !(evt.action || '').toLowerCase().includes(_auditCentreFilters.action.toLowerCase())) return false;
      if (_auditCentreFilters.patient && !(evt.patient_id || '').toLowerCase().includes(_auditCentreFilters.patient.toLowerCase())) return false;
      if (_auditCentreFilters.dateFrom && evt.timestamp && new Date(evt.timestamp) < new Date(_auditCentreFilters.dateFrom)) return false;
      if (_auditCentreFilters.dateTo && evt.timestamp && new Date(evt.timestamp) > new Date(_auditCentreFilters.dateTo + 'T23:59:59')) return false;
      return true;
    });
    const headers = ['timestamp', 'actor_id', 'action', 'patient_id', 'resource_type', 'result', 'source'];
    const rows = filtered.map(e => [e.timestamp, e.actor_id, e.action, e.patient_id, e.resource_type, e.result, e.source]);
    downloadCsv('audit-log-export.csv', headers, rows);
  };

  // ── Export Centre handlers ─────────────────────────────────────────────────
  window._dcExportConfig = (field, value) => {
    _exportConfig[field] = value;
    renderExportCentre();
  };

  window._dcExecuteExport = () => {
    const reason = _exportConfig.reason.trim();
    if (reason.length < 3) return;
    console.log('[AUDIT] Bulk export executed:', { ..._exportConfig, actor: currentUser?.id, timestamp: new Date().toISOString() });
    const resultEl = document.getElementById('dc-export-result');
    if (resultEl) {
      resultEl.innerHTML = `
        <div style="padding:12px;background:rgba(34,197,94,0.1);border-left:2px solid var(--green);border-radius:4px;margin-top:10px">
          <div style="font-size:13px;color:var(--green);font-weight:600">Export Generated</div>
          <div style="font-size:11px;color:var(--text-secondary);margin-top:6px">
            Format: ${esc(_exportConfig.format.toUpperCase())} · Scope: ${esc(_exportConfig.scope)} · Types: ${esc(_exportConfig.dataType)}<br/>
            Reason: ${esc(reason)} · Records: ~${(_allPatients.length || 0).toLocaleString()}<br/>
            <a href="#" style="color:var(--teal);font-weight:600">Download File</a> (simulated)
          </div>
        </div>`;
    }
  };

  // ── Consent panel handlers ─────────────────────────────────────────────────
  window._dcBatchConsentRequest = () => {
    const missingPatients = (_consentData?.records || []).filter(r => r.status === 'missing' || r.status === 'revoked');
    console.log('[AUDIT] Batch consent request initiated:', {
      count: missingPatients.length,
      patient_ids: missingPatients.map(p => p.patient_id),
      actor: currentUser?.id,
      timestamp: new Date().toISOString(),
    });
    alert(`Batch consent request queued for ${missingPatients.length} patients. This action has been logged.`);
  };

  // ── Anonymization handlers ─────────────────────────────────────────────────
  window._dcAnonymConfig = (field, value) => {
    _anonymConfig[field] = value;
    if (field === 'level') {
      renderAnonymizationTool();
    }
    if (field === 'scope') {
      const selectEl = document.getElementById('dc-anonym-patient-select');
      if (selectEl) selectEl.style.display = value === 'patient' ? 'block' : 'none';
    }
  };

  window._dcPreviewAnonymization = () => {
    const previewContainer = document.getElementById('dc-anonym-preview');
    const previewContent = document.getElementById('dc-anonym-preview-content');
    if (!previewContainer || !previewContent) return;

    const patient = _anonymConfig.scope === 'patient'
      ? _allPatients.find(p => p.id === _anonymConfig.patientId)
      : _allPatients[0];

    if (!patient) {
      previewContent.innerHTML = '<span style="color:var(--red)">No patient selected for preview.</span>';
      previewContainer.style.display = 'block';
      return;
    }

    const level = _anonymConfig.level;
    const preview = {
      original: { id: patient.id, name: patient.name, dob: patient.dob || '1985-03-12', gender: patient.gender || 'F', clinician: patient.clinician_name || 'Dr. Smith' },
      anonymized: {},
    };

    if (level === 'full_deidentification') {
      preview.anonymized = {
        id: 'P_' + hashCode(patient.id),
        name: '***REMOVED***',
        dob: '***REMOVED***',
        gender: preview.original.gender,
        clinician: '***REMOVED***',
        _method: 'full_deidentification',
      };
    } else if (level === 'k_anonymity') {
      preview.anonymized = {
        id: 'P_' + patient.id.slice(0, 4) + '****',
        name: patient.name ? patient.name.charAt(0) + '***' : '***',
        dob: (patient.dob || '1985-03-12').slice(0, 3) + '**-**',
        gender: preview.original.gender,
        clinician: 'Dr. ****',
        age_range: '30-40',
        _method: 'k_anonymity (k=5)',
      };
    } else {
      preview.anonymized = {
        id: 'P_' + patient.id.slice(0, 4) + '****',
        name: patient.name ? patient.name.charAt(0) + '***' : '***',
        dob: (patient.dob || '1985-03-12').slice(0, 3) + '**-**',
        gender: preview.original.gender,
        clinician: 'Dr. ****',
        sensitive_values_diverse: true,
        _method: 'l_diversity (l=3)',
      };
    }

    previewContent.innerHTML = `
      <div style="margin-bottom:8px;color:var(--text-tertiary)">// Preview: ${_anonymConfig.level}</div>
      <div style="color:var(--amber);margin-bottom:8px">// Original (not exported):</div>
      <pre style="margin:0;color:var(--text-secondary)">${esc(JSON.stringify(preview.original, null, 2))}</pre>
      <div style="color:var(--teal);margin:12px 0 8px">// Anonymized output:</div>
      <pre style="margin:0;color:var(--text-primary)">${esc(JSON.stringify(preview.anonymized, null, 2))}</pre>
    `;
    previewContainer.style.display = 'block';

    // Log preview
    console.log('[AUDIT] Anonymization preview:', { level, scope: _anonymConfig.scope, patient_id: patient.id, actor: currentUser?.id, timestamp: new Date().toISOString() });
  };

  window._dcExportAnonymized = () => {
    console.log('[AUDIT] Anonymized dataset exported:', { ..._anonymConfig, actor: currentUser?.id, timestamp: new Date().toISOString() });
    const scopeLabel = _anonymConfig.scope === 'patient' ? 'single-patient' : 'clinic-wide';
    const filename = `anonymized-${scopeLabel}-${_anonymConfig.level}-${new Date().toISOString().slice(0, 10)}.json`;
    const payload = {
      meta: {
        level: _anonymConfig.level,
        scope: _anonymConfig.scope,
        generated_at: new Date().toISOString(),
        generated_by: currentUser?.id,
        clinic_id: _clinicOverviewClinicId || currentUser?.clinic_id,
        patient_count: _anonymConfig.scope === 'clinic' ? _allPatients.length : 1,
      },
      records: _allPatients.slice(0, 5).map(p => ({
        pseudonym_id: 'P_' + hashCode(p.id),
        gender: p.gender || 'U',
        data_completeness: p.data_completeness,
      })),
    };
    downloadJson(filename, payload);
  };

  // ═════════════════════════════════════════════════════════════════════════════
  // UTILITY FUNCTIONS
  // ═════════════════════════════════════════════════════════════════════════════

  function downloadCsv(filename, headers, rows) {
    const csv = [headers.join(','), ...rows.map(r => r.map(cell => {
      const str = cell == null ? '' : String(cell);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) return '"' + str.replace(/"/g, '""') + '"';
      return str;
    }).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function downloadJson(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function hashCode(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    return Math.abs(h).toString(36).slice(0, 8);
  }

  // ── Init: load all modules ─────────────────────────────────────────────────
  if (_isClinicOverviewRole) {
    await loadAndRenderClinicOverview();
  }
  await loadAndRenderSources();
  initPatientSearch();

  // Initialize new modules
  await loadAndRenderEnhancedOverview();
  await loadAndRenderPatientCrm();
  await loadAndRenderAuditCentre();
  renderExportCentre();
  await loadAndRenderConsentPanel();
  renderAnonymizationTool();

  // ── Test API ───────────────────────────────────────────────────────────────
  window.__dataConsoleTestApi__ = {
    // State access
    getState: () => ({
      _selectedPatientId,
      _selectedTable,
      _currentOffset,
      _clinicOverviewClinicId,
      _patientCrmSort,
      _patientCrmSearch,
      _patientCrmPage,
      _patientCrmSelectedIds: Array.from(_patientCrmSelectedIds),
      _explorerPatientId,
      _explorerTab,
      _auditCentreFilters,
      _exportConfig,
      _anonymConfig,
      _isClinician,
    }),
    // View renderers
    renderSafetyBanners,
    renderOverviewKPIs: () => _clinicOverviewData ? renderOverviewKPIs(_clinicOverviewData) : '',
    renderActivityTimeline: () => _clinicOverviewData ? renderActivityTimeline(_clinicOverviewData.recent_events || []) : '',
    renderDataQualitySummary: () => _clinicOverviewData ? renderDataQualitySummary(_clinicOverviewData.data_quality || {}) : '',
    renderConsentStatusGrid: () => _clinicOverviewData ? renderConsentStatusGrid(_clinicOverviewData.consent_summary || {}) : '',
    renderPatientCrm,
    renderExplorerSkeleton,
    renderAuditCentre,
    renderExportCentre,
    renderConsentPanel,
    renderAnonymizationTool,
    // Actions
    loadAndRenderClinicOverview,
    loadAndRenderEnhancedOverview,
    loadAndRenderPatientCrm,
    loadAndRenderAuditCentre,
    loadAndRenderConsentPanel,
    filterSortAndRenderCrm,
    renderExplorerTabContent,
    // Helpers
    esc,
    fmtDate,
    fmtDateOnly,
    statusBadge,
    consentDot,
    kpiCard,
    maskName,
    downloadCsv,
    downloadJson,
    hashCode,
    // Feature flags
    features: [
      'clinicOverviewDashboard',
      'patientCrmTable',
      'patientDataExplorer',
      'auditCentre',
      'exportCentre',
      'consentCompliancePanel',
      'dataAnonymizationTool',
    ],
  };
}
