# AGENTS.md — DeepSynaps Clinical Text Analyzer

Guidance for Cursor and automated agents working on **clinical text, messaging, and email analysis** in this repository: unstructured notes, portal chats, clinician–patient messages, discharge summaries, neuromodulation reports, internal triage comments, and related documents.

**Scope boundary:** This subtree concerns **text only**. Do **not** extend this file to cover MRI/imaging, audio/ASR, or video pipelines unless the task explicitly asks for cross-modality integration points.

---

## Project purpose

1. **Ingest, de-identify, and analyze clinical text** (notes, messages, emails, reports, chats) for **neuromodulation** and **general neurology**, plus broader clinical entities where product requirements demand it.

2. **Extract structured clinical data**: problems, medications, labs, procedures, plans, adverse events; **neuromodulation profiles** (modalities, targets, parameters, responses); **risk markers** and triage-relevant signals; **action items** from asynchronous communication.

3. **Support AI agents and downstream products** for documentation assistance, triage, and clinician-facing decision support — always as **assistive extraction and summarization**, not autonomous clinical decisions.

---

## Architecture principles

### Modular stack

Keep boundaries explicit. Expected layers (names map to package layout under `src/deepsynaps_text/`):

| Layer | Responsibility |
|-------|----------------|
| **text_ingestion_and_deid** | Normalize encodings, segment documents/threads, apply de-ID/masking policy before text crosses trust boundaries. |
| **core_clinical_nlp** | Sectioning, NER, negation, assertion (uncertainty/experiencer), temporality; span-rich outputs for downstream linking. |
| **terminology_linking_and_coding** | Map mentions to standard concepts (UMLS/SNOMED/ICD/LOINC/RxNorm as licensed) and neuromodulation-specific vocabularies. |
| **neuromodulation_phenotyper** | Therapy episodes, stimulation parameters, anatomical/functional targets, response, contraindications — grounded in text evidence. |
| **message_and_email_analyzers** | Intent, urgency, triage categories, action items for short-form and threaded communication. |
| **risk_and_phenotype_analyzers** | Condition risks, computable phenotypes, registry-oriented features (often v2+). |
| **llm_extraction_framework** | Task configs, schemas, prompt templates, validated LLM outputs, optional QA — behind explicit flags. |
| **reporting_and_summaries** | Canonical JSON reports (`ClinicalTextReport` and related), stable error codes, confidence and provenance envelopes. |
| **workflow_orchestration** | Stage DAG, job identity, artefact directories, resume/rerun semantics. |

### Wrap first, reimplement second

- Integrate **external NLP and LLM tooling** through thin **adapters** (e.g. medSpaCy/scispaCy/BioSyn-style linkers, hosted LLM APIs).  
- Core package code should depend on **interfaces + adapters**, not on a single vendor library deep in business logic.

### Strong privacy

- Any text or derivative sent outside the secure boundary (external models, third-party APIs, shared logs) must follow a **mandatory de-identification / masking policy**.  
- Default to **minimum necessary** exposure; document policy decisions in code and config, not only in prose.

### Strong provenance

- Every structured output should be traceable to **evidence spans**, **model/rule identifiers**, **versions**, and **thresholds**.  
- LLM outputs must record **prompt template id/version** and **model id** where applicable.

---

## Coding rules

- **Typed Python** — public surfaces typed for clarity and mypy-friendly patterns (`TypedDict`, Pydantic models, or dataclasses for structured outputs).

- **Small, testable modules** — prefer **pure functions** where possible (especially rules, normalizers, schema validation). Side effects confined to adapters and orchestration.

- **No PHI in logs or test fixtures** — use synthetic or publicly safe snippets only; never commit real patient text.

- **Clear schemas** — structured outputs use **Pydantic or dataclasses** with explicit field meanings; avoid raw dicts as public API returns.

- **Separation of concerns**  
  - Raw text I/O and de-ID  
  - Rule/ML-based NLP  
  - LLM-based extractions  
  - Reporting and API payloads  
  - Orchestration and job lifecycle  

---

## Dependency rules

- **Heavy NLP dependencies** (spaCy, medSpaCy, scispaCy, transformers, etc.) belong in **optional extras** (e.g. `[text]`, `[clinical_nlp]`), mirroring the MRI pipeline’s optional-neuro pattern.

- **Language- and model-specific code** lives under **`adapters/`** (e.g. spaCy pipeline loader, Hugging Face wrappers).

- **HTTP and LLM client calls** must live in **isolated modules** with **timeouts, retries**, and structured error handling — never scattered across NLP logic.

---

## Testing rules

- **pytest** is required for new modules and behavioral changes.

- Tests use **synthetic or de-identified** text only; **no real PHI**.

- **Unit tests** for rule-based and deterministic components; **integration tests** for full pipeline paths with fixtures/golden JSON where helpful.

- **LLM extraction**: tests focus on **schema validation**, **deterministic mocks**, and **fallback behavior** when providers fail or return invalid JSON — not on brittle assertions about creative wording.

---

## Logging and provenance

- Use **structured logging** (stage name, `analysis_id` or job id, timing, outcome).

- Key stages to log at INFO/DEBUG as appropriate: **ingestion**, **de-id policy application**, **NER/assertion**, **phenotyping**, **message analysis**, **report assembly**.

- Attach **provenance objects** to outputs: model ids, rule set versions, prompt template ids, thresholds, timestamps.

- Design so a reviewer can **reconstruct** how a phenotype, risk flag, or score was produced (evidence + configuration snapshot).

---

## External tool usage (adapter interfaces)

Design stable adapter interfaces for:

1. **spaCy / medSpaCy clinical NER pipelines** — load model, run on de-identified text, return spans and coarse types.  
2. **scispaCy / BioSyn-style concept linking** — mention → candidate CUIs / ontology ids with scores.  
3. **LLM tasks** — generic client abstraction (chat/completions), structured output parsing, validation loop.

**Pluggability:** Implementations may swap (different spaCy models, different hosts); core logic must not hardcode one library’s globals.

---

## DO NOT rules

- **Do not** store raw PHI in long-term logs, training artifacts, or example datasets in git.

- **Do not** mix **UI or FastAPI route handlers** into the NLP core package — HTTP belongs in `apps/api` (or similar) behind a thin façade.

- **Do not** encode **institution-specific billing rules** directly into analyzers — keep such rules **configurable** or in a separate policy layer.

- **Do not** label UI or API fields as definitive **“diagnosis”** — use **“extracted entity,”** **“phenotype,”** **“risk score,”** or **“suggested category”** per product/legal guidance.

- **Do not** scope creep into **imaging, audio, or video** analysis in this package unless the task explicitly requires an integration contract (e.g. linking text report ids to other modality jobs).

---

## Quick reference

| Topic | Location / convention |
|-------|------------------------|
| Package root | `packages/text-pipeline/` |
| Source | `packages/text-pipeline/src/deepsynaps_text/` |
| API contract | `packages/text-pipeline/portal_integration/api_contract.md` (when present) |
| Tests | `packages/text-pipeline/tests/` |
| App wiring | `apps/api` routers/services — not inside `deepsynaps_text` core |

For repo-wide policies (git, deploy, concurrent sessions), see the root **`AGENTS.md`** and **`CLAUDE.md`**.
