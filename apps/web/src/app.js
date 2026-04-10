import { api } from './api.js';
import { currentUser, setCurrentUser, updateUserBar, showApp, showLogin, doLogout } from './auth.js';
import {
  pgDash, pgPatients, pgProfile, pgProtocols, pgAssess, pgChart, pgBrainData,
  bindProtoPage, bindBrainData, ptab, eegBand, proStep, setProStep,
} from './pages-clinical.js';
import {
  pgEvidence, pgDevices, pgBrainRegions, pgQEEGMaps, pgHandbooks,
  pgAuditTrail, pgPricing, bindHandbooks,
} from './pages-knowledge.js';
import {
  pgSchedule, pgTelehealth, pgMsg, pgPrograms, pgBilling, pgReports, pgSettings,
} from './pages-practice.js';

// ── State ─────────────────────────────────────────────────────────────────────
let currentPage = 'dashboard';

// ── Nav definition ────────────────────────────────────────────────────────────
const NAV = [
  { section: 'Overview' },
  { id: 'dashboard', label: 'Dashboard', icon: '◈' },
  { section: 'Clinical' },
  { id: 'patients', label: 'Patients', icon: '◉' },
  { id: 'profile', label: 'Patient Profile', icon: '◎' },
  { id: 'protocols', label: 'Protocol Generator', icon: '⬡', ai: true },
  { id: 'assessments', label: 'Assessments', icon: '◧' },
  { id: 'charting', label: 'AI Charting', icon: '◫', ai: true },
  { id: 'braindata', label: 'Brain Data Vault', icon: '◈' },
  { section: 'Knowledge Base' },
  { id: 'evidence', label: 'Evidence Library', icon: '◉' },
  { id: 'devices', label: 'Device Registry', icon: '◇' },
  { id: 'brainregions', label: 'Brain Regions', icon: '◎' },
  { id: 'qeegmaps', label: 'qEEG Maps', icon: '◫' },
  { id: 'handbooks', label: 'Handbooks', icon: '◧' },
  { section: 'Practice' },
  { id: 'scheduling', label: 'Scheduling', icon: '◻' },
  { id: 'telehealth', label: 'Telehealth', icon: '◯' },
  { id: 'messaging', label: 'Messaging', icon: '◱' },
  { id: 'programs', label: 'Programs', icon: '◩' },
  { section: 'Finance' },
  { id: 'billing', label: 'Billing', icon: '◇' },
  { id: 'reports', label: 'Reports', icon: '◈' },
  { section: 'Admin' },
  { id: 'audittrail', label: 'Audit Trail', icon: '◧' },
  { id: 'pricing', label: 'Plans & Pricing', icon: '◇' },
  { id: 'settings', label: 'Settings', icon: '◎' },
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
  renderNav();
  await renderPage();
}

window._nav = navigate;

// ── Page dispatcher ───────────────────────────────────────────────────────────
async function renderPage() {
  const el = document.getElementById('content');
  el.scrollTop = 0;

  // currentUser is a live binding from the static import at top

  switch (currentPage) {
    case 'dashboard': {
      const html = await pgDash(setTopbar, navigate);
      if (html) el.innerHTML = html;
      break;
    }
    case 'patients':
      await pgPatients(setTopbar, navigate);
      break;
    case 'profile':
      await pgProfile(setTopbar, navigate);
      break;
    case 'protocols':
      el.innerHTML = pgProtocols(setTopbar);
      bindProtoPage();
      break;
    case 'assessments':
      await pgAssess(setTopbar);
      break;
    case 'charting':
      el.innerHTML = pgChart(setTopbar);
      break;
    case 'braindata':
      el.innerHTML = pgBrainData(setTopbar);
      bindBrainData();
      break;
    case 'evidence':
      await pgEvidence(setTopbar);
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
      el.innerHTML = pgReports(setTopbar);
      break;
    case 'audittrail':
      await pgAuditTrail(setTopbar);
      break;
    case 'pricing':
      await pgPricing(setTopbar);
      break;
    case 'settings':
      el.innerHTML = pgSettings(setTopbar, currentUser);
      break;
    default:
      el.innerHTML = `<div style="text-align:center;padding:48px;color:var(--text-tertiary)">Page not found.</div>`;
  }
}

// ── Boot after login ──────────────────────────────────────────────────────────
async function bootApp() {
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
