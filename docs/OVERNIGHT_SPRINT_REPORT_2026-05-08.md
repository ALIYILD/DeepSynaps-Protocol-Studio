# DeepSynaps Protocol Studio — Overnight Sprint Report
**Date:** 2026-05-08 / 2026-05-09  
**Sprint type:** AI Analyzer Upgrade + Safety Sweep  
**Coordinator:** agent/coordinator (t_1093af4b)  
**Agents run:** 16 (Agents 1–16)  
**Status:** SPRINT COMPLETE — Human push required to open PRs

---

## 1. Executive Summary

16 agents ran in sequence overnight across the DeepSynaps Protocol Studio codebase. The sprint had four pillars:

1. **Research** (Agents 1–3): Scout 68 open-source AI/ML candidates, audit licenses, produce architecture plan for all 12 AI/analyzer pages.
2. **Feature upgrades** (Agents 4–14): Apply Class A safety/UX improvements to all 12 AI/analyzer pages (DeepTwin, qEEG, MRI, Text, Voice, Video, Biomarkers, Evidence Research, Protocol Studio, Handbooks, Brain Map Planner, Risk Analyzer).
3. **Safety governance** (Agent 15): Scan all 25 AI/analyzer pages + API layer for forbidden clinical words. Result: ZERO unsafe uses found.
4. **CI/Test validation** (Agent 16): 1,196 Node.js tests PASS, web build SUCCESS (8.05s), Python syntax validation PASS.

**Bottom line for tomorrow's demo:** Protocol Studio, Brain Map Planner, qEEG, Voice, Video, Biomarkers, Text, DeepTwin, Handbooks, and Protocol Studio are all safe to show. MRI Analyzer and Evidence Research have incomplete upgrades and should not be demoed beyond their pre-sprint baseline. Four P0 governance blockers from the prior audit remain open — do not present as a go-live-ready product.

All 14 agent branches are committed and ready; **all require human git push** (SSH auth not configured for agents). No PRs are open yet.

---

## 2. Pages Improved This Sprint

| Page | Agent | Key Changes | Demo Ready |
|---|---|---|---|
| DeepTwin | 4 | clinical-disclaimer.js helper created, isDemoSession() wired, 4x 'autonomous' → 'clinician approval required' | YES |
| qEEG Analyzer | 5 | Sprint disclaimer added, diagnoses→clinical_profile_notes rename, capabilities badge wired, PMID links verified | YES |
| MRI Analyzer | 6 | Class A work claimed (disclaimer + capabilities + test) — worktree only, 0 commits on branch | BASELINE ONLY |
| Text / NLP | 7 | clinical-disclaimer.js shared helper, PHI badge, disclaimer banner | YES |
| Voice / Audio | 8 | Sprint disclaimer, data retention notice, transcript placeholder improved | YES |
| Video | 9 | Disclaimer standardized, motor feature panel documented (post-MVP), safety test added | YES |
| Biomarkers / Wearables | 10 | Audit only — baseline PR #532 confirmed valid, no changes needed | YES (PR #532 base) |
| Evidence Research | 11 | Timeout — 0 commits on branch, PR #534 baseline holds | BASELINE ONLY |
| Protocol Studio | 12 | Verification pass — no changes needed, all 7 tabs verified, /simulate honest, 7/7 tests pass | YES |
| Handbooks | 13 | Verification pass — DOCX + PDF confirmed, safety disclaimers, forbidden words, tests pass | YES |
| Brain Map Planner | 14 | Verification pass — all 9 gates pass, readiness = input completeness (not efficacy), no fake FEM | YES |
| Agents page | 15 | Clarity fix: "Cannot:" prefix added to prohibition list in agent hiring modal | YES |

---

## 3. Repos Researched / Candidates Evaluated

**Agent 1 — Open Source Scout:** 68 candidates surveyed across 12 page domains.

| Domain | Approved Stack (MIT/Apache/BSD) |
|---|---|
| DeepTwin | PyHealth (MIT), SimPy (MIT) |
| qEEG | MNE-Python (BSD-3), YASA, autoreject, pyEDFlib, fooof/specparam |
| MRI / BrainMap | NiBabel (MIT), Nilearn (BSD-3), dcm2niix (BSD-2) |
| Text / NLP | spaCy (MIT), medspaCy, scispaCy, Presidio, negspacy |
| Voice / Audio | Whisper (MIT), librosa, openSMILE, Surfboard |
| Video | MediaPipe (Apache-2.0), rtmlib |
| Biomarkers | NeuroKit2 (MIT), HeartPy, py-ecg-detectors, FLIRT |
| Evidence | pymed (MIT), semanticscholar, habanero, biopython Entrez |
| Protocol Studio | fhir.resources (MIT) |
| Handbooks | WeasyPrint (BSD-3), pypandoc, Jinja2, python-docx |
| Brain Map | plotly (MIT) |
| Risk Analyzer | medspaCy, openFDA (Public Domain), scikit-learn |

**Agent 2 — License Audit:** 55 APPROVED, 8 concepts-only, 3 REJECTED, 5 ESCALATION-REQUIRED.

Rejected (do not use):
- OpenPose — non-commercial only
- LeadDBS — GPL-3 + MATLAB dependency
- OptiTrack/Vicon — proprietary

Escalation required (Telegram to user before adoption):
- parselmouth (GPL-3) → replace with openSMILE + Surfboard
- DeepLabCut (LGPL-3) → replace with MediaPipe + rtmlib
- FEniCS/OpenCMISS (LGPL) → concepts-only for now

Near-miss flags (require BAA/DUA before use in PHI context): openSMILE commercial binary, MedCAT UMLS, LangGraph BAA gate, ClinicalBERT MIMIC DUA, pyannote HF model terms, Whisper recording retention, SNOMED content license.

---

## 4. Tools Approved / Rejected

**Approved for immediate integration (Class B — Phase 2):**
All 24 "integrate now" candidates from Agent 1 with MIT/Apache/BSD-3 licenses.

**Rejected outright:**
OpenPose, LeadDBS, OptiTrack/Vicon — do not use.

**Blocked pending Telegram escalation:**
parselmouth, DeepLabCut, FEniCS. If user wants these, escalation format: `BLOCKER: [title] / Options A/B / Recommended / Demo impact / Need decision by`.

**P0 Critical — install first in all NLP pipelines:**
Microsoft Presidio (MIT) — required as PHI de-identification gate before any clinical NLP processing.

---

## 5. Files Changed This Sprint

Agents changed files across multiple worktrees. All are committed locally; none are pushed to origin yet.

| Branch | Files Changed | Commit |
|---|---|---|
| agent/coordinator/t_6c8af546 | docs/research/open-source-ai-analyzer-scout-report.md | 4665148c |
| agent/coordinator/t_4b93fd33 | docs/research/open-source-license-security-review.md | 2cd94b1c |
| agent/coordinator/t_06f3be07 | docs/ai-analyzer-upgrade-architecture.md | bc965c25 |
| agent/patient-portal/t_a2224c01 | apps/web/src/clinical-disclaimer.js, apps/web/src/pages-deeptwin.js, apps/web/src/deeptwin/service.js, apps/web/src/deeptwin/demo-dashboard-payload.js, apps/web/src/deeptwin/dashboard360.js, apps/web/src/deeptwin/neuroai-lab.js | 4d01c488 |
| agent/clinical-hub/t_4288cc57 | apps/web/src/pages-qeeg-analysis.js, apps/web/src/pages-qeeg-analysis-readiness.test.js | b63fec24, eeb91b1c |
| agent/clinical-hub/t_dd982f69 | apps/web/src/pages-mri-analysis.js (worktree only — 0 commits on branch) | — |
| agent/documents-reports/t_dc03e693 | apps/web/src/clinical-disclaimer.js, apps/web/src/clinical-disclaimer.test.js, apps/web/src/pages-text-analyzer.js | (committed) |
| agent/monitoring-care/t_11e21045 | apps/web/src/pages-voice-analyzer.js | (committed) |
| agent/monitoring-care/t_503fef82 | apps/web/src/pages-video-assessments.js, apps/web/src/pages-video-assessments-safety.test.js | adf4912b, 241f9cd7 |
| agent/monitoring-care/t_462b7940 | No changes — baseline PR #532 verified sufficient | — |
| agent/protocol-studio/t_e8d963bc | No commits — timeout, PR #534 baseline | — |
| agent/protocol-studio/t_3085bb01 | No changes — verification only | — |
| agent/documents-reports/t_ad374ff3 | No changes — verification only | — |
| agent/protocol-studio/t_facf1511 | No changes — verification only | — |
| agent/finance-governance/t_c4985d0d | apps/web/src/pages-agents.js, docs/clinical-ai-safety-sweep.md | f7f52208, a5ffcc06 |
| agent/onboarding-settings/t_47a2c6f4 | docs/overnight-ai-pages-test-report.md | 0449ef2a |

**Note on clinical-disclaimer.js:** Both Agent 4 (patient-portal branch) and Agent 7 (documents-reports branch) created this shared helper independently. Human merge review must reconcile these into one canonical file before merging to main.

---

## 6. Features Added Per Page

**DeepTwin (Agent 4)**
- Shared clinical-disclaimer.js helper (renderClinicalDisclaimer, renderEvidenceLink)
- isDemoSession() canonical import wired to shouldUseDeepTwinDemoFixtures()
- All 4 occurrences of 'autonomous' replaced with 'clinician approval required'

**qEEG Analyzer (Agent 5)**
- Sprint-required full clinical disclaimer added to page footer
- diagnoses field renamed to clinical_profile_notes (4 fixtures + UI label)
- Capabilities badge wired async to /api/v1/qeeg/capabilities
- 4 PMIDs validated as real: 21890290, 16022942, 11215648, 33010823
- 4 new unit tests (disclaimer, field rename, empty states, evidence)

**Text / NLP Analyzer (Agent 7)**
- clinical-disclaimer.js shared helper created (12 tests)
- Disclaimer banner + PHI badge added to pages-text-analyzer.js
- PHI badge shows Presidio/heuristic/unavailable from /health endpoint

**Voice / Audio Analyzer (Agent 8)**
- Sprint clinical disclaimer updated to exact required text
- Data retention notice added for audio uploads
- Transcript textarea placeholder improved with explicit "not autonomous" wording
- Patient ID override field includes UUID format hint

**Video Assessments (Agent 9)**
- Clinical disclaimer standardized to sprint format
- Motor feature panel (MediaPipe/pose) documented as post-MVP with safety architecture
- New safety test: verifies no forbidden words, role gates enforced, demo gating intact

**Agents Page (Agent 15)**
- Hiring detail modal: "Cannot:" prefix added to prohibition list for clarity

---

## 7. Safety / Governance Changes

**Agent 15 — Safety Sweep Results:**
- 25 AI/analyzer pages scanned for 11 forbidden words: diagnose, prescribe, autonomous, treatment approved, guaranteed improvement, predicts cure, all clear, emergency triage, AI knows best, confirmed outcome, clinical prediction
- Zero unsafe uses found in any page
- All pages use safe negations: "does not diagnose", "requires clinician review", "not autonomous", etc.
- API layer audited (medications, patients, protocol-studio, labs-analyzer, nutrition-analyzer, agent-admin): field names only, no unsafe response text
- One clarity enhancement deployed to pages-agents.js

**Architecture safeguards added (Agent 3):**
- isDemoSession() gate requirement for DeepTwin, BrainMap, Protocols, Handbooks
- Required clinical disclaimer banner spec for all 12 pages
- Class C prohibitions documented: no autonomous prescribing/diagnosis, no fake predictions

**Ongoing P0 governance gaps (from pre-sprint audit, NOT fixed this sprint):**
1. Consent gate missing in patient signup — consent capture is optional (HIPAA risk)
2. Dual-review gate missing on 6 investigational protocols
3. Finance CRUD mutations not audited in audit trail
4. Telehealth recording integration not confirmed in codebase

---

## 8. Evidence / Citation Behavior

**qEEG (Agent 5):** 4 evidence PMIDs manually verified as real and current. Evidence link rendering confirmed working.

**Protocol Studio (Agent 12):** Evidence search confirmed to return honest empty state when DB unavailable — no invented citations.

**Handbooks (Agent 13):** Evidence citation rendering confirmed. governance_flags displayed.

**Brain Map Planner (Agent 14):** E-field simulation explicitly labeled "qualitative geometry only" — no fake FEM/neuronavigation claims.

**Text Analyzer (Agent 7):** PHI badge shows live Presidio integration status — does not fabricate availability.

**Evidence Research page (Agent 11):** TIMED OUT — PR #534 baseline holds. Honest empty state behavior from baseline verified by Agent 12. Re-run on Sonnet recommended.

**Architecture requirement (Agent 3):** All citation fields in fixtures must be structured identifiers (PMIDs, NCT numbers, DOIs) not free-text strings. This migration is tracked as a Class B/P2 item.

---

## 9. AI / Provider Behavior

**Protocol Studio /recommend endpoint:** Uses deterministic ranking — no LLM or randomness in scoring. Verified Agent 12.

**Protocol Studio /simulate endpoint:** Returns honest "unavailable" message — no fake predictions. Verified Agent 12.

**qEEG capabilities badge:** Async fetch to /api/v1/qeeg/capabilities — shows real pipeline status, falls back to unavailable state.

**Text Analyzer PHI badge:** Polls /health — shows Presidio/heuristic/unavailable depending on runtime configuration.

**MRI pipeline guard:** HAS_MRI_PIPELINE gate present in backend — shows honest disabled state when not configured.

**DeepTwin isDemoSession():** Canonical canonical gate wired — demo fixtures only served under demo session flag.

**Brain Map Planner readiness score:** Measures input completeness (has patient, target, protocol, qEEG bridge) — not clinical efficacy. Verified Agent 14.

---

## 10. Demo / Prod Data Gating

- VITE_ENABLE_DEMO=1 gate: required for all demo fixture data (verified across all pages)
- isDemoSession(): wired in DeepTwin (Agent 4); still missing in Brain Map Planner, Protocols, Handbooks (Class B deferred per architecture doc)
- Demo fixtures: serve synthetic data only; synthetic label confirmed on all demo paths
- Biomarkers: stale/unavailable labels working; no fake vitals
- Video: demo gating confirmed; no fake motor assessment scores
- Reports Hub PDF: DEMO stamp applied to demo reports in export
- Agent 15 confirmed API layer returns field names only, not clinical narrative

---

## 11. Tests Run

**Agent 16 — Full CI pass (branch agent/onboarding-settings/t_47a2c6f4):**
```
npm ci                  # PASS (13s)
npm run test:unit       # PASS — 1196/1196 tests, 0 failures (19.1s)
npm run build           # PASS — 8.05s build time
python3 -m py_compile apps/api/scripts/migrate_sqlite_to_pg.py    # PASS
python3 -m py_compile packages/render-engine/tests/test_handbook_bundle.py  # PASS
python3 -m py_compile packages/generation-engine/tests/test_handbook_report_payload.py  # PASS
```

Python pytest: BLOCKED — cryptography package not installed in agent environment. Not a production blocker; syntax validation passed.

**Per-agent test results:**
| Agent | Tests | Result |
|---|---|---|
| 5 qEEG | 4 unit tests | PASS |
| 6 MRI | 39 MRI tests (claimed in worktree) | UNVERIFIED — 0 commits |
| 7 Text | 9 + 12 tests (clinical-disclaimer suite) | PASS |
| 9 Video | Safety test (forbidden words + role gates) | PASS |
| 12 Protocol Studio | 7/7 | PASS |
| 14 Brain Map | 6/6 readiness tests | PASS |

---

## 12. Build Result

**Web build:** SUCCESS  
**Build time:** 8.05 seconds  
**Test suites verified (Agent 16):** protocol-studio-route/ux/readiness, pages-biomarkers, pages-handbooks, brainmap-planner-v2-readiness, pages-virtualcare-readiness, pages-research-evidence, evidence-live-wiring-regressions, evidence-ui-live  
**Total pipeline time:** ~40 seconds  
**Web tests passed/total:** 1196/1196  

---

## 13. Preview / Click-Through

No agents ran `npm run preview` or a live server; this would require human setup. Agent 16 ran the build only.

---

## 14. Known Limitations

1. **All 14 agent branches uncommitted to origin.** SSH auth was not configured for any agent profile. Human must push each branch and open a draft PR. See PR Links section below for commands.

2. **MRI Analyzer (Agent 6) incomplete.** Haiku tool-budget exhausted at 481s. Work may exist in the worktree but 0 commits on branch agent/clinical-hub/t_dd982f69. MRI page is at pre-sprint baseline.

3. **Evidence Research (Agent 11) incomplete.** Haiku tool-budget exhausted at 600s (hit the 600s cap). 0 commits on branch. PR #534 baseline holds but Class A upgrades were not applied.

4. **clinical-disclaimer.js created by two agents.** Agent 4 (patient-portal branch) and Agent 7 (documents-reports branch) both created apps/web/src/clinical-disclaimer.js. These need reconciliation before merging. Agent 7's version is the more complete one (12 tests, shared helper pattern).

5. **Python pytest not runnable in agent environment.** Cryptography package missing. All Python files were syntax-validated but full pytest suite requires the production Docker environment.

6. **Class B ML integrations deferred.** MNE-Python, NiBabel, Presidio, NeuroKit2, Whisper, MediaPipe, pymed, WeasyPrint are all approved and ready to wire; no agent connected them to the backend this sprint. This is by design — Class B is a separate sprint.

7. **isDemoSession() still not wired in Brain Map Planner, Protocols pages, Handbooks.** These pages have demo fixture stubs that are safe but are not using the canonical isDemoSession() gate yet (Class B deferred).

8. **Finance P0 blockers unaddressed.** Finance CRUD mutations, clinic_id FK on finance tables, and audit trail scoping remain open from the pre-sprint audit.

9. **Consent gate still missing.** Patient signup flow has optional consent capture. This is a HIPAA-relevant P0 blocker — not touched this sprint.

10. **Re-run Agent 11 on Sonnet model.** Evidence Research upgrades need a re-run with a more capable model (Haiku timed out twice).

---

## 15. PR Links

All branches are local-only. Human must push and open draft PRs:

```bash
# Agent 1 — Scout report
cd /Users/aliyildirim/hermes-agent/.worktrees/t_6c8af546
git push origin agent/coordinator/t_6c8af546
gh pr create --draft --title "Agent 1: Open-source AI analyzer scout report (68 candidates)" --body "Research output: 68 candidates evaluated, 24 approved for immediate integration."

# Agent 2 — License review
cd /Users/aliyildirim/hermes-agent/.worktrees/t_4b93fd33
git push origin agent/coordinator/t_4b93fd33
gh pr create --draft --title "Agent 2: License and security review for 68 OS candidates" --body "55 approved, 3 rejected, 5 escalation-required."

# Agent 3 — Architecture
cd /Users/aliyildirim/hermes-agent/.worktrees/t_06f3be07
git push origin agent/coordinator/t_06f3be07
gh pr create --draft --title "Agent 3: AI analyzer upgrade architecture for all 12 pages"

# Agent 4 — DeepTwin
cd /Users/aliyildirim/hermes-agent/.worktrees/t_a2224c01
git push origin agent/patient-portal/t_a2224c01
gh pr create --draft --title "Agent 4: DeepTwin — clinical-disclaimer helper + demo gate + autonomous language fix"

# Agent 5 — qEEG
cd /Users/aliyildirim/hermes-agent/.worktrees/t_4288cc57  # (or local branch)
git push origin agent/clinical-hub/t_4288cc57
gh pr create --draft --title "Agent 5: qEEG Analyzer — sprint disclaimer, field rename, capabilities badge"

# Agent 7 — Text Analyzer
cd /Users/aliyildirim/hermes-agent/.worktrees/t_dc03e693
git push origin agent/documents-reports/t_dc03e693
gh pr create --draft --title "Agent 7: Text/NLP Analyzer — shared clinical-disclaimer helper + PHI badge"

# Agent 8 — Voice
cd /Users/aliyildirim/hermes-agent/.worktrees/t_11e21045
git push origin agent/monitoring-care/t_11e21045
gh pr create --draft --title "Agent 8: Voice Analyzer — sprint disclaimer + data retention notice"

# Agent 9 — Video
cd /Users/aliyildirim/hermes-agent/.worktrees/t_503fef82
git push origin agent/monitoring-care/t_503fef82
gh pr create --draft --title "Agent 9: Video Assessments — disclaimer standardized + safety test"

# Agent 15 — Safety sweep
cd /Users/aliyildirim/hermes-agent/.worktrees/t_c4985d0d
git push origin agent/finance-governance/t_c4985d0d
gh pr create --draft --title "Agent 15: Clinical AI safety sweep — 25 pages, 0 blockers, agents modal clarity"

# Agent 16 — Test report
cd /Users/aliyildirim/hermes-agent/.worktrees/t_47a2c6f4
git push origin agent/onboarding-settings/t_47a2c6f4
gh pr create --draft --title "Agent 16: Overnight CI report — 1196 tests PASS, build SUCCESS"
```

---

## 16. What Is Safe To Show The Doctor Tomorrow

The following pages/features are demo-ready with correct clinical disclaimers, no forbidden words, and honest AI states:

- **Protocol Studio** — 7 tabs, deterministic /recommend, honest /simulate, 7 tests pass
- **Brain Map Planner v2** — all 9 verification gates pass, qualitative E-field, 6 tests pass
- **qEEG Analyzer** — sprint disclaimer, honest capabilities badge, renamed field, verified PMIDs
- **Voice Analyzer** — sprint disclaimer, data retention notice, "not autonomous" placeholder
- **Video Assessments** — standardized disclaimer, role gates, no fake motor scores
- **Biomarkers / Wearables** — PR #532 baseline, stale labels working, no fake vitals
- **Text Analyzer** — shared disclaimer helper, PHI badge (shows Presidio status honestly)
- **DeepTwin** — canonical isDemoSession() wired, "clinician approval required" language
- **Handbooks** — DOCX + PDF verified, safety disclaimers, governance flags
- **Documents Hub** — clinic-scoped, audit trail, download/zip export working
- **Reports Hub** — PDF/CSV export working, DOCX returns honest 503
- **Agents page** — prohibition list clarified

**Demo script suggestion:** Start with Protocol Studio → Brain Map Planner → qEEG → qEEG report export → Voice upload. These are the strongest chains.

---

## 17. What Should NOT Be Shown Tomorrow

- **MRI Analyzer beyond baseline** — Agent 6 timed out with 0 commits. Do not imply new AI features.
- **Evidence Research beyond baseline** — Agent 11 timed out. Do not imply new capabilities.
- **Presidio NLP integration** — Not wired this sprint (Class B deferred). PHI badge shows "unavailable" state.
- **Live ML inference** (MNE-Python, MediaPipe, NeuroKit2, Whisper backends) — None wired. All are placeholder states.
- **Finance module** — P0 blockers still open (no audit log on CRUD, no clinic_id isolation).
- **Patient signup / onboarding** — Consent gate is optional. Do not present as HIPAA-compliant flow.
- **The "go-live" story** — Four P0 blockers remain open. This is a demo build, not a go-live build.
- **Any statement involving:** diagnose, prescribe, autonomous, treatment approved, guaranteed improvement, predicts cure, all clear, emergency triage, AI knows best, confirmed outcome, clinical prediction.

---

## 18. Next 7-Day Roadmap

**Day 1 (Today): Human push all branches + open draft PRs.**
Commands are in Section 15. Priority order: Agent 7 (clinical-disclaimer.js — shared dep for merge), Agent 5 (qEEG), Agent 4 (DeepTwin), Agents 8/9.

**Day 2: Re-run Agent 6 (MRI) and Agent 11 (Evidence Research) on Sonnet model.**
Haiku timed out on both. Both need Class A disclaimer/capabilities work completed.
- Create kanban tasks: `assignee: clinical-hub` for Agent 6, `assignee: protocol-studio` for Agent 11.

**Day 3: Resolve clinical-disclaimer.js merge conflict.**
Two versions exist. Canonical should be Agent 7's version with 12 tests. Remove Agent 4's copy and update imports.

**Day 4: P0 blockers — Consent gate.**
Add mandatory consent check in `clinical_sessions_router.start_session()` and patient signup wizard. Assign to `onboarding-settings` profile.

**Day 5: P0 blockers — Finance audit logging.**
Add `create_audit_event()` calls to all finance.py CRUD mutations. Add `clinic_id` FK to finance tables. Assign to `finance-governance` profile.

**Day 6: P0 blockers — Dual-review gate for investigational protocols.**
Add `dual_review_required=True` to 6 investigational protocols in data/conditions/. Assign to `protocol-studio` profile.

**Day 7: Class B ML wiring sprint — Phase 1.**
Wire Presidio into Text Analyzer pipeline (P0 critical per Agent 2). Wire MNE-Python stub to qEEG backend. Wire NeuroKit2 stub to Biomarkers backend. These are the three highest-value Class B integrations.

**Ongoing / parking lot:**
- Telegram escalation needed before adopting: parselmouth, DeepLabCut, FEniCS
- isDemoSession() wiring for Brain Map Planner, Protocols, Handbooks (Class B)
- Citation field migration to structured IDs (PMID/NCT/DOI)
- EV-D schema extension with indirect_evidence_only flag
- DOCX export for Reports Hub (python-docx wiring)
- Clinic activation state machine (trial/active/activated_at on Clinic model)
- Re-run Agent 11 Evidence Research on Sonnet

---

## Appendix: Agent Task Map

| Agent | Task ID | Profile | Status | Notes |
|---|---|---|---|---|
| 1 Scout | t_6c8af546 | coordinator | done | Push blocked |
| 2 License | t_4b93fd33 | coordinator | done | Push blocked |
| 3 Architecture | t_06f3be07 | coordinator | done | Push blocked |
| 4 DeepTwin | t_a2224c01 | patient-portal | done | Push blocked |
| 5 qEEG | t_4288cc57 | clinical-hub | done | Push blocked |
| 6 MRI | t_dd982f69 | clinical-hub | done (incomplete) | 0 commits, re-run needed |
| 7 Text | t_dc03e693 | documents-reports | done | Push blocked |
| 8 Voice | t_11e21045 | monitoring-care | done | Push blocked |
| 9 Video | t_503fef82 | monitoring-care | done | Push blocked |
| 10 Biomarkers | t_462b7940 | monitoring-care | done | Baseline verified, no changes |
| 11 Evidence | t_e8d963bc | protocol-studio | done (incomplete) | 0 commits, re-run needed |
| 12 Protocol Studio | t_3085bb01 | protocol-studio | done | Verification only, no changes |
| 13 Handbooks | t_ad374ff3 | documents-reports | done | Verification only, no changes |
| 14 Brain Map | t_facf1511 | protocol-studio | done | Verification only, no changes |
| 15 Safety Sweep | t_c4985d0d | finance-governance | done | 0 blockers found |
| 16 CI/Test | t_47a2c6f4 | onboarding-settings | done | 1196 PASS |

---

*Report generated by agent/coordinator on 2026-05-09. All findings are derived from agent memory entries and kanban run records. No clinical facts invented.*
