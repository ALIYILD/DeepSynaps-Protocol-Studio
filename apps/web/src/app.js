import { api } from './api.js';
import { currentUser, setCurrentUser, updateUserBar, updatePatientBar, showApp, showPublic, showPatient, showLogin } from './auth.js';
import { ROLE_ENTRY_PAGE } from './constants.js';
import { t, setLocale, getLocale, LOCALES } from './i18n.js';

// ── XSS escape helper (module-level) ─────────────────────────────────────────
function esc(v) {
  if (v == null) return '';
  return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
}

// ── Patient roster cache: restore from sessionStorage on boot ─────────────────
try {
  const _cachedRoster = sessionStorage.getItem('ds_patient_roster');
  if (_cachedRoster) window._patientRoster = JSON.parse(_cachedRoster);
} catch {}

// ── Accessibility: screen-reader announcements ────────────────────────────────
function announce(message, urgent = false) {
  const el = document.getElementById(urgent ? 'a11y-alert' : 'a11y-announce');
  if (!el) return;
  el.textContent = '';
  requestAnimationFrame(() => { el.textContent = message; });
}
window._announce = announce;

// ── Session expiry handler (called by api.js _on401) ─────────────────────────
window._handleSessionExpired = function() {
  api.clearToken();
  setCurrentUser(null);
  sessionStorage.removeItem('ds_pat_selected_id');
  sessionStorage.removeItem('ds_patient_roster');
  navigatePublic('home');
  announce('Your session has expired. Please sign in again.', true);
};

// ── Accessibility: focus trap for modals ──────────────────────────────────────
function trapFocus(element) {
  const focusable = element.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  function handler(e) {
    if (e.key !== 'Tab') return;
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  element.addEventListener('keydown', handler);
  if (first) first.focus();
  return () => element.removeEventListener('keydown', handler);
}
window._trapFocus = trapFocus;

// ── High-contrast mode ────────────────────────────────────────────────────────
window._toggleHighContrast = function() {
  const hc = document.body.classList.toggle('high-contrast');
  localStorage.setItem('ds_high_contrast', hc ? '1' : '0');
  announce(`High contrast mode ${hc ? 'enabled' : 'disabled'}`);
};
// Restore on boot
if (localStorage.getItem('ds_high_contrast') === '1') document.body.classList.add('high-contrast');

// ── Theme management (Dark mode only) ────────────────────────────────────────
(function initTheme() {
  const theme = 'dark'; // Force dark mode always
  localStorage.setItem('ds_theme', theme);
  document.documentElement.classList.remove('light-theme-pending');
  document.body.classList.remove('light-theme');
  window._currentTheme = theme;

  window._setTheme = function(t) {
    // Dark mode only — no-op
    window._currentTheme = 'dark';
    localStorage.setItem('ds_theme', 'dark');
    document.body.classList.remove('light-theme');
  };

  window._toggleTheme = function() {
    // Theme toggle disabled — dark mode only
  };
})();

(function initLangSwitcher() {
  // Inject language switcher button into topbar
  const searchBtn = document.getElementById('search-btn');
  if (!searchBtn) return;
  const wrap = document.createElement('div');
  wrap.className = 'lang-switcher-wrap';
  wrap.style.cssText = 'position:relative;display:inline-block;';
  wrap.innerHTML = `
    <button id="lang-btn" class="lang-btn" title="Language" aria-label="Switch language" onclick="window._toggleLangMenu()" style="background:rgba(255,255,255,0.05);border:1px solid var(--border);border-radius:8px;width:34px;height:34px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--text-secondary);font-size:0.9rem;flex-shrink:0;gap:4px;font-size:11px;font-weight:500;padding:0 6px;width:auto;white-space:nowrap;">
      🌐 <span id="lang-btn-label">${getLocale().toUpperCase()}</span>
    </button>
    <div id="lang-menu" class="lang-menu" style="display:none;" role="menu">
      ${Object.entries(LOCALES).map(([code, name]) =>
        `<button class="lang-menu-item${getLocale()===code?' active':''}" role="menuitem" onclick="window._setLocale('${code}');window._closeLangMenu()">${name}</button>`
      ).join('')}
    </div>
  `;
  searchBtn.parentNode.insertBefore(wrap, searchBtn.nextSibling);

  window._toggleLangMenu = function() {
    const m = document.getElementById('lang-menu');
    if (m) m.style.display = m.style.display === 'none' ? 'block' : 'none';
  };
  window._closeLangMenu = function() {
    const m = document.getElementById('lang-menu');
    if (m) m.style.display = 'none';
    // Update button label
    const lbl = document.getElementById('lang-btn-label');
    if (lbl) lbl.textContent = getLocale().toUpperCase();
    // Re-render nav to update labels
    if (typeof renderNav === 'function') renderNav();
  };
  document.addEventListener('click', function(e) {
    if (!wrap.contains(e.target)) {
      const m = document.getElementById('lang-menu');
      if (m) m.style.display = 'none';
    }
  });
})();

// ── Lazy-loaded page module caches ────────────────────────────────────────────
// Modules are imported on first navigation to a page in that group,
// then cached for all subsequent navigations (Vite chunks them automatically).
let _modPublic    = null;
let _modPatient   = null;
let _modClinical  = null;
let _modKnowledge = null;
let _modPractice  = null;
let _modCourses   = null;
let _modOnboarding = null;
let _modAgents    = null;
let _modRegistries = null;
let _modHandbooks  = null;
let _modProtocols  = null;
let _modVirtualCare   = null;
let _modConditions    = null;
let _modClinicalTools = null;
let _modClinicalHubs  = null;

async function loadPublic()     { return (_modPublic    ??= await import('./pages-public.js')); }
async function loadPatient()    { return (_modPatient   ??= await import('./pages-patient.js')); }
async function loadClinical()   { return (_modClinical  ??= await import('./pages-clinical.js')); }
async function loadClinicalTools() { return (_modClinicalTools ??= await import('./pages-clinical-tools.js')); }
async function loadClinicalHubs()  { return (_modClinicalHubs  ??= await import('./pages-clinical-hubs.js')); }
async function loadKnowledge()  { return (_modKnowledge ??= await import('./pages-knowledge.js')); }
async function loadPractice()   { return (_modPractice  ??= await import('./pages-practice.js')); }
async function loadCourses()    { return (_modCourses   ??= await import('./pages-courses.js')); }
async function loadOnboarding() { return (_modOnboarding ??= await import('./pages-onboarding.js')); }
async function loadAgents()     { return (_modAgents    ??= await import('./pages-agents.js')); }
async function loadRegistries() { return (_modRegistries ??= await import('./pages-registries.js')); }
async function loadHandbooks()  { return (_modHandbooks  ??= await import('./pages-handbooks.js')); }
async function loadProtocols()   { return (_modProtocols   ??= await import('./pages-protocols.js')); }
async function loadVirtualCare()  { return (_modVirtualCare  ??= await import('./pages-virtualcare.js')); }
async function loadConditions()   { return (_modConditions   ??= await import('./pages-conditions.js')); }
let _modResearch = null;
async function loadResearch()     { return (_modResearch ??= await import('./pages-research.js')); }
let _modResearchEvidence = null;
async function loadResearchEvidence() { return (_modResearchEvidence ??= await import('./pages-research-evidence.js')); }
let _modBrainMap = null;
async function loadBrainMap()     { return (_modBrainMap ??= await import('./pages-brainmap.js')); }
let _modQEEGAnalysis = null;
async function loadQEEGAnalysis() { return (_modQEEGAnalysis ??= await import('./pages-qeeg-analysis.js')); }
let _modMonitoring = null;
async function loadMonitoring() { return (_modMonitoring ??= await import('./pages-monitoring.js')); }

// ── Helpers that delegate to the clinical module once loaded ──────────────────
// Called synchronously in navigate() before renderPage(); safe to no-op until
// the clinical module is first loaded.
function _setProStep(v) { _modClinical?.setProStep(v); }
function _setPtab(v)    { _modClinical?.setPtab(v); }

// ── Notification store ────────────────────────────────────────────────────────
const _notifs = [];  // { id, type, title, body, link, ts, read }
let _notifCount = 0;
// Deduplication set — stores SSE event IDs seen in this session to prevent
// duplicate toasts/badge increments after reconnects that replay events.
const _seenNotifIds = new Set();

const _API_BASE = (import.meta.env && import.meta.env.VITE_API_BASE_URL) || 'http://127.0.0.1:8000';

// ── Global error handlers ─────────────────────────────────────────────────────
window.addEventListener('unhandledrejection', (e) => {
  console.error('[DeepSynaps] Unhandled promise rejection:', e.reason);
});
window.addEventListener('error', (e) => {
  console.error('[DeepSynaps] Uncaught error:', e.message, e.filename, e.lineno);
});

// ── Offline detection ─────────────────────────────────────────────────────────
window.addEventListener('online', () => {
  document.body.classList.remove('is-offline');
  const _ob = document.getElementById('offline-banner');
  if (_ob) _ob.style.display = 'none';
  window._announce?.('Connection restored');
  setTimeout(syncOfflineQueue, 2000); // Wait 2s for connection to stabilize
});
window.addEventListener('offline', async () => {
  document.body.classList.add('is-offline');
  const _ob = document.getElementById('offline-banner');
  if (_ob) _ob.style.display = 'flex';
  window._announce?.('You are offline', true);
  // Register background sync if supported
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    const sw = await navigator.serviceWorker.ready;
    sw.sync.register('sync-offline-queue').catch(() => {});
  }
});
if (!navigator.onLine) {
  document.body.classList.add('is-offline');
  const _ob0 = document.getElementById('offline-banner');
  if (_ob0) _ob0.style.display = 'flex';
}

// ── Offline sync queue ────────────────────────────────────────────────────────
const OFFLINE_QUEUE_KEY = 'ds_offline_queue';

function getOfflineQueue() {
  try { return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]'); } catch { return []; }
}

function addToOfflineQueue(item) {
  const q = getOfflineQueue();
  q.push({ ...item, id: Math.random().toString(36).slice(2), queued_at: new Date().toISOString() });
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(q));
  updateOfflineQueueBadge();
}

function updateOfflineQueueBadge() {
  const count = getOfflineQueue().length;
  let badge = document.getElementById('offline-queue-badge');
  if (count > 0) {
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'offline-queue-badge';
      badge.style.cssText = 'position:fixed;bottom:16px;left:16px;background:var(--amber-500,#f59e0b);color:#000;border-radius:10px;padding:6px 12px;font-size:0.75rem;font-weight:600;z-index:300;cursor:pointer';
      badge.onclick = () => window._showOfflineQueue();
      document.body.appendChild(badge);
    }
    badge.textContent = `${count} pending sync${count > 1 ? 's' : ''}`;
  } else {
    badge?.remove();
  }
}

async function syncOfflineQueue() {
  const q = getOfflineQueue();
  if (q.length === 0) return;

  const remaining = [];
  for (const item of q) {
    try {
      if (item.type === 'session_log') {
        await api.logSession(item.courseId, item.data);
      } else if (item.type === 'qeeg_record') {
        await api.createQEEGRecord(item.data);
      } else if (item.type === 'outcome') {
        await api.recordOutcome(item.data);
      }
      window._announce?.(`Synced: ${item.type.replace('_', ' ')}`);
    } catch {
      remaining.push(item);
    }
  }

  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
  updateOfflineQueueBadge();
  if (remaining.length < q.length) {
    const synced = q.length - remaining.length;
    _showNotifToast({ title: 'Sync Complete', body: `${synced} item${synced > 1 ? 's' : ''} synced successfully`, severity: 'success' });
  }
}

window._addToOfflineQueue = addToOfflineQueue;
window._syncOfflineQueue = syncOfflineQueue;
window._showOfflineQueue = function() {
  const q = getOfflineQueue();
  // Show as a modal panel instead of alert()
  const existing = document.getElementById('offline-queue-panel');
  if (existing) { existing.remove(); return; }
  const panel = document.createElement('div');
  panel.id = 'offline-queue-panel';
  panel.style.cssText = 'position:fixed;bottom:60px;left:16px;width:320px;max-height:320px;background:var(--navy-850,#0f172a);border:1px solid var(--border,rgba(255,255,255,.12));border-radius:12px;z-index:400;box-shadow:0 8px 32px rgba(0,0,0,.5);overflow:hidden;display:flex;flex-direction:column';
  panel.innerHTML = `
    <div style="padding:12px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
      <span style="font-size:13px;font-weight:600">Pending Syncs (${q.length})</span>
      <button onclick="document.getElementById('offline-queue-panel').remove()" style="background:none;border:none;cursor:pointer;color:var(--text-secondary);font-size:16px">×</button>
    </div>
    <div style="flex:1;overflow-y:auto;padding:8px 12px">
      ${q.length === 0
        ? '<div style="padding:16px;text-align:center;color:var(--text-tertiary);font-size:12.5px">No pending items.</div>'
        : q.map(i => `<div style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:12px;color:var(--text-secondary)">
            <span style="color:var(--text-primary);font-weight:500">${i.type.replace(/_/g,' ')}</span>
            <span style="float:right;color:var(--text-tertiary)">${new Date(i.queued_at).toLocaleTimeString()}</span>
          </div>`).join('')}
    </div>
    <div style="padding:10px 12px;border-top:1px solid var(--border)">
      <div style="font-size:11px;color:var(--text-tertiary)">Will sync automatically when back online.</div>
    </div>`;
  document.body.appendChild(panel);
  setTimeout(() => {
    document.addEventListener('click', function h(e) {
      if (!panel.contains(e.target)) { panel.remove(); document.removeEventListener('click', h); }
    });
  }, 100);
};

// Check queue on boot
updateOfflineQueueBadge();

// ── PWA Install prompt ────────────────────────────────────────────────────────
let _deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  _deferredInstallPrompt = e;
  // Show install banner after 30 seconds if user hasn't installed
  if (!localStorage.getItem('ds_pwa_installed') && !localStorage.getItem('ds_pwa_dismissed')) {
    setTimeout(showInstallBanner, 30000);
  }
});

window.addEventListener('appinstalled', () => {
  localStorage.setItem('ds_pwa_installed', '1');
  document.getElementById('pwa-install-banner')?.remove();
  window._announce?.('App installed successfully');
});

function showInstallBanner() {
  if (document.getElementById('pwa-install-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'pwa-install-banner';
  banner.innerHTML = `
    <div style="position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:var(--surface-2,#1e293b);border:1px solid var(--teal-400,#2dd4bf);border-radius:14px;padding:16px 20px;display:flex;align-items:center;gap:14px;z-index:400;box-shadow:0 8px 24px rgba(0,0,0,0.4);max-width:360px;width:calc(100vw - 32px)">
      <div style="font-size:2rem;flex-shrink:0">📱</div>
      <div style="flex:1">
        <div style="font-weight:600;margin-bottom:2px">Install DeepSynaps</div>
        <div style="font-size:0.78rem;color:var(--text-secondary)">Add to your home screen for quick access</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">
        <button onclick="window._installPWA()" style="background:var(--teal,#00d4bc);color:#000;border:none;border-radius:8px;padding:6px 12px;font-size:0.8rem;font-weight:600;cursor:pointer">Install</button>
        <button onclick="window._dismissInstall()" style="background:none;border:none;color:var(--text-secondary);font-size:0.75rem;cursor:pointer">Not now</button>
      </div>
    </div>`;
  document.body.appendChild(banner);
}

window._installPWA = async function() {
  if (!_deferredInstallPrompt) return;
  await _deferredInstallPrompt.prompt();
  _deferredInstallPrompt = null;
  document.getElementById('pwa-install-banner')?.remove();
};

window._dismissInstall = function() {
  localStorage.setItem('ds_pwa_dismissed', '1');
  document.getElementById('pwa-install-banner')?.remove();
};

// ── Section-level error helper ────────────────────────────────────────────────
window._sectionError = function(containerId, retryFn) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `<div style="padding:24px;text-align:center;border:1px solid var(--border);border-radius:10px;color:var(--text-secondary)">
    <div style="font-size:1.5rem;margin-bottom:8px">⚡</div>
    <div style="font-size:0.875rem">Failed to load data</div>
    ${retryFn ? `<button class="btn-secondary" style="margin-top:12px;font-size:0.8rem" onclick="(${retryFn})()">↺ Retry</button>` : ''}
  </div>`;
};

// ── Global keyboard shortcuts ─────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    // Close any visible modal/overlay panels
    const modalIds = ['assess-modal', 'qeeg-form-panel', 'se-ae-panel'];
    modalIds.forEach(id => {
      const el = document.getElementById(id);
      if (el && el.style.display !== 'none' && el.style.display !== '') {
        el.style.display = 'none';
      }
    });
    // Close any inline-expand panels
    document.querySelectorAll('[id^="ev-expand-"],[id^="qrec-expand-"],[id^="sess-expand-"],[id^="proto-detail-"]').forEach(el => {
      if (el.style.display !== 'none') el.style.display = 'none';
    });
    // Close modal overlays (focus trap modals)
    const modal = document.querySelector('.modal-overlay');
    if (modal) modal.remove();
    // Close side panels
    const sidePanel = document.querySelector('.side-panel');
    if (sidePanel) sidePanel.remove();
    // Close mobile sidebar
    window._closeSidebar();
    // Close command palette
    if (typeof window._closePalette === 'function') window._closePalette(e);
  }
  // Ctrl+K / Cmd+K → Command palette
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    if (typeof window._openPalette === 'function') window._openPalette();
  }
  // Alt+D → Dashboard, Alt+P → Patients, Alt+C → Courses
  if (e.altKey && !e.ctrlKey && !e.metaKey) {
    const shortcuts = { d: 'dashboard', p: 'patients', c: 'courses', r: 'review-queue', s: 'session-execution' };
    if (shortcuts[e.key]) { e.preventDefault(); window._nav(shortcuts[e.key]); }
  }
});

// ── Mobile sidebar toggle ─────────────────────────────────────────────────────
window._toggleSidebar = function() {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sidebar-overlay');
  if (!sb) return;
  const isOpen = sb.classList.contains('mobile-open');
  if (isOpen) { sb.classList.remove('mobile-open'); if (ov) ov.classList.remove('visible'); }
  else { sb.classList.add('mobile-open'); if (ov) ov.classList.add('visible'); }
  const btn = document.getElementById('sidebar-toggle');
  if (btn) btn.setAttribute('aria-expanded', !isOpen ? 'true' : 'false');
};
window._closeSidebar = function() {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sidebar-overlay');
  if (sb) sb.classList.remove('mobile-open');
  if (ov) ov.classList.remove('visible');
  const btn = document.getElementById('sidebar-toggle');
  if (btn) btn.setAttribute('aria-expanded', 'false');
};

// ── State ─────────────────────────────────────────────────────────────────────
let currentPage = 'dashboard';

// ── Role-based nav visibility ─────────────────────────────────────────────────
const ROLE_NAV_HIDE = {
  technician: ['protocol-wizard', 'patients', 'evidence', 'handbooks', 'billing', 'pricing', 'audittrail', 'brainregions', 'qeegmaps', 'protocols-registry', 'outcomes', 'adverse-events', 'population-analytics', 'brain-map-planner', 'handbook-generator', 'notes-dictation', 'assessments-hub', 'data-export', 'irb-manager', 'quality-assurance', 'staff-scheduling', 'insurance', 'referrals', 'longitudinal-report'],
  reviewer:   ['session-execution', 'protocol-wizard', 'billing', 'pricing', 'population-analytics', 'brain-map-planner'],
  guest:      ['session-execution', 'protocol-wizard', 'patients', 'courses', 'review-queue', 'braindata', 'assessments', 'assessments-hub', 'medical-history', 'documents', 'reports', 'outcomes', 'adverse-events', 'audittrail', 'billing', 'population-analytics', 'brain-map-planner', 'notes-dictation', 'reg-conditions', 'reg-assessments', 'reg-protocols', 'reg-devices', 'reg-targets', 'reg-handbooks', 'reg-virtual-care', 'data-export', 'irb-manager', 'quality-assurance', 'staff-scheduling', 'insurance', 'referrals', 'longitudinal-report'],
  clinician:  ['population-analytics'],
};

// ── Nav definition — design-v2 grouping (CLINICAL / PROTOCOL / SESSIONS / ADMIN)
// design-v2 nav IDs — new routes alongside legacy; per-phase migration reparents bodies.
const NAV = [
  // ── CLINICAL ─────────────────────────────────────────────────────────────────
  { section: 'Clinical', sectionId: 'clinical', collapsed: false },
  { id: 'home',               label: 'Dashboard',         icon: '🏠' },
  { id: 'schedule-v2',        label: 'Schedule',          icon: '🗓️' },
  { id: 'assessments-v2',     label: 'Assessments',       icon: '◉' },
  { id: 'patients-v2',        label: 'Patients',          icon: '👥' },

  // ── PROTOCOL ─────────────────────────────────────────────────────────────────
  { section: 'Protocol', sectionId: 'protocol', collapsed: false },
  { id: 'protocol-studio',    label: 'Protocol Studio',   icon: '🧪', ai: true },
  { id: 'brainmap-v2',        label: 'Brain Map Planner', icon: '🧠' },
  { id: 'qeeg-analysis',      label: 'qEEG Analyzer',     icon: '📊', ai: true },
  { id: 'biomarkers',          label: 'Biomarkers',         icon: '🧬' },
  { id: 'handbooks-v2',       label: 'Handbooks',         icon: '📚' },
  { id: 'research-evidence',  label: 'Research Evidence', icon: '🔬', ai: true },

  // ── SESSIONS ─────────────────────────────────────────────────────────────────
  { section: 'Sessions', sectionId: 'sessions', collapsed: false },
  { id: 'live-session',       label: 'Virtual Care',      icon: '📹', ai: true },

  // ── ADMIN ────────────────────────────────────────────────────────────────────
  { section: 'Admin', sectionId: 'admin', collapsed: false },
  { id: 'documents-v2',       label: 'Documents',         icon: '📄' },
  { id: 'reports-v2',         label: 'Reports',           icon: '📈' },
  { id: 'finance-v2',         label: 'Finance',           icon: '💰' },
  { id: 'ai-agent-v2',        label: 'AI Practice Agents', icon: '🤖', ai: true },
  // Research has moved into Reports (Reports → Research tab).
  { id: 'governance-v2',      label: 'Governance',        icon: '🛡️' },
  { id: 'system-health',       label: 'System Health',     icon: '💚' },
  { id: 'academy',            label: 'Academy',           icon: '🎓' },
  { id: 'marketplace',        label: 'Marketplace',       icon: '🛒' },
];

// ── Lucide-style SVG icons for nav items ──────────────────────────────────────
const NAV_ICONS = {
  'home':              `<svg viewBox="0 0 24 24"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  'patients':          `<svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  'courses':           `<svg viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`,
  'clinical-hub':      `<svg viewBox="0 0 24 24"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect width="8" height="4" x="8" y="2" rx="1"/><path d="M8 12h.01"/><path d="M12 12h4"/><path d="M8 16h.01"/><path d="M12 16h4"/></svg>`,
  'assessments':       `<svg viewBox="0 0 24 24"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect width="8" height="4" x="8" y="2" rx="1"/><path d="M8 12h.01"/><path d="M12 12h4"/><path d="M8 16h.01"/><path d="M12 16h4"/></svg>`,
  'protocol-hub':      `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3"/><path d="M12 19v3"/><path d="m4.22 4.22 2.12 2.12"/><path d="m17.66 17.66 2.12 2.12"/><path d="M2 12h3"/><path d="M19 12h3"/><path d="m4.22 19.78 2.12-2.12"/><path d="m17.66 6.34 2.12-2.12"/></svg>`,
  'scheduling-hub':    `<svg viewBox="0 0 24 24"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/></svg>`,
  'monitor-hub':       `<svg viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`,
  'virtual-care-hub':  `<svg viewBox="0 0 24 24"><path d="m22 8-6 4 6 4V8z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>`,
  'documents-hub':     `<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
  'reports-hub':       `<svg viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6"  y1="20" x2="6"  y2="14"/></svg>`,
  'finance-hub':       `<svg viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
  'patients-hub':      `<svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  'medical-history':   `<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
  'assessments-hub':   `<svg viewBox="0 0 24 24"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
  'outcomes':          `<svg viewBox="0 0 24 24"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`,
  'protocol-wizard':   `<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`,
  'brain-map-planner': `<svg viewBox="0 0 24 24"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-1.07-3 2.5 2.5 0 0 1 .49-4.78 2.5 2.5 0 0 1 1.5-4.58A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 1.07-3 2.5 2.5 0 0 0-.49-4.78 2.5 2.5 0 0 0-1.5-4.58A2.5 2.5 0 0 0 14.5 2Z"/></svg>`,
  'prescriptions':     `<svg viewBox="0 0 24 24"><path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/></svg>`,
  'protocols-registry':`<svg viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>`,
  'handbooks':         `<svg viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`,
  'scoring-calc':      `<svg viewBox="0 0 24 24"><rect width="16" height="20" x="4" y="2" rx="2"/><line x1="8" x2="16" y1="6" y2="6"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/></svg>`,
  'adverse-events':    `<svg viewBox="0 0 24 24"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
  'notes-dictation':   `<svg viewBox="0 0 24 24"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>`,
  'wearables':         `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="6"/><polyline points="12 10 12 12 13 13"/><path d="m16.13 7.66-.81-4.05a2 2 0 0 0-2-1.61h-2.68a2 2 0 0 0-2 1.61l-.78 4.05"/><path d="m7.88 16.36.8 4a2 2 0 0 0 2 1.61h2.72a2 2 0 0 0 2-1.61l.81-4.05"/></svg>`,
  'protocol-builder':  `<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`,
  'condition-packages':`<svg viewBox="0 0 24 24"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>`,
  'home-task-manager': `<svg viewBox="0 0 24 24"><path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/></svg>`,
  'reg-conditions':    `<svg viewBox="0 0 24 24"><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><path d="M7 7h.01"/></svg>`,
  'reg-assessments':   `<svg viewBox="0 0 24 24"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/></svg>`,
  'reg-protocols':     `<svg viewBox="0 0 24 24"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/></svg>`,
  'reg-devices':       `<svg viewBox="0 0 24 24"><rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/></svg>`,
  'reg-targets':       `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`,
  'reg-handbooks':     `<svg viewBox="0 0 24 24"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>`,
  'reg-virtual-care':  `<svg viewBox="0 0 24 24"><path d="m22 8-6 4 6 4V8z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>`,
  'scheduling':        `<svg viewBox="0 0 24 24"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>`,
  'billing':           `<svg viewBox="0 0 24 24"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>`,
  'settings':          `<svg viewBox="0 0 24 24"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
  'patient-view':      `<svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
};
// design-v2 nav IDs reuse legacy icon SVGs (same look during transition)
NAV_ICONS['schedule-v2']     = NAV_ICONS['scheduling-hub'];
NAV_ICONS['assessments-v2']  = NAV_ICONS['assessments-hub'];
NAV_ICONS['patients-v2']     = NAV_ICONS['patients-hub'];
NAV_ICONS['protocol-studio'] = NAV_ICONS['protocol-builder'];
NAV_ICONS['brainmap-v2']     = NAV_ICONS['brain-map-planner'];
NAV_ICONS['handbooks-v2']    = NAV_ICONS['handbooks'];
NAV_ICONS['live-session']    = NAV_ICONS['virtual-care-hub'];
NAV_ICONS['home-tasks-v2']   = NAV_ICONS['home-task-manager'];
NAV_ICONS['documents-v2']    = NAV_ICONS['documents-hub'];
NAV_ICONS['reports-v2']      = NAV_ICONS['reports-hub'];
NAV_ICONS['finance-v2']      = NAV_ICONS['finance-hub'];
NAV_ICONS['ai-agent-v2']     = NAV_ICONS['protocol-hub'];
NAV_ICONS['research-v2']     = NAV_ICONS['protocol-wizard'];
NAV_ICONS['governance-v2']   = NAV_ICONS['adverse-events'];
NAV_ICONS['system-health']   = `<svg viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/><circle cx="12" cy="12" r="2" fill="currentColor" opacity=".4"/></svg>`;
NAV_ICONS['research-evidence'] = `<svg viewBox="0 0 24 24"><path d="M10 2v6a2 2 0 0 1-2 2H2"/><path d="M14 2v6a2 2 0 0 0 2 2h6"/><path d="M12 18v4"/><path d="M8 22h8"/><circle cx="12" cy="14" r="4"/></svg>`;
NAV_ICONS['academy']         = `<svg viewBox="0 0 24 24"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>`;
NAV_ICONS['marketplace']     = `<svg viewBox="0 0 24 24"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" x2="21" y1="6" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`;

// ── Section labels ────────────────────────────────────────────────────────────
const SECTION_LABELS = {
  clinical:        'Clinical',
  protocol:        'Protocol',
  sessions:        'Sessions',
  admin:           'Admin',
  // Legacy section ids retained so any other consumer that looks them up still works.
  'patient-care':  'Patient Care',
  'clinical-tools':'Clinical Tools',
  operations:      'Operations',
  research:        'Research',
};

// ── Nav collapse state ────────────────────────────────────────────────────────
// Primary key: ds_nav_collapsed_sections (new); falls back to legacy ds_nav_collapsed
const _navCollapsed = (() => {
  try {
    const v = localStorage.getItem('ds_nav_collapsed_sections');
    if (v) return JSON.parse(v);
    // migrate legacy key
    const old = localStorage.getItem('ds_nav_collapsed');
    return old ? JSON.parse(old) : {};
  } catch { return {}; }
})();
function _saveNavCollapsed() {
  try { localStorage.setItem('ds_nav_collapsed_sections', JSON.stringify(_navCollapsed)); } catch {}
}
// Seed default-collapsed state: collapse any section whose NAV entry has collapsed:true,
// but only if not already set (so user overrides persist).
NAV.forEach(n => {
  if (n.section && n.collapsed && n.sectionId && _navCollapsed[n.sectionId] === undefined)
    _navCollapsed[n.sectionId] = true;
});

// ── Nav render ────────────────────────────────────────────────────────────────
function renderNav() {
  const _navList = document.getElementById('nav-list');
  if (!_navList) return;
  const hiddenForRole = ROLE_NAV_HIDE[currentUser?.role] || [];

  // ── Primary action button + patient quick search ─────────────────────────────
  if (!document.getElementById('nav-new-course')) {
    const btn = document.createElement('div');
    btn.id = 'nav-new-course';
    btn.style.cssText = 'padding:10px 12px 6px;';
    btn.innerHTML = `
      <button class="nav-start-btn" onclick="window._nav('session-execution')">
        <svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        Start Session
      </button>
      <div style="position:relative">
        <input id="nav-pt-search" type="text" placeholder="Search patients…" class="nav-pt-search-input"
          oninput="window._navPtSearch(this.value)"
          onfocus="this.style.borderColor='var(--teal)'"
          onblur="this.style.borderColor='var(--border)'">
        <svg viewBox="0 0 24 24" style="position:absolute;left:9px;top:50%;transform:translateY(-50%);width:13px;height:13px;stroke:var(--text-tertiary);fill:none;stroke-width:2;stroke-linecap:round;pointer-events:none"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <div id="nav-pt-results" style="display:none;position:absolute;left:0;right:0;top:calc(100% + 4px);background:var(--bg-card);border:1px solid var(--border);border-radius:8px;z-index:200;box-shadow:0 8px 24px rgba(0,0,0,0.3);overflow:hidden"></div>
      </div>`;
    _navList.parentNode.insertBefore(btn, _navList);
  }

  // ── Patient quick search handler ──────────────────────────────────────────────
  window._navPtSearch = function(q) {
    const box = document.getElementById('nav-pt-results');
    if (!box) return;
    const trimmed = (q || '').trim().toLowerCase();
    if (!trimmed) { box.style.display = 'none'; return; }
    const roster = window._patientRoster || [];
    const matches = roster.filter(p => {
      const name = ((p.first_name || '') + ' ' + (p.last_name || '')).toLowerCase();
      const cond = (p.condition_slug || p.primary_condition || '').toLowerCase();
      return name.includes(trimmed) || cond.includes(trimmed);
    }).slice(0, 5);
    if (!matches.length) {
      box.innerHTML = `<div style="padding:10px 12px;font-size:12px;color:var(--text-tertiary)">No patients found</div>`;
    } else {
      box.innerHTML = matches.map(p => {
        const name = ((p.first_name || '') + ' ' + (p.last_name || '')).trim();
        const cond = (p.condition_slug || p.primary_condition || '').replace(/-/g, ' ') || '';
        const ini  = ((p.first_name || '')[0] || '') + ((p.last_name || '')[0] || '');
        return `<div onclick="window._navPtOpen('${p.id}')"
          style="display:flex;align-items:center;gap:9px;padding:9px 12px;cursor:pointer;border-bottom:1px solid var(--border);transition:background 0.1s"
          onmouseover="this.style.background='rgba(255,255,255,0.04)'" onmouseout="this.style.background=''">
          <div style="width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,var(--teal),var(--blue));display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#000;flex-shrink:0;text-transform:uppercase">${ini}</div>
          <div style="min-width:0">
            <div style="font-size:12.5px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</div>
            <div style="font-size:10.5px;color:var(--text-tertiary)">${cond}</div>
          </div>
        </div>`;
      }).join('');
    }
    box.style.display = 'block';
  };
  window._navPtOpen = function(id) {
    window._selectedPatientId = id;
    window._profilePatientId  = id;
    const box = document.getElementById('nav-pt-results');
    const inp = document.getElementById('nav-pt-search');
    if (box) box.style.display = 'none';
    if (inp) inp.value = '';
    window._nav('patient-profile');
  };
  // Close search dropdown on outside click
  document.addEventListener('click', function _navPtClose(e) {
    const box = document.getElementById('nav-pt-results');
    const inp = document.getElementById('nav-pt-search');
    if (box && !box.contains(e.target) && e.target !== inp) box.style.display = 'none';
  }, { once: false });

  // ── Build sections: group NAV items under their section entry ────────────────
  // Each section becomes: { sectionEntry, items[] }
  // Items before the first section entry go into an implicit unnamed group.
  const sections = [];
  let currentSection = null;

  NAV.forEach(n => {
    if (n.section) {
      currentSection = { entry: n, items: [] };
      sections.push(currentSection);
    } else {
      if (!currentSection) {
        // Items before first section — create implicit root section
        currentSection = { entry: null, items: [] };
        sections.push(currentSection);
      }
      currentSection.items.push(n);
    }
  });

  const html = [];

  sections.forEach(sec => {
    const entry = sec.entry;
    const sectionId = entry?.sectionId || null;

    // Determine if active page lives in this section — never auto-collapse active section
    const hasActivePage = sec.items.some(n => n.id === currentPage);

    // Collapsed state: if section has an id and user hasn't collapsed it explicitly,
    // respect the NAV-level `collapsed` default but never collapse the active section.
    let isCollapsed = false;
    if (sectionId) {
      if (hasActivePage) {
        // Force open if active page is inside; persist this so next render stays open
        if (_navCollapsed[sectionId] === true) {
          _navCollapsed[sectionId] = false;
          _saveNavCollapsed();
        }
        isCollapsed = false;
      } else {
        isCollapsed = !!_navCollapsed[sectionId];
      }
    }

    // Render section wrapper open tag
    const collapsedClass = isCollapsed ? ' nav-section-group--collapsed' : '';
    if (sectionId) {
      html.push(`<div class="nav-section-group${collapsedClass}" data-section="${sectionId}">`);
    } else if (entry) {
      html.push(`<div class="nav-section-group">`);
    } else {
      html.push(`<div class="nav-section-group">`);
    }

    // Render section header (only if there's a section entry with a label)
    if (entry) {
      const label = (entry.sectionId && SECTION_LABELS[entry.sectionId]) || entry.section;
      if (sectionId) {
        html.push(`<div class="nav-section-header" onclick="window._toggleNavSection('${sectionId}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window._toggleNavSection('${sectionId}')}" role="button" tabindex="0" aria-expanded="${!isCollapsed}" aria-controls="nav-sec-${sectionId}">
          <span class="nav-section-label">${label}</span>
          <span class="nav-section-chevron" aria-hidden="true">&#8250;</span>
        </div>`);
      } else {
        html.push(`<div class="nav-section-header nav-section-header--static">
          <span class="nav-section-label">${label}</span>
        </div>`);
      }
    }

    // Render items
    const itemsHtml = [];
    sec.items.forEach(n => {
      if (n.id === 'admin' && currentUser?.role !== 'admin') return;
      if (hiddenForRole.includes(n.id)) return;

      const badge = n.badge != null
        ? (String(n.badge).startsWith('!')
            ? `<span class="nav-badge" style="background:rgba(255,107,107,0.2);color:var(--red);border-color:rgba(255,107,107,0.3)">${String(n.badge).slice(1)}</span>`
            : `<span class="nav-badge">${n.badge}</span>`)
        : n.ai ? `<span class="nav-badge-ai">AI</span>` : '';

      const iconHtml = NAV_ICONS[n.id]
        ? `<span class="nav-icon" aria-hidden="true">${NAV_ICONS[n.id]}</span>`
        : `<span class="nav-icon" aria-hidden="true">${n.icon}</span>`;
      itemsHtml.push(`<div class="nav-item ${currentPage === n.id ? 'active' : ''}" onclick="window._nav('${n.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window._nav('${n.id}')}" role="menuitem" tabindex="0" aria-current="${currentPage === n.id ? 'page' : 'false'}">
        ${iconHtml}
        <span class="nav-label">${n.label}</span>${badge}
      </div>`);
    });

    if (sectionId) {
      html.push(`<div class="nav-section-items" id="nav-sec-${sectionId}">${itemsHtml.join('')}</div>`);
    } else {
      html.push(itemsHtml.join(''));
    }

    html.push(`</div>`); // close nav-section-group
  });

  // Patient Dashboard demo button (outside section groups, always visible)
  html.push(`<div class="nav-section-group nav-section-group--patient-view"><div class="nav-item nav-item--patient-view" onclick="window._previewPatientPortal()" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window._previewPatientPortal()}" role="menuitem" tabindex="0">
    <span class="nav-icon" aria-hidden="true">${NAV_ICONS['patient-view']}</span>
    <span class="nav-label">Patient Dashboard</span>
    <span class="nav-badge-demo">demo</span>
  </div></div>`);

  _navList.innerHTML = html.join('');
}

window._toggleNavSection = function(sectionId) {
  if (!sectionId) return;
  _navCollapsed[sectionId] = !_navCollapsed[sectionId];
  _saveNavCollapsed();
  renderNav();
};

// Re-render clinician nav when locale switches so labels update immediately
window.addEventListener('ds:locale-changed', () => {
  renderNav();
  // Update language button label
  const lbl = document.getElementById('lang-btn-label');
  if (lbl) lbl.textContent = (typeof getLocale === 'function' ? getLocale() : 'EN').toUpperCase();
});

// ── Sidebar keyboard navigation ───────────────────────────────────────────────
function initSidebarKeyboard() {
  const items = document.querySelectorAll('#nav-list [role="menuitem"]');
  items.forEach((item, i) => {
    // Remove stale listeners by cloning — only on first setup
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); item.click(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); items[Math.min(i + 1, items.length - 1)].focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); items[Math.max(i - 1, 0)].focus(); }
    });
  });
}

// ── Topbar helper ─────────────────────────────────────────────────────────────
function setTopbar(title, html = '') {
  const _pt = document.getElementById('page-title');
  const _ta = document.getElementById('topbar-actions');
  if (_pt) _pt.textContent = title;
  if (_ta) _ta.innerHTML = html;
}

// ── Loading bar ───────────────────────────────────────────────────────────────
function loadingStart() {
  const bar = document.getElementById('page-loading-bar');
  if (!bar) return;
  bar.classList.remove('done');
  // Force reflow so transition restarts from 0
  void bar.offsetWidth;
  bar.classList.add('loading');
}
function loadingDone() {
  const bar = document.getElementById('page-loading-bar');
  if (!bar) return;
  bar.classList.remove('loading');
  bar.classList.add('done');
  setTimeout(() => bar.classList.remove('done'), 300);
}

// ── Page id → human-readable title map (for screen-reader announcements) ──────
const PAGE_TITLES = {
  dashboard: 'Dashboard', patients: 'Patients', profile: 'Profile',
  courses: 'Treatment Courses', 'course-detail': 'Course Detail',
  'session-execution': 'Session Execution', 'review-queue': 'Clinical Review & Approvals',
  'protocol-wizard': 'Protocol Intelligence', 'protocols-registry': 'Protocol Registry',
  outcomes: 'Outcomes & Progress', 'ai-assistant': 'AI Clinical Assistant', 'ai-agents': 'AI Agents',
  braindata: 'qEEG / Brain Data', qeegmaps: 'qEEG Maps', assessments: 'Assessments',
  evidence: 'Evidence Library', devices: 'Device Registry', brainregions: 'Brain Regions',
  handbooks: 'Handbooks', 'report-builder': 'Report Builder & Exports', 'adverse-events': 'Adverse Events', audittrail: 'Audit Trail',
  'quality-assurance': 'Quality Assurance & Peer Review',
  'device-management': 'Device & Equipment Management',
  'clinical-trials': 'Clinical Trial Management',
  'trial-enrollment': 'Trial Enrollment',
  'staff-scheduling': 'Staff Scheduling & Shifts',
  reports: 'Reports', admin: 'Admin Panel', 'clinic-settings': 'Clinic Settings & Branding', settings: 'Settings', 'clinician-account': 'My Account', academy: 'Academy', marketplace: 'Marketplace',
  permissions: 'Permissions & Security Admin',
  calendar: 'Schedule & Calendar',
  scheduling: 'Scheduling', telehealth: 'Telehealth', 'telehealth-recorder': 'Telehealth Session Recorder', messaging: 'Virtual Care',
  billing: 'Billing & Superbills', pricing: 'Pricing', onboarding: 'Onboarding', 'onboarding-wizard': 'Setup Wizard',
  insurance: 'Insurance Verification & Eligibility',
  referrals: 'Referrals & Care Coordination',
  'population-analytics': 'Population Analytics',
  'media-queue': 'Patient Media Review Queue',
  'media-detail': 'Upload Detail',
  'clinician-dictation': 'Clinical Note — Voice or Text',
  'clinician-draft-review': 'Review AI-Generated Draft',
  'clinical-notes': 'Clinical Notes',
  'ai-note-assistant': 'AI Note Assistant',
  'intake': 'Patient Intake & Consent',
  'patient-profile': 'Patient Profile',
  'pt-journal': 'Symptom Journal',
  'pt-notifications': 'Notification Settings',
  'pt-outcomes': 'My Progress',
  'patient-home-devices': 'Home Devices',
  'guardian-portal': 'Guardian Portal',
  'homework-builder': 'Patient Education & Homework Builder',
  'decision-support': 'AI Clinical Decision Support',
  'benchmark-library': 'Outcome Benchmark Library',
  'session-monitor': 'Live Session Monitor',
  'outcome-prediction': 'Outcome Prediction & ML Scoring',
  'advanced-search': 'Advanced Search',
  'rules-engine': 'Automated Alerts & Rules Engine',
  'data-import': 'Data Import & Migration',
  'wearables': 'Wearable & Biosensor Integration',
  'home-task-manager': 'Home Task Manager',
  'patient-queue': 'Today\'s Queue',
  'course-completion-report': 'Course Completion Report',
  'longitudinal-report': 'Longitudinal Outcomes Report',
  'scoring-calc': 'Clinical Scoring Calculator',
  'clinic-analytics': 'Clinic Analytics',
  'consent-automation': 'Consent & Compliance',
  'multi-site': 'Multi-Site Network',
  'forms-builder': 'Forms & Assessments',
  'med-interactions': 'Medication Safety',
  'protocol-marketplace': 'Protocol Marketplace',
  'reminders': 'Reminders & Adherence',
  'data-export': 'Research Data Export',
  'evidence-builder': 'Evidence Builder',
  'literature': 'Evidence Library',
  'irb-manager': 'IRB Manager',
  'research-evidence': 'Research Evidence',
  'system-health': 'System Health',
};

// ── Navigate ──────────────────────────────────────────────────────────────────
async function navigate(id, params = {}) {
  // Apply any params before navigating so pages can read them
  if (params && typeof params === 'object') {
    if (params.id !== undefined) {
      window._selectedPatientId = params.id;
      window._profilePatientId  = params.id;
    }
    if (params.courseId !== undefined) window._selectedCourseId   = params.courseId;
    if (params.uploadId !== undefined) window._mediaDetailUploadId = params.uploadId;
  }
  window._closeSidebar();
  // Track recent pages for command palette
  if (!window._recentPages) window._recentPages = [];
  if (currentPage && !window._recentPages.includes(currentPage)) {
    window._recentPages.unshift(currentPage);
    window._recentPages = window._recentPages.slice(0, 5);
  }
  currentPage = id;
  // Track recent pages for search (localStorage-backed, richer metadata)
  const _rp = JSON.parse(localStorage.getItem('ds_recent_pages') || '[]');
  const _navEntry = NAV.find(n => n.id === id);
  if (_navEntry) {
    const filtered = _rp.filter(r => r.id !== id);
    filtered.unshift({ id, label: _navEntry.label, icon: _navEntry.icon, ts: Date.now() });
    localStorage.setItem('ds_recent_pages', JSON.stringify(filtered.slice(0, 10)));
  }
  _setProStep(0);
  if (id !== 'profile') _setPtab('courses');
  if (id !== 'protocol-wizard') window._wizardProtocolId = null;
  if (id !== 'course-detail') window._cdTab = 'overview';
  // Push browser history so back/forward works
  if (typeof history !== 'undefined' && history.pushState) {
    history.pushState({ page: id, params }, '', `?page=${encodeURIComponent(id)}`);
  }
  renderNav();
  initSidebarKeyboard();
  announce(`Navigated to ${PAGE_TITLES[id] || id}`);
  loadingStart();
  const contentEl = document.getElementById('content');
  if (contentEl) contentEl.innerHTML = '<div class="page-loading">Loading…</div>';
  try {
    await renderPage();
    // Update AI co-pilot context for current page
    window._aiUpdateContext?.(id);
    // Ping presence after page renders (non-blocking, best-effort)
    if (api.getToken()) {
      api.pingPresence(id).then(r => { if (r && r.users) renderPresence(r.users); }).catch(() => {});
    }
  } catch (err) {
    console.error(`[DeepSynaps] Error rendering page "${id}":`, err);
    if (contentEl) {
      contentEl.innerHTML = `
        <div style="padding:60px 24px;text-align:center;max-width:500px;margin:0 auto">
          <div style="font-size:3rem;margin-bottom:16px">⚠️</div>
          <h2 style="color:var(--text-primary);margin-bottom:8px">Something went wrong</h2>
          <p style="color:var(--text-secondary);margin-bottom:24px;line-height:1.6">${err.message || 'An unexpected error occurred.'}</p>
          <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
            <button class="btn-secondary" onclick="window._nav('${id}')">↺ Retry</button>
            <button class="btn-primary" onclick="window._nav('dashboard')">Go to Dashboard</button>
          </div>
        </div>`;
    }
  } finally {
    loadingDone();
  }
}

window._nav = async function(id, params) {
  await navigate(id, params);
  // Show first-visit feature tooltip if applicable
  if (typeof _initFeatureTooltips === 'function') _initFeatureTooltips();
};

// Global course opener — used from courses list, patient profile, AE table, dashboard
window._openCourse = function(id) {
  window._selectedCourseId = id;
  navigate('course-detail');
};

// ── Public page routing ───────────────────────────────────────────────────────
let currentPublicPage = 'home';

async function renderPublicPage() {
  const m = await loadPublic();
  switch (currentPublicPage) {
    case 'home':                m.pgHome(); break;
    case 'signup-professional': m.pgSignupProfessional(); break;
    case 'signup-patient':      m.pgSignupPatient(); break;
    default:                    m.pgHome();
  }
}

function navigatePublic(id) {
  currentPublicPage = id;
  showPublic();
  renderPublicPage();
}
window._navPublic  = navigatePublic;
window._showSignIn = function() { showLogin(); };

// ── Patient portal routing ────────────────────────────────────────────────────
let currentPatientPage = 'patient-portal';

async function renderPatientPage() {
  const content = document.getElementById('patient-content');
  if (content) {
    content.style.opacity = '0';
    content.style.transition = 'opacity 0.15s ease';
    setTimeout(() => { content.style.opacity = '1'; }, 20);
  }
  const m = await loadPatient();
  m.renderPatientNav(currentPatientPage);
  switch (currentPatientPage) {
    case 'patient-portal':      await m.pgPatientDashboard(currentUser);  break;
    case 'patient-sessions':    await m.pgPatientSessions();              break;
    case 'patient-course':      await m.pgPatientHomework();              break;
    case 'patient-homework':    await m.pgPatientHomework();              break;
    case 'patient-assessments': await m.pgPatientAssessments();           break;
    case 'patient-reports':     await m.pgPatientReports();               break;
    case 'patient-messages':   await m.pgPatientMessages();               break;
    case 'patient-wearables':  await m.pgPatientWearables();               break;
    case 'pt-wellness':        await m.pgPatientWellness();                break;
    case 'pt-sessions':        await m.pgPatientSessions();                break;
    case 'pt-assessments':     await m.pgPatientAssessments();             break;
    case 'patient-virtualcare': await m.pgPatientVirtualCare();           break;
    case 'virtualcare':         await m.pgPatientVirtualCare();           break;
    case 'patient-careteam':    await m.pgPatientCareTeam();              break;
    case 'careteam':            await m.pgPatientCareTeam();              break;
    case 'patient-education':   await m.pgPatientEducation();             break;
    case 'education':           await m.pgPatientEducation();             break;
    case 'patient-profile':     await m.pgPatientProfile(currentUser);    break;
    case 'patient-home-devices': await m.pgPatientHomeDevices();          break;
    case 'patient-settings':    await m.pgPatientSettings(currentUser);   break;
    case 'patient-marketplace': await m.pgPatientMarketplace(currentUser); break;
    case 'pt-learn':            await m.pgPatientLearn();                 break;
    case 'pt-journal':          await m.pgSymptomJournal(m.setTopbar);   break;
    case 'pt-notifications':    await m.pgPatientNotificationSettings(m.setTopbar); break;
    case 'pt-media-consent':    await m.pgPatientMediaConsent();         break;
    case 'pt-media-upload':     await m.pgPatientMediaUpload();          break;
    case 'pt-media-history':     await m.pgPatientMediaHistory();                break;
    case 'pt-outcomes':          await m.pgPatientOutcomePortal(m.setTopbar);   break;
    case 'pt-home-session-log':  await m.pgPatientHomeSessionLog();             break;
    case 'pt-adherence-events':  await m.pgPatientAdherenceEvents();            break;
    case 'pt-adherence-history': await m.pgPatientAdherenceHistory();           break;
    case 'pt-caregiver':         await m.pgPatientCaregiver();                  break;
    case 'pt-help':              await m.pgPatientHelp();                       break;
    default:                     await m.pgPatientDashboard(currentUser);
  }
}

function navigatePatient(id) {
  const normalizedId = id === 'patient-wearables' ? 'patient-wearables' : id;
  currentPatientPage = normalizedId;
  window._currentPatientPage = normalizedId; // expose for swipe gesture handlers
  renderPatientPage();
}
window._navPatient  = navigatePatient;
window._bootPatient = function() {
  currentPatientPage = 'patient-portal';
  window._currentPatientPage = 'patient-portal';
  _injectPatientLangPicker();
  renderPatientPage();
  // Seed bell notifications from patient portal API (non-blocking)
  if (api.patientPortalNotifications) {
    api.patientPortalNotifications().then(function(items) {
      if (!Array.isArray(items)) return;
      items.forEach(function(n) {
        if (_notifs.find(function(x) { return x.id === n.id; })) return;
        _notifs.push({ id: n.id, type: n.type, title: n.title, body: n.body,
          link: n.action_url || '', ts: n.created_at, read: n.is_read });
        if (!n.is_read) _notifCount++;
      });
      window._updateNotifBadge();
    }).catch(function() {});
  }
  // Re-render nav + current page on locale change
  window.removeEventListener('ds:locale-changed', window._ptLocaleHandler);
  window._ptLocaleHandler = () => renderPatientPage();
  window.addEventListener('ds:locale-changed', window._ptLocaleHandler);
};

function _injectPatientLangPicker() {
  const topbar = document.getElementById('patient-topbar');
  if (!topbar || topbar.querySelector('#pt-lang-picker')) return;
  const cur = getLocale();
  const opts = Object.entries(LOCALES).map(([code, label]) =>
    `<button class="pub-lang-opt${code === cur ? ' active' : ''}" onclick="window._ptSetLocale('${code}')">${label}</button>`
  ).join('');
  const picker = document.createElement('div');
  picker.id = 'pt-lang-picker';
  picker.className = 'pub-lang-picker';
  picker.innerHTML = `
    <button class="pub-lang-btn" id="pt-lang-toggle-btn" onclick="window._ptLangToggle()"
            aria-label="${t('pub.lang')}" aria-haspopup="listbox" aria-expanded="false">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/></svg>
      <span id="pt-lang-cur">${LOCALES[cur] || cur.toUpperCase()}</span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="10" height="10"><path d="M6 9l6 6 6-6"/></svg>
    </button>
    <div class="pub-lang-menu" id="pt-lang-menu" role="listbox" aria-label="${t('pub.lang')}">${opts}</div>`;
  // Insert before patient-topbar-actions
  const actions = document.getElementById('patient-topbar-actions');
  topbar.insertBefore(picker, actions);

  window._ptSetLocale = function(code) {
    setLocale(code);
    const menu = document.getElementById('pt-lang-menu');
    menu?.classList.remove('open');
    document.getElementById('pt-lang-toggle-btn')?.setAttribute('aria-expanded', 'false');
    document.getElementById('pt-lang-cur').textContent = LOCALES[code] || code.toUpperCase();
    // Update active option
    menu?.querySelectorAll('.pub-lang-opt').forEach(b => b.classList.toggle('active', b.textContent === LOCALES[code]));
  };
  window._ptLangToggle = function() {
    const menu = document.getElementById('pt-lang-menu');
    const btn  = document.getElementById('pt-lang-toggle-btn');
    if (!menu) return;
    const opening = !menu.classList.contains('open');
    menu.classList.toggle('open', opening);
    btn?.setAttribute('aria-expanded', String(opening));
  };
  // Close on outside click
  document.addEventListener('click', function(e) {
    if (!e.target.closest('#pt-lang-picker')) {
      document.getElementById('pt-lang-menu')?.classList.remove('open');
      document.getElementById('pt-lang-toggle-btn')?.setAttribute('aria-expanded', 'false');
    }
  });
}

// ── Page dispatcher ───────────────────────────────────────────────────────────
async function renderPage() {
  const el = document.getElementById('content');
  if (!el) return;
  el.scrollTop = 0;

  // ── Auth guard (synchronous — runs before any async data fetch) ───────────
  const _publicRoutes = ['home', 'login', 'register', 'onboarding', 'onboarding-wizard'];
  if (!_publicRoutes.includes(currentPage) && !window._isAuthenticated?.()) {
    el.innerHTML = `
      <div class="auth-required-notice">
        <div class="auth-required-icon">🔒</div>
        <div class="auth-required-text">Please log in to access this page.</div>
        <button class="btn btn-primary" onclick="window._nav('home')">Go to Login</button>
      </div>
    `;
    return;
  }

  switch (currentPage) {
    // ── Clinical ─────────────────────────────────────────────────────────
    case 'today':
    case 'home':
    case 'dashboard': {
      const m = await loadClinical();
      await m.pgDash(setTopbar, navigate);
      break;
    }
    case 'patients':     { window._patientHubTab = 'patients';     window._nav('patients-hub'); break; }
    case 'courses-tab':  { window._patientHubTab = 'courses';      window._nav('patients-hub'); break; }
    case 'rx-tab':       { window._patientHubTab = 'prescriptions'; window._nav('patients-hub'); break; }
    case 'patients-hub': { const m = await loadClinicalHubs(); await m.pgPatientHub(setTopbar, navigate); break; }
    case 'patients-full':{ const m = await loadClinical(); await m.pgPatients(setTopbar, navigate); break; }
    case 'patient':
    case 'patient-profile': { const m = await loadClinical(); await m.pgPatientProfile(setTopbar); break; }
    case 'homework-builder': { const m = await loadPatient(); await m.pgHomeworkBuilder(setTopbar); break; }
    case 'intake': { const m = await loadPatient(); await m.pgIntake(setTopbar); break; }
    case 'data-import': { const m = await loadPatient(); await m.pgDataImport(setTopbar); break; }
    case 'pt-outcomes': { const { pgPatientOutcomePortal } = await loadPatient(); await pgPatientOutcomePortal(setTopbar); break; }
    case 'guardian-portal': { const { pgGuardianPortal } = await loadPatient(); await pgGuardianPortal(setTopbar); break; }
    case 'profile': {
      const m = await loadClinical();
      await m.pgProfile(setTopbar, navigate);
      break;
    }
    // ── Courses / workflow pages ─────────────────────────────────────────
    case 'courses': { window._patientHubTab = 'courses'; window._nav('patients-hub'); break; }
    case 'courses-full': { const m = await loadCourses(); await m.pgCourses(setTopbar, navigate); break; }
    case 'course-detail': {
      window._cdTab = window._cdTab || 'overview';
      const m = await loadCourses();
      await m.pgCourseDetail(setTopbar, navigate);
      break;
    }
    case 'session-execution': {
      const m = await loadCourses();
      await m.pgSessionExecution(setTopbar, navigate);
      break;
    }
    case 'session-monitor': { const m = await loadCourses(); await m.pgSessionMonitor(setTopbar); break; }
    case 'course-completion-report': { const m = await loadCourses(); await m.pgCourseCompletionReport(setTopbar, navigate); break; }
    case 'review-queue': {
      const m = await loadCourses();
      await m.pgReviewQueue(setTopbar, navigate);
      break;
    }
    case 'calendar': { const m = await loadCourses(); await m.pgCalendar(setTopbar); break; }
    // ── Protocol Intelligence ────────────────────────────────────────────
    case 'protocol-wizard':
    case 'protocols':       { window._protocolHubTab = 'browse';   window._nav('protocol-hub'); break; }
    case 'brain-map-planner':
    case 'brain-map-full':
    case 'reg-protocols':   { const { pgBrainMapPlanner } = await loadClinicalTools(); await pgBrainMapPlanner(setTopbar); break; }
    // protocols-registry routes to the real protocol search/registry browser,
    // not the brain-map planner. Previously this alias pointed at
    // pgBrainMapPlanner which mislabelled the surface.
    case 'protocols-registry': {
      const m = await loadProtocols();
      await m.pgProtocolSearch(setTopbar, navigate);
      break;
    }
    // Legacy aliases — the Handbooks tab moved out of Protocol Hub into its
    // own page (pgHandbooks). Route both short aliases to the canonical
    // handbooks-v2 module so deep links keep working.
    case 'handbooks':
    case 'reg-handbooks':   { const m = await loadHandbooks(); await m.pgHandbooks(setTopbar); break; }
    // protocol-builder deep-links to the full builder (pgProtocolBuilderV2)
    // rather than silently landing on the studio wizard step 1. The wizard
    // never consumed `_protocolHubTab`, so the prior indirection was a dead
    // redirect.
    case 'protocol-builder': {
      const m = await loadProtocols();
      await m.pgProtocolBuilderV2(setTopbar, navigate);
      break;
    }
    case 'protocol-hub':      { const { pgProtocolHub } = await loadClinicalHubs(); await pgProtocolHub(setTopbar, navigate); break; }
    // personalized + brain-scan protocols now route to the studio wizard with
    // explicit hints; until the wizard grows those tabs this at least keeps
    // the label meaningful.
    case 'personalized-protocol': { window._protocolHubTab = 'generate'; window._psWizard = Object.assign(window._psWizard || {}, { mode: 'personalized', result: null, error: null, saving: false }); window._nav('protocol-hub'); break; }
    case 'brain-scan-protocol':   { window._protocolHubTab = 'generate'; window._psWizard = Object.assign(window._psWizard || {}, { mode: 'brainscan', result: null, error: null, saving: false });    window._nav('protocol-hub'); break; }
    case 'protocol-search-full': {
      const m = await loadProtocols();
      await m.pgProtocolSearch(setTopbar, navigate);
      break;
    }
    case 'protocol-builder-full': {
      const m = await loadProtocols();
      await m.pgProtocolBuilderV2(setTopbar, navigate);
      break;
    }
    case 'condition-backlog': {
      const m = await loadConditions();
      await m.pgConditionBacklog(setTopbar, navigate);
      break;
    }
    case 'decision-support': {
      const m = await loadClinical();
      await m.pgDecisionSupport(setTopbar);
      break;
    }
    case 'benchmark-library': { const m = await loadClinicalTools(); await m.pgBenchmarkLibrary(setTopbar); break; }
    case 'outcomes': { window._clinicalHubTab = 'outcomes'; window._nav('clinical-hub'); break; }
    case 'outcome-prediction': { const m = await loadCourses(); await m.pgOutcomePrediction(setTopbar); break; }
    case 'rules-engine': { const m = await loadCourses(); await m.pgRulesEngine(setTopbar); break; }
    case 'braindata': {
      const m = await loadClinical();
      await m.pgBrainData(setTopbar);
      break;
    }
    // ── Knowledge Registries ─────────────────────────────────────────────
    case 'evidence': {
      const m = await loadKnowledge();
      await m.pgEvidence(setTopbar);
      break;
    }
    case 'protocols-registry-full': {
      const m = await loadCourses();
      await m.pgProtocolRegistry(setTopbar);
      break;
    }
    case 'devices': {
      const m = await loadKnowledge();
      await m.pgDevices(setTopbar);
      break;
    }
    case 'brainregions': {
      const m = await loadKnowledge();
      await m.pgBrainRegions(setTopbar);
      break;
    }
    case 'qeegmaps': {
      const m = await loadKnowledge();
      await m.pgQEEGMaps(setTopbar);
      break;
    }
    case 'handbooks-full': {
      const m = await loadHandbooks();
      await m.pgHandbooks(setTopbar);
      break;
    }
    case 'report-builder': {
      const m = await loadKnowledge();
      await m.pgReportBuilder(setTopbar);
      break;
    }
    case 'quality-assurance': { const m = await loadKnowledge(); await m.pgQualityAssurance(setTopbar); break; }
    case 'device-management': { const m = await loadKnowledge(); await m.pgDeviceManagement(setTopbar); break; }
    case 'clinical-trials': { const m = await loadKnowledge(); await m.pgClinicalTrials(setTopbar); break; }
    case 'trial-enrollment': { const { pgTrialEnrollment } = await loadKnowledge(); await pgTrialEnrollment(setTopbar); break; }
    case 'staff-scheduling': { const m = await loadKnowledge(); await m.pgStaffScheduling(setTopbar); break; }
    case 'clinic-analytics': { const m = await loadKnowledge(); await m.pgClinicAnalytics(setTopbar); break; }
    case 'protocol-marketplace': { const { pgProtocolMarketplace } = await loadKnowledge(); await pgProtocolMarketplace(setTopbar); break; }
    case 'data-export': { const { pgDataExport } = await loadKnowledge(); await pgDataExport(setTopbar); break; }
    case 'literature': { const { pgLiteratureLibrary } = await loadKnowledge(); await pgLiteratureLibrary(setTopbar); break; }
    case 'irb-manager': { const { pgIRBManager } = await loadKnowledge(); await pgIRBManager(setTopbar); break; }
    case 'longitudinal-report': { const { pgLongitudinalReport } = await loadKnowledge(); await pgLongitudinalReport(setTopbar); break; }
    case 'scoring-calc': { window._clinicalHubTab = 'scoring'; window._nav('assessments'); break; }
    // ── Deprioritised scaffolds (kept functional, not in primary nav) ────
    case 'charting': {
      const m = await loadClinical();
      el.innerHTML = m.pgChart(setTopbar);
      break;
    }
    case 'ai-assistant': {
      const m = await loadPractice();
      await m.pgAIAssistant(setTopbar);
      break;
    }
    case 'ai-agents': {
      const m = await loadAgents();
      await m.pgAgentChat(setTopbar);
      break;
    }
    case 'scheduling':      { window._schedHubTab = 'calendar'; window._nav('scheduling-hub'); break; }
    case 'scheduling-hub':  { const { pgSchedulingHub } = await loadClinicalHubs(); await pgSchedulingHub(setTopbar, navigate); break; }
    case 'scheduling-full': { const m = await loadPractice(); el.innerHTML = m.pgSchedule(setTopbar); break; }
    case 'telehealth': {
      const m = await loadPractice();
      m.pgTelehealth(setTopbar);
      break;
    }
    case 'telehealth-recorder': { const m = await loadPractice(); await m.pgTelehealthRecorder(setTopbar); break; }
    case 'monitoring': { window._monitorHubTab = 'monitoring'; window._nav('monitor-hub'); break; }
    case 'wearables':  { window._monitorHubTab = 'monitoring'; window._nav('monitor-hub'); break; }
    case 'library-hub':    { window._resEvidenceTab = 'search'; window._nav('research-evidence'); break; }
    case 'monitor-hub':    { const { pgMonitorHub }    = await loadClinicalHubs(); await pgMonitorHub(setTopbar, navigate);    break; }
    case 'virtual-care-hub':{ const { pgVirtualCareHub } = await loadClinicalHubs(); await pgVirtualCareHub(setTopbar, navigate); break; }
    case 'home-task-manager': { const m = await loadClinicalTools(); await m.pgHomePrograms(setTopbar, navigate); break; }
    case 'messaging': {
      window._vcUnifiedDefaultTab = 'messaging';
      const m = await loadVirtualCare();
      await m.pgVirtualCare(setTopbar, navigate);
      break;
    }
    case 'advanced-search': { const m = await loadClinicalTools(); await m.pgAdvancedSearch(setTopbar); break; }
    case 'programs': {
      const m = await loadPractice();
      m.pgPrograms(setTopbar);
      break;
    }
    case 'billing':            { window._financeHubTab = 'invoices'; window._nav('finance-hub'); break; }
    case 'finance-hub':        { const { pgFinanceHub }   = await loadClinicalHubs(); await pgFinanceHub(setTopbar, navigate);   break; }
    case 'documents-hub':      { const { pgDocumentsHubNew } = await loadClinicalHubs(); await pgDocumentsHubNew(setTopbar, navigate); break; }
    case 'reports-hub':        { const { pgReportsHubNew }   = await loadClinicalHubs(); await pgReportsHubNew(setTopbar, navigate); break; }
    case 'insurance':          { window._financeHubTab = 'insurance'; window._nav('finance-hub'); break; }
    case 'referrals':          { const m = await loadPractice(); await m.pgReferrals(setTopbar); break; }
    case 'reports': {
      const { pgReportsHub } = await loadClinicalTools();
      await pgReportsHub(setTopbar);
      break;
    }
    case 'population-reports': {
      window._reportsHubTab = 'analytics'; window._nav('reports-hub'); break;
    }
    case 'media-queue': { const m = await loadClinicalTools(); await m.pgMediaReviewQueue(setTopbar); break; }
    case 'media-detail': { const m = await loadClinicalTools(); await m.pgMediaDetail(setTopbar); break; }
    case 'clinician-dictation': { const m = await loadClinicalTools(); await m.pgClinicianDictation(setTopbar); break; }
    case 'clinic-day': { const { pgClinicDay } = await loadClinicalTools(); await pgClinicDay(setTopbar); break; }
    case 'patient-queue': { const { pgPatientQueue } = await loadClinicalTools(); await pgPatientQueue(setTopbar); break; }
    case 'clinician-draft-review': { const m = await loadClinicalTools(); await m.pgClinicianDraftReview(setTopbar); break; }
    case 'clinical-notes': {
      const m = await loadCourses();
      await m.pgClinicalNotes(setTopbar);
      break;
    }
    case 'ai-note-assistant': { const m = await loadCourses(); await m.pgAINoteAssistant(setTopbar); break; }
    case 'population-analytics': {
      const m = await loadCourses();
      await m.pgPopulationAnalytics(setTopbar);
      break;
    }
    case 'pricing': {
      const m = await loadKnowledge();
      await m.pgPricing(setTopbar);
      break;
    }
    // ── Governance ───────────────────────────────────────────────────────
    case 'onboarding': {
      const m = await loadOnboarding();
      await m.pgOnboarding(setTopbar, navigate);
      break;
    }
    case 'onboarding-wizard': {
      const { pgOnboardingWizard } = await loadOnboarding();
      await pgOnboardingWizard(setTopbar);
      break;
    }
    case 'adverse-events':     { window._monitorHubTab = 'adverse'; window._nav('monitor-hub'); break; }
    case 'adverse-events-full':{ const m = await loadCourses(); await m.pgAdverseEvents(setTopbar, navigate); break; }
    case 'audittrail': {
      const m = await loadKnowledge();
      await m.pgAuditTrail(setTopbar);
      break;
    }
    case 'consent-automation': { const { pgConsentAutomation } = await loadClinicalTools(); await pgConsentAutomation(setTopbar); break; }
    case 'forms-builder': { const { pgFormsBuilder } = await loadClinicalTools(); await pgFormsBuilder(setTopbar); break; }
    case 'med-interactions': { const { pgMedInteractionChecker } = await loadClinicalTools(); await pgMedInteractionChecker(setTopbar); break; }
    case 'admin': {
      const m = await loadPractice();
      await m.pgAdmin(setTopbar, currentUser);
      break;
    }
    case 'permissions': { const m = await loadPublic(); await m.pgPermissionsAdmin(setTopbar); break; }
    case 'multi-site': { const { pgMultiSiteDashboard } = await loadPublic(); await pgMultiSiteDashboard(setTopbar); break; }
    case 'clinic-settings': { const m = await loadPractice(); await m.pgClinicSettings(setTopbar); break; }
    case 'settings': {
      const m = await loadPractice();
      await m.pgSettings(setTopbar, currentUser);
      break;
    }
    case 'clinician-account': {
      const m = await loadPractice();
      await m.pgClinicianAccount(setTopbar, currentUser);
      break;
    }
    case 'academy': {
      const m = await loadPractice();
      await m.pgClinicAcademy(setTopbar, currentUser);
      break;
    }
    case 'marketplace': {
      const m = await loadClinicalHubs();
      await m.pgMarketplaceHub(setTopbar, navigate);
      break;
    }
    case 'reminders': { const { pgReminderAutomation } = await loadPractice(); await pgReminderAutomation(setTopbar); break; }
    case 'evidence-builder': { const { pgEvidenceBuilder } = await loadClinicalTools(); await pgEvidenceBuilder(setTopbar); break; }
    case 'medical-history':  { window._clinicalHubTab = 'history';     window._nav('assessments'); break; }
    case 'assessments-hub':  { window._clinicalHubTab = 'assessments'; window._nav('assessments'); break; }
    case 'outcomes-redirect':{ window._clinicalHubTab = 'outcomes';    window._nav('assessments'); break; }
    case 'clinical-hub':
    case 'assessments':      { const { pgClinicalHub } = await loadClinicalHubs(); await pgClinicalHub(setTopbar, navigate); break; }
    case 'documents':        { const { pgDocumentsHubNew } = await loadClinicalHubs(); await pgDocumentsHubNew(setTopbar, navigate); break; }
    case 'brain-map-full':    { const { pgBrainMapPlanner } = await loadClinicalTools(); await pgBrainMapPlanner(setTopbar); break; }
    case 'prescriptions':        { window._patientHubTab = 'prescriptions'; window._nav('patients-hub'); break; }
    case 'prescriptions-full':   { const { pgPrescriptions } = await loadClinicalTools(); await pgPrescriptions(setTopbar); break; }
    case 'patient-protocol':    { const { pgPatientProtocolView }  = await loadClinicalTools(); await pgPatientProtocolView(setTopbar); break; }
    case 'protocol-detail':     { const { pgProtocolDetail }       = await loadProtocols(); await pgProtocolDetail(setTopbar, navigate); break; }
    case 'condition-packages':   { window._resEvidenceTab = 'conditions'; window._nav('research-evidence'); break; }
    case 'condition-package':   { const { pgConditionPackage }     = await loadKnowledge(); await pgConditionPackage(setTopbar, navigate);  break; }
    case 'notes-dictation': { window._monitorHubTab = 'notes'; window._nav('monitor-hub'); break; }
    case 'wearable-integration': { const m = await loadPractice(); await m.pgWearableIntegration(setTopbar); break; }
    // ── Registries ─────────────────────────────────────────────────────────
    case 'reg-conditions':     { window._resEvidenceTab = 'conditions'; window._nav('research-evidence'); break; }
    case 'reg-assessments':    { window._clinicalHubTab = 'registry'; window._nav('assessments'); break; }
    case 'reg-protocols-full':{ const m = await loadRegistries(); await m.pgProtocolRegistryPage(setTopbar);   break; }
    case 'reg-devices':        { window._resEvidenceTab = 'protocols'; window._nav('research-evidence'); break; }
    case 'reg-targets':        { window._resEvidenceTab = 'neuro'; window._nav('research-evidence'); break; }
    case 'reg-handbooks-full':{ const m = await loadRegistries(); await m.pgHandbookRegistry(setTopbar);       break; }
    case 'reg-virtual-care':   { window._nav('virtual-care-hub'); break; }
    // ── design-v2 routes — alias new IDs onto existing page renderers ────
    case 'schedule-v2':        { const m = await loadClinicalHubs(); await m.pgSchedulingHub(setTopbar, navigate); break; }
    case 'assessments-v2':     { const m = await loadClinicalHubs(); await m.pgAssessmentsHub(setTopbar, navigate); break; }
    case 'patients-v2':        { const m = await loadClinicalHubs(); await m.pgPatientHub(setTopbar, navigate); break; }
    case 'protocol-studio':    { const m = await loadClinicalHubs(); await m.pgProtocolHub(setTopbar, navigate); break; }
    case 'brainmap-v2':        { const { pgBrainMapPlanner } = await loadClinicalTools(); await pgBrainMapPlanner(setTopbar, navigate); break; }
    case 'qeeg-analysis':      { const m = await loadQEEGAnalysis(); await m.pgQEEGAnalysis(setTopbar, navigate); break; }
    case 'biomarkers':         { const m = await loadKnowledge(); await m.pgQEEGMaps(setTopbar); break; }
    case 'handbooks-v2':       { const m = await loadHandbooks(); await m.pgHandbooks(setTopbar); break; }
    case 'library-v2':         { window._resEvidenceTab = 'search'; window._nav('research-evidence'); break; }
    case 'live-session':       { window._vcUnifiedDefaultTab = 'dashboard'; const m = await loadVirtualCare(); await m.pgVirtualCare(setTopbar, navigate); break; }
    case 'live-session-monitor': { window._vcUnifiedDefaultTab = 'livesession'; const m = await loadVirtualCare(); await m.pgVirtualCare(setTopbar, navigate); break; }
    case 'home-tasks-v2':      { const m = await loadClinicalTools(); await m.pgHomePrograms(setTopbar, navigate); break; }
    case 'documents-v2':       { const m = await loadClinicalHubs(); await m.pgDocumentsHubNew(setTopbar, navigate); break; }
    case 'reports-v2':         { const m = await loadClinicalHubs(); await m.pgReportsHubNew(setTopbar, navigate); break; }
    case 'finance-v2':         { const m = await loadClinicalHubs(); await m.pgFinanceHub(setTopbar, navigate); break; }
    case 'ai-agent-v2':        { const m = await loadAgents(); await m.pgAgentChat(setTopbar); break; }
    case 'research-v2':        { const m = await loadResearch(); await m.pgResearch(setTopbar, navigate); break; }
    case 'governance-v2':      { const m = await loadPractice(); await m.pgGovernance(setTopbar, navigate); break; }
    case 'consent-management': { window._docsHubTab = 'consent'; navigate('documents-hub'); break; }
    case 'research-evidence':  { const m = await loadResearchEvidence(); await m.pgResearchEvidence(setTopbar, navigate); break; }
    case 'system-health':      { const m = await loadMonitoring(); await m.pgMonitoring(setTopbar, navigate); break; }
    default:
      el.innerHTML = `<div style="text-align:center;padding:48px;color:var(--text-tertiary)">Page not found.</div>`;
  }
}

// ── Nav badge update ─────────────────────────────────────────────────────────
async function refreshNavBadges() {
  try {
    const [queueData, coursesData, aeData, mediaData] = await Promise.all([
      api.listReviewQueue().catch(() => null),
      api.listCourses().catch(() => null),
      api.listAdverseEvents().catch(() => null),
      api.listMediaQueue().catch(() => null),
    ]);
    const pendingReview   = (queueData?.items || []).filter(i => i.status === 'pending').length;
    const pendingApproval = (coursesData?.items || []).filter(c => c.status === 'pending_approval').length;
    const seriousAE       = (aeData?.items || []).filter(ae => ae.severity === 'serious').length;
    const mediaItems      = Array.isArray(mediaData) ? mediaData : (mediaData?.items || []);
    const mediaUrgent     = mediaItems.filter(i => i.flagged_urgent).length;
    const mediaAwaiting   = mediaItems.filter(i => i.status === 'pending_review' || i.status === 'reupload_requested').length;

    NAV.forEach(n => {
      if (n.id === 'review-queue')   n.badge = pendingReview > 0 ? pendingReview : null;
      if (n.id === 'courses')        n.badge = pendingApproval > 0 ? pendingApproval : null;
      if (n.id === 'adverse-events') n.badge = seriousAE > 0 ? `!${seriousAE}` : null;
      if (n.id === 'media-queue')    n.badge = mediaUrgent > 0 ? `!${mediaUrgent}` : mediaAwaiting > 0 ? mediaAwaiting : null;
    });
    renderNav();
    initSidebarKeyboard();
  } catch (_) { /* badge refresh is best-effort */ }
}

// ── Notification: badge update ────────────────────────────────────────────────
window._updateNotifBadge = function() {
  const badge = document.getElementById('notif-badge');
  const unread = _notifs.filter(n => !n.read).length;
  if (badge) {
    badge.textContent = unread > 9 ? '9+' : unread;
    badge.style.display = unread > 0 ? 'flex' : 'none';
  }
};

// ── Notification: toast ───────────────────────────────────────────────────────
function _showNotifToast(notif) {
  const color = notif.severity === 'serious' ? 'var(--red)' : notif.severity === 'warn' ? 'var(--amber)' : 'var(--teal)';
  const t = document.createElement('div');
  t.style.cssText = `position:fixed;bottom:24px;right:24px;max-width:320px;padding:12px 16px;border-radius:10px;background:var(--navy-800);border:1px solid ${color};z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.5);cursor:pointer;transition:opacity 0.3s`;
  t.innerHTML = `<div style="font-size:12.5px;font-weight:600;color:var(--text-primary);margin-bottom:3px">${esc(notif.title)}</div><div style="font-size:11.5px;color:var(--text-secondary)">${esc(notif.body)}</div>`;
  t.onclick = () => { if (notif.link) window._nav(notif.link); t.remove(); };
  document.body.appendChild(t);
  announce(`${notif.title}: ${notif.body}`, notif.severity === 'serious');
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 4000);
}

// ── Presence: render avatars ──────────────────────────────────────────────────
function renderPresence(users) {
  // Remove current user from list
  const others = (users || []).filter(u => u.id !== currentUser?.id);
  let container = document.getElementById('presence-bar');
  if (!container) {
    container = document.createElement('div');
    container.id = 'presence-bar';
    container.style.cssText = 'position:fixed;bottom:16px;right:16px;display:flex;flex-direction:column;align-items:flex-end;gap:6px;z-index:100;pointer-events:none';
    document.body.appendChild(container);
  }
  if (others.length === 0) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = others.map(u => {
    const initials = (u.name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const roleColor = { clinician: '#00d4bc', technician: '#3b82f6', reviewer: '#8b5cf6', admin: '#f59e0b' }[u.role] || '#64748b';
    return `<div title="${u.name} (${u.role}) — viewing this page" style="display:flex;align-items:center;gap:8px;background:var(--surface-2,#1e293b);border:1px solid var(--border,rgba(255,255,255,0.1));border-radius:20px;padding:6px 12px 6px 6px;font-size:0.75rem;color:var(--text-secondary);pointer-events:auto">
      <div style="width:26px;height:26px;border-radius:50%;background:${roleColor};display:flex;align-items:center;justify-content:center;font-size:0.65rem;font-weight:700;color:#000">${initials}</div>
      <span>${(u.name || '').split(' ')[0]} is here</span>
      <span style="width:6px;height:6px;border-radius:50%;background:#22c55e;animation:pulse 2s infinite"></span>
    </div>`;
  }).join('');
}
window._renderPresence = renderPresence;

// ── Presence: heartbeat ───────────────────────────────────────────────────────
let _presenceInterval = null;
function startPresenceHeartbeat() {
  clearInterval(_presenceInterval);
  _presenceInterval = setInterval(() => {
    if (currentPage && api.getToken()) {
      api.pingPresence(currentPage).then(r => { if (r && r.users) renderPresence(r.users); }).catch(() => {});
    }
  }, 20000);
}

// ── Notification: handler ─────────────────────────────────────────────────────
function _handleNotification(event) {
  const { type, data = {}, ts } = event;

  // Deduplicate: if the backend attaches a stable event_id, skip replayed events.
  const evtId = event.event_id || event.id;
  if (evtId) {
    if (_seenNotifIds.has(evtId)) return;
    _seenNotifIds.add(evtId);
    // Keep the set bounded to the last 500 IDs so it doesn't grow unbounded.
    if (_seenNotifIds.size > 500) {
      const first = _seenNotifIds.values().next().value;
      _seenNotifIds.delete(first);
    }
  }

  // ── Presence update (no toast — just update UI) ───────────────────────────
  if (type === 'presence_update') {
    renderPresence(data.users || []);
    return;
  }

  // ── Session logged notification ───────────────────────────────────────────
  if (type === 'session_logged') {
    _showNotifToast({
      title: 'Session Logged',
      body: `Session #${data.session_number} logged for ${data.patient_name} by ${data.logged_by}`,
      severity: 'info',
      link: null,
    });
    // If currently viewing the course detail for this course, refresh the sessions tab
    if (currentPage === 'course-detail' && window._selectedCourseId === data.course_id) {
      window._cdLoadTab?.('sessions');
    }
    return;
  }

  // ── Protocol review decision notification ─────────────────────────────────
  if (type === 'review_decision') {
    const actionLabel = data.action ? (data.action.charAt(0).toUpperCase() + data.action.slice(1)) : 'Updated';
    _showNotifToast({
      title: `Protocol ${actionLabel}`,
      body: `${data.reviewer_name} ${data.action} your protocol.${data.notes ? ' ' + data.notes : ''}`,
      severity: data.action === 'approved' ? 'success' : data.action === 'rejected' ? 'error' : 'warning',
      link: 'review-queue',
    });
    return;
  }

  // ── Media workflow notifications ──────────────────────────────────────────
  if (type === 'media_upload') {
    const notif = {
      id: Date.now(), type,
      title: 'New Patient Update',
      body: `${data.patient_name || 'A patient'} submitted a ${data.media_type || 'media'} update${data.course_name ? ' for ' + data.course_name : ''}.`,
      severity: 'info', link: 'media-queue',
      ts: ts || new Date().toISOString(), read: false,
    };
    _notifs.unshift(notif); _notifCount++; window._updateNotifBadge(); _showNotifToast(notif);
    refreshNavBadges();
    return;
  }
  if (type === 'media_urgent') {
    const notif = {
      id: Date.now(), type,
      title: 'Urgent Media Flag',
      body: `${data.patient_name || 'A patient'} upload has been flagged as urgent${data.flag_type ? ': ' + data.flag_type : ''}.`,
      severity: 'warn', link: 'media-queue',
      ts: ts || new Date().toISOString(), read: false,
    };
    _notifs.unshift(notif); _notifCount++; window._updateNotifBadge(); _showNotifToast(notif);
    refreshNavBadges();
    return;
  }
  if (type === 'media_analyzed') {
    const notif = {
      id: Date.now(), type,
      title: 'AI Analysis Complete',
      body: `Analysis ready for ${data.patient_name || 'a patient'} — review and approve the draft.`,
      severity: 'info', link: 'media-queue',
      ts: ts || new Date().toISOString(), read: false,
    };
    _notifs.unshift(notif); _notifCount++; window._updateNotifBadge(); _showNotifToast(notif);
    return;
  }
  if (type === 'media_reupload') {
    const notif = {
      id: Date.now(), type,
      title: 'Re-upload Requested',
      body: `${data.patient_name || 'A patient'} was asked to re-submit their media update.`,
      severity: 'warn', link: 'media-queue',
      ts: ts || new Date().toISOString(), read: false,
    };
    _notifs.unshift(notif); _notifCount++; window._updateNotifBadge(); _showNotifToast(notif);
    return;
  }
  if (type === 'media_reviewed') {
    const notif = {
      id: Date.now(), type,
      title: 'Media Review Complete',
      body: `Clinician review finished for ${data.patient_name || 'a patient'} upload.`,
      severity: 'info', link: 'media-queue',
      ts: ts || new Date().toISOString(), read: false,
    };
    _notifs.unshift(notif); _notifCount++; window._updateNotifBadge(); _showNotifToast(notif);
    return;
  }

  // ── Default: push to notification store and show toast ────────────────────
  const notif = {
    id: Date.now(),
    type,
    title: data.title || type,
    body: data.body || '',
    link: data.link || null,
    severity: data.severity || 'info',
    ts: ts || new Date().toISOString(),
    read: false,
  };
  _notifs.unshift(notif);
  _notifCount++;
  window._updateNotifBadge();
  _showNotifToast(notif);
}

// ── Notification: panel ───────────────────────────────────────────────────────
window._toggleNotifPanel = function() {
  let panel = document.getElementById('notif-panel');
  const bell = document.getElementById('notif-bell');
  if (panel) {
    panel.remove();
    if (bell) bell.setAttribute('aria-expanded', 'false');
    return;
  }
  if (bell) bell.setAttribute('aria-expanded', 'true');

  // Mark all as read
  _notifs.forEach(n => { n.read = true; });
  _notifCount = 0;
  window._updateNotifBadge();

  panel = document.createElement('div');
  panel.id = 'notif-panel';
  panel.style.cssText = 'position:fixed;top:52px;right:16px;width:360px;max-height:480px;background:var(--navy-850);border:1px solid var(--border);border-radius:var(--radius-lg);z-index:800;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.4);display:flex;flex-direction:column';
  panel.innerHTML = `
    <div style="padding:12px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;background:rgba(0,0,0,0.2)">
      <span style="font-size:13px;font-weight:600;color:var(--text-primary)">Notifications</span>
      <div style="display:flex;gap:8px">
        <button onclick="window._testNotif()" style="font-size:10px;color:var(--text-tertiary);background:none;border:none;cursor:pointer">Test</button>
        <button onclick="document.getElementById('notif-panel')?.remove()" style="color:var(--text-tertiary);background:none;border:none;cursor:pointer;font-size:16px">×</button>
      </div>
    </div>
    <div style="flex:1;overflow-y:auto;padding:8px">
      ${_notifs.length === 0
        ? '<div style="text-align:center;padding:32px;color:var(--text-tertiary);font-size:12.5px">No notifications yet</div>'
        : _notifs.slice(0, 20).map(n => {
            const icon = n.type === 'ae_alert' ? '⚠'
              : n.type === 'review_pending'  ? '◱'
              : n.type === 'session_reminder' ? '◧'
              : n.type === 'media_upload'    ? '📤'
              : n.type === 'media_urgent'    ? '⚑'
              : n.type === 'media_analyzed'  ? '✦'
              : n.type === 'media_reupload'  ? '↺'
              : n.type === 'media_reviewed'  ? '✓'
              : '◈';
            const color = n.severity === 'serious' ? 'var(--red)' : n.severity === 'warn' ? 'var(--amber)' : 'var(--teal)';
            return `<div style="padding:10px 12px;border-radius:8px;margin-bottom:4px;background:rgba(255,255,255,0.02);cursor:pointer;transition:background 0.15s"
              onmouseover="this.style.background='rgba(255,255,255,0.05)'"
              onmouseout="this.style.background='rgba(255,255,255,0.02)'"
              onclick="${n.link ? `window._nav('${n.link}');document.getElementById('notif-panel')?.remove()` : ''}">
              <div style="display:flex;gap:8px;align-items:flex-start">
                <span style="color:${color};font-size:14px;flex-shrink:0;margin-top:1px">${icon}</span>
                <div style="flex:1;min-width:0">
                  <div style="font-size:12.5px;font-weight:600;color:var(--text-primary)">${esc(n.title)}</div>
                  <div style="font-size:11.5px;color:var(--text-secondary);margin-top:2px;line-height:1.4">${esc(n.body)}</div>
                  <div style="font-size:10px;color:var(--text-tertiary);margin-top:4px">${new Date(n.ts).toLocaleTimeString()}</div>
                </div>
              </div>
            </div>`;
          }).join('')}
    </div>`;
  document.body.appendChild(panel);

  // Close when clicking outside
  setTimeout(() => {
    document.addEventListener('click', function handler(e) {
      if (!panel.contains(e.target) && e.target.id !== 'notif-bell') {
        panel.remove();
        document.removeEventListener('click', handler);
      }
    });
  }, 100);
};

// ── Notification: test helper ─────────────────────────────────────────────────
window._testNotif = function() {
  // Dispatch via backend so the notification flows through the SSE stream
  const token = api.getToken();
  if (token) {
    fetch(`${_API_BASE}/api/v1/notifications/test?token=${encodeURIComponent(token)}`, { method: 'POST' })
      .catch(() => {});
  }
  // Also trigger locally for instant feedback (handles case where SSE isn't up yet)
  _handleNotification({
    type: 'ae_alert',
    data: { title: 'Test: Adverse Event', body: 'Simulated AE notification — system is working.', severity: 'warn', link: 'adverse-events' },
    ts: new Date().toISOString(),
  });
};

// ── SSE connection (with exponential backoff reconnect) ───────────────────────
let _sseRetryDelay = 3000;   // initial retry: 3 s, doubles each failure, capped at 60 s
let _sseRetryTimer = null;

function connectSSE() {
  const token = api.getToken();
  if (!token) return;

  // Tear down any stale connection before opening a new one
  if (window._sseSource) {
    try { window._sseSource.close(); } catch (_) {}
    window._sseSource = null;
  }

  const evtSource = new EventSource(`${_API_BASE}/api/v1/notifications/stream?token=${encodeURIComponent(token)}`);

  evtSource.onopen = () => {
    _sseRetryDelay = 3000; // reset backoff on successful connection
  };

  evtSource.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data);
      if (event.type === 'heartbeat' || event.type === 'connected') return;
      _handleNotification(event);
    } catch (_) {}
  };

  evtSource.onerror = () => {
    evtSource.close();
    window._sseSource = null;
    // Don't retry if the user has logged out
    if (!api.getToken()) return;
    clearTimeout(_sseRetryTimer);
    _sseRetryTimer = setTimeout(() => {
      _sseRetryDelay = Math.min(_sseRetryDelay * 2, 60000);
      connectSSE();
    }, _sseRetryDelay);
  };

  window._sseSource = evtSource;
}

// ── Clinic Switcher ───────────────────────────────────────────────────────────
window._currentClinic = null;
window._clinics = [];

window._toggleClinicMenu = function() {
  const menu = document.getElementById('clinic-menu');
  if (!menu) return;
  const isVisible = menu.style.display !== 'none';
  menu.style.display = isVisible ? 'none' : 'block';
  if (!isVisible) {
    // Close on outside click
    setTimeout(() => {
      document.addEventListener('click', function handler(e) {
        const sw = document.getElementById('clinic-switcher');
        if (sw && !sw.contains(e.target)) {
          menu.style.display = 'none';
          document.removeEventListener('click', handler);
        }
      });
    }, 50);
  }
};

window._switchClinic = function(id) {
  const clinic = (window._clinics || []).find(c => c.id === id);
  if (!clinic) return;
  window._currentClinic = clinic;
  const nameEl = document.getElementById('clinic-name-display');
  if (nameEl) nameEl.textContent = clinic.name;
  // Update active state in menu
  document.querySelectorAll('.clinic-menu-item').forEach(el => {
    el.classList.toggle('active', el.dataset.id === id);
  });
  document.getElementById('clinic-menu').style.display = 'none';
  // Re-render current page
  window._nav(currentPage);
};

window._initClinicSwitcher = function(user) {
  const allowedRoles = ['admin', 'clinic-admin', 'clinician', 'supervisor'];
  if (!allowedRoles.includes(user?.role)) return;

  window._clinics = [
    { id: 'c1', name: 'Main Clinic',      role: 'clinic-admin' },
    { id: 'c2', name: 'North Branch',     role: 'clinician'    },
    { id: 'c3', name: 'Research Centre',  role: 'supervisor'   },
  ];
  window._currentClinic = window._clinics[0];

  const switcher = document.getElementById('clinic-switcher');
  if (switcher) switcher.style.display = '';

  const nameEl = document.getElementById('clinic-name-display');
  if (nameEl) nameEl.textContent = window._currentClinic.name;

  const ROLE_COLORS = {
    'clinic-admin': 'var(--teal)', clinician: 'var(--blue)',
    supervisor: 'var(--rose)',     technician: 'var(--violet)',
    reviewer: 'var(--amber)',      admin: 'var(--teal)',
  };

  const menu = document.getElementById('clinic-menu');
  if (menu) {
    menu.innerHTML = `
      <div style="font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.08em;padding:4px 12px 8px">Switch Clinic</div>
      ${window._clinics.map(c => {
        const col = ROLE_COLORS[c.role] || 'var(--text-secondary)';
        const isActive = c.id === window._currentClinic.id;
        return `<div class="clinic-menu-item${isActive ? ' active' : ''}" data-id="${c.id}" onclick="window._switchClinic('${c.id}')">
          <span style="width:8px;height:8px;border-radius:50%;background:${col};flex-shrink:0;box-shadow:0 0 6px ${col}60"></span>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;color:var(--text-primary)">${c.name}</div>
            <div style="font-size:10px;color:var(--text-tertiary);text-transform:capitalize">${c.role.replace('-', ' ')}</div>
          </div>
          ${isActive ? '<span style="color:var(--teal);font-size:12px">&#10003;</span>' : ''}
        </div>`;
      }).join('')}`;
  }
};

// ── Demo Mode ─────────────────────────────────────────────────────────────────
function _injectDemoBanner() {
  const existing = document.getElementById('demo-mode-banner');
  if (existing) existing.remove();

  if (localStorage.getItem('ds_demo_mode') !== 'true') return;

  const banner = document.createElement('div');
  banner.id = 'demo-mode-banner';
  banner.className = 'demo-banner';
  banner.innerHTML = `
    <span class="demo-banner-dot"></span>
    <span>Demo Mode — exploring with sample data</span>
    <a href="#" class="demo-banner-exit-btn" onclick="window._exitDemo(event)">Exit Demo</a>`;
  // Insert at very top of #app-shell or body
  const shell = document.getElementById('app-shell') || document.getElementById('topbar') || document.body.firstElementChild;
  if (shell && shell.parentNode) {
    shell.parentNode.insertBefore(banner, shell);
  } else {
    document.body.insertBefore(banner, document.body.firstChild);
  }
}

window._activateDemo = function() {
  localStorage.setItem('ds_demo_mode', 'true');
  _injectDemoBanner();
};

window._exitDemo = function(e) {
  e?.preventDefault();
  localStorage.removeItem('ds_demo_mode');
  const banner = document.getElementById('demo-mode-banner');
  if (banner) banner.remove();
  window._nav?.('dashboard');
};

// ── Feature Tooltips ──────────────────────────────────────────────────────────
const FEATURE_TOOLTIPS = {
  'protocol-builder': 'Drag blocks from the palette to build a custom neuromodulation protocol. Click a block to edit parameters.',
  'med-interactions': 'Select a patient and click "Run Interaction Check" to screen medications for TMS and neuromodulation safety.',
  'evidence-builder': "Select a protocol and condition to compare your clinic's outcomes against published research benchmarks.",
  'forms-builder':    'Use the validated scales (PHQ-9, GAD-7) or build custom forms. Deploy to patients with one click.',
  'literature':       'Browse 52 peer-reviewed neuromodulation papers. Click the Evidence Map tab to see effect sizes plotted by year.',
};

function _initFeatureTooltips() {
  const page = currentPage;
  if (!FEATURE_TOOLTIPS[page]) return;

  // Check if already dismissed for this page
  let dismissed = {};
  try { dismissed = JSON.parse(localStorage.getItem('ds_tooltip_dismissed') || '{}'); } catch {}
  if (dismissed[page]) return;

  // Wait for content to be painted, then inject
  requestAnimationFrame(() => {
    const el = document.getElementById('content');
    if (!el) return;
    // Don't add if already present
    if (document.getElementById('feature-tooltip-' + page)) return;

    const tip = document.createElement('div');
    tip.id = 'feature-tooltip-' + page;
    tip.className = 'feature-tooltip';
    tip.style.position = 'relative';
    tip.innerHTML = `
      <span style="font-size:16px;flex-shrink:0">💡</span>
      <span style="flex:1;line-height:1.5;color:var(--text-primary)">${FEATURE_TOOLTIPS[page]}</span>
      <button onclick="window._dismissTooltip('${page}')"
        class="feature-tooltip-dismiss"
        aria-label="Dismiss tip">×</button>`;
    el.insertBefore(tip, el.firstChild);
  });
}

window._dismissTooltip = function(page) {
  const el = document.getElementById('feature-tooltip-' + page);
  if (el) el.remove();
  let dismissed = {};
  try { dismissed = JSON.parse(localStorage.getItem('ds_tooltip_dismissed') || '{}'); } catch {}
  dismissed[page] = true;
  try { localStorage.setItem('ds_tooltip_dismissed', JSON.stringify(dismissed)); } catch {}
};

// Re-run tooltip check on every navigate
const _origNavigate = window._nav;
// (will be patched after navigate is defined — see below)

// ── Boot after login ──────────────────────────────────────────────────────────
// ── Warm patient roster cache for command palette ─────────────────────────────
async function _warmPatientRoster() {
  try {
    const res = await api.listPatients({ limit: 200 }).catch(() => null);
    if (res?.items) {
      window._patientRoster = res.items.map(p => ({
        id: p.id,
        name: [p.first_name, p.last_name].filter(Boolean).join(' ') || p.display_name || 'Patient',
        condition: p.primary_condition || p.condition || '',
        email: p.email || '',
      }));
      // Also persist to sessionStorage for fast access across navigations
      try { sessionStorage.setItem('ds_patient_roster', JSON.stringify(window._patientRoster)); } catch {}
    }
  } catch {}
}
window._warmPatientRoster = _warmPatientRoster;

async function bootApp() {
  if (currentPage === 'dashboard') {
    // Role-based entry: redirect technician → session-execution, reviewer → review-queue, etc.
    const role  = currentUser?.role || 'clinician';
    const entry = ROLE_ENTRY_PAGE[role];
    if (entry && entry !== 'dashboard') currentPage = entry;
  }
  // ── Deep-link: honour ?page= query param or #hash so reloads and bookmarks
  //    land where the user expects. Falls back to role-based entry above if
  //    the requested id doesn't pass a safe-slug check.
  {
    let deepLinkId = null;
    try {
      const qp = new URL(location.href).searchParams.get('page');
      if (qp) deepLinkId = qp;
      else if (location.hash && location.hash.length > 1) deepLinkId = location.hash.slice(1);
    } catch {}
    if (deepLinkId && /^[a-z0-9][a-z0-9-]{0,63}$/i.test(deepLinkId)) {
      currentPage = deepLinkId;
    }
  }
  // Initialise clinic switcher for multi-clinic roles
  window._initClinicSwitcher(currentUser);
  renderNav();
  initSidebarKeyboard();

  // ── Demo mode banner ───────────────────────────────────────────────────────
  _injectDemoBanner();

  await renderPage();

  // ── Feature tooltips (initialise after page renders) ──────────────────────
  _initFeatureTooltips();

  // Refresh nav badges after page loads (don't block render)
  refreshNavBadges();
  // Refresh badges every 3 minutes while app is open
  setInterval(refreshNavBadges, 3 * 60 * 1000);
  // Start SSE notification stream
  connectSSE();
  // Start presence heartbeat (pings every 20s to keep presence alive)
  startPresenceHeartbeat();
  // Listen for SW background sync messages
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'SYNC_OFFLINE_QUEUE') {
        syncOfflineQueue();
      }
    });
  }
  // ── Topbar scroll-shadow listener ─────────────────────────────────────────
  (function initTopbarScrollShadow() {
    const content = document.getElementById('content');
    const topbar  = document.getElementById('topbar');
    if (!content || !topbar) return;
    const onScroll = () => {
      topbar.classList.toggle('topbar--scrolled', content.scrollTop > 2);
    };
    content.addEventListener('scroll', onScroll, { passive: true });
  })();

  // Check backend health (non-blocking)
  checkBackendHealth();
  // Re-check every 30s if the backend banner is visible
  setInterval(() => {
    if (document.getElementById('backend-banner')) checkBackendHealth();
  }, 30000);
  // Warm patient roster cache for command palette (fire-and-forget)
  _warmPatientRoster();
  // Idle-logout watchdog consumes the ds_auto_logout preference written by Settings.
  _mountIdleLogoutWatchdog();
}

// Reads ds_auto_logout ("never" | minutes) and signs the clinician out on idle.
// Reset by pointer / key / scroll / visibility events; re-reads pref on each
// reset so new values take effect without reboot. No-op when "never" / 0.
function _mountIdleLogoutWatchdog() {
  if (window.__idleLogoutMounted) return;
  window.__idleLogoutMounted = true;
  let t = null;
  const mins = () => {
    try {
      const v = localStorage.getItem('ds_auto_logout');
      if (!v || v === 'never' || v === '0') return 0;
      const n = parseInt(v, 10);
      return Number.isFinite(n) && n > 0 ? n : 0;
    } catch { return 0; }
  };
  const reset = () => {
    if (t) { clearTimeout(t); t = null; }
    const m = mins(); if (!m) return;
    t = setTimeout(() => {
      try { window._showNotifToast?.({ title: 'Signed out', body: 'Idle timeout reached.', severity: 'info' }); } catch {}
      try { window.doLogout?.(); } catch {}
    }, m * 60000);
  };
  ['pointermove','pointerdown','keydown','wheel','scroll','visibilitychange','focus'].forEach(ev => {
    window.addEventListener(ev, reset, { passive: true });
  });
  reset();
}

window._bootApp = bootApp;

// ── Backend health check ──────────────────────────────────────────────────────
async function checkBackendHealth() {
  try {
    await api.health();
    document.getElementById('backend-banner')?.remove();
  } catch {
    const existing = document.getElementById('backend-banner');
    if (existing) return;
    const banner = document.createElement('div');
    banner.id = 'backend-banner';
    banner.setAttribute('role', 'alert');
    banner.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:var(--surface-2);border:1px solid var(--rose-500,#f43f5e);color:var(--text-primary);padding:12px 20px;border-radius:10px;display:flex;align-items:center;gap:12px;z-index:550;box-shadow:0 4px 16px rgba(0,0,0,0.4);font-size:0.875rem;max-width:420px';
    banner.innerHTML = `<span style="color:var(--rose-500,#f43f5e);font-size:1.1rem">⚠</span> <span>Backend server is unreachable. Using cached data where available.</span> <button onclick="window.checkBackendHealth()" style="background:none;border:1px solid var(--border);border-radius:6px;padding:4px 10px;color:var(--text-primary);cursor:pointer;white-space:nowrap;font-size:0.8rem">Retry</button>`;
    document.body.appendChild(banner);
  }
}
window.checkBackendHealth = checkBackendHealth;

// ── Patient portal preview (from clinician app) ───────────────────────────────
window._previewPatientPortal = function() {
  const preview = { id: 'actor-patient-demo', email: 'patient@demo.com', display_name: 'Jane Patient', role: 'patient', package_id: 'explorer' };
  setCurrentUser(preview);
  showPatient();
  updatePatientBar();
  window._bootPatient();
};

// ── Back to clinic (from patient portal preview) ──────────────────────────────
window._backToClinic = async function() {
  try {
    const user = await api.me();
    if (user && user.role !== 'patient') {
      setCurrentUser(user);
      showApp();
      updateUserBar();
      await bootApp();
      return;
    }
  } catch (_) {}
  // Fallback: restore clinician demo
  setCurrentUser({ id: 'actor-clinician-demo', email: 'clinician@demo.com', display_name: 'Dr. Jane Smith', role: 'clinician', package_id: 'clinician_pro' });
  showApp();
  updateUserBar();
  await bootApp();
};

// ── Initial boot ──────────────────────────────────────────────────────────────
async function init() {
  const token = api.getToken();
  if (!token) {
    navigatePublic('home');
    return;
  }
  try {
    const user = await api.me();
    if (!user || !user.role) { api.clearToken(); navigatePublic('home'); return; }
    setCurrentUser(user);
    if (user.role === 'patient') {
      showPatient();
      updatePatientBar();
      window._bootPatient();
    } else {
      showApp();
      updateUserBar();
      await bootApp();
    }
  } catch {
    api.clearToken();
    navigatePublic('home');
  }
}

init();

// ── Browser back/forward navigation ──────────────────────────────────────────
window.addEventListener('popstate', (e) => {
  const page = e.state?.page || new URLSearchParams(location.search).get('page') || 'dashboard';
  const params = e.state?.params || {};
  navigate(page, params);
});

// ── AI Clinical Co-pilot ─────────────────────────────────────────────────────
// Wired to the real backend `/api/v1/chat/clinician` endpoint. No hardcoded
// AI responses — the model choice is made server-side. Clinician-only surface.
(function initAICopilot() {

  // Role gate — only clinical staff get the co-pilot. Patients use the
  // dedicated patient chat in the portal shell.
  const _CLINICAL_ROLES = new Set(['clinician', 'admin', 'clinic-admin', 'supervisor', 'reviewer']);
  function _canUseCopilot() {
    const role = currentUser?.role;
    // Allow anonymous/guest in dev (no currentUser yet); block only explicit non-clinical roles
    // like 'patient' / 'technician' which have their own surfaces.
    if (!role) return true;
    return _CLINICAL_ROLES.has(role);
  }

  const AI_CONV_KEY  = 'ds_ai_conversations';
  const AI_STATE_KEY = 'ds_ai_panel_open';
  let _aiMessages = [];

  // Load saved conversation (last 50)
  try {
    const saved = JSON.parse(localStorage.getItem(AI_CONV_KEY) || '[]');
    _aiMessages = Array.isArray(saved) ? saved.slice(-50) : [];
  } catch { _aiMessages = []; }

  function _saveConversation() {
    try {
      localStorage.setItem(AI_CONV_KEY, JSON.stringify(_aiMessages.slice(-50)));
    } catch {}
  }

  // ── Inject DOM ────────────────────────────────────────────────────────────
  function _injectAIPanel() {
    if (document.getElementById('ai-copilot-panel')) return;
    // Hide FAB/panel entirely for non-clinical roles (patients, technicians).
    // Role may not be known yet at first call; in that case inject and let the
    // role gate in _aiSend/_aiToggle handle access.
    if (currentUser && !_canUseCopilot()) return;

    const panel = document.createElement('div');
    panel.id = 'ai-copilot-panel';
    panel.className = 'ai-panel';
    panel.innerHTML = `
      <div class="ai-panel-header">
        <span>Clinical AI Co-pilot</span>
        <button onclick="window._aiClose()" title="Close" aria-label="Close AI panel">×</button>
      </div>
      <div class="ai-panel-context" id="ai-context-bar">Ready — navigate to a page for context.</div>
      <div class="ai-panel-messages" id="ai-messages"></div>
      <div class="ai-panel-input">
        <div class="ai-quick-prompts">
          <button class="ai-quick-btn" onclick="window._aiQuick('TMS parameters')">TMS parameters</button>
          <button class="ai-quick-btn" onclick="window._aiQuick('PHQ-9 scoring')">PHQ-9 scoring</button>
          <button class="ai-quick-btn" onclick="window._aiQuick('Medication risks')">Medication risks</button>
          <button class="ai-quick-btn" onclick="window._aiQuick('Evidence summary')">Evidence summary</button>
        </div>
        <textarea id="ai-input" placeholder="Ask about this patient, protocol, or evidence…" rows="3"
          onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();window._aiSend();}"></textarea>
        <button onclick="window._aiSend()">Send</button>
      </div>`;
    document.body.appendChild(panel);

    const fab = document.createElement('button');
    fab.id = 'ai-fab';
    fab.title = 'AI Clinical Co-pilot';
    fab.setAttribute('aria-label', 'Toggle AI Co-pilot');
    fab.textContent = '🤖';
    fab.onclick = window._aiToggle;
    document.body.appendChild(fab);

    // Restore open state
    if (localStorage.getItem(AI_STATE_KEY) === '1') {
      panel.classList.add('open');
    }

    // Render any existing messages
    _renderMessages();
  }

  // ── Render messages ───────────────────────────────────────────────────────
  function _renderMessages() {
    const el = document.getElementById('ai-messages');
    if (!el) return;
    if (_aiMessages.length === 0) {
      el.innerHTML = `<div style="text-align:center;padding:32px 16px;color:var(--text-secondary);font-size:12.5px;line-height:1.6">
        <div style="font-size:2rem;margin-bottom:8px">🧠</div>
        <div>Your AI clinical co-pilot is ready.</div>
        <div style="margin-top:4px;color:var(--text-tertiary)">Ask about protocols, medications, scoring, or evidence.</div>
      </div>`;
      return;
    }
    el.innerHTML = _aiMessages.map(m => {
      const cls = m.role === 'user' ? 'ai-msg-user' : 'ai-msg-bot';
      return `<div class="${cls}">${esc(m.text)}</div>`;
    }).join('');
    el.scrollTop = el.scrollHeight;
  }

  // ── Send message ──────────────────────────────────────────────────────────
  // Calls /api/v1/chat/clinician with the rolling conversation. Backend owns
  // model selection and safety. No hardcoded replies.
  let _aiSending = false;
  window._aiSend = async function() {
    if (_aiSending) return;
    const input = document.getElementById('ai-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';

    if (!_canUseCopilot()) {
      const msgEl0 = document.getElementById('ai-messages');
      if (msgEl0) {
        msgEl0.innerHTML += `<div class="ai-msg-bot">This assistant is for clinical staff. Please use the patient portal chat instead.</div>`;
        msgEl0.scrollTop = msgEl0.scrollHeight;
      }
      return;
    }

    _aiMessages.push({ role: 'user', text });
    _saveConversation();

    // Show user message + live "Thinking…" indicator (NOT a fake response — it
    // is removed as soon as the real reply arrives).
    const msgEl = document.getElementById('ai-messages');
    if (msgEl) {
      msgEl.innerHTML += `<div class="ai-msg-user">${esc(text)}</div>`;
      msgEl.innerHTML += `<div class="ai-msg-typing" id="ai-typing">Thinking…</div>`;
      msgEl.scrollTop = msgEl.scrollHeight;
    }

    _aiSending = true;
    try {
      // Chat endpoint expects {role: 'user' | 'assistant', content}. We store
      // as {role: 'user' | 'bot', text} locally, so translate.
      const apiMessages = _aiMessages.map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.text,
      }));
      const patientId = window._selectedPatientId || null;
      const result = await api.chatClinician(
        apiMessages,
        patientId ? { patient_id: patientId } : null,
      );
      const reply = result?.reply || result?.content || result?.message
        || 'No reply from AI service.';
      _aiMessages.push({ role: 'bot', text: reply });
      _saveConversation();
      const typing = document.getElementById('ai-typing');
      if (typing) typing.remove();
      const msgEl2 = document.getElementById('ai-messages');
      if (msgEl2) {
        msgEl2.innerHTML += `<div class="ai-msg-bot">${esc(reply)}</div>`;
        msgEl2.scrollTop = msgEl2.scrollHeight;
      }
    } catch (e) {
      const typing = document.getElementById('ai-typing');
      if (typing) typing.remove();
      const errText = e?.message ? `Error: ${e.message}` : 'Could not reach AI service.';
      _aiMessages.push({ role: 'bot', text: errText });
      _saveConversation();
      const msgEl2 = document.getElementById('ai-messages');
      if (msgEl2) {
        msgEl2.innerHTML += `<div class="ai-msg-bot">${esc(errText)}</div>`;
        msgEl2.scrollTop = msgEl2.scrollHeight;
      }
    } finally {
      _aiSending = false;
    }
  };

  // ── Quick prompt ──────────────────────────────────────────────────────────
  window._aiQuick = function(prompt) {
    const input = document.getElementById('ai-input');
    if (input) { input.value = prompt; }
    window._aiSend();
  };

  // ── Toggle / open / close ─────────────────────────────────────────────────
  window._aiToggle = function() {
    const panel = document.getElementById('ai-copilot-panel');
    if (!panel) return;
    const isOpen = panel.classList.toggle('open');
    localStorage.setItem(AI_STATE_KEY, isOpen ? '1' : '0');
    if (isOpen) {
      _renderMessages();
      setTimeout(() => {
        const msgEl = document.getElementById('ai-messages');
        if (msgEl) msgEl.scrollTop = msgEl.scrollHeight;
      }, 350);
    }
  };

  window._aiClose = function() {
    const panel = document.getElementById('ai-copilot-panel');
    if (panel) panel.classList.remove('open');
    localStorage.setItem(AI_STATE_KEY, '0');
  };

  // ── Context updater (called after each page render) ───────────────────────
  window._aiUpdateContext = function(pageId) {
    const ctxEl = document.getElementById('ai-context-bar');
    if (!ctxEl) return;
    const ctxMap = {
      'protocol-builder': 'Context: Protocol Builder — ask about parameters, modalities, contraindications',
      'med-interactions': 'Context: Medication Safety — ask about drug interactions, TMS seizure risk',
      'evidence-builder': 'Context: Evidence Builder — ask about effect sizes, study designs, benchmarks',
      'session-monitor':  'Context: Live Session Monitor — ask about session parameters, cues, safety',
      'outcome-prediction': 'Context: Outcome Prediction — ask about prediction scores, risk levels, interventions',
      'decision-support': 'Context: Clinical Decision Support — ask about treatment decisions, guidelines',
    };
    const ctx = ctxMap[pageId];
    if (ctx) {
      ctxEl.textContent = ctx;
    } else {
      const title = PAGE_TITLES[pageId] || pageId;
      ctxEl.textContent = `Current page: ${title}`;
    }
  };

  // ── Clear history ─────────────────────────────────────────────────────────
  window._aiClearHistory = function() {
    _aiMessages = [];
    _saveConversation();
    _renderMessages();
  };

  // ── Bootstrap on first call ───────────────────────────────────────────────
  // Wait for DOM to be ready (body should exist by now, but guard anyway)
  if (document.body) {
    _injectAIPanel();
  } else {
    document.addEventListener('DOMContentLoaded', _injectAIPanel);
  }

})();

// ── Command Palette ──────────────────────────────────────────────────────────
(function initCommandPalette() {
  // Static nav commands — always available
  const NAV_COMMANDS = [
    { type: 'nav', icon: '🏠', title: 'Dashboard',            page: 'dashboard',        shortcut: 'Alt+D' },
    { type: 'nav', icon: '👥', title: 'Patients',             page: 'patients',         shortcut: 'Alt+P' },
    { type: 'nav', icon: '📋', title: 'Treatment Courses',    page: 'courses',          shortcut: 'Alt+C' },
    { type: 'nav', icon: '🧠', title: 'Protocol Intelligence', page: 'protocol-wizard' },
    { type: 'nav', icon: '◇',  title: 'Protocol Registry',   page: 'protocols-registry' },
    { type: 'nav', icon: '📊', title: 'Outcomes & Progress',   page: 'outcomes' },
    { type: 'nav', icon: '⚠️', title: 'Review & Approvals',    page: 'review-queue',     shortcut: 'Alt+R' },
    { type: 'nav', icon: '◧',  title: 'Session Execution',   page: 'session-execution', shortcut: 'Alt+S' },
    { type: 'nav', icon: '📁', title: 'Evidence Library',    page: 'evidence' },
    { type: 'nav', icon: '🔬', title: 'Devices',             page: 'devices' },
    { type: 'nav', icon: '◈',  title: 'qEEG / Brain Data',   page: 'braindata' },
    { type: 'nav', icon: '◫',  title: 'qEEG Maps',           page: 'qeegmaps' },
    { type: 'nav', icon: '◉',  title: 'Assessments',         page: 'assessments' },
    { type: 'nav', icon: '◧',  title: 'Handbooks',           page: 'handbooks' },
    { type: 'nav', icon: '🤖', title: 'AI Clinical Assistant', page: 'ai-assistant' },
    { type: 'nav', icon: '📄', title: 'Reports',             page: 'reports' },
    { type: 'nav', icon: '📹', title: 'Telehealth',          page: 'telehealth' },
    { type: 'nav', icon: '🎥', title: 'Session Recorder',    page: 'telehealth-recorder' },
    { type: 'nav', icon: '🛡️', title: 'Adverse Events',      page: 'adverse-events' },
    { type: 'nav', icon: '◧',  title: 'Audit Trail',         page: 'audittrail' },
    { type: 'nav', icon: '⚙️', title: 'Settings',            page: 'settings' },
    { type: 'nav', icon: '👤', title: 'My Account',          page: 'clinician-account' },
    { type: 'nav', icon: '🎓', title: 'Academy',             page: 'academy' },
    { type: 'nav', icon: '👑', title: 'Admin Panel',         page: 'admin' },
    { type: 'nav', icon: '◎',  title: 'Brain Regions',       page: 'brainregions' },
    { type: 'nav', icon: '⌚', title: 'Wearables',            page: 'wearables' },
    { type: 'nav', icon: '🏠', title: 'Home Programs',        page: 'home-task-manager' },
    { type: 'nav', icon: '📦', title: 'Condition Packages',   page: 'condition-packages' },
    { type: 'nav', icon: '🔧', title: 'Protocol Builder',     page: 'protocol-builder' },
    { type: 'nav', icon: '🧩', title: 'Brain Map Planner',    page: 'brain-map-planner' },
    { type: 'nav', icon: '💊', title: 'Prescriptions',        page: 'prescriptions' },
    { type: 'nav', icon: '📐', title: 'Scales & Scores',      page: 'scoring-calc' },
    { type: 'nav', icon: '📞', title: 'Virtual Care',         page: 'telehealth' },
    { type: 'nav', icon: '📋', title: 'Today\'s Queue',       page: 'patient-queue' },
    { type: 'nav', icon: '💰', title: 'Billing',              page: 'billing' },
    { type: 'nav', icon: '🩺', title: 'Assessments Hub',      page: 'assessments-hub' },
    { type: 'nav', icon: '📈', title: 'Population Analytics', page: 'population-analytics' },
    { type: 'nav', icon: '📚', title: 'Literature Library',   page: 'literature' },
    { type: 'nav', icon: '🔬', title: 'Clinical Trials',      page: 'clinical-trials' },
    { type: 'nav', icon: '✉️', title: 'Messaging',             page: 'messaging' },
    { type: 'nav', icon: '📝', title: 'Clinical Notes',       page: 'clinical-notes' },
    { type: 'nav', icon: '🗓️', title: 'Calendar',             page: 'calendar' },
    { type: 'nav', icon: '📤', title: 'Data Export',           page: 'data-export' },
    { type: 'nav', icon: '🔒', title: 'Consent Management',   page: 'documents-hub' },
    { type: 'nav', icon: '⏰', title: 'Reminders',            page: 'reminders' },
  ];

  let _paletteOpen = false;
  let _activeIndex = 0;
  let _results = [];
  let _cachedPatients = null;
  let _cachedCourses = null;
  let _cachedProtocols = null;

  // Fuzzy match: returns score (higher = better), or 0 if no match
  function _fuzzy(query, text) {
    if (!text) return 0;
    const q = query.toLowerCase();
    const t = text.toLowerCase();
    if (t.includes(q)) return q.length === t.length ? 100 : 50 + q.length;
    let qi = 0, score = 0;
    for (let i = 0; i < t.length && qi < q.length; i++) {
      if (t[i] === q[qi]) { qi++; score++; }
    }
    return qi === q.length ? score : 0;
  }

  // Highlight matching chars in text
  function _highlight(query, text) {
    if (!query || !text) return esc(text) || '';
    const q = query.toLowerCase();
    const t = text.toLowerCase();
    const idx = t.indexOf(q);
    if (idx >= 0) {
      return esc(text.slice(0, idx)) + `<span class="cmd-match">${esc(text.slice(idx, idx + q.length))}</span>` + esc(text.slice(idx + q.length));
    }
    return esc(text);
  }

  async function _loadData() {
    if (!_cachedPatients) {
      try { const _r = await api.listPatients(); _cachedPatients = _r?.items || _r || []; } catch { _cachedPatients = []; }
    }
    if (!_cachedCourses) {
      try {
        const result = await api.listCourses();
        _cachedCourses = result?.items || result || [];
      } catch { _cachedCourses = []; }
    }
    if (!_cachedProtocols) {
      try { const _r = await api.protocols(); _cachedProtocols = _r?.items || _r || []; } catch { _cachedProtocols = []; }
    }
  }

  // Quick Actions — fixed items always available
  const QUICK_ACTIONS = [
    { type: 'action', icon: '➕', title: 'New Patient',          action: () => { window._closePaletteForce(); window._nav('patients'); } },
    { type: 'action', icon: '▶',  title: 'Start Session',        action: () => { window._closePaletteForce(); window._nav('session-execution'); } },
    { type: 'action', icon: '📊', title: 'Log Outcome',          action: () => { window._closePaletteForce(); window._nav('outcomes'); } },
    { type: 'action', icon: '📅', title: 'Schedule Assessment',  action: () => { window._closePaletteForce(); window._nav('assessments-hub'); } },
  ];

  function _getRecentFromStorage() {
    try {
      const stored = JSON.parse(localStorage.getItem('ds_recent_pages') || '[]');
      return stored.slice(0, 5).map(r => ({
        type: 'recent',
        icon: r.icon || '◈',
        title: r.label || r.id,
        page: r.id,
        subtitle: 'Recent',
      }));
    } catch { return []; }
  }

  window._openPalette = function() {
    const overlay = document.getElementById('cmd-palette');
    if (!overlay) return;
    _paletteOpen = true;
    overlay.style.display = 'flex';
    const input = document.getElementById('cmd-palette-input');
    input.value = '';
    setTimeout(() => input.focus(), 50);

    // Default view: Recent + Quick Actions
    const recents = _getRecentFromStorage();
    const defaultItems = [
      ...recents.slice(0, 5),
      ...QUICK_ACTIONS,
    ];
    _renderResults('', defaultItems);

    _loadData(); // Warm cache in background

    setTimeout(() => {
      const modal = document.querySelector('.cmd-palette-modal');
      if (modal && typeof window._trapFocus === 'function') window._trapFocus(modal);
    }, 50);
  };

  window._closePalette = function(e) {
    if (e && e.target !== document.getElementById('cmd-palette')) return;
    _paletteOpen = false;
    const overlay = document.getElementById('cmd-palette');
    if (overlay) overlay.style.display = 'none';
  };

  window._closePaletteForce = function() {
    _paletteOpen = false;
    const overlay = document.getElementById('cmd-palette');
    if (overlay) overlay.style.display = 'none';
  };

  window._paletteSearch = async function(query) {
    _activeIndex = 0;
    if (!query.trim()) {
      const recents = _getRecentFromStorage();
      const defaultItems = [...recents.slice(0, 5), ...QUICK_ACTIONS];
      _renderResults('', defaultItems);
      return;
    }
    const q = query.trim().toLowerCase();
    await _loadData();

    const navScored = [];
    const patientScored = [];
    const recentScored = [];
    const actionScored = [];

    // Navigation category
    NAV_COMMANDS.forEach(cmd => {
      const score = _fuzzy(q, cmd.title);
      if (score > 0) navScored.push({ ...cmd, _score: score });
    });
    navScored.sort((a, b) => b._score - a._score);

    // Patients category — API cache + window._patientRoster + localStorage
    const allPatients = [
      ...(_cachedPatients || []),
      ...(Array.isArray(window._patientRoster) ? window._patientRoster : []),
    ];
    const seenPatientIds = new Set();
    allPatients.forEach(p => {
      if (!p || seenPatientIds.has(p.id)) return;
      seenPatientIds.add(p.id);
      const name = `${p.first_name || p.name || ''} ${p.last_name || ''}`.trim();
      const score = Math.max(_fuzzy(q, name), _fuzzy(q, p.primary_condition || ''));
      if (score > 0) patientScored.push({ type: 'patient', icon: '👤', title: name, subtitle: p.primary_condition || 'Patient', id: p.id, _score: score });
    });
    // localStorage patient cache
    try {
      const lsPts = JSON.parse(localStorage.getItem('ds_patients') || '[]');
      lsPts.slice(0, 20).forEach(p => {
        if (!p || seenPatientIds.has(p.id)) return;
        seenPatientIds.add(p.id);
        const name = p.name || '';
        const score = Math.max(_fuzzy(q, name), _fuzzy(q, p.condition || ''));
        if (score > 0) {
          patientScored.push({ type: 'patient', icon: '👤', title: name, subtitle: 'Patient · ' + (p.condition || ''), id: p.id, _score: score,
            action: () => { window._profilePatientId = p.id; window._nav('patient-profile'); } });
        }
      });
    } catch(e) {}
    patientScored.sort((a, b) => b._score - a._score);

    // Recent category — search localStorage recents
    _getRecentFromStorage().forEach(r => {
      const score = _fuzzy(q, r.title);
      if (score > 0) recentScored.push({ ...r, _score: score });
    });
    recentScored.sort((a, b) => b._score - a._score);

    // Quick Actions category — filter by query
    QUICK_ACTIONS.forEach(a => {
      const score = _fuzzy(q, a.title);
      if (score > 0) actionScored.push({ ...a, _score: score });
    });

    // Courses + Protocols (keep existing behaviour, add to nav bucket)
    (_cachedCourses || []).forEach(c => {
      const score = Math.max(_fuzzy(q, c.title || c.name || ''), _fuzzy(q, c.condition || ''));
      if (score > 0) navScored.push({ type: 'course', icon: '📋', title: c.title || c.name || `Course #${c.id}`, subtitle: c.condition || '', id: c.id, _score: score });
    });
    (_cachedProtocols || []).forEach(p => {
      const score = Math.max(_fuzzy(q, p.name || p.title || ''), _fuzzy(q, p.condition || ''));
      if (score > 0) navScored.push({ type: 'protocol', icon: '🧠', title: p.name || p.title || `Protocol #${p.id}`, subtitle: p.condition || p.modality || '', id: p.id, _score: score });
    });
    navScored.sort((a, b) => b._score - a._score);

    // Build ordered grouped result set
    const grouped = [
      ...patientScored.slice(0, 5),
      ...navScored.slice(0, 6),
      ...recentScored.slice(0, 3),
      ...actionScored.slice(0, 4),
    ];
    _renderResults(q, grouped.slice(0, 16));
  };

  function _renderResults(query, items) {
    _results = items;
    const container = document.getElementById('cmd-palette-results');
    if (!container) return;
    if (items.length === 0) {
      container.innerHTML = `<div class="cmd-empty">No results for "${query}"</div>`;
      return;
    }

    const groups = {};
    items.forEach((item, i) => {
      const g = item.type || 'nav';
      if (!groups[g]) groups[g] = [];
      groups[g].push({ ...item, _i: i });
    });

    const groupLabels = { nav: 'Navigation', recent: 'Recent', patient: 'Patients', course: 'Courses', protocol: 'Protocols', knowledge: 'Knowledge', action: 'Quick Actions' };
    let html = '';
    Object.entries(groups).forEach(([type, groupItems]) => {
      html += `<div class="cmd-group-label">${groupLabels[type] || type}</div>`;
      groupItems.forEach(item => {
        const active = item._i === _activeIndex ? ' active' : '';
        html += `<div class="cmd-item${active}" data-idx="${item._i}" onclick="window._paletteSelect(${item._i})">
          <div class="cmd-item-icon ${item.type || 'nav'}">${item.icon}</div>
          <div class="cmd-item-body">
            <div class="cmd-item-title">${query ? _highlight(query, item.title) : esc(item.title)}</div>
            ${item.subtitle ? `<div class="cmd-item-subtitle">${esc(item.subtitle)}</div>` : ''}
          </div>
          ${item.shortcut ? `<span class="cmd-item-shortcut">${item.shortcut}</span>` : ''}
        </div>`;
      });
    });
    container.innerHTML = html;
  }

  window._paletteSelect = function(idx) {
    const item = _results[idx];
    if (!item) return;
    window._closePaletteForce();
    if (item.action) {
      item.action();
    } else if (item.type === 'nav' || item.type === 'recent' || !item.type) {
      window._nav(item.page);
    } else if (item.type === 'patient') {
      window._nav('patients');
    } else if (item.type === 'course') {
      window._selectedCourseId = item.id;
      window._nav('course-detail');
    } else if (item.type === 'protocol') {
      window._selectedProtocolId = item.id;
      window._nav('protocol-wizard');
    }
  };

  window._paletteKeydown = function(e) {
    const total = _results.length;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      _activeIndex = (_activeIndex + 1) % (total || 1);
      _updateActiveItem();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      _activeIndex = (_activeIndex - 1 + (total || 1)) % (total || 1);
      _updateActiveItem();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      window._paletteSelect(_activeIndex);
    } else if (e.key === 'Escape') {
      window._closePaletteForce();
    }
  };

  function _updateActiveItem() {
    document.querySelectorAll('.cmd-item').forEach((el, i) => {
      el.classList.toggle('active', i === _activeIndex);
      if (i === _activeIndex) el.scrollIntoView({ block: 'nearest' });
    });
  }

  // Cache clear (call from logout)
  window._clearPaletteCache = function() {
    _cachedPatients = null;
    _cachedCourses = null;
    _cachedProtocols = null;
  };

  // Keyboard shortcut: Cmd+K / Ctrl+K
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      if (_paletteOpen) { window._closePaletteForce(); } else { window._openPalette(); }
    }
    // Escape is also handled here (in addition to the global handler above)
    if (e.key === 'Escape' && _paletteOpen) {
      window._closePaletteForce();
    }
  });
})();
