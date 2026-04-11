import { api } from './api.js';
import { currentUser, setCurrentUser, updateUserBar, updatePatientBar, showApp, showPublic, showPatient, showLogin } from './auth.js';
import { ROLE_ENTRY_PAGE } from './constants.js';
import { t, setLocale, getLocale, LOCALES } from './i18n.js';

// ── Accessibility: screen-reader announcements ────────────────────────────────
function announce(message, urgent = false) {
  const el = document.getElementById(urgent ? 'a11y-alert' : 'a11y-announce');
  if (!el) return;
  el.textContent = '';
  requestAnimationFrame(() => { el.textContent = message; });
}
window._announce = announce;

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

// ── Theme management ────────────────────────────────────────────────────────
(function initTheme() {
  const stored = localStorage.getItem('ds_theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = stored || (prefersDark ? 'dark' : 'light');
  if (theme === 'light') document.body.classList.add('light-theme');
  document.documentElement.classList.remove('light-theme-pending');
  window._currentTheme = theme;

  window._setTheme = function(t) {
    window._currentTheme = t;
    localStorage.setItem('ds_theme', t);
    document.body.classList.toggle('light-theme', t === 'light');
    const btn = document.getElementById('theme-toggle-btn');
    if (btn) btn.textContent = t === 'light' ? '🌙' : '☀️';
    const settingsToggle = document.getElementById('settings-theme-label');
    if (settingsToggle) settingsToggle.textContent = t === 'light' ? 'Switch to Dark' : 'Switch to Light';
    window._announce?.(`${t === 'light' ? 'Light' : 'Dark'} theme activated`);
  };

  window._toggleTheme = function() {
    window._setTheme(window._currentTheme === 'dark' ? 'light' : 'dark');
  };

  // Set initial topbar button icon (button may not exist yet if script runs before DOM)
  requestAnimationFrame(() => {
    const btn = document.getElementById('theme-toggle-btn');
    if (btn) btn.textContent = theme === 'light' ? '🌙' : '☀️';
  });

  // Respond to OS theme changes (only if user hasn't set a preference)
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem('ds_theme')) {
      window._setTheme(e.matches ? 'dark' : 'light');
    }
  });
})();

(function initLangSwitcher() {
  // Inject language switcher button into topbar after #theme-toggle-btn
  const themeBtn = document.getElementById('theme-toggle-btn');
  if (!themeBtn) return;
  const wrap = document.createElement('div');
  wrap.className = 'lang-switcher-wrap';
  wrap.style.cssText = 'position:relative;display:inline-block;';
  wrap.innerHTML = `
    <button id="lang-btn" class="icon-btn" title="Language" aria-label="Switch language" onclick="window._toggleLangMenu()">
      🌐 <span id="lang-btn-label">${getLocale().toUpperCase()}</span>
    </button>
    <div id="lang-menu" class="lang-menu" style="display:none;" role="menu">
      ${Object.entries(LOCALES).map(([code, name]) =>
        `<button class="lang-menu-item${getLocale()===code?' active':''}" role="menuitem" onclick="window._setLocale('${code}');window._closeLangMenu()">${name}</button>`
      ).join('')}
    </div>
  `;
  themeBtn.parentNode.insertBefore(wrap, themeBtn.nextSibling);

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

async function loadPublic()     { return (_modPublic    ??= await import('./pages-public.js')); }
async function loadPatient()    { return (_modPatient   ??= await import('./pages-patient.js')); }
async function loadClinical()   { return (_modClinical  ??= await import('./pages-clinical.js')); }
async function loadKnowledge()  { return (_modKnowledge ??= await import('./pages-knowledge.js')); }
async function loadPractice()   { return (_modPractice  ??= await import('./pages-practice.js')); }
async function loadCourses()    { return (_modCourses   ??= await import('./pages-courses.js')); }
async function loadOnboarding() { return (_modOnboarding ??= await import('./pages-onboarding.js')); }
async function loadAgents()     { return (_modAgents    ??= await import('./pages-agents.js')); }

// ── Helpers that delegate to the clinical module once loaded ──────────────────
// Called synchronously in navigate() before renderPage(); safe to no-op until
// the clinical module is first loaded.
function _setProStep(v) { _modClinical?.setProStep(v); }
function _setPtab(v)    { _modClinical?.setPtab(v); }

// ── Notification store ────────────────────────────────────────────────────────
const _notifs = [];  // { id, type, title, body, link, ts, read }
let _notifCount = 0;

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
};
window._closeSidebar = function() {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sidebar-overlay');
  if (sb) sb.classList.remove('mobile-open');
  if (ov) ov.classList.remove('visible');
};

// ── State ─────────────────────────────────────────────────────────────────────
let currentPage = 'dashboard';

// ── Role-based nav visibility ─────────────────────────────────────────────────
const ROLE_NAV_HIDE = {
  technician: ['protocol-wizard', 'patients', 'evidence', 'handbooks', 'billing', 'pricing', 'audittrail', 'brainregions', 'qeegmaps', 'protocols-registry', 'outcomes', 'adverse-events', 'population-analytics'],
  reviewer:   ['session-execution', 'protocol-wizard', 'billing', 'pricing', 'population-analytics'],
  guest:      ['session-execution', 'protocol-wizard', 'patients', 'courses', 'review-queue', 'braindata', 'assessments', 'outcomes', 'adverse-events', 'audittrail', 'billing', 'population-analytics'],
  clinician:  ['population-analytics'],
};

// ── Nav definition ────────────────────────────────────────────────────────────
const NAV = [
  { section: 'Operations' },
  { id: 'dashboard',         label: 'Dashboard',            icon: '◈' },
  { id: 'patients',          label: 'Patients',             icon: '◉' },
  { id: 'patient-profile',   label: 'Patient Profile',      icon: '👤' },
  { id: 'homework-builder',  label: 'Homework Builder',     icon: '📚' },
  { id: 'intake',            label: 'Intake & Consent',     icon: '📋' },
  { id: 'data-import',      label: 'Data Import',          icon: '📥' },
  { id: 'pt-outcomes',      label: 'My Outcomes',          icon: '📈' },
  { id: 'guardian-portal',  label: 'Guardian Portal',      icon: '👨‍👩‍👧' },
  { id: 'messaging',         label: 'Messaging',            icon: '💬' },
  { id: 'advanced-search',   label: 'Advanced Search',      icon: '🔍' },
  { id: 'courses',           label: 'Treatment Courses',    icon: '◎', badge: null },
  { id: 'session-execution', label: 'Session Execution',    icon: '◧' },
  { id: 'session-monitor',   label: 'Live Monitor',         icon: '📡' },
  { id: 'calendar',          label: 'Calendar',             icon: '📅' },
  { id: 'review-queue',      label: 'Review Queue',         icon: '◱', badge: null },
  { section: 'Protocol Intelligence' },
  { id: 'protocol-wizard',   label: 'Protocol Intelligence',icon: '⬡' },
  { id: 'protocol-builder',  label: 'Visual Builder',       icon: '⚡' },
  { id: 'decision-support', label: 'Decision Support',      icon: '🧬' },
  { id: 'benchmark-library', label: 'Benchmarks', icon: '📐' },
  { id: 'protocols-registry',label: 'Protocol Registry',   icon: '◇' },
  { id: 'outcomes',          label: 'Outcomes & Trends',    icon: '◫' },
  { id: 'outcome-prediction', label: 'Outcome Prediction', icon: '🔮' },
  { id: 'ai-assistant',      label: 'AI Clinical Assistant',icon: '✦', ai: true },
  { id: 'ai-agents',        label: 'AI Practice Agent',   icon: '◈', ai: true },
  { section: 'Brain Data & Assessment' },
  { id: 'braindata',         label: 'qEEG / Brain Data',    icon: '◈' },
  { id: 'qeegmaps',          label: 'qEEG Maps',            icon: '◫' },
  { id: 'assessments',       label: 'Assessments',          icon: '◉' },
  { id: 'forms-builder',     label: 'Forms & Assessments',  icon: '📝', section: 'clinical' },
  { section: 'Registries & Knowledge' },
  { id: 'evidence',          label: 'Evidence Library',     icon: '◉' },
  { id: 'devices',           label: 'Device Registry',      icon: '◇' },
  { id: 'brainregions',      label: 'Brain Regions',        icon: '◎' },
  { id: 'handbooks',         label: 'Handbooks',            icon: '◧' },
  { id: 'report-builder',    label: 'Report Builder',       icon: '📊' },
  { id: 'quality-assurance', label: 'Quality Assurance', icon: '✅' },
  { id: 'device-management', label: 'Devices', icon: '🔬' },
  { id: 'clinical-trials', label: 'Clinical Trials', icon: '🧪' },
  { id: 'staff-scheduling', label: 'Staff Scheduling', icon: '👥' },
  { id: 'clinic-analytics', label: 'Clinic Analytics', icon: '📊', section: 'knowledge' },
  { id: 'protocol-marketplace', label: 'Protocol Marketplace', icon: '🏪', section: 'knowledge' },
  { id: 'med-interactions',   label: 'Medication Safety',    icon: '💊', section: 'clinical' },
  { section: 'Governance' },
  { id: 'adverse-events',    label: 'Adverse Events',       icon: '⚠' },
  { id: 'audittrail',        label: 'Audit Trail',          icon: '◧' },
  { id: 'consent-automation', label: 'Consent & Compliance', icon: '📋', section: 'clinical' },
  { section: 'Practice' },
  { id: 'media-queue',       label: 'Media Queue',          icon: '📥' },
  { id: 'clinician-dictation', label: 'Dictate Note',       icon: '🎙' },
  { id: 'clinical-notes',    label: 'Clinical Notes',       icon: '📝' },
  { id: 'ai-note-assistant', label: 'AI Note Assistant',   icon: '✍️' },
  { id: 'population-analytics', label: 'Population Analytics', icon: '🌍' },
  { id: 'rules-engine', label: 'Rules & Alerts', icon: '⚙️' },
  { id: 'reports',           label: 'Reports',              icon: '📄' },
  { id: 'admin',             label: 'Admin Panel',          icon: '◈' },
  { id: 'multi-site',        label: 'Multi-Site Network',   icon: '🌐' },
  { id: 'permissions',       label: 'Permissions',          icon: '🔐' },
  { id: 'billing',           label: 'Billing',              icon: '💰' },
  { id: 'insurance',         label: 'Insurance',            icon: '🏥' },
  { id: 'referrals',         label: 'Referrals',            icon: '🔗' },
  { id: 'clinic-settings',   label: 'Clinic Settings',      icon: '🏥' },
  { id: 'settings',          label: 'Settings',             icon: '◎' },
  { id: 'wearables',         label: 'Wearables',            icon: '⌚' },
  { id: 'reminders',         label: 'Reminders & Adherence', icon: '🔔', section: 'practice' },
];

// ── Nav render ────────────────────────────────────────────────────────────────
function renderNav() {
  const _navList = document.getElementById('nav-list');
  if (!_navList) return;
  const hiddenForRole = ROLE_NAV_HIDE[currentUser?.role] || [];
  const patientBtn = `<div class="nav-item" onclick="window._previewPatientPortal()" style="margin-top:4px;border:1px solid var(--border-blue);color:var(--blue);opacity:0.85">
    <span class="nav-icon">◉</span>
    <span style="flex:1">Patient View</span>
    <span style="font-size:10px;opacity:0.6">demo</span>
  </div>`;
  _navList.innerHTML = NAV.map(n => {
    if (n.section) return `<div class="nav-section">${n.section}</div>`;
    // Admin panel only visible to admin role
    if (n.id === 'admin' && currentUser?.role !== 'admin') return '';
    // Hide nav items based on role permissions
    if (hiddenForRole.includes(n.id)) return '';
    const badge = n.badge
      ? (String(n.badge).startsWith('!')
          ? `<span class="nav-badge" style="background:rgba(255,107,107,0.2);color:var(--red);border-color:rgba(255,107,107,0.3)">${String(n.badge).slice(1)}</span>`
          : `<span class="nav-badge">${n.badge}</span>`)
      : n.ai ? `<span class="nav-badge-ai">AI</span>` : '';
    return `<div class="nav-item ${currentPage === n.id ? 'active' : ''}" onclick="window._nav('${n.id}')" role="menuitem" tabindex="0" aria-current="${currentPage === n.id ? 'page' : 'false'}">
      <span class="nav-icon" aria-hidden="true">${n.icon}</span>
      <span style="flex:1">${t('nav.' + n.id) || n.label}</span>${badge}
    </div>`;
  }).join('') + patientBtn;
}

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
  'session-execution': 'Session Execution', 'review-queue': 'Review Queue',
  'protocol-wizard': 'Protocol Intelligence', 'protocols-registry': 'Protocol Registry',
  outcomes: 'Outcomes and Trends', 'ai-assistant': 'AI Clinical Assistant', 'ai-agents': 'AI Practice Agent',
  braindata: 'qEEG / Brain Data', qeegmaps: 'qEEG Maps', assessments: 'Assessments',
  evidence: 'Evidence Library', devices: 'Device Registry', brainregions: 'Brain Regions',
  handbooks: 'Handbooks', 'report-builder': 'Report Builder & Exports', 'adverse-events': 'Adverse Events', audittrail: 'Audit Trail',
  'quality-assurance': 'Quality Assurance & Peer Review',
  'device-management': 'Device & Equipment Management',
  'clinical-trials': 'Clinical Trial Management',
  'staff-scheduling': 'Staff Scheduling & Shifts',
  reports: 'Reports', admin: 'Admin Panel', 'clinic-settings': 'Clinic Settings & Branding', settings: 'Settings',
  permissions: 'Permissions & Security Admin',
  calendar: 'Schedule & Calendar',
  scheduling: 'Scheduling', telehealth: 'Telehealth', 'telehealth-recorder': 'Telehealth Session Recorder', messaging: 'Messaging',
  billing: 'Billing & Superbills', pricing: 'Pricing', onboarding: 'Onboarding',
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
  'pt-outcomes': 'My Outcomes',
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
  'clinic-analytics': 'Clinic Analytics',
  'consent-automation': 'Consent & Compliance',
  'multi-site': 'Multi-Site Network',
  'forms-builder': 'Forms & Assessments',
  'med-interactions': 'Medication Safety',
  'protocol-marketplace': 'Protocol Marketplace',
  'reminders': 'Reminders & Adherence',
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
  _setProStep(0);
  if (id !== 'profile') _setPtab('courses');
  if (id !== 'protocol-wizard') window._wizardProtocolId = null;
  if (id !== 'course-detail') window._cdTab = 'overview';
  renderNav();
  initSidebarKeyboard();
  announce(`Navigated to ${PAGE_TITLES[id] || id}`);
  loadingStart();
  const contentEl = document.getElementById('content');
  if (contentEl) contentEl.innerHTML = '<div class="page-loading">Loading…</div>';
  try {
    await renderPage();
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

window._nav = navigate;

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
  const m = await loadPatient();
  m.renderPatientNav(currentPatientPage);
  switch (currentPatientPage) {
    case 'patient-portal':      await m.pgPatientDashboard(currentUser);  break;
    case 'patient-sessions':    await m.pgPatientSessions();              break;
    case 'patient-course':      await m.pgPatientCourse();                break;
    case 'patient-assessments': m.pgPatientAssessments();                 break;
    case 'patient-reports':     m.pgPatientReports();                     break;
    case 'patient-messages':    m.pgPatientMessages();                    break;
    case 'patient-wearables':   await m.pgPatientWearables();            break;
    case 'patient-profile':     m.pgPatientProfile(currentUser);          break;
    case 'pt-wellness':         await m.pgPatientWellness();              break;
    case 'pt-learn':            await m.pgPatientLearn();                 break;
    case 'pt-journal':          await m.pgSymptomJournal(m.setTopbar);   break;
    case 'pt-notifications':    await m.pgPatientNotificationSettings(m.setTopbar); break;
    case 'pt-media-consent':    await m.pgPatientMediaConsent();         break;
    case 'pt-media-upload':     await m.pgPatientMediaUpload();          break;
    case 'pt-media-history':     await m.pgPatientMediaHistory();                break;
    case 'pt-outcomes':          await m.pgPatientOutcomePortal(m.setTopbar);   break;
    case 'pt-home-device':       await m.pgPatientHomeDevice();                 break;
    case 'pt-home-session-log':  await m.pgPatientHomeSessionLog();             break;
    case 'pt-adherence-events':  await m.pgPatientAdherenceEvents();            break;
    case 'pt-adherence-history': await m.pgPatientAdherenceHistory();           break;
    default:                     await m.pgPatientDashboard(currentUser);
  }
}

function navigatePatient(id) {
  currentPatientPage = id;
  window._currentPatientPage = id; // expose for swipe gesture handlers
  renderPatientPage();
}
window._navPatient  = navigatePatient;
window._bootPatient = function() {
  currentPatientPage = 'patient-portal';
  window._currentPatientPage = 'patient-portal';
  _injectPatientLangPicker();
  renderPatientPage();
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

  switch (currentPage) {
    // ── Clinical ─────────────────────────────────────────────────────────
    case 'dashboard': {
      const m = await loadClinical();
      await m.pgDash(setTopbar, navigate);
      break;
    }
    case 'patients': {
      const m = await loadClinical();
      await m.pgPatients(setTopbar, navigate);
      break;
    }
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
    case 'courses': {
      const m = await loadCourses();
      await m.pgCourses(setTopbar, navigate);
      break;
    }
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
    case 'review-queue': {
      const m = await loadCourses();
      await m.pgReviewQueue(setTopbar, navigate);
      break;
    }
    case 'calendar': { const m = await loadCourses(); await m.pgCalendar(setTopbar); break; }
    // ── Protocol Intelligence ────────────────────────────────────────────
    case 'protocol-wizard':
    case 'protocols': {
      const m = await loadClinical();
      await m.pgProtocols(setTopbar);
      m.bindProtoPage();
      break;
    }
    case 'protocol-builder': {
      const m = await loadClinical();
      await m.pgProtocolBuilder(setTopbar);
      break;
    }
    case 'decision-support': {
      const m = await loadClinical();
      await m.pgDecisionSupport(setTopbar);
      break;
    }
    case 'benchmark-library': { const m = await loadClinical(); await m.pgBenchmarkLibrary(setTopbar); break; }
    case 'outcomes': {
      const m = await loadCourses();
      await m.pgOutcomes(setTopbar, navigate);
      break;
    }
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
    case 'protocols-registry': {
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
    case 'handbooks': {
      const m = await loadKnowledge();
      el.innerHTML = m.pgHandbooks(setTopbar);
      m.bindHandbooks();
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
    case 'staff-scheduling': { const m = await loadKnowledge(); await m.pgStaffScheduling(setTopbar); break; }
    case 'clinic-analytics': { const m = await loadKnowledge(); await m.pgClinicAnalytics(setTopbar); break; }
    case 'protocol-marketplace': { const { pgProtocolMarketplace } = await loadKnowledge(); await pgProtocolMarketplace(setTopbar); break; }
    // ── Legacy pages (kept functional) ───────────────────────────────────
    case 'assessments': {
      const m = await loadClinical();
      await m.pgAssess(setTopbar);
      break;
    }
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
    case 'scheduling': {
      const m = await loadPractice();
      el.innerHTML = m.pgSchedule(setTopbar);
      break;
    }
    case 'telehealth': {
      const m = await loadPractice();
      m.pgTelehealth(setTopbar);
      break;
    }
    case 'telehealth-recorder': { const m = await loadPractice(); await m.pgTelehealthRecorder(setTopbar); break; }
    case 'wearables': { const m = await loadPractice(); await m.pgWearableIntegration(setTopbar); break; }
    case 'messaging': {
      const m = await loadClinical();
      await m.pgMessaging(setTopbar);
      break;
    }
    case 'advanced-search': { const m = await loadClinical(); await m.pgAdvancedSearch(setTopbar); break; }
    case 'programs': {
      const m = await loadPractice();
      m.pgPrograms(setTopbar);
      break;
    }
    case 'billing': {
      const m = await loadPractice();
      await m.pgBilling(setTopbar);
      break;
    }
    case 'insurance': { const m = await loadPractice(); await m.pgInsuranceVerification(setTopbar); break; }
    case 'referrals': { const m = await loadPractice(); await m.pgReferrals(setTopbar); break; }
    case 'reports': {
      const m = await loadCourses();
      await m.pgClinicalReports(setTopbar);
      break;
    }
    case 'media-queue': { const m = await loadClinical(); await m.pgMediaReviewQueue(setTopbar); break; }
    case 'media-detail': { const m = await loadClinical(); await m.pgMediaDetail(setTopbar); break; }
    case 'clinician-dictation': { const m = await loadClinical(); await m.pgClinicianDictation(setTopbar); break; }
    case 'clinician-draft-review': { const m = await loadClinical(); await m.pgClinicianDraftReview(setTopbar); break; }
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
    case 'adverse-events': {
      const m = await loadCourses();
      await m.pgAdverseEvents(setTopbar, navigate);
      break;
    }
    case 'audittrail': {
      const m = await loadKnowledge();
      await m.pgAuditTrail(setTopbar);
      break;
    }
    case 'consent-automation': { const { pgConsentAutomation } = await loadClinical(); await pgConsentAutomation(setTopbar); break; }
    case 'forms-builder': { const { pgFormsBuilder } = await loadClinical(); await pgFormsBuilder(setTopbar); break; }
    case 'med-interactions': { const { pgMedInteractionChecker } = await loadClinical(); await pgMedInteractionChecker(setTopbar); break; }
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
    case 'reminders': { const { pgReminderAutomation } = await loadPractice(); await pgReminderAutomation(setTopbar); break; }
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
  t.innerHTML = `<div style="font-size:12.5px;font-weight:600;color:var(--text-primary);margin-bottom:3px">${notif.title}</div><div style="font-size:11.5px;color:var(--text-secondary)">${notif.body}</div>`;
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
                  <div style="font-size:12.5px;font-weight:600;color:var(--text-primary)">${n.title}</div>
                  <div style="font-size:11.5px;color:var(--text-secondary);margin-top:2px;line-height:1.4">${n.body}</div>
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

// ── Boot after login ──────────────────────────────────────────────────────────
async function bootApp() {
  // First-time onboarding: route non-patient users who haven't completed onboarding
  if (!localStorage.getItem('ds_onboarding_done') && currentUser && currentUser.role !== 'patient') {
    currentPage = 'onboarding';
  } else if (currentPage === 'dashboard') {
    // Role-based entry: redirect technician → session-execution, reviewer → review-queue, etc.
    const role  = currentUser?.role || 'clinician';
    const entry = ROLE_ENTRY_PAGE[role];
    if (entry && entry !== 'dashboard') currentPage = entry;
  }
  // Initialise clinic switcher for multi-clinic roles
  window._initClinicSwitcher(currentUser);
  renderNav();
  initSidebarKeyboard();
  await renderPage();
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
  // Check backend health (non-blocking)
  checkBackendHealth();
  // Re-check every 30s if the backend banner is visible
  setInterval(() => {
    if (document.getElementById('backend-banner')) checkBackendHealth();
  }, 30000);
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
    if (!user) { api.clearToken(); navigatePublic('home'); return; }
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

// ── Command Palette ──────────────────────────────────────────────────────────
(function initCommandPalette() {
  // Static nav commands — always available
  const NAV_COMMANDS = [
    { type: 'nav', icon: '🏠', title: 'Dashboard',            page: 'dashboard',        shortcut: 'Alt+D' },
    { type: 'nav', icon: '👥', title: 'Patients',             page: 'patients',         shortcut: 'Alt+P' },
    { type: 'nav', icon: '📋', title: 'Treatment Courses',    page: 'courses',          shortcut: 'Alt+C' },
    { type: 'nav', icon: '🧠', title: 'Protocol Intelligence', page: 'protocol-wizard' },
    { type: 'nav', icon: '◇',  title: 'Protocol Registry',   page: 'protocols-registry' },
    { type: 'nav', icon: '📊', title: 'Outcomes & Trends',    page: 'outcomes' },
    { type: 'nav', icon: '⚠️', title: 'Review Queue',         page: 'review-queue',     shortcut: 'Alt+R' },
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
    { type: 'nav', icon: '👑', title: 'Admin Panel',         page: 'admin' },
    { type: 'nav', icon: '◎',  title: 'Brain Regions',       page: 'brainregions' },
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
    if (!query || !text) return text || '';
    const q = query.toLowerCase();
    const t = text.toLowerCase();
    const idx = t.indexOf(q);
    if (idx >= 0) {
      return text.slice(0, idx) + `<span class="cmd-match">${text.slice(idx, idx + q.length)}</span>` + text.slice(idx + q.length);
    }
    return text;
  }

  async function _loadData() {
    if (!_cachedPatients) {
      try { _cachedPatients = (await api.listPatients()) || []; } catch { _cachedPatients = []; }
    }
    if (!_cachedCourses) {
      try {
        const result = await api.listCourses();
        _cachedCourses = result?.items || result || [];
      } catch { _cachedCourses = []; }
    }
    if (!_cachedProtocols) {
      try { _cachedProtocols = (await api.protocols()) || []; } catch { _cachedProtocols = []; }
    }
  }

  window._openPalette = function() {
    const overlay = document.getElementById('cmd-palette');
    if (!overlay) return;
    _paletteOpen = true;
    overlay.style.display = 'flex';
    const input = document.getElementById('cmd-palette-input');
    input.value = '';
    setTimeout(() => input.focus(), 50);

    // Show recent pages as a "Recent" group when palette opens
    const recents = (window._recentPages || []).map(page => {
      const cmd = NAV_COMMANDS.find(c => c.page === page);
      return cmd ? { ...cmd, type: 'recent' } : null;
    }).filter(Boolean);
    const defaultItems = recents.length
      ? [...recents.slice(0, 3), ...NAV_COMMANDS.slice(0, 5)]
      : NAV_COMMANDS.slice(0, 8);
    _renderResults('', defaultItems.slice(0, 8));

    _loadData(); // Warm cache in background
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
      const recents = (window._recentPages || []).map(page => {
        const cmd = NAV_COMMANDS.find(c => c.page === page);
        return cmd ? { ...cmd, type: 'recent' } : null;
      }).filter(Boolean);
      const defaultItems = recents.length
        ? [...recents.slice(0, 3), ...NAV_COMMANDS.slice(0, 5)]
        : NAV_COMMANDS.slice(0, 8);
      _renderResults('', defaultItems.slice(0, 8));
      return;
    }
    const q = query.trim();
    await _loadData();

    const scored = [];

    // Nav commands
    NAV_COMMANDS.forEach(cmd => {
      const score = _fuzzy(q, cmd.title);
      if (score > 0) scored.push({ ...cmd, _score: score });
    });

    // Patients
    (_cachedPatients || []).forEach(p => {
      const name = `${p.first_name || ''} ${p.last_name || ''}`.trim();
      const score = Math.max(_fuzzy(q, name), _fuzzy(q, p.primary_condition || ''));
      if (score > 0) scored.push({ type: 'patient', icon: '👤', title: name, subtitle: p.primary_condition || 'Patient', id: p.id, _score: score });
    });

    // Courses
    (_cachedCourses || []).forEach(c => {
      const score = Math.max(_fuzzy(q, c.title || c.name || ''), _fuzzy(q, c.condition || ''));
      if (score > 0) scored.push({ type: 'course', icon: '📋', title: c.title || c.name || `Course #${c.id}`, subtitle: c.condition || '', id: c.id, _score: score });
    });

    // Protocols
    (_cachedProtocols || []).forEach(p => {
      const score = Math.max(_fuzzy(q, p.name || p.title || ''), _fuzzy(q, p.condition || ''));
      if (score > 0) scored.push({ type: 'protocol', icon: '🧠', title: p.name || p.title || `Protocol #${p.id}`, subtitle: p.condition || p.modality || '', id: p.id, _score: score });
    });

    // Deep search results from localStorage (patients, notes)
    try {
      const patients = JSON.parse(localStorage.getItem('ds_patients') || '[]');
      patients.slice(0, 20).forEach(p => {
        if (p.name?.toLowerCase().includes(q)) {
          scored.push({ type: 'patient', icon: '👤', title: p.name, subtitle: 'Patient · ' + (p.condition || ''), id: p.id, _score: 60, action: () => { window._profilePatientId = p.id; window._nav('patient-profile'); } });
        }
      });
    } catch(e) {}

    scored.sort((a, b) => b._score - a._score);
    _renderResults(q, scored.slice(0, 12));
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

    const groupLabels = { nav: 'Navigation', recent: 'Recent', patient: 'Patients', course: 'Courses', protocol: 'Protocols', knowledge: 'Knowledge' };
    let html = '';
    Object.entries(groups).forEach(([type, groupItems]) => {
      html += `<div class="cmd-group-label">${groupLabels[type] || type}</div>`;
      groupItems.forEach(item => {
        const active = item._i === _activeIndex ? ' active' : '';
        html += `<div class="cmd-item${active}" data-idx="${item._i}" onclick="window._paletteSelect(${item._i})">
          <div class="cmd-item-icon ${item.type || 'nav'}">${item.icon}</div>
          <div class="cmd-item-body">
            <div class="cmd-item-title">${query ? _highlight(query, item.title) : item.title}</div>
            ${item.subtitle ? `<div class="cmd-item-subtitle">${item.subtitle}</div>` : ''}
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
