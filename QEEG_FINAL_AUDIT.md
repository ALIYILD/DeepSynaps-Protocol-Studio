# QEEG Brain Map Go-Live — Final Ship-Readiness Audit

**Date:** 2026-04-30
**Auditor:** Integration / E2E QA Agent (claude-sonnet-4-6)
**Scope:** PRs #276, #279, #281, #283, #298, #301, #303, #304, #306
**Verdict:** NO-GO — 5 blocking issues require resolution before any PR lands on main

---

## 1. Per-PR Test Pass/Fail

All tests were executed from git worktrees checked out to the exact PR head OID, using
`.venv/bin/python -m pytest` (Python) and `node --test` (JavaScript).

| PR | Phase | Python test file | Result | JS test file | Result |
|---|---|---|---|---|---|
| #276 | 0 | `test_qeeg_report_template.py` | **7/7 PASS** | N/A | — |
| #279 | 1 | N/A (no new py test on branch) | — | `qeeg-brain-map-template.test.js` (on #306) | **18/18 PASS** |
| #281 | 2 | `test_qeeg_brain_map_phase2.py` | **8 PASS, 1 SKIP** | N/A | — |
| #283 | 3 | N/A | — | `pages-qeeg-launcher.test.js` | **7/7 PASS** |
| #298 | 4 | `test_qeeg_safety_escalation_phase4.py` | **6/6 PASS** | N/A | — |
| #301 | 5a | N/A | — | `pages-brainmap-qeeg-overlay.test.js` | **4/4 PASS** |
| #303 | 5b | `test_qeeg_upload_endpoint_phase5b.py` | **10/10 PASS** (local) | N/A | — |
| #304 | 5c | `test_qeeg_course_comparison_phase5c.py` | **7/7 PASS** | N/A | — |
| #306 | 5d | `test_qeeg_demo_seed_phase5d.py` | **6/6 PASS** (unit only) | `qeeg-brain-map-template.test.js` | **18/18 PASS** |

### Notes on test file location discrepancies

- `qeeg-brain-map-template.test.js` — listed in the checklist as belonging to PR #279 (Phase 1)
  but the file does not exist on the `feat/qeeg-brain-map-renderers-phase1` branch HEAD
  (`fb974b7`). It first appears on `feat/qeeg-demo-seed-and-launcher-wiring-phase5d` (`5ac80d5`).
  The test was run on that branch and passes; however the file should be added to Phase 1's branch
  before merge.

- `test_qeeg_course_comparison_phase5c.py` — not present on the local tracking ref of
  `feat/qeeg-course-comparison-phase5c`; found at the remote PR head OID `28e07af`.
  Local branch was stale; fetching and checking out to `28e07af` resolved this.

- `test_qeeg_demo_seed_phase5d.py` — similarly only present at remote head `5ac80d5`.

- Phase 2 skipped test: `test_dk_narrative_bank_has_no_banned_terms` in
  `test_qeeg_brain_map_phase2.py:182` is intentionally skipped when run standalone (narrative bank
  JSON not present on phase 2 branch alone). See Blocking Issue #5 below.

### CI results

| PR | CI build-web | CI Build&Type | CI Backend Tests | CI Worker Tests | CI API Image |
|---|---|---|---|---|---|
| #276 | SUCCESS | SUCCESS | SUCCESS | SUCCESS | SUCCESS |
| #279 | SUCCESS | SUCCESS | IN PROGRESS at audit time | SUCCESS | IN PROGRESS |
| #281 | SUCCESS | SUCCESS | SUCCESS | SUCCESS | SUCCESS |
| #283 | SUCCESS | SUCCESS | SUCCESS | SUCCESS | SUCCESS |
| #298 | SUCCESS | SUCCESS | SUCCESS | SUCCESS | SUCCESS |
| #301 | NO CHECKS (CONFLICTING) | — | — | — | — |
| #303 | SUCCESS | SUCCESS | **FAILURE** | SUCCESS | **FAILURE** |
| #304 | SUCCESS | SUCCESS | SUCCESS | **FAILURE** | SUCCESS |
| #306 | SUCCESS | **FAILURE** | **FAILURE** | SUCCESS | SUCCESS |

---

## 2. Regulatory Copy Grep — Combined Results

Grep command run across all 9 PR worktrees:
```
git grep -ni 'diagnosis|diagnostic|treatment recommendation|cure' \
  apps/api/app/routers/qeeg_*.py apps/api/app/services/qeeg_*.py \
  apps/web/src/qeeg-*.js apps/web/src/pages-qeeg-*.js \
  apps/web/src/pages-brainmap.js apps/api/app/templates/qeeg_*.html
```

### Hits classified PASS (disclaimer context)

All occurrences of the banned words across all 9 branches fall into one of three acceptable categories:

1. **Explicit regulatory disclaimer phrase** — contains "not a medical diagnosis", "not a diagnosis",
   "not diagnostic", or "not a treatment recommendation"
2. **Sanitiser / banned-pattern list** — the word is in a regex or list used to detect and block the
   term from AI output (e.g. `qeeg_ai_interpreter.py:175-176`, `qeeg_claim_governance.py:23-27`)
3. **Factual qualifier** — "Z-scores are descriptive, not diagnostic"
   (`qeeg_analysis_router.py:3538`), "Non-diagnostic safety scanner"
   (`qeeg_safety_engine.py:3,156`)

The `apps/api/app/data/dk_atlas_narrative.json` contains at its `_meta.regulatory_note` key:
"Not for diagnosis, diagnostic decisions, or treatment recommendations."
This is the disclaimer phrase itself — classified PASS per the earlier QA audit (`QEEG_REGULATORY_AUDIT.md`).

### FAIL items NOT resolved (pre-existing from QEEG_REGULATORY_AUDIT.md)

The three FAIL items identified in `QEEG_REGULATORY_AUDIT.md` (committed on Phase 1 branch at
`fb974b7`) are confirmed still present on Phase 5d (`5ac80d5`):

| File:Line | String | Classification |
|---|---|---|
| `apps/web/src/pages-qeeg-analysis.js:3655` | `epileptiform: {findings: 'Occasional focal spikes in temporal region, burst durations under 3 seconds'...}` | **FAIL** — "focal spikes" is diagnostic language for epileptiform activity; renders in demo mode on preview |
| `apps/web/src/pages-qeeg-analysis.js:3658` | `'Intermittent low-amplitude epileptiform discharges in temporal regions.'` | **FAIL** — unqualified clinical finding; renders in "Mental Health and Brain Function" section title |
| `apps/web/src/pages-qeeg-analysis.js:3654` | `firda_oirda: {firda: 'Detected sporadically in frontal channels (Fp1, F7)'}` | **FAIL** — FIRDA/OIRDA are clinical EEG abnormality patterns; "Detected" implies pathological finding |
| `apps/web/src/pages-qeeg-analysis.js:3632` | `'No focal delta abnormalities suggestive of structural lesions.'` | **FAIL** — diagnostic exclusion framing; "structural lesions" is excluded-diagnosis language |

**Aggravating factor:** `netlify.toml` (present on affected branches) sets `VITE_ENABLE_DEMO=1`,
so these strings render to all visitors on the preview URL `deepsynaps-studio-preview.netlify.app`.
No code gate prevents a patient from viewing them.

Total hit count across all 9 PR worktrees: ~42 hits, **38 PASS** (disclaimer / sanitiser /
qualifier context), **4 FAIL** (the pre-existing demo data strings above, unchanged across phases).

---

## 3. Cross-Tenant Access Verification

### `qeeg_analysis_router.py` area around line 3691 (`/reports/{report_id}/patient-facing`)

```python
# apps/api/app/routers/qeeg_analysis_router.py:3688-3692
require_minimum_role(actor, "clinician")
report = db.query(QEEGAIReport).filter_by(id=report_id).first()
if not report:
    raise ApiServiceError(code="not_found", message="Report not found", status_code=404)
_gate_patient_access(actor, report.patient_id, db)
```

This endpoint correctly: returns 404 when report is not found, and calls `_gate_patient_access`
before any data is returned. `_gate_patient_access` calls `require_patient_owner` which raises
403 (`cross_clinic_access_denied`) on mismatch.

**Finding:** The audit checklist requires 404 (not 403) on cross-clinic access. The platform
uses 403 for cross-clinic (`require_patient_owner` raises `status_code=403`). This is a pre-existing
design choice across the whole platform, not a regression from these PRs.

### NEW endpoint `GET /{analysis_id}/reports/{report_id}/pdf` (Phase 2, `qeeg_analysis_router.py:2201`)

**BLOCKING SECURITY FINDING — see Blocking Issue #3 below.**

This endpoint is missing the `_gate_patient_access` call entirely.

### Coverage in test suite

No test in any of the 9 PRs covers the cross-clinic case for `/{analysis_id}/reports/{report_id}/pdf`.
The existing `test_cross_clinic_ownership.py` covers MRI report PDF but not the qEEG equivalent.

---

## 4. Migration Safety Audit

**Migration:** `apps/api/alembic/versions/064_qeeg_report_payload.py`
**PR:** #276 (Phase 0)
**Revision ID:** `064_qeeg_report_payload`
**down_revision:** `063_add_deeptwin_persistence`

### Design review (idempotency)

The migration uses a `_has_column(bind, table, column)` guard before every `op.add_column` and
every `op.drop_column`:

```python
def upgrade() -> None:
    bind = op.get_bind()
    if not _has_column(bind, "qeeg_ai_reports", "report_payload"):
        op.add_column("qeeg_ai_reports", sa.Column("report_payload", sa.Text(), nullable=True))
    if not _has_column(bind, "qeeg_ai_reports", "report_payload_schema_version"):
        op.add_column("qeeg_ai_reports", sa.Column("report_payload_schema_version", sa.String(16), nullable=True))

def downgrade() -> None:
    bind = op.get_bind()
    if _has_column(bind, "qeeg_ai_reports", "report_payload_schema_version"):
        op.drop_column("qeeg_ai_reports", "report_payload_schema_version")
    if _has_column(bind, "qeeg_ai_reports", "report_payload"):
        op.drop_column("qeeg_ai_reports", "report_payload")
```

**Verdict: IDEMPOTENT.** Both `upgrade()` and `downgrade()` are guarded by existence checks.
Re-running upgrade on an already-migrated DB will be a no-op. Re-running downgrade on an
already-downgraded DB will be a no-op.

**Schema effect:** Adds two nullable `TEXT`/`VARCHAR(16)` columns to `qeeg_ai_reports`. Adding
nullable columns to an existing table is safe and does not require a table lock on SQLite or Postgres.
No index changes, no column drops, no type changes.

**Alembic chain integrity:** `063_add_deeptwin_persistence` -> `064_qeeg_report_payload` (no
merge head conflicts on this branch). However, `064_adverse_events_classification.py` exists on main
as a parallel head. A merge migration `065_merge_064_heads.py` will be required before or at the
time #276 lands.

---

## 5. Build Sanity

### Python syntax check (all branches)

All 9 branches pass `python3 -c "import ast; [ast.parse(open(p).read()) for p in glob('apps/api/app/**/*.py', recursive=True)]"`.

### Web build (Vite)

| Branch | Result | Notes |
|---|---|---|
| feat/qeeg-brain-map-renderers-phase1 | **EXIT 0** — built in 5.29s | Verified locally |
| All others except #301 | CI build-web: SUCCESS | Per CI status |
| #301 (phase5a) | No CI (CONFLICTING) | Must rebase before assessment |

### JavaScript syntax check

`node --check` passes for `qeeg-brain-map-template.js` (phase5d), `pages-qeeg-launcher.js` (phase3),
and `pages-brainmap.js` (phase5a).

---

## 6. Mergeability Matrix

| PR | Branch | mergeable | mergeStateStatus | CI Summary |
|---|---|---|---|---|
| #276 | feat/qeeg-brain-map-contract-phase0 | UNKNOWN | UNKNOWN | ALL PASS |
| #279 | feat/qeeg-brain-map-renderers-phase1 | UNKNOWN | UNKNOWN | Partial (IN PROGRESS at audit time) |
| #281 | feat/qeeg-brain-map-cross-surface-phase2 | UNKNOWN | UNKNOWN | ALL PASS |
| #283 | feat/qeeg-upload-launcher-phase3 | UNKNOWN | UNKNOWN | ALL PASS |
| #298 | feat/qeeg-go-live-phase4 | UNKNOWN | UNKNOWN | ALL PASS |
| #301 | feat/qeeg-brain-map-planner-overlay-phase5a | **CONFLICTING** | **DIRTY** | NO CI |
| #303 | feat/qeeg-upload-endpoint-phase5b | UNKNOWN | UNKNOWN | **FAIL**: build-api, Backend Tests, API Image, E2E |
| #304 | feat/qeeg-course-comparison-phase5c | UNKNOWN | UNKNOWN | **FAIL**: Worker Tests |
| #306 | feat/qeeg-demo-seed-and-launcher-wiring-phase5d | MERGEABLE | **BLOCKED** | **FAIL**: Build&Type Check, Backend Tests |

UNKNOWN mergeability for most PRs is because CI billing-blocked status checks prevent auto-merge
resolution. Per CLAUDE.md `gh pr merge <N> --squash --admin` can bypass when CI is billing-blocked,
but only after the blocking issues below are resolved.

---

## 7. Blocking Issues (Must Fix Before Any Merge)

### BLOCK-1: Epileptiform / diagnostic language in demo data (Regulatory — affects PRs #279, #301, #306)

**Location:** `apps/web/src/pages-qeeg-analysis.js:3632, 3654, 3655, 3658`

The demo data object contains clinical EEG diagnostic language ("focal spikes", "epileptiform
discharges", "structural lesions", FIRDA/OIRDA with "Detected") that is rendered verbatim in the UI
under `VITE_ENABLE_DEMO=1`. Because `netlify.toml` sets this flag permanently on the preview deploy,
these strings are exposed to all visitors of the preview URL.

Fix: Replace all four strings with neutral placeholder text. See `QEEG_REGULATORY_AUDIT.md` for
proposed before/after diffs.

---

### BLOCK-2: `seed_demo.py` uses invalid `status=` field on `QEEGAnalysis` (PR #306)

**Location:** `apps/api/scripts/seed_demo.py:343`

```python
# WRONG:
analysis = QEEGAnalysis(..., status="completed")
# CORRECT:
analysis = QEEGAnalysis(..., analysis_status="completed")
```

Causes 3 CI backend test failures in `tests/test_seed_demo.py` (TypeError at runtime).

---

### BLOCK-3: Missing cross-clinic gate on PDF/HTML export endpoint (PR #281)

**Location:** `apps/api/app/routers/qeeg_analysis_router.py:2201` (`export_report_html`)

The `GET /{analysis_id}/reports/{report_id}/pdf` endpoint is the only qEEG report endpoint that
does NOT call `_gate_patient_access(actor, analysis.patient_id, db)` before returning data.
A clinician from a different clinic can retrieve any report by guessing UUIDs.

Fix: Add `_gate_patient_access(actor, analysis.patient_id, db)` after the existing report existence
check (after line 2224 on phase2 branch). Also add a cross-clinic test.

---

### BLOCK-4: Hardcoded absolute local paths in `pyproject.toml` (PR #303)

**Location:** `apps/api/pyproject.toml:18-23`

PR #303 replaced workspace package references with `file:///Users/aliyildirim/...` absolute local
paths. Every CI runner and Docker build fails with:
`ERROR: Could not install packages due to an OSError: [Errno 2] No such file or directory:
'/Users/aliyildirim/DeepSynaps-Protocol-Studio/packages/core-schema'`

Fix: Revert lines 18-23 to workspace-relative references as on branches #276 and #298.

---

### BLOCK-5: `test_dk_narrative_bank_has_no_banned_terms` will fail post-merge (PR #281)

**Location:** `apps/api/tests/test_qeeg_brain_map_phase2.py:188-189`

The narrative bank `dk_atlas_narrative.json` contains `"diagnosis"` in its `_meta.regulatory_note`
disclaimer field. The test uses `assert "diagnosis" not in text.lower()` on the full JSON, so it
will fail when Phase 0 (which adds the bank) and Phase 2 are both merged. The test is correctly
skipped when run alone on Phase 2.

Fix: Narrow the assertion to exclude the `_meta` key from the text scan.

---

## 8. Non-Blocking Warnings

- **WARN-1:** `qeeg-brain-map-template.test.js` belongs on Phase 1 branch but lives on Phase 5d
- **WARN-2:** `qeeg-clinical-workbench.test.js:152,219` expects old disclaimer wording "informational
  purposes only"; Phase 1 changed it. Update test assertions.
- **WARN-3:** PR #301 has merge conflicts with main; rebase required after #298 lands.
- **WARN-4:** Alembic dual-064 head requires a `065_merge_064_heads.py` migration before #276 lands.
- **WARN-5:** WeasyPrint deps are in root `Dockerfile` (correct for production); `apps/api/Dockerfile`
  does not include them (PDF endpoint returns 503 in local dev without system WeasyPrint).

---

## 9. Recommended Merge Order

```
#276 -> #279 -> #281 -> #283 -> #298 -> #301 -> #303 -> #304 -> #306
```

All 5 blocking issues must be resolved before any PR lands. PRs #276, #281, #283, #298 have all
CI green and are cleanest candidates to work from.

---

## 10. Final Verdict: NO-GO

| Block | Severity | PR(s) affected | Fix complexity |
|---|---|---|---|
| BLOCK-1: Epileptiform demo data | Regulatory FAIL (CE/IEC 62304 risk) | #279, #301, #306 | Low (string replacement) |
| BLOCK-2: `seed_demo.py` invalid field | CI FAIL / runtime crash | #306 | Trivial (1 line) |
| BLOCK-3: Missing cross-clinic gate on PDF endpoint | Security (cross-tenant data leak) | #281 + all subsequent | Low (1 call + test) |
| BLOCK-4: Hardcoded local paths in pyproject.toml | CI infrastructure FAIL | #303 | Low (revert to workspace refs) |
| BLOCK-5: Narrative bank test fails post-merge | Post-merge regression | #281 | Low (narrow assertion) |

Once all 5 blocking issues are fixed, the full merge sequence can proceed.

---

*Audit produced by Integration / E2E QA Agent on branch `chore/qeeg-final-audit-2026-04-30`.
All test commands and file:line citations verified against live branches on 2026-04-30.*
