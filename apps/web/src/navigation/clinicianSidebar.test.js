/**
 * ============================================================================
 * Tests for clinicianSidebar.js -- DeepSynaps Clinician Operating System Navigation
 * ============================================================================
 *
 * Comprehensive test suite (50+ tests) covering:
 *   - Registry validation (structure, uniqueness, enums)
 *   - Role-aware filtering (10 role types)
 *   - Route resolution (exact, alias, parent, active highlighting)
 *   - Section grouping (7 sections)
 *   - Search (label, keyword, description, role-respecting)
 *   - Safety (admin isolation, beta markers, coming-soon gating)
 *   - Collapsed/expanded rendering modes
 *   - Statistics and validation reporting
 *
 * Runs with: node --test src/navigation/clinicianSidebar.test.js
 *
 * @module navigation/clinicianSidebar.test
 * @version 1.0.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { __sidebarTestApi__ } from './clinicianSidebar.js';

const {
  ROLES, ROLE_GROUPS, STATUS, NAV_ITEMS, SECTION_META, ICONS,
  getVisibleItems, groupBySection, getItemByRoute, isRouteActive,
  searchItems, renderSidebar, generateSidebarStyles, getStatusBadge,
  getSectionCollapseState, toggleSection, isSectionCollapsed,
  _flattenItems, _esc, validateRegistry, getStats,
} = __sidebarTestApi__;

// ─── Reference Data ─────────────────────────────────────────────────────────

const VALID_SECTIONS = ['TODAY', 'PATIENTS', 'INTERVENTIONS', 'ANALYZERS', 'INTELLIGENCE', 'ECOSYSTEM', 'ADMIN'];
const VALID_STATUSES = ['active', 'beta', 'preview', 'comingSoon', 'hidden'];
const VALID_ROLES = ['patient', 'receptionist', 'clinician', 'reviewer', 'technician', 'resident', 'clinic_admin', 'researcher', 'supervisor', 'admin'];

/** Collect all icon names used across NAV_ITEMS. */
function allUsedIcons() {
  const icons = new Set();
  for (const item of _flattenItems(NAV_ITEMS)) icons.add(item.icon);
  return Array.from(icons);
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. NAVIGATION REGISTRY VALIDATION
// ═════════════════════════════════════════════════════════════════════════════

describe('Navigation Registry', () => {
  const allItems = _flattenItems(NAV_ITEMS);

  it('all items have required fields', () => {
    for (const item of allItems) {
      assert.ok(item.id, `Missing id`);
      assert.ok(item.label, `Missing label on: ${item.id}`);
      assert.ok(item.route, `Missing route on: ${item.id}`);
      assert.ok(item.icon, `Missing icon on: ${item.id}`);
      assert.ok(item.section, `Missing section on: ${item.id}`);
      assert.ok(Array.isArray(item.requiredRoles) && item.requiredRoles.length > 0, `Missing requiredRoles on: ${item.id}`);
      assert.ok(item.status, `Missing status on: ${item.id}`);
      assert.ok(item.description, `Missing description on: ${item.id}`);
      assert.ok(Array.isArray(item.keywords) && item.keywords.length > 0, `Missing keywords on: ${item.id}`);
    }
  });

  it('all routes are unique', () => {
    const routes = new Set();
    for (const item of allItems) {
      assert.ok(!routes.has(item.route), `Duplicate route: ${item.route}`);
      routes.add(item.route);
    }
    assert.strictEqual(routes.size, allItems.length);
  });

  it('all IDs are unique', () => {
    const ids = new Set();
    for (const item of allItems) {
      assert.ok(!ids.has(item.id), `Duplicate id: ${item.id}`);
      ids.add(item.id);
    }
    assert.strictEqual(ids.size, allItems.length);
  });

  it('all sections are valid', () => {
    for (const item of allItems) assert.ok(VALID_SECTIONS.includes(item.section));
  });

  it('all statuses are valid', () => {
    for (const item of allItems) assert.ok(VALID_STATUSES.includes(item.status));
  });

  it('all roles in requiredRoles are valid', () => {
    for (const item of allItems) {
      for (const role of item.requiredRoles) assert.ok(VALID_ROLES.includes(role), `Invalid role ${role} on ${item.id}`);
    }
  });

  it('all icons are defined in ICONS registry', () => {
    for (const item of allItems) {
      assert.ok(ICONS[item.icon], `Missing icon "${item.icon}" for ${item.id}`);
      assert.strictEqual(typeof ICONS[item.icon], 'string');
    }
  });

  it('minimum 70 top-level navigation items', () => {
    assert.ok(NAV_ITEMS.length >= 70, `Got ${NAV_ITEMS.length}`);
  });

  it('all 7 sections are represented', () => {
    const sectionsFound = new Set(NAV_ITEMS.map(item => item.section));
    for (const s of VALID_SECTIONS) assert.ok(sectionsFound.has(s));
    assert.strictEqual(sectionsFound.size, 7);
  });

  it('validateRegistry reports zero errors', () => {
    const result = validateRegistry();
    if (!result.valid) console.error('Registry errors:', result.errors);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.errors.length, 0);
  });

  it('validateRegistry reports correct counts', () => {
    const result = validateRegistry();
    assert.strictEqual(result.itemCount, NAV_ITEMS.length);
    assert.strictEqual(result.totalItemCount, allItems.length);
  });

  it('no duplicate child IDs across parents', () => {
    const ids = new Set();
    for (const item of NAV_ITEMS) {
      assert.ok(!ids.has(item.id), `Dup id: ${item.id}`);
      ids.add(item.id);
      if (item.children) {
        for (const child of item.children) {
          assert.ok(!ids.has(child.id), `Dup child id: ${child.id}`);
          ids.add(child.id);
        }
      }
    }
  });

  it('every item with children has at least one child', () => {
    for (const item of NAV_ITEMS) {
      if (item.children) assert.ok(item.children.length > 0);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. ROLE-AWARE FILTERING
// ═════════════════════════════════════════════════════════════════════════════

describe('Role-Aware Filtering', () => {
  it('super_admin sees all non-hidden items', () => {
    const visible = getVisibleItems(ROLES.SUPER_ADMIN);
    const expectedCount = NAV_ITEMS.filter(i => i.status !== STATUS.HIDDEN).length;
    assert.strictEqual(visible.length, expectedCount);
    for (const item of visible) assert.notStrictEqual(item.status, STATUS.HIDDEN);
  });

  it('clinician sees clinical sections', () => {
    const visible = getVisibleItems(ROLES.CLINICIAN);
    const sections = new Set(visible.map(i => i.section));
    assert.ok(sections.has('TODAY'));
    assert.ok(sections.has('PATIENTS'));
    assert.ok(sections.has('INTERVENTIONS'));
    assert.ok(sections.has('ANALYZERS'));
    assert.ok(sections.has('INTELLIGENCE'));
    assert.ok(sections.has('ECOSYSTEM'));
  });

  it('clinician does not see forbidden admin items', () => {
    const visible = getVisibleItems(ROLES.CLINICIAN);
    const forbidden = ['audit-trail', 'user-clinic-management', 'admin-research-datasets'];
    for (const item of visible) assert.ok(!forbidden.includes(item.id));
  });

  it('clinician does not see Population Analytics', () => {
    assert.strictEqual(getVisibleItems(ROLES.CLINICIAN).find(i => i.id === 'population-analytics'), undefined);
  });

  it('patient role group exists but is not assigned to nav items yet', () => {
    const visible = getVisibleItems(ROLES.PATIENT);
    assert.ok(ROLE_GROUPS.PATIENT.includes(ROLES.PATIENT));
    assert.ok(visible.length === 0 || visible.every(i => i.requiredRoles.includes(ROLES.PATIENT)));
  });

  it('patient sees no ADMIN items', () => {
    assert.strictEqual(getVisibleItems(ROLES.PATIENT).filter(i => i.section === 'ADMIN').length, 0);
  });

  it('patient sees no ANALYZERS items', () => {
    assert.strictEqual(getVisibleItems(ROLES.PATIENT).filter(i => i.section === 'ANALYZERS').length, 0);
  });

  it('receptionist sees Insurance Portal', () => {
    const visible = getVisibleItems(ROLES.RECEPTIONIST);
    assert.ok(visible.some(i => i.id === 'insurance-portal'));
  });

  it('receptionist sees no admin routes', () => {
    assert.strictEqual(getVisibleItems(ROLES.RECEPTIONIST).filter(i => i.route.startsWith('/admin')).length, 0);
  });

  it('researcher sees ANALYZERS items', () => {
    assert.ok(getVisibleItems(ROLES.RESEARCHER).filter(i => i.section === 'ANALYZERS').length > 0);
  });

  it('researcher sees Evidence Research', () => {
    assert.ok(getVisibleItems(ROLES.RESEARCHER).some(i => i.id === 'evidence-research'));
  });

  it('technician sees ALL_CLINICAL analyzers', () => {
    const visible = getVisibleItems(ROLES.TECHNICIAN);
    assert.ok(visible.some(i => i.id === 'risk-analyzer'));
    assert.ok(visible.some(i => i.id === 'wearables'));
    assert.ok(visible.some(i => i.id === 'voice-analyzer'));
  });

  it('technician does not see CLINICIAN_PLUS or RESEARCHER analyzers', () => {
    const visible = getVisibleItems(ROLES.TECHNICIAN);
    assert.ok(!visible.some(i => i.id === 'qeeg-launcher'));
    assert.ok(!visible.some(i => i.id === 'mri-analysis'));
    assert.ok(!visible.some(i => i.id === 'biomarkers'));
  });

  it('resident sees clinical items', () => {
    const visible = getVisibleItems(ROLES.RESIDENT);
    assert.ok(visible.some(i => i.id === 'dashboard'));
    assert.ok(visible.some(i => i.id === 'patients-v2'));
  });

  it('clinic_admin sees clinical plus admin sections', () => {
    const sections = new Set(getVisibleItems(ROLES.CLINIC_ADMIN).map(i => i.section));
    assert.ok(sections.has('TODAY'));
    assert.ok(sections.has('PATIENTS'));
    assert.ok(sections.has('ADMIN'));
    assert.ok(sections.has('ANALYZERS'));
  });

  it('clinic_admin sees Finance and Data Console', () => {
    const visible = getVisibleItems(ROLES.CLINIC_ADMIN);
    assert.ok(visible.some(i => i.id === 'finance-v2'));
    assert.ok(visible.some(i => i.id === 'data-console'));
  });

  it('hidden items are never visible', () => {
    for (const role of Object.values(ROLES)) {
      for (const item of getVisibleItems(role)) {
        assert.notStrictEqual(item.status, STATUS.HIDDEN);
      }
    }
  });

  it('internal admin sees audit trail', () => {
    const visible = getVisibleItems(ROLES.INTERNAL);
    assert.ok(visible.some(i => i.id === 'audit-trail'));
    for (const item of visible) assert.notStrictEqual(item.status, STATUS.HIDDEN);
  });

  it('children are filtered by role', () => {
    const visible = getVisibleItems(ROLES.CLINICIAN);
    const protocolStudio = visible.find(i => i.id === 'protocol-studio');
    if (protocolStudio && protocolStudio.children) {
      for (const child of protocolStudio.children) {
        assert.ok(child.requiredRoles.includes(ROLES.CLINICIAN));
      }
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. ROUTE RESOLUTION
// ═════════════════════════════════════════════════════════════════════════════

describe('Route Resolution', () => {
  it('exact: /patients returns Patients', () => {
    const item = getItemByRoute('/patients');
    assert.notStrictEqual(item, null);
    assert.strictEqual(item.id, 'patients-v2');
  });

  it('exact: / returns Dashboard', () => {
    const item = getItemByRoute('/');
    assert.notStrictEqual(item, null);
    assert.strictEqual(item.id, 'dashboard');
  });

  it('alias: /patients-v2 matches Patients', () => {
    const item = getItemByRoute('/patients-v2');
    assert.strictEqual(item.id, 'patients-v2');
  });

  it('alias: /dashboard matches Dashboard', () => {
    assert.strictEqual(getItemByRoute('/dashboard').id, 'dashboard');
  });

  it('alias: /home matches Dashboard', () => {
    assert.strictEqual(getItemByRoute('/home').id, 'dashboard');
  });

  it('parent: /patients/123 matches /patients', () => {
    assert.strictEqual(getItemByRoute('/patients/123').id, 'patients-v2');
  });

  it('parent: /patients/123/profile matches /patients', () => {
    assert.strictEqual(getItemByRoute('/patients/123/profile').id, 'patients-v2');
  });

  it('deep: /protocol-studio/builder returns Protocol Builder', () => {
    assert.strictEqual(getItemByRoute('/protocol-studio/builder').id, 'protocol-builder');
  });

  it('deep: /analyzers/qeeg returns qEEG Analyzer', () => {
    assert.strictEqual(getItemByRoute('/analyzers/qeeg').id, 'qeeg-launcher');
  });

  it('deep: /admin/finance returns Finance', () => {
    assert.strictEqual(getItemByRoute('/admin/finance').id, 'finance-v2');
  });

  it('deep: /intelligence/deeptwin returns DeepTwin', () => {
    assert.strictEqual(getItemByRoute('/intelligence/deeptwin').id, 'deeptwin');
  });

  it('unknown route falls back', () => {
    assert.notStrictEqual(getItemByRoute('/totally-unknown'), null);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. ROUTE ACTIVE HIGHLIGHTING
// ═════════════════════════════════════════════════════════════════════════════

describe('Route Active Highlighting', () => {
  it('/patients active for /patients/123', () => {
    assert.strictEqual(isRouteActive('/patients', '/patients/123'), true);
  });

  it('exact match is active', () => {
    assert.strictEqual(isRouteActive('/patients', '/patients'), true);
  });

  it('/ active for /dashboard', () => {
    assert.strictEqual(isRouteActive('/', '/dashboard'), true);
  });

  it('alias triggers active', () => {
    assert.strictEqual(isRouteActive('/patients', '/patients-v2'), true);
  });

  it('child triggers parent active', () => {
    assert.strictEqual(isRouteActive('/protocol-studio', '/protocol-studio/builder'), true);
  });

  it('unrelated routes not active', () => {
    assert.strictEqual(isRouteActive('/patients', '/schedule'), false);
  });

  it('deep child route active', () => {
    assert.strictEqual(isRouteActive('/analyzers/qeeg', '/analyzers/qeeg/123'), true);
  });

  it('trailing slash normalization', () => {
    assert.strictEqual(isRouteActive('/patients/', '/patients'), true);
    assert.strictEqual(isRouteActive('/patients', '/patients/'), true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. SECTION GROUPING
// ═════════════════════════════════════════════════════════════════════════════

describe('Section Grouping', () => {
  it('returns all 7 groups', () => {
    const grouped = groupBySection(NAV_ITEMS);
    for (const s of VALID_SECTIONS) assert.ok(grouped[s] !== undefined);
  });

  it('sections in correct order', () => {
    const keys = Object.keys(groupBySection(NAV_ITEMS));
    assert.deepStrictEqual(keys, ['TODAY', 'PATIENTS', 'INTERVENTIONS', 'ANALYZERS', 'INTELLIGENCE', 'ECOSYSTEM', 'ADMIN']);
  });

  it('TODAY has at least 3 items', () => {
    assert.ok(groupBySection(NAV_ITEMS).TODAY.length >= 3);
  });

  it('ANALYZERS has at least 17 items', () => {
    assert.ok(groupBySection(NAV_ITEMS).ANALYZERS.length >= 17);
  });

  it('INTERVENTIONS has items with children', () => {
    const ps = groupBySection(NAV_ITEMS).INTERVENTIONS.find(i => i.id === 'protocol-studio');
    assert.ok(ps && ps.children && ps.children.length > 0);
  });

  it('Protocol Builder is child of Protocol Studio', () => {
    const ps = groupBySection(NAV_ITEMS).INTERVENTIONS.find(i => i.id === 'protocol-studio');
    const builder = ps.children.find(c => c.id === 'protocol-builder');
    assert.ok(builder);
    assert.strictEqual(builder.route, '/protocol-studio/builder');
  });

  it('ADMIN has at least 5 items', () => {
    assert.ok(groupBySection(NAV_ITEMS).ADMIN.length >= 5);
  });

  it('ECOSYSTEM has at least 4 items', () => {
    assert.ok(groupBySection(NAV_ITEMS).ECOSYSTEM.length >= 4);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. SEARCH
// ═════════════════════════════════════════════════════════════════════════════

describe('Search', () => {
  it('by label: "qEEG" finds qEEG Analyzer', () => {
    const r = searchItems('qEEG', ROLES.SUPER_ADMIN);
    assert.ok(r.length > 0);
    assert.ok(r.some(i => i.id === 'qeeg-launcher'));
  });

  it('case-insensitive: "qeeg" finds qEEG', () => {
    assert.ok(searchItems('qeeg', ROLES.SUPER_ADMIN).some(i => i.id === 'qeeg-launcher'));
  });

  it('by keyword: "brain" finds MRI or qEEG', () => {
    const ids = searchItems('brain', ROLES.SUPER_ADMIN).map(i => i.id);
    assert.ok(ids.includes('mri-analysis') || ids.includes('qeeg-launcher') || ids.includes('brainmap-v2'));
  });

  it('by keyword: "brainwaves" finds qEEG', () => {
    assert.ok(searchItems('brainwaves', ROLES.SUPER_ADMIN).some(i => i.id === 'qeeg-launcher'));
  });

  it('by description: "neuroimaging" finds MRI', () => {
    assert.ok(searchItems('neuroimaging', ROLES.SUPER_ADMIN).some(i => i.id === 'mri-analysis'));
  });

  it('respects role: patient searching "admin" finds no admin', () => {
    assert.strictEqual(searchItems('admin', ROLES.PATIENT).filter(i => i.section === 'ADMIN').length, 0);
  });

  it('empty query returns empty', () => {
    assert.deepStrictEqual(searchItems('', ROLES.CLINICIAN), []);
  });

  it('whitespace-only returns empty', () => {
    assert.deepStrictEqual(searchItems('   ', ROLES.CLINICIAN), []);
  });

  it('no matches returns empty', () => {
    assert.deepStrictEqual(searchItems('xyz123nonexistent', ROLES.SUPER_ADMIN), []);
  });

  it('by route: "/patients" finds Patients', () => {
    assert.ok(searchItems('/patients', ROLES.SUPER_ADMIN).some(i => i.id === 'patients-v2'));
  });

  it('finds multiple for "analyzer"', () => {
    assert.ok(searchItems('analyzer', ROLES.SUPER_ADMIN).length >= 3);
  });

  it('finds Protocol Studio for "protocol"', () => {
    assert.ok(searchItems('protocol', ROLES.CLINICIAN).some(i => i.id === 'protocol-studio'));
  });

  it('is case-insensitive', () => {
    const l = searchItems('deeptwin', ROLES.SUPER_ADMIN).map(i => i.id).sort();
    const u = searchItems('DEEPTWIN', ROLES.SUPER_ADMIN).map(i => i.id).sort();
    assert.deepStrictEqual(l, u);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. SAFETY & SECURITY
// ═════════════════════════════════════════════════════════════════════════════

describe('Safety', () => {
  it('no admin routes for patient', () => {
    assert.strictEqual(getVisibleItems(ROLES.PATIENT).filter(i => i.route.startsWith('/admin')).length, 0);
  });

  it('no admin routes for receptionist', () => {
    assert.strictEqual(getVisibleItems(ROLES.RECEPTIONIST).filter(i => i.route.startsWith('/admin')).length, 0);
  });

  it('clinician sees only Support Tickets under /admin', () => {
    const adminRoutes = getVisibleItems(ROLES.CLINICIAN).filter(i => i.route.startsWith('/admin'));
    // Support Tickets (/admin/tickets) is the only ALL_CLINICAL item under /admin
    assert.strictEqual(adminRoutes.length, 1);
    assert.strictEqual(adminRoutes[0].id, 'tickets');
  });

  it('beta items exist', () => {
    const beta = _flattenItems(NAV_ITEMS).filter(i => i.status === STATUS.BETA);
    assert.ok(beta.length > 0);
    for (const item of beta) assert.strictEqual(item.status, 'beta');
  });

  it('getStatusBadge(beta) === "beta"', () => assert.strictEqual(getStatusBadge(STATUS.BETA), 'beta'));
  it('getStatusBadge(preview) === "preview"', () => assert.strictEqual(getStatusBadge(STATUS.PREVIEW), 'preview'));
  it('getStatusBadge(comingSoon) === "soon"', () => assert.strictEqual(getStatusBadge(STATUS.COMING_SOON), 'soon'));
  it('getStatusBadge(active) === null', () => assert.strictEqual(getStatusBadge(STATUS.ACTIVE), null));

  it('comingSoon items exist', () => {
    const cs = _flattenItems(NAV_ITEMS).filter(i => i.status === STATUS.COMING_SOON);
    assert.ok(cs.length > 0);
  });

  it('comingSoon rendered with aria-disabled', () => {
    const html = renderSidebar({ currentRoute: '/', currentRole: ROLES.SUPER_ADMIN, collapsed: false });
    assert.ok(html.includes('ds-sidebar__item--coming-soon'));
    assert.ok(html.includes('aria-disabled="true"'));
  });

  it('audit-trail requires super_admin', () => {
    const item = _flattenItems(NAV_ITEMS).find(i => i.id === 'audit-trail');
    assert.ok(item.requiredRoles.includes(ROLES.SUPER_ADMIN));
    assert.ok(item.requiredRoles.includes(ROLES.INTERNAL));
  });

  it('user-clinic-management requires super_admin', () => {
    const item = _flattenItems(NAV_ITEMS).find(i => i.id === 'user-clinic-management');
    assert.ok(item.requiredRoles.includes(ROLES.SUPER_ADMIN));
    assert.ok(!item.requiredRoles.includes(ROLES.CLINICIAN));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. COLLAPSED / EXPANDED RENDERING
// ═════════════════════════════════════════════════════════════════════════════

describe('Collapsed Mode', () => {
  it('collapsed has --collapsed class', () => {
    assert.ok(renderSidebar({ currentRoute: '/', currentRole: ROLES.CLINICIAN, collapsed: true }).includes('ds-sidebar--collapsed'));
  });

  it('expanded has no --collapsed class', () => {
    assert.ok(!renderSidebar({ currentRoute: '/', currentRole: ROLES.CLINICIAN, collapsed: false }).includes('ds-sidebar--collapsed'));
  });

  it('collapsed hides search input', () => {
    const html = renderSidebar({ currentRoute: '/', currentRole: ROLES.CLINICIAN, collapsed: true });
    assert.ok(!html.includes('ds-sidebar__search-input'));
    assert.ok(html.includes('ds-sidebar__search--collapsed'));
  });

  it('expanded shows search input', () => {
    const html = renderSidebar({ currentRoute: '/', currentRole: ROLES.CLINICIAN, collapsed: false });
    assert.ok(html.includes('ds-sidebar__search-input'));
    assert.ok(!html.includes('ds-sidebar__search--collapsed'));
  });

  it('collapsed renders tooltips', () => {
    assert.ok(renderSidebar({ currentRoute: '/', currentRole: ROLES.CLINICIAN, collapsed: true }).includes('ds-sidebar__tooltip'));
  });

  it('expanded renders labels', () => {
    assert.ok(renderSidebar({ currentRoute: '/', currentRole: ROLES.CLINICIAN, collapsed: false }).includes('ds-sidebar__label'));
  });

  it('collapsed hides section labels', () => {
    assert.ok(!renderSidebar({ currentRoute: '/', currentRole: ROLES.CLINICIAN, collapsed: true }).includes('ds-sidebar__section-label'));
  });

  it('expanded shows section labels', () => {
    assert.ok(renderSidebar({ currentRoute: '/', currentRole: ROLES.CLINICIAN, collapsed: false }).includes('ds-sidebar__section-label'));
  });

  it('collapsed hides sub-items', () => {
    assert.ok(!renderSidebar({ currentRoute: '/', currentRole: ROLES.CLINICIAN, collapsed: true }).includes('ds-sidebar__subitems'));
  });

  it('expanded shows sub-items', () => {
    assert.ok(renderSidebar({ currentRoute: '/', currentRole: ROLES.SUPER_ADMIN, collapsed: false }).includes('ds-sidebar__subitems'));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 9. REGISTRY STATISTICS
// ═════════════════════════════════════════════════════════════════════════════

describe('Registry Statistics', () => {
  it('stats totalItems matches NAV_ITEMS', () => {
    assert.strictEqual(getStats().totalItems, NAV_ITEMS.length);
    assert.ok(getStats().totalItems >= 70);
  });

  it('stats totalFlattenedItems correct', () => {
    assert.strictEqual(getStats().totalFlattenedItems, _flattenItems(NAV_ITEMS).length);
  });

  it('stats sectionCount === 7', () => {
    assert.strictEqual(getStats().sectionCount, 7);
  });

  it('stats bySection covers all 7', () => {
    const stats = getStats();
    for (const s of VALID_SECTIONS) {
      assert.ok(stats.bySection[s] > 0);
    }
  });

  it('stats byStatus has active', () => {
    assert.ok(getStats().byStatus[STATUS.ACTIVE] > 0);
  });

  it('stats iconCount matches ICONS', () => {
    assert.strictEqual(getStats().iconCount, Object.keys(ICONS).length);
  });

  it('ANALYZERS has the most items', () => {
    const s = getStats().bySection;
    assert.strictEqual(s.ANALYZERS, Math.max(...Object.values(s)));
  });

  it('active outnumbers non-active', () => {
    const s = getStats().byStatus;
    const active = s[STATUS.ACTIVE] || 0;
    const nonActive = (s[STATUS.BETA] || 0) + (s[STATUS.PREVIEW] || 0) + (s[STATUS.COMING_SOON] || 0);
    assert.ok(active > nonActive);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 10. RENDERING
// ═════════════════════════════════════════════════════════════════════════════

describe('Rendering', () => {
  it('returns non-empty string', () => {
    const html = renderSidebar({ currentRoute: '/', currentRole: ROLES.CLINICIAN });
    assert.strictEqual(typeof html, 'string');
    assert.ok(html.length > 0);
  });

  it('starts with nav element', () => {
    assert.ok(renderSidebar({ currentRoute: '/', currentRole: ROLES.CLINICIAN }).trimStart().startsWith('<nav'));
  });

  it('has aria-label', () => {
    assert.ok(renderSidebar({ currentRoute: '/', currentRole: ROLES.CLINICIAN }).includes('aria-label="Main navigation"'));
  });

  it('renders data-nav-id elements', () => {
    assert.ok(renderSidebar({ currentRoute: '/', currentRole: ROLES.CLINICIAN }).includes('data-nav-id='));
  });

  it('renders active class', () => {
    assert.ok(renderSidebar({ currentRoute: '/patients', currentRole: ROLES.CLINICIAN }).includes('ds-sidebar__item--active'));
  });

  it('has Settings and Help footer', () => {
    const html = renderSidebar({ currentRoute: '/', currentRole: ROLES.CLINICIAN });
    assert.ok(html.includes('Settings'));
    assert.ok(html.includes('Help'));
  });

  it('filters by role', () => {
    const c = renderSidebar({ currentRoute: '/', currentRole: ROLES.CLINICIAN });
    const p = renderSidebar({ currentRoute: '/', currentRole: ROLES.PATIENT });
    assert.notStrictEqual(c.length, p.length);
  });

  it('CSS is non-empty with .ds-sidebar', () => {
    const css = generateSidebarStyles();
    assert.strictEqual(typeof css, 'string');
    assert.ok(css.length > 0);
    assert.ok(css.includes('.ds-sidebar'));
  });

  it('CSS has collapsed variant', () => {
    assert.ok(generateSidebarStyles().includes('.ds-sidebar--collapsed'));
  });

  it('CSS has active styling', () => {
    assert.ok(generateSidebarStyles().includes('.ds-sidebar__item--active'));
  });

  it('CSS has coming-soon styling', () => {
    assert.ok(generateSidebarStyles().includes('.ds-sidebar__item--coming-soon'));
  });

  it('CSS has section tints for all 7', () => {
    const css = generateSidebarStyles();
    for (const s of VALID_SECTIONS) assert.ok(css.includes(`[data-section="${s}"]`));
  });

  it('_esc escapes XSS', () => {
    const e = _esc('<script>alert("xss")</script>');
    assert.ok(!e.includes('<script>'));
    assert.ok(e.includes('&lt;script&gt;'));
  });

  it('_esc handles null/undefined/number', () => {
    assert.strictEqual(_esc(null), '');
    assert.strictEqual(_esc(undefined), '');
    assert.strictEqual(_esc(42), '42');
  });

  it('_esc escapes ampersands', () => {
    assert.strictEqual(_esc('A & B'), 'A &amp; B');
  });

  it('_esc escapes < and >', () => {
    assert.strictEqual(_esc('A < B'), 'A &lt; B');
    assert.strictEqual(_esc('A > B'), 'A &gt; B');
  });

  it('_esc escapes quotes', () => {
    assert.strictEqual(_esc('A "B"'), 'A &quot;B&quot;');
    assert.strictEqual(_esc("A 'B'"), 'A &#x27;B&#x27;');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 11. ICON REGISTRY
// ═════════════════════════════════════════════════════════════════════════════

describe('Icon Registry', () => {
  it('has at least 30 icons', () => {
    assert.ok(Object.keys(ICONS).length >= 30);
  });

  it('all icons are valid SVG strings', () => {
    for (const [, svg] of Object.entries(ICONS)) {
      assert.strictEqual(typeof svg, 'string');
      assert.ok(svg.includes('<svg'));
      assert.ok(svg.includes('</svg>'));
    }
  });

  it('common clinical icons present', () => {
    assert.ok(ICONS['brain']);
    assert.ok(ICONS['heart-pulse']);
    assert.ok(ICONS['activity']);
    assert.ok(ICONS['users']);
    assert.ok(ICONS['calendar']);
    assert.ok(ICONS['settings']);
    assert.ok(ICONS['search']);
  });

  it('every used icon exists', () => {
    for (const iconName of allUsedIcons()) assert.ok(ICONS[iconName], `Missing: ${iconName}`);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 12. CONSTANTS
// ═════════════════════════════════════════════════════════════════════════════

describe('Constants', () => {
  it('ROLES has 10 values', () => {
    assert.strictEqual(Object.keys(ROLES).length, 10);
    assert.strictEqual(ROLES.PATIENT, 'patient');
    assert.strictEqual(ROLES.RECEPTIONIST, 'receptionist');
    assert.strictEqual(ROLES.CLINICIAN, 'clinician');
    assert.strictEqual(ROLES.REVIEWER, 'reviewer');
    assert.strictEqual(ROLES.TECHNICIAN, 'technician');
    assert.strictEqual(ROLES.RESIDENT, 'resident');
    assert.strictEqual(ROLES.CLINIC_ADMIN, 'clinic_admin');
    assert.strictEqual(ROLES.RESEARCHER, 'researcher');
    assert.strictEqual(ROLES.SUPER_ADMIN, 'supervisor');
    assert.strictEqual(ROLES.INTERNAL, 'admin');
  });

  it('STATUS has 5 values', () => {
    assert.strictEqual(Object.keys(STATUS).length, 5);
    assert.strictEqual(STATUS.ACTIVE, 'active');
    assert.strictEqual(STATUS.BETA, 'beta');
    assert.strictEqual(STATUS.PREVIEW, 'preview');
    assert.strictEqual(STATUS.COMING_SOON, 'comingSoon');
    assert.strictEqual(STATUS.HIDDEN, 'hidden');
  });

  it('ALL_CLINICAL includes expected roles', () => {
    assert.ok(ROLE_GROUPS.ALL_CLINICAL.includes(ROLES.CLINICIAN));
    assert.ok(ROLE_GROUPS.ALL_CLINICAL.includes(ROLES.RESIDENT));
    assert.ok(ROLE_GROUPS.ALL_CLINICAL.includes(ROLES.REVIEWER));
    assert.ok(ROLE_GROUPS.ALL_CLINICAL.includes(ROLES.TECHNICIAN));
    assert.ok(ROLE_GROUPS.ALL_CLINICAL.includes(ROLES.CLINIC_ADMIN));
    assert.ok(ROLE_GROUPS.ALL_CLINICAL.includes(ROLES.SUPER_ADMIN));
    assert.ok(ROLE_GROUPS.ALL_CLINICAL.includes(ROLES.INTERNAL));
  });

  it('ADMIN_ONLY includes clinic_admin, supervisor, internal', () => {
    assert.ok(ROLE_GROUPS.ADMIN_ONLY.includes(ROLES.CLINIC_ADMIN));
    assert.ok(ROLE_GROUPS.ADMIN_ONLY.includes(ROLES.SUPER_ADMIN));
    assert.ok(ROLE_GROUPS.ADMIN_ONLY.includes(ROLES.INTERNAL));
  });

  it('SUPER_ONLY has exactly 2 roles', () => {
    assert.strictEqual(ROLE_GROUPS.SUPER_ONLY.length, 2);
    assert.ok(ROLE_GROUPS.SUPER_ONLY.includes(ROLES.SUPER_ADMIN));
    assert.ok(ROLE_GROUPS.SUPER_ONLY.includes(ROLES.INTERNAL));
  });

  it('PATIENT has exactly 1 role', () => {
    assert.strictEqual(ROLE_GROUPS.PATIENT.length, 1);
    assert.ok(ROLE_GROUPS.PATIENT.includes(ROLES.PATIENT));
  });

  it('SECTION_META has metadata for all 7 sections', () => {
    for (const section of VALID_SECTIONS) {
      const meta = SECTION_META[section];
      assert.ok(meta);
      assert.ok(meta.label);
      assert.ok(typeof meta.order === 'number');
      assert.ok(meta.description);
      assert.ok(typeof meta.defaultCollapsed === 'boolean');
      assert.ok(meta.tint);
    }
  });

  it('section orders are 1-7', () => {
    const orders = VALID_SECTIONS.map(s => SECTION_META[s].order).sort((a, b) => a - b);
    assert.deepStrictEqual(orders, [1, 2, 3, 4, 5, 6, 7]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 13. NAV ITEM STRUCTURE
// ═════════════════════════════════════════════════════════════════════════════

describe('Nav Item Structure', () => {
  it('AI-flagged items have ai=true', () => {
    const aiItems = _flattenItems(NAV_ITEMS).filter(i => i.ai);
    assert.ok(aiItems.length > 0);
    for (const item of aiItems) assert.strictEqual(item.ai, true);
  });

  it('badged items have string badges', () => {
    for (const item of _flattenItems(NAV_ITEMS).filter(i => i.badge)) {
      assert.strictEqual(typeof item.badge, 'string');
      assert.ok(item.badge.length > 0);
    }
  });

  it('Inbox badge is urgent', () => {
    const inbox = _flattenItems(NAV_ITEMS).find(i => i.id === 'clinician-inbox');
    assert.ok(inbox.badge.startsWith('!'));
  });

  it('all routes start with "/"', () => {
    for (const item of _flattenItems(NAV_ITEMS)) assert.ok(item.route.startsWith('/'));
  });

  it('no non-root route ends with "/"', () => {
    for (const item of _flattenItems(NAV_ITEMS)) {
      if (item.route !== '/') assert.ok(!item.route.endsWith('/'));
    }
  });

  it('aliases start with "/"', () => {
    for (const item of _flattenItems(NAV_ITEMS)) {
      if (item.aliases) for (const a of item.aliases) assert.ok(a.startsWith('/'));
    }
  });

  it('aliases are valid paths', () => {
    for (const item of _flattenItems(NAV_ITEMS)) {
      if (item.aliases) {
        for (const a of item.aliases) {
          assert.ok(a.startsWith('/'), `Alias ${a} should start with /`);
          assert.ok(a.length > 1, `Alias ${a} should not be just "/"`);
        }
      }
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 14. INTERNAL HELPERS
// ═════════════════════════════════════════════════════════════════════════════

describe('Internal Helpers', () => {
  it('_flattenItems returns more than top-level', () => {
    assert.ok(_flattenItems(NAV_ITEMS).length > NAV_ITEMS.length);
  });

  it('_flattenItems preserves properties', () => {
    for (const item of _flattenItems(NAV_ITEMS)) {
      assert.ok(item.id);
      assert.ok(item.label);
      assert.ok(item.route);
    }
  });

  it('_flattenItems children after parent', () => {
    const flat = _flattenItems(NAV_ITEMS);
    assert.ok(flat.findIndex(i => i.id === 'protocol-builder') > flat.findIndex(i => i.id === 'protocol-studio'));
  });
});
