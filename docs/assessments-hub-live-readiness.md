# Assessments routes — live / demo readiness

## Canonical doctor workspace (controlled demo)

**Use** `?page=assessments-v2` for the primary clinician Assessments experience: queue, library, cohort tools, side panel, and API-backed flows implemented in `apps/web/src/pages-clinical-hubs.js` (`pgAssessmentsHub`).

## Legacy route (separate implementation)

**`?page=assessments`** loads the Clinical Hub shell (`pgClinicalHub`) with multiple sub-tabs (Assessments · Outcomes · Scoring · Scale Registry). The Assessments sub-tab delegates to `apps/web/src/pages-clinical-tools.js` (`pgAssessmentsHub`), which is a **different** UI stack than `assessments-v2`. Do not assume identical behaviour, data hydration, or feature parity between the two.

Redirects such as **`assessments-hub`** still land on the Clinical Hub (`?page=assessments`) with the Assessments tab selected — not on `assessments-v2`.

## Operational note

Reviewers and demo pilots should bookmark **`assessments-v2`** when exercising the doctor-demo Assessments surface. The legacy route remains available for workflows that explicitly depend on the Clinical Hub wrapper until a future consolidation decision.
