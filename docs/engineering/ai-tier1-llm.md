# Tier 1 — Cloud LLM (Clinical Reasoning)

Tier 1 of the three-tier DeepSynaps AI architecture. Hosts a clinical
reasoning LLM behind a vLLM OpenAI-compatible endpoint. Default target
model: **Me-LLaMA-13B** (Apache 2.0).

## Status: stub

This PR ships the contract only:

- Service package `apps/api/app/services/ai/tier1_llm/`
- Router `apps/api/app/routers/ai_tier1_llm_router.py` mounted at `/api/v1/ai/tier1`
- Schemas (`ClinicalReasoningRequest` / `ClinicalReasoningResponse`)
- Canonical disclaimer constant
- Stub `VLLMClient` that returns `stub: True, output: None` on every call
- Tests covering health, role gating, schema validation, OpenAPI registration

**Nothing in this PR loads or calls a real model.** Real wiring lands in a
follow-up PR once the contract has been reviewed.

## Endpoints

| Method | Path                          | Role     | Notes                                |
|--------|-------------------------------|----------|--------------------------------------|
| GET    | `/api/v1/ai/tier1/health`     | any auth | Reports stub status.                 |
| POST   | `/api/v1/ai/tier1/complete`   | clinician+ | Returns stub envelope with disclaimer. |

Every response carries `disclaimer = "AI-generated content. Not a clinical
decision. Reviewing clinician is responsible for all care decisions."`

## Configuration

Read from environment at process start (no `settings.py` field added in
this PR to minimise merge surface):

| Variable               | Default       | Purpose                                  |
|------------------------|---------------|------------------------------------------|
| `TIER1_LLM_ENDPOINT`   | unset (stub)  | Base URL of the vLLM server.             |
| `TIER1_LLM_MODEL`      | `me-llama-13b`| Model name passed in the request body.   |
| `TIER1_LLM_API_KEY`    | unset         | Bearer token sent to the upstream vLLM.  |

While `TIER1_LLM_ENDPOINT` is unset every `/complete` call returns
`stub: True`. Setting the endpoint alone does **not** enable real
inference — the follow-up PR must also land.

## Follow-up work (not in this PR)

1. **Wire httpx client.** POST to `{endpoint}/v1/completions` using the
   OpenAI-compatible payload that vLLM accepts. Map response back to
   `ClinicalReasoningResponse` with real `tokens_used` and `latency_ms`.
2. **Add `settings.py` fields.** Once the contract is settled, promote
   `TIER1_LLM_ENDPOINT` / `TIER1_LLM_MODEL` / `TIER1_LLM_API_KEY` into
   `AppSettings` so they appear in env validation + Fly-secret reviews.
3. **Eval harness.** Add a small offline eval set (de-identified clinical
   summaries with rubric labels) so model swaps are objectively measured
   before they reach `/complete`.
4. **Fine-tune corpus.** Curate a neuromodulation-focused training set
   (TMS / tDCS / DBS / VNS protocols, evidence summaries, contraindication
   tables). Apache 2.0 base permits derivative deployment.
5. **Cost + rate-limit.** Wire SlowAPI per-clinic limits and per-token
   billing against the existing `agent_billing_router` patterns.

## Upstream reference

- vLLM: <https://github.com/vllm-project/vllm> (Apache 2.0)
- Me-LLaMA-13B: <https://huggingface.co/clinicalnlplab/me-llama-13B> (Apache 2.0)
- OpenAI completions API contract: <https://platform.openai.com/docs/api-reference/completions>

## Phase 3 context

This is Tier 1 of 3 in the DeepSynaps AI roadmap. Tier 2 (qEEG + MRI)
and Tier 3 (edge real-time qEEG screening) ship in sibling PRs.
