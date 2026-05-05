## Protocol Studio — AI / LLM Prompt Safety Report (Agent 9)

### Executive summary
Protocol Studio protocol generation is currently deterministic and does not call external LLMs. The repo already contains robust LLM integrations for chat/agents and qEEG tooling, plus strong PHI/PII log scrubbing and a mature “no invented citations” pattern (qEEG narrative: deterministic citation checker + fallback). If Protocol Studio introduces any protocol narrative generation via an LLM, it must reuse those patterns to ensure narratives are grounded in structured evidence/patient context and reject invented citations, without weakening existing safety wording.

### Scope
- Identify existing LLM integrations, prompt builders, PHI redaction.
- Determine how to keep any protocol narrative generation grounded and citation-safe.
- Propose a grounding validator and deterministic fallback when LLM is unavailable.
- Preserve (do not weaken) existing safety/governance wording.

### Findings — existing LLM integrations (code pointers)
- Unified LLM wrapper (OpenRouter/OpenAI SDK primary, Anthropic fallback; output XSS sanitization; context injected as user message to reduce injection):
  - `apps/api/app/services/chat_service.py`
- Deterministic-first + LLM-optional narrative (qEEG raw workbench copilot) with explicit fallback when LLM unavailable:
  - `apps/api/app/services/raw_ai.py`
- Evidence RAG used by chat agent (local SQLite evidence DB; formats paper blocks for citations):
  - `apps/api/app/services/evidence_rag.py`
- Existing “grounded narrative with strict citation checker + deterministic fallback” (qEEG narratives):
  - `packages/qeeg-pipeline/src/deepsynaps_qeeg/narrative/compose.py`
  - `packages/qeeg-pipeline/src/deepsynaps_qeeg/narrative/safety.py`

### Findings — PHI/PII controls (defense in depth)
- Request/Sentry sanitization (path ID redaction; strips sensitive headers; drops JSON bodies for patient-scoped routes):
  - `apps/api/app/services/log_sanitizer.py`
- MRI PHI audit uses conservative wording (“best-effort heuristic; not a guarantee”):
  - `apps/api/app/services/mri_phi_audit.py`

### Findings — Protocol Studio generation is currently deterministic
- Protocol generation endpoints explicitly “no external AI call — data-driven only”:
  - `apps/api/app/routers/protocols_generate_router.py`
  - `apps/api/app/services/clinical_data.py`
  - `apps/api/app/services/generation.py`

### Existing governance requirements (must preserve)
- Protocol evidence governance policy (citation hygiene; parameter mismatch disclosure; patient copy must be weaker than clinician copy; separate regulatory status from efficacy):
  - `docs/protocol-evidence-governance-policy.md`
- Protocol Studio doctor-ready non-negotiables (“Do not invent references/citations”; “Do not weaken safety wording”; “insufficient data” when missing):
  - `docs/ai-audits/PROTOCOL_STUDIO_DOCTOR_READY_PLAN.md`

---

## Recommendation: Protocol narrative generation MUST be “structured-first, LLM-optional”

### Inputs (strictly structured, PHI-safe)
Any protocol narrative generator should accept:
- The structured protocol draft (condition/modality/device, evidence grade, contraindications, monitoring plan, disclaimers, off-label flags).
- A bounded citation set (registry sources + evidence DB results), normalized to IDs `C1..Cn`.
- Optional patient meta limited to an allowlist (e.g., age range, sex, high-level risk flags). No free-text notes unless redacted.

### Output contract
- Markdown with fixed sections and decision-support posture.
- Every sentence must include at least one citation marker like `[C1]`.
- Only allow citation IDs from the provided set.

---

## Grounding validator (deterministic)
Minimum validator checks (must-pass):
1. Non-empty narrative.
2. Sentence-level citation requirement: each sentence has >=1 `[C#]`.
3. Citation allowlist: every cited `C#` exists in provided references.
4. Safety language scan: block banned/unsafe phrases (e.g., diagnose/diagnostic, guaranteed, “FDA approved so it works”, “treatment recommendation”), and ensure patient-facing text is not stronger than clinician-facing text.

Recommended stronger validator:
5. Claim-to-citation validation using existing citation validator API:
   - Extract candidate claims from narrative.
   - Call `POST /api/v1/citations/validate`.
   - Fail closed (repair loop or fallback) on fabricated PMIDs, low relevance, retractions, or insufficient grounding.

Relevant existing infrastructure:
- `apps/api/app/routers/citation_validator_router.py`

---

## Deterministic fallback (when LLM unavailable or fails validation)
A deterministic fallback must:
- Be generated entirely from existing structured fields.
- Preserve existing disclaimers/safety wording (do not paraphrase upward).
- Avoid numerical efficacy claims unless present in structured evidence inputs.
- Use the same citation ID allowlist; if only raw URLs exist, mark citations unverified (never fabricate DOI/PMID).

This mirrors existing patterns:
- qEEG narrative fallback (guaranteed to pass citations): `packages/qeeg-pipeline/src/deepsynaps_qeeg/narrative/safety.py`
- Raw EEG copilot fallback string: `apps/api/app/services/raw_ai.py`

---

## Risk register (Protocol Studio if LLM narratives are introduced)
- Invented citations / citation drift
  - Mitigation: strict `[C#]` allowlist + claim validator.
- Patient PHI leakage in prompts
  - Mitigation: patient meta allowlist; no free text; reuse `log_sanitizer` principles.
- Safety wording regression (“approved”, promises of benefit)
  - Mitigation: banned phrase scanner; enforce governance policy wording rules.
- LLM outage or misconfiguration
  - Mitigation: deterministic fallback narrative and deterministic protocol generator remains authoritative.

### Verdict
Protocol Studio is currently safe-by-construction for protocol generation (no LLM). If protocol narrative generation is added, the repo already contains appropriate, tested safety patterns (qEEG narrative citation checker + fallback) and a citation/claim validator service. Reuse these designs to enforce grounding and citation integrity without weakening existing governance wording.

