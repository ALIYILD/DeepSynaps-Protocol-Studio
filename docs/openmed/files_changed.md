# Files Changed

## Created (10)

```
apps/api/app/services/openmed/__init__.py
apps/api/app/services/openmed/schemas.py
apps/api/app/services/openmed/adapter.py
apps/api/app/services/openmed/backends/__init__.py
apps/api/app/services/openmed/backends/heuristic.py
apps/api/app/services/openmed/backends/http.py
apps/api/app/routers/clinical_text_router.py
apps/api/tests/test_openmed_adapter.py
apps/api/tests/test_clinical_text_router.py
```

Plus 14 docs under `docs/openmed/`.

## Modified (2)

```
apps/api/app/main.py                  +2 lines  (import + include_router)
apps/api/app/routers/media_router.py  ~17 lines (additive openmed block in response)
```

## Untouched (intentional)

- `apps/api/app/services/patient_context.py` — phase 2
- `apps/api/app/services/report_payload.py` — phase 2
- `apps/api/app/services/chat_service.py` — phase 2
- All `apps/web/src/*` — UI integration is a follow-up (no pretend buttons added)
- All Alembic migrations — no DB schema change in this PR
- `apps/api/Dockerfile` — no new dependencies (httpx already present)

## Dependencies

- `httpx` — already declared in `apps/api/pyproject.toml`; no new install needed
- No torch / transformers / spacy added — adapter dispatches to a remote
  OpenMed service when available, heuristic regex when not.
