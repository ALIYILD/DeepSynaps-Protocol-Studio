# Hermes prompt — qEEG router consent sweep (after PR 2 merge)

**When to use:** After PR 2 (`feat(qeeg): normative scaffold … + consent hardening`) is merged. **Do not start PR 3 RAG** until this sweep lands.

**PR title:** `fix(consent): complete qEEG router ai_analysis consent sweep`

**Background:** PR 2 already guards `GET …/normative-model-card` and `POST …/ai-report` with `require_ai_analysis_consent(..., ai_modality="qeeg")`, strict `_is_demo_id` allowlist, and PHI-safe denial handling. PR 2 **Refs #841** and does **not** close it. This follow-up completes the **qEEG analysis router** portion of #841 before evidence-grounded reporting.

---

## OBJECTIVE 0 — Reuse or centralise demo ID safety boundary

PR 2 tightened `_is_demo_id` in `apps/api/app/routers/qeeg_analysis_router.py` to an **explicit allowlist** (not broad `demo-*` / `mock-*` prefix matching).

Before classifying the full qEEG router:

1. Inspect whether other qEEG endpoints, **longitudinal** routes, **assessment-correlation** routes, or demo fixture paths use **separate** demo/mock/test checks.
2. **Rules:**
   - Do not reintroduce broad prefix matching.
   - Do not allow real-looking IDs such as `demographic-patient-123`, `demoed-real-patient-id`, `mockery-real-analysis`, `sample-real-upload`, or `demo-clinical-trial-007` to bypass consent.
   - **Prefer centralising** the demo predicate into one helper/module if multiple routes need it (e.g. `app.services.qeeg_demo_ids` or similar — pick a name consistent with the repo).
   - If centralising is too risky in this PR, keep `_is_demo_id` in the router but ensure **every** qEEG router path that uses a demo bypass applies the **same strict allowlist semantics** (copy is worse than one import — prefer one function).
3. Add tests for **every route category** where demo bypass is allowed (positive + negative).

**Acceptance:**

- Demo/synthetic routes stay usable for known fixtures (`demo`, `mock`, `test`, `demo-pt-*`, `demo-patient*`).
- Real patient-linked routes cannot bypass consent through demo-looking IDs.
- The same strict demo allowlist is used consistently across qEEG router endpoints.

---

## OBJECTIVE 1 — Route inventory

For **every** endpoint in `apps/api/app/routers/qeeg_analysis_router.py`, produce a table:

| Route | Method | Reads patient-linked data? | Performs AI/analysis? | Exports document/data? | Demo-only? | Consent required? | Consent type | Audit event |

Categories: demo-only synthetic; patient-linked read; AI/report generation; export/download/document; admin/system metadata; upload/import (check existing `device_sync` / ingestion consent if applicable — do not invent new consent types).

---

## OBJECTIVE 2 — Apply consent gates

For each patient-linked route:

1. Minimum lookup for `analysis_id` / `patient_id`.
2. If demo/synthetic → strict demo-safe path only.
3. If live → enforce consent **before** derived data return or downstream processing.
4. Use `consent_enforcement.py` helpers; standard 403 shape; PHI-safe app log where appropriate.

- **`ai_analysis`:** patient-linked analysis, AI upgrades, report generation, normative surfaces not already gated.
- **`document_generation`:** PDF, patient/clinician report export, BIDS/FHIR/CSV where patient-linked — where applicable per repo patterns.

---

## OBJECTIVE 3 — Strict demo boundary (reinforce)

Align with OBJECTIVE 0; extend `tests/test_qeeg_demo_id_boundary.py` / `tests/test_qeeg_normative_consent.py` patterns as needed.

---

## OBJECTIVE 4 — Consent ordering

Consent before: AI call, RAG call, evidence tied to patient data, report generation, export generation, heavy file reads, derived computation beyond minimum route lookup. Add mocks/spies where feasible to prove short-circuit.

---

## OBJECTIVE 5 — PHI-safe logging and 403 bodies

403 must not leak names, emails, filenames, paths, clinical notes, scores, raw EEG hints, or full analysis IDs in the JSON body. Logs: event name, hashed/truncated analysis id, route, modality `qeeg` — no PHI. Audit trail: existing `AuditEventRecord` / `SafetyFlag` patterns.

---

## OBJECTIVE 6 — Docs

Update `docs/qeeg-analyzer-endpoint-map.md` with a **full consent matrix** for qEEG router endpoints (columns: Endpoint, Method, Data type, Consent required, Helper used, Demo behaviour, Audit event, Notes).

Add note: *“This PR completes the qEEG **analysis router** consent sweep. Issue #841 remains open unless MRI and DeepTwin router sweeps are also complete.”*

**Issue reference:** use **Refs #841** for qEEG-only completion; use **Closes #841** only if the issue scope is fully satisfied across all named routers.

---

## OBJECTIVE 7 — Tests

```bash
cd apps/api && .venv/bin/python -m pytest tests/test_qeeg_normative_consent.py tests/test_qeeg_demo_id_boundary.py -q
cd apps/api && .venv/bin/python -m pytest tests/ -k qeeg -q
```

Frontend smoke (no regressions):

```bash
cd apps/web && node --test src/pages-qeeg-analysis-ai-upgrades.test.js src/pages-qeeg-analysis-mne.test.js src/pages-qeeg-analysis-launch-audit.test.js src/qeeg-analysis-normative-engine.test.js
cd apps/web && npm run build
```

If `pages-qeeg-analysis-erp-tab.test.js` fails on missing `jsdom`, report as **Refs #844** environment limitation — do not claim passed.

---

## PR 3 guardrail (sequence after consent sweep)

Do **not** build RAG-heavy reporting until consent + audit paths are complete on the routes PR 3 will call. Intended pipeline:

1. Check `ai_analysis` consent.  
2. Check role permission.  
3. Retrieve qEEG findings.  
4. Retrieve evidence.  
5. Generate **draft** report only.  
6. Attach **real** citations only (no invented PubMed/DOI).  
7. Show decision-support copy.  
8. Audit report generation.  
9. Store draft as **clinician-review required**.

**Team guardrail:** Do not ship impressive autonomous report generation before consent and audit paths are complete.

---

## Merge context for PR 2 (reviewer positioning)

- **Refs #841** — does not close #841.  
- **Refs #844** — CI / full deps / `jsdom` / `vite` availability.  
- **Refs #845** — programme-level GDPR/DPIA.  

PR 2 is merge-ready when CI or a dependency-complete environment confirms **`npm run build`** for `apps/web`.
