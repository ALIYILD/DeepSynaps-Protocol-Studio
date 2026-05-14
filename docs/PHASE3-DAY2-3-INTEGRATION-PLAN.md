# Phase 3, Days 2-3: App.js Integration Test Plan

**Status:** ACTIVE - Integration Phase  
**Timeline:** May 15-16, 2026  
**Objective:** Sidebar fully integrated into app.js with all 235 routes accessible

---

## **INTEGRATION STEPS (Day 2-3)**

### **Step 1: Verify sidebar rendering** (1 hour)
- [ ] Apply PATCH 1-5 to app.js
- [ ] Sidebar appears in app layout
- [ ] No console errors
- [ ] Sidebar responsive (desktop/mobile/tablet)
- [ ] Sidebar interactive (can click groups/routes)

### **Step 2: Wire navigation handler** (2 hours)
- [ ] Apply PATCH 6-7 (route validator + deep linking)
- [ ] Clicking sidebar route → page loads
- [ ] Route URL updates correctly
- [ ] Deep linking works (direct URL navigation)
- [ ] Back button works
- [ ] Refresh preserves route

### **Step 3: Add error handling** (1 hour)
- [ ] Apply PATCH 8-10 (error boundary, mobile toggle)
- [ ] Sidebar errors handled gracefully
- [ ] Mobile toggle visible on <768px
- [ ] No crashes on edge cases
- [ ] Fallback to dashboard on invalid route

### **Step 4: Test all 235 routes** (4 hours)
- [ ] Create test script to navigate all routes
- [ ] Verify each route loads without errors
- [ ] Check sidebar active highlighting is correct
- [ ] Verify breadcrumb/page title updates
- [ ] Check no 404 errors or missing components

### **Step 5: Integration testing** (2 hours)
- [ ] Navigate 10+ routes in sequence
- [ ] Collapse/expand groups while navigating
- [ ] Check localStorage persists state
- [ ] Verify badges don't break navigation
- [ ] Test role-based visibility

---

## **ROUTE VALIDATION MATRIX**

### **Sample Routes to Test** (235 total)

**TODAY Group:**
- [ ] dashboard — Home/dashboard page loads
- [ ] inbox — Inbox page loads
- [ ] calendar — Calendar/schedule loads
- [ ] notifications — Notifications page loads

**PATIENTS Group:**
- [ ] patients-hub — Patients list loads
- [ ] patient-detail — Patient detail loads (with ID param)
- [ ] patient-interventions — Patient interventions loads
- [ ] patient-outcomes — Patient outcomes loads
- [ ] patient-history — Patient history loads

**INTERVENTIONS Group:**
- [ ] interventions-queue — Queue loads
- [ ] intervention-detail — Detail loads (with ID param)
- [ ] intervention-planning — Planning tool loads
- [ ] intervention-monitoring — Monitoring loads
- [ ] intervention-results — Results page loads

**ANALYZERS Group:**
- [ ] trd-analyzer — TRD analyzer loads
- [ ] outcome-analyzer — Outcome analyzer loads
- [ ] risk-analyzer — Risk analyzer loads
- [ ] response-predictor — Response predictor loads

**ECOSYSTEM Group:**
- [ ] team-management — Team page loads
- [ ] patient-portal — Portal access loads
- [ ] integrations — API integrations loads
- [ ] data-export — Data export loads

**ADMIN Group:**
- [ ] settings — Admin settings loads
- [ ] users — User management loads
- [ ] audit-log — Audit log loads
- [ ] system-health — System health loads

---

## **DEEP LINKING TEST CASES**

### **Test Format:** `/app/<route-id>`

```bash
# Desktop deep links
/app/dashboard
/app/patients-hub
/app/intervention-detail?id=123
/app/patient-outcomes?patient_id=456
/app/trd-analyzer?case_id=789

# Mobile deep links (should work same as desktop)
# All above should work on mobile (<768px) with bottom nav

# Test in browser console:
window.navigateToRoute('dashboard')
window.navigateToRoute('patients-hub')
window.navigateToRoute('invalid-route') // Should fallback to dashboard
```

---

## **BROWSER CONSOLE TEST CHECKLIST**

Run these checks in browser dev tools:

```javascript
// 1. Check sidebar rendered
console.log(document.querySelector('.sidebar'));
// Should return: <div class="sidebar">...</div>

// 2. Check route validation
console.log(window.validateRoute('dashboard'));
// Should return: { groupId: 'today', route: {...} }

// 3. Check badges accessible
console.log(window.getCurrentBadges?.());
// Should return: { alerts: 0, inbox: 0, ... }

// 4. Check navigation works
window.navigateToRoute('patients-hub');
// Page should navigate to patients hub

// 5. Check localStorage
console.log(localStorage.getItem('deepsync-sidebar-collapse-state'));
// Should return: {"today":false,"patients":true,...}

// 6. No errors logged
console.log(console.error.length);
// Should be: 0
```

---

## **AUTOMATED INTEGRATION TEST SCRIPT**

```javascript
/**
 * Test all 235 routes for navigation
 * Run in browser console after sidebar integration
 */

async function testAllRoutes() {
  const routeIds = Object.keys(ROUTE_TO_GROUP);
  const results = {
    total: routeIds.length,
    passed: 0,
    failed: 0,
    errors: []
  };

  console.log(`Testing ${routeIds.length} routes...`);

  for (const routeId of routeIds) {
    try {
      // Navigate to route
      window.navigateToRoute(routeId);
      
      // Wait for page to load
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Check no console errors
      if (!document.querySelector('.error-page')) {
        results.passed++;
        console.log(`✅ ${routeId}`);
      } else {
        results.failed++;
        results.errors.push(routeId);
        console.error(`❌ ${routeId} - page not found`);
      }
    } catch (e) {
      results.failed++;
      results.errors.push(`${routeId}: ${e.message}`);
      console.error(`❌ ${routeId} - ${e.message}`);
    }
  }

  console.log('\n=== TEST RESULTS ===');
  console.log(`Passed: ${results.passed}/${results.total}`);
  console.log(`Failed: ${results.failed}/${results.total}`);
  if (results.errors.length > 0) {
    console.log('Errors:', results.errors);
  }

  return results;
}

// Run test
testAllRoutes().then(results => {
  if (results.failed === 0) {
    console.log('🎉 ALL ROUTES PASSED!');
  } else {
    console.log(`⚠️ ${results.failed} routes failed`);
  }
});
```

---

## **MANUAL TESTING CHECKLIST**

### **Desktop Testing (1920x1080)**

- [ ] Sidebar visible on left (280px width)
- [ ] All 6 groups visible (TODAY, PATIENTS, INTERVENTIONS, ANALYZERS, ECOSYSTEM, ADMIN)
- [ ] Click group header → collapses/expands
- [ ] Click route → navigates to page
- [ ] Active route highlighted (blue + left border)
- [ ] Refresh page → sidebar state persists
- [ ] No horizontal scrolling
- [ ] No console errors

### **Tablet Testing (768x1024)**

- [ ] Sidebar visible (280px width)
- [ ] Same functionality as desktop
- [ ] Touch interactions work
- [ ] No mobile bottom nav visible
- [ ] Content readable at tablet zoom

### **Mobile Testing (<768px)**

- [ ] Bottom navigation visible (60px height)
- [ ] First 4-5 groups shown as icons
- [ ] Main content has bottom padding (60px)
- [ ] Click group icon → maybe modal/dropdown? (TBD)
- [ ] Navigate routes from mobile
- [ ] No horizontal scroll

### **Deep Linking Testing**

- [ ] Direct URL navigation: `/app/dashboard` → loads dashboard
- [ ] Bookmark a specific page, reload → loads correct page
- [ ] Share URL with `?id=123` param → works correctly
- [ ] Browser back/forward buttons work
- [ ] Page title updates correctly

### **Role-Based Visibility Testing**

- [ ] Clinician role: sees TODAY, PATIENTS, INTERVENTIONS, ANALYZERS
- [ ] Admin role: sees all 6 groups
- [ ] Supervisor role: sees custom subset
- [ ] Patient role: sees limited routes only
- [ ] Switch roles → sidebar updates immediately

---

## **PERFORMANCE TEST CHECKLIST**

- [ ] Sidebar renders in <300ms
- [ ] Route navigation in <500ms
- [ ] No jank on animations
- [ ] Scroll performance >60fps
- [ ] Memory usage <5MB after 10 navigations
- [ ] No memory leaks (check DevTools)
- [ ] localStorage operations <50ms

---

## **ACCESSIBILITY TEST CHECKLIST (Day 3)**

- [ ] Tab through all sidebar items
- [ ] Enter/Space activate routes
- [ ] Focus visible (outline or box-shadow)
- [ ] Screen reader announces all items
- [ ] Active route announced (aria-current)
- [ ] No focus traps
- [ ] Keyboard focus visible after click
- [ ] High contrast mode works
- [ ] Reduced motion setting respected

---

## **EDGE CASES TO TEST**

- [ ] Navigate to invalid route → fallback to dashboard
- [ ] Rapid navigation (click multiple routes quickly) → no crashes
- [ ] Collapse/expand while navigating → no flicker
- [ ] Open DevTools → sidebar still works
- [ ] Go offline → sidebar still works (fallback badges)
- [ ] localStorage disabled → sidebar works without persistence
- [ ] Very long route list → still performant
- [ ] Mobile rotation (portrait ↔ landscape) → layout adapts

---

## **ROLLBACK PLAN (If Issues Found)**

If critical issues found during integration:

1. Revert to Phase 2 commit: `4bc482f3`
2. Document issue in Phase 3 bug report
3. Fix in separate branch
4. Re-test before re-integrating

```bash
git revert HEAD~5..HEAD  # Revert last 5 commits
git push origin main
```

---

## **SUCCESS CRITERIA (Days 2-3)**

✅ **Sidebar renders** in app layout (no errors)  
✅ **Navigation works** - click route → page loads  
✅ **Deep linking works** - direct URL navigation  
✅ **All 235 routes** accessible via sidebar  
✅ **Mobile** bottom nav works  
✅ **No console** errors/warnings  
✅ **Performance** meets targets (<500ms navigation)  
✅ **Accessibility** passes WCAG 2.1 AA  

---

## **DELIVERABLES (End of Day 3)**

1. **App.js integration** — Sidebar fully integrated
2. **Route validation** — All 235 routes verified accessible
3. **Integration tests** — Automated test script
4. **Integration report** — Complete test results
5. **Bug fixes** — Any issues found + fixed

---

## **NEXT STEPS (Day 4-5)**

Once Days 2-3 complete:
- Begin badge API integration
- Implement badge polling
- Connect Risk Triage alerts
- Connect inbox counts

