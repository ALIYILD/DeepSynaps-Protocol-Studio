# torch.load governance policy

This document describes the **repo-wide policy** for using `torch.load`.
It complements:

- **PR #980** which introduced the safe helpers and audited every
  pre-existing callsite — see
  [torch-deserialization-audit.md](./torch-deserialization-audit.md).
- **PR #981** (this PR) which adds enforcement so future code cannot
  silently reintroduce the unsafe default.

## Why this matters

`torch.load` uses Python `pickle` under the hood. When called with
`weights_only=False` (the default in torch < 2.6.0) a crafted checkpoint
can **execute arbitrary code** at load time. This is
[CVE-2025-32434](https://avd.aquasec.com/nvd/cve-2025-32434), severity
CRITICAL.

torch 2.6.0 mitigates the CVE by flipping the default to
`weights_only=True`, which refuses checkpoints that contain non-tensor
objects. But until the project is on torch ≥ 2.6 *and forever after that*,
every callsite should be explicit so:

- the trust assumption is visible in code review and `git blame`,
- the torch bump becomes a no-op for application code, and
- a regression cannot slip in unnoticed.

## Approved patterns

In order of preference:

### 1. `load_state_dict_safely` — preferred

For any checkpoint that contains tensor data only (the common case):

```python
from deepsynaps_qeeg._safe_torch import load_state_dict_safely

state = load_state_dict_safely(path, map_location="cpu")
model.load_state_dict(state)
```

This always passes `weights_only=True` internally. It rejects pickled
non-tensor objects — *that's the point*.

### 2. `load_trusted_full_checkpoint` — legacy checkpoint format only

For checkpoints that genuinely contain pickled `nn.Module` instances AND
where the path is provably non-user-controlled:

```python
from deepsynaps_qeeg._safe_torch import load_trusted_full_checkpoint

state = load_trusted_full_checkpoint(
    path,
    map_location="cpu",
    reason="vendored deploy-time model checkpoint; path resolves to /opt/models",
)
```

The `reason=` kwarg is **mandatory and must be ≥ 16 characters** — short
placeholders raise `ValueError`. The reason appears in the diff, in
`git blame`, and is greppable, so security review can audit it.

### 3. Bare `torch.load` with explicit `weights_only=`

Allowed in scripts or experimental code that genuinely cannot use the
helpers, as long as `weights_only=` is stated explicitly:

```python
torch.load(path, map_location="cpu", weights_only=True)    # safe
torch.load(path, map_location="cpu", weights_only=False)   # explicit pickle — see "Trusted checkpoint policy"
```

## Blocked patterns

The scanner blocks any `torch.load(...)` call (or `torch_mod.load(...)`)
that does **not** pass `weights_only=` and is **not** routed through one of
the approved helpers. Examples that will fail CI:

```python
torch.load(path)                                  # ❌ implicit weights_only
torch.load(path, map_location="cpu")              # ❌ still implicit
state = torch.load(                               # ❌ multiline, still implicit
    path,
    map_location="cpu",
)
```

## Trusted-checkpoint policy

`weights_only=False` is permitted **only** when:

1. The checkpoint format requires pickle (e.g. it stores `nn.Module`
   instances rather than a plain state_dict). The state_dict format is
   always preferred when feasible.
2. The path is **provably non-user-controlled**, i.e.:
   - a vendored deploy-time mount such as `/opt/models/<backbone>/...`, or
   - a fixed local cache populated only by trusted operator code
     (e.g. `~/.deepsynaps/models/`), or
   - a registry-resolved artifact whose URL is in a dev-controlled
     `registry.yaml` (and ideally SHA256-pinned).
3. The trust assumption is captured at the callsite, either via the
   `reason=` kwarg on `load_trusted_full_checkpoint`, or via an adjacent
   comment that points to the surrounding controls and to this document.

A `model_path` (or similar) kwarg that **could** be forwarded from an HTTP
request body, query string, header, file upload, or any other
user-influenced channel is NOT considered trusted. If a new route is
added that forwards such a path, the corresponding callsite must be
re-audited before merging.

## Enforcement

Two complementary gates:

| Gate | Where | What it checks |
|---|---|---|
| `scripts/check_torch_load_safety.py` | Standalone CLI, invoked by `.github/workflows/torch-load-safety.yml` on every PR that touches `**/*.py` | Walks `apps/`, `packages/`, `scripts/`, `services/`, `tools/`. Stdlib `ast` parse; flags any `torch.load(...)` or `torch_mod.load(...)` without explicit `weights_only=` |
| `packages/qeeg-pipeline/tests/test_torch_load_governance.py::test_real_repo_has_zero_unsafe_torch_load` | pytest | Same scanner, run inside the test suite — catches regressions even when the GHA workflow doesn't fire (e.g. push to a non-PR branch the workflow doesn't track) |

The scanner is **stdlib-only** — no `pip install` is needed in CI.

## Known limitations (kept honest)

The scanner is deliberately lightweight. It will **not** catch the
following bypass patterns:

1. **Alias via assignment.** `t = torch; t.load(x)` — the scanner only
   matches receivers literally named `torch` or `torch_mod` (the two
   patterns actually used in this repo today). New aliases require
   extending `MATCHED_RECEIVER_NAMES` in the scanner — or, better,
   removing the alias.
2. **`from torch import load`.** A direct import of the function would
   bypass the receiver check. This pattern is not used anywhere in the
   repo. If added, the scanner needs to be extended.
3. **Dynamic dispatch.** `getattr(torch, "load")(x)`,
   `importlib.import_module("torch").load(x)`, or any `eval`/`exec` code
   is unscannable. Out of scope.
4. **Vendored / third-party code.** The scanner skips `site-packages`,
   `.venv`, `node_modules`, `dist`, `build`, `__pycache__`,
   `.pytest_cache`, `.tox`, `.cache`, `.claude`. Third-party torch
   callers in those trees are not our risk to govern.
5. **String / comment mentions** of `torch.load(` are correctly ignored
   because the scanner parses via `ast`, not regex. This is verified by
   the test suite.

The first two limitations are recorded as **explicit `xfail`-style
regression tests** in `test_torch_load_governance.py` so they cannot
silently start to be enforced (which would change the meaning of the
gate without code review).

Why no AST framework beyond stdlib `ast`? `tree-sitter`, `libcst`,
`asttokens` etc. would add a third-party dependency without meaningfully
reducing the limitations above. The remaining bypass surface is small
enough that code review is an adequate backstop.

Why no dynamic execution / dataflow analysis? Out of scope for a
lint-class gate. CVE reachability is governed by the trust-justification
discipline at the callsite, not by the scanner.

## Future audit expectations

When adding a new ML callsite that loads a torch checkpoint:

1. Prefer `load_state_dict_safely`. Refactor the checkpoint format if
   needed to use plain `state_dict`.
2. If you genuinely need a pickle load, use `load_trusted_full_checkpoint`
   and supply a real `reason=` — not "trusted" or "ok".
3. Add the new file to the audit table in
   [torch-deserialization-audit.md](./torch-deserialization-audit.md) and
   to `_AUDITED_FILES` in
   `packages/qeeg-pipeline/tests/test_safe_torch.py`.
4. The CI gate (`torch-load-safety` workflow) will block the PR
   automatically if `weights_only=` is missing.

When auditing an EXISTING route or service that may forward a path into
torch.load:

1. Trace the path from the HTTP handler through every kwarg layer.
2. If user input can reach it, the callsite must use
   `load_state_dict_safely` (not the trusted-pickle helper), and the
   checkpoint format must be a plain state_dict.
3. Update both audit documents to reflect the new trust posture.
