/
import { api } from './api.js';
import { currentUser } from './state.js';

* ============================================================
   DeepSynaps Protocol Studio — Quick Actions Panel (Today Page)
   ============================================================ */

// ─── Icon SVGs ──────────────────────────────────────────────────
const ICONS = {
  session: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>`,
  queue: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
  patient: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  wizard: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>`,
  assessment: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/><line x1="9" y1="11" x2="12" y2="11"/></svg>`,
  adherence: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>`,
  note: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
  calendar: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  analysis: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>`,
  evidence: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  export: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
  settings: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`
};

// ─── Tile Configuration ─────────────────────────────────────────
const DEMO_TILES = [
  { id: "session", label: "Start Session", desc: "Begin a new clinical session", icon: "session", shortcut: "⌘N", nav: "session-execution", roles: ["clinician", "therapist", "admin", "researcher"] },
  { id: "queue", label: "Review Queue", desc: "Pending reviews and approvals", icon: "queue", shortcut: "⌘Q", nav: "review-queue", roles: ["clinician", "admin", "supervisor"], badge: 3 },
  { id: "patient", label: "Patient Search", desc: "Find and manage patients", icon: "patient", shortcut: "⌘P", nav: "patients", roles: ["clinician", "therapist", "admin", "coordinator"] },
  { id: "wizard", label: "Protocol Wizard", desc: "Create or modify protocols", icon: "wizard", shortcut: "⌘W", nav: "protocol-wizard", roles: ["clinician", "admin", "researcher"] },
  { id: "assessment", label: "Assessments", desc: "Clinical scales and forms", icon: "assessment", shortcut: "⌘A", nav: "assessments-v2", roles: ["clinician", "therapist", "admin", "researcher", "coordinator"] },
  { id: "adherence", label: "Adherence Check", desc: "Monitor treatment compliance", icon: "adherence", shortcut: "⌘H", nav: "adherence-hub", roles: ["clinician", "coordinator", "admin"], badge: 1 },
  { id: "note", label: "Write Note", desc: "Clinical notes and documentation", icon: "note", shortcut: "⌘E", nav: "clinical-notes", roles: ["clinician", "therapist", "admin", "researcher"] },
  { id: "calendar", label: "View Schedule", desc: "Appointments and calendar", icon: "calendar", shortcut: "⌘D", nav: "calendar", roles: ["clinician", "therapist", "admin", "coordinator"] },
  { id: "analysis", label: "Run Analysis", desc: "Biomarker data and analytics", icon: "analysis", shortcut: "⌘R", nav: "biomarkers", roles: ["clinician", "admin", "researcher"] },
  { id: "evidence", label: "Evidence Search", desc: "Literature and research hub", icon: "evidence", shortcut: "⌘F", nav: "evidence-research", roles: ["clinician", "admin", "researcher", "supervisor"] },
  { id: "export", label: "Export Data", desc: "Export reports and datasets", icon: "export", shortcut: "⌘X", nav: "data-export", roles: ["admin", "researcher"] },
  { id: "settings", label: "Settings", desc: "Profile and preferences", icon: "settings", shortcut: "⌘,", nav: "profile", roles: ["clinician", "therapist", "admin", "researcher", "coordinator", "supervisor"] }
];

// ─── Recently Used Helpers ──────────────────────────────────────
const RECENT_KEY = "ds_quick_actions_recent";
const MAX_RECENT = 6;

function getRecent() {
  try {
    const data = localStorage.getItem(RECENT_KEY);
    return data ? JSON.parse(data) : [];
  } catch { return []; }
}

function addRecent(tileId) {
  try {
    let recent = getRecent().filter(id => id !== tileId);
    recent.unshift(tileId);
    recent = recent.slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
  } catch { /* silent */ }
}

// ─── Main entry function ────────────────────────────────────────
export async function pgQuickActions(setTopbar, navigate) {
  setTopbar("Quick Actions", [
    { label: "Dashboard", action: () => navigate("dashboard") },
    { label: "Quick Actions", active: true }
  ]);

  let filterText = "";
  const root = document.getElementById("app-content");

  // Detect current role (fallback to clinician)
  function getRole() {
    try {
      const user = JSON.parse(localStorage.getItem("ds_user") || "{}");
      return user.role || "clinician";
    } catch { return "clinician"; }
  }

  const userRole = getRole();

  // Try API first, fall back to demo tiles
  let ALL_TILES = DEMO_TILES;
  try {
    const resp = await api.getQuickActions(userRole);
    if (resp && resp.length > 0) {
      ALL_TILES = resp;
    } else if (resp && resp.items && resp.items.length > 0) {
      ALL_TILES = resp.items;
    }
  } catch (err) {
    console.warn('[QuickActions] API error:', err.message);
  }

  function getVisibleTiles() {
    return ALL_TILES.filter(t => t.roles.includes(userRole));
  }

  function getFilteredTiles() {
    const visible = getVisibleTiles();
    if (!filterText.trim()) return visible;
    const f = filterText.toLowerCase();
    return visible.filter(t =>
      t.label.toLowerCase().includes(f) ||
      t.desc.toLowerCase().includes(f) ||
      t.id.toLowerCase().includes(f)
    );
  }

  function getRecentTiles() {
    const recentIds = getRecent();
    const visible = getVisibleTiles();
    return recentIds.map(id => visible.find(t => t.id === id)).filter(Boolean);
  }

  function buildHTML() {
    const tiles = getFilteredTiles();
    const recent = getRecentTiles();
    const hasFilter = filterText.trim().length > 0;

    return /*html*/ `
      <div class="quick-actions-container" style="padding:20px;max-width:1200px;margin:0 auto;">

        <!-- ─── Header ─── -->
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px;">
          <div>
            <h2 style="font-size:16px;font-weight:600;color:var(--text);margin:0;">Today at a Glance</h2>
            <div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">Role: <strong style="color:var(--text);text-transform:capitalize;">${escapeHtml(userRole)}</strong> · ${getVisibleTiles().length} actions available</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            <input type="text" id="qa-filter-input"
              placeholder="Filter actions..."
              value="${escapeHtml(filterText)}"
              style="padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:13px;background:var(--surface-1);color:var(--text);width:200px;">
            ${filterText ? `<button id="qa-clear-filter" style="padding:6px 12px;background:var(--surface-2);color:var(--text);border:1px solid var(--border);border-radius:6px;font-size:11px;cursor:pointer;">Clear</button>` : ""}
          </div>
        </div>

        <!-- ─── Recently Used ─── -->
        ${!hasFilter && recent.length > 0 ? /*html*/`
          <div class="recently-used" style="margin-bottom:20px;">
            <div class="recently-used-title" style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:10px;">Recently Used</div>
            <div class="quick-actions-grid" style="display:grid;grid-template-columns:repeat(auto-fill, minmax(200px, 1fr));gap:12px;">
              ${recent.map(tile => renderTile(tile, true)).join("")}
            </div>
          </div>
        ` : ""}

        <!-- ─── All Actions ─── -->
        <div style="margin-bottom:10px;">
          <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:10px;">
            ${hasFilter ? `Search Results (${tiles.length})` : "All Actions"}
          </div>
        </div>

        <div class="quick-actions-grid" style="display:grid;grid-template-columns:repeat(auto-fill, minmax(200px, 1fr));gap:12px;">
          ${tiles.map(tile => renderTile(tile, false)).join("")}
        </div>

        ${tiles.length === 0 ? /*html*/`
          <div style="padding:40px;text-align:center;color:var(--text-secondary);font-size:13px;">
            <div style="font-size:24px;margin-bottom:8px;">🔍</div>
            <div>No actions match "<strong>${escapeHtml(filterText)}</strong>"</div>
            <button id="qa-clear-empty" style="margin-top:10px;padding:6px 14px;background:var(--surface-2);color:var(--text);border:1px solid var(--border);border-radius:6px;font-size:11px;cursor:pointer;">Clear filter</button>
          </div>
        ` : ""}

        <!-- ─── Role Info Footer ─── -->
        <div style="margin-top:24px;padding:12px 16px;background:var(--surface-1);border:1px solid var(--border);border-radius:8px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          <div style="font-size:11px;color:var(--text-secondary);">
            Showing ${tiles.length} of ${ALL_TILES.length} total actions for your role.
            <a href="#" id="qa-change-role" style="color:var(--accent);text-decoration:none;margin-left:6px;">Switch role</a>
          </div>
          <div style="font-size:10px;color:var(--text-secondary);background:var(--surface-2);padding:3px 10px;border-radius:4px;">
            Tip: Use keyboard shortcuts to launch actions faster
          </div>
        </div>
      </div>
    `;
  }

  function renderTile(tile, isRecent) {
    const badgeHtml = tile.badge
      ? `<span style="position:absolute;top:10px;right:10px;background:#dc2626;color:#fff;font-size:10px;font-weight:700;padding:1px 6px;border-radius:8px;min-width:16px;text-align:center;">${tile.badge}</span>`
      : "";

    return /*html*/ `
      <div class="quick-action-tile ${isRecent ? "recent" : ""}"
        data-id="${tile.id}" data-nav="${tile.nav}"
        style="position:relative;background:var(--surface-1);border:1px solid ${isRecent ? "var(--accent)" : "var(--border)"};border-radius:10px;padding:16px;cursor:pointer;transition:all 0.15s;display:flex;flex-direction:column;gap:8px;${isRecent ? "box-shadow:0 1px 4px rgba(0,0,0,0.04);" : ""}"
        onmouseenter="this.style.borderColor='var(--accent)';this.style.boxShadow='0 2px 8px rgba(0,0,0,0.06)';this.style.transform='translateY(-1px)'"
        onmouseleave="this.style.borderColor='${isRecent ? "var(--accent)" : "var(--border)"}';this.style.boxShadow='${isRecent ? "0 1px 4px rgba(0,0,0,0.04)" : "none"}';this.style.transform='none'">
        ${badgeHtml}
        <div class="quick-action-icon" style="font-size:24px;color:var(--accent);width:24px;height:24px;">
          ${ICONS[tile.icon] || ICONS.settings}
        </div>
        <div class="quick-action-label" style="font-size:13px;font-weight:600;color:var(--text);margin-top:2px;">${escapeHtml(tile.label)}</div>
        <div class="quick-action-desc" style="font-size:11px;color:var(--text-secondary);line-height:1.35;">${escapeHtml(tile.desc)}</div>
        <div style="flex:1;"></div>
        <div class="quick-action-shortcut" style="align-self:flex-end;font-size:10px;color:var(--text-secondary);background:var(--surface-2);padding:2px 6px;border-radius:4px;font-family:monospace;">${tile.shortcut}</div>
      </div>
    `;
  }

  function escapeHtml(s) {
    return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // ─── Render & Bind ────────────────────────────────────────────
  function render() {
    root.innerHTML = buildHTML();
    bindEvents();
  }

  function bindEvents() {
    // Tile clicks
    root.querySelectorAll(".quick-action-tile").forEach(tileEl => {
      tileEl.addEventListener("click", () => {
        const tileId = tileEl.dataset.id;
        const target = tileEl.dataset.nav;
        addRecent(tileId);
        navigate(target);
      });
    });

    // Filter input
    const filterInput = root.querySelector("#qa-filter-input");
    if (filterInput) {
      filterInput.addEventListener("input", e => {
        filterText = e.target.value;
        render();
        // Restore focus
        requestAnimationFrame(() => {
          const el = root.querySelector("#qa-filter-input");
          if (el) {
            el.focus();
            el.setSelectionRange(filterText.length, filterText.length);
          }
        });
      });
    }

    // Clear filter button
    const clearBtn = root.querySelector("#qa-clear-filter");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        filterText = "";
        render();
      });
    }

    // Clear from empty state
    const clearEmpty = root.querySelector("#qa-clear-empty");
    if (clearEmpty) {
      clearEmpty.addEventListener("click", () => {
        filterText = "";
        render();
      });
    }

    // Role switcher
    const roleLink = root.querySelector("#qa-change-role");
    if (roleLink) {
      roleLink.addEventListener("click", e => {
        e.preventDefault();
        showRoleSwitcher();
      });
    }
  }

  // ─── Role Switcher Modal ──────────────────────────────────────
  function showRoleSwitcher() {
    const existing = document.querySelector(".qa-role-modal");
    if (existing) existing.remove();

    const roles = ["clinician", "therapist", "admin", "researcher", "coordinator", "supervisor"];
    const modal = document.createElement("div");
    modal.className = "qa-role-modal";
    modal.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:9998;`;
    modal.innerHTML = /*html*/ `
      <div style="background:var(--surface-1);border:1px solid var(--border);border-radius:12px;padding:20px;width:320px;box-shadow:0 8px 32px rgba(0,0,0,0.15);">
        <h3 style="font-size:14px;font-weight:600;color:var(--text);margin:0 0 14px 0;">Switch Role</h3>
        <div style="display:flex;flex-direction:column;gap:6px;">
          ${roles.map(role => /*html*/`
            <button class="qa-role-option" data-role="${role}"
              style="padding:8px 12px;text-align:left;font-size:13px;color:var(--text);background:${role === userRole ? "var(--surface-2)" : "transparent"};border:1px solid ${role === userRole ? "var(--accent)" : "var(--border)"};border-radius:6px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;">
              <span style="text-transform:capitalize;">${role}</span>
              ${role === userRole ? `<span style="font-size:10px;color:var(--accent);font-weight:600;">Current</span>` : ""}
            </button>
          `).join("")}
        </div>
        <button id="qa-close-modal" style="margin-top:12px;padding:8px 14px;background:var(--surface-2);color:var(--text);border:1px solid var(--border);border-radius:6px;font-size:12px;cursor:pointer;width:100%;">Cancel</button>
      </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener("click", e => {
      if (e.target === modal) modal.remove();
    });

    modal.querySelectorAll(".qa-role-option").forEach(btn => {
      btn.addEventListener("click", () => {
        const newRole = btn.dataset.role;
        try {
          const user = JSON.parse(localStorage.getItem("ds_user") || "{}");
          user.role = newRole;
          localStorage.setItem("ds_user", JSON.stringify(user));
        } catch { /* silent */ }
        modal.remove();
        // Re-render with new role
        pgQuickActions(setTopbar, navigate);
      });
    });

    modal.querySelector("#qa-close-modal").addEventListener("click", () => modal.remove());
  }

  // ─── Keyboard Shortcuts ───────────────────────────────────────
  function onKeyDown(e) {
    // Only trigger if no input is focused
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable) return;

    const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
    const mod = isMac ? e.metaKey : e.ctrlKey;
    if (!mod) return;

    const visible = getVisibleTiles();
    const map = {
      "n": "session", "q": "queue", "p": "patient", "w": "wizard",
      "a": "assessment", "h": "adherence", "e": "note", "d": "calendar",
      "r": "analysis", "f": "evidence", "x": "export", ",": "settings"
    };

    const key = e.key.toLowerCase();
    if (map[key]) {
      const tile = visible.find(t => t.id === map[key]);
      if (tile) {
        e.preventDefault();
        addRecent(tile.id);
        navigate(tile.nav);
      }
    }
  }

  document.addEventListener("keydown", onKeyDown);

  // Cleanup on re-render (avoid duplicate listeners)
  const observer = new MutationObserver(() => {
    if (!document.getElementById("app-content").querySelector(".quick-actions-container")) {
      document.removeEventListener("keydown", onKeyDown);
      observer.disconnect();
    }
  });
  observer.observe(document.getElementById("app-content"), { childList: true });

  render();
}

// ─── Module export ──────────────────────────────────────────────
export default { pgQuickActions };
