# M7 — Artifact pipeline (mark, EOG, ICA / templates)

## Scope

**Mark artifacts**, **remove EOG**, **PCA/ICA** correction and **template-based** correction. Produces derivative recordings or in-memory montages per router contract.

## File targets (primary)

- `apps/web/src/studio/artifacts/` (`StudioAnalysisMenu`, dialogs, `ArtifactCorrectionWindow`, `TemplatesManager`, …)
- `apps/api/app/routers/studio_artifacts_router.py`
- Derivative recording open in new tab pattern (`onOpenDerivative` in `EegViewer`)

## Data contracts

- **derivative id**: new analysis/recording id referencing parent.
- **ICA**: component indices, labels if `ICLabel` or equivalent; confidence scores for AI proposals.

## Acceptance criteria

- [ ] Each workflow completes with user-visible success or error message.
- [ ] Opening derivative loads traces without corrupting time base.
- [ ] **Artifact proposals** feed **AI store** (`artifactProposalChanged`) when implemented.

## Tests

- Pytest: artifact endpoint idempotence or smoke with small fixture.
- FE typecheck.

## Dependencies

M2–M6 as needed for recording context.
