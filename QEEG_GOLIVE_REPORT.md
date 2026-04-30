# QEEG Brain Map — Go-Live Report

**Date:** 2026-04-30
**Audit by:** Claude Opus 4.7 (1M context) — autonomous mode
**Verdict:** **CONDITIONAL GO** — three blockers below must clear before clinical use.

---

## What shipped (4 PRs)

| Phase | PR | Title | Status | What it does |
|---|---|---|---|---|
| 0 | [#276](https://github.com/ALIYILD/DeepSynaps-Protocol-Studio/pull/276) | `feat(qeeg): Phase 0 — QEEGBrainMapReport contract + DK narrative bank` | Open | Pydantic v2 contract + 33-of-34 DK narrative bank + alembic 064 + 7 tests |
| 1 | [#279](https://github.com/ALIYILD/DeepSynaps-Protocol-Studio/pull/279) | `feat(qeeg): Phase 1 — patient + clinician brain map renderers` | Open | Replaces the 70-line patient stub. New clinician renderer. Patient Portal "My Brain Map" tab. 18 tests |
| 2 | [#281](https://github.com/ALIYILD/DeepSynaps-Protocol-Studio/pull/281) | `feat(qeeg): Phase 2 — PDF export + protocol fit + audit fixes` | Open | WeasyPrint PDF export. `suggest_protocols_from_report`. Audit P1-1 (403→404) and P1-3 ("diagnosis"→"assessment") fixed. 8 tests |
| 3 | [#283](https://github.com/ALIYILD/DeepSynaps-Protocol-Studio/pull/283) | `feat(qeeg): Phase 3 — unified upload launcher` | Open | One landing page with Auto / Manual choice. 7 tests |
| 4 | _this branch_ | `feat(qeeg): Phase 4 — go-live audit + safety + Dockerfile` | Open | Dockerfile WeasyPrint deps. Red-flag → AdverseEvent escalation. Go-live report. 6 tests |

**Test totals across all five PRs:** 46 new test cases, 0 regressions in the 31 pre-existing qEEG suites that were spot-checked.

---

## Sign-off matrix

### Contract integrity
- [x] `QEEGBrainMapReport` exists with all sections (header, indicators, lobe summary, brain function score, source map, dk_atlas[68], ai_narrative, quality, provenance, disclaimer).
- [x] DK narrative bank lives at `apps/api/app/data/dk_atlas_narrative.json` and is loaded by the factory.
- [x] `report_payload: Text` JSONB-style column added to `qeeg_ai_reports` via migration 064. Idempotent up + down verified on fresh SQLite.
- [x] Phase 1 renderers consume the contract; Phase 2 PDF export consumes the contract; both fall back to the legacy `{content: ...}` shape gracefully.

### Regulatory copy (research/wellness use)
- [x] Phase 1 patient + clinician renderers — banned terms (`diagnosis`, `diagnostic`, `treatment recommendation`, `cure`) absent outside the disclaimer phrase. Asserted in tests.
- [x] Phase 2 PDF HTML output — same assertion in tests.
- [x] Protocol-fit pattern library — "Confirm ADHD diagnosis" → "Confirm ADHD assessment" (audit P1-3 cleared).
- [x] DK narrative bank — `diagnosis`/`diagnostic` strings absent (asserted in `test_dk_narrative_bank_has_no_banned_terms`).
- [x] `suggest_protocols_from_report` `required_checks` use "assessment by qualified clinician".

### Auth and tenant isolation
- [x] `get_patient_facing_report` cross-tenant access returns **404** (not 403). Audit P1-1 cleared at `qeeg_analysis_router.py:3691`.
- [x] New `GET /api/v1/reports/qeeg/{report_id}.{pdf,html}` endpoints apply the same 403→404 suppression.
- [x] All 31 pre-existing `test_qeeg_records_raw_viz_authz` cases still pass.

### Build + deploy
- [x] Vite build clean across all phase branches (`apps/web` builds in ~1m40s).
- [x] Python syntax compiles (`compileall app`).
- [x] Dockerfile updated with WeasyPrint native deps (libpango-1.0-0, libpangoft2-1.0-0, libcairo2, libgdk-pixbuf-2.0-0, libharfbuzz0b, libffi8, shared-mime-info, fonts-liberation, fonts-dejavu-core). Audit P2-3 cleared.
- [ ] **GO-LIVE BLOCKER #1:** preview deploy not yet run because of pending merge order — must run `bash scripts/deploy-preview.sh --api` after Phase 0 + Phase 4 land on `main`.

### Migration safety
- [x] 064 migration: idempotent guards (`_has_column`), nullable Text columns only, no NOT NULL on existing rows. Tested up + down on fresh SQLite.
- [x] No table rewrites; no destructive operations.
- [x] A concurrent session's auto-merge migration (`e2c4a3a5eb8b`) already chains 064 onto the deeptwin/fusion branch — chain stays linear once both PRs land.

### Safety escalation
- [x] High-severity red flags now auto-create `AdverseEvent` rows (Phase 4): epileptiform, focal asymmetry, severe slowing, signal quality, acute neuro concern, self-harm.
- [x] Escalation is idempotent within a 60-second window so the safety engine can be re-run on the same analysis without duplicates.
- [x] Medium/low severity flags do NOT escalate.

---

## GO-LIVE blockers (ordered)

1. **MERGE ORDER**
   The four phase PRs (#276 → #279 → #281 → #283) and this Phase 4 PR must land in that order. Phases 1–4 are forward-compat with main *without* Phase 0, but the canonical contract benefits arrive only when 0 lands. **Recommendation:** squash-merge in the order listed.

2. **PREVIEW DEPLOY VERIFICATION**
   Run `bash scripts/deploy-preview.sh --api` after merges. Manually exercise:
   - Sidenav shows "qEEG Brain Map" + "qEEG Analyzer". Launcher loads.
   - Analyze the demo recording → patient and clinician views render with all sections.
   - `GET /api/v1/reports/qeeg/{id}.pdf` returns a non-empty PDF (now that the Dockerfile has WeasyPrint deps).
   - Patient Portal "My Brain Map" tab shows the appropriate empty state for a patient with no analyses.
   - Cross-tenant access returns 404 (not 403).

3. **OPEN PRODUCT QUESTIONS** (settle before clinical users see this)
   - **MNE pipeline install in production:** `qeeg_mne` extra is not in the production image. Without it, `services/qeeg_pipeline.py::run_pipeline_safe` returns `{"success": False, "error": "qeeg_mne not installed"}`. Choice: install the extra (~500MB image bloat) or ship demo-mode only at v1 launch.
   - **Normative DB:** v1 ships with placeholder z-scores. For clinical positioning either license NeuroGuide / qEEG-Pro or build the HBN-EEG / LEMIP norm. **Until this is resolved, the product is wellness/research only.**
   - **AI Brain Development Age:** indicator placeholder; needs an age-regression model trained on a public dataset before showing real numbers.
   - **Patient-portal exposure depth:** confirm patients see the cover + lobe table only (not the full DK 68-ROI clinician drill-down). Phase 1's role-aware toggle currently shows everything to clinicians and the patient cover to patients — confirm with product / legal.
   - **Eyes-open + eyes-closed both required?** TBR needs EO; PAF needs EC. Decide whether the launcher should require both recordings, or accept one and dim the unavailable indicator.

---

## Deferred to follow-up PRs (not blocking)

- Brain Map Planner DK z-score overlay (`pages-brainmap.js`) — UX touch on a 1k-line file actively edited by other sessions; safer as its own PR after these five land.
- Course pre/post Δ z-score card (`pages-courses.js`, 11k lines) — same reason.
- Backend `POST /api/v1/qeeg/upload` with QC-heuristic suggested_path — Phase 3 launcher routes to existing flows that already have upload affordances, so the new endpoint isn't on the critical path.
- Backend demo seed of a populated `report_payload` row — useful for preview-deploy demos but not a clinical blocker.

---

## Audit hotspot summary (where I'd look first if something breaks)

| Concern | File:line | Status |
|---|---|---|
| Cross-tenant report leak | `qeeg_analysis_router.py:3691` | Fixed |
| "diagnosis" word in copy | `qeeg_protocol_fit.py:57` | Fixed |
| Patient-facing endpoint reads legacy shape | `qeeg_analysis_router.py:3700-3713` | Phase 0 contract preferred, legacy fallback retained |
| WeasyPrint native deps | `Dockerfile:23-37` | Added |
| Migration head divergence | `alembic/versions/e2c4a3a5eb8b_*.py` | Auto-merge by concurrent session — clean |
| Concurrent-session reverts | `apps/web/src/qeeg-patient-report.js`, `package.json` | Phase 1 commits are durable on the branch |

---

## Next-action checklist for the user

1. Review #276 → merge.
2. Review #279 → merge.
3. Review #281 → merge.
4. Review #283 → merge.
5. Review this Phase 4 PR → merge.
6. Run `bash scripts/deploy-preview.sh --api` from repo root.
7. Decide on the 5 open product questions above.
8. If clinical-grade norms are required for go-live, license a normative DB before public launch.

— end of report —
