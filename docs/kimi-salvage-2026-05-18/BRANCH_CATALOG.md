# DeepSynaps Protocol Studio — Complete Branch Catalog

**Generated:** 2026-05-17
**Repository:** https://github.com/ALIYILD/DeepSynaps-Protocol-Studio
**Latest commit on master:** `55b48e67` (docs: Night shift autonomous report)

---

## Summary

| Category | Count | Branches |
|----------|-------|----------|
| Master/Main | 2 | master, main |
| Agent Work (Phase 3) | 3 | agent-api-frontend, agent-core-engines, agent-reasoning-engines |
| Agent Work (Phase 4) | 4 | deeptwin-core, deeptwin-review, deeptwin-api-frontend, research-phase4 |
| Feature Branches | 3 | feat/ai-core-pages, feat/evidence-aware-agents, feat/production-infrastructure |
| Fix Branches | 5 | fix/api-migrations, fix/e2e-guardian, fix/guard-movement, fix/patient-portal, fix/web-unit-timeout |
| Archive Branches | 6 | archive/agent-parallel-universe-* |
| Salvage Branches | 5 | salvage/agent-config, salvage/dom-polyfill, salvage/honest-empty-state, salvage/netlify, salvage/video-assessments |
| Security Branches | 2 | security/code-scanning-tier1, security/container-cve-remediation-tier2 |
| Test Branches | 1 | test/frontend-coverage-branch-threshold |
| Chore Branches | 1 | chore/delete-literature-local-knowledge-orphan-tests |
| Docs Branches | 1 | docs/salvage-pr-governance |
| Governance Hardening | 1 | feat/governance-operational-hardening |
| **TOTAL** | **34** | |

---

## 1. MASTER (Primary Branch) — 42 Commits

**Active branch:** `master` (also `origin/master`)
**Latest commit:** `55b48e67` — docs: Night shift autonomous report

### Full Commit History (most recent first)

| # | Commit | Message | Category |
|---|--------|---------|----------|
| 1 | `55b48e67` | docs: Night shift autonomous report | Documentation |
| 2 | `3534e3b7` | NIGHT SHIFT: 428 new tests + coverage boost | Tests |
| 3 | `0b5b16b3` | docs: CI validation report for commit 49654ca7 | Documentation |
| 4 | `91d8a0db` | CI FIX v2: PYTHONPATH + npm cache fallback | CI/CD |
| 5 | `b66b5cda` | CI FIX: Patch workflow YAML syntax and E2E cache paths | CI/CD |
| 6 | `49654ca7` | P1 FIX SPRINT: 37+ fixes, 75 new tests, 2,465 lines docs | Fixes |
| 7 | `4dab316c` | P0 FIX SPRINT: All 24 P0 blockers resolved | Critical Fixes |
| 8 | `0fcab3b4` | MASSIVE AUDIT: Full deployment readiness audit (6 dimensions) | Audit |
| 9 | `78e1911f` | CAPSTONE: Execution Freeze + Stabilization + Pilot Report | Documentation |
| 10 | `1168c745` | PR #15: Production Launch Candidate Freeze & Readiness Gate | PR |
| 11 | `9198f3b8` | PR #14: Controlled Beta Pilot Operations & Feedback Loop | PR |
| 12 | `7464e3f5` | PR #13: Beta Launch Documentation, Onboarding, Clinic Pilot Pack | PR |
| 13 | `2ca4f1b1` | PR #10: datetime Deprecation Fixes | PR |
| 14 | `d61e750c` | PR #9: Materialized Views Readiness | PR |
| 15 | `67f0385c` | PR #8: Evidence Links for 3 Core Analyzers | PR |
| 16 | `2046f0fe` | PR #7: Frontend E2E Tests for Doctor-Ready Beta | PR |
| 17 | `ae75cab4` | PR #6: DEMO_MODE env var + global demo/non-PHI banner | PR |
| 18 | `93011c22` | PR #5: Redis Patient Cache — cache metadata + docs | PR |
| 19 | `9bbd99a7` | PR #4: Summary Endpoints — Performance & Contract Hardening | PR |
| 20 | `fb44f55e` | PR #5: Redis Patient Cache | PR |
| 21 | `5ef4af24` | feat(PR#4): summary endpoints for performance | Feature |
| 22 | `8a50b916` | feat(PR#3): GZip response compression hardening | Feature |
| 23 | `7755361e` | feat(PR#2): composite database indexes | Feature |
| 24 | `5bb844b0` | feat(PR#1): PostgreSQL migration hardening | Feature |
| 25 | `93354d94` | stabilize: final report | Stabilization |
| 26 | `5ab4360d` | stabilize: role/access hardening + consent governance + audit sweep | Stabilization |
| 27 | `84f77d6c` | stabilize: contract audit + frontend/backend alignment + safety sweep | Stabilization |
| 28 | `fefe3515` | stabilize: safety wording sweep + DeepTwin audit + demo mode audit | Stabilization |
| 29 | `90c6c79f` | docs: Phase 4 DeepTwin Intelligence Report + frontend + API tests | Documentation |
| 30 | `69efecc5` | feat: Phase 4 DeepTwin | Feature |
| 31 | `24dea4e1` | Merge branch 'deeptwin-review' | Merge |
| 32 | `3accbf22` | feat: DeepTwin clinician review engine + workflow | Feature |
| 33 | `27ec2951` | feat: DeepTwin snapshot + export + audit engines | Feature |
| 34 | `78e1b018` | spec: Phase 4 SPEC + DeepTwin contracts | Spec |
| 35 | `fecd3909` | chore: add GitHub push script | Chore |
| 36 | `c610d9c3` | chore: update .gitignore for production | Chore |
| 37 | `653321e6` | docs: Phase 3 Multimodal Intelligence Report | Documentation |
| 38 | `2972f508` | fix: datetime timezone handling, modality naming consistency | Fix |
| 39 | `2a53b1cf` | merge: API + frontend | Merge |
| 40 | `cb472d26` | merge: reasoning engines | Merge |
| 41 | `ad471ca5` | feat: API endpoints + frontend components + synthesis orchestration | Feature |
| 42 | `f9d6d397` | feat: SPEC.md for Phase 3 Multimodal Intelligence Engine | Spec |

---

## 2. MAIN Branch

| Field | Value |
|-------|-------|
| **Branch** | `main` (remote) |
| **Latest commit** | `d0a2d2d9` |
| **Status** | Diverged from master — contains earlier work |
| **Relationship** | `main` was the original branch before `master` became primary |
| **Recommendation** | Archive or delete — `master` is the active branch |

---

## 3. Agent Work Branches (Phase 3 — Multimodal Intelligence)

These branches contain parallel agent work from Phase 3 development.

### agent-api-frontend
| Field | Value |
|-------|-------|
| **Latest commit** | `ad471ca5` |
| **Purpose** | API endpoints + React frontend components + synthesis orchestration |
| **Key files** | main.py, frontend pages, api.js, contracts.js |
| **Status** | MERGED into master (commit 41) |
| **Merge commit** | `ad471ca5` (directly on master) |

### agent-core-engines
| Field | Value |
|-------|-------|
| **Latest commit** | `a56286c2` |
| **Purpose** | Timeline engine + correlation engine + confound engine |
| **Key files** | timeline_engine.py, correlation_engine.py, confound_engine.py |
| **Status** | MERGED into master (commit 39) |
| **Merge commit** | `cb472d26` |

### agent-reasoning-engines
| Field | Value |
|-------|-------|
| **Latest commit** | `2aea98df` |
| **Purpose** | Evidence engine + hypothesis engine + missing data engine |
| **Key files** | evidence_engine.py, hypothesis_engine.py, missing_data_engine.py |
| **Status** | MERGED into master (commit 39) |
| **Merge commit** | `cb472d26` |

---

## 4. Agent Work Branches (Phase 4 — DeepTwin)

### deeptwin-core
| Field | Value |
|-------|-------|
| **Latest commit** | `27ec2951` |
| **Purpose** | DeepTwin snapshot engine + export engine + audit engine |
| **Key files** | deeptwin_snapshot.py, deeptwin_export.py, deeptwin_audit.py |
| **Status** | MERGED into master (commit 34) |
| **Merge commit** | `69efecc5` |

### deeptwin-review
| Field | Value |
|-------|-------|
| **Latest commit** | `3accbf22` |
| **Purpose** | DeepTwin clinician review engine + workflow (accept/reject/note/request_data) |
| **Key files** | deeptwin_review.py, review workflow frontend |
| **Status** | MERGED into master (commit 31) |
| **Merge commit** | `24dea4e1` (Merge branch 'deeptwin-review') |

### deeptwin-api-frontend
| Field | Value |
|-------|-------|
| **Latest commit** | `78e1b018` |
| **Purpose** | DeepTwin API endpoints + frontend components |
| **Key files** | DeepTwin pages, API handlers |
| **Status** | MERGED into master (commit 30) |
| **Merge commit** | `69efecc5` |

### research-phase4
| Field | Value |
|-------|-------|
| **Latest commit** | `78e1b018` |
| **Purpose** | Phase 4 DeepTwin research and specification |
| **Key files** | SPEC-PHASE4.md, research documents |
| **Status** | MERGED into master (commit 35) |
| **Merge commit** | `78e1b018` |

---

## 5. Feature Branches (feat/*)

### feat/ai-core-pages
| Field | Value |
|-------|-------|
| **Latest commit** | `f950f03d` |
| **Purpose** | AI core dashboard pages |
| **Status** | On remote, not merged to master |

### feat/evidence-aware-agents
| Field | Value |
|-------|-------|
| **Latest commit** | `af1c6d6c` |
| **Purpose** | Evidence-aware agent system |
| **Status** | On remote, not merged to master |

### feat/production-infrastructure
| Field | Value |
|-------|-------|
| **Latest commit** | `d2bf050c` |
| **Purpose** | Production infrastructure setup (Docker, CI/CD) |
| **Status** | Partially superseded by master commits |

### feat/governance-operational-hardening
| Field | Value |
|-------|-------|
| **Latest commit** | `867179db` |
| **Purpose** | Governance and operational hardening |
| **Status** | On remote, partially merged into master via PR #15 |

---

## 6. Fix Branches (fix/*)

### fix/api-migrations-agent-configs-lineage
| Field | Value |
|-------|-------|
| **Latest commit** | `8338f37e` |
| **Purpose** | API migration fixes + agent configs + lineage |
| **Status** | On remote, not merged |

### fix/e2e-guardian-portal-render-ready
| Field | Value |
|-------|-------|
| **Latest commit** | `43493c50` |
| **Purpose** | E2E guardian portal rendering fixes |
| **Status** | On remote, not merged |

### fix/guard-movement-analyzer-router
| Field | Value |
|-------|-------|
| **Latest commit** | `57443b52` |
| **Purpose** | Guard movement analyzer routing fixes |
| **Status** | On remote, not merged |

### fix/patient-portal-dual-review-fixture
| Field | Value |
|-------|-------|
| **Latest commit** | `4df018fd` |
| **Purpose** | Patient portal dual review fixture |
| **Status** | On remote, not merged |

### fix/web-unit-timeout-bisect
| Field | Value |
|-------|-------|
| **Latest commit** | `4f0a03e7` |
| **Purpose** | Web unit test timeout fixes (bisect) |
| **Status** | On remote, not merged |

---

## 7. Archive Branches (archive/*)

These branches contain archived parallel agent work.

| Branch | Latest Commit | Description |
|--------|---------------|-------------|
| `archive/agent-parallel-universe-master` | `2ca4f1b1` | Archived master snapshot at PR #10 |
| `archive/agent-parallel-universe-agent-api-frontend` | `ad471ca5` | Archived API+frontend agent work |
| `archive/agent-parallel-universe-agent-core-engines` | `a56286c2` | Archived core engines agent work |
| `archive/agent-parallel-universe-agent-reasoning-engines` | `2aea98df` | Archived reasoning engines agent work |
| `archive/agent-parallel-universe-deeptwin-core` | `27ec2951` | Archived DeepTwin core agent work |
| `archive/agent-parallel-universe-deeptwin-review` | `3accbf22` | Archived DeepTwin review agent work |

**Note:** These are safety archives created before merging parallel agent work into master.

---

## 8. Salvage Branches (salvage/*)

Experimental or abandoned work salvaged for reference.

| Branch | Latest Commit | Description |
|--------|---------------|-------------|
| `salvage/agent-config-per-clinic` | `dcdd308d` | Per-clinic agent configuration |
| `salvage/dom-polyfill-patient-analytics-test` | `c2ad474c` | DOM polyfill for patient analytics |
| `salvage/honest-empty-state-toasts` | `1864156b` | Empty state and toast notifications |
| `salvage/netlify-no-cache-headers` | `23808a00` | Netlify deployment without cache headers |
| `salvage/video-assessments-feedback-draft` | `a985abe8` | Video assessments and feedback (draft) |

---

## 9. Security Branches (security/*)

| Branch | Latest Commit | Description |
|--------|---------------|-------------|
| `security/code-scanning-tier1` | `25dfd842` | Tier 1 code scanning security |
| `security/container-cve-remediation-tier2` | `314681e9` | Tier 2 container CVE remediation |

---

## 10. Test Branches (test/*)

| Branch | Latest Commit | Description |
|--------|---------------|-------------|
| `test/frontend-coverage-branch-threshold` | `7c1f3f53` | Frontend coverage branch threshold testing |

---

## 11. Chore Branches (chore/*)

| Branch | Latest Commit | Description |
|--------|---------------|-------------|
| `chore/delete-literature-local-knowledge-orphan-tests` | `32ccc375` | Delete orphaned literature/local knowledge tests |

---

## 12. Docs Branches (docs/*)

| Branch | Latest Commit | Description |
|--------|---------------|-------------|
| `docs/salvage-pr-governance` | `d3459b77` | Salvage PR governance documentation |

---

## Branch Status Summary

| Status | Count | Branches |
|--------|-------|----------|
| **Merged to master** | 7 | agent-api-frontend, agent-core-engines, agent-reasoning-engines, deeptwin-core, deeptwin-review, deeptwin-api-frontend, research-phase4 |
| **Active (master)** | 1 | master |
| **Diverged (legacy)** | 1 | main |
| **On remote only** | 18 | feat/* (3), fix/* (5), salvage/* (5), security/* (2), test/* (1), chore/* (1), docs/* (1) |
| **Archive** | 6 | archive/* (6) |
| **Local tracking** | 7 | master + 6 agent branches |
| **TOTAL** | **34** | |

---

## Recommendation

### Keep (Active)
- `master` — primary branch with all 42 commits

### Archive/Delete (Stale)
- `main` — diverged from master, no longer primary
- All `archive/*` branches — already archived
- Consider merging `feat/*`, `fix/*`, `salvage/*` branches into master or deleting if superseded

### Review for Merge
- `feat/ai-core-pages` — may contain useful dashboard pages
- `feat/evidence-aware-agents` — may contain useful agent logic
- `fix/*` branches — may contain bug fixes not yet in master
- `salvage/*` branches — may contain useful experimental features

---

*Generated by Kimi Agent*
*Date: 2026-05-17*
*Commits on master: 42*
*Total branches: 34 (7 merged, 1 active, 26 pending/archived)*
