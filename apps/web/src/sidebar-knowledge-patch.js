// =============================================================================
// sidebar-patch.js
// DeepSynaps Protocol Studio — Sidebar Navigation Patch
// Adds Knowledge Explorer, Brain Twin, and Evidence Store under INTELLIGENCE
// Phase 6/7/8
// =============================================================================
//
// INSTRUCTIONS:
// 1. Locate your existing NAV array / sidebar configuration
// 2. Insert the new section + items shown below in the desired position
// 3. Add the SVG icon strings to your NAV_ICONS map (if your sidebar uses icons)
// 4. Update ROLE_NAV_HIDE if you need role-based gating for these new routes
//
// =============================================================================

// ── STEP 1:  Add these icons to your existing NAV_ICONS object ──────────────

const NAV_ICONS_PATCH = {
  'knowledge-explorer': `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="11" cy="11" r="8"/>
      <path d="m21 21-4.35-4.35"/>
      <path d="M11 8v6"/>
      <path d="M8 11h6"/>
    </svg>`,
  'brain-twin': `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/>
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/>
    </svg>`,
  'evidence-store': `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>
      <path d="M8 7h6"/>
      <path d="M8 11h8"/>
      <path d="M8 15h5"/>
    </svg>`,
};

// ── STEP 2:  Merge into your existing NAV_ICONS ─────────────────────────────
//
//   Object.assign(NAV_ICONS, NAV_ICONS_PATCH);
//

// ── STEP 3:  Insert this block into your existing NAV array ───────────────────
//              Position recommendation: after the "Protocol" section,
//              before or within the "Brain & Imaging" analyser section.

const INTELLIGENCE_NAV_PATCH = [
  // ── INTELLIGENCE ─────────────────────────────────────────────────────────
  {
    section: 'Intelligence',
    sectionId: 'intelligence',
    collapsed: false,
  },
  {
    id: 'knowledge-explorer',
    label: 'Knowledge Explorer',
    icon: NAV_ICONS_PATCH['knowledge-explorer'],
    ai: true,                 // shows the AI sparkle badge
    badge: null,              // set dynamically from getStats().total_adapters
  },
  {
    id: 'brain-twin',
    label: 'Brain Twin',
    icon: NAV_ICONS_PATCH['brain-twin'],
    ai: true,
    badge: null,
  },
  {
    id: 'evidence-store',
    label: 'Evidence Store',
    icon: NAV_ICONS_PATCH['evidence-store'],
    ai: false,
    badge: null,              // set dynamically from evidence stats
  },
];

/*
  // Example: splice into NAV at index 15 (after Protocol section)
  NAV.splice(15, 0, ...INTELLIGENCE_NAV_PATCH);
*/

// ── STEP 4:  Role-based visibility (update ROLE_NAV_HIDE if needed) ────────

const ROLE_NAV_HIDE_PATCH = {
  // Patients and guests should not see deep clinical intelligence tools
  patient: ['knowledge-explorer', 'brain-twin', 'evidence-store'],
  guest:   ['knowledge-explorer', 'brain-twin', 'evidence-store'],

  // Technicians get read-only knowledge explorer, no brain twin
  technician: ['brain-twin'],

  // Reviewers see everything
  // Clinicians see everything
  // Admin sees everything
};

/*
  // Merge into existing ROLE_NAV_HIDE
  Object.keys(ROLE_NAV_HIDE_PATCH).forEach(role => {
    ROLE_NAV_HIDE[role] = [...(ROLE_NAV_HIDE[role] || []), ...ROLE_NAV_HIDE_PATCH[role]];
  });
*/

// ── STEP 5:  Active-route highlighting helper ─────────────────────────────────
//            (call this from your renderNav / Sidebar component)

function isKnowledgeRouteActive(pageId) {
  const knowledgeRoutes = ['knowledge-explorer', 'evidence-store'];
  return knowledgeRoutes.includes(pageId);
}

function isBrainTwinRouteActive(pageId) {
  return pageId === 'brain-twin' || pageId.startsWith('brain-twin/');
}

// ── STEP 6:  Optional dynamic badge updater ─────────────────────────────────
//            Call this after the sidebar has mounted to show live adapter counts

async function updateIntelligenceBadges() {
  try {
    const { knowledgeApi } = await import('./knowledge-explorer-integration.js');
    const stats = await knowledgeApi.getStats();

    const keBadge = document.querySelector('[data-nav-id="knowledge-explorer"] .nav-badge');
    if (keBadge && stats.total_adapters) {
      keBadge.textContent = `${stats.total_adapters} adapters`;
      keBadge.style.display = 'inline-block';
    }

    const esBadge = document.querySelector('[data-nav-id="evidence-store"] .nav-badge');
    if (esBadge && stats.total_cached_records) {
      esBadge.textContent = `${(stats.total_cached_records / 1000).toFixed(0)}K records`;
      esBadge.style.display = 'inline-block';
    }
  } catch (e) {
    // Silently fail — badges are decorative, not critical
    console.debug('[Intelligence] Badge update skipped:', e.message);
  }
}

// ── STEP 7:  Keyboard shortcut (Alt+K → Knowledge Explorer) ─────────────────
//            Add to your existing keyboard-shortcut handler

/*
  if (e.altKey && !e.ctrlKey && !e.metaKey) {
    const shortcuts = {
      d: 'dashboard',
      p: 'patients',
      c: 'courses',
      k: 'knowledge-explorer',   // ← new
      b: 'brain-twin',            // ← new
    };
    if (shortcuts[e.key]) { e.preventDefault(); window._nav(shortcuts[e.key]); }
  }
*/

// ── STEP 8:  Export for React-based sidebar components ────────────────────────

export { INTELLIGENCE_NAV_PATCH, NAV_ICONS_PATCH, ROLE_NAV_HIDE_PATCH, updateIntelligenceBadges };
export default INTELLIGENCE_NAV_PATCH;
