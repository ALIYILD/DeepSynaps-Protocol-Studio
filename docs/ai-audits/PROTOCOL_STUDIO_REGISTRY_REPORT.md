# Protocol Studio — Protocol Taxonomy / Registry Report

## Executive summary
- **What exists**: A CSV-backed protocol registry already ships via `GET /api/v1/registry/protocols` and `GET /api/v1/registry/protocols/{id}` (fed by `data/imports/clinical-database/protocols.csv` through `CLINICAL_DATA_ROOT`). The web UI already merges these backend rows into the curated library (`apps/web/src/pages-protocols.js`).
- **Key gap**: Governance concepts are currently easy to conflate (**regulatory on/off-label**, **evidence grade**, and **practice-level governance state** for saved drafts). “Approved” language must be strictly scoped to internal governance, never implied as regulatory approval.
- **Recommendation**: Implement `/api/v1/protocol-studio/protocols*` as a **read-only facade** over the existing `/api/v1/registry/protocols*`, adding **normalized dimensions** and **machine-readable governance flags/warnings** (sourced from `governance_rules.csv`) so the UI is not guessing.

## Current backend registry surfaces (authoritative)

### API routers
- **Registry list + detail**: `apps/api/app/routers/registries_router.py`
  - `GET /api/v1/registry/protocols`
  - `GET /api/v1/registry/protocols/{protocol_id}`

### Registry loader/service
- **Registry service**: `apps/api/app/services/registries.py`
  - Loads `protocols.csv` and returns items largely 1:1.
  - Also loads `governance_rules.csv` via `list_governance_rules()`.

### Separate protocol helper (non-registry endpoint)
- `apps/api/app/services/protocol_registry.py`
  - Loads `protocols.csv` too, but is used for “lookup by condition+modality” and course-structure normalization.
  - Not the same as `/api/v1/registry/protocols`.

## Current frontend protocol catalog surfaces
- **Protocol Studio / hub** mounts protocol search: `apps/web/src/pages-clinical-hubs.js` (`pgProtocolHub`) embeds `pgProtocolSearch`.
- **Protocol pages**: `apps/web/src/pages-protocols.js`
  - Calls `api.protocols()` (`/api/v1/registry/protocols`) and merges backend rows into the curated `PROTOCOL_LIBRARY`.
  - Sets `_source: 'backend'` for registry-only entries.
- **Static catalogs**:
  - `apps/web/src/protocols-data.js` (large protocol library + governance label map)
  - `apps/web/src/registries/protocols.js` (smaller curated templates)

## Governance terminology risk (must not break safety rules)
There are three governance-like concepts that must be separated explicitly in API/UI:
1. **Regulatory classification**: whether the device/protocol is “on-label” vs “off-label” for an indication; should be stated as a classification, not as a clinical efficacy claim.
2. **Evidence grade**: EV-A..EV-D (or A–E display tier) describing evidence strength.
3. **Practice governance (internal)**: whether a clinician/practice has reviewed/approved a draft for use (“approved-for-use (internal)”), distinct from regulatory approvals.

Avoid badges/text like “approved use” without scope; if used, it must be **explicitly internal** (e.g. “Practice-reviewed” / “Internal review on file”).

## Proposed Protocol Registry for Protocol Studio (facade)

### Endpoint 1: `GET /api/v1/protocol-studio/protocols`
**Purpose**: stable, doctor-facing catalog query with normalized fields and governance flags/warnings.

**Recommended filters** (subset; keep backward-compatible):
- `condition_id`
- `modality_id`
- `target_region` (exact/contains)
- `regulatory_classification` (`on_label|off_label|unknown`)
- `min_evidence_grade` (e.g. `EV-B`)
- `review_status` (normalized from CSV `Review_Status`)
- `include_off_label` (default false)

**Response (recommended)**:
- `items: ProtocolStudioProtocol[]`
- `total: number`
- `warnings?: string[]` (e.g. “off-label excluded by default”)

**ProtocolStudioProtocol** should include:
- Base CSV fields (id/name/condition/modality/device specifics/parameters/links).
- Normalized dimensions:
  - `regulatory_classification` (from `On_Label_vs_Off_Label`)
  - `evidence_grade_raw` (`EV-A` etc) + optional display `evidence_tier` (`A`..`E`)
  - `registry_review_status` (from `Review_Status`)
  - `contraindication_check_required: boolean`
  - `clinician_review_required: boolean`
  - `patient_facing_allowed: boolean`
- Governance evaluation output:
  - `governance_flags: string[]` (machine-readable)
  - `warnings: string[]` (displayable, sourced from `governance_rules.csv` when possible)

### Endpoint 2: `GET /api/v1/protocol-studio/protocols/{id}`
**Purpose**: detail view for one protocol, including normalized governance flags and computed cross-links.

Recommended additions:
- `condition` and `device` summary objects (non-PHI).
- `source_links` (URLs already present in registry).
- `governance` object with:
  - `off_label: boolean`
  - `off_label_acknowledgement_required: boolean`
  - `requires_clinician_sign_off: boolean`
  - `patient_export_allowed: boolean`
  - `research_only_not_prescribable: boolean`

## Test plan (backend)

### Dataset integrity tests
- **No duplicate IDs**: `Protocol_ID` must be unique in `protocols.csv`.
- **Foreign keys exist**:
  - `Condition_ID` exists in `conditions.csv`
  - `Modality_ID` exists in `modalities.csv`
  - any non-empty `Device_ID_if_specific` exists in `devices.csv`
  - evidence grade exists in `evidence_levels.csv`

### Governance flagging tests (facade)
- **Off-label warning required**:
  - If `regulatory_classification == off_label`, response must include `governance_flags` containing `off_label` and at least one warning string.
- **Contraindication section present**:
  - If CSV says contraindication check required, facade must set `contraindication_check_required=true` and include a warning/flag.
- **Research-only cannot be approved for treatment**:
  - If a protocol is classified research-only/investigational, facade must mark it `research_only_not_prescribable=true` and approval workflows must block it (enforced in safety/governance layer).

### Endpoint contract tests
- `/api/v1/protocol-studio/protocols` returns stable shape (`items`, `total`) and includes normalized fields.
- `/api/v1/protocol-studio/protocols/{id}` returns 404 for unknown id.

## Implementation note (minimal-diff, reuse-first)
Start by **facading** the existing registry endpoint and adding normalization logic in a dedicated `protocol_studio_registry.py` service module. Do not refactor registry CSV ingestion in this step.

