# Assessments v2 — UX / Design Report

## Current UX state (as found)

- **Page**: `apps/web/src/pages-clinical-hubs.js` → `pgAssessmentsHub()` (Assessments v2)
- **Rendering**: DOM-string template, tabs: Queue / Cohort / Library / Individual
- **Clinical safety**: visible safety footer already exists and states **clinician review required** and **scores are not diagnoses**
- **Demo mode**: explicit banner string `DEMO_ASSESSMENTS_BANNER_MARK` is displayed when sample queue is active

## Changes implemented for doctor-facing readiness (this sprint)

- **Stable selectors / test IDs added** (to enable reliable QA and avoid “page looks blank” confusion):
  - `data-testid="assessments-v2-root"`
  - `data-testid="assessments-queue"` and `id="assessments-queue"`
  - `data-testid="assessments-library"` and `id="assessments-library"`
  - `data-testid="assessments-condition-map"` and `id="assessments-condition-map"`
  - `data-testid="assessments-demo-banner"` and `id="assessments-demo-banner"` (when demo/sample data)
  - `data-testid="assessments-safety-banner"` and `id="assessments-safety-banner"`
  - Tabs:
    - `data-testid="assessments-queue-tab"`
    - `data-testid="assessments-library-tab"`
    - `data-testid="assessments-condition-map-tab"`
    - `data-testid="assessments-fill-score-tab"`
  - Side panel:
    - `data-testid="assessments-evidence-panel"` (detail panel container)

## UX gaps (not yet fully doctor-ready, but now testable)

- **Tabs ARIA**: tablist is `role="tablist"` but the tab buttons do not currently set `role="tab"`, `aria-selected`, `aria-controls`, or roving tabindex. This is a usability/accessibility gap (keyboard navigation).
- **Evidence panel semantics**: side panel is currently a “detail + AI summary” panel; the v2 “Evidence” tab and AI recommendation tab are not yet implemented as separate tabs. The selector `assessments-evidence-panel` maps to the side panel, not a full evidence workspace.

## UX recommendations (next implementation steps)

- **Make tabs fully accessible**:
  - set `role="tab"` on each tab
  - set `aria-selected`, `tabindex`
  - map each tab to a `role="tabpanel"` with `aria-labelledby`
  - implement left/right/home/end keyboard nav (follow patterns in other hubs)
- **Add explicit “licence-aware badges” on Library cards**:
  - Fillable / Scorable / Licence Required / External-only badges as discrete elements with testids:
    - `assessments-fillable-badge`
    - `assessments-scorable-badge`
    - `assessments-licence-badge`
- **Upgrade “Assign to patient” flow**:
  - replace free text (name/MRN) with a patient selector/autocomplete, and ensure cross-clinic access is blocked server-side (already supported in API patterns)

