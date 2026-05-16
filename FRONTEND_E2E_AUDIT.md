# Frontend E2E Audit — DeepSynaps Protocol Studio

**Date:** 2026-05-17  
**Auditor:** Automated Architecture Audit  
**Scope:** Existing E2E test infrastructure, coverage gaps, critical workflows

---

## 1. Existing Test Infrastructure

### Unit Tests (Vitest + Testing Library)

| File | Tests | Coverage |
|------|-------|----------|
| `apps/web/tests/multimodal.test.js` | 25 | InsightCard, TimelineView, CorrelationCard, ConfounderCard, DataQualityFlags |
| `apps/web/tests/deeptwin.test.js` | 15 | SynthesisDashboard tabs, loading, errors, synthesis flow |
| `apps/web/src/demo-mode.test.js` | 6 | isDemoMode, getDemoModeLabel, shouldShowNonPhiBanner |

### E2E Tests (BEFORE this PR)

| Component | Status |
|-----------|--------|
| Playwright installed | **NO** |
| Playwright config | **NO** |
| E2E test directory | **NO** |
| E2E CI workflow | **NO** |
| Page Object Models | **NO** |
| Auth session fixtures | **NO** |

---

## 2. E2E Coverage Gaps

| Workflow | Unit Tested? | E2E Tested? | Priority |
|----------|-------------|-------------|----------|
| Dashboard page load | Yes | **NO** | HIGH |
| Safety banner visible | Yes | **NO** | HIGH |
| Demo mode banner | Yes | **NO** | HIGH |
| Tab navigation | Yes | **NO** | HIGH |
| Loading states | Yes | **NO** | MEDIUM |
| Error states (API fail) | Yes | **NO** | MEDIUM |
| Mobile responsiveness | **NO** | **NO** | MEDIUM |
| DeepTwin page load | Yes | **NO** | HIGH |
| DeepTwin tab navigation | **NO** | **NO** | MEDIUM |
| Safety wording (no AI diagnosis) | Partial | **NO** | HIGH |
| Demo banner dismissal | **NO** | **NO** | MEDIUM |
| Cross-browser testing | **NO** | **NO** | LOW |

---

## 3. Routes to Cover

| Route | Component | Purpose |
|-------|-----------|---------|
| `/pages-deeptwin/synthesis-dashboard` | SynthesisDashboard | Main clinician dashboard |
| `/pages-deeptwin/deeptwin` | DeepTwinPage | Patient intelligence page |

---

## 4. Known Constraints

- No package.json existed before this PR (added now)
- No build server configured (Vite preview used)
- Backend API may not be available during E2E (handled with graceful degradation)
- Components use data-testid for stable selectors
- Demo mode via localStorage flag

---

## 5. Priority Workflows (E2E)

### Tier 1 — Must Have (this PR)

1. App loads without crash
2. Safety banner visible on every page
3. Tab navigation works
4. Demo banner appears in demo mode
5. Demo banner does not appear in live mode
6. No AI diagnosis / autonomous treatment claims
7. Mobile rendering works

### Tier 2 — Should Have (this PR)

8. Loading states render
9. Error states render gracefully
10. Demo banner can be dismissed
11. Safety wording on all tabs

### Tier 3 — Future

12. Real API integration (with seeded data)
13. Cross-browser matrix (Firefox, Safari)
14. Accessibility audit (axe-core)
15. Visual regression (percy)
16. Full patient CRUD workflow
