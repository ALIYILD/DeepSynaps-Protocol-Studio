# DeepSynaps AI page → Agent Brain provider map

Canonical mapping of every AI surface in DeepSynaps Studio to the Clinical
Agent Brain providers it should call before producing output, plus the
required safety warning and the wiring TODO.

> Status legend
> - **wired**: provider is wired to a real service. After this PR: 12 of 13 providers.
> - **gated**: shipped DISABLED — turn on with an env flag (`patient_context`).
> - **placeholder**: returns `not_configured` honestly until wired.

| Page | Providers Needed | Current Status | Backend Endpoint | Safety Warning | TODO |
| --- | --- | --- | --- | --- | --- |
| **Evidence Research** (`pages-research-evidence.js`) | `evidence`, `condition_registry`, `protocol_governance` | wired (evidence DB → CSV fallback); show citations + "Insufficient local evidence" fallback | `POST /api/v1/agent-brain/query` `{provider:"evidence"}` | "Decision-support only · clinician review required" | mount status banner; render PMID/DOI badges from response.citations |
| **Protocol Studio** (`pages-protocol-studio.js`) | `protocol_governance`, `evidence`, `condition_registry`, `device_registry` | wired; surface on/off-label + clinician-review flags before generate | `/agent-brain/query` × 4 | Off-label / research-only flags; clinician-review required | replace any inline governance copy with `protocol_governance` items |
| **qEEG Analyzer** (`pages-qeeg-analysis.js`, `analyzer-ai-report-ui.js`) | `qeeg_knowledge`, `evidence`, `report_templates`, `protocol_governance` | wired (qEEG bands from `qeeg_biomarkers.csv` + condition→pattern map) | `/agent-brain/query` `{provider:"qeeg_knowledge"}` | "qEEG output is decision-support only and must not be used as a standalone diagnostic conclusion" | render band biomarker definitions in the analyzer side panel |
| **MRI Analyzer** (`pages-mri-analysis.js`) | `mri_knowledge`, `evidence`, `protocol_governance`, `report_templates` | wired (atlas regions + MRI pipeline availability probe) | `/agent-brain/query` | "MRI output is decision-support only; does not replace radiologist review" | render `mri_pipeline_available` flag in the page status strip |
| **DeepTwin** (`pages-deeptwin.js`, `deeptwin/`) | `deeptwin_context`, `evidence`, `condition_registry` | wired (capability manifest only — never invokes patient functions) | `/agent-brain/query` | "Hypothesis-generating simulation, not a diagnosis or treatment decision" | display capability presence/absence in the DeepTwin landing card |
| **Patient Analytics Dashboard** (`pages-patient-summary.js`, `pages-population-analytics.js`) | `patient_context` (gated), `evidence` for cohort claims | gated (patient_context disabled by default) | `/agent-brain/query` | "Real vs sample data is labelled; cross-clinic gate enforced" | enable `patient_context` only in dev/test until audit retention is finalized |
| **Video Analysis** (`pages-video-assessments.js`) | `video_audio_analysis`, `assessment` | wired (video task catalog + audio pipeline probe; assessment instrument catalog) | `/agent-brain/query` | "Video AI output is decision-support only" | use `video_audio_analysis.items[type=video_assessment_task]` to render the canonical task list |
| **Voice Analysis** (`pages-voice-analyzer.js`) | `video_audio_analysis` | wired | `/agent-brain/query` | "Voice AI output is decision-support only" | render `audio_pipeline_status` chip from response.items |
| **Text Analysis** (`pages-clinical-text.js` / `pages-symptom-journal.js`) | `assessment`, `evidence` | wired (assessment instrument catalog from `assessments.csv`) | `/agent-brain/query` | Decision-support only | populate the symptom-journal picker from the catalog |
| **Biomarker Analysis** (`pages-labs-analyzer.js`, `pages-nutrition-analyzer.js`) | `biomarker` | wired (wearable biometric domain catalog + biometrics module probe) | `/agent-brain/query` | Decision-support only | per-patient values continue to flow through `/api/v1/biometrics/*` — this provider is catalog-only |
| **Report Generator** (`pages-reports.js`, `analyzer-ai-report-ui.js`) | `report_templates`, `evidence`, `protocol_governance` | wired | `/agent-brain/query` | "Citations required for evidence sections; clinician review required" | render citations from response, never fabricate placeholders |

## Frontend wiring pattern

Each AI page should add a single mount point. Light-touch — no flow rewrite.

```html
<!-- once per page, near the page header -->
<div id="agent-brain-status"></div>
```

```js
// in the page's existing init() / DOMContentLoaded handler
import { mountAgentBrainStatus } from './agent-brain-status.js';
mountAgentBrainStatus();   // honest banner + decision-support disclaimer
```

Pages that need to actually call a provider (Evidence Research → evidence,
Protocol Studio → protocol_governance, etc.) add a second snippet:

```js
import { api } from './api.js';
const resp = await api.queryAgentBrain({
  provider: 'evidence',
  query: searchInput.value,
  condition: conditionSelect.value,
  include_citations: true,
});
if (resp.status === 'not_configured' || resp.status === 'unavailable') {
  showFallback(resp.answer);                       // canonical fallback string
} else if (resp.status === 'denied') {
  showAccessDenied(resp.answer);
} else {
  renderItems(resp.items);
  renderCitations(resp.citations);                 // never fabricate
  renderSafetyFlags(resp.safety_flags);
}
```

## Mount adoption status (PR #680)

| Page file | Banner mounted |
| --- | --- |
| `pages-deeptwin.js` | ✓ |
| `pages-qeeg-analysis.js` | ✓ |
| `pages-mri-analysis.js` | ✓ (incl. feature-flag-disabled path) |
| `pages-protocols.js` (Protocol Studio) | ✓ |
| `pages-video-assessments.js` | ✓ |
| `pages-voice-analyzer.js` | ✓ (incl. role-restricted card) |
| `pages-text-analyzer.js` | ✓ (incl. role-restricted card) |
| `pages-biomarkers.js` | ✓ |
| `pages-patient-analytics.js` | ✓ (cohort + per-patient detail) |
| `pages-handbooks.js` (Report Generator) | ✓ (incl. patient-restricted card) |
| `pages-research-evidence.js` (Evidence Research) | deferred — concurrent-session WIP stash held the file at PR-time; mount lands in a follow-up PR after the stash is reconciled |

## Status snapshot (after this PR)

After this PR lands, calling `GET /api/v1/agent-brain/status` returns:

```
service:                 clinical_agent_brain
providers_total:         13
providers_configured:    12  (evidence, protocol_governance, condition_registry,
                              device_registry, report_templates, agent_memory,
                              qeeg_knowledge, mri_knowledge, deeptwin_context,
                              video_audio_analysis, biomarker, assessment)
providers_disabled:      1   (patient_context — env-gated)
providers_placeholder:   0
safety_mode:             strict_clinical
```

`agent_memory` reports `not_configured` in `health()` until
`AGENT_BRAIN_MEMORY_ALLOW_WRITES=1` is set; the registry still counts it as
"wired" because the read path is always available. `patient_context` is the
only provider gated off by default.
