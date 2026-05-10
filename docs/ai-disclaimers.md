# DeepSynaps AI Disclaimers

DeepSynaps uses a three-layer disclaimer model across clinical AI surfaces:

- `renderClinicalDisclaimer()` for the global platform disclaimer.
- `renderAiOutputDisclaimer()` for generated outputs, summaries, scores, and drafts.
- `renderModuleClinicalDisclaimer(moduleKey)` for module-specific warnings.

Supported module keys:

- `protocol`
- `qeeg`
- `mri`
- `voice`
- `video`
- `text`
- `evidence`
- `deeptwin`
- `biometrics`
- `patient`
- `export`

Recommended usage:

- Show the global disclaimer in onboarding, shared footers, and high-level AI entry points.
- Show the AI-output disclaimer beside every generated result, report, and draft.
- Show the module-specific disclaimer on the relevant tool page or section.

Operational rules:

- Do not use any disclaimer as a substitute for clinician review.
- Do not store PHI in disclaimer state.
- Do not present AI output as diagnosis, prescription, or autonomous decision-making.
- Keep global intake, audit logs, and human approval in the workflow around the disclaimers.
