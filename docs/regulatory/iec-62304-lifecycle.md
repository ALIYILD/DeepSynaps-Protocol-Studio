# IEC 62304 Software Lifecycle Process — Template

> **TEMPLATE ONLY. Not a quality record.**

---

## 1. Software safety classification (Clause 4.3)

DeepSynaps Protocol Studio provides clinical decision support to a licensed clinician who retains the treatment decision; the software does not directly drive stimulator output or patient-connected delivery. Class C (death or serious injury possible) is reserved for direct-control software. Class A (no injury possible) understates risk because erroneous protocol recommendations could contribute to harm if accepted unchallenged. Class B (non-serious injury possible) reflects the assistive role.

**Proposed classification: Class B.**

[TBD: clinical safety officer confirm hazard analysis; final classification requires risk file per ISO 14971]

---

## 2. Software development plan (Clause 5.1)

- Roles and responsibilities: [TBD: quality manager]
- Lifecycle model: [TBD: software lead]
- Configuration management evidence: `apps/api/alembic/versions/` (database migration history) + git commit history

---

## 3. Software requirements analysis (Clause 5.2)

- Requirements traceability: [TBD: software lead — link to issue tracker]
- Functional requirements: [TBD: clinical lead]
- Performance requirements: [TBD: clinical lead]
- Interface requirements: [TBD: clinical lead]
- Safety requirements: [TBD: clinical lead]

---

## 4. Software architectural design (Clause 5.3)

- SOUP (Software of Unknown Provenance) inventory: [TBD: software lead — generate from `apps/api/pyproject.toml` and `apps/web/package.json`]
- Architectural decomposition: [TBD: software lead]

---

## 5. Software detailed design (Clause 5.4)

- Per-unit detailed design: [TBD: software lead]

---

## 6. Software unit implementation and verification (Clause 5.5)

Verification evidence: pytest suite under `apps/api/tests/` — examples include:
- `apps/api/tests/test_audit_repository.py`
- `apps/api/tests/test_audit_trail_router.py`

Acceptance criteria: [TBD: software lead]

---

## 7. Software integration and integration testing (Clause 5.6)

- Integration test inventory: [TBD: software lead — extract from `apps/api/tests/` using `*integration*` and `*launch_audit*` filename patterns]

---

## 8. Software system testing (Clause 5.7)

- System test plan: [TBD: software lead]
- Test artefact locations: `tests/` and `e2e/` at repository root

---

## 9. Software release (Clause 5.8)

- Deploy pipeline: `.github/workflows/deploy-netlify.yml`
- Fly application: `deepsynaps-studio`
- Archived release configuration: [TBD: quality manager]
- Known anomalies at release: [TBD: software lead]

---

## 10. Software maintenance process (Clause 6)

- Change control: git pull-request workflow + `apps/api/alembic/versions/` for schema changes
- Problem report process: [TBD: quality manager]

---

## 11. Software risk management process (Clause 7)

- Risk file ownership per ISO 14971: [TBD: clinical safety officer]
- Existing safety context:
  - [Protocol Studio AI safety report](../ai-audits/PROTOCOL_STUDIO_AI_SAFETY_REPORT.md)
  - [Safety evidence policy](../safety_evidence_policy.md)

---

## 12. Software configuration management (Clause 8)

- Source CM: git (GitHub repository ALIYILD/DeepSynaps-Protocol-Studio)
- Deployment CM: [TBD: software lead]

---

## 13. Software problem resolution (Clause 9)

Audit trail evidence:
- `apps/api/app/services/audit.py`
- `apps/api/app/services/agent_audit_service.py`
- `apps/api/app/routers/audit_trail_router.py`

Resolution process: [TBD: quality manager]

---

## 14. Sign-off log

| Role | Name | Date | Signature |
|------|------|------|-----------|
| CEO/sponsor | [TBD] | [TBD] | [TBD] |
| Regulatory consultant | [TBD] | [TBD] | [TBD] |
| Clinical safety officer | [TBD] | [TBD] | [TBD] |
| Quality manager | [TBD] | [TBD] | [TBD] |
| Software lead | [TBD] | [TBD] | [TBD] |
