# Clinical Text Analyzer — clinician-pilot readiness

This document describes how the `deepsynaps-text` package supports **responsible** use for **supervised** research and assistive decision support. It is **not** a regulatory submission, clinical validation report, or intended-use label for a medical device.

## What the software is

- **Assistive extraction and triage hints** from clinical text (notes, messages).
- **Draft structured outputs** (`ClinicalTextReportPayload`) that **must be verified** against source documentation by a qualified reviewer before reliance in care, billing, or research datasets.

## What the software is not

- Not a source of definitive diagnosis, staging, or autonomous clinical decisions.
- Not a substitute for institutional triage protocols or emergency services.
- Not validated for unsupervised use across sites, languages, or specialties without a separate evaluation program.

## Technical controls implemented in code

| Control | Mechanism |
|---------|-----------|
| **Audit fingerprints** | Each pipeline run records SHA-256 of input clinical body (`input_content_sha256`), pipeline definition (`definition_content_sha256`), report payload (`output_report_sha256`), and `content_sha256` + `package_version` on the report. |
| **Provenance** | `collect_text_provenance(run_id)` returns per-node artefacts with `package_version`, `rule_pack_version`, and backend-specific version keys (e.g. `deid_rules_version`, `message_rules_version`, `terminology_ruleset`). |
| **Persistence (optional)** | Set `DEEPSYNAPS_TEXT_PERSIST_RUNS=1` and `DEEPSYNAPS_TEXT_RUN_STORE_DIR` to write `TextPipelineRun` JSON to disk for review and backup. |
| **Rules-only mode** | `DEEPSYNAPS_TEXT_RULES_ONLY_NLP=1` forces the `rule` NER backend for reproducible pilots. |
| **LLM kill switch (reserved)** | `DEEPSYNAPS_TEXT_DISABLE_LLM=1` is reserved for future LLM-in-pipeline nodes. |

## Deployment checklist (before a clinician-facing pilot)

1. **Institutional review** of intended use, human-in-the-loop workflow, and residual risks.
2. **Privacy**: confirm de-identification policy, logging redaction, vendor DPAs/BAAs, and region for data processing.
3. **Validation plan**: labeled sample or proxy corpus; metrics and known failure modes documented.
4. **Operations**: who receives alerts, how to file incorrect-output reports, and rollback plan.
5. **Legal/regulatory**: **consult qualified counsel** for US/EU or other jurisdiction requirements; this README is not legal advice.

## Version strings

Rule and stub versions live in `deepsynaps_text.pipeline_versions` and are attached to pipeline artefacts. Bump them when rule behavior changes in a material way.
