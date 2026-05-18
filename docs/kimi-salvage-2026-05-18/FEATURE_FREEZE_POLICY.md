# Feature Freeze Policy — DeepSynaps Protocol Studio
## Production Launch Candidate Freeze

| Attribute | Value |
|-----------|-------|
| **Document Version** | 1.0.0 |
| **Freeze Effective Date** | 2026-05-17 |
| **Policy Owner** | Engineering Director |
| **Review Authority** | Safety Governance Board + Ops Lead |
| **Classification** | Production-Critical |

---

## 1. Purpose & Scope

### 1.1 Purpose

This document establishes the **Feature Freeze Policy** for the DeepSynaps Protocol Studio (DSPS) production launch candidate. Effective 2026-05-17, all new feature development ceases. The codebase enters **validation-only mode** in which the sole permitted activities are defect remediation, security hardening, documentation refinement, test expansion, safety wording corrections, performance regression remediation, and operational runbook updates.

### 1.2 Scope

This freeze applies to:

- All source code in the `apps/api/src/deepsynaps/` backend tree
- All source code in the `apps/web/src/` frontend tree
- All test suites under `apps/api/tests/` and `apps/web/e2e/`
- All configuration, deployment, and infrastructure manifests
- All clinical safety governance rules, evidence contracts, and audit instrumentation
- All operational documentation, runbooks, and launch collateral

### 1.3 What "Validation-Only Mode" Means

| Allowed | Prohibited |
|---------|------------|
| Bug fixes with traceable ticket IDs | New API endpoints or route handlers |
| Security patch application | New database tables, columns, or migrations |
| Documentation corrections and additions | New frontend pages or major component additions |
| Test case additions and flake remediation | New engine modules or analyzer pipelines |
| Safety wording and label corrections | New environment variables or config knobs |
| Performance regression remediation (>5% threshold) | New caching layers or data store integrations |
| Ops runbook updates driven by incident findings | Changes to RBAC role definitions or permission matrices |
| EvidenceLink schema clarification (non-breaking) | Breaking changes to EvidenceLink 19-field contract |

---

## 2. Freeze Effective Date

### 2.1 Effective Timestamp

**Feature freeze takes effect at 00:00 UTC on 2026-05-17.**

All pull requests opened before this timestamp and already in review may complete their merge cycle provided they meet the criteria in Section 6 (Change Control Process). Any pull request opened at or after this timestamp is subject to freeze enforcement unless it falls within the acceptable change categories defined in Section 5.

### 2.2 Freeze Duration

The freeze remains in effect until one of the exit criteria in Section 7 is satisfied. There is no automatic expiration.

### 2.3 Timezone Reference

All dates and times in this policy are expressed in **UTC**. Local conversions:

| Location | Local Time on 2026-05-17 |
|----------|-------------------------|
| UTC | 00:00 |
| US/Eastern (EDT) | 20:00 on 2026-05-16 |
| US/Pacific (PDT) | 17:00 on 2026-05-16 |
| Europe/London (BST) | 01:00 on 2026-05-17 |
| Europe/Berlin (CEST) | 02:00 on 2026-05-17 |
| Asia/Tokyo (JST) | 09:00 on 2026-05-17 |

---

## 3. Frozen Components

### 3.1 Backend Source Files (`apps/api/src/deepsynaps/`)

| Category | File(s) | Size / Line Count | Freeze Note |
|----------|---------|-------------------|-------------|
| **FastAPI Application Core** | `main.py` | 48 KB | 30+ endpoints frozen; no new routes |
| **Access Control** | `access_control.py` | 636 lines | 5-role RBAC frozen; no role additions |
| **Safety Governance** | `safety_governance.py` | 122 lines | 13 disallowed patterns frozen; confidence cap 0.95 locked |
| **Cache Service** | `cache_service.py` | 11 KB | Redis + `_MockRedis` fallback frozen |
| **Materialized Views** | `materialized_views.py` | 15 KB | 2 MVs with SQLite fallback frozen |
| **Evidence Contracts** | `contracts.py` | 11 KB | 19-field `EvidenceLink` schema frozen |
| **Configuration** | `config.py` | 6 KB | Env config with production guards frozen |
| **Time Utilities** | `time_utils.py` | 6 UTC helpers | `utc_now()` aware datetime frozen |
| **Database Layer** | `database.py` | 13 KB | Dialect-aware DB layer frozen |
| **Summary Engine** | `summary_engine.py` | 26 KB | 4 summary endpoints frozen |
| **Confound Engine** | `confound_engine.py` | — | Analyzer engine frozen |
| **Correlation Engine** | `correlation_engine.py` | — | Analyzer engine frozen |
| **Evidence Engine** | `evidence_engine.py` | — | Analyzer engine frozen |
| **Hypothesis Engine** | `hypothesis_engine.py` | — | Analyzer engine frozen |
| **Missing Data Engine** | `missing_data_engine.py` | — | Analyzer engine frozen |
| **Timeline Engine** | `timeline_engine.py` | — | Analyzer engine frozen |
| **Synthesis Service** | `synthesis_service.py` | — | Synthesis pipeline frozen |
| **Knowledge Layer** | `knowledge_layer.py` | — | Knowledge graph layer frozen |
| **DeepTwin — Snapshot** | `deeptwin_snapshot.py` | — | DeepTwin module frozen |
| **DeepTwin — Export** | `deeptwin_export.py` | — | DeepTwin module frozen |
| **DeepTwin — Audit** | `deeptwin_audit.py` | — | DeepTwin module frozen |
| **DeepTwin — Review** | `deeptwin_review.py` | — | DeepTwin module frozen |
| **DeepTwin — Contracts** | `deeptwin_contracts.py` | — | DeepTwin module frozen |
| **Audit Logger** | `audit_logger.py` | — | Audit instrumentation frozen |
| **TOTAL BACKEND FILES** | **24 files** | **~130 KB+ source** | **All frozen** |

### 3.2 Frontend Source Files (`apps/web/src/`)

| Category | File(s) | Size / Line Count | Freeze Note |
|----------|---------|-------------------|-------------|
| **Safety Contracts** | `contracts.js` | 31 KB | Safety labels, prohibited terms, validation functions frozen |
| **API Client** | `api.js` | — | API integration layer frozen |
| **Application Entry** | `main.jsx` | — | Bootstrap and routing frozen |
| **Demo Mode Banner** | `components/DemoModeBanner.jsx` | — | Global fixed demo/non-PHI banner frozen |
| **Evidence Links Card** | `components/EvidenceLinksCard.jsx` | — | Evidence card with grade badges frozen |
| **DeepTwin Pages** | `pages-deeptwin/*.jsx` | 12 pages | All 12 DeepTwin pages frozen |
| **TOTAL FRONTEND FILES** | **17+ files** | **~31 KB+ contracts alone** | **All frozen** |

### 3.3 Test Suites

| Test Suite | Location | File Count | Test Count | Freeze Note |
|------------|----------|------------|------------|-------------|
| **Backend Tests** | `apps/api/tests/` | 25 test files | — | Existing tests frozen; additions allowed per Section 5 |
| **Frontend E2E Tests** | `apps/web/e2e/` | 5 spec files | 22 tests | Playwright tests across 4 browser projects; additions allowed per Section 5 |
| **E2E Fixtures** | `apps/web/e2e/` | fixtures/ | — | Page object models and fixtures frozen |
| **TOTAL TEST FILES** | — | **30+ files** | **22+ E2E tests** | **Additions permitted; modifications restricted** |

### 3.4 Completed Pull Request Freeze Inventory

The following 14 pull requests constitute the **frozen baseline**. No retroactive modifications to their deliverables are permitted.

| PR # | Title | Deliverable | Status |
|------|-------|-------------|--------|
| PR #1 | PostgreSQL Migration | Dialect-aware database adapter | Frozen |
| PR #2 | Composite Database Indexes | 9 composite indexes | Frozen |
| PR #3 | GZip Response Compression | Response compression middleware | Frozen |
| PR #4 | Summary Endpoints | 4 typed endpoints, 98% payload reduction | Frozen |
| PR #5 | Redis Patient Cache | Optional Redis with `_MockRedis` fallback | Frozen |
| PR #6 | DEMO_MODE Environment Variable | Global demo/non-PHI banner | Frozen |
| PR #7 | Frontend E2E Tests | Playwright: 22 tests, 4 browser projects | Frozen |
| PR #8 | Evidence Links for 3 Core Analyzers | 19-field `EvidenceLink` contract | Frozen |
| PR #9 | Materialized Views | 2 MVs with SQLite fallback | Frozen |
| PR #10 | datetime Deprecation Fixes | `utc_now()` aware datetime (6 helpers) | Frozen |
| PR #13 | Beta Launch Documentation | 7 docs (launch pack, onboarding, training, patient portal, success metrics, support/escalation, risk register) | Frozen |
| PR #14 | Beta Pilot Operations | 7 docs (ops dashboard, feedback workflow, safety incidents, release notes, feedback schema, weekly review, PR prioritization) | Frozen |

---

## 4. Classification of Open Work

All feature proposals, backlog items, and in-flight work not covered by the 14 frozen PRs are classified below. No work classified as **DEFERRED** or **CUT** may be commenced during the freeze. **POST-LAUNCH** items may enter planning but may not touch production code until the freeze exits per Section 7.

| PR / Idea | Status | Classification | Rationale |
|-----------|--------|----------------|-----------|
| Real-time streaming synthesis | Not started | **DEFERRED** | Requires new WebSocket infrastructure and back-pressure handling; high complexity, low launch-criticality. Deferred to post-launch roadmap. |
| LLM integration | Not started | **DEFERRED** | Third-party LLM integration introduces unquantified clinical safety risk, hallucination vectors, and latency variance. Governance review required before any implementation. |
| Multi-clinic federation | Not started | **DEFERRED** | Cross-clinic data federation requires HIPAA BAA chain-of-custody validation and inter-organizational consent workflows. Not required for single-clinic launch. |
| Advanced analytics dashboard v2 | Not started | **DEFERRED** | Dashboard v2 introduces new visualization components and drill-down interactions. Current v1 dashboard satisfies launch requirements. |
| Patient mobile app | Not started | **DEFERRED** | Native mobile application requires separate security audit, app store compliance, and mobile-specific PHI safeguards. Scope is post-launch. |
| Evidence link auto-refresh | Planned | **POST-LAUNCH** | Automatic refreshing of evidence links when underlying data changes. Valuable enhancement but current manual refresh is sufficient for launch. Scheduled for first post-launch iteration. |
| Confounder ML enrichment | Planned | **POST-LAUNCH** | Machine learning enrichment of confounder detection beyond rule-based heuristics. Requires labeled training data and model validation pipeline not yet established. |
| Additional materialized views | Planned | **POST-LAUNCH** | Beyond the 2 existing MVs (`materialized_views.py`, 15 KB). Performance monitoring during beta will inform which additional views are needed. |
| Autonomous diagnosis mode | Proposed | **CUT** | Permanently removed from roadmap. Any mode that generates diagnoses without mandatory clinician review violates the platform's safety-first governance model and `safety_governance.py` confidence cap of 0.95. |
| Direct patient-facing AI | Proposed | **CUT** | Permanently removed from roadmap. Direct AI-to-patient interaction without clinician intermediation is outside the CDSS scope and introduces unmanageable liability and consent complexity. |
| Unsupervised hypothesis generation | Proposed | **CUT** | Permanently removed from roadmap. Hypothesis generation without human oversight and evidence grounding contradicts the 19-field `EvidenceLink` contract and the 13 disallowed safety patterns in `safety_governance.py`. |

### 4.1 Classification Legend

| Classification | Definition | Code Impact During Freeze |
|----------------|------------|---------------------------|
| **DEFERRED** | Feature retained on roadmap; implementation postponed indefinitely | None. Design docs may be drafted in `docs/deferred/`. |
| **POST-LAUNCH** | Feature planned for first or second iteration after launch | None. May create tracking issues in project management tool only. |
| **CUT** | Feature permanently removed from roadmap | None. Related code or branches must be deleted before launch. |

---

## 5. Acceptable Changes During Freeze

The following six change categories are permitted during the freeze window. All changes must follow the approval flow in Section 6.

### 5.1 Bug Fixes

- Any defect with a traceable ticket ID (format: `DSPS-BUG-XXXX`)
- Must include a regression test unless the bug is in test infrastructure itself
- Severity threshold: all severities allowed; P0/P1 require expedited review
- Must not introduce new dependencies

### 5.2 Security Patches

- CVE remediation with published advisory
- Dependency version bumps for security fixes only (not feature releases)
- RBAC permission corrections (narrowing, not expansion)
- `safety_governance.py` pattern additions if new attack vector discovered
- Security patch merges require both a security reviewer and the ops lead

### 5.3 Documentation Updates

- Corrections to factual errors in the 14 launch documents (PR #13 and PR #14 deliverables)
- Onboarding guide updates driven by beta pilot feedback
- API documentation alignment with actual endpoint behavior in `main.py`
- Runbook updates per Section 5.6
- No new document categories; only refinements to existing 14 docs

### 5.4 Test Additions and Flake Remediation

- New test cases in `apps/api/tests/` (25-file suite) to increase coverage
- New Playwright E2E tests in `apps/web/e2e/` (5-spec suite, 4 browser projects)
- Test flake remediation without changing assertions or test intent
- Test infrastructure fixes (fixture updates, mock alignment)
- Target: maintain or increase current coverage levels

### 5.5 Safety Wording Corrections

- Corrections to safety labels in `contracts.js` (31 KB safety contract layer)
- Wording adjustments in `safety_governance.py` (13 disallowed patterns) for clarity
- `EvidenceLink` 19-field display label corrections (non-schema changes)
- Demo/non-PHI banner text updates in `components/DemoModeBanner.jsx`
- All wording changes require safety reviewer approval

### 5.6 Performance Regression Remediation

| Threshold | Action Required | Approval |
|-----------|----------------|----------|
| >5% latency regression on any of the 4 summary endpoints | Mandatory remediation + hotfix | Ops lead + safety reviewer |
| >10% payload increase on summary responses (violates 98% reduction baseline) | Mandatory remediation | Ops lead |
| >5% DB query time regression on materialized view paths | Mandatory remediation + index review | Ops lead + database reviewer |
| Cache hit rate drops below 90% on Redis-enabled deployments | Investigation + remediation | Ops lead |
| Playwright E2E suite execution exceeds 10 minutes | Flake/remediation review | Engineering lead |

### 5.7 Ops Runbook Updates

- Updates to the 7 PR #14 operational documents driven by incident or near-miss findings
- Weekly review template adjustments
- Feedback workflow modifications based on operational experience
- Safety incident reporting template updates
- All runbook updates require ops lead sign-off

---

## 6. Change Control Process

### 6.1 Approval Flow

All changes during the freeze must traverse the following approval workflow:

```
┌─────────┐    ┌─────────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Author │───▶│  Safety Reviewer │───▶│   Ops Lead   │───▶│   Merge to   │───▶│   Deploy to  │
│ (opens  │    │ (clinical safety │    │ (production │    │   `main`    │    │   staging    │
│   PR)   │    │   + governance)  │    │   readiness) │    │  (2 req'd)  │    │  (smoke test)│
└─────────┘    └─────────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
      │                │                      │                                    │
      │                │                      │                                    ▼
      │                │                      │                            ┌─────────────┐
      │                │                      │                            │   Deploy to  │
      │                │                      │                            │  production  │
      │                │                      │                            │  (ops lead)  │
      │                │                      │                            └─────────────┘
      │                │                      │
      ▼                ▼                      ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│  REJECTION PATH: Any approver may reject with written rationale. Author must address and    │
│  resubmit through full flow. No "override" except emergency unfreeze per Section 7.3.       │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Required Approvals by Change Type

| Change Category | Safety Reviewer | Ops Lead | Second Approver | Total Approvals |
|-----------------|-----------------|----------|-----------------|-----------------|
| Bug fix (backend) | Required | Required | Any backend maintainer | **2** |
| Bug fix (frontend) | Required | Not required | Frontend lead | **2** |
| Security patch | Required | Required | Security reviewer | **2** |
| Documentation update | Required | Required | — | **2** |
| Test addition | Not required | Not required | Test lead | **1** |
| Safety wording correction | **Required** | Required | — | **2** |
| Performance regression fix | Required | Required | Performance reviewer | **2** |
| Ops runbook update | Not required | **Required** | — | **1** |

### 6.3 Pull Request Requirements

Every freeze-period PR must include:

1. **Classification tag** in PR title: `[FREEZE-BUGFIX]`, `[FREEZE-SECURITY]`, `[FREEZE-DOCS]`, `[FREEZE-TEST]`, `[FREEZE-SAFETY]`, `[FREEZE-PERF]`, or `[FREEZE-OPS]`
2. **Rationale section** explaining why this change is permitted under Section 5
3. **Impact statement** listing every frozen file touched and justification
4. **Regression test** for all bug fixes and performance changes
5. **Safety review sign-off** comment from the safety reviewer
6. **Ops lead sign-off** comment from the ops lead (where required per table above)

### 6.4 Merge Requirements

- **2 approving reviews** are mandatory for any backend code change (regardless of category)
- All CI checks must pass (backend 25-file test suite + Playwright 22-test E2E suite across 4 browser projects)
- Branch must be up-to-date with `main` before merge
- Squash merge only; commit message must reference the freeze classification tag

### 6.5 Emergency Merge Exception

In the event of a production incident (P0) requiring immediate code change:

1. Ops lead may authorize an emergency merge with single approval
2. Safety reviewer must be notified within 15 minutes of merge
3. Retrospective review must be completed within 24 hours
4. Engineering director must be notified within 1 hour
5. Post-incident review document must be filed in the safety incident log (per PR #14 deliverable)

---

## 7. Freeze Exit Criteria

The feature freeze terminates upon satisfaction of **any one** of the following three conditions:

### 7.1 Go/No-Go Pass

All go/no-go checklist items pass:

| Checkpoint | Owner | Pass Criteria |
|------------|-------|---------------|
| Backend test suite | QA Lead | All 25 test files pass; coverage >= current baseline |
| E2E test suite | QA Lead | All 22 Playwright tests pass across all 4 browser projects |
| Safety governance audit | Safety Reviewer | All 13 disallowed patterns active; confidence cap 0.95 enforced; no bypasses |
| Performance benchmark | Ops Lead | All 4 summary endpoints meet latency baseline; 98% payload reduction verified |
| Security scan | Security Reviewer | Zero critical/high CVEs; RBAC 5-role matrix validated |
| Documentation completeness | Engineering Director | All 14 PR deliverables documented and reviewed |
| Operational readiness | Ops Lead | All 7 PR #14 ops docs reviewed; feedback workflow tested |
| Clinical safety review | Safety Governance Board | EvidenceLink 19-field contract validated; demo banner active in DEMO_MODE |

### 7.2 Launch Completion

The production launch is declared complete when:

1. Deployment to production environment succeeds with zero rollback
2. Smoke tests pass against production endpoints
3. Ops dashboard (PR #14) shows all-green health indicators for 4 consecutive hours
4. First successful end-to-end patient case processed through the full pipeline
5. Engineering director and ops lead jointly sign the launch completion certificate

### 7.3 Emergency Unfreeze

The Engineering Director may authorize an emergency unfreeze if:

1. A critical business requirement emerges that cannot be addressed through acceptable changes (Section 5)
2. A regulatory mandate requires code changes not permitted under the freeze
3. The go/no-go assessment reveals a systematic deficiency requiring feature-level remediation

**Emergency unfreeze requires:**
- Written authorization from the Engineering Director with business/regulatory justification
- Notification to all stakeholders within 1 hour
- Updated timeline and revised freeze re-entry plan
- Safety Governance Board review within 48 hours

---

## 8. Version Policy

### 8.1 Tag Format

All freeze-period releases use the following semantic versioning schema:

```
v{MAJOR}.{MINOR}.{PATCH}-{prerelease}+{build}
```

| Component | Value During Freeze | Example |
|-----------|---------------------|---------|
| MAJOR | `1` (locked until launch) | `1` |
| MINOR | `0` (locked during freeze) | `0` |
| PATCH | Incremented per release candidate | `0`, `1`, `2` ... |
| prerelease | `rc{N}` where N is candidate number | `rc1`, `rc2` |
| build | `freeze.{YYYYMMDD}.{build}` | `freeze.20260517.1` |

**Example full tag:** `v1.0.0-rc1+freeze.20260517.1`

### 8.2 Release Candidate Naming

| Candidate | Tag Format | Created When |
|-----------|------------|--------------|
| RC1 | `v1.0.0-rc1+freeze.{date}.{n}` | Freeze effective date (2026-05-17) |
| RC2 | `v1.0.0-rc2+freeze.{date}.{n}` | After first batch of bug fixes |
| RC(N) | `v1.0.0-rc{N}+freeze.{date}.{n}` | Each subsequent validated candidate |
| GA | `v1.0.0` | Launch completion (Section 7.2) |

### 8.3 Hotfix Branch Strategy

```
main (frozen, protected)
  │
  ├── rc/v1.0.0-rc1  ──▶  tag: v1.0.0-rc1+freeze.20260517.1
  │       │
  │       └── hotfix/DSPS-BUG-0001  ──▶  merged ──▶  rc/v1.0.0-rc2
  │                                               tag: v1.0.0-rc2+freeze.20260517.2
  │
  └── (future: v1.1.0 development branched post-launch)
```

| Rule | Detail |
|------|--------|
| Hotfix branch naming | `hotfix/DSPS-BUG-{XXXX}` or `hotfix/DSPS-SEC-{XXXX}` |
| Branch from | Latest `rc/v1.0.0-rc{N}` tag |
| Merge target | Next RC branch (never direct to `main` during freeze) |
| Maximum hotfix lifetime | 48 hours from branch creation to merge or abandonment |
| `main` branch | Locked; all changes go through RC branches |

### 8.4 Artifact Retention

- All RC Docker images retained for 90 days post-launch
- All hotfix branches retained for 180 days post-merge
- Build artifacts (logs, test reports, coverage data) retained for 1 year
- Tagged releases immutable; no force-push to release tags permitted

---

## 9. Risk of Freeze Violation

### 9.1 Risk Register — Freeze Violation Scenarios

| Risk ID | Risk | Impact | Likelihood | Mitigation | Owner |
|---------|------|--------|------------|------------|-------|
| FR-R01 | Developer inadvertently merges feature code during freeze | Launch delay; untested code in production candidate; safety review gap | Medium | Pre-merge CI gate checks for `[FREEZE-*]` tag in PR title; reject untagged PRs to `main` | DevOps |
| FR-R02 | Emergency unfreeze abused for non-critical feature work | Scope creep; safety governance erosion; documentation debt | Low | Emergency unfreeze requires Engineering Director written authorization; Safety Governance Board 48-hour review mandate | Engineering Director |
| FR-R03 | Safety reviewer unavailable, blocking critical bug fix | Production vulnerability extended; patient safety risk | Low | Minimum 2 trained safety reviewers on rotation; emergency single-approval path with 24-hour retrospective | Safety Governance Board |
| FR-R04 | Post-launch item (Section 4) sneaks into RC via "stealth" bug fix | Unvalidated feature in production; evidence contract drift | Medium | All backend changes require 2 approvals; diff review must flag any new functionality outside Section 5 | Ops Lead |
| FR-R05 | Performance regression undetected during freeze | Degraded clinical workflow; endpoint timeout; 98% payload reduction violated | Medium | Automated performance gates in CI; Section 5.6 thresholds enforced in deployment pipeline | Ops Lead |
| FR-R06 | CUT item (autonomous diagnosis, direct patient AI, unsupervised hypothesis) resurrected in disguise | Catastrophic safety failure; regulatory non-compliance; liability exposure | Low | `safety_governance.py` (13 disallowed patterns) and `contracts.py` (31 KB safety layer) code-reviewed on every change; Safety Governance Board quarterly audit | Safety Governance Board |
| FR-R07 | Test suite atrophy during freeze (tests disabled to pass CI) | False confidence; latent defects in production candidate | Low | Test count and coverage metrics published in RC release notes; Playwright 22-test count enforced in CI gate | QA Lead |
| FR-R08 | Dependency update disguised as security patch introduces features | Unreviewed code paths; supply chain risk | Medium | All dependency bumps require CVE advisory reference; pin to patch-only versions; automated SBOM diff | Security Reviewer |

### 9.2 Violation Escalation Path

```
Detected ──▶ Ops Lead notified within 1 hour
                │
                ▼
    ┌───────────────────────┐
    │  Assess: Intentional  │
    │  or accidental?       │
    └───────────────────────┘
                │
        ┌───────┴───────┐
        ▼               ▼
   Accidental      Intentional
        │               │
        ▼               ▼
   Rollback commit   Engineering Director
   + incident log    + Safety Governance
   + retrain         Board review
   + update gates    + disciplinary action
                     + process update
```

### 9.3 Freeze Compliance Metrics

The following metrics are reported in every weekly review (per PR #14 `weekly_review.md` deliverable):

| Metric | Target | Measurement |
|--------|--------|-------------|
| PRs opened during freeze | 0 feature PRs | PR title tag audit |
| Approvals per backend change | >= 2 | GitHub review data |
| Untagged PRs rejected | 100% | CI gate logs |
| Emergency merges | <= 1 per week | Merge log |
| Test count change | >= 0 (net additions only) | Test suite count |
| Coverage change | >= 0% (no decrease) | Coverage report |
| Safety wording changes | All have safety reviewer sign-off | PR comment audit |
| Performance regression alerts | 0 unresolved | Monitoring dashboard |

---

## Appendix A: Document Inventory

This policy references the following 14 documents delivered by PR #13 and PR #14:

**PR #13 — Beta Launch Documentation (7 docs):**
1. Launch Pack
2. Onboarding Guide
3. Training Guide
4. Patient Portal Guide
5. Success Metrics
6. Support & Escalation
7. Risk Register

**PR #14 — Beta Pilot Operations (7 docs):**
1. Ops Dashboard
2. Feedback Workflow
3. Safety Incidents Log
4. Release Notes
5. Feedback Schema
6. Weekly Review
7. PR Prioritization

---

## Appendix B: Key Configuration Constants

| Constant | Location | Value | Freeze Note |
|----------|----------|-------|-------------|
| `SAFETY_CONFIDENCE_CAP` | `safety_governance.py` | `0.95` | Locked; no increase permitted |
| `DISALLOWED_PATTERN_COUNT` | `safety_governance.py` | `13` | Locked; additions only for new attack vectors |
| `DEMO_MODE` | `config.py` / env var | Environment-dependent | Toggle allowed; default must be `true` for beta |
| `EVIDENCE_LINK_FIELD_COUNT` | `contracts.py` | `19` | Locked; no schema additions |
| `SUMMARY_ENDPOINT_COUNT` | `summary_engine.py` / `main.py` | `4` | Locked |
| `RBAC_ROLE_COUNT` | `access_control.py` | `5` | Locked |
| `COMPOSITE_INDEX_COUNT` | Database layer (PR #2) | `9` | Locked |
| `MATERIALIZED_VIEW_COUNT` | `materialized_views.py` | `2` | Locked |
| `E2E_TEST_COUNT` | `apps/web/e2e/` (PR #7) | `22` | Minimum; additions allowed |
| `BROWSER_PROJECT_COUNT` | Playwright config (PR #7) | `4` | Locked |
| `BACKEND_TEST_FILE_COUNT` | `apps/api/tests/` | `25` | Minimum; additions allowed |
| `UTC_HELPER_COUNT` | `time_utils.py` (PR #10) | `6` | Locked |
| `DEEPTWIN_PAGE_COUNT` | `pages-deeptwin/*.jsx` | `12` | Locked |

---

## Appendix C: Policy Change Log

| Version | Date | Author | Change |
|---------|------|--------|--------|
| 1.0.0 | 2026-05-17 | Engineering Director | Initial freeze policy ratified |

---

*This document is governed by the DeepSynaps Protocol Studio Safety Governance Board. All questions, exceptions, and amendment requests must be submitted via the Support & Escalation process defined in the PR #13 deliverable.*
