# torch.load deserialization audit (CVE-2025-32434)

**Status:** All in-repo `torch.load` callsites are deserialization-safety explicit.
**Torch version in production:** 2.2.2 (CPU wheel, pinned in `apps/api/Dockerfile`).
**Blocker for torch ≥ 2.6.0 upgrade:** none from this audit. See "Recommendation" at the bottom.

## Background

`torch.load` uses Python `pickle` under the hood. Loading a checkpoint with
the torch < 2.6 default (`weights_only=False`) allows arbitrary code execution
via a crafted pickle — this is CVE-2025-32434 (CRITICAL).

Torch 2.6.0 mitigates the CVE by flipping the default to `weights_only=True`.
That is a behavioural breaking change: any checkpoint that contains pickled
non-tensor objects (e.g. `nn.Module` instances) will fail to load. Before
bumping torch, every callsite has to know which mode it needs.

## Helper module

`packages/qeeg-pipeline/src/deepsynaps_qeeg/_safe_torch.py` exposes two
explicit entry points:

- `load_state_dict_safely(path, *, map_location="cpu")` — always passes
  `weights_only=True`. The preferred path. Use for any checkpoint that
  holds only tensor data.
- `load_trusted_full_checkpoint(path, *, map_location="cpu", reason=str)`
  — passes `weights_only=False` explicitly. Use only when the checkpoint
  format requires pickle (e.g. it stores `nn.Module` instances) AND the
  path is provably non-user-controlled. The `reason=` argument is
  mandatory and must be ≥ 16 chars — short placeholders raise `ValueError`.

Both helpers state `weights_only=` explicitly so a future torch ≥ 2.6
upgrade is a no-op for these callsites: the safe helper keeps working,
and the trusted-pickle helper continues to behave as before.

## Callsite inventory

| # | File:line | Format | Path source | User-controlled? | Mitigation |
|---|---|---|---|---|---|
| 1 | `packages/qeeg-encoder/src/qeeg_encoder/foundation/labram.py:82` | state_dict | `/opt/models/<backbone>/{pytorch_model.bin,model.safetensors,weights.pt}` | NO — vendored deploy-time mount, SHA256 verified before load | `weights_only=True` inline (pre-existing) |
| 2 | `packages/qeeg-pipeline/src/deepsynaps_qeeg/models/inference.py:53` | state_dict | `download_weights(spec.artifact)` — resolved via `registry.yaml` (local/file/http/s3), optionally SHA256-checked | NO — registry is dev-controlled; no API surface accepts arbitrary artifact URLs | `load_state_dict_safely` |
| 3 | `packages/qeeg-pipeline/src/deepsynaps_qeeg/ml/brain_age.py:342` | full pickle (`state["model"]` is an `nn.Module`) | `model_path` kwarg | NO — `qeeg_ai_bridge.run_predict_brain_age_safe` is the sole API entry and does not forward `model_path`; the HTTP endpoint `predict_brain_age_endpoint` passes only `chronological_age` and `deterministic_seed`. When `model_path` is None the caller drops to a deterministic stub. | `load_trusted_full_checkpoint` with documented `reason=` |
| 4 | `packages/qeeg-pipeline/src/deepsynaps_qeeg/ml/foundation_embedding.py:319` | full pickle (`state["encoder"]` is an `nn.Module`) | `_default_checkpoint_path()` = `~/.deepsynaps/models/labram_base.pt` | NO — fixed cache path; download/population gated by `DEEPSYNAPS_ALLOW_MODEL_DOWNLOAD` env. There is no API surface that lets a user write or substitute this file. | `load_trusted_full_checkpoint` with documented `reason=` |
| 5 | `packages/qeeg-pipeline/src/deepsynaps_qeeg/ai/risk_scores.py:127` | full pickle (caller does `model.train()` + `model(x)` directly) | `model_path` kwarg | NO — `qeeg_ai_bridge.run_score_conditions_safe` does not forward `model_path`; `score_conditions_endpoint` only passes `features`. With `model_path=None` the function returns the stub path before reaching the load. Dead code today (per file docstring: "Classifier head not yet shipped — Agent E owns the checkpoint"). | `load_trusted_full_checkpoint` with documented `reason=` |
| 6 | `packages/mri-pipeline/src/deepsynaps_mri/models/brain_age.py:230` | state_dict (caller does `model.load_state_dict(state, strict=False)`) | `_resolve_weights()` → `~/.cache/deepsynaps/brainage_cnn_v1.pt` | NO — fixed cache path | `weights_only=True` inline (helper not used: `mri-pipeline` is a separate package, no cross-package dep) |

## Reachability assessment for CVE-2025-32434

For each callsite the attacker would need to either:
1. **Substitute a malicious file** at the trusted path (`/opt/models/`,
   `~/.deepsynaps/models/`, `~/.cache/deepsynaps/`, or a path resolved by
   the model registry), OR
2. **Inject a user-controlled `model_path`** into one of the kwargs that
   reaches `torch.load`.

Neither path is currently open in production:

- **(1)** would require shell access on the API container (already a more
  serious compromise than CVE-2025-32434), or write access to the
  operator-managed `/opt/models` Docker mount.
- **(2)** would require an HTTP endpoint to accept and forward a
  user-supplied `model_path` into `qeeg_ai_bridge.*`. No such endpoint
  exists today — every router was checked. Adding one in the future MUST
  re-audit the trust boundary (the inline comments at each `load_trusted_full_checkpoint`
  call point this out).

Therefore the CVE remains classified **CRITICAL by CVSS** but
**not currently reachable** in this deployment. This audit is the
foundation for the eventual torch upgrade — it captures *why* each
callsite is safe today and *what would have to change* to keep it safe.

## Regression protection

`packages/qeeg-pipeline/tests/test_safe_torch.py::test_no_audited_torch_load_uses_unsafe_default`
fails if any audited file gains a new `torch.load(` call without an
explicit `weights_only=` kwarg, forcing every new caller to route through
the helper.

`test_audit_doc_lists_all_callsites` fails if a file is added to the
audited list without being mentioned in this document.

If you add a new module that calls `torch.load`, add it to both
`_AUDITED_FILES` in that test and to the table in this file.

## Remaining blockers before bumping torch to ≥ 2.6.0

**None from this audit.** All callsites now state `weights_only=`
explicitly, so the default flip is invisible to them.

The remaining work for the torch bump PR is independent:

1. Verify the broader dependency graph (`torchaudio`, `speechbrain`,
   `whisper`, etc. in `packages/voice-engine/requirements.txt`) is
   compatible with torch 2.6.0 — these are unrelated to deserialization
   safety but are pinned in lockstep.
2. Update `apps/api/Dockerfile` and `Dockerfile` to install
   `torch==2.6.0` and the matching `torchaudio` build.
3. Rebuild the API image and confirm the GitHub Code Scanning rescan
   closes CVE-2025-32434.

## Recommendation

Open a follow-up PR titled `security(deps): bump torch 2.2.2 → 2.6.0` that
does only steps 1–3 above. With the helpers in this PR landed first, the
torch bump is a Dockerfile-only change — no application code should need
touching, and this audit gives the reviewer the trust map.

If any of the `load_trusted_full_checkpoint` checkpoints is ever
re-engineered to a plain state_dict format, the corresponding callsite
should be switched back to `load_state_dict_safely`; the rest of the
audit is unaffected.
