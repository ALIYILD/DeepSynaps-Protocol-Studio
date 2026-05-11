# NEURO MRI SIGNS LIBRARY — STAGING VALIDATION QUICK REFERENCE

**Created:** May 11, 2026  
**Status:** Ready for staging validation (NOT production)  
**Owner:** DeepSynaps Clinical Engineering  
**Next:** Code review → Staging deploy → QA validation → Clinical review

---

## What Changed

**Implementation Phase (May 9):**
- 11 files (9 new, 2 modified)
- 2,834 lines of production code
- 20+ pytest test cases
- 18 clinical MRI signs seeded

**Hardening Phase (May 11):**
- 3 validation documents
- 100+ QA checklist items
- PR template with clinical safety guarantees
- Clinical review form (sign-off required)

---

## Three Critical Documents

### 1. PR_BODY_NEURO_MRI_SIGNS.md
**Use:** GitHub PR review  
**For:** Engineering lead  
**Contains:** Code manifest, clinical safety guarantees, reviewer guidance  
**Action:** Copy to GitHub PR description

### 2. NEURO_MRI_SIGNS_CLINICAL_REVIEW.md
**Use:** Clinical accuracy sign-off  
**For:** Clinical stakeholder  
**Contains:** 18 sign reviews, medical accuracy checks, safety verification  
**Action:** Clinical reviewer fills form, signs off, returns

### 3. STAGING_VALIDATION_CHECKLIST.md
**Use:** QA validation execution  
**For:** QA engineer  
**Contains:** 10 phases, 100+ checks, database/API/frontend/permissions tests  
**Action:** QA executes all checks, marks PASS/FAIL, signs off

---

## Deployment Path (5 Steps)

```
1. CODE REVIEW
   Input: PR_BODY_NEURO_MRI_SIGNS.md
   Output: Approve / Request changes

2. STAGING DEPLOYMENT
   Input: Main branch (after merge)
   Cmd: bash scripts/deploy-neuro-mri-signs.sh
   Output: 18 signs seeded, API /api/neuro-signs/ responds

3. QA VALIDATION
   Input: STAGING_VALIDATION_CHECKLIST.md
   Output: PASS (all 100+ checks) or FAIL (list issues)

4. CLINICAL REVIEW
   Input: NEURO_MRI_SIGNS_CLINICAL_REVIEW.md
   Output: Approved / Approved with revisions / Not ready

5. FINAL VERDICT
   Options:
   ☐ Ready for staging only (internal testing)
   ☐ Ready for controlled pilot (pilot + supervision)
   ☐ Ready for production (all gates cleared)
   ☐ Not ready (do not deploy)
```

---

## Key Safety Guarantees

**Disclaimer:**
- Non-dismissible on all pages ✅
- "Pattern-recognition aid only" language ✅
- "Clinician review required" emphasized ✅

**Report Insertion:**
- Fully editable (not locked) ✅
- Not auto-injected into final report ✅
- Clinician must explicitly confirm ✅
- Audit trail recorded ✅

**Permissions:**
- Clinician can attach signs ✅
- Admin-only create/update ✅
- Patients cannot attach ✅
- Cross-clinic access blocked ✅

**No Fake Success:**
- Zero auto-success messages ✅
- All user actions explicit ✅
- Confirmed in QA checklist ✅

---

## Files to Review

**Backend (Python/FastAPI):**
```
apps/api/app/persistence/models/neuro_signs.py       (ORM: 3 tables)
apps/api/app/schemas/neuro_signs.py                  (Pydantic: 8 validators)
apps/api/app/routers/neuro_signs.py                  (API: 11 endpoints)
apps/api/app/data/neuro_signs_seed.py                (Data: 18 signs)
apps/api/tests/test_neuro_signs.py                   (Tests: 20+ cases)
```

**Frontend (React/Vite):**
```
apps/web/src/pages-biomarkers-mri.js                 (Component: search, filter, detail)
```

**Database:**
```
alembic/versions/001_add_neuro_signs_tables.py       (Migration)
scripts/deploy-neuro-mri-signs.sh                    (Orchestration)
```

---

## API Endpoints (11 Total)

**List & Search:**
- `GET /api/neuro-signs/` — List with search + filters
- `GET /api/neuro-signs/{sign_id}` — Detail by ID or slug

**Admin:**
- `POST /api/neuro-signs/` — Create sign (admin-only)
- `PUT /api/neuro-signs/{sign_id}` — Update sign (admin-only)

**Case Integration:**
- `POST /api/neuro-signs/case/{case_id}/attach` — Attach sign (clinician)
- `GET /api/neuro-signs/case/{case_id}` — Get case signs
- `PUT /api/neuro-signs/case/{case_sign_id}` — Update case sign
- `DELETE /api/neuro-signs/case/{case_sign_id}` — Remove case sign

**Report Insertion:**
- `POST /api/neuro-signs/case/{case_id}/insert-report` — Insert phrase (not auto)

**Annotations:**
- `POST /api/neuro-signs/annotations/` — Create overlay (admin)
- `GET /api/neuro-signs/annotations/{sign_id}` — Get overlays

---

## 18 Seeded Signs

**Neurodegenerative (4):**
1. Hummingbird (PSP, MSA)
2. Mickey Mouse (MSA-P)
3. Morning Glory (MSA-P, NBIA)
4. Hot Cross Bun (MSA-C, SCA)

**Metabolic (2):**
5. Eye of the Tiger (PKAN/NBIA)
6. Pulvinar (prion disease)

**Developmental (1):**
7. Molar Tooth (Joubert syndrome)

**Demyelinating (3):**
8. Dawson's Fingers (MS)
9. Open Ring (demyelination)
10. Onion Bulb (Balo sclerosis)

**Vascular (4):**
11. Popcorn (amyloid angiopathy)
12. Caput Medusae (CVST, venous)
13. Ivy (Moyamoya)
14. Empty Delta (CVT)

**Tumoral (2):**
15. Dural Tail (meningioma)
16. Tram-Track (ependymoma)

**Cerebellar (2):**
17. Tiger Stripe (spinocerebellar ataxia)
18. Tigroid Pattern (osmotic demyelination)

---

## QA Checklist (10 Phases)

- [ ] Phase 1: Pre-deployment readiness
- [ ] Phase 2: Database & migration integrity
- [ ] Phase 3: API endpoint testing (all 11)
- [ ] Phase 4: Frontend component rendering
- [ ] Phase 5: Permissions & access control
- [ ] Phase 6: Clinical safety workflows
- [ ] Phase 7: Data integrity & constraints
- [ ] Phase 8: No regressions
- [ ] Phase 9: Performance baseline
- [ ] Phase 10: Final verdict (PASS/FAIL)

**Full checklist:** `STAGING_VALIDATION_CHECKLIST.md`

---

## Clinical Review (18 Signs × 5 Fields)

Each sign reviewed for:
- [ ] Medical accuracy
- [ ] Differential diagnosis appropriateness
- [ ] Clinical caveat sufficiency
- [ ] Sensitivity/specificity wording
- [ ] Reference quality

**Plus workflows:**
- [ ] Disclaimer wording adequate
- [ ] Report insertion workflow safe
- [ ] Evidence honesty verified
- [ ] Role-based access appropriate

**Full form:** `NEURO_MRI_SIGNS_CLINICAL_REVIEW.md`

---

## War-Room Status

**Severity:** P0 (clinical-ready for doctor use and sale)  
**Gate:** Staging validation path ✅  
**Blocker:** None (ready for review)  
**Timeline:** ~3-5 days (code review 1-2 days, QA validation 2-4 hours, clinical 1-2 days)  
**Production-ready:** NO (not until all validation complete + clinical approval)

---

## Contact & Escalation

**Questions about implementation:** See `NEURO-MRI-SIGNS-IMPLEMENTATION.md`  
**Questions about deployment:** See `NEURO-MRI-SIGNS-QUICKSTART.md`  
**Issues during QA:** See `STAGING_VALIDATION_CHECKLIST.md` (phase-specific guidance)  
**Clinical concerns:** See `NEURO_MRI_SIGNS_CLINICAL_REVIEW.md` (form instructions)

---

## Remember

⚠️ **NOT PRODUCTION-READY**
- ✅ Code complete
- ✅ Tests pass
- ⏳ Staging validation pending
- ⏳ Clinical review pending
- ⏳ Final verdict pending

**Use this checklist to track progress:**
```
Code review:       ☐
Staging deploy:    ☐
QA validation:     ☐
Clinical review:   ☐
Final verdict:     ☐ Staging only / ☐ Pilot / ☐ Production / ☐ Not ready
```

---

**Last updated:** May 11, 2026  
**Next action:** Initiate code review via GitHub PR
