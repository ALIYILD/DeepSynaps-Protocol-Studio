# DeepTwin Upgrade Plan

Ranked by impact, feasibility tonight, and dependencies. The work
already shipped in this turn is in **Phase 0**. Phase 1 / 2 / 3 are
follow-ups that build on the seams now in place.

## Phase 0 — shipped this turn

| Item | Impact | Files |
|---|---|---|
| TRIBE-shaped layer (encoders → fusion → adapter → heads → explanation) | High — gives every future ML upgrade a stable seam. | `apps/api/app/services/deeptwin_tribe/` |
| `simulate-tribe`, `compare-protocols`, `patient-latent`, `explain`, `report-payload` endpoints | High — protocol comparison + explanation were missing from v1. | `apps/api/app/routers/deeptwin_router.py` (TRIBE block) |
| 9 modality encoders (`qeeg`, `mri`, `assessments`, `wearables`, `treatment_history`, `demographics`, `medications`, `text`, `voice`) | High — all listed input modalities now have a wiring path. | `apps/api/app/services/deeptwin_tribe/encoders/*.py` |
| Tests covering missing-modality, ranking, low-confidence, end-to-end | High — locks the contract before any model swap. | `apps/api/tests/test_deeptwin_tribe.py` |
| Frontend "Compare Protocols" panel on DeepTwin page | Medium — exposes the new endpoint to clinicians. | `apps/web/src/pages-deeptwin.js` (additive) |

## Phase 1 — next, highest leverage

| Item | Impact | Feasibility | Depends on |
|---|---|---|---|
| Wire encoders to real services | High | Medium — qEEG, MRI, assessments, wearables already have services in repo. | Existing services — no new infra. |
| Cache `PatientLatent` per `(patient_id, source-version)` to avoid re-encoding on every protocol comparison | High | High — single function memoisation. | None. |
| Add **scenario-toggle** support (e.g. "if adherence drops to 60%") to `simulate-tribe` | High | High — already has `samples` override hook. | None. |
| Wire `compare-protocols` output into the existing **Reports Center** as a downloadable Markdown/JSON. | Medium | High | Existing `apps/web/src/deeptwin/reports.js`. |
| Surface `top_drivers` and `evidence_grade` in the existing **Simulation Lab** card on the DeepTwin page (not just the new compare panel). | Medium | High | None. |

## Phase 2 — model upgrades behind the seam

| Item | Impact | Feasibility | Depends on |
|---|---|---|---|
| Replace `qeeg` encoder with a small spectral-CNN trained on de-identified band-power features. | High | Medium | Approved outcome dataset, eval harness, governance sign-off. |
| Replace `assessments` encoder with a tabular foundation model (e.g. `tabpfn`, `tabularnet`). | Medium | Medium | Approved labels + eval harness. |
| Replace `text` encoder with a small clinical sentence-bert. | Medium | Medium | Off-host inference path. |
| Replace fusion's quality-weighted mean with a cross-modal transformer head. | High | Low | Real training data for at least one outcome. |
| Add SHAP / integrated-gradients XAI runtime to the explanation layer. | Medium | Medium | Once any head becomes a real model. |

## Phase 3 — research-loop activation

| Item | Impact | Feasibility | Depends on |
|---|---|---|---|
| Activate `deeptwin_research_loop.py` (placeholder shipped earlier) with an offline eval harness against approved historical outcomes. | High | Low | Approved labelled cohort + governance committee. |
| Promote rules / weights only via human-approved PRs. | High | Low | CI gate + governance sign-off. |
| Per-head A/B in shadow mode (predictions logged, never displayed). | Medium | Medium | Phase 1 caching + audit table. |

## Risks / assumptions

- **Synthetic encoders today.** Phase 0 ships clinically cautious
  *deterministic* encoders. Until Phase 2 lands, every prediction must
  carry the existing safety stamps; the UI already enforces them.
- **No outcome dataset on hand.** Phase 2 cannot start until an
  approved, de-identified labelled cohort exists.
- **Audit trail is JSONL placeholder.** Real audit-table writes for
  TRIBE simulations are deferred to the Phase 1 audit-extension PR.
- **Latency.** Encoders + fusion take O(milliseconds) today;
  pretrained models will need an inference budget in front of the
  endpoints.
