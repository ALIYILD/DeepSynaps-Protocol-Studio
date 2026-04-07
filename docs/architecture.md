# Architecture

## Monorepo target
- `apps/api`: FastAPI service for intake, validation, generation orchestration, and export requests
- `apps/web`: React client for clinician intake, preview, and export flows
- `apps/worker`: background job runner for long-running generation and rendering tasks
- `packages/core-schema`: canonical typed models for all domain entities
- `packages/condition-registry`: reusable condition definitions and clinical metadata loaders
- `packages/modality-registry`: modality definitions, constraints, and defaults
- `packages/device-registry`: supported device metadata and compatibility attributes
- `packages/generation-engine`: document assembly logic from schemas and registry data
- `packages/safety-engine`: modality-device-condition safety and compatibility validation
- `packages/render-engine`: output adapters for web, DOCX, and PDF
- `data/conditions`: source data files for condition definitions
- `data/modalities`: source data files for modality definitions
- `data/devices`: source data files for device definitions

## Technical direction
- keep Python services in a shared workspace with consistent tooling and typing
- keep frontend isolated in `apps/web` with its own package manager workflow
- make registries data-driven so new conditions and devices do not require broad code rewrites
- treat the canonical schema as the integration contract across API, worker, and rendering pipelines

## Operational direction
- default to `approval_policy = "on-request"` and `sandbox_mode = "workspace-write"` for repo-local Codex work
- keep implementation modular enough to split into deployable services later
- ensure document generation can move from synchronous API flow to async jobs without schema changes

## First scaffold brief
Use this implementation prompt as the next build step:

```text
Scaffold a production-ready monorepo for DeepSynaps Protocol Studio.

Requirements:
- apps/api: FastAPI + Pydantic v2 + SQLAlchemy
- apps/web: React + Vite + TypeScript + Tailwind
- apps/worker: background jobs scaffold
- packages/core-schema
- packages/condition-registry
- packages/modality-registry
- packages/device-registry
- packages/generation-engine
- packages/safety-engine
- packages/render-engine
- data/conditions
- data/modalities
- data/devices
- docs/

Implement:
1. root monorepo structure
2. Python dependency management
3. frontend dependency management
4. starter README files in each app/package
5. a minimal FastAPI health route
6. a minimal React intake page
7. canonical schema stubs for ConditionProfile, ModalityProfile, DeviceProfile, ProtocolPlan, AssessmentPlan
8. sample registry files for Parkinson's disease, TPS, and one device
9. basic validation that checks modality-device compatibility
10. Makefile or task runner commands for dev setup

Constraints:
- keep one canonical internal schema
- no customer-specific Sozo logic
- design for future multi-tenant SaaS
- keep code clean, typed, and modular
- add TODO markers where domain logic is pending
```
