# Runtime hygiene policy — 2026-05-18

**Status:** Active. Enforced by `.github/workflows/runtime-hygiene-check.yml` from this PR forward.

This document defines what may **not** appear in runtime code, why, and how
new violations are blocked at PR time. It exists because production was
brought down on 2026-05-18 by a single `import pytest` at module load in
`apps/api/app/routers/health_dashboard.py` — a test-only import nested
inside a runtime router. The fix took two hotfixes (#1034 + #1035) and
about an hour of off-clock recovery work.

This policy ensures the same pattern can't slip in again unobserved.

## The rule

**Test code, test imports, and test scaffolding belong under `tests/` or
`__tests__/`. They do not appear in runtime modules.**

Concretely, the following symbols are **forbidden** at module scope in
the runtime paths `apps/api/app/**` and `apps/web/src/**`:

| Pattern | Why forbidden |
|---|---|
| `import pytest` | pytest is dev-only; not in `apps/api/pyproject.toml` runtime deps; production Docker doesn't ship it. Bare `import pytest` crashes uvicorn at startup. |
| `from pytest import …` | Same. |
| `@pytest.mark.…`, `pytest.fail(…)`, `pytest.skip(…)` | Reachable only via the missing `pytest` import; defining them in runtime code is a tell that an entire test class was embedded. |
| `import unittest`, `from unittest.mock import …` | unittest is stdlib so it imports cleanly, but no production code legitimately uses `MagicMock`, `AsyncMock`, or `patch`. Their presence means a unit test was glued onto a runtime file. |
| `TestClient(` | FastAPI `TestClient` is for in-process test fixtures, not for runtime callers. |
| `MagicMock(`, `AsyncMock(`, `mock.patch`, `monkeypatch` (used in code, not docstring) | Same family — pytest/unittest scaffolding leaking into runtime. |
| `sys.modules[…] = …` reassignment | Legitimate uses exist (dynamic plugin loading, lazy imports) — gated, not forbidden. Pattern fires a warning, not a fail. Reviewers decide. |

The patterns are codified in
`.github/workflows/runtime-hygiene-check.yml` and re-checked on every PR.

## Where the rule does **not** apply

The check scopes only to runtime directories. Test code stays exactly
where it belongs:

- `apps/api/tests/**`
- `apps/web/src/**/__tests__/**`
- `apps/web/e2e/**`
- `scripts/**`
- `packages/*/tests/**`
- `services/*/tests/**`
- Anything inside a `migrations/` or `alembic/versions/` tree (Alembic-generated test stubs are common and harmless there)

A path is excluded if any of its segments match: `tests`, `__tests__`,
`e2e`, `test_data`, `fixtures`, `migrations`, `alembic/versions`. Filenames
ending in `.test.js`, `.test.ts`, `.spec.js`, `.spec.ts`, or files starting
with `test_` are also excluded.

## Known violations as of 2026-05-18

The sweep that motivated this policy found these violations on `main`.
They are **not** addressed in this PR — the goal here is to establish the
gate so no *new* violations land. Existing items get cleaned up in scoped
follow-up PRs, one file per PR.

| File | Symbols | Severity | Notes |
|---|---|---|---|
| `apps/api/app/routers/health_dashboard.py` | `@pytest.mark.asyncio` (6×), `pytest.fail(…)`, `import pytest` (now env-guarded by PR #1035) | Was P0 (caused 2026-05-18 outage) | Currently behind `if os.environ.get("DEEPSYNAPS_ENABLE_EMBEDDED_HEALTH_DASHBOARD_TESTS") == "1":`. The decorators and `pytest.fail` body still live at module scope but are unreachable unless that env var is set. **Cleanup:** move the embedded test class to `apps/api/tests/test_health_dashboard.py` and delete from the router. |
| `apps/api/app/knowledge/multimodal_synthesizer_v2.py` | `import unittest`, `from unittest.mock import AsyncMock, MagicMock, patch` (line 1250–1252) | P1 | Kimi-authored "v2" synthesizer with an inline `unittest.TestCase` at the bottom. Imported from `knowledge_router_v2.py:111` via `try/except` guard; the unittest import succeeds because stdlib, no immediate crash, but the test class instantiates at import time. **Cleanup:** delete the inline test class, move any unique cases to `apps/api/tests/`. |
| `apps/api/app/knowledge/knowledge_cache.py` | `import unittest`, `from unittest.mock import patch, AsyncMock` (line 1376–1377) | P1 | Same pattern. Imported via `try/except` guard from `lifespan_wiring.py:24`. **Cleanup:** same as above. |
| `apps/api/app/knowledge/uptime_monitor.py` | `import unittest` (line 31) | P1 | Same. Imported via `try/except` guard from `lifespan_wiring.py:48`. |
| `apps/api/app/knowledge/alerting_engine.py` | `import unittest` (line 27) | P1 | Same. Imported via `try/except` guard from `lifespan_wiring.py:57`. |
| `apps/api/app/qeeg/services/phi_redaction_test.py` | `import pytest`, `@pytest.mark.parametrize` | P2 | Real pytest test file with a Go-style `_test.py` suffix, misplaced in the runtime tree. `apps/api/pytest.ini` sets `python_files = test_*.py`, so this file is **never collected** — it is dead test code that nonetheless trips the runtime gate. **Cleanup:** move to `apps/api/tests/qeeg/test_phi_redaction.py` and delete from runtime. |

**False positives the sweep flagged but accepted:**

- `apps/api/app/services/hermes_runtime_service.py:51` — `sys.modules[_PKG_NAME] = module` is a legitimate dynamic-import pattern, not a test mutation. The check warns on this pattern but does not fail.
- `apps/api/app/services/chat_service.py` and related — docstrings/comments mention `monkeypatch` to document that tests monkeypatch the function. The CI check only flags `monkeypatch` when it appears as a Python identifier (function call, parameter, attribute), not inside string literals or comments.

## How new violations are blocked

`.github/workflows/runtime-hygiene-check.yml` runs on every pull request
against `main`. It uses `ripgrep` over the runtime paths with a strict
exclusion list (mirroring this doc) and a forbidden-pattern set. If any
match lands in a runtime file, the workflow fails with the file path,
line number, and the matching pattern.

Exceptions go through one of:

1. **The file moves under a `tests/` tree.** Best path; matches the
   policy by construction.
2. **The runtime usage is legitimate** (e.g., a real `sys.modules` plugin
   loader). Add an inline `# runtime-hygiene: allow=<pattern>` marker on
   the offending line. The workflow honours that marker. Use sparingly;
   reviewers must consent.
3. **The file is generated** (Alembic, OpenAPI codegen). The exclusion
   list covers `migrations/`, `alembic/versions/`; for other codegen
   add a directory entry to the workflow.

## Rationale

The 2026-05-18 incident is the proximate cause but the pattern is older:
chat-AI agents writing "self-testing" runtime files have repeatedly
landed embedded `unittest` / `pytest` classes inside routers and
services. The files compile, look complete, and only break at import
time when the prod container is missing the test framework. Without a
gate, every PR that touches one of these files risks re-introducing the
same crash class.

The gate is cheap (~3 seconds in CI on a clean PR), surfaces
violations with exact file/line, and the policy is one rule with one
clear exception path. The cost of one false-positive PR — adding an
`allow=` marker — is much lower than the cost of one prod outage.

See also:

- `docs/stabilization/deploy-hotfix-2026-05-18.md` — original outage record
- `docs/stabilization/governance-lock-2026-05-17.md` — broader stabilization framework
- Memory: `cursor-buffer-reverts-disk-edits.md` — operational concurrency hazard observed during the recovery
