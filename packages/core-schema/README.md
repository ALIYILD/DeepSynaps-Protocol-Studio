# packages/core-schema

Canonical internal schema definitions shared across API, registries, generation, safety, and rendering.

For editing **condition packages** (`ConditionPackageFull`, `protocol` objects), see [`docs/protocol-evidence-governance-policy.md`](../../docs/protocol-evidence-governance-policy.md) for evidence levels, downgrade/remove rules, and clinician vs patient wording.

---

## Why payload types live here

FastAPI routers under `apps/api/app/routers/` historically declared their request/response payload types inline (`class FooRequest(BaseModel): ...`). That breaks reuse: workers, registries, the render engine, and the web client all want the same shape, and inline types silently drift.

**Rule (enforced by CI):** routers may not declare module-level `BaseModel` subclasses. The [`router-schema-lint`](../../.github/workflows/ci.yml) job in CI runs [`tools/lint_router_basemodel.py`](../../tools/lint_router_basemodel.py) and fails the build on any new violation.

A frozen allowlist at [`tools/router_basemodel_allowlist.txt`](../../tools/router_basemodel_allowlist.txt) snapshots the legacy state (102 routers, ~1,000 classes) so main passes on day one. Future PRs migrate routers off the allowlist by promoting their types into this package.

---

## How to add a new payload type to core-schema

1. Pick a module that matches the domain (or create a new one) under `packages/core-schema/src/deepsynaps_core_schema/`. Group by feature, not by router.
2. Define the type:
   ```python
   # packages/core-schema/src/deepsynaps_core_schema/wearable.py
   from pydantic import BaseModel, Field

   class WearableObservationIn(BaseModel):
       device_id: str = Field(..., description="Source device identifier")
       observed_at: str
       value: float
   ```
3. Re-export it from the package's `__init__.py` so callers can `from deepsynaps_core_schema import WearableObservationIn`.
4. Use it in the router:
   ```python
   from deepsynaps_core_schema import WearableObservationIn

   @router.post("/observations")
   def post_obs(payload: WearableObservationIn): ...
   ```
5. If the type is part of an HTTP contract that web/worker also consumes, also expose it to those callers (see existing `__init__.py` for the pattern).

---

## How to migrate an existing router off the allowlist

Pick one router at a time. Small PRs land faster.

1. **Inventory.** Grep the allowlist for the router:
   ```bash
   grep '^apps/api/app/routers/<router>.py:' tools/router_basemodel_allowlist.txt
   ```
2. **Promote each class.** Move the class body verbatim into a `core-schema` module (see above). Preserve field names, defaults, and validators — these are the wire contract.
3. **Update the router.** Replace the inline class with an import. Leave the rest of the router untouched.
4. **Shrink the allowlist.** Run:
   ```bash
   python3 tools/lint_router_basemodel.py --snapshot
   ```
   This rewrites `tools/router_basemodel_allowlist.txt` based on what's actually still inline. Verify the diff: it should only *remove* lines for classes you migrated.
5. **Run the lint locally** to confirm clean:
   ```bash
   python3 tools/lint_router_basemodel.py
   ```
6. **Run the router's tests** to confirm the wire contract is unchanged:
   ```bash
   cd apps/api && python -m pytest tests/test_<router>.py -q
   ```
7. Open a PR titled `refactor(<router>): migrate payloads to core-schema`.

### Escape hatch: per-class exemption

A class that is genuinely router-private (debug ping, one-off internal RPC payload that never leaves the router) may be exempted by prefixing its definition with a comment:

```python
# core-schema-exempt: router-private debug payload, never reused
class DebugPing(BaseModel):
    ts: int
```

The marker must be on a comment line directly above the class (decorators between the marker and the `class` keyword are fine). Use sparingly — anything ever consumed by another package or by the web client does **not** qualify.

---

## Linter cheatsheet

```bash
# Run the lint (fast, AST-only, no imports)
python3 tools/lint_router_basemodel.py

# Regenerate the frozen allowlist after a migration
python3 tools/lint_router_basemodel.py --snapshot

# Inspect the allowlist
wc -l tools/router_basemodel_allowlist.txt
```

The lint runs in CI as the `router-schema-lint` job in [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml).
