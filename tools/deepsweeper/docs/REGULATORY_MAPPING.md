# Regulatory mapping — DeepSweeper

How DeepSweeper maps to the standards DeepSynaps Studio is held to.

## IEC 62304 — Medical device software lifecycle

| Clause | Requirement | DeepSweeper compliance |
|---|---|---|
| 4.3 | Software safety classification | DeepSweeper itself is **Class A** (no contribution to hazardous situation) — it manages tickets, not patients. The systems it touches are higher class (Class B/C) and protected by the regulated guardrail. |
| 5.1 | Software development plan | Versioned in this repo. Each release tag is a SOUP record. |
| 5.5 | Software unit verification | `npm test` covers `regulated.ts` (8 tests) and `audit.ts` (chain integrity, tamper detection). |
| 5.7 | Software system testing | The `verify-audit` step in CI is a system-level test of the audit chain end-to-end. |
| 6.1 | Maintenance plan | The bot itself is maintained by re-applying upstream ClawSweeper changes per `docs/ADOPTION.md` step 10. Each merge is a maintenance record. |
| 8.1 | Configuration management | All decisions, audit records, and dashboard updates are committed. The audit log is append-only and verified. |
| 9.1 | Problem resolution | Bot-closed items that are reopened by humans must be logged. Override rate >5% triggers prompt review. |

## ISO 13485 — Quality management for medical devices

| Clause | Requirement | DeepSweeper compliance |
|---|---|---|
| 4.2 | Documentation | All review records (`items/*.md`) and audit records (`audit-log.ndjson`) are committed and retained. |
| 7.3 | Design and development | The bot's prompt + schema + regulated allow-list are design controls. Changes go through PR review. |
| 8.2.1 | Customer feedback | Issue/PR triage is a feedback channel. The bot conservatively keeps real bugs open for human action. |
| 8.4 | Analysis of data | The dashboard surfaces close rate, keep-open reason distribution, and override rate. |
| 8.5.2 | Corrective action | A regulated-component close that slips through (should be impossible by design) triggers a CAPA. |

## EU AI Act — High-risk AI systems

DeepSweeper itself is not a high-risk AI system per Annex III. It manages tickets, not clinical decisions. However, because it operates on regulated software, it inherits these obligations:

| Article | Requirement | DeepSweeper compliance |
|---|---|---|
| Art. 10 | Data governance | Training data is N/A (Codex is upstream). The bot's input data (issues, PRs) is governed by GitHub's terms. |
| Art. 12 | Record-keeping | The `audit-log.ndjson` chain is the system log. SHA256 chain + canonical JSON + verifiable. |
| Art. 14 | Human oversight | Per-repo `apply_closures: false` for regulated repos. Bot reviews; humans close. Override-rate monitoring. |
| Art. 15 | Accuracy, robustness, cybersecurity | Defense-in-depth: prompt instructs model AND apply phase re-checks. Either catching it keeps the item open. |

## GDPR

DeepSweeper does not process patient data. It processes:
- Issue and PR text from GitHub (developer-authored content)
- Commit metadata (author email, timestamps)

No PHI flows through DeepSweeper. The audit log explicitly excludes any payload field that could contain PHI — only event type, repo, item number, and decision metadata are stored.

## HIPAA

Same as GDPR — no PHI in the bot's data path. The bot is not part of the covered entity's clinical workflow.

## Audit log as SOUP record

The `audit-log.ndjson` file serves as the SOUP audit-trail evidence required by IEC 62304 § 5.3.4 (Software of Unknown Provenance integration records). For each close action affecting a regulated component (which should be zero by design), the record contains:

- ISO 8601 timestamp (`recordedAt`)
- Actor (`deepsweeper-bot`)
- Event type (`deepsweeper.close` or `deepsweeper.keep_open`)
- Tenant ID (`deepsynaps-internal`)
- Payload — repo, item number, kind, close reason, regulated check result, fixed release/SHA
- Hash chain (`hashPrev`, `hashSelf`)

**Retention:** device lifetime + 7 years (default), or 25 years if any paediatric subject is in scope (matches Brain Twin LEARNING_LOOP retention policy).

## What an auditor would see

1. Pull `deepsynaps/deepsweeper` repo
2. Run `npm run verify-audit` — must return `{ ok: true }`
3. Inspect `items/<repo>/<number>.md` for any closed item — front-matter shows decision, confidence, regulated check, evidence with file/line/sha
4. Inspect `audit-log.ndjson` for the corresponding close record — hash chain links back to first record
5. Inspect `config/regulated-paths.yaml` — locked allow-list
6. Inspect `config/target-repos.yaml` — per-repo apply policy
7. Inspect `prompts/review-item.md` — versioned prompt

If any of those steps fail, the bot is non-compliant and the system is in CAPA.
