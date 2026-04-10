import { api } from './api.js';
import { currentUser, setCurrentUser, updateUserBar, updatePatientBar, showApp, showPublic, showPatient, showLogin } from './auth.js';
import { pgHome, pgSignupProfessional, pgSignupPatient } from './pages-public.js';
import {
  renderPatientNav,
  pgPatientDashboard, pgPatientSessions, pgPatientCourse,
  pgPatientAssessments, pgPatientReports, pgPatientMessages, pgPatientProfile,
} from './pages-patient.js';
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

// ── Global error handlers ─────────────────────────────────────────────────────
window.addEventListener('unhandledrejection', (e) => {
  console.error('[DeepSynaps] Unhandled promise rejection:', e.reason);
});
window.addEventListener('error', (e) => {
  console.error('[DeepSynaps] Uncaught error:', e.message, e.filename, e.lineno);
});

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
    const badge = n.badge
      ? (String(n.badge).startsWith('!')
          ? `<span class="nav-badge" style="background:rgba(255,107,107,0.2);color:var(--red);border-color:rgba(255,107,107,0.3)">${String(n.badge).slice(1)}</span>`
          : `<span class="nav-badge">${n.badge}</span>`)
      : n.ai ? `<span class="nav-badge-ai">AI</span>` : '';
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

// ── Navigate ──────────────────────────────────────────────────────────────────
async function navigate(id) {
  window._closeSidebar();
  currentPage = id;
  setProStep(0);
  if (id !== 'profile') setPtab('courses');
  if (id !== 'protocol-wizard') window._wizardProtocolId = null;
  if (id !== 'course-detail') window._cdTab = 'overview';
  renderNav();
  loadingStart();
  try {
    await renderPage();
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

function renderPublicPage() {
  switch (currentPublicPage) {
    case 'home':               pgHome(); break;
    case 'signup-professional': pgSignupProfessional(); break;
    case 'signup-patient':     pgSignupPatient(); break;
    default:                   pgHome();
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

function renderPatientPage() {
  renderPatientNav(currentPatientPage);
  switch (currentPatientPage) {
    case 'patient-portal':      pgPatientDashboard(currentUser);  break;
    case 'patient-sessions':    pgPatientSessions();              break;
    case 'patient-course':      pgPatientCourse();                break;
    case 'patient-assessments': pgPatientAssessments();           break;
    case 'patient-reports':     pgPatientReports();               break;
    case 'patient-messages':    pgPatientMessages();              break;
    case 'patient-profile':     pgPatientProfile(currentUser);    break;
    default:                    pgPatientDashboard(currentUser);
  }
}

function navigatePatient(id) {
  currentPatientPage = id;
  renderPatientPage();
}
window._navPatient  = navigatePatient;
window._bootPatient = function() {
  currentPatientPage = 'patient-portal';
  renderPatientPage();
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
      pgPrograms(setTopbar);
      break;
    case 'billing':
      await pgBilling(setTopbar);
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

// ── Nav badge update ─────────────────────────────────────────────────────────
async function refreshNavBadges() {
  try {
    const [queueData, coursesData, aeData] = await Promise.all([
      api.listReviewQueue().catch(() => null),
      api.listCourses().catch(() => null),
      api.listAdverseEvents().catch(() => null),
    ]);
    const pendingReview  = (queueData?.items || []).filter(i => i.status === 'pending').length;
    const pendingApproval = (coursesData?.items || []).filter(c => c.status === 'pending_approval').length;
    const seriousAE      = (aeData?.items || []).filter(ae => ae.severity === 'serious').length;

    NAV.forEach(n => {
      if (n.id === 'review-queue')  n.badge = pendingReview > 0 ? pendingReview : null;
      if (n.id === 'courses')       n.badge = pendingApproval > 0 ? pendingApproval : null;
      if (n.id === 'adverse-events') n.badge = seriousAE > 0 ? `!${seriousAE}` : null;
    });
    renderNav();
  } catch (_) { /* badge refresh is best-effort */ }
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
  // Refresh nav badges after page loads (don't block render)
  refreshNavBadges();
  // Refresh badges every 3 minutes while app is open
  setInterval(refreshNavBadges, 3 * 60 * 1000);
}

window._bootApp = bootApp;

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
