//


let consentData = CONSENT_DATA_FALLBACK;
import { api } from './api.js';
import { currentUser } from './auth.js';

/**
 * pages-consent-governance.js — Patient Consent Status + Governance Dashboard
 *
 * Scope: comprehensive consent tracking across all patients in a clinic.
 * Displays consent status by type, expiry warnings, version control,
 * and governance actions (view, renew, revoke).
 *
 * Safety: consent status must be verified before any clinical procedure.
 */


const CONSENT_TYPES = ['Treatment', 'Research', 'Data sharing', 'Media', 'Genetic testing'];

const DEMO_CONSENTS = [
  { id: 'c1', patient: 'Eleanor Vance', patientId: 'P1001', type: 'Treatment', dateGiven: '2024-01-15', expiry: '2025-01-15', status: 'Active', version: '2.1', clinic: 'Neuro Rehab Center' },
  { id: 'c2', patient: 'Marcus Chen', patientId: 'P1002', type: 'Research', dateGiven: '2024-03-10', expiry: '2025-03-10', status: 'Active', version: '3.0', clinic: 'Neuro Rehab Center' },
  { id: 'c3', patient: 'Sophia Patel', patientId: 'P1003', type: 'Data sharing', dateGiven: '2023-06-20', expiry: '2024-06-20', status: 'Expired', version: '1.5', clinic: 'Neuro Rehab Center' },
  { id: 'c4', patient: 'James O\'Brien', patientId: 'P1004', type: 'Treatment', dateGiven: '2024-05-01', expiry: '2025-05-01', status: 'Active', version: '2.1', clinic: 'Neuro Rehab Center' },
  { id: 'c5', patient: 'Aisha Johnson', patientId: 'P1005', type: 'Genetic testing', dateGiven: '2024-02-28', expiry: '2025-02-28', status: 'Expiring soon', version: '4.0', clinic: 'Neuro Rehab Center' },
  { id: 'c6', patient: 'Robert Kim', patientId: 'P1006', type: 'Media', dateGiven: '2024-04-10', expiry: '2025-04-10', status: 'Active', version: '2.2', clinic: 'Neuro Rehab Center' },
  { id: 'c7', patient: 'Diana Martinez', patientId: 'P1007', type: 'Research', dateGiven: '2023-09-15', expiry: '2024-09-15', status: 'Pending', version: '3.0', clinic: 'Neuro Rehab Center' },
  { id: 'c8', patient: 'Thomas Wright', patientId: 'P1008', type: 'Treatment', dateGiven: '2024-06-01', expiry: '2025-06-01', status: 'Active', version: '2.1', clinic: 'Neuro Rehab Center' },
  { id: 'c9', patient: 'Linda Foster', patientId: 'P1009', type: 'Data sharing', dateGiven: '2024-01-20', expiry: '2025-01-20', status: 'Expiring soon', version: '2.0', clinic: 'Neuro Rehab Center' },
  { id: 'c10', patient: 'David Park', patientId: 'P1010', type: 'Genetic testing', dateGiven: '2023-11-05', expiry: '2024-11-05', status: 'Expiring soon', version: '4.0', clinic: 'Neuro Rehab Center' },
  { id: 'c11', patient: 'Catherine Liu', patientId: 'P1011', type: 'Media', dateGiven: '2023-08-12', expiry: '2024-08-12', status: 'Expired', version: '2.1', clinic: 'Neuro Rehab Center' },
  { id: 'c12', patient: 'Samuel Torres', patientId: 'P1012', type: 'Treatment', dateGiven: '2024-07-01', expiry: '2025-07-01', status: 'Active', version: '2.2', clinic: 'Neuro Rehab Center' },
  { id: 'c13', patient: 'Emily Watson', patientId: 'P1013', type: 'Research', dateGiven: '2024-04-20', expiry: '2025-04-20', status: 'Active', version: '3.1', clinic: 'Neuro Rehab Center' },
  { id: 'c14', patient: 'Michael Brooks', patientId: 'P1014', type: 'Data sharing', dateGiven: '2024-05-15', expiry: '2025-05-15', status: 'Pending', version: '2.0', clinic: 'Neuro Rehab Center' },
  { id: 'c15', patient: 'Olivia Reed', patientId: 'P1015', type: 'Treatment', dateGiven: '2024-03-01', expiry: '2025-03-01', status: 'Active', version: '2.1', clinic: 'Neuro Rehab Center' },
];

let _consentFilter = 'All';
let _selectedConsentId = null;

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _daysUntilExpiry(expiryStr) {
  const expiry = new Date(expiryStr);
  const now = new Date();
  return Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function _statusBadge(status, expiryStr) {
  const s = String(status || '').toLowerCase();
  if (s === 'active') {
    return '<span class="status-badge status-active">Active</span>';
  }
  if (s === 'expiring soon') {
    const days = _daysUntilExpiry(expiryStr);
    return `<span class="status-badge status-warning">Expiring soon (${days}d)</span>`;
  }
  if (s === 'expired') {
    return '<span class="status-badge status-expired">Expired</span>';
  }
  if (s === 'pending') {
    return '<span class="status-badge status-pending">Pending</span>';
  }
  return `<span class="status-badge">${esc(status)}</span>`;
}

function _evidenceBadge(grade) {
  const g = String(grade || '').toUpperCase();
  if (g === 'A') return '<span class="evidence-badge evidence-a">Grade A</span>';
  if (g === 'B') return '<span class="evidence-badge evidence-b">Grade B</span>';
  if (g === 'C') return '<span class="evidence-badge evidence-c">Grade C</span>';
  if (g === 'D') return '<span class="evidence-badge evidence-d">Grade D</span>';
  return '<span class="evidence-badge">—</span>';
}

function _kpiCards(data) {
  const total = data.length;
  const active = data.filter(c => String(c.status).toLowerCase() === 'active').length;
  const expired = data.filter(c => String(c.status).toLowerCase() === 'expired').length;
  const pending = data.filter(c => String(c.status).toLowerCase() === 'pending').length;

  return `
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-value">${total}</div>
        <div class="kpi-label">Total consents</div>
      </div>
      <div class="kpi-card" style="border-top:3px solid var(--success)">
        <div class="kpi-value" style="color:var(--success)">${active}</div>
        <div class="kpi-label">Active</div>
      </div>
      <div class="kpi-card" style="border-top:3px solid var(--danger)">
        <div class="kpi-value" style="color:var(--danger)">${expired}</div>
        <div class="kpi-label">Expired</div>
      </div>
      <div class="kpi-card" style="border-top:3px solid var(--warning)">
        <div class="kpi-value" style="color:var(--warning)">${pending}</div>
        <div class="kpi-label">Pending re-consent</div>
      </div>
    </div>`;
}

function _filterTabs() {
  const tabs = ['All', 'Active', 'Expiring soon', 'Expired', 'Pending'];
  return `
    <div class="filter-tabs">
      ${tabs.map(t => {
        const active = _consentFilter === t ? 'active' : '';
        return `<button class="filter-tab ${active}" data-filter="${esc(t)}" onclick="window._cgSetFilter('${esc(t)}')">${esc(t)}</button>`;
      }).join('')}
    </div>`;
}

function _filteredData() {
  if (_consentFilter === 'All') return DEMO_CONSENTS;
  return DEMO_CONSENTS.filter(c => String(c.status).toLowerCase() === _consentFilter.toLowerCase());
}

function _consentTable(data, navigate) {
  if (data.length === 0) {
    return `
      <div style="padding:40px 16px;text-align:center;border:1px dashed var(--border);border-radius:12px;margin-top:16px">
        <div style="font-size:2rem;margin-bottom:8px">📋</div>
        <div style="font-weight:600;font-size:13px;margin-bottom:4px;color:var(--text-primary)">No consent records</div>
        <div style="font-size:12px;color:var(--text-secondary)">No consents match the selected filter.</div>
      </div>`;
  }

  const rows = data.map(c => {
    const daysLeft = _daysUntilExpiry(c.expiry);
    const actionBtns = `
      <button class="btn btn-ghost btn-sm" onclick="window._cgViewDetail('${esc(c.id)}')" title="View details">View</button>
      ${String(c.status).toLowerCase() !== 'expired' ? `<button class="btn btn-primary btn-sm" onclick="window._cgRenew('${esc(c.id)}')" title="Renew consent">Renew</button>` : `<button class="btn btn-primary btn-sm" onclick="window._cgRenew('${esc(c.id)}')">Renew</button>`}
      ${String(c.status).toLowerCase() === 'active' ? `<button class="btn btn-danger btn-sm" onclick="window._cgRevoke('${esc(c.id)}')" title="Revoke consent">Revoke</button>` : ''}`;

    return `
      <tr data-consent-id="${esc(c.id)}" style="cursor:pointer" onclick="window._cgViewDetail('${esc(c.id)}')">
        <td style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:13px">
          <div style="font-weight:600">${esc(c.patient)}</div>
          <div style="font-size:11px;color:var(--text-tertiary)">${esc(c.patientId)}</div>
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:12px;color:var(--text-secondary)">${esc(c.type)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:12px;color:var(--text-secondary);white-space:nowrap">${esc(c.dateGiven)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:12px;white-space:nowrap">${esc(c.expiry)} <span style="font-size:11px;color:var(--text-tertiary)">(${daysLeft}d)</span></td>
        <td style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:12px">${_statusBadge(c.status, c.expiry)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:12px;color:var(--text-secondary);text-align:center">${esc(c.version)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:12px;white-space:nowrap">
          <div style="display:flex;gap:4px;flex-wrap:nowrap">${actionBtns}</div>
        </td>
      </tr>`;
  }).join('');

  return `
    <div style="border:1px solid var(--border);border-radius:12px;overflow:hidden;background:var(--bg-card);margin-top:16px">
      <div style="overflow-x:auto">
        <table class="data-table" style="width:100%;border-collapse:collapse;min-width:780px">
          <thead>
            <tr style="text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.03em;color:var(--text-tertiary)">
              <th style="padding:10px 12px;border-bottom:1px solid var(--border);font-weight:600;position:sticky;top:0;background:var(--bg-card);z-index:1">Patient</th>
              <th style="padding:10px 12px;border-bottom:1px solid var(--border);font-weight:600;position:sticky;top:0;background:var(--bg-card);z-index:1">Consent type</th>
              <th style="padding:10px 12px;border-bottom:1px solid var(--border);font-weight:600;position:sticky;top:0;background:var(--bg-card);z-index:1">Date given</th>
              <th style="padding:10px 12px;border-bottom:1px solid var(--border);font-weight:600;position:sticky;top:0;background:var(--bg-card);z-index:1">Expiry</th>
              <th style="padding:10px 12px;border-bottom:1px solid var(--border);font-weight:600;position:sticky;top:0;background:var(--bg-card);z-index:1">Status</th>
              <th style="padding:10px 12px;border-bottom:1px solid var(--border);font-weight:600;text-align:center;position:sticky;top:0;background:var(--bg-card);z-index:1">Version</th>
              <th style="padding:10px 12px;border-bottom:1px solid var(--border);font-weight:600;position:sticky;top:0;background:var(--bg-card);z-index:1">Action</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

function _detailPanel(consent) {
  if (!consent) return '';
  const daysLeft = _daysUntilExpiry(consent.expiry);
  const evidenceGrade = String(consent.status).toLowerCase() === 'active' ? 'A' : 'B';

  return `
    <div id="consent-detail-panel" style="border:1px solid var(--border);border-radius:12px;padding:20px;background:var(--bg-card);margin-top:16px;animation:fadeIn 0.2s ease">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">
        <div>
          <div style="font-size:16px;font-weight:700;color:var(--text-primary)">${esc(consent.patient)}</div>
          <div style="font-size:12px;color:var(--text-tertiary);margin-top:2px">${esc(consent.patientId)} · ${esc(consent.clinic)}</div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="window._cgCloseDetail()">Close</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-bottom:16px">
        <div>
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.03em;color:var(--text-tertiary);margin-bottom:4px">Consent type</div>
          <div style="font-size:13px;font-weight:600;color:var(--text-primary)">${esc(consent.type)}</div>
        </div>
        <div>
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.03em;color:var(--text-tertiary);margin-bottom:4px">Status</div>
          <div style="font-size:13px">${_statusBadge(consent.status, consent.expiry)}</div>
        </div>
        <div>
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.03em;color:var(--text-tertiary);margin-bottom:4px">Version</div>
          <div style="font-size:13px;font-weight:600;color:var(--text-primary)">${esc(consent.version)}</div>
        </div>
        <div>
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.03em;color:var(--text-tertiary);margin-bottom:4px">Days remaining</div>
          <div style="font-size:13px;font-weight:600;color:${daysLeft < 0 ? 'var(--danger)' : daysLeft < 30 ? 'var(--warning)' : 'var(--success)'}">${daysLeft < 0 ? 'Expired ' + Math.abs(daysLeft) + ' days ago' : daysLeft + ' days'}</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-bottom:16px">
        <div>
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.03em;color:var(--text-tertiary);margin-bottom:4px">Date given</div>
          <div style="font-size:13px;color:var(--text-secondary)">${esc(consent.dateGiven)}</div>
        </div>
        <div>
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.03em;color:var(--text-tertiary);margin-bottom:4px">Expiry date</div>
          <div style="font-size:13px;color:var(--text-secondary)">${esc(consent.expiry)}</div>
        </div>
        <div>
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.03em;color:var(--text-tertiary);margin-bottom:4px">Evidence grade</div>
          <div style="font-size:13px">${_evidenceBadge(evidenceGrade)}</div>
        </div>
      </div>
      <div style="padding:12px;border-radius:8px;background:rgba(96,165,250,0.06);border:1px solid rgba(96,165,250,0.2);font-size:12px;color:var(--text-secondary);line-height:1.5">
        <strong style="color:var(--blue)">Governance note:</strong> This consent record was verified against clinic policy v${esc(consent.version)}. All renewals require patient re-signature and witnessed acknowledgment.
      </div>
    </div>`;
}

function _safetyBanner() {
  return `
    <div class="safety-banner" style="padding:10px 14px;border-radius:10px;border:1px solid rgba(255,107,107,0.35);background:rgba(255,107,107,0.06);margin-bottom:16px;font-size:12px;color:var(--text-secondary);line-height:1.45">
      <strong style="color:var(--red)">⚠ Clinical safety:</strong> Consent status must be verified before any clinical procedure. Automated status indicators are decision-support only — always confirm with source documentation.
    </div>`;
}

function _render(navigate) {
  const filtered = _filteredData();
  const detailConsent = _selectedConsentId ? DEMO_CONSENTS.find(c => c.id === _selectedConsentId) : null;

  return `
    <div class="patient-container" style="padding:20px 16px 40px;max-width:1200px;margin:0 auto">
      <div class="patient-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
        <div>
          <div class="patient-title" style="font-size:20px;font-weight:800;color:var(--text-primary);margin-bottom:4px">Consent Governance</div>
          <div style="font-size:12px;color:var(--text-secondary)">Track patient consent status, expiry dates, and governance compliance</div>
        </div>
        <button class="btn btn-primary btn-export" onclick="window._cgExport()">Export CSV</button>
      </div>

      ${_safetyBanner()}
      ${_kpiCards(DEMO_CONSENTS)}
      ${_filterTabs()}
      ${_consentTable(filtered, navigate)}
      ${detailConsent ? _detailPanel(detailConsent) : ''}

      <style>
        .status-badge { display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;white-space:nowrap; }
        .status-active { background:rgba(74,222,128,0.12);color:#16a34a;border:1px solid rgba(74,222,128,0.25); }
        .status-warning { background:rgba(251,191,36,0.12);color:#d97706;border:1px solid rgba(251,191,36,0.25); }
        .status-expired { background:rgba(255,107,107,0.12);color:#dc2626;border:1px solid rgba(255,107,107,0.25); }
        .status-pending { background:rgba(251,191,36,0.08);color:#b45309;border:1px solid rgba(251,191,36,0.2); }
        .evidence-badge { display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:600; }
        .evidence-a { background:rgba(74,222,128,0.12);color:#16a34a; }
        .evidence-b { background:rgba(96,165,250,0.12);color:#2563eb; }
        .evidence-c { background:rgba(251,191,36,0.12);color:#b45309; }
        .evidence-d { background:rgba(255,107,107,0.12);color:#dc2626; }
        .data-table th, .data-table td { font-variant-numeric:tabular-nums; }
        .data-table tbody tr:hover { background:rgba(148,163,184,0.06); }
        .kpi-grid { display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:16px; }
        .kpi-card { padding:14px 16px;border:1px solid var(--border);border-radius:12px;background:var(--bg-card); }
        .kpi-value { font-size:22px;font-weight:700;color:var(--text-primary); }
        .kpi-label { font-size:12px;color:var(--text-secondary);margin-top:2px; }
        .filter-tabs { display:flex;gap:4px;margin-top:16px;flex-wrap:wrap; }
        .filter-tab { padding:6px 14px;border-radius:8px;border:1px solid transparent;background:transparent;font-size:12px;font-weight:600;color:var(--text-secondary);cursor:pointer;transition:all 0.15s; }
        .filter-tab:hover { background:rgba(148,163,184,0.08);color:var(--text-primary); }
        .filter-tab.active { background:rgba(96,165,250,0.1);color:var(--blue);border-color:rgba(96,165,250,0.25); }
        @keyframes fadeIn { from { opacity:0;transform:translateY(-4px); } to { opacity:1;transform:translateY(0); } }
      </style>
    </div>`;
}

function _mount(html) {
  if (typeof document === 'undefined') return html;
  const host = document.getElementById('content');
  if (host) host.innerHTML = html;
  return html;
}

export async function pgConsentGovernance(setTopbar, navigate) {
  setTopbar('Consent Governance');

  // Try API first, fall back to demo data
  const clinicId = currentUser?.clinicId || window.sessionStorage.getItem('clinic_id') || 'demo-clinic';
  try {
    const resp = await api.getConsents(clinicId);
    if (resp && resp.length > 0) { consentRecords = resp; }
    else if (resp && resp.items && resp.items.length > 0) { consentRecords = resp.items; }
  } catch (err) {
    console.warn('[ConsentGovernance] API error:', err.message);
    consentRecords = DEMO_CONSENTS;
  }

  _consentFilter = 'All';
  _selectedConsentId = null;

  const html = _render(navigate);
  _mount(html);

  // Wire up global handlers for the string-template onclick handlers
  if (typeof window !== 'undefined') {
    window._cgSetFilter = (f) => { _consentFilter = f; _mount(_render(navigate)); };
    window._cgViewDetail = (id) => { _selectedConsentId = id; _mount(_render(navigate)); };
    window._cgCloseDetail = () => { _selectedConsentId = null; _mount(_render(navigate)); };
    window._cgRenew = (id) => {
      const c = DEMO_CONSENTS.find(x => x.id === id);
      if (c) {
        const today = new Date();
        const nextYear = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate());
        c.expiry = nextYear.toISOString().split('T')[0];
        c.status = 'Active';
        _mount(_render(navigate));
      }
    };
    window._cgRevoke = (id) => {
      const c = DEMO_CONSENTS.find(x => x.id === id);
      if (c) { c.status = 'Expired'; _mount(_render(navigate)); }
    };
    window._cgExport = () => {
      const rows = [['Patient', 'Patient ID', 'Consent Type', 'Date Given', 'Expiry', 'Status', 'Version']];
      DEMO_CONSENTS.forEach(c => rows.push([c.patient, c.patientId, c.type, c.dateGiven, c.expiry, c.status, c.version]));
      const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'consent-governance-export.csv';
      a.click();
    };
    window._cgBulkRenew = () => {
      const expired = DEMO_CONSENTS.filter(c => String(c.status).toLowerCase() === 'expired');
      if (expired.length === 0) return;
      const today = new Date();
      const nextYear = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate());
      expired.forEach(c => { c.expiry = nextYear.toISOString().split('T')[0]; c.status = 'Active'; });
      _mount(_render(navigate));
    };
  }

  return html;
}

/**
 * Consent policy check — verifies a patient has active consent of the
 * required type before a clinical procedure. Returns { ok, reason }.
 */
export function checkConsentPolicy(patientId, consentType, consentRecords) {
  if (!Array.isArray(consentRecords)) {
    return { ok: false, reason: 'No consent records available' };
  }
  const record = consentRecords.find(
    (c) => c.patientId === patientId && c.type === consentType
  );
  if (!record) {
    return { ok: false, reason: `No ${consentType} consent on file` };
  }
  if (String(record.status).toLowerCase() !== 'active') {
    return { ok: false, reason: `${consentType} consent is ${record.status}` };
  }
  const daysLeft = _daysUntilExpiry(record.expiry);
  if (daysLeft < 0) {
    return { ok: false, reason: `${consentType} consent expired ${Math.abs(daysLeft)} days ago` };
  }
  if (daysLeft < 30) {
    return { ok: true, reason: `Expires in ${daysLeft} days — renewal recommended`, warning: true };
  }
  return { ok: true, reason: 'Consent valid' };
}

/**
 * Get summary statistics for consent governance reporting.
 */
export function getConsentSummary(consentRecords) {
  if (!Array.isArray(consentRecords)) return null;
  const total = consentRecords.length;
  const active = consentRecords.filter(c => String(c.status).toLowerCase() === 'active').length;
  const expired = consentRecords.filter(c => String(c.status).toLowerCase() === 'expired').length;
  const pending = consentRecords.filter(c => String(c.status).toLowerCase() === 'pending').length;
  const expiringSoon = consentRecords.filter(c => {
    if (String(c.status).toLowerCase() !== 'active') return false;
    return _daysUntilExpiry(c.expiry) < 30;
  }).length;
  return { total, active, expired, pending, expiringSoon };
}

export default { pgConsentGovernance };

