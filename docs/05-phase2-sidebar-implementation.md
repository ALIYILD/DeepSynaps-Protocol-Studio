# Phase 2: Sidebar Implementation Kickoff
**Status:** READY FOR IMPLEMENTATION  
**Timeline:** Weeks 1-2  
**Objective:** Build enterprise-grade sidebar component + route grouping logic

---

## PHASE 2 SCOPE

### 1. Sidebar Component (Day 1-2)
**Location:** `apps/web/src/components/Sidebar/` (new directory)  
**Deliverable:** Reusable sidebar component with collapsible groups

```javascript
// apps/web/src/components/Sidebar/Sidebar.jsx
<SidebarComponent 
  groups={SIDEBAR_GROUPS}
  activeRoute={currentRoute}
  collapsedGroups={collapsedState}
  onGroupToggle={handleToggle}
  role={userRole}
  badges={badgeState}
/>
```

**Features:**
- Collapsible group headers (click to expand/collapse)
- Nested route items (up to 3 levels)
- Active route highlighting
- Badge rendering (alerts, counts, unread)
- Keyboard navigation (Tab, Enter, Space)
- Responsive collapse on mobile (<768px)
- Persist collapse state to localStorage

### 2. Route Configuration (Day 2-3)
**Location:** `apps/web/src/constants.js` (extend existing)  
**Deliverable:** Route metadata with group assignments

```javascript
// apps/web/src/constants.js - NEW SECTION
export const SIDEBAR_GROUPS = {
  TODAY: {
    label: 'Today',
    icon: 'home',
    routes: [
      { id: 'dashboard', label: 'Dashboard', icon: 'grid' },
      { id: 'inbox', label: 'Inbox', icon: 'inbox', badge: 'unread' },
      { id: 'clinician-digest', label: 'Daily Digest', icon: 'briefcase' },
      { id: 'scheduling-hub', label: 'Schedule', icon: 'calendar' }
    ]
  },
  PATIENTS: {
    label: 'Patients',
    icon: 'users',
    routes: [
      { id: 'patients-hub', label: 'Patients Hub', icon: 'users' },
      { id: 'patient-profile', label: 'Patient Profile', icon: 'person' },
      { id: 'assessments-hub', label: 'Assessments', icon: 'checklist' },
      // ... 43 more
    ]
  },
  INTERVENTIONS: {
    label: 'Interventions',
    icon: 'settings',
    nested: [
      {
        label: 'Neuromodulation Studio',
        icon: 'brain',
        routes: [
          { id: 'protocol-builder', label: 'Protocol Builder' },
          { id: 'brain-map-planner', label: 'Brain Map Planner' },
          // ...
        ]
      },
      // ... other nested groups
    ]
  },
  ANALYZERS: {
    label: 'Analyzers',
    icon: 'chart',
    nested: [
      {
        label: 'Biomarkers',
        icon: 'flask',
        routes: [
          { id: 'biomarkers', label: 'Biomarkers' },
          { id: 'labs-analyzer', label: 'Labs Analyzer' },
          // ...
        ]
      },
      // ... other analyzers
    ]
  },
  ECOSYSTEM: { /* ... */ },
  ADMIN: { /* ... */ }
};

export const ROUTE_TO_GROUP = {
  'dashboard': 'TODAY',
  'patients-hub': 'PATIENTS',
  'protocol-builder': 'INTERVENTIONS',
  'risk-analyzer': 'ANALYZERS',
  // ... all 235 routes mapped
};
```

### 3. App.js Integration (Day 3-4)
**Location:** `apps/web/src/app.js`  
**Changes:**
- Import sidebar component
- Render sidebar before main content area
- Pass current route to sidebar for active highlighting
- Handle sidebar route clicks → navigate()

```javascript
// In app.js renderPage() or similar
const sidebarEl = document.getElementById('sidebar-container');
if (sidebarEl) {
  const sidebar = await createSidebarComponent({
    activeRoute: currentRouteId,
    onNavigate: (routeId) => navigate(routeId),
    role: currentUser.role,
    badges: getCurrentBadges()
  });
  sidebarEl.innerHTML = sidebar;
}
```

### 4. Styling & Responsive (Day 4-5)
**Location:** `apps/web/src/styles/sidebar.css` (new file)  
**Features:**
- Desktop: Fixed left sidebar, 240-280px width
- Tablet: Collapsible sidebar, toggle in header
- Mobile: Bottom navigation (TODAY, PATIENTS, INTERVENTIONS, ANALYZERS only)
- Dark theme (forced dark mode per app.js)
- Smooth collapse animations
- Accessible focus states

### 5. Testing & QA (Day 5)
**Location:** `apps/web/src/components/Sidebar/Sidebar.test.js`  
**Tests:**
- Route grouping correctness (all 235 routes mapped)
- Collapse state persistence
- Active highlighting on route change
- Badge rendering
- Keyboard navigation
- Mobile responsive behavior
- Deep link preservation

---

## DETAILED IMPLEMENTATION CHECKLIST

### Sidebar Component (`Sidebar.jsx`)
- [ ] Create `apps/web/src/components/Sidebar/` directory
- [ ] Build `SidebarGroup.jsx` (collapsible group header)
- [ ] Build `SidebarItem.jsx` (route link with badge)
- [ ] Build `Sidebar.jsx` (main component orchestrator)
- [ ] Implement collapse state via React state + localStorage
- [ ] Add keyboard event listeners (Tab, Enter, Space)
- [ ] Add focus management for accessibility
- [ ] Test responsive breakpoints

### Route Configuration (`constants.js`)
- [ ] Add `SIDEBAR_GROUPS` object with all 6 top-level groups
- [ ] Add `ROUTE_TO_GROUP` mapping for all 235 routes
- [ ] Define group metadata (label, icon, routes array)
- [ ] Define nested group structure (Neuromodulation Studio, Biomarkers, etc)
- [ ] Add badge configuration (unread inbox, patient count, etc)
- [ ] Export for use in app.js + sidebar component

### App.js Integration
- [ ] Import sidebar component + configuration
- [ ] Add `<div id="sidebar-container">` to HTML layout
- [ ] Pass current route to sidebar
- [ ] Implement sidebar click handler → navigate()
- [ ] Handle role-based route visibility
- [ ] Persist selected patient context (sessionStorage)

### Styling (`sidebar.css`)
- [ ] Desktop layout: flex sidebar + main content area
- [ ] Collapse animation: 300ms smooth transition
- [ ] Active state: border + accent color (brand blue)
- [ ] Hover states: background color change
- [ ] Badge styling: red for alerts, orange for warnings
- [ ] Responsive breakpoints: 1024px (desktop), 768px (tablet), <768px (mobile)
- [ ] Keyboard focus states (outline + highlight)
- [ ] Dark mode only (per app.js enforced)

### Testing (`Sidebar.test.js`)
- [ ] Unit tests: Component renders correctly
- [ ] Unit tests: Collapse state toggles
- [ ] Unit tests: Active route highlighting
- [ ] Unit tests: Badge rendering
- [ ] Integration tests: Route grouping (all 235 routes)
- [ ] Integration tests: Deep linking (navigate to nested route)
- [ ] Accessibility tests: Keyboard navigation
- [ ] Responsive tests: Mobile breakpoint behavior

---

## FILE STRUCTURE (AFTER PHASE 2)

```
apps/web/src/
├── components/
│   └── Sidebar/
│       ├── Sidebar.jsx           (main component)
│       ├── SidebarGroup.jsx       (collapsible group)
│       ├── SidebarItem.jsx        (route link + badge)
│       ├── Sidebar.test.js
│       └── sidebar.module.css     (or imported styles)
├── styles/
│   ├── sidebar.css               (NEW)
│   └── ... existing styles
├── constants.js                  (MODIFIED: add SIDEBAR_GROUPS + ROUTE_TO_GROUP)
├── app.js                        (MODIFIED: sidebar integration)
└── ... rest of app
```

---

## IMPLEMENTATION SEQUENCE

### Day 1 (Monday)
- [ ] Create Sidebar component structure
- [ ] Build SidebarGroup collapsible logic
- [ ] Build SidebarItem with active highlighting
- [ ] Implement collapse state persistence

### Day 2 (Tuesday)
- [ ] Extend constants.js with route grouping
- [ ] Create ROUTE_TO_GROUP mapping (all 235)
- [ ] Integrate sidebar into app.js layout
- [ ] Verify route navigation works

### Day 3 (Wednesday)
- [ ] Implement badge rendering logic
- [ ] Add keyboard navigation (Tab, Enter)
- [ ] Implement role-based visibility filtering
- [ ] Test deep linking (direct URL navigation)

### Day 4 (Thursday)
- [ ] Build responsive styling (mobile breakpoints)
- [ ] Add animation transitions
- [ ] Implement accessibility improvements (focus traps)
- [ ] Dark mode verification

### Day 5 (Friday)
- [ ] Run full test suite
- [ ] QA on desktop, tablet, mobile
- [ ] Fix any regressions
- [ ] Prepare for merge

---

## ACCEPTANCE CRITERIA

### Functional
- ✅ All 235 routes correctly categorized + accessible
- ✅ Collapsible groups persist state across sessions
- ✅ Active route highlighted on navigation
- ✅ Badges render correctly (unread, alerts, counts)
- ✅ Deep links work (navigate directly to nested route)
- ✅ No route breaks; all existing bookmarks still work

### Performance
- ✅ Sidebar renders in <500ms
- ✅ Collapse/expand animations smooth (60fps)
- ✅ localStorage reads/writes <10ms
- ✅ No memory leaks on route changes

### Accessibility
- ✅ Keyboard navigation fully functional
- ✅ Screen reader friendly (ARIA labels)
- ✅ Focus management in collapsible groups
- ✅ WCAG 2.1 AA compliance

### Responsive
- ✅ Desktop (>1024px): Always visible sidebar
- ✅ Tablet (768-1024px): Collapsible toggle in header
- ✅ Mobile (<768px): Bottom navigation (4 main groups)
- ✅ Touch targets: min 44x44px

### Testing
- ✅ Unit tests: 90%+ component coverage
- ✅ Integration tests: Route grouping + navigation
- ✅ Visual regression tests: Desktop + mobile layouts
- ✅ Accessibility audit: axe-core passes

---

## BLOCKING DEPENDENCIES

None identified. This phase is self-contained:
- No backend API changes required
- No database schema changes
- No external service integrations
- Uses existing route IDs (no redirects needed)

---

## ROLLBACK PLAN

If issues arise:
1. Revert sidebar component (no functional impact)
2. Keep route configuration (documentation-only)
3. Remove sidebar from app.js layout
4. All existing functionality remains intact

---

## HAND-OFF CRITERIA (Ready for Phase 3)

1. ✅ Sidebar component production-ready
2. ✅ All tests passing (npm run build + npm run test)
3. ✅ Route configuration complete + validated
4. ✅ Responsive behavior verified on device
5. ✅ Deep linking working
6. ✅ Accessibility audit passed
7. ✅ Documentation updated (README, SIDEBAR.md)
8. ✅ Code review approved by 1 team member

---

## PHASE 3 PREVIEW (Next Week)

After Phase 2 complete:
- Add badge sources (Risk Triage alerts, unread inbox, pending reviews)
- Wire analyzer data into patient profile cards
- Implement cross-page navigation (analyzer → patient context)
- Build role-based route visibility switching

