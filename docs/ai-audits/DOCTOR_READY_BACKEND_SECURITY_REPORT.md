## Doctor-ready backend security report (Agent 2 — Backend API/Security/Tenant Isolation)

Branch: `doctor-ready/e2e-validation-and-hardening`

### Scope

- qEEG raw/workbench, qEEG analysis (QEEG-105), DeepTwin
- Studio EEG DB/events (not exhaustively audited here; focus was QEEG-105 authz/tenant isolation)

### Test environment bootstrap (this VM)

Because this repo uses local (non-PyPI) packages and the VM didn’t have all test deps preinstalled, the following were installed to run `apps/api` tests:

```bash
python3 -m pip install pytest pytest-asyncio pytest-xdist httpx
python3 -m pip install slowapi redis uvicorn aiofiles python-multipart alembic psycopg2-binary "python-jose[cryptography]" "passlib[bcrypt]" sentry-sdk stripe pyotp
python3 -m pip install anthropic openai python-telegram-bot pillow apscheduler
```

Tests were run with:

```bash
cd /workspace/apps/api
PYTHONPATH=/workspace/apps/api python3 -m pytest ...
```

### Targeted test commands and results

```bash
cd /workspace/apps/api
PYTHONPATH=/workspace/apps/api python3 -m pytest tests/test_qeeg_security_audit.py -q
```

- Result: **PASS** (`72 passed`)

```bash
cd /workspace/apps/api
PYTHONPATH=/workspace/apps/api python3 -m pytest tests/test_deeptwin_router.py -q
```

- Result: **PASS** (`21 passed`)

QEEG-105 targeted coverage added and executed:

```bash
cd /workspace/apps/api
PYTHONPATH=/workspace/apps/api python3 -m pytest -n 0 tests/test_qeeg_105_endpoints_authz.py -q
```

- Result: **PASS** (`3 passed`)

### Key findings (pre-fix)

- **QEEG-105 tenant isolation gap**:
  - `POST /api/v1/qeeg/analyses/{code}/run` accepted any `recording_id` that existed, without enforcing that the caller belonged to the patient’s clinic.
  - `GET /api/v1/qeeg/jobs/{job_id}` and `GET /api/v1/qeeg/jobs/{job_id}/results` did not enforce clinician role and did not enforce tenant ownership (any authenticated actor could probe job ids).

### Fixes landed

- **Role gate**:
  - QEEG-105 catalog now requires clinician role.
  - QEEG-105 job status/results now require clinician role.

- **Ownership/tenant isolation**:
  - QEEG-105 `run` now enforces ownership by resolving the referenced recording’s `patient_id` → owning `clinic_id` and applying `require_patient_owner`.
  - QEEG-105 job status/results now enforce ownership by resolving `job.patient_id` → owning `clinic_id` and applying `require_patient_owner`.
  - Cross-clinic denials are converted to **404** (“not found”) to avoid leaking existence of recordings/jobs across tenants.

- **Audit hooks**:
  - QEEG-105 job status and results views now emit best-effort audit events via a dedicated helper (`qeeg_105.job_view`, `qeeg_105.result_view`) into the shared `audit_events` table.

### Files changed (high signal)

- `apps/api/app/qeeg/routers/qeeg_analysis_catalog_router.py`
- `apps/api/app/qeeg/routers/qeeg_analysis_run_router.py`
- `apps/api/app/qeeg/routers/qeeg_analysis_results_router.py`
- `apps/api/app/qeeg/audit.py` (new)
- `apps/api/tests/test_qeeg_105_endpoints_authz.py` (new)

### Residual risks / next actions

- **ERP/BIDS tests**: the specific filenames requested (`test_qeeg_erp_router.py`, `test_erp_bids_events.py`) were not present in `apps/api/tests/` in this checkout. If those endpoints exist under different tests/paths, add targeted coverage for:
  - ERP/BIDS upload ownership enforcement (recording/patient clinic scoping)
  - Event ingestion IDOR resistance (404 on cross-clinic)
  - Audit events on exports / downloads

- **Studio EEG DB/events endpoints**: recommend adding explicit tests that validate:
  - `recording_id`-based reads/writes are always patient/clinic scoped
  - endpoints return 404 (not 403) on cross-clinic probes
  - audit rows exist for reads of sensitive derived artefacts (events, source localization outputs)

