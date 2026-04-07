# Feature Gating Matrix

This matrix defines which features are included per package tier.
Governance restrictions are listed separately and always apply regardless of package.

## Feature → Package Mapping

| Feature ID | Explorer | Resident | Clinician Pro | Clinic Team | Enterprise |
|---|---|---|---|---|---|
| `evidence_library.read` | ✓ | — | — | — | — |
| `evidence_library.full` | — | ✓ | ✓ | ✓ | ✓ |
| `device_registry.limited` | ✓ | — | — | — | — |
| `device_registry.full` | — | ✓ | ✓ | ✓ | ✓ |
| `conditions.browse_limited` | ✓ | — | — | — | — |
| `conditions.browse_full` | — | ✓ | ✓ | ✓ | ✓ |
| `protocol.generate_limited` | — | ✓ | — | — | — |
| `protocol.generate` | — | — | ✓ | ✓ | ✓ |
| `protocol.ev_c_override` | — | — | ✓ | ✓ | ✓ |
| `uploads.case_files` | — | — | ✓ | ✓ | ✓ |
| `summaries.personalized` | — | — | ✓ | ✓ | ✓ |
| `assessment.builder_limited` | — | ✓ | — | — | — |
| `assessment.builder_full` | — | — | ✓ | ✓ | ✓ |
| `handbook.generate_limited` | — | ✓ | — | — | — |
| `handbook.generate_full` | — | — | ✓ | ✓ | ✓ |
| `exports.pdf` | — | ✓ | ✓ | ✓ | ✓ |
| `exports.docx` | — | — | ✓ | ✓ | ✓ |
| `exports.patient_facing` | — | — | ✓* | ✓* | ✓* |
| `phenotype_mapping.use` | — | — | add-on | ✓ | ✓ |
| `review_queue.personal` | — | — | ✓ | ✓ | ✓ |
| `review_queue.team` | — | — | — | ✓ | ✓ |
| `audit_trail.personal` | — | — | ✓ | ✓ | ✓ |
| `audit_trail.team` | — | — | — | ✓ | ✓ |
| `monitoring.digest` | — | — | ✓ | ✓ | ✓ |
| `monitoring.workspace` | — | — | — | — | ✓ |
| `seats.team_manage` | — | — | — | ✓ | ✓ |
| `team.templates` | — | — | — | ✓ | ✓ |
| `team.comments` | — | — | — | ✓ | ✓ |
| `branding.whitelabel_basic` | — | — | — | ✓ | ✓ |
| `branding.whitelabel_full` | — | — | — | — | ✓ |
| `api.access` | — | — | — | — | ✓ |

*Patient-facing exports subject to governance approval (EV-D blocked, contraindications checked).

---

## Governance Restrictions (Always Apply)

These are **not** package features. They apply to all users at all tiers.

| Rule | Applies To | Cannot Be Relaxed By Package |
|---|---|---|
| EV-D blocks patient-facing export | All protocols with EV-D evidence | Yes |
| Off-label requires clinician role | All off-label protocol requests | Yes |
| EV-C requires clinician override | All EV-C protocol activations | Yes |
| Contraindication review required | Protocols with `Contraindication_Check_Required=Yes` | Yes |
| Missing source traceability blocks publication | Evidence without source reference | Yes |
| Device regulatory precision | All device descriptions | Yes |

---

## Implementation Locations

### Backend
- Feature definitions: `apps/api/app/packages.py` — `Feature` enum
- Package definitions: `apps/api/app/packages.py` — `PACKAGES` dict
- Entitlement checks: `apps/api/app/entitlements.py` — `require_feature()`, `require_any_feature()`
- Auth integration: `apps/api/app/auth.py` — `AuthenticatedActor.package_id`
- Demo tokens: `apps/api/app/registries/auth.py`

### Service-level enforcement
- Uploads: `apps/api/app/services/uploads.py`
- Generation: `apps/api/app/services/generation.py`
- Audit: `apps/api/app/services/audit.py`
- Review: `apps/api/app/services/review.py`

### Frontend
- Feature constants: `apps/web/src/lib/packages.ts`
- Package gate component: `apps/web/src/components/domain/PackageGate.tsx`
- Upgrade prompt: `apps/web/src/components/domain/UpgradePrompt.tsx`
- Package state: `apps/web/src/app/appStore.ts` — `AppState.packageId`
- Hook: `apps/web/src/app/useAppStore.ts` — `usePackage()`

### Tests
- Backend entitlements: `apps/api/tests/test_entitlements.py`
- Backend route gating: `apps/api/tests/test_package_gating.py`
- Frontend package gating: `apps/web/src/test/package-gating.test.tsx`
