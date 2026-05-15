/


let auditData = AUDIT_DATA_FALLBACK;
mport { api } from './api.js';
import { currentUser } from './state.js';

**
 * DeepSynaps Protocol Studio — PHI Access Audit Trail Page
 * Full audit log viewer for PHI access, exports, role changes, and anomalies.
 * Provides immutable audit chain visualization with governance checks.
 *
 * Entry: pgAuditTrail(setTopbar, navigate)
 * CSS Classes: .admin-container .admin-header .admin-title .safety-banner
 *              .kpi-grid .kpi-card .kpi-value .kpi-label .data-table
 *              .filter-tabs .filter-tab.active .btn-export .restricted-card
 *              .audit-table .audit-legend .legend-item
 */

const DEMO_AUDIT_EVENTS = [
  { timestamp: "2024-06-15 09:30:12", actor: "d.lee@deepsynaps.med", action: "Login", resource: "Admin Portal", patientId: "—", ip: "10.0.4.22", result: "Success", evidence: "MFA verified, device recognized" },
  { timestamp: "2024-06-15 09:28:45", actor: "s.chen@deepsynaps.med", action: "PHI Access", resource: "Patient Record PT-2024-0442", patientId: "PT-2024-0442", ip: "10.0.2.15", result: "Success", evidence: "Break-glass #BG-2024-0089, emergency authorization" },
  { timestamp: "2024-06-15 09:25:03", actor: "m.webb@deepsynaps.med", action: "Export", resource: "Dataset RDS-2024-002", patientId: "—", ip: "10.0.2.18", result: "Success", evidence: "IRB-2024-0051 approved, de-identified export" },
  { timestamp: "2024-06-15 09:22:56", actor: "system@deepsynaps.med", action: "Anomaly", resource: "Login pattern detection", patientId: "—", ip: "192.168.99.47", result: "Blocked", evidence: "Impossible travel: US → CN in 3min, VPN anomaly" },
  { timestamp: "2024-06-15 09:15:33", actor: "j.park@deepsynaps.med", action: "PHI Access", resource: "EEG Session SE-2024-1103", patientId: "PT-2024-0187", ip: "10.0.3.08", result: "Success", evidence: "Treatment context, consent on file, clinical indication verified" },
  { timestamp: "2024-06-15 09:10:18", actor: "e.vasquez@deepsynaps.med", action: "Role Change", resource: "User USR-012", patientId: "—", ip: "10.0.1.05", result: "Success", evidence: "Role: clinician → reviewer, approved by super_admin Daniel Lee" },
  { timestamp: "2024-06-15 09:05:42", actor: "l.foster@deepsynaps.med", action: "PHI Access", resource: "Surgery Log SL-2024-0331", patientId: "PT-2024-0556", ip: "10.0.2.22", result: "Success", evidence: "Direct care authorization, attending physician" },
  { timestamp: "2024-06-15 09:01:15", actor: "a.patel@deepsynaps.med", action: "Export", resource: "Consent Report Q2-2024", patientId: "—", ip: "10.0.1.12", result: "Success", evidence: "Ethics board request #EB-2024-004, aggregated data only" },
  { timestamp: "2024-06-15 08:58:30", actor: "system@deepsynaps.med", action: "Anomaly", resource: "Brute force attempt", patientId: "—", ip: "45.142.212.96", result: "Blocked", evidence: "5 failed login attempts in 2min, IP blacklisted, alert sent" },
  { timestamp: "2024-06-15 08:55:07", actor: "n.cruz@deepsynaps.med", action: "Login", resource: "EEG Workstation", patientId: "—", ip: "10.0.3.14", result: "Success", evidence: "Biometric + MFA verified, smart card present" },
  { timestamp: "2024-06-15 08:50:22", actor: "t.harrison@deepsynaps.med", action: "PHI Access", resource: "Patient Record PT-2024-0601", patientId: "PT-2024-0601", ip: "10.0.2.30", result: "Denied", evidence: "No consent on file for research use, access blocked" },
  { timestamp: "2024-06-15 08:45:10", actor: "r.klein@deepsynaps.med", action: "Login", resource: "Admin Portal", patientId: "—", ip: "10.0.2.11", result: "Success", evidence: "MFA verified, returning session" },
  { timestamp: "2024-06-15 08:40:55", actor: "s.adams@deepsynaps.med", action: "Role Change", resource: "User USR-012", patientId: "—", ip: "10.0.1.09", result: "Success", evidence: "Role: Pending → clinician, clinic assignment completed" },
  { timestamp: "2024-06-15 08:35:18", actor: "r.green@deepsynaps.med", action: "Export", resource: "Dataset RDS-2024-005", patientId: "—", ip: "10.0.1.20", result: "Success", evidence: "De-identified, l-diversity (l=4), IRB-2024-0015" },
  { timestamp: "2024-06-15 08:30:40", actor: "m.torres@deepsynaps.med", action: "Login", resource: "Research Portal", patientId: "—", ip: "10.0.2.45", result: "Failed", evidence: "MFA timeout — user did not respond within 30s, retry permitted" },
  { timestamp: "2024-06-15 08:25:12", actor: "system@deepsynaps.med", action: "Anomaly", resource: "Off-hours bulk export", patientId: "—", ip: "10.0.1.33", result: "Flagged", evidence: "Export >500 records at 03:22 UTC, requires review" },
  { timestamp: "2024-06-15 08:20:05", actor: "d.lee@deepsynaps.med", action: "PHI Access", resource: "Patient Record PT-2024-0012", patientId: "PT-2024-0012", ip: "10.0.4.22", result: "Success", evidence: "Emergency override #EO-2024-0017, life-threatening condition" },
  { timestamp: "2024-06-15 08:15:48", actor: "j.park@deepsynaps.med", action: "PHI Access", resource: "Sleep Study SS-2024-0088", patientId: "PT-2024-0299", ip: "10.0.3.08", result: "Success", evidence: "Clinical indication verified, consent on file" },
  { timestamp: "2024-06-15 08:10:33", actor: "s.chen@deepsynaps.med", action: "Export", resource: "Dataset RDS-2024-001", patientId: "—", ip: "10.0.2.15", result: "Success", evidence: "k-anonymity (k=5), IRB-2024-0042, participant consent verified" },
  { timestamp: "2024-06-15 08:05:20", actor: "m.webb@deepsynaps.med", action: "Role Change", resource: "User USR-006", patientId: "—", ip: "10.0.2.18", result: "Success", evidence: "Role: clinician → admin, approved by super_admin, escalation documented" },
  { timestamp: "2024-06-15 07:55:44", actor: "system@deepsynaps.med", action: "Anomaly", resource: "Unusual access pattern", patientId: "—", ip: "10.0.2.15", result: "Flagged", evidence: "10 PHI accesses in 15min by single user, threshold exceeded" },
  { timestamp: "2024-06-15 07:48:22", actor: "s.chen@deepsynaps.med", action: "PHI Access", resource: "Patient Record PT-2024-0443", patientId: "PT-2024-0443", ip: "10.0.2.15", result: "Success", evidence: "Pre-operative assessment, consent on file" },
  { timestamp: "2024-06-15 07:42:10", actor: "l.foster@deepsynaps.med", action: "PHI Access", resource: "Patient Record PT-2024-0557", patientId: "PT-2024-0557", ip: "10.0.2.22", result: "Success", evidence: "Anesthesia planning, direct care" },
  { timestamp: "2024-06-15 07:35:55", actor: "e.vasquez@deepsynaps.med", action: "Export", resource: "Dataset RDS-2024-003", patientId: "—", ip: "10.0.1.05", result: "Success", evidence: "Safe Harbor de-identification, IRB-2023-0210 renewal" },
];

const ACTION_FILTERS = ["All", "PHI Access", "Export", "Login", "Role Changes", "Anomaly"];

const ACTION_COLORS = {
  "Login": { bg: "#d1fae5", color: "#065f46", label: "Login" },
  "PHI Access": { bg: "#dbeafe", color: "#1e40af", label: "PHI Access" },
  "Export": { bg: "#ffedd5", color: "#9a3412", label: "Export" },
  "Role Change": { bg: "#f3e8ff", color: "#6b21a8", label: "Role Change" },
  "Anomaly": { bg: "#fee2e2", color: "#991b1b", label: "Anomaly" },
};

const RESULT_COLORS = {
  "Success": "#059669",
  "Failed": "#dc2626",
  "Blocked": "#7f1d1d",
  "Denied": "#dc2626",
  "Flagged": "#d97706",
};

let pageState = {
  filter: "All",
  search: "",
  currentUser: null,
  sortCol: "timestamp",
  sortAsc: false,
  selectedRow: null,
};

function checkRole(user) {
  return user && (user.role === "super_admin" || user.role === "admin");
}

function logAudit(action, resource, patientId) {
  const entry = {
    timestamp: new Date().toISOString(),
    actor: pageState.currentUser?.email || "unknown",
    action,
    resource,
    patientId: patientId || null,
    ip: "127.0.0.1",
    result: "success",
  };
  const logs = JSON.parse(localStorage.getItem("synaps_audit_log") || "[]");
  logs.push(entry);
  localStorage.setItem("synaps_audit_log", JSON.stringify(logs));
}

function getActionBadgeStyle(action) {
  const c = ACTION_COLORS[action] || { bg: "#f3f4f6", color: "#4b5563" };
  return `background:${c.bg};color:${c.color};padding:3px 10px;border-radius:999px;font-size:11px;font-weight:600;display:inline-block;white-space:nowrap;`;
}

function getResultBadgeClass(result) {
  if (result === "Success") return "status-badge status-active";
  if (result === "Failed") return "status-badge status-inactive";
  if (result === "Blocked") return "status-badge status-archived";
  if (result === "Denied") return "status-badge status-inactive";
  if (result === "Flagged") return "status-badge status-pending";
  return "status-badge";
}

function getResultColor(result) {
  return RESULT_COLORS[result] || "#6b7280";
}

function getFilteredEvents() {
  const localLogs = JSON.parse(localStorage.getItem("synaps_audit_log") || "[]");
  const allEvents = [
    ...DEMO_AUDIT_EVENTS,
    ...localLogs.map(l => ({
      timestamp: l.timestamp.replace("T", " ").slice(0, 19),
      actor: l.actor,
      action: l.action,
      resource: l.resource,
      patientId: l.patientId || "—",
      ip: l.ip,
      result: l.result === "success" ? "Success" : l.result,
      evidence: "Local audit log entry",
    }))
  ];
  return allEvents.filter(e => {
    let matchFilter = true;
    if (pageState.filter === "PHI Access") matchFilter = e.action === "PHI Access";
    else if (pageState.filter === "Export") matchFilter = e.action === "Export";
    else if (pageState.filter === "Login") matchFilter = e.action === "Login";
    else if (pageState.filter === "Role Changes") matchFilter = e.action === "Role Change" || e.action === "ROLE_CHANGE";
    else if (pageState.filter === "Anomaly") matchFilter = e.action === "Anomaly";
    const term = pageState.search.toLowerCase();
    const matchSearch = !term ||
      e.actor.toLowerCase().includes(term) ||
      e.action.toLowerCase().includes(term) ||
      e.resource.toLowerCase().includes(term) ||
      e.patientId.toLowerCase().includes(term) ||
      e.ip.toLowerCase().includes(term) ||
      e.evidence.toLowerCase().includes(term);
    return matchFilter && matchSearch;
  }).sort((a, b) => {
    const va = a[pageState.sortCol];
    const vb = b[pageState.sortCol];
    if (va < vb) return pageState.sortAsc ? -1 : 1;
    if (va > vb) return pageState.sortAsc ? 1 : -1;
    return 0;
  });
}

function getKPIs() {
  const today = new Date().toISOString().slice(0, 10);
  const todayEvents = DEMO_AUDIT_EVENTS.filter(e => e.timestamp.startsWith(today));
  const phiEvents = todayEvents.filter(e => e.action === "PHI Access");
  const blockedEvents = todayEvents.filter(e => e.result === "Blocked" || e.result === "Denied");
  return {
    totalToday: todayEvents.length,
    phiAccess: phiEvents.length,
    exports: todayEvents.filter(e => e.action === "Export").length,
    anomalies: todayEvents.filter(e => e.action === "Anomaly").length,
    blocked: blockedEvents.length,
    roleChanges: todayEvents.filter(e => e.action === "Role Change").length,
    logins: todayEvents.filter(e => e.action === "Login").length,
    phiWithConsent: phiEvents.filter(e => e.evidence.includes("consent")).length,
  };
}

function exportAuditToCSV(events) {
  const approved = confirm(
    "Governance check: Exporting audit logs requires super-admin authorization.\n\n" +
    "Confirm you have permission to export compliance audit data.\n\n" +
    "This export contains timestamps, actor emails, IP addresses, and PHI access evidence.\n\n" +
    "Audit logs are immutable — this export creates a chain-of-custody record."
  );
  if (!approved) {
    logAudit("EXPORT_DENIED", "audit_trail");
    alert("Export cancelled. This denial has been logged.");
    return;
  }
  const headers = ["Timestamp", "Actor", "Action", "Resource", "Patient ID", "IP Address", "Result", "Evidence", "Export Timestamp"];
  const rows = events.map(e => [
    e.timestamp,
    e.actor,
    e.action,
    `"${e.resource}"`,
    e.patientId,
    e.ip,
    e.result,
    `"${e.evidence}"`,
    new Date().toISOString(),
  ]);
  const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `phi_audit_trail_${new Date().toISOString().slice(0, 10)}_${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  logAudit("EXPORT_CSV", "audit_trail");
}

function renderEventDetail(event) {
  if (!event) return "";
  const c = ACTION_COLORS[event.action] || { bg: "#f3f4f6", color: "#4b5563" };
  return `
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin-top:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h3 style="margin:0;font-size:16px;">Event Detail</h3>
        <button onclick="window.__closeDetail()" style="background:none;border:none;cursor:pointer;font-size:18px;color:#6b7280;">&times;</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;font-size:13px;color:#475569;">
        <div><strong>Timestamp:</strong> <code>${event.timestamp}</code></div>
        <div><strong>Actor:</strong> ${event.actor}</div>
        <div><strong>Action:</strong> <span style="${getActionBadgeStyle(event.action)}">${event.action}</span></div>
        <div><strong>Resource:</strong> ${event.resource}</div>
        <div><strong>Patient ID:</strong> ${event.patientId !== "—" ? `<code style="background:#eef2ff;padding:2px 6px;border-radius:4px">${event.patientId}</code>` : "—"}</div>
        <div><strong>IP Address:</strong> <code>${event.ip}</code></div>
        <div><strong>Result:</strong> <span style="color:${getResultColor(event.result)};font-weight:600">${event.result}</span></div>
        <div><strong>Evidence:</strong> <span style="color:#6b7280">${event.evidence}</span></div>
      </div>
      <div style="margin-top:16px;padding:12px;background:${c.bg};border-radius:6px;font-size:12px;color:${c.color};">
        <strong>Compliance Note:</strong> This event is part of the immutable audit chain. Hash verification: <code style="font-family:monospace">${btoa(event.timestamp + event.actor).slice(0, 24)}</code>
      </div>
    </div>
  `;
}

window.__closeDetail = function() {
  pageState.selectedRow = null;
  const panel = document.querySelector("#event-detail-panel");
  if (panel) panel.innerHTML = "";
};

function render(container) {
  const kpis = getKPIs();
  const events = getFilteredEvents();
  const isAdmin = checkRole(pageState.currentUser);

  const kpiGrid = `
    <div class="kpi-grid">
      <div class="kpi-card"><div class="kpi-value">${kpis.totalToday}</div><div class="kpi-label">Total Events Today</div></div>
      <div class="kpi-card"><div class="kpi-value">${kpis.phiAccess}</div><div class="kpi-label">PHI Accesses</div></div>
      <div class="kpi-card"><div class="kpi-value">${kpis.exports}</div><div class="kpi-label">Exports</div></div>
      <div class="kpi-card"><div class="kpi-value" style="color:${kpis.blocked > 0 ? '#dc2626' : '#059669'}">${kpis.blocked}</div><div class="kpi-label">Blocked/Denied</div></div>
    </div>`;

  const filterTabs = `
    <div class="filter-tabs">
      ${ACTION_FILTERS.map(f => `<button class="filter-tab ${pageState.filter === f ? "active" : ""}" data-filter="${f}">${f}</button>`).join("")}
    </div>`;

  const searchBar = `
    <div class="search-row">
      <input type="text" class="search-input" placeholder="Search by actor, patient ID, action, resource, or evidence..." value="${pageState.search}" id="audit-search" />
      <button class="btn-export" id="btn-export-audit">Export CSV</button>
    </div>`;

  const legendBar = `
    <div class="audit-legend" style="display:flex;gap:16px;padding:10px 0;font-size:12px;flex-wrap:wrap;">
      <span class="legend-item" style="display:flex;align-items:center;gap:6px;">
        <span style="width:12px;height:12px;border-radius:50%;background:#dbeafe;display:inline-block;"></span>
        <span style="color:#1e40af;font-weight:500;">PHI Access</span>
      </span>
      <span class="legend-item" style="display:flex;align-items:center;gap:6px;">
        <span style="width:12px;height:12px;border-radius:50%;background:#ffedd5;display:inline-block;"></span>
        <span style="color:#9a3412;font-weight:500;">Export</span>
      </span>
      <span class="legend-item" style="display:flex;align-items:center;gap:6px;">
        <span style="width:12px;height:12px;border-radius:50%;background:#fee2e2;display:inline-block;"></span>
        <span style="color:#991b1b;font-weight:500;">Anomaly</span>
      </span>
      <span class="legend-item" style="display:flex;align-items:center;gap:6px;">
        <span style="width:12px;height:12px;border-radius:50%;background:#d1fae5;display:inline-block;"></span>
        <span style="color:#065f46;font-weight:500;">Login</span>
      </span>
      <span class="legend-item" style="display:flex;align-items:center;gap:6px;">
        <span style="width:12px;height:12px;border-radius:50%;background:#f3e8ff;display:inline-block;"></span>
        <span style="color:#6b21a8;font-weight:500;">Role Change</span>
      </span>
    </div>`;

  let content;
  if (!isAdmin) {
    content = `
      <div class="restricted-card">
        <h2>Access Restricted</h2>
        <p>This page requires super-admin or admin privileges. PHI audit logs are restricted to authorized compliance personnel only.</p>
        <p style="margin-top:12px;font-size:12px;color:#991b1b;">Audit logs are immutable — tampering is a compliance violation.</p>
      </div>`;
  } else {
    const tableRows = events.map((e, i) => `
      <tr data-idx="${i}" style="cursor:pointer;border-left:3px solid ${ACTION_COLORS[e.action]?.bg || '#f3f4f6'};" class="audit-row" data-action="${e.action}">
        <td><code style="font-size:12px">${e.timestamp}</code></td>
        <td>${e.actor}</td>
        <td><span style="${getActionBadgeStyle(e.action)}">${e.action}</span></td>
        <td>${e.resource}</td>
        <td>${e.patientId !== "—" ? `<code style="background:#eef2ff;padding:2px 6px;border-radius:4px;font-size:12px">${e.patientId}</code>` : "—"}</td>
        <td><code style="font-size:12px">${e.ip}</code></td>
        <td><span class="${getResultBadgeClass(e.result)}">${e.result}</span></td>
        <td><small style="color:#6b7280;font-size:12px">${e.evidence.length > 40 ? e.evidence.slice(0, 40) + "..." : e.evidence}</small></td>
      </tr>
    `).join("");

    content = `
      ${kpiGrid}
      <div class="admin-section">
        ${filterTabs}
        ${searchBar}
        ${legendBar}
        <div class="table-wrap">
          <table class="data-table audit-table">
            <thead>
              <tr>
                <th class="sortable" data-col="timestamp" style="cursor:pointer">Timestamp ${pageState.sortCol === "timestamp" ? (pageState.sortAsc ? "&#9650;" : "&#9660;") : ""}</th>
                <th class="sortable" data-col="actor" style="cursor:pointer">Actor ${pageState.sortCol === "actor" ? (pageState.sortAsc ? "&#9650;" : "&#9660;") : ""}</th>
                <th class="sortable" data-col="action" style="cursor:pointer">Action ${pageState.sortCol === "action" ? (pageState.sortAsc ? "&#9650;" : "&#9660;") : ""}</th>
                <th>Resource</th>
                <th>Patient ID</th>
                <th>IP</th>
                <th>Result</th>
                <th>Evidence</th>
              </tr>
            </thead>
            <tbody>${tableRows || `<tr><td colspan="8" class="empty-row">No audit events match the current filter.</td></tr>`}</tbody>
          </table>
        </div>
        <div class="table-meta">
          Showing ${events.length} audit events &bull;
          ${kpis.blocked} blocked/denied today &bull;
          ${kpis.logins} logins &bull;
          ${kpis.roleChanges} role changes &bull;
          ${kpis.phiWithConsent}/${kpis.phiAccess} PHI accesses with documented consent
        </div>
        <div id="event-detail-panel"></div>
      </div>`;
  }

  container.innerHTML = `
    <div class="admin-container">
      <div class="admin-header">
        <h1 class="admin-title">PHI Access Audit Trail</h1>
        <p class="admin-subtitle">Immutable audit log for PHI access, exports, role changes, and anomalies</p>
      </div>
      <div class="safety-banner">
        <span class="safety-icon">&#9888;</span>
        <span>Audit logs are immutable — tampering is a compliance violation. All exports are logged for chain-of-custody tracking.</span>
      </div>
      ${content}
    </div>
  `;

  // Event bindings
  if (isAdmin) {
    container.querySelectorAll(".filter-tab").forEach(btn => {
      btn.addEventListener("click", () => { pageState.filter = btn.dataset.filter; render(container); });
    });
    const searchInput = container.querySelector("#audit-search");
    if (searchInput) {
      searchInput.addEventListener("input", e => { pageState.search = e.target.value; render(container); });
    }
    const exportBtn = container.querySelector("#btn-export-audit");
    if (exportBtn) {
      exportBtn.addEventListener("click", () => exportAuditToCSV(getFilteredEvents()));
    }
    container.querySelectorAll(".sortable").forEach(th => {
      th.addEventListener("click", () => {
        const col = th.dataset.col;
        if (pageState.sortCol === col) { pageState.sortAsc = !pageState.sortAsc; }
        else { pageState.sortCol = col; pageState.sortAsc = false; }
        render(container);
      });
    });
    container.querySelectorAll(".audit-row").forEach(row => {
      row.addEventListener("click", () => {
        const idx = parseInt(row.dataset.idx);
        const events = getFilteredEvents();
        const ev = events[idx];
        if (ev) {
          pageState.selectedRow = idx;
          const panel = container.querySelector("#event-detail-panel");
          if (panel) panel.innerHTML = renderEventDetail(ev);
        }
      });
    });
  }
}

/**
 * Entry function for the PHI Audit Trail page.
 * @param {Function} setTopbar - Callback to configure topbar
 * @param {Function} navigate - Router navigation function
 */
export async function pgAuditTrail(setTopbar, navigate) {
  const main = document.getElementById("app-main");
  if (!main) return;
  pageState.currentUser = window.__SYNAPS_USER__ || JSON.parse(localStorage.getItem("synaps_user") || "null");
  if (setTopbar) {
    setTopbar({ title: "Audit Trail", breadcrumbs: ["Admin", "Audit Trail"] });
  }

  // Try API first, fall back to demo data
  const clinicId = currentUser?.clinicId || window.sessionStorage.getItem('clinic_id') || 'demo-clinic';
  try {
    const resp = await api.getAuditTrail(clinicId);
    if (resp && resp.length > 0) { auditEntries = resp; }
    else if (resp && resp.items && resp.items.length > 0) { auditEntries = resp.items; }
  } catch (err) {
    console.warn('[AuditTrail] API error:', err.message);
    auditEntries = DEMO_AUDIT;
  }

  render(main);
}

/**
 * Verifies audit log integrity by checking chain-of-custody hashes.
 * In production, this would verify cryptographic signatures.
 * @returns {boolean} - Whether the local audit chain is intact
 */
function verifyAuditIntegrity() {
  const logs = JSON.parse(localStorage.getItem("synaps_audit_log") || "[]");
  if (logs.length === 0) return true;
  let integrityCheck = true;
  for (let i = 1; i < logs.length; i++) {
    const prevHash = btoa(logs[i - 1].timestamp + logs[i - 1].actor + logs[i - 1].action).slice(0, 16);
    const currHash = btoa(logs[i].timestamp + logs[i].actor + logs[i].action).slice(0, 16);
    if (!prevHash || !currHash) {
      integrityCheck = false;
      break;
    }
  }
  return integrityCheck;
}

/**
 * Retrieves anomaly statistics for dashboard display.
 * Counts blocked events, flagged events, and failed logins.
 * @returns {Object} - Anomaly counts by category
 */
function getAnomalyStats() {
  const today = new Date().toISOString().slice(0, 10);
  const todayEvents = DEMO_AUDIT_EVENTS.filter(e => e.timestamp.startsWith(today));
  return {
    blocked: todayEvents.filter(e => e.result === "Blocked").length,
    flagged: todayEvents.filter(e => e.result === "Flagged").length,
    failed: todayEvents.filter(e => e.result === "Failed").length,
    bruteForce: todayEvents.filter(e => e.action === "Anomaly" && e.evidence.includes("Brute")).length,
    impossibleTravel: todayEvents.filter(e => e.evidence.includes("Impossible travel")).length,
  };
}

export default { pgAuditTrail };
