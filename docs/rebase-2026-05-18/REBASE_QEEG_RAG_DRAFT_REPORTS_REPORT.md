# Rebase report — `feat/qeeg-rag-draft-reports`

- **Original branch:** `origin/feat/qeeg-rag-draft-reports`
- **Rebased branch:** `rebase/feat-qeeg-rag-draft-reports-onto-main-2026-05-18` (created, rebase aborted, not pushed)
- **State vs main pre-rebase:** 3 commits ahead, 949 behind
- **Unique commits:**
  1. `b6382cb8 feat(qeeg): add evidence-grounded rag draft reports` — the substantive feature commit; conflicted.
  2. `fa6ba64f test(qeeg): align report coverage with rag draft flow` — test follow-up.
  3. `24a3ab01 test(qeeg): stabilize compare coverage assertions` — test follow-up.

## Conflict files
- `apps/api/app/routers/qeeg_analysis_router.py` (15 conflict markers)
- `apps/api/app/services/qeeg_ai_interpreter.py` (auto-merged but suspicious)
- `apps/web/src/api.js` (auto-merged)
- `apps/web/src/pages-qeeg-analysis.js` (auto-merged)
- `apps/web/src/pages-qeeg-analysis-coverage.test.js` (auto-merged)

## Conflict classification
**CLINICAL_GOVERNANCE_RISK · STOPPED PER RULES**

`qeeg_analysis_router.py` is the largest router in the codebase (4,700+ lines, 36 endpoints, prior work memory notes it explicitly). The conflict touches:
- consent enforcement paths around `generate_ai_report_endpoint` / `generate_qeeg_rag_report_endpoint`
- evidence/RAG draft generation
- AI report storage + clinician sign-off chain
- patient-facing surface gating

Mission rule: *"If conflict touches clinical governance, consent, export, audit, auth, or migrations, stop and report."* qEEG analysis is core clinical governance — stopped.

## What's already on main vs. what the branch wanted
Inspecting the file *after the failed merge* (before abort) showed `generate_qeeg_rag_report_endpoint` already at `qeeg_analysis_router.py:1934`, plus the supporting `QEEGRAGReportRequest` Pydantic model at line 1439, plus the `rag_report_requested` / `rag_report_failed` / `rag_report_generated` audit events. That endpoint is exactly what the branch was trying to add. From recent session memory: this work landed on main earlier today as part of PR #3 / commit `889 POST /{analysis_id}/rag-report backend endpoint implemented in qeeg_analysis_router.py`.

So with high confidence:
- **`b6382cb8 feat(qeeg): add evidence-grounded rag draft reports`** is now *superseded* by main's implementation. The branch's version conflicts because two agents wrote the same feature with different signatures, models, audit events, and consent paths.
- The two test commits (`fa6ba64f`, `24a3ab01`) were written against *the branch's* router contract, not main's — they would also need a clinical re-review to confirm they don't relax governance assertions.

## Tests run
None — rebase aborted before any patch was applied.

## Remaining risks
- The branch's `rag-report` endpoint may differ from main's in *consent gating* (e.g., HITL clinician-only vs. patient-permitted), *citation provenance handling*, *disclaimer copy*, or *audit event keys*. Resolving the conflict blindly would risk silently weakening one of these guarantees.
- The branch's tests presumably assert against the branch's contract — landing them as-is could green-light a regression in main's contract.
- The branch also touches `apps/web/src/api.js` and `pages-qeeg-analysis.js`; a frontend that calls the branch's signature against main's endpoint would 422 or worse.

## Recommendation
**BLOCKED — needs a senior-clinician + governance review before any merge.**

Concrete next step (not done here):
1. Diff `qeeg_analysis_router.py @ b6382cb8` against `qeeg_analysis_router.py @ origin/main`, restricted to the `rag-report` endpoint and its dependencies (`QEEGRAGReportRequest`, `match_condition_patterns`, `generate_ai_report`, audit-event keys, consent calls).
2. Decide which side is the authoritative contract.
3. If main's is authoritative (memory suggests yes), close `origin/feat/qeeg-rag-draft-reports` and salvage only the tests that pass against main's contract — re-write them where they don't.
4. If branch's is authoritative, cherry-pick `b6382cb8` onto a fresh branch and resolve the conflicts file-by-file *with clinical-governance review*, then re-author the tests.

Do **not** force this branch into main without that review. The clinical surface is too sensitive to merge blind.
