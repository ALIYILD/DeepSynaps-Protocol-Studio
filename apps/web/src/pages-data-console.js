// ─────────────────────────────────────────────────────────────────────────────
// pages-data-console.js — Read-only clinical data browser
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
    </div>`;
  }

  // ── Main skeleton HTML ─────────────────────────────────────────────────────
  el.innerHTML = `
  <div style="padding:20px;max-width:1400px;margin:0 auto">
    ${renderSafetyBanners()}
    
    <!-- Patient selector row -->
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

    <!-- Audit trail -->
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
  </div>`;

  // ── Load and render data sources ────────────────────────────────────────────
  async function loadAndRenderSources() {
    _isLoadingSources = true;
    try {
      const resp = await api.fetch('/api/v1/data-console/sources', { method: 'GET' });
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
      const params = new URLSearchParams();
      params.set('limit', _currentLimit);
      params.set('offset', _currentOffset);
      const resp = await api.fetch(
        `/api/v1/data-console/patients/${encodeURIComponent(_selectedPatientId)}/tables/${encodeURIComponent(tableName)}/rows?${params.toString()}`,
        { method: 'GET' }
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
      const params = new URLSearchParams();
      params.set('days', '30');
      params.set('limit', '50');
      const resp = await api.fetch(
        `/api/v1/data-console/patients/${encodeURIComponent(_selectedPatientId)}/audit?${params.toString()}`,
        { method: 'GET' }
      );
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

  // ── Window-level handlers ──────────────────────────────────────────────────
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

  // ── Init: load sources and setup patient search ─────────────────────────────
  await loadAndRenderSources();
  initPatientSearch();
}
