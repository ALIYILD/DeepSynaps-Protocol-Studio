# DEPLOYMENT GUIDE — Neuro MRI Signs Library

**Status:** Files created but not yet committed to git  
**Next step:** Create feature branch and push to GitHub

---

## 🚀 STEP-BY-STEP DEPLOYMENT

### Step 1: Create Feature Branch

```bash
cd /opt/DeepSynaps-Protocol-Studio
git checkout -b feat/neuro-mri-signs-library
```

### Step 2: Stage Production Files

```bash
# Backend models, schemas, routes, seed data
git add apps/api/app/persistence/models/neuro_signs.py
git add apps/api/app/schemas/neuro_signs.py
git add apps/api/app/routers/neuro_signs.py
git add apps/api/app/data/neuro_signs_seed.py

# Tests
git add apps/api/tests/test_neuro_signs.py

# Frontend
git add apps/web/src/pages-biomarkers-mri.js

# Database & deployment
git add alembic/versions/001_add_neuro_signs_tables.py
git add scripts/deploy-neuro-mri-signs.sh

# Verification
git status
```

**Expected output:** 9 files staged

### Step 3: Commit

```bash
git commit -m "feat: add Neuro MRI Signs Library for MRI analysis workflow

- Backend: 4 models/schemas/routes + 18 seeded MRI signs
- Frontend: MRI Neuromarkers tab (search, filter, detail modal)
- Tests: 20+ pytest test cases
- Database: Alembic migration (3 tables)
- Deployment: Orchestration script (5 phases)"
```

### Step 4: Push to GitHub

```bash
git push origin feat/neuro-mri-signs-library
```

### Step 5: Create GitHub PR

**On GitHub:**
1. Create pull request from `feat/neuro-mri-signs-library` → `main`
2. Title: `feat: add Neuro MRI Signs Library for MRI analysis workflow`
3. Body: Copy from `/opt/DeepSynaps-Protocol-Studio/PR_BODY_NEURO_MRI_SIGNS.md`
4. Add reviewers
5. Ensure CI passes

### Step 6: Merge to Main

**After code review approved:**
```bash
# On GitHub: Click "Merge pull request"
# Or via CLI:
git checkout main
git pull origin main
git merge --squash feat/neuro-mri-signs-library
git commit -m "feat: add Neuro MRI Signs Library for MRI analysis workflow"
git push origin main
```

### Step 7: Deploy to Live

```bash
# Pull latest main
git pull origin main

# Run deployment script
bash scripts/deploy-neuro-mri-signs.sh
```

**Script will:**
1. Run Alembic migration (create 3 tables)
2. Seed 18 MRI signs
3. Run pytest (20+ test cases)
4. Health check API
5. Print summary

### Step 8: Verify Deployment

**Check API:**
```bash
curl http://localhost:8000/api/neuro-signs/ | jq '.total'
# Should return: 18
```

**Check Frontend:**
- Navigate to `/biomarkers`
- Should see two tabs: "QEEG Neuromarkers" + "MRI Neuromarkers"
- Click "MRI Neuromarkers" tab
- Should see search box, filters, 18 sign cards

---

## 📋 DEPLOYMENT CHECKLIST

- [ ] Feature branch created: `feat/neuro-mri-signs-library`
- [ ] 9 production files staged
- [ ] Commit created with descriptive message
- [ ] Pushed to GitHub
- [ ] GitHub PR created (title + body)
- [ ] CI passing
- [ ] Code review approved
- [ ] PR merged to main
- [ ] `git pull origin main` (local)
- [ ] `bash scripts/deploy-neuro-mri-signs.sh` executed
- [ ] Health check: `GET /api/neuro-signs/` returns 18 signs
- [ ] Frontend: Biomarkers page shows MRI tab
- [ ] QA validation started (STAGING_VALIDATION_CHECKLIST.md)
- [ ] Clinical review sent (NEURO_MRI_SIGNS_CLINICAL_REVIEW.md)

---

## 🔍 VERIFICATION COMMANDS

**After deployment:**

```bash
# 1. Check database
psql $DATABASE_URL -c "SELECT COUNT(*) FROM neuro_signs;"
# Expected: 18

# 2. Check API
curl http://localhost:8000/api/neuro-signs/ | jq '.items[] | .name'
# Expected: List of 18 sign names

# 3. Check frontend (if local dev)
npm run dev
# Navigate to http://localhost:5173/biomarkers
# Click "MRI Neuromarkers" tab
# Should see all 18 signs

# 4. Run tests
pytest apps/api/tests/test_neuro_signs.py -v
# Expected: 20+ passed
```

---

## ⚠️ TROUBLESHOOTING

**Problem:** "No such table: neuro_signs"
```
Solution:
1. Check migration ran: git log | grep neuro_signs
2. Re-run migration: alembic upgrade head
3. Check DB connection: psql $DATABASE_URL
```

**Problem:** "API returns 0 signs"
```
Solution:
1. Check seed ran: SELECT COUNT(*) FROM neuro_signs;
2. Re-seed: python3 apps/api/app/data/neuro_signs_seed.py
3. Restart API: uvicorn app.main:app --reload
```

**Problem:** "MRI tab not visible on frontend"
```
Solution:
1. Check file deployed: ls apps/web/src/pages-biomarkers-mri.js
2. Check build: npm run build
3. Clear browser cache: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
4. Check console for JS errors: F12 → Console
```

---

**Status:** Ready for deployment  
**Next action:** Create feature branch and push to GitHub
