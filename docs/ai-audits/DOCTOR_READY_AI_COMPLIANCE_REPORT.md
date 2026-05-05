# Doctor-ready AI Compliance Report (Decision Support / PHI / Claims)

Branch: `doctor-ready/e2e-validation-and-hardening`  
Scope owner: Agent 7 (AI/PHI/Compliance/Claims)  
Date: 2026-05-05

## Executive summary

- **High-risk overclaim found and fixed**: a DeepTwin doc line that said “DeepTwin predicts clinical trajectories” was softened to decision-support “modeled what-if trajectories” language.
- **PHI risk found and fixed**: qEEG AI report prompts and clinician chat prompts could include clinician-entered free text without PHI redaction; now **best-effort redaction is applied before any LLM/provider call**.
- **AI health endpoint reviewed**: `/api/v1/health/ai` is **truthful** (presence checks only, no external calls) and **does not expose secrets** (only indicates missing env/package/weights).
- **UI claim softened**: “Predict brain age” button text changed to “Estimate brain age (research)” to avoid outcome/diagnostic framing.

## 1) Dangerous wording scan (requested phrases)

Searched for: “guaranteed”, “predicts outcome”, “diagnosis”, “autonomous treatment”, “validated biomarker”, “native WinEEG”, “official LORETA”, “real MRI segmentation in demo”, “DeepTwin predicts”, “ERP diagnoses”, “qEEG proves”.

### Findings

- **DeepTwin predicts (HIGH RISK)**  
  - **Found**: “DeepTwin predicts *clinical* trajectories …”  
  - **File**: `docs/deeptwin/deeptwin_tribe_reference.md`  
  - **Fix applied**: softened to “produces modeled what-if trajectories for clinician review (decision-support), not validated patient-specific outcome prediction …”

- **Native WinEEG / official LORETA**
  - **Found** only in safety/negative-claim contexts and tests/docs that explicitly deny native compatibility; no “native/official” claims shipped as positive marketing copy.
  - Example: `apps/web/src/pages-qeeg-raw-workbench.js` includes explicit non-claim language.

- **“qEEG proves” / “ERP diagnoses” / “official LORETA” / “real MRI segmentation in demo”**
  - **Not found** in repo at time of scan.

- **“guarantee(d)”**
  - Numerous hits are **non-clinical engineering guarantees** (e.g., “guaranteed to collide”, “overlay removal”), plus **explicit non-guarantee disclaimers** (“results not guaranteed”). No “guaranteed outcome” marketing claim found in shipped UI.

## 2) Copy hardening changes (decision-support language, banners preserved)

### Applied fixes

- **DeepTwin doc overclaim softened**  
  - `docs/deeptwin/deeptwin_tribe_reference.md`

- **qEEG UI: “Predict brain age” → “Estimate brain age (research)”**  
  - `apps/web/src/pages-qeeg-analysis.js`

Safety banners/disclaimers were **not removed**.

## 3) AI health endpoints (honesty + secrets)

### Reviewed

- `apps/api/app/routers/ai_health_router.py` (`GET /api/v1/health/ai`)
  - **Wiring fix**: ensured the router is included in the FastAPI app (`apps/api/app/main.py`). Without this include, tests and deployments would return `404 Not Found` for `/api/v1/health/ai`.

### Assessment

- **No secret exposure**: checks `*_API_KEY` env var **presence** only; does not return values.
- **No external calls**: only imports/checks packages and weight paths; does not “phone home”.
- **Truthful statuses**: returns explicit `status` per feature (`active`, `unavailable`, `fallback`, `rule_based`, `not_implemented`) plus `current_missing` reasons.

## 4) PHI handling in prompts/logs/audit (LLM egress controls)

### Risk identified

- Clinician-entered free text (e.g., `patient_context` and transcripts) can contain PHI. Some call sites were inserting that text into LLM prompts without an enforced redaction step.

### Fixes applied (best-effort redaction before provider calls)

- **qEEG AI interpreter**  
  - File: `apps/api/app/services/qeeg_ai_interpreter.py`  
  - Change: `patient_context` is now appended as **“Patient Clinical Context (redacted)”** using `app.qeeg.services.phi_redaction.redact_phi()`.

- **Clinician chat context injection**  
  - File: `apps/api/app/services/chat_service.py`  
  - Change: `patient_context` is best-effort redacted before injection into messages.

- **Media upload analysis + clinician note drafting**  
  - File: `apps/api/app/services/media_analysis_service.py`  
  - Change: `transcript_text` is redacted prior to prompt construction; clinician note draft prompt now uses redacted `patient_name`, `condition`, and `modality`.

### Coordination with QEEG-105 PHI redaction work

- The repo already has `apps/api/app/qeeg/services/phi_redaction.py` and a unit test in `phi_redaction_test.py`.  
- The above fixes **reuse that shared redaction utility** so PHI handling stays centralized and can be expanded without rewriting LLM call sites.

### Remaining considerations (follow-up)

- Current redaction is **best-effort** (structured identifiers/dates/email/phone/ID). Free-text names/addresses may still leak if typed. Next tightening step would be to expand `redact_phi()` to cover additional name/address heuristics and/or enforce “no PHI in free text” UI guidance plus server-side blocking for obvious patterns.

## 5) High-risk strings list (found + fixed)

- `docs/deeptwin/deeptwin_tribe_reference.md`  
  - Before: “DeepTwin predicts *clinical* trajectories …”  
  - After: “DeepTwin produces modeled what-if trajectories for clinician review (decision-support), not validated patient-specific outcome prediction …”

- `apps/web/src/pages-qeeg-analysis.js`  
  - Before: button: “Predict brain age”  
  - After: button: “Estimate brain age (research)”

## 6) Files changed

- `docs/deeptwin/deeptwin_tribe_reference.md`
- `apps/api/app/services/qeeg_ai_interpreter.py`
- `apps/api/app/services/chat_service.py`
- `apps/api/app/services/media_analysis_service.py`
- `apps/web/src/pages-qeeg-analysis.js`
- `docs/ai-audits/DOCTOR_READY_AI_COMPLIANCE_REPORT.md`

