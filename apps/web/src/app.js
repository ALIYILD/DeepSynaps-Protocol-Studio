import { api } from './api.js';
import { currentUser, setCurrentUser, updateUserBar, showApp, showLogin, doLogout } from './auth.js';
import { ROLE_ENTRY_PAGE } from './constants.js';
import {
  pgDash, pgPatients, pgProfile, pgProtocols, pgAssess, pgChart, pgBrainData,
  bindProtoPage, bindBrainData, ptab, eegBand, proStep, setProStep, setPtab,
} from './pages-clinical.js';
import {
  pgEvidence, pgDevices, pgBrainRegions, pgQEEGMaps, pgHandbooks,
  pgAuditTrail, pgPricing, bindHandbooks,
} from './pages-knowledge.js';
import {
  pgSchedule, pgTelehealth, pgMsg, pgPrograms, pgBilling, pgReports, pgSettings,
  pgAIAssistant,
} from './pages-practice.js';
import {
  pgCourses, pgSessionExecution, pgReviewQueue, pgOutcomes, pgProtocolRegistry,
  pgCourseDetail, pgAdverseEvents,
} from './pages-courses.js';

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

// ── Nav definition ────────────────────────────────────────────────────────────
const NAV = [
  { section: 'Operations' },
  { id: 'dashboard',         label: 'Dashboard',            icon: '◈' },
  { id: 'patients',          label: 'Patients',             icon: '◉' },
  { id: 'courses',           label: 'Treatment Courses',    icon: '◎', badge: null },
  { id: 'session-execution', label: 'Session Execution',    icon: '◧' },
  { id: 'review-queue',      label: 'Review Queue',         icon: '◱', badge: null },
  { section: 'Protocol Intelligence' },
  { id: 'protocol-wizard',   label: 'Protocol Intelligence',icon: '⬡' },
  { id: 'protocols-registry',label: 'Protocol Registry',   icon: '◇' },
  { id: 'outcomes',          label: 'Outcomes & Trends',    icon: '◫' },
  { id: 'ai-assistant',      label: 'AI Clinical Assistant',icon: '✦', ai: true },
  { section: 'Brain Data & Assessment' },
  { id: 'braindata',         label: 'qEEG / Brain Data',    icon: '◈' },
  { id: 'qeegmaps',          label: 'qEEG Maps',            icon: '◫' },
  { id: 'assessments',       label: 'Assessments',          icon: '◉' },
  { section: 'Registries & Knowledge' },
  { id: 'evidence',          label: 'Evidence Library',     icon: '◉' },
  { id: 'devices',           label: 'Device Registry',      icon: '◇' },
  { id: 'brainregions',      label: 'Brain Regions',        icon: '◎' },
  { id: 'handbooks',         label: 'Handbooks',            icon: '◧' },
  { section: 'Governance' },
  { id: 'adverse-events',    label: 'Adverse Events',       icon: '⚠' },
  { id: 'audittrail',        label: 'Audit Trail',          icon: '◧' },
  { id: 'settings',          label: 'Settings',             icon: '◎' },
];

// ── Nav render ────────────────────────────────────────────────────────────────
function renderNav() {
  document.getElementById('nav-list').innerHTML = NAV.map(n => {
    if (n.section) return `<div class="nav-section">${n.section}</div>`;
    const badge = n.badge ? `<span class="nav-badge">${n.badge}</span>` : n.ai ? `<span class="nav-badge-ai">AI</span>` : '';
    return `<div class="nav-item ${currentPage === n.id ? 'active' : ''}" onclick="window._nav('${n.id}')">
      <span class="nav-icon">${n.icon}</span>
      <span style="flex:1">${n.label}</span>${badge}
    </div>`;
  }).join('');
}

// ── Topbar helper ─────────────────────────────────────────────────────────────
function setTopbar(title, html = '') {
  document.getElementById('page-title').textContent = title;
  document.getElementById('topbar-actions').innerHTML = html;
}

// ── Navigate ──────────────────────────────────────────────────────────────────
async function navigate(id) {
  currentPage = id;
  setProStep(0);
  if (id !== 'profile') setPtab('courses');
  if (id !== 'protocol-wizard') window._wizardProtocolId = null;
  if (id !== 'course-detail') window._cdTab = 'overview';
  renderNav();
  await renderPage();
}

window._nav = navigate;

// Global course opener — used from courses list, patient profile, AE table, dashboard
window._openCourse = function(id) {
  window._selectedCourseId = id;
  navigate('course-detail');
};

// ── Page dispatcher ───────────────────────────────────────────────────────────
async function renderPage() {
  const el = document.getElementById('content');
  el.scrollTop = 0;

  // currentUser is a live binding from the static import at top

  switch (currentPage) {
    case 'dashboard':
      await pgDash(setTopbar, navigate);
      break;
    case 'patients':
      await pgPatients(setTopbar, navigate);
      break;
    case 'profile':
      await pgProfile(setTopbar, navigate);
      break;
    // ── New clinical workflow pages ──────────────────────────────────────
    case 'courses':
      await pgCourses(setTopbar, navigate);
      break;
    case 'course-detail':
      window._cdTab = window._cdTab || 'overview';
      await pgCourseDetail(setTopbar, navigate);
      break;
    case 'session-execution':
      await pgSessionExecution(setTopbar, navigate);
      break;
    case 'review-queue':
      await pgReviewQueue(setTopbar, navigate);
      break;
    // ── Protocol Intelligence ────────────────────────────────────────────
    case 'protocol-wizard':
    case 'protocols':
      el.innerHTML = pgProtocols(setTopbar);
      bindProtoPage();
      break;
    case 'outcomes':
      await pgOutcomes(setTopbar, navigate);
      break;
    case 'braindata':
      await pgBrainData(setTopbar);
      break;
    // ── Knowledge Registries ─────────────────────────────────────────────
    case 'evidence':
      await pgEvidence(setTopbar);
      break;
    case 'protocols-registry':
      await pgProtocolRegistry(setTopbar);
      break;
    case 'devices':
      await pgDevices(setTopbar);
      break;
    case 'brainregions':
      await pgBrainRegions(setTopbar);
      break;
    case 'qeegmaps':
      await pgQEEGMaps(setTopbar);
      break;
    case 'handbooks':
      el.innerHTML = pgHandbooks(setTopbar);
      bindHandbooks();
      break;
    // ── Legacy pages (kept functional) ───────────────────────────────────
    case 'assessments':
      await pgAssess(setTopbar);
      break;
    // ── Deprioritised scaffolds (kept functional, not in primary nav) ────
    case 'charting':
      el.innerHTML = pgChart(setTopbar);
      break;
    case 'ai-assistant':
      await pgAIAssistant(setTopbar, navigate);
      break;
    case 'scheduling':
      el.innerHTML = pgSchedule(setTopbar);
      break;
    case 'telehealth':
      el.innerHTML = pgTelehealth(setTopbar);
      break;
    case 'messaging':
      el.innerHTML = pgMsg(setTopbar);
      break;
    case 'programs':
      el.innerHTML = pgPrograms(setTopbar);
      break;
    case 'billing':
      el.innerHTML = pgBilling(setTopbar);
      break;
    case 'reports':
      await pgReports(setTopbar);
      break;
    case 'pricing':
      await pgPricing(setTopbar);
      break;
    // ── Governance ───────────────────────────────────────────────────────
    case 'adverse-events':
      await pgAdverseEvents(setTopbar, navigate);
      break;
    case 'audittrail':
      await pgAuditTrail(setTopbar);
      break;
    case 'settings':
      await pgSettings(setTopbar, currentUser);
      break;
    default:
      el.innerHTML = `<div style="text-align:center;padding:48px;color:var(--text-tertiary)">Page not found.</div>`;
  }
}

// ── Boot after login ──────────────────────────────────────────────────────────
async function bootApp() {
  // Role-based entry: redirect technician → session-execution, reviewer → review-queue, etc.
  if (currentPage === 'dashboard') {
    const role  = currentUser?.role || 'clinician';
    const entry = ROLE_ENTRY_PAGE[role];
    if (entry && entry !== 'dashboard') currentPage = entry;
  }
  renderNav();
  await renderPage();
}

window._bootApp = bootApp;

// ── Initial boot ──────────────────────────────────────────────────────────────
async function init() {
  const token = api.getToken();
  if (!token) {
    showLogin();
    return;
  }
  try {
    const user = await api.me();
    if (!user) { api.clearToken(); showLogin(); return; }
    setCurrentUser(user);
    showApp();
    updateUserBar();
    await bootApp();
  } catch {
    api.clearToken();
    showLogin();
  }
}

init();
