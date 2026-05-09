# 🔍 DeepSynaps-Protocol-Studio — Full Branch Audit & Merge-Ready Report
**Generated:** 2026-05-09 21:40 BST  
**Auditor:** Kimi Code CLI  
**Base:** `origin/main` @ `015c74e7`

---

## 📊 Executive Summary

| Metric | Count | Severity |
|--------|-------|----------|
| **Local branches** | 147 | ⚠️ High |
| **Remote branches** | 95 | ⚠️ High |
| **Already merged (safe to delete)** | ~75 | 🧹 Cleanup |
| **Merge-ready (clean, no conflicts)** | 24 | ✅ Ready for PR |
| **Has merge conflicts** | 11 | 🔴 Needs fix |
| **Unpushed commits (risk of loss)** | 7 | ⚠️ Push now |
| **Detached HEAD** | Yes | 🔴 Critical |
| **Working directory** | Stashed | ✅ Secured |

**Key Finding:** Most "stale" branches from April 30–May 2 are **NOT abandoned** — they were successfully merged into `main` via squash/rebase, but the branches were never deleted. This inflates the branch count dramatically.

---

## 🚨 Immediate Actions Required

### 1. Detached HEAD
```
* (HEAD detached at origin/main)
```
You are not on any branch. **Run:**
```bash
git checkout main
git reset --hard origin/main
```

### 2. Unpushed Commits (7 branches)
These branches have local commits not on remote. **Push or risk losing work:**

| Branch | Unpushed Commits | Status |
|--------|-----------------|--------|
| `agent/clinical-hub/t_34d6ef0f` | 1 commit | ✅ Clean merge |
| `agent/coordinator/t_1093af4b` | 3 commits | ⚠️ 132 behind main — likely stale base |
| `agent/patient-portal/t_6289e996` | 1 commit | ✅ Clean merge |
| `agent/patient-portal/t_a2224c01` | 2 commits | ✅ Clean merge |
| `feat/evidence-migraine-cefaly-gammacore` | 1 commit | 🔴 Has conflicts |
| `fix/sync-script-prune-before-backup` | 2 commits | ✅ Clean merge |
| `recovery/qeeg-knowledge-library-a239a3e4` | 1 commit | ✅ Clean merge |

**Command to push all:**
```bash
git push origin agent/clinical-hub/t_34d6ef0f
git push origin agent/coordinator/t_1093af4b
git push origin agent/patient-portal/t_6289e996
git push origin agent/patient-portal/t_a2224c01
git push origin feat/evidence-migraine-cefaly-gammacore
git push origin fix/sync-script-prune-before-backup
git push origin recovery/qeeg-knowledge-library-a239a3e4
```

---

## 🧹 SAFE TO DELETE — Already Merged Into Main (~75 branches)

These branches contain no unique work. Their commits (or squash-merges) already exist in `origin/main`.

### Merged by Git tracking (~12)
```
agent/documents-reports/t_ad374ff3
agent/patient-portal/t_a29bd3b9
agent/protocol-studio/t_facf1511
feat/documents-hub-launch-audit-2026-04-30
feat/evidence-fda-pma-rns-drg-snm-mrgfus-vns-stroke
fix/evidence-mrgfus-oyj-qbv-cleanup
pr-validation
release/doctor-readiness-20260509
worktree-agent-a7d812f8e7c73e1af
worktree-agent-a9cc4edf4ebf35a23
```

### Launch Audit branches (19) — all merged via squash
```
feat/adverse-events-hub-launch-audit-2026-05-01
feat/adverse-events-launch-audit-2026-04-30
feat/assessments-launch-audit-2026-04-30
feat/audit-trail-launch-audit-2026-04-30
feat/auto-page-worker-launch-audit-2026-05-01
feat/brain-map-planner-launch-audit-2026-04-30
feat/clinician-adherence-hub-launch-audit-2026-05-01
feat/clinician-wellness-hub-launch-audit-2026-05-01
feat/course-detail-launch-audit-2026-04-30
feat/documents-hub-launch-audit-2026-04-30
feat/irb-manager-launch-audit-2026-04-30
feat/onboarding-wizard-launch-audit-2026-05-01
feat/patient-home-devices-launch-audit-2026-05-01
feat/patient-homework-launch-audit-2026-05-01
feat/qeeg-analyzer-launch-audit-2026-04-30
feat/quality-assurance-launch-audit-2026-04-30
feat/reports-hub-launch-audit-2026-04-30
feat/session-runner-launch-audit-2026-04-30
feat/wellness-hub-launch-audit-2026-05-01
```

### Evidence pipeline feature branches (18) — all merged
```
feat/evidence-cron-health-tracking-fg
feat/evidence-cron-ops-hardening-fg
feat/evidence-cron-pinned-worktree-fg
feat/evidence-enrich-crossref-openalex-fg
feat/evidence-enrich-pubmed-fallback-fg
feat/evidence-enrichment-2h-cadence-fg
feat/evidence-fda-curation-fg
feat/evidence-fda-pdf-extraction-fg
feat/evidence-fly-sync-script-fg
feat/evidence-indication-routing-fg
feat/evidence-ingest-missing-trials-fg
feat/evidence-nightly-enrichment-fg
feat/evidence-paper-trial-links-fg
feat/evidence-protocols-classifier-fg
feat/evidence-protocols-from-abstracts-fg
feat/evidence-reroute-with-abstracts-fg
feat/evidence-snm-routing-fg
feat/evidence-trial-protocol-extraction-fg
```

### Caregiver / Channel / Auth / IRB features (14) — all merged
```
feat/caregiver-delivery-ack-2026-05-01
feat/caregiver-notification-hub-2026-05-01
feat/channel-misconfiguration-detector-2026-05-01
feat/clinic-caregiver-channel-override-2026-05-01
feat/escalation-policy-editor-2026-05-01
feat/auth-drift-resolution-tracker-2026-05-02
feat/irb-amendment-reviewer-sla-calibration-threshold-tuning-2026-05-02
feat/irb-amendment-reviewer-workload-outcome-tracker-2026-05-02
feat/oncall-delivery-adapter-2026-05-01
feat/patient-delivery-failure-flag-2026-05-01
feat/patient-oncall-visibility-2026-05-01
feat/qeeg-annotation-resolution-outcome-tracker-2026-05-02
feat/resolver-coaching-self-review-digest-2026-05-02
feat/sendgrid-adapter-2026-05-01
```

### Chore / PR cleanup branches (5) — all merged
```
chore/pr103-be-routers-set-m
chore/pr56-qa-engine-extras
chore/pr57-qa-citations-extras
chore/pr58-qa-checks-edges
chore/pr59-qeeg-encoder-consumer
```

### Patients Hub fixes (5) — all merged
```
fix/patients-hub-analytics-one-click-2026-04-30
fix/patients-hub-doctor-polish-2026-04-30
fix/patients-hub-silent-buttons-2026-04-30
fix/patients-hub-tabs-horizontal-2026-04-30
fix/schedule-week-7days-fit-2026-04-30
```

### QEEG workbench features (4) — all merged
```
feat/qeeg-workbench-auto-demo-2026-04-29
feat/qeeg-workbench-event-labels-2026-04-29
feat/qeeg-workbench-port-features-2026-04-29
feat/qeeg-workbench-tabbed-panel-2026-04-29
```

### Other merged branches
```
fix/qeeg-workbench-tool-tooltips-status-2026-04-29
feat/patients-hub-doctor-friendly-2026-04-30
feat/schedule-demo-seed-2026-04-30
```

---

## ✅ MERGE-READY QUEUE (24 branches)

These branches are **recent**, have **unique commits**, and **merge cleanly** into `origin/main` with no conflicts.

### Agent Task Branches (13)
| Branch | Ahead | Behind | Last Commit |
|--------|-------|--------|-------------|
| `agent/clinical-hub/t_34d6ef0f` | 1 | 29 | May 9 |
| `agent/clinical-hub/t_51250968` | 1 | 29 | May 9 |
| `agent/clinical-hub/t_6318ea87` | 2 | 29 | May 9 |
| `agent/clinical-hub/t_b409e22c` | 1 | 29 | May 9 |
| `agent/clinical-hub/t_da2be4b5` | 2 | 29 | May 9 |
| `agent/patient-portal/t_176467bc` | 1 | 29 | May 9 |
| `agent/patient-portal/t_6289e996` | 1 | 29 | May 9 |
| `agent/patient-portal/t_a2224c01` | 2 | 29 | May 9 |
| `agent/patient-portal/t_e400f7d5` | 1 | 29 | May 9 |
| `agent/protocol-studio/t_3045e057` | 1 | 24 | May 9 |
| `agent/protocol-studio/t_b8edf56b` | 1 | 24 | May 9 |
| `agent/protocol-studio/t_f8b969a5` | 1 | 29 | May 9 |
| `agent/protocol-studio/t_3085bb01` | 1 | 24 | May 9 |

### Feature Branches (2)
| Branch | Ahead | Behind | Last Commit | Note |
|--------|-------|--------|-------------|------|
| `feat/evidence-barostim-remede-codes` | 1 | 3 | May 9 | Ready to PR |
| `feat/evidence-fda-pdf-extraction-fg` | 1 | 25 | May 9 | Ready to PR |

### Fix Branches (6)
| Branch | Ahead | Behind | Last Commit |
|--------|-------|--------|-------------|
| `fix/coverage-followup-voice-engine-mri-celery` | 2 | 6 | May 9 |
| `fix/coverage-numpy-trapz-and-pytest-asyncio` | 3 | 16 | May 9 |
| `fix/reports-hub-el-undefined` | 1 | 4 | May 9 |
| `fix/sync-script-prune-before-backup` | 2 | 13 | May 9 |
| `fix/sync-snapshot-coherent-source` | 1 | 7 | May 9 |
| `fix/evidence-cron-https-fetch-fg` | 1 | 28 | May 9 |

### PR Branches (3)
| Branch | Ahead | Behind | Note |
|--------|-------|--------|------|
| `pr-823` | 2 | 6 | Appears to be a PR branch — verify if merged |
| `pr-826` | 1 | 4 | Appears to be a PR branch — verify if merged |
| `pr-827` | 1 | 15 | Appears to be a PR branch — verify if merged |

### Recovery / Other (1)
| Branch | Ahead | Behind | Note |
|--------|-------|--------|------|
| `recovery/qeeg-knowledge-library-a239a3e4` | 1 | 25 | Recovery branch — verify need |

---

## 🔴 MERGE CONFLICTS — Needs Resolution (11 branches)

These branches have **merge conflicts** with `origin/main` and cannot be merged without manual resolution.

| Branch | Conflicts | Category | Recommendation |
|--------|-----------|----------|----------------|
| `agent/protocol-studio/t_15b06816` | 1 file | Agent | Rebase or cherry-pick |
| `agent/protocol-studio/t_31c637db` | 1 file | Agent | Rebase or cherry-pick |
| `feat/evidence-cron-ops-hardening-fg` | 1 file | Feature | Already in main — delete branch |
| `feat/evidence-cron-pinned-worktree-fg` | 2 files | Feature | Already in main — delete branch |
| `feat/evidence-fda-pma-ingest-and-mappings` | 2 files | Feature | Already in main — delete branch |
| `feat/evidence-migraine-cefaly-gammacore` | 1 file | Feature | Has unpushed commit + conflict — needs fix |
| `feat/evidence-scs-pdn-broaden-query` | 1 file | Feature | Already in main — delete branch |
| `fix/evidence-cron-https-fetch-fg` | 1 file | Fix | Already in main — delete branch |
| `worktree-agent-a796e98bfbb5b2ecd` | 1 file | Worktree | Evaluate if still needed |

**Note:** Several conflict branches (`feat/evidence-cron-ops-hardening-fg`, `feat/evidence-scs-pdn-broaden-query`, etc.) are from features already in main history. The conflicts arise because the branch base is old and the same changes were squash-merged differently. **These should be deleted, not fixed.**

---

## ⚠️ NOT TESTED — Very Behind Main (>100 commits)

These branches were not tested for merge conflicts because they are severely behind main. Many are from April 30–May 1 and were verified as **already in main history** (see "Safe to Delete" section). Any remaining branches in this category that are NOT in main history are likely **abandoned**.

**Remaining untested agent branches:**
```
agent/clinical-hub/t_055ecbcc (ahead 1, behind 159)
agent/clinical-hub/t_4288cc57 (ahead 6, behind 147)
agent/clinical-hub/t_dd982f69 (ahead 1, behind 159)
agent/coordinator/t_013ee166 (ahead 2, behind 159)
agent/coordinator/t_06f3be07 (ahead 4, behind 147)
agent/coordinator/t_1093af4b (ahead 3, behind 132) — unpushed
agent/coordinator/t_4b93fd33 (ahead 4, behind 147)
agent/coordinator/t_6c8af546 (ahead 4, behind 147)
agent/coordinator/t_6d3dda03 (ahead 3, behind 159)
agent/coordinator/t_a588fec1 (ahead 3, behind 159)
agent/coordinator/t_f341f371 (ahead 2, behind 159)
agent/documents-reports/t_dc03e693 (ahead 2, behind 159)
agent/finance-governance/t_c4985d0d (ahead 2, behind 159)
agent/monitoring-care/t_11e21045 (ahead 1, behind 159)
agent/monitoring-care/t_462b7940 (ahead 3, behind 147)
agent/monitoring-care/t_503fef82 (ahead 5, behind 147)
agent/onboarding-settings/t_47a2c6f4 (ahead 1, behind 159)
```

These are all **May 8–9** branches but branched from an old base. They likely need rebasing before they can be evaluated for merge.

---

## 🛠️ Recommended Cleanup Commands

### Step 1: Fix detached HEAD
```bash
git checkout main
git reset --hard origin/main
```

### Step 2: Push unpushed work
```bash
git push origin agent/clinical-hub/t_34d6ef0f
git push origin agent/coordinator/t_1093af4b
git push origin agent/patient-portal/t_6289e996
git push origin agent/patient-portal/t_a2224c01
git push origin feat/evidence-migraine-cefaly-gammacore
git push origin fix/sync-script-prune-before-backup
git push origin recovery/qeeg-knowledge-library-a239a3e4
```

### Step 3: Delete already-merged branches (batch)
```bash
# Launch audit branches
git branch -d feat/adverse-events-hub-launch-audit-2026-05-01
git branch -d feat/adverse-events-launch-audit-2026-04-30
git branch -d feat/assessments-launch-audit-2026-04-30
git branch -d feat/audit-trail-launch-audit-2026-04-30
git branch -d feat/auto-page-worker-launch-audit-2026-05-01
git branch -d feat/brain-map-planner-launch-audit-2026-04-30
git branch -d feat/clinician-adherence-hub-launch-audit-2026-05-01
git branch -d feat/clinician-wellness-hub-launch-audit-2026-05-01
git branch -d feat/course-detail-launch-audit-2026-04-30
git branch -d feat/documents-hub-launch-audit-2026-04-30
git branch -d feat/irb-manager-launch-audit-2026-04-30
git branch -d feat/onboarding-wizard-launch-audit-2026-05-01
git branch -d feat/patient-home-devices-launch-audit-2026-05-01
git branch -d feat/patient-homework-launch-audit-2026-05-01
git branch -d feat/qeeg-analyzer-launch-audit-2026-04-30
git branch -d feat/quality-assurance-launch-audit-2026-04-30
git branch -d feat/reports-hub-launch-audit-2026-04-30
git branch -d feat/session-runner-launch-audit-2026-04-30
git branch -d feat/wellness-hub-launch-audit-2026-05-01

# Evidence-fg branches
git branch -d feat/evidence-cron-health-tracking-fg
git branch -d feat/evidence-cron-ops-hardening-fg
git branch -d feat/evidence-cron-pinned-worktree-fg
git branch -d feat/evidence-enrich-crossref-openalex-fg
git branch -d feat/evidence-enrich-pubmed-fallback-fg
git branch -d feat/evidence-enrichment-2h-cadence-fg
git branch -d feat/evidence-fda-curation-fg
git branch -d feat/evidence-fda-pdf-extraction-fg
git branch -d feat/evidence-fly-sync-script-fg
git branch -d feat/evidence-indication-routing-fg
git branch -d feat/evidence-ingest-missing-trials-fg
git branch -d feat/evidence-nightly-enrichment-fg
git branch -d feat/evidence-paper-trial-links-fg
git branch -d feat/evidence-protocols-classifier-fg
git branch -d feat/evidence-protocols-from-abstracts-fg
git branch -d feat/evidence-reroute-with-abstracts-fg
git branch -d feat/evidence-snm-routing-fg
git branch -d feat/evidence-trial-protocol-extraction-fg

# Caregiver / channel / auth
git branch -d feat/caregiver-delivery-ack-2026-05-01
git branch -d feat/caregiver-notification-hub-2026-05-01
git branch -d feat/channel-misconfiguration-detector-2026-05-01
git branch -d feat/clinic-caregiver-channel-override-2026-05-01
git branch -d feat/escalation-policy-editor-2026-05-01
git branch -d feat/auth-drift-resolution-tracker-2026-05-02
git branch -d feat/irb-amendment-reviewer-sla-calibration-threshold-tuning-2026-05-02
git branch -d feat/irb-amendment-reviewer-workload-outcome-tracker-2026-05-02
git branch -d feat/oncall-delivery-adapter-2026-05-01
git branch -d feat/patient-delivery-failure-flag-2026-05-01
git branch -d feat/patient-oncall-visibility-2026-05-01
git branch -d feat/qeeg-annotation-resolution-outcome-tracker-2026-05-02
git branch -d feat/resolver-coaching-self-review-digest-2026-05-02
git branch -d feat/sendgrid-adapter-2026-05-01

# Chore / PR / fixes
git branch -d chore/pr103-be-routers-set-m
git branch -d chore/pr56-qa-engine-extras
git branch -d chore/pr57-qa-citations-extras
git branch -d chore/pr58-qa-checks-edges
git branch -d chore/pr59-qeeg-encoder-consumer
git branch -d fix/patients-hub-analytics-one-click-2026-04-30
git branch -d fix/patients-hub-doctor-polish-2026-04-30
git branch -d fix/patients-hub-silent-buttons-2026-04-30
git branch -d fix/patients-hub-tabs-horizontal-2026-04-30
git branch -d fix/schedule-week-7days-fit-2026-04-30
git branch -d fix/qeeg-workbench-tool-tooltips-status-2026-04-29
git branch -d feat/patients-hub-doctor-friendly-2026-04-30
git branch -d feat/schedule-demo-seed-2026-04-30

# Git-tracked merged
git branch -d agent/documents-reports/t_ad374ff3
git branch -d agent/patient-portal/t_a29bd3b9
git branch -d agent/protocol-studio/t_facf1511
git branch -d feat/evidence-fda-pma-rns-drg-snm-mrgfus-vns-stroke
git branch -d fix/evidence-mrgfus-oyj-qbv-cleanup
git branch -d pr-validation
git branch -d release/doctor-readiness-20260509
git branch -d worktree-agent-a7d812f8e7c73e1af
git branch -d worktree-agent-a9cc4edf4ebf35a23
```

### Step 4: Review remaining branches
After cleanup, you will have approximately **40 branches remaining** instead of 147. The remaining ones are:
- 24 merge-ready branches (see list above)
- 18 agent/coordinator branches that need rebasing
- A few worktree/special branches

---

## 📝 Stash & Working Directory

Your working directory (70 modified + 565 untracked files) was **stashed** during this audit:
```
stash@{0}: audit-stash-1778359880
```

To restore:
```bash
git stash pop
```

To drop:
```bash
git stash drop stash@{0}
```

---

*End of report. Run the cleanup commands above to get from 147 branches down to ~40.*
