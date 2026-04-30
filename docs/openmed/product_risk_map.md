# Product Risk Map — OpenMed integration

## Risk: extracted entity treated as clinical finding
- **Mitigation:** every `AnalyzeResponse` carries `safety_footer="decision-support, not autonomous diagnosis"`. UI must label entities as "NLP extraction — verify".
- **Status:** ✓ enforced in schema default; cannot be omitted.

## Risk: PHI leaked to upstream LLM via raw context
- **Today:** `patient_context.py:81` builds plain markdown context that is sent verbatim to OpenRouter / Anthropic.
- **Mitigation:** `/api/v1/clinical-text/deidentify` is now available as a server-side gate. Phase 2 will route `build_patient_medical_context()` through it when `OPENMED_DEID_PATIENT_CONTEXT=1` is set.
- **Status:** Endpoint shipped; integration into context builder is phase 2 (documented in `blockers_remaining.md`).

## Risk: OpenMed upstream outage breaks clinical-text endpoints
- **Mitigation:** HTTP backend always falls back to heuristic on any non-200 / timeout / parse failure (`backends/http.py`). Endpoints never 5xx because of upstream.
- **Status:** ✓ unit-tested (`test_health_reports_heuristic_when_no_upstream`).

## Risk: rate-limit abuse against OpenMed quota
- **Mitigation:** `@limiter.limit("30/minute")` per IP on all three POST endpoints.
- **Status:** ✓ wired.

## Risk: oversized text crashes the adapter
- **Mitigation:** `ClinicalTextInput.text` Pydantic constraint `max_length=200_000`.
- **Status:** ✓ enforced; tested with 200k input.

## Risk: pretend "analyze" button on UI
- **Mitigation:** UI does not yet wire to the new endpoints. No new visible button — surface is API-only this PR. Nothing pretends to work.
- **Status:** ✓ no beta-visible regression.

## Risk: clinician-only auth gate misconfigured
- **Mitigation:** all 4 endpoints call `require_minimum_role(actor, "clinician")`. `/health` requires auth too (no probing without credentials).
- **Status:** ✓ tested (`test_health_requires_clinician`, `test_analyze_rejects_non_clinician`).
