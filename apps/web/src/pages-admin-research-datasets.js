/
import { api } from './api.js';
import { currentUser } from './state.js';

**
 * DeepSynaps Protocol Studio — Admin Research Datasets Page
 * Research Dataset Management for super-admins.
 * Handles study data governance, consent tracking, de-identified exports,
 * IRB approval linkage, and participant enrollment oversight.
 *
 * Entry: pgAdminResearchDatasets(setTopbar, navigate)
 * CSS Classes: .admin-container .admin-header .admin-title .safety-banner
 *              .kpi-grid .kpi-card .kpi-value .kpi-label .data-table
 *              .filter-tabs .filter-tab.active .btn-export .restricted-card
 */

const DEMO_DATASETS_FALLBACK = [
  { id: "RDS-2024-001", name: "Cognitive Load in Surgical Training", study: "SurgTrain-2024", participants: 142, dateRange: "2024-01-15 — 2024-06-30", status: "Active", consentRate: 98.6, deidentLevel: "k-anonymity (k=5)", pi: "Dr. Sarah Chen", ethicsId: "IRB-2024-0042" },
  { id: "RDS-2024-002", name: "Neural Marker Patterns in TBI Recovery", study: "TBI-Recover-24", participants: 89, dateRange: "2024-02-01 — 2024-08-15", status: "Active", consentRate: 95.5, deidentLevel: "l-diversity (l=3)", pi: "Dr. Marcus Webb", ethicsId: "IRB-2024-0051" },
  { id: "RDS-2024-003", name: "EEG Biomarkers for Early Dementia", study: "NeuroMark-DEM", participants: 210, dateRange: "2023-09-01 — 2024-09-01", status: "Active", consentRate: 97.1, deidentLevel: "Safe Harbor", pi: "Dr. Elena Vasquez", ethicsId: "IRB-2023-0210" },
  { id: "RDS-2024-004", name: "Pediatric Sleep Architecture Study", study: "SleepArch-PED", participants: 156, dateRange: "2024-03-01 — 2024-12-31", status: "Active", consentRate: 99.4, deidentLevel: "k-anonymity (k=3)", pi: "Dr. James Park", ethicsId: "IRB-2024-0088" },
  { id: "RDS-2024-005", name: "Protocol v3.2 Validation Cohort", study: "ValCohort-2024", participants: 320, dateRange: "2024-01-01 — 2024-12-31", status: "Completed", consentRate: 96.9, deidentLevel: "l-diversity (l=4)", pi: "Dr. Aisha Patel", ethicsId: "IRB-2024-0015" },
  { id: "RDS-2023-006", name: "Longitudinal Depression Markers", study: "LongDep-2023", participants: 178, dateRange: "2023-01-15 — 2023-12-15", status: "Archived", consentRate: 94.2, deidentLevel: "Safe Harbor", pi: "Dr. Robert Klein", ethicsId: "IRB-2023-0018" },
  { id: "RDS-2024-007", name: "Anesthesia Depth Correlation", study: "AnesDepth-24", participants: 95, dateRange: "2024-04-01 — 2024-10-31", status: "Active", consentRate: 97.9, deidentLevel: "k-anonymity (k=5)", pi: "Dr. Linda Foster", ethicsId: "IRB-2024-0102" },
  { id: "RDS-2024-008", name: "Concussion Baseline Norms", study: "ConcBase-2024", participants: 412, dateRange: "2024-05-01 — 2024-11-30", status: "Pending Ethics", consentRate: 0, deidentLevel: "TBD", pi: "Dr. Tom Harrison", ethicsId: "IRB-2024-0156" },
  { id: "RDS-2023-009", name: "Epilepsy Seizure Forecasting", study: "EpiForecast-23", participants: 67, dateRange: "2023-06-01 — 2023-11-30", status: "Archived", consentRate: 92.5, deidentLevel: "l-diversity (l=2)", pi: "Dr. Naomi Cruz", ethicsId: "IRB-2023-0099" },
  { id: "RDS-2024-010", name: "VR Therapy Stress Response", study: "VR-Stress-24", participants: 128, dateRange: "2024-02-15 — 2024-07-15", status: "Completed", consentRate: 98.4, deidentLevel: "k-anonymity (k=4)", pi: "Dr. Daniel Lee", ethicsId: "IRB-2024-0062" },
  { id: "RDS-2024-011", name: "Migraine Aura Detection Model", study: "MigAura-AI", participants: 203, dateRange: "2024-06-01 — 2025-03-31", status: "Active", consentRate: 96.1, deidentLevel: "Safe Harbor", pi: "Dr. Rachel Green", ethicsId: "IRB-2024-0120" },
  { id: "RDS-2024-012", name: "ALS Progression Biomarkers", study: "ALS-Bio-24", participants: 54, dateRange: "2024-01-01 — 2024-12-31", status: "Pending Ethics", consentRate: 0, deidentLevel: "TBD", pi: "Dr. Michael Torres", ethicsId: "IRB-2024-0180" },
  { id: "RDS-2024-013", name: "Post-Stroke Motor Recovery Markers", study: "StrokeRec-2024", participants: 187, dateRange: "2024-03-15 — 2024-09-15", status: "Active", consentRate: 95.7, deidentLevel: "k-anonymity (k=5)", pi: "Dr. Priya Sharma", ethicsId: "IRB-2024-0095" },
  { id: "RDS-2023-014", name: "Chronic Pain EEG Signatures", study: "PainEEG-2023", participants: 134, dateRange: "2023-04-01 — 2023-10-31", status: "Archived", consentRate: 93.3, deidentLevel: "Safe Harbor", pi: "Dr. Kevin Barnes", ethicsId: "IRB-2023-0056" },
];


let datasets = DEMO_DATASETS_FALLBACK;
const FILTERS = ["All", "Active", "Completed", "Archived", "Pending Ethics"];

let pageState = { filter: "All", search: "", currentUser: null };

function checkRole(user) {
  return user && (user.role === "super_admin" || user.role === "admin");
}

function getStatusBadgeClass(status) {
  switch (status) {
    case "Active": return "status-badge status-active";
    case "Completed": return "status-badge status-completed";
    case "Archived": return "status-badge status-archived";
    case "Pending Ethics": return "status-badge status-pending";
    default: return "status-badge";
  }
}

function getDeidentBadgeClass(level) {
  if (level.includes("k-anonymity")) return "deident-badge deident-k";
  if (level.includes("l-diversity")) return "deident-badge deident-l";
  if (level.includes("Safe Harbor")) return "deident-badge deident-sh";
  return "deident-badge deident-tbd";
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

function exportToCSV(datasets) {
  const approved = confirm(
    "Governance check: Exporting research data requires IRB approval and documented participant consent.\n\n" +
    "Confirm you have authorization to export these datasets.\n\n" +
    "De-identification level will be included in the export metadata."
  );
  if (!approved) {
    logAudit("EXPORT_DENIED", "research_datasets");
    alert("Export cancelled. This denial has been logged.");
    return;
  }
  const headers = [
    "Dataset ID", "Name", "Study", "PI", "Participants",
    "Date Range", "Status", "Consent Rate %",
    "De-identification Level", "Ethics ID", "Export Timestamp"
  ];
  const rows = datasets.map(d => [
    d.id,
    `"${d.name}"`,
    d.study,
    d.pi,
    d.participants,
    d.dateRange,
    d.status,
    d.consentRate,
    d.deidentLevel,
    d.ethicsId,
    new Date().toISOString()
  ]);
  const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `research_datasets_export_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  logAudit("EXPORT_CSV", "research_datasets");
}

function getFilteredDatasets() {
  return datasets.filter(d => {
    const matchFilter = pageState.filter === "All" || d.status === pageState.filter;
    const term = pageState.search.toLowerCase();
    const matchSearch = !term ||
      d.name.toLowerCase().includes(term) ||
      d.id.toLowerCase().includes(term) ||
      d.study.toLowerCase().includes(term) ||
      d.pi.toLowerCase().includes(term) ||
      d.ethicsId.toLowerCase().includes(term);
    return matchFilter && matchSearch;
  });
}

function getKPIs() {
  return {
    total: DEMO_datasets.length,
    active: datasets.filter(d => d.status === "Active").length,
    completed: datasets.filter(d => d.status === "Completed").length,
    participants: datasets.reduce((s, d) => s + d.participants, 0),
    dataPoints: datasets.reduce((s, d) => s + (d.participants * 1200), 0),
    avgConsent: (datasets.reduce((s, d) => s + d.consentRate, 0) / datasets.filter(d => d.consentRate > 0).length).toFixed(1),
  };
}

function renderDatasetDetail(datasetId) {
  const ds = datasets.find(d => d.id === datasetId);
  if (!ds) return null;
  return `
    <div class="dataset-detail-panel" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin-top:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h3 style="margin:0;font-size:18px;">${ds.name}</h3>
        <span class="${getStatusBadgeClass(ds.status)}">${ds.status}</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;font-size:13px;color:#475569;">
        <div><strong>Dataset ID:</strong> <code>${ds.id}</code></div>
        <div><strong>Study:</strong> ${ds.study}</div>
        <div><strong>Principal Investigator:</strong> ${ds.pi}</div>
        <div><strong>Participants:</strong> ${ds.participants}</div>
        <div><strong>Date Range:</strong> ${ds.dateRange}</div>
        <div><strong>Consent Rate:</strong> ${ds.consentRate}%</div>
        <div><strong>De-identification:</strong> <span class="${getDeidentBadgeClass(ds.deidentLevel)}">${ds.deidentLevel}</span></div>
        <div><strong>Ethics Approval:</strong> <code>${ds.ethicsId}</code></div>
      </div>
      <div style="margin-top:16px;display:flex;gap:8px;">
        <button class="btn-action btn-export-row" data-id="${ds.id}" onclick="window.__exportDatasetRow('${ds.id}')">Export This Dataset</button>
        <button class="btn-action btn-archive" data-id="${ds.id}" onclick="window.__toggleArchive('${ds.id}')">${ds.status === "Archived" ? "Restore" : "Archive"}</button>
      </div>
    </div>
  `;
}

window.__exportDatasetRow = function(id) {
  const ds = datasets.find(d => d.id === id);
  if (ds) exportToCSV([ds]);
};

window.__toggleArchive = function(id) {
  const container = document.getElementById("app-main");
  const ds = datasets.find(d => d.id === id);
  if (!ds) return;
  if (ds.status === "Archived") {
    ds.status = "Active";
    logAudit("RESTORE_DATASET", ds.id);
  } else {
    ds.status = "Archived";
    logAudit("ARCHIVE_DATASET", ds.id);
  }
  render(container);
};

function render(container) {
  const kpis = getKPIs();
  const datasets = getFilteredDatasets();
  const isAdmin = checkRole(pageState.currentUser);

  const kpiGrid = `
    <div class="kpi-grid">
      <div class="kpi-card"><div class="kpi-value">${kpis.total}</div><div class="kpi-label">Total Datasets</div></div>
      <div class="kpi-card"><div class="kpi-value">${kpis.active}</div><div class="kpi-label">Active Studies</div></div>
      <div class="kpi-card"><div class="kpi-value">${kpis.participants.toLocaleString()}</div><div class="kpi-label">Participants Enrolled</div></div>
      <div class="kpi-card"><div class="kpi-value">${(kpis.dataPoints / 1e6).toFixed(1)}M</div><div class="kpi-label">Data Points</div></div>
    </div>`;

  const filterTabs = `
    <div class="filter-tabs">
      ${FILTERS.map(f => `<button class="filter-tab ${pageState.filter === f ? "active" : ""}" data-filter="${f}">${f}</button>`).join("")}
    </div>`;

  const searchBar = `
    <div class="search-row">
      <input type="text" class="search-input" placeholder="Search by dataset name, ID, study, PI, or ethics ID..." value="${pageState.search}" id="dataset-search" />
      <button class="btn-export" id="btn-export-csv">Export CSV</button>
    </div>`;

  let content;
  if (!isAdmin) {
    content = `
      <div class="restricted-card">
        <h2>Access Restricted</h2>
        <p>This page requires super-admin or admin privileges. Research dataset governance is restricted to authorized personnel only.</p>
        <p style="margin-top:12px;font-size:12px;color:#991b1b;">Research data use requires IRB approval and participant consent.</p>
      </div>`;
  } else {
    const tableRows = datasets.map(d => `
      <tr data-id="${d.id}">
        <td><code>${d.id}</code></td>
        <td><strong>${d.name}</strong></td>
        <td>${d.study}</td>
        <td>${d.pi}</td>
        <td>${d.participants}</td>
        <td>${d.dateRange}</td>
        <td><span class="${getStatusBadgeClass(d.status)}">${d.status}</span></td>
        <td>
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="font-weight:600;color:${d.consentRate >= 95 ? '#059669' : d.consentRate >= 90 ? '#d97706' : '#dc2626'}">${d.consentRate}%</span>
            <span style="width:40px;height:4px;background:#e2e8f0;border-radius:2px;display:inline-block;position:relative;">
              <span style="position:absolute;left:0;top:0;height:100%;width:${d.consentRate}%;background:${d.consentRate >= 95 ? '#059669' : d.consentRate >= 90 ? '#d97706' : '#dc2626'};border-radius:2px;"></span>
            </span>
          </div>
        </td>
        <td><span class="${getDeidentBadgeClass(d.deidentLevel)}">${d.deidentLevel}</span></td>
        <td class="action-cell">
          <button class="btn-action btn-view" data-id="${d.id}">View</button>
          <button class="btn-action btn-export-row" data-id="${d.id}">Export</button>
          <button class="btn-action btn-archive" data-id="${d.id}">${d.status === "Archived" ? "Restore" : "Archive"}</button>
          <button class="btn-action btn-delete" data-id="${d.id}">Delete</button>
        </td>
      </tr>
    `).join("");

    content = `
      ${kpiGrid}
      <div class="admin-section">
        ${filterTabs}
        ${searchBar}
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Dataset ID</th>
                <th>Name</th>
                <th>Study</th>
                <th>PI</th>
                <th>Participants</th>
                <th>Date Range</th>
                <th>Status</th>
                <th>Consent Rate</th>
                <th>De-identification Level</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>${tableRows || `<tr><td colspan="10" class="empty-row">No datasets match the current filter.</td></tr>`}</tbody>
          </table>
        </div>
        <div class="table-meta">Showing ${datasets.length} of ${datasets.length} datasets &bull; Average consent rate: ${kpis.avgConsent}%</div>
        <div id="detail-panel"></div>
      </div>`;
  }

  container.innerHTML = `
    <div class="admin-container">
      <div class="admin-header">
        <h1 class="admin-title">Research Datasets</h1>
        <p class="admin-subtitle">Manage research datasets, consent rates, and de-identification levels</p>
      </div>
      <div class="safety-banner">
        <span class="safety-icon">&#9888;</span>
        <span>Research data use requires IRB approval and participant consent. All exports are logged for compliance auditing.</span>
      </div>
      ${content}
    </div>
  `;

  // Event bindings
  if (isAdmin) {
    container.querySelectorAll(".filter-tab").forEach(btn => {
      btn.addEventListener("click", () => { pageState.filter = btn.dataset.filter; render(container); });
    });
    const searchInput = container.querySelector("#dataset-search");
    if (searchInput) {
      searchInput.addEventListener("input", e => { pageState.search = e.target.value; render(container); });
    }
    const exportBtn = container.querySelector("#btn-export-csv");
    if (exportBtn) {
      exportBtn.addEventListener("click", () => exportToCSV(getFilteredDatasets()));
    }
    container.querySelectorAll(".btn-view").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        logAudit("VIEW_DATASET", id);
        const panel = container.querySelector("#detail-panel");
        if (panel) panel.innerHTML = renderDatasetDetail(id);
      });
    });
    container.querySelectorAll(".btn-export-row").forEach(btn => {
      btn.addEventListener("click", () => {
        const d = datasets.find(x => x.id === btn.dataset.id);
        if (d) exportToCSV([d]);
      });
    });
    container.querySelectorAll(".btn-archive").forEach(btn => {
      btn.addEventListener("click", () => {
        const d = datasets.find(x => x.id === btn.dataset.id);
        if (!d) return;
        if (d.status === "Archived") {
          const ok = confirm(`Restore dataset ${d.id} — ${d.name} to Active status?`);
          if (!ok) return;
          d.status = "Active";
          logAudit("RESTORE_DATASET", d.id);
        } else {
          const ok = confirm(`Archive dataset ${d.id} — ${d.name}? It will no longer appear in active study lists.`);
          if (!ok) return;
          d.status = "Archived";
          logAudit("ARCHIVE_DATASET", d.id);
        }
        render(container);
      });
    });
    container.querySelectorAll(".btn-delete").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const d = datasets.find(x => x.id === id);
        if (!d) return;
        const ok = confirm(`Delete dataset ${id} — ${d.name}?\n\nThis action is IRREVERSIBLE. All associated data will be permanently removed.`);
        if (!ok) return;
        const idx = datasets.findIndex(x => x.id === id);
        if (idx !== -1) {
          datasets.splice(idx, 1);
          logAudit("DELETE_DATASET", id);
          render(container);
        }
      });
    });
  }
}

/**
 * Entry function for the Research Datasets admin page.
 * @param {Function} setTopbar - Callback to configure topbar
 * @param {Function} navigate - Router navigation function
 */
export async function pgAdminResearchDatasets(setTopbar, navigate) {
  const main = document.getElementById("app-main");
  if (!main) return;
  pageState.currentUser = window.__SYNAPS_USER__ || JSON.parse(localStorage.getItem("synaps_user") || "null");
  if (setTopbar) {
    setTopbar({ title: "Research Datasets", breadcrumbs: ["Admin", "Research Datasets"] });
  }

  // Try API first, fall back to demo data
  const clinicId = currentUser?.clinicId || window.sessionStorage.getItem('clinic_id') || 'demo-clinic';
  try {
    const resp = await api.getAdminResearchDatasets(clinicId);
    if (resp && resp.length > 0) { datasets = resp; }
    else if (resp && resp.items && resp.items.length > 0) { datasets = resp.items; }
  } catch (err) {
    console.warn('[AdminResearchDatasets] API error:', err.message);
    datasets = DEMO_DATASETS_FALLBACK;
  }

  render(main);
}

/**
 * Validates that the user has proper admin credentials before
 * allowing dataset management operations.
 * @param {Object} user - User object with role property
 * @returns {boolean} - Whether user is authorized
 */
function validateAdminAccess(user) {
  const isAuthorized = checkRole(user);
  if (!isAuthorized) {
    logAudit("ACCESS_DENIED", "research_datasets_page");
  }
  return isAuthorized;
}

/**
 * Generates a de-identification report for a specific dataset.
 * Includes k-anonymity, l-diversity, or Safe Harbor compliance info.
 * @param {string} datasetId - The dataset identifier
 * @returns {string} - HTML report string
 */
function generateDeidentReport(datasetId) {
  const ds = datasets.find(d => d.id === datasetId);
  if (!ds) return "<p>Dataset not found.</p>";
  let report = "<div class=\"deident-report\">";
  report += `<h4>De-identification Report: ${ds.id}</h4>`;
  report += `<p><strong>Method:</strong> ${ds.deidentLevel}</p>`;
  if (ds.deidentLevel.includes("k-anonymity")) {
    const k = ds.deidentLevel.match(/k=(\d+)/);
    report += `<p>Each record is indistinguishable from at least ${k ? k[1] : 'k'} other records.</p>`;
  }
  if (ds.deidentLevel.includes("l-diversity")) {
    const l = ds.deidentLevel.match(/l=(\d+)/);
    report += `<p>Each equivalence class contains at least ${l ? l[1] : 'l'} distinct sensitive values.</p>`;
  }
  if (ds.deidentLevel.includes("Safe Harbor")) {
    report += `<p>HIPAA Safe Harbor method: 18 identifiers removed per 45 CFR 164.514(b)(2).</p>`;
  }
  report += `<p><strong>Consent Rate:</strong> ${ds.consentRate}%</p>`;
  report += `<p><strong>Ethics Approval:</strong> ${ds.ethicsId}</p>`;
  report += "</div>";
  return report;
}

export default { pgAdminResearchDatasets };
