# AGENT A FINDINGS — ACTION CARD

**Created:** May 17, 2026  
**Status:** 4 issues identified, fix plan ready

---

## 🎯 IMMEDIATE PRIORITIES (Next 3-5 days)

### **P1: Remove Undeclared Globals** 🔴 **BLOCKS PHASE 3C**
```
Files: pages-protocols.js, pages-biomarkers.js
Time: 2-3 days
Blocker: Phase 3C (honest-state enforcement) depends on clean state mgmt
```

**Steps:**
```bash
# 1. Create hooks for replaced globals
apps/web/src/hooks/useProtocolDetail.js       # Replaces window._protDetailId, etc.
apps/web/src/hooks/useBiomarkerCache.js       # Replaces window.biomarkerSession, etc.

# 2. Refactor pages
# pages-protocols.js: Replace window.* with useProtocolDetail()
# pages-biomarkers.js: Replace window.* with useBiomarkerCache()

# 3. Replace window.confirm() with React modal
# Create: components/ConfirmModal.jsx

# 4. Run tests
npm test -- pages-protocols.js
npm test -- pages-biomarkers.js
```

**Success criteria:**
- ESLint: 0 global warnings
- Tests pass (27 existing + new globals-specific tests)
- Manual: Protocol detail view works, biomarker cache persists

---

### **P2: Fix MRI Router Optional Import** 🟡 **PREVENTS SILENT 500s**
```
File: apps/api/app/routers/mri_analysis_router.py
Time: 2-4 hours
Impact: Clinician-facing errors are clear, not silent
```

**Steps:**
```python
# In mri_analysis_router.py, add runtime check before overlay route:

@router.get("/api/v1/mri/overlay/{analysis_id}/{tid}", response_class=HTMLResponse)
async def get_mri_overlay_interactive(
    analysis_id: str,
    tid: str,
    # ... params ...
):
    if build_viewer_payload is None:
        return JSONResponse(
            status_code=503,
            content={
                "error": "MRI pipeline not available",
                "detail": "This deployment does not include the MRI analyzer. "
                          "Install: pip install deepsynaps-mri",
                "documentation": "https://docs.deepsynaps.studio/mri-setup"
            }
        )
    # ... rest of route ...
```

**Test:**
```bash
# Run with package uninstalled
pytest apps/api/tests/test_mri_router.py::test_overlay_missing_package -xvs
# Expected: 503 Service Unavailable (not 500 Internal Server Error)
```

---

### **P3: Resolve Missing Pages** 🟡 **COMPLETES SIDEBAR NAV**
```
Files: pages-qeeg-analysis-ai-upgrades.test.js → pages-assessments.js
       pages-phenotype-analyzer-hardening.test.js → pages-phenotyping.js
       pages-treatment-sessions-analyzer-batch.test.js → pages-intervention.js
Time: 4-6 hours
Impact: 3 of 11 target routes now navigable
```

**Steps:**
```bash
# 1. Check sidebar config expectation
grep -i "pages-assessments\|pages-phenotyping\|pages-intervention" \
  apps/web/src/sidebar-config.js

# 2. Move test files to production pages
# if pages are production-ready:
mv apps/web/src/pages-qeeg-analysis-ai-upgrades.test.js \
   apps/web/src/pages-assessments.js

# Remove .test.js suffix and verify imports

# 3. Update sidebar config (if needed)
# Edit: apps/web/src/sidebar-config.js
# Change: 'path': '/qeeg-analysis-ai-upgrades'
# To: 'path': '/assessments'

# 4. Test navigation
npm run dev
# Visit: http://localhost:5173/assessments
# Verify: Page loads (not 404)
```

---

### **P4: Verify Sidebar Integration** 🟡 **VALIDATES PHASE 2**
```
Files: App.js, SidebarWrapper.jsx, sidebar-integration.js
Time: 2-3 hours
Impact: Confirms Phase 2 sidebar fully operational
```

**Steps:**
```bash
# 1. Check App.js integration
grep -A 5 "SidebarWrapper\|Sidebar" apps/web/src/App.js

# 2. Test responsive breakpoints
npm run dev
# Open browser DevTools
# Mobile (375px): Verify bottom nav or hamburger
# Tablet (768px): Verify collapsible sidebar
# Desktop (1440px): Verify full sidebar

# 3. Test badge updates
# Navigate to a page with session data
# Verify badge count updates real-time (if implemented)

# 4. Run full test suite
npm test
# Expected: All 27 sidebar tests pass
```

---

## 🧪 TEST PLAN

**After P1-P4 fixes, run:**

```bash
# Frontend
npm test                          # All tests should pass
npm run lint                      # 0 globals errors
npm run build                     # Production build succeeds

# Backend  
pytest apps/api/tests/test_mri_router.py -xvs   # MRI routes tested
pytest apps/api/tests/ -k "pages" -xvs          # All page APIs healthy

# Integration
npm run dev &                     # Start frontend
cd apps/api && uvicorn app.main:app --reload &  # Start backend
# Manual test: navigate to each of 11 pages via sidebar
```

---

## 📊 SUCCESS METRICS (Post-fix)

| Metric | Target | How to verify |
|--------|--------|---|
| **Undeclared globals** | 0 | `npm run lint` |
| **Frontend tests passing** | 27/27 | `npm test` |
| **MRI overlay endpoint** | 503 on missing pkg | `curl /api/v1/mri/overlay/...` (with pkg uninstalled) |
| **Missing pages resolved** | 3/3 navigable | Sidebar nav to each page works |
| **Sidebar responsive** | 3/3 breakpoints | Manual test at 375px, 768px, 1440px |
| **Badge updates** | Real-time | Verify updates without page reload |

---

## 🚦 EXECUTION ORDER

1. **P1** (highest priority, blocks Phase 3C): Remove globals
   - Can run in parallel with P2
   - ~2-3 days
   
2. **P2** (safety-critical, prevents silent errors): Fix MRI guard
   - ~2-4 hours
   - Can run in parallel with P1
   
3. **P3** (completes Phase 2): Resolve missing pages
   - ~4-6 hours
   - Can start after P1 globals are scoped to pages
   
4. **P4** (validation): Verify sidebar integration
   - ~2-3 hours
   - Run after P3

**Parallel possible:** P1 + P2 can run simultaneously (different repos: web vs api)  
**Total time (sequential):** ~10-15 days  
**Total time (parallel):** ~7-10 days

---

## 📋 SIGN-OFF CHECKLIST

Before Agent B (Canonical Contracts) starts:
- [ ] P1: Globals removed, ESLint clean
- [ ] P2: MRI guard catches missing package gracefully
- [ ] P3: All 11 pages navigable via sidebar
- [ ] P4: Sidebar responsive, badges update
- [ ] All tests pass
- [ ] Commit message: "fix(phase3): Agent A findings — remove globals, fix MRI guard, complete missing pages"

---

**Next Agent:** B (Canonical Contract Definition) — can start immediately, runs in parallel with these fixes.

**Status:** 🟡 **YELLOW (fixable)** — No blockers, phased approach recommended.
