# Assessments v2 Doctor-Ready Final Report

## Executive Verdict
- Doctor-ready: **No (partial milestone complete)**
- Preview-ready: **Yes (page renders reliably in demo preview)**
- Production clinical ready: **No**
- Remaining blockers:
  - **No v2 API contract** yet (`/api/v1/assessments-v2/*`) for library, assignment queue, evidence, AI recommendations (work is currently on v1 endpoints and web registries).
  - **End-to-end assignment → patient fill → clinician review** is not implemented as a cohesive v2 workflow with explicit audit logging guarantees per action.
  - **Evidence linking** exists platform-wide via `/api/v1/evidence/*`, but Assessments v2 does not yet provide assessment-scoped evidence endpoints or UI panels that connect instruments to the 87k corpus in a clinician-safe way.
  - **AI recommendations** exist in related surfaces, but there is no dedicated assessments-v2 recommend endpoint with explicit PHI redaction + deterministic fallback contract.

## Route / Preview
- URL: `https://deepsynaps-studio-preview.netlify.app/?page=assessments-v2`
- route status: **Fixed** (auto-enters clinician demo on demo-enabled builds when deep-linking without a token)
- demo/offline state: **Honest** demo banner + safety banner; avoids indefinite loading/login dead-end
- API connectivity: still best-effort; page is designed to render with demo/sample fallbacks

## Library
- total assessments: **Not re-counted in this change** (existing `ASSESS_REGISTRY` / registries remain source)
- fillable: **Existing behavior only** (no new item text added)
- scorable: **Existing behavior only**
- licence required / external-only: **Existing licensing flags preserved**
- tests: **Playwright smoke asserts library container renders and tab switches**

## Queue
- assignment: **Not expanded** (existing queue view behavior only)
- patient queue: **Not implemented as v2 API** (existing v1 assessments endpoints exist)
- clinician queue: **UI queue tab renders reliably; data may be demo/sample**
- audit: **Existing best-effort “hub loaded” audit call remains; no new per-action audit guarantees added**

## Evidence
- local evidence: **Exists** via `/api/v1/evidence/*` (SQLite corpus) but not yet wired as assessment-scoped panel in Assessments v2
- 87k corpus: **Present** (SQLite `evidence.db` via evidence router)
- live literature: **PubMed watch exists**; availability depends on env (`PUBMED_*`)
- reference links: **Not added for assessments-v2 in this milestone**
- fallback mode: **Honest** (no fabricated citations; demo banner distinguishes fictional rows)

## Forms / Scoring
- fillable widgets: **Existing in-page form opener remains**; no new proprietary content
- scoring engine: **Existing (web + API scoring services)**; no new scoring rules introduced
- unsupported tools: **Still shown with licensing restrictions; item text withheld where not allowed**
- licence state: **Preserved** (no “scorable” claims added where licensing forbids)

## AI Recommendation
- patient context: **Not implemented for assessments-v2** in this milestone
- evidence grounding: **Not implemented for assessments-v2** in this milestone
- PHI redaction: **Not implemented for assessments-v2 recommend prompts** in this milestone
- caveats: **Safety banner present; no diagnostic claims added**

## Safety / Compliance
- clinician review: **Visible on every tab** (stable selector `assessments-safety-banner`)
- not diagnostic: **Explicit**
- licensing: **Explicit**; no new item text added
- PHI: **No new PHI logged** in this milestone
- tenant isolation: **No backend changes in this milestone**

## Tests
| command | result | notes |
|---|---:|---|
| `npm run test:unit --workspace @deepsynaps/web` | ✅ | ran in agent environment |
| `cd apps/web && npx playwright test e2e/smoke-assessments-v2.spec.ts` | ✅ | requires Playwright browsers installed |

## Deployment
- Netlify: preview build uses `VITE_ENABLE_DEMO=1` and now deep-links to `assessments-v2` reliably render via auto clinician demo
- Fly API: unchanged
- env vars: `VITE_ENABLE_DEMO`, `VITE_API_BASE_URL`
- CI: E2E should be stable because test uses offline mocks for `/api/v1/**`
- rollback: revert commit `66c79137` if needed

## Remaining Work (prioritized)
1. **Launch blocker**: implement the requested **Assessments v2 API surface** (`/api/v1/assessments-v2/*`) or explicitly decide to reuse v1 endpoints and update UI expectations.
2. **Safety/licence blocker**: unify registries (web/API) to ensure no restricted instrument item text ships to the browser unless explicitly allowed.
3. **Evidence blocker**: add assessment-scoped evidence endpoints backed by existing corpus (`/api/v1/evidence/*`) with honest local/live/cached flags.
4. **UX improvement**: add dedicated Evidence/AI tabs (currently not present in Assessments v2) and ensure keyboard-accessible ARIA tabs.
5. **Future research**: pgvector/MedRAG hybrid retrieval for assessment evidence, with strict citation integrity checks.

