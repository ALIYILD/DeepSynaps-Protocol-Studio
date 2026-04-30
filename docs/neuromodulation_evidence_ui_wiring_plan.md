# Neuromodulation Evidence UI Wiring Plan

## Goal

Wire the new neuromodulation evidence corpus and evidence APIs into the existing frontend so beta users see real evidence-backed content instead of stale static counts, fallback lists, or demo-only research cards.

## Evidence Sources Available Now

### 1. Neuromodulation research bundle API

Frontend client methods in [apps/web/src/api.js](/Users/aliyildirim/DeepSynaps-Protocol-Studio/apps/web/src/api.js):

- `api.searchResearchPapers(params)`
- `api.listResearchExactProtocols(params)`
- `api.listResearchProtocolTemplates(params)`
- `api.listResearchEvidenceGraph(params)`
- `api.listResearchSafetySignals(params)`
- `api.getResearchSummary(params)`
- `api.listResearchConditions()`
- `api.getResearchCondition(conditionSlug)`
- `api.protocolCoverage(params)`
- `api.listProtocolEvidence(params)` alias to `searchResearchPapers`

Backed by:

- `/api/v1/evidence/research/papers`
- `/api/v1/evidence/research/exact-protocols`
- `/api/v1/evidence/research/protocol-templates`
- `/api/v1/evidence/research/evidence-graph`
- `/api/v1/evidence/research/safety-signals`
- `/api/v1/evidence/research/summary`
- `/api/v1/evidence/research/conditions`
- `/api/v1/evidence/research/protocol-coverage`

Best use:

- protocol intelligence
- target-specific neuromodulation evidence
- condition/modality summaries
- safety signals
- exact protocol candidates

### 2. Live evidence pipeline API

Frontend client methods:

- `api.evidenceIndications()`
- `api.searchEvidencePapers(...)`
- `api.evidencePaperDetail(id)`
- `api.searchEvidenceTrials(...)`
- `api.searchEvidenceDevices(...)`
- `api.promoteEvidencePaper(id)`
- `api.evidenceSuggest(...)`
- `api.evidenceForProtocol(protocolId, { limit })`
- `api.evidencePatientOverview(patientId)`
- `api.evidenceQuery(payload)`
- `api.evidenceByFinding(payload)`
- `api.saveEvidenceCitation(payload)`
- `api.listEvidenceSavedCitations(patientId)`
- `api.evidenceReportPayload(payload)`

Best use:

- literature browsing
- trial/device/FDA lookup
- patient-specific evidence drawer
- report citations
- protocol-specific paper/trial/device rollups

### 3. Static demo dataset layer

Files:

- [apps/web/src/evidence-dataset.js](/Users/aliyildirim/DeepSynaps-Protocol-Studio/apps/web/src/evidence-dataset.js)
- [apps/web/src/protocols-data.js](/Users/aliyildirim/DeepSynaps-Protocol-Studio/apps/web/src/protocols-data.js)

Current problems:

- hardcoded `87K` paper counts are stale against the imported corpus
- hardcoded condition/modality evidence summaries are not synced to the imported neuromodulation DB
- many UI surfaces present evidence-like data that is not tied to the real bundle

Use this only as fallback, not as the primary source.

## Current Evidence Wiring Already Working

### Already using real bundle / evidence APIs

#### [apps/web/src/pages-brainmap.js](/Users/aliyildirim/DeepSynaps-Protocol-Studio/apps/web/src/pages-brainmap.js)

- Uses `api.listTargets()`
- Uses `api.listMontages()`
- Uses `api.listProtocolEvidence({ target, modality: 'tDCS', limit: 8 })`
- Falls back to built-in atlas/montages/evidence when API data is absent

#### [apps/web/src/pages-protocols.js](/Users/aliyildirim/DeepSynaps-Protocol-Studio/apps/web/src/pages-protocols.js)

- Uses `renderLiveEvidencePanel(...)`
- Already mixes backend protocol registry with curated protocol library
- Has an obvious place to add protocol-specific evidence calls

#### [apps/web/src/pages-knowledge.js](/Users/aliyildirim/DeepSynaps-Protocol-Studio/apps/web/src/pages-knowledge.js)

- Uses `renderLiveEvidencePanel(...)`
- Still combines that with a large amount of static evidence content

#### [apps/web/src/pages-qeeg-analysis.js](/Users/aliyildirim/DeepSynaps-Protocol-Studio/apps/web/src/pages-qeeg-analysis.js)

- Uses `EvidenceChip`
- Uses `createEvidenceQueryForTarget`
- Uses `openEvidenceDrawer`
- Uses `wireEvidenceChips`

#### [apps/web/src/pages-mri-analysis.js](/Users/aliyildirim/DeepSynaps-Protocol-Studio/apps/web/src/pages-mri-analysis.js)

- Uses `EvidenceChip`
- Uses `openEvidenceDrawer`
- Uses `wireEvidenceChips`

#### [apps/web/src/pages-patient-analytics.js](/Users/aliyildirim/DeepSynaps-Protocol-Studio/apps/web/src/pages-patient-analytics.js)

- Uses `EvidenceChip`
- Uses `PatientEvidenceTab`
- Uses `openEvidenceDrawer`
- Uses `wireEvidenceChips`
- But the page itself is still demo telemetry

## High-Value Wiring Actions

## Priority 1: Replace stale global evidence counters

### Action 1

- Route/pages:
  - [pages-research-evidence.js](/Users/aliyildirim/DeepSynaps-Protocol-Studio/apps/web/src/pages-research-evidence.js)
  - [pages-knowledge.js](/Users/aliyildirim/DeepSynaps-Protocol-Studio/apps/web/src/pages-knowledge.js)
  - [pages-clinical.js](/Users/aliyildirim/DeepSynaps-Protocol-Studio/apps/web/src/pages-clinical.js)
  - [pages-courses.js](/Users/aliyildirim/DeepSynaps-Protocol-Studio/apps/web/src/pages-courses.js)
  - [pages-patient.js](/Users/aliyildirim/DeepSynaps-Protocol-Studio/apps/web/src/pages-patient.js)
- Current state:
  - showing values from `evidence-dataset.js`
  - hardcoded around `87K papers`
- Wire to:
  - `api.getResearchSummary()`
  - `api.researchHealth()`
  - `api.evidenceStatus()` where public/global counts are enough
- Dataset/API target:
  - bundle summary and evidence status
- Why:
  - this is the fastest trust win
  - removes stale corpus sizing across the app

### Action 2

- Route/page:
  - [pages-research-evidence.js](/Users/aliyildirim/DeepSynaps-Protocol-Studio/apps/web/src/pages-research-evidence.js)
- Current state:
  - entire dashboard is built from static `evidence-dataset.js`
- Wire to:
  - `api.getResearchSummary()`
  - `api.listResearchConditions()`
  - `api.searchResearchPapers()`
  - `api.listResearchEvidenceGraph()`
  - `api.listResearchProtocolTemplates()`
  - `api.listResearchSafetySignals()`
- Dataset/API target:
  - real neuromodulation bundle
- Implementation:
  - keep static dataset only as explicit preview fallback
  - replace top KPIs, modality distribution, grade distribution, top conditions, and journals with live payloads

## Priority 2: Wire protocol intelligence to the new corpus

### Action 3

- Route/page:
  - [pages-protocols.js](/Users/aliyildirim/DeepSynaps-Protocol-Studio/apps/web/src/pages-protocols.js)
- Current state:
  - protocol search uses curated library + backend registry
  - evidence panel is generic search only
- Wire to:
  - `api.evidenceForProtocol(protocolId, { limit })`
  - `api.listResearchProtocolTemplates({ condition_slug, modality_slug })`
  - `api.listResearchSafetySignals({ condition_slug, modality_slug })`
- Dataset/API target:
  - protocol templates
  - protocol-specific evidence
  - safety signals
- Implementation:
  - add a real “Evidence” panel on protocol detail
  - show top papers, matched trials, FDA/device rows, safety warnings
  - use `promoteEvidencePaper` for save-to-library CTA

### Action 4

- Route/page:
  - [pages-brainmap.js](/Users/aliyildirim/DeepSynaps-Protocol-Studio/apps/web/src/pages-brainmap.js)
- Current state:
  - partially wired already
  - still falls back aggressively to static evidence cards and sample montages
- Wire to:
  - `api.listResearchExactProtocols({ condition_slug, modality_slug, target_region })`
  - `api.listResearchEvidenceGraph({ target_region, modality_slug })`
  - `api.listResearchSafetySignals({ target_region, modality_slug })`
- Dataset/API target:
  - exact protocols
  - evidence graph
  - safety signals
- Implementation:
  - keep current `listProtocolEvidence` search
  - add target-specific protocol candidates and safety summaries to the right rail
  - reduce dependence on `MONTAGE_LIBRARY_FALLBACK`

### Action 5

- Route/page:
  - [pages-clinical-tools.js](/Users/aliyildirim/DeepSynaps-Protocol-Studio/apps/web/src/pages-clinical-tools.js)
- Current state:
  - protocol QA / gap analysis tabs use preview rows
  - evidence mismatch guidance is copy-only
- Wire to:
  - `api.protocolCoverage()`
  - `api.listResearchProtocolTemplates()`
  - `api.listResearchSafetySignals()`
  - `api.searchResearchPapers()`
- Dataset/API target:
  - protocol coverage
  - protocol templates
  - literature gaps
- Implementation:
  - replace preview protocol coverage rows with live bundle coverage
  - replace “Search PubMed” suggestions with direct evidence results

## Priority 3: Wire analyzers and fusion flows to evidence-backed findings

### Action 6

- Route/page:
  - [pages-qeeg-analysis.js](/Users/aliyildirim/DeepSynaps-Protocol-Studio/apps/web/src/pages-qeeg-analysis.js)
- Current state:
  - evidence drawer is already wired
  - queries are limited to generic target names like `frontal_alpha_asymmetry`
- Wire to:
  - `api.evidenceQuery(payload)`
  - `api.evidenceByFinding(payload)`
  - `api.saveEvidenceCitation(payload)`
  - `api.evidenceReportPayload(payload)`
- Dataset/API target:
  - patient-specific evidence
  - report citations
- Implementation:
  - generate one evidence query per major abnormal finding
  - persist saved citations into the clinician report flow
  - attach evidence snippets to qEEG report sections

### Action 7

- Route/page:
  - [pages-mri-analysis.js](/Users/aliyildirim/DeepSynaps-Protocol-Studio/apps/web/src/pages-mri-analysis.js)
- Current state:
  - evidence drawer exists
  - MRI findings are not clearly linked to saved evidence/report payloads
- Wire to:
  - `api.evidenceQuery(payload)`
  - `api.evidenceByFinding(payload)`
  - `api.evidenceReportPayload(payload)`
- Dataset/API target:
  - structural biomarker evidence
  - trial/device support for MRI-guided targets
- Implementation:
  - attach evidence queries to hippocampus, ACC, network targets, and stimulation-target cards
  - feed selected citations into the MRI report output

### Action 8

- Route/page:
  - [pages-fusion-workbench.js](/Users/aliyildirim/DeepSynaps-Protocol-Studio/apps/web/src/pages-fusion-workbench.js)
- Current state:
  - no evidence hook visible in the fusion workbench
- Wire to:
  - `api.evidenceByFinding(payload)`
  - `api.evidenceQuery(payload)`
  - `api.evidenceReportPayload(payload)`
- Dataset/API target:
  - multi-modal evidence
  - protocol support evidence
  - counter-evidence for conflicts
- Implementation:
  - add evidence drawer chips to:
    - agreement dashboard rows
    - safety cockpit
    - protocol fusion recommendation
    - AI summary claims

## Priority 4: Turn patient analytics and reports into evidence-backed flows

### Action 9

- Route/page:
  - [pages-patient-analytics.js](/Users/aliyildirim/DeepSynaps-Protocol-Studio/apps/web/src/pages-patient-analytics.js)
- Current state:
  - evidence chips are wired
  - underlying telemetry is demo
- Wire to:
  - `api.evidencePatientOverview(patientId)`
  - `api.evidenceQuery(payload)`
  - `api.listEvidenceSavedCitations(patientId)`
- Dataset/API target:
  - patient evidence overview
  - saved citations
- Implementation:
  - keep chips
  - replace static `PatientEvidenceTab({ patientId })` placeholder usage with live `renderPatientEvidenceWorkspace(...)`
  - move report CTAs to use `evidenceReportPayload`

### Action 10

- Route/page:
  - [pages-clinical.js](/Users/aliyildirim/DeepSynaps-Protocol-Studio/apps/web/src/pages-clinical.js)
- Current state:
  - shows many static evidence badges and reference values
- Wire to:
  - `api.getResearchSummary()`
  - `api.evidenceSuggest({ modality, indication })`
  - `api.evidenceForProtocol(protocolId)`
- Dataset/API target:
  - protocol evidence suggestions
  - live trial counts
  - live paper counts
- Implementation:
  - replace static benchmark counts and reference badges with live counts
  - use evidence suggestions in decision-support and protocol launch cards

### Action 11

- Route/page:
  - [pages-research.js](/Users/aliyildirim/DeepSynaps-Protocol-Studio/apps/web/src/pages-research.js)
- Current state:
  - some tabs are explicitly preview/fallback
  - protocol coverage and export sections already point toward real APIs
- Wire to:
  - `api.protocolCoverage()`
  - `api.getResearchExportSummary(...)`
  - `api.listResearchExportSchedules()`
  - `api.getResearchSummary()`
- Dataset/API target:
  - research operations and coverage
- Implementation:
  - low risk
  - this page can become the admin surface for the imported corpus without large UI changes

## Priority 5: Clean up static evidence-heavy pages

### Action 12

- Route/page:
  - [pages-knowledge.js](/Users/aliyildirim/DeepSynaps-Protocol-Studio/apps/web/src/pages-knowledge.js)
- Current state:
  - huge amount of hardcoded paper records, evidence snippets, and trial counts
  - already embeds `renderLiveEvidencePanel(...)`
- Wire to:
  - `api.searchResearchPapers()`
  - `api.searchEvidenceTrials()`
  - `api.searchEvidenceDevices()`
  - `api.getResearchCondition(conditionSlug)`
- Dataset/API target:
  - live condition evidence
  - trials
  - devices
- Implementation:
  - keep the live evidence panel
  - progressively replace hand-seeded evidence cards and counts
  - first swap the top condition summary cards and literature lists

### Action 13

- Route/page:
  - [pages-courses.js](/Users/aliyildirim/DeepSynaps-Protocol-Studio/apps/web/src/pages-courses.js)
- Current state:
  - uses `EVIDENCE_SUMMARY` strings for benchmarks and paper counts
  - protocol/course descriptions are mostly static
- Wire to:
  - `api.evidenceSuggest({ modality, indication })`
  - `api.listResearchProtocolTemplates({ condition_slug, modality_slug })`
  - `api.getResearchSummary()`
- Dataset/API target:
  - benchmark evidence summaries
  - live paper counts
  - matched protocol candidates
- Implementation:
  - replace benchmark copy blocks
  - add “supporting evidence” drawer or inline cards to course detail

### Action 14

- Route/page:
  - [pages-patient.js](/Users/aliyildirim/DeepSynaps-Protocol-Studio/apps/web/src/pages-patient.js)
- Current state:
  - contains hand-seeded journal/article cards
  - contains hardcoded trial counts and educational evidence content
- Wire to:
  - `api.searchEvidencePapers({ indication, q, oa_only })`
  - `api.searchEvidenceTrials({ indication })`
  - `api.getResearchCondition(conditionSlug)`
- Dataset/API target:
  - patient-safe literature and trial info
- Implementation:
  - only use patient-safe summaries
  - do not expose raw clinician-only evidence fields
  - ideal for “Learn more” cards and patient education resources

## Three Immediate Buildable Workstreams

### Workstream A: Global evidence truth source

- Replace `evidence-dataset.js` KPI usage with `api.getResearchSummary()` plus `api.evidenceStatus()`
- Pages:
  - research-evidence
  - knowledge
  - clinical
  - courses
  - patient

### Workstream B: Protocol and target evidence

- Wire:
  - protocol detail evidence tab
  - brain map right rail
  - clinical tools protocol QA
- APIs:
  - `evidenceForProtocol`
  - `listResearchProtocolTemplates`
  - `listResearchEvidenceGraph`
  - `listResearchSafetySignals`

### Workstream C: Analyzer and report evidence

- Wire:
  - qEEG findings
  - MRI findings
  - fusion recommendation sections
  - patient evidence workspace
- APIs:
  - `evidenceQuery`
  - `evidenceByFinding`
  - `saveEvidenceCitation`
  - `evidenceReportPayload`

## Recommended Implementation Order

1. Replace stale global counts and summary strips.
2. Add protocol-detail evidence and brain-map target evidence.
3. Replace research-evidence dashboard static rollups with live bundle summaries.
4. Attach evidence citations to qEEG, MRI, and fusion reporting flows.
5. Gradually retire static research cards in knowledge, courses, and patient education.

## Main Technical Debt To Remove

- `evidence-dataset.js` as the primary truth source
- hardcoded paper/trial counts
- static literature cards embedded directly in page modules
- analyzer evidence chips that open drawers but do not save citations into reports

## Best Immediate Targets For Actual Coding

If implementation starts now, the best first pages are:

1. [pages-research-evidence.js](/Users/aliyildirim/DeepSynaps-Protocol-Studio/apps/web/src/pages-research-evidence.js)
2. [pages-protocols.js](/Users/aliyildirim/DeepSynaps-Protocol-Studio/apps/web/src/pages-protocols.js)
3. [pages-brainmap.js](/Users/aliyildirim/DeepSynaps-Protocol-Studio/apps/web/src/pages-brainmap.js)
4. [pages-qeeg-analysis.js](/Users/aliyildirim/DeepSynaps-Protocol-Studio/apps/web/src/pages-qeeg-analysis.js)
5. [pages-mri-analysis.js](/Users/aliyildirim/DeepSynaps-Protocol-Studio/apps/web/src/pages-mri-analysis.js)

These give the highest return because the backend and client hooks already exist.
