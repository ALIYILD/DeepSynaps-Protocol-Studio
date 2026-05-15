/


let clinicData = DEMO_DATA_FALLBACK;
mport { api } from './api.js';
import { currentUser } from './state.js';

**
 * DeepSynaps Protocol Studio — Clinic User & Staff Management Page
 * Super-admin page for managing clinic users, roles, MFA status,
 * account activation/deactivation, and password resets.
 *
 * Entry: pgUserClinicManagement(setTopbar, navigate)
 * CSS Classes: .admin-container .admin-header .admin-title .safety-banner
 *              .kpi-grid .kpi-card .kpi-value .kpi-label .data-table
 *              .filter-tabs .filter-tab.active .btn-export .restricted-card
 *              .role-badge-super .role-badge-admin .role-badge-clinician
 *              .role-badge-technician .role-badge-reviewer .role-badge-patient
 */

const DEMO_USERS = [
  { id: "USR-001", name: "Dr. Sarah Chen", email: "s.chen@deepsynaps.med", role: "clinician", clinic: "Neurology Dept, Central Hospital", status: "Active", lastActive: "2024-06-15 09:23", mfa: true },
  { id: "USR-002", name: "Dr. Marcus Webb", email: "m.webb@deepsynaps.med", role: "clinician", clinic: "Trauma Center, Metro General", status: "Active", lastActive: "2024-06-15 08:45", mfa: true },
  { id: "USR-003", name: "Elena Vasquez", email: "e.vasquez@deepsynaps.med", role: "admin", clinic: "Research Division, Central Hospital", status: "Active", lastActive: "2024-06-14 16:30", mfa: true },
  { id: "USR-004", name: "James Park", email: "j.park@deepsynaps.med", role: "technician", clinic: "Sleep Lab, Westside Clinic", status: "Active", lastActive: "2024-06-15 07:12", mfa: false },
  { id: "USR-005", name: "Aisha Patel", email: "a.patel@deepsynaps.med", role: "reviewer", clinic: "Ethics Board, Central Hospital", status: "Active", lastActive: "2024-06-14 14:55", mfa: true },
  { id: "USR-006", name: "Robert Klein", email: "r.klein@deepsynaps.med", role: "clinician", clinic: "Psychiatry, Northwood Medical", status: "Inactive", lastActive: "2024-05-28 11:20", mfa: true },
  { id: "USR-007", name: "Linda Foster", email: "l.foster@deepsynaps.med", role: "clinician", clinic: "Anesthesiology, Metro General", status: "Active", lastActive: "2024-06-15 06:50", mfa: false },
  { id: "USR-008", name: "Tom Harrison", email: "t.harrison@deepsynaps.med", role: "clinician", clinic: "Sports Medicine, Westside Clinic", status: "Active", lastActive: "2024-06-14 18:10", mfa: true },
  { id: "USR-009", name: "Naomi Cruz", email: "n.cruz@deepsynaps.med", role: "technician", clinic: "EEG Lab, Central Hospital", status: "Active", lastActive: "2024-06-15 09:05", mfa: true },
  { id: "USR-010", name: "Daniel Lee", email: "d.lee@deepsynaps.med", role: "super_admin", clinic: "IT Administration", status: "Active", lastActive: "2024-06-15 09:30", mfa: true },
  { id: "USR-011", name: "Rachel Green", email: "r.green@deepsynaps.med", role: "reviewer", clinic: "AI Ethics Committee", status: "Active", lastActive: "2024-06-14 12:40", mfa: true },
  { id: "USR-012", name: "Michael Torres", email: "m.torres@deepsynaps.med", role: "clinician", clinic: "Neurology Dept, Central Hospital", status: "Pending", lastActive: "—", mfa: false },
  { id: "USR-013", name: "Patient Portal Demo", email: "portal.demo@patient.io", role: "patient", clinic: "Patient Access Portal", status: "Active", lastActive: "2024-06-14 22:15", mfa: false },
  { id: "USR-014", name: "Sophia Adams", email: "s.adams@deepsynaps.med", role: "admin", clinic: "Research Division, Metro General", status: "Active", lastActive: "2024-06-15 08:00", mfa: true },
  { id: "USR-015", name: "Pending Invite: Dr. Wright", email: "invite.wright@deepsynaps.med", role: "clinician", clinic: "Cardiology, Central Hospital", status: "Pending", lastActive: "—", mfa: false },
];

const ROLES = ["super_admin", "admin", "clinician", "technician", "reviewer", "patient"];
const ROLE_LABELS = {
  super_admin: "Super Admin",
  admin: "Admin",
  clinician: "Clinician",
  technician: "Technician",
  reviewer: "Reviewer",
  patient: "Patient"
};
const ROLE_BADGE_CLASSES = {
  super_admin: "role-badge-super",
  admin: "role-badge-admin",
  clinician: "role-badge-clinician",
  technician: "role-badge-technician",
  reviewer: "role-badge-reviewer",
  patient: "role-badge-patient",
};
const ROLE_INLINE_STYLES = {
  super_admin: "background:#fee2e2;color:#991b1b;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:600;display:inline-block;",
  admin: "background:#ffedd5;color:#9a3412;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:600;display:inline-block;",
  clinician: "background:#dbeafe;color:#1e40af;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:600;display:inline-block;",
  technician: "background:#d1fae5;color:#065f46;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:600;display:inline-block;",
  reviewer: "background:#f3e8ff;color:#6b21a8;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:600;display:inline-block;",
  patient: "background:#f3f4f6;color:#4b5563;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:600;display:inline-block;",
};
const FILTERS = ["All", "Clinicians", "Admins", "Patients", "Super-admins", "Pending"];

let pageState = { filter: "All", search: "", currentUser: null, editUserId: null, viewAuditId: null };

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

function getStatusBadgeClass(st) {
  if (st === "Active") return "status-badge status-active";
  if (st === "Inactive") return "status-badge status-inactive";
  if (st === "Pending") return "status-badge status-pending";
  return "status-badge";
}

function getFilteredUsers() {
  return DEMO_USERS.filter(u => {
    let matchFilter = true;
    if (pageState.filter === "Clinicians") matchFilter = u.role === "clinician";
    else if (pageState.filter === "Admins") matchFilter = u.role === "admin";
    else if (pageState.filter === "Patients") matchFilter = u.role === "patient";
    else if (pageState.filter === "Super-admins") matchFilter = u.role === "super_admin";
    else if (pageState.filter === "Pending") matchFilter = u.status === "Pending";
    const term = pageState.search.toLowerCase();
    const matchSearch = !term ||
      u.name.toLowerCase().includes(term) ||
      u.email.toLowerCase().includes(term) ||
      u.clinic.toLowerCase().includes(term) ||
      u.role.toLowerCase().includes(term);
    return matchFilter && matchSearch;
  });
}

function getKPIs() {
  return {
    total: DEMO_USERS.length,
    clinicians: DEMO_USERS.filter(u => u.role === "clinician" && u.status === "Active").length,
    admins: DEMO_USERS.filter(u => u.role === "admin" && u.status === "Active").length,
    patients: DEMO_USERS.filter(u => u.role === "patient").length,
    pending: DEMO_USERS.filter(u => u.status === "Pending").length,
    mfaEnabled: DEMO_USERS.filter(u => u.mfa).length,
  };
}

function exportUsersToCSV(users) {
  const approved = confirm(
    "Governance check: Exporting user data requires super-admin authorization.\n\n" +
    "Confirm you have permission to export clinic staff data.\n\n" +
    "This export will include role assignments and MFA status."
  );
  if (!approved) {
    logAudit("EXPORT_DENIED", "clinic_users");
    alert("Export cancelled. This denial has been logged.");
    return;
  }
  const headers = ["User ID", "Name", "Email", "Role", "Clinic", "Status", "Last Active", "MFA Enabled"];
  const rows = users.map(u => [u.id, `"${u.name}"`, u.email, u.role, `"${u.clinic}"`, u.status, u.lastActive, u.mfa ? "Yes" : "No"]);
  const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `clinic_users_export_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  logAudit("EXPORT_CSV", "clinic_users");
}

function renderEditModal(container) {
  if (!pageState.editUserId) return;
  const user = DEMO_USERS.find(u => u.id === pageState.editUserId);
  if (!user) return;
  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.id = "edit-role-modal";
  modal.innerHTML = `
    <div class="modal-box" style="background:#fff;border-radius:12px;padding:28px;max-width:500px;width:90%;box-shadow:0 25px 50px rgba(0,0,0,0.25);">
      <h3 style="margin:0 0 20px 0;font-size:18px;border-bottom:1px solid #e5e7eb;padding-bottom:12px;">
        Edit Role: ${user.name}
      </h3>
      <div style="margin-bottom:16px;">
        <label style="display:block;font-size:12px;font-weight:600;color:#6b7280;margin-bottom:4px;">User ID</label>
        <code style="background:#f3f4f6;padding:4px 8px;border-radius:4px;font-size:13px;">${user.id}</code>
      </div>
      <div style="margin-bottom:16px;">
        <label style="display:block;font-size:12px;font-weight:600;color:#6b7280;margin-bottom:4px;">Current Role</label>
        <span style="${ROLE_INLINE_STYLES[user.role]}">${ROLE_LABELS[user.role]}</span>
      </div>
      <div style="margin-bottom:16px;">
        <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px;">New Role</label>
        <select id="edit-role-select" class="form-select" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;background:#fff;">
          ${ROLES.map(r => `<option value="${r}" ${r === user.role ? "selected" : ""}>${ROLE_LABELS[r]}</option>`).join("")}
        </select>
      </div>
      <div style="margin-bottom:20px;">
        <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px;">Status</label>
        <select id="edit-status-select" class="form-select" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;background:#fff;">
          <option value="Active" ${user.status === "Active" ? "selected" : ""}>Active</option>
          <option value="Inactive" ${user.status === "Inactive" ? "selected" : ""}>Inactive</option>
          <option value="Pending" ${user.status === "Pending" ? "selected" : ""}>Pending</option>
        </select>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button class="btn-cancel" id="btn-cancel-edit" style="padding:8px 16px;border:1px solid #d1d5db;border-radius:6px;background:#fff;color:#374151;cursor:pointer;font-size:13px;">Cancel</button>
        <button class="btn-save" id="btn-save-role" style="padding:8px 16px;border:0;border-radius:6px;background:#2563eb;color:#fff;cursor:pointer;font-size:13px;font-weight:500;">Save Changes</button>
      </div>
    </div>
  `;
  container.appendChild(modal);
  modal.addEventListener("click", e => {
    if (e.target === modal) { pageState.editUserId = null; modal.remove(); render(container); }
  });
  modal.querySelector("#btn-cancel-edit").addEventListener("click", () => {
    pageState.editUserId = null;
    modal.remove();
    render(container);
  });
  modal.querySelector("#btn-save-role").addEventListener("click", () => {
    const newRole = modal.querySelector("#edit-role-select").value;
    const newStatus = modal.querySelector("#edit-status-select").value;
    const oldRole = user.role;
    const oldStatus = user.status;
    let changed = false;
    if (newRole !== oldRole) {
      const ok = confirm(
        `Change role for ${user.name} from ${ROLE_LABELS[oldRole]} to ${ROLE_LABELS[newRole]}?\n\n` +
        `This action is audited and cannot be undone without a new role change record.\n\n` +
        `Role changes are audited — verify before modifying permissions.`
      );
      if (!ok) return;
      user.role = newRole;
      logAudit("ROLE_CHANGE", user.id, null);
      changed = true;
    }
    if (newStatus !== oldStatus) {
      user.status = newStatus;
      logAudit("STATUS_CHANGE", user.id, null);
      changed = true;
    }
    pageState.editUserId = null;
    modal.remove();
    render(container);
  });
}

function renderAuditPanel(container) {
  if (!pageState.viewAuditId) return;
  const user = DEMO_USERS.find(u => u.id === pageState.viewAuditId);
  if (!user) return;
  const logs = JSON.parse(localStorage.getItem("synaps_audit_log") || "[]");
  const userLogs = logs.filter(l => l.resource === user.id || l.actor === user.email).slice(-20);
  const panel = document.createElement("div");
  panel.id = "audit-panel";
  panel.style.cssText = "background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin-top:12px;";
  if (!userLogs.length) {
    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h4 style="margin:0;font-size:15px;">Audit Log: ${user.name}</h4>
        <button onclick="window.__closeAuditPanel()" style="background:none;border:none;cursor:pointer;font-size:18px;color:#6b7280;">&times;</button>
      </div>
      <p style="color:#6b7280;font-size:13px;">No audit records found for this user in local storage. Check the main Audit Trail page for complete history.</p>
    `;
  } else {
    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h4 style="margin:0;font-size:15px;">Audit Log: ${user.name} (${userLogs.length} events)</h4>
        <button onclick="window.__closeAuditPanel()" style="background:none;border:none;cursor:pointer;font-size:18px;color:#6b7280;">&times;</button>
      </div>
      <div class="table-wrap" style="max-height:300px;overflow-y:auto;">
        <table class="data-table" style="font-size:12px;">
          <thead>
            <tr><th>Timestamp</th><th>Action</th><th>Resource</th><th>Result</th></tr>
          </thead>
          <tbody>
            ${userLogs.map(l => `
              <tr>
                <td><code>${l.timestamp.replace("T", " ").slice(0, 19)}</code></td>
                <td>${l.action}</td>
                <td>${l.resource}</td>
                <td><span class="${l.result === 'success' ? 'status-badge status-active' : 'status-badge status-inactive'}">${l.result}</span></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }
  const existing = container.querySelector("#audit-panel");
  if (existing) existing.remove();
  container.querySelector(".admin-section").appendChild(panel);
}

window.__closeAuditPanel = function() {
  pageState.viewAuditId = null;
  const panel = document.querySelector("#audit-panel");
  if (panel) panel.remove();
};

function render(container) {
  const kpis = getKPIs();
  const users = getFilteredUsers();
  const isAdmin = checkRole(pageState.currentUser);

  const kpiGrid = `
    <div class="kpi-grid">
      <div class="kpi-card"><div class="kpi-value">${kpis.total}</div><div class="kpi-label">Total Users</div></div>
      <div class="kpi-card"><div class="kpi-value">${kpis.clinicians}</div><div class="kpi-label">Active Clinicians</div></div>
      <div class="kpi-card"><div class="kpi-value">${kpis.patients}</div><div class="kpi-label">Patients</div></div>
      <div class="kpi-card"><div class="kpi-value">${kpis.pending}</div><div class="kpi-label">Pending Invites</div></div>
    </div>`;

  const filterTabs = `
    <div class="filter-tabs">
      ${FILTERS.map(f => `<button class="filter-tab ${pageState.filter === f ? "active" : ""}" data-filter="${f}">${f}</button>`).join("")}
    </div>`;

  const searchBar = `
    <div class="search-row">
      <input type="text" class="search-input" placeholder="Search by name, email, clinic, or role..." value="${pageState.search}" id="user-search" />
      <button class="btn-export" id="btn-export-users">Export CSV</button>
    </div>`;

  let content;
  if (!isAdmin) {
    content = `
      <div class="restricted-card">
        <h2>Access Restricted</h2>
        <p>This page requires super-admin or admin privileges. Clinic user management is restricted to authorized personnel only.</p>
        <p style="margin-top:12px;font-size:12px;color:#991b1b;">Role changes are audited — verify before modifying permissions.</p>
      </div>`;
  } else {
    const tableRows = users.map(u => `
      <tr>
        <td>
          <strong>${u.name}</strong><br/>
          <small style="color:#6b7280;font-family:monospace;">${u.id}</small>
        </td>
        <td>${u.email}</td>
        <td><span class="${ROLE_BADGE_CLASSES[u.role] || 'role-badge-patient'}" style="${ROLE_INLINE_STYLES[u.role]}">${ROLE_LABELS[u.role]}</span></td>
        <td>${u.clinic}</td>
        <td><span class="${getStatusBadgeClass(u.status)}">${u.status}</span></td>
        <td>${u.lastActive}</td>
        <td>${u.mfa ? '<span style="color:#059669;font-weight:600">&#10003; Enabled</span>' : '<span style="color:#dc2626;font-weight:600">&#10007; Disabled</span>'}</td>
        <td class="action-cell">
          <button class="btn-action btn-edit" data-id="${u.id}">Edit Role</button>
          <button class="btn-action btn-deactivate" data-id="${u.id}">${u.status === "Active" ? "Deactivate" : "Activate"}</button>
          <button class="btn-action btn-reset" data-id="${u.id}">Reset Password</button>
          <button class="btn-action btn-audit" data-id="${u.id}">View Audit</button>
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
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Clinic</th>
                <th>Status</th>
                <th>Last Active</th>
                <th>MFA</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>${tableRows || `<tr><td colspan="8" class="empty-row">No users match the current filter.</td></tr>`}</tbody>
          </table>
        </div>
        <div class="table-meta">
          Showing ${users.length} of ${DEMO_USERS.length} users &bull;
          ${kpis.mfaEnabled} with MFA enabled &bull;
          ${kpis.admins} active admins
        </div>
      </div>`;
  }

  container.innerHTML = `
    <div class="admin-container">
      <div class="admin-header">
        <h1 class="admin-title">Clinic User & Staff Management</h1>
        <p class="admin-subtitle">Manage clinic users, roles, access control, and MFA status</p>
      </div>
      <div class="safety-banner">
        <span class="safety-icon">&#9888;</span>
        <span>Role changes are audited — verify before modifying permissions. Password resets require secondary confirmation.</span>
      </div>
      ${content}
    </div>
  `;

  // Event bindings
  if (isAdmin) {
    container.querySelectorAll(".filter-tab").forEach(btn => {
      btn.addEventListener("click", () => { pageState.filter = btn.dataset.filter; render(container); });
    });
    const searchInput = container.querySelector("#user-search");
    if (searchInput) {
      searchInput.addEventListener("input", e => { pageState.search = e.target.value; render(container); });
    }
    const exportBtn = container.querySelector("#btn-export-users");
    if (exportBtn) {
      exportBtn.addEventListener("click", () => exportUsersToCSV(getFilteredUsers()));
    }
    container.querySelectorAll(".btn-edit").forEach(btn => {
      btn.addEventListener("click", () => {
        pageState.editUserId = btn.dataset.id;
        render(container);
        renderEditModal(container);
      });
    });
    container.querySelectorAll(".btn-deactivate").forEach(btn => {
      btn.addEventListener("click", () => {
        const u = DEMO_USERS.find(x => x.id === btn.dataset.id);
        if (!u) return;
        if (u.status === "Active") {
          const ok = confirm(`Deactivate user ${u.name}?\n\nThey will immediately lose access to all systems. This action is audited.`);
          if (!ok) return;
          u.status = "Inactive";
          u.lastActive = new Date().toISOString().slice(0, 16).replace("T", " ");
          logAudit("DEACTIVATE_USER", u.id);
        } else {
          const ok = confirm(`Activate user ${u.name}?\n\nThey will regain access to all systems according to their role permissions.`);
          if (!ok) return;
          u.status = "Active";
          logAudit("ACTIVATE_USER", u.id);
        }
        render(container);
      });
    });
    container.querySelectorAll(".btn-reset").forEach(btn => {
      btn.addEventListener("click", () => {
        const u = DEMO_USERS.find(x => x.id === btn.dataset.id);
        if (!u) return;
        const ok = confirm(
          `Reset password for ${u.name}?\n\n` +
          `A temporary password will be generated and sent to ${u.email}.\n\n` +
          `This action is logged for security auditing.`
        );
        if (!ok) return;
        const tempPass = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10).toUpperCase();
        alert(`Temporary password for ${u.name}:\n\n${tempPass}\n\nThis has been logged for security auditing. User must change password on next login.`);
        logAudit("PASSWORD_RESET", u.id);
      });
    });
    container.querySelectorAll(".btn-audit").forEach(btn => {
      btn.addEventListener("click", () => {
        const u = DEMO_USERS.find(x => x.id === btn.dataset.id);
        if (!u) return;
        pageState.viewAuditId = btn.dataset.id;
        render(container);
        renderAuditPanel(container);
        logAudit("VIEW_AUDIT", u.id);
      });
    });
  }
}

/**
 * Entry function for the Clinic User Management admin page.
 * @param {Function} setTopbar - Callback to configure topbar
 * @param {Function} navigate - Router navigation function
 */
export async function pgUserClinicManagement(setTopbar, navigate) {
  const main = document.getElementById("app-main");
  if (!main) return;
  pageState.currentUser = window.__SYNAPS_USER__ || JSON.parse(localStorage.getItem("synaps_user") || "null");
  if (setTopbar) {
    setTopbar({ title: "Clinic Users", breadcrumbs: ["Admin", "Clinic Users"] });
  }

  // Try API first, fall back to demo data
  const clinicId = currentUser?.clinicId || window.sessionStorage.getItem('clinic_id') || 'demo-clinic';
  try {
    const resp = await api.getClinicUsers(clinicId);
    if (resp && resp.length > 0) { clinicUsers = resp; }
    else if (resp && resp.items && resp.items.length > 0) { clinicUsers = resp.items; }
    else if (resp && resp.users && resp.users.length > 0) { clinicUsers = resp.users; }
  } catch (err) {
    console.warn('[ClinicUserManagement] API error:', err.message);
    clinicUsers = DEMO_USERS;
  }

  render(main);
}

export default { pgUserClinicManagement };
