# IEC 62304 Software Lifecycle Process — Template

> **TEMPLATE ONLY. Not a quality record.**

---

## 4.3 Software safety classification

DeepSynaps Protocol Studio provides clinical decision support to a licensed clinician who retains the treatment decision; the software does not directly drive stimulator output or patient-connected delivery. Class C (death or serious injury possible) is reserved for direct-control software. Class A (no injury possible) understates risk because erroneous protocol recommendations could contribute to harm if accepted unchallenged. Class B (non-serious injury possible) reflects the assistive role. In ISO 14971 hazard severity vocabulary, the credible worst-case harm from an erroneous protocol recommendation that a licensed clinician fails to catch is `[TBD: clinical safety officer — likely 'non-serious injury' or 'minor harm', requires hazard analysis]`. This maps to IEC 62304 Class B per the 2015 amendment's harmonization.

**Proposed classification: Class B.**

[TBD: clinical safety officer confirm hazard analysis; final classification requires risk file per ISO 14971]

---

## 5.1 Software development plan

- Roles and responsibilities: [TBD: quality manager]
- Lifecycle model: [TBD: software lead]
- Configuration management evidence: `apps/api/alembic/versions/` (database migration history) + git commit history

---

## 5.2 Software requirements analysis

- Requirements traceability: [TBD: software lead — link to issue tracker]
- Functional requirements: [TBD: clinical lead]
- Performance requirements: [TBD: clinical lead]
- Interface requirements: [TBD: clinical lead]
- Safety requirements: [TBD: clinical lead]

---

## 5.3 Software architectural design

- SOUP (Software of Unknown Provenance) inventory: [TBD: software lead — generate from `apps/api/pyproject.toml` and `apps/web/package.json`]
- Architectural decomposition: [TBD: software lead]

---

## 5.4 Software detailed design

- Per-unit detailed design: [TBD: software lead]

---

## 5.5 Software unit implementation and verification

Verification evidence: pytest suite under `apps/api/tests/` — examples include:
- `apps/api/tests/test_audit_repository.py`
- `apps/api/tests/test_audit_trail_router.py`

Acceptance criteria: [TBD: software lead]

---

## 5.6 Software integration and integration testing

- Integration test inventory: [TBD: software lead — extract from `apps/api/tests/` using `*integration*` and `*launch_audit*` filename patterns]

---

## 5.7 Software system testing

- System test plan: [TBD: software lead]
- Test artefact locations: `tests/` and `e2e/` at repository root

---

## 5.8 Software release

- Deploy pipeline: `.github/workflows/deploy-netlify.yml`
- Fly application: `deepsynaps-studio`
- Archived release configuration: [TBD: quality manager]
- Known anomalies at release: [TBD: software lead]

---

## 6 Software maintenance process

- Change control: git pull-request workflow + `apps/api/alembic/versions/` for schema changes
- Problem report process: [TBD: quality manager]

---

## 7 Software risk management process

- Risk file ownership per ISO 14971: [TBD: clinical safety officer]
- Existing safety context:
  - [Protocol Studio AI safety report](../ai-audits/PROTOCOL_STUDIO_AI_SAFETY_REPORT.md)
  - [Safety evidence policy](../safety_evidence_policy.md)

---

## 8 Software configuration management

- Source CM: git (GitHub repository ALIYILD/DeepSynaps-Protocol-Studio)
- Deployment CM: [TBD: software lead]

---

## 9 Software problem resolution

Audit trail evidence:
- `apps/api/app/services/audit.py`
- `apps/api/app/services/agent_audit_service.py`
- `apps/api/app/routers/audit_trail_router.py`

Resolution process: [TBD: quality manager]

---

## A Sign-off log

| Role | Name | Date | Signature |
|------|------|------|-----------|
| CEO/sponsor | [TBD] | [TBD] | [TBD] |
| Regulatory consultant | [TBD] | [TBD] | [TBD] |
| Clinical safety officer | [TBD] | [TBD] | [TBD] |
| Quality manager | [TBD] | [TBD] | [TBD] |
| Software lead | [TBD] | [TBD] | [TBD] |
