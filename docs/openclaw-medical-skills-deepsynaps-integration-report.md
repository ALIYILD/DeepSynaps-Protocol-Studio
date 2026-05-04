# OpenClaw Medical Skills -> DeepSynaps integration report

Date: 2026-05-04  
External repo reviewed: `FreedomIntelligence/OpenClaw-Medical-Skills` at commit `2aa60d4`

## Scope reviewed

- Root structure reviewed from git tree:
  - `.github/`
  - `scripts/`
  - `skills/`
  - `README.md`
  - `openclaw.plugin.json`
- The README markets **869** skills, but the current git tree contains **896**
  `SKILL.md` files under `skills/`. The difference appears to come from nested
  subskills and bundled skill copies inside larger packages. DeepSynaps should
  therefore curate by reviewed skill name, not by trusting headline counts.

## Relevant upstream skills by DeepSynaps need

### PubMed and biomedical search

- `pubmed-search`
- `medical-research-toolkit`
- `fda-database`

### ClinicalTrials.gov

- `clinicaltrials-database`
- `trial-eligibility-agent`
- `trialgpt-matching`
- `tooluniverse-clinical-trial-design`

### Clinical report writing

- `clinical-reports`
- `clinical-note-summarization`
- `clinical-nlp-extractor`

### Patient-friendly medical explanations

- `patiently-ai`
- `radgpt-radiology-reporter`

### Medical imaging review

- `medical-imaging-review`
- `pydicom`
- `histolab`
- `pathml`
- `neurokit2`
- `multimodal-radpath-fusion-agent`
- `radiomics-pathomics-fusion-agent`

### FHIR integration

- `ehr-fhir-integration`
- `fhir-development`

### Medical device regulatory / ISO 13485 / EU MDR / FDA wording

- `iso-13485-certification`
- `fda-database`
- `regulatory-drafter`
- `regulatory-drafting`

### Biomedical data analysis and visualization

- `plotly`
- `seaborn`
- `scientific-visualization`
- `statistical-analysis`
- `pyhealth`

## Curated DeepSynaps allowlist

These are the skills approved for the first DeepSynaps clinical skills layer.
Approval means "can be called only through the DeepSynaps safety wrapper",
never "free to use without review".

| Skill | DeepSynaps role | Why allow |
|---|---|---|
| `pubmed-search` | Evidence intake | Direct literature retrieval, low autonomy risk |
| `medical-research-toolkit` | Cross-database evidence intake | Broad research lookup across literature, trials, and OpenFDA |
| `clinicaltrials-database` | Trial registry lookup | Registry search only, no enrollment decisions |
| `clinical-reports` | Draft report composition | Useful for clinician-facing drafts when exports stay blocked |
| `patiently-ai` | Patient handbook / safe explanations | Strong explicit "do not diagnose / do not advise" rules |
| `medical-imaging-review` | Imaging AI literature review | Research review, not bedside interpretation |
| `pydicom` | DICOM handling / de-identification | Technical imaging workflow support |
| `pathml` | Pathology image analytics | Research/pathology processing support |
| `histolab` | WSI preprocessing | Technical preprocessing only |
| `neurokit2` | Biosignal analytics | qEEG / biosignal feature support under review |
| `iso-13485-certification` | QMS / MDR support | Strong fit for device governance work |
| `fda-database` | FDA wording / surveillance | Factual FDA data support |
| `plotly` | Analytics visualization | Interactive cohort and outcomes views |
| `seaborn` | Analytics visualization | Statistical plots for internal review |
| `scientific-visualization` | Figures / evidence packets | Visual support for reports and handbooks |
| `statistical-analysis` | Cohort analytics | Non-autonomous analysis support |
| `pyhealth` | Retrospective analytics | EHR/claims analytics with clinician review |

## Rejected or high-risk skills

These should not be enabled in the first DeepSynaps layer.

| Skill | Status | Why reject now |
|---|---|---|
| `clinical-decision-support` | Reject | Treatment recommendation and decision-algorithm scope is too autonomous |
| `prior-auth-review-skill` | Reject | Generates authorization decisions |
| `digital-twin-clinical-agent` | Reject | Predicts individual treatment response / treatment selection |
| `trialgpt-matching` | Reject | Patient-level ranking plus mixed licensing signals |
| `trial-eligibility-agent` | Reject | Patient-level eligibility determinations plus proprietary header |
| `ehr-fhir-integration` | Reject | Proprietary header and duplicates native DeepSynaps FHIR capability |
| `fhir-development` | Reject | Proprietary header and low incremental value |
| `clinical-note-summarization` | Reject | Proprietary header on PHI-heavy workflow |
| `clinical-nlp-extractor` | Reject | Proprietary header on PHI-heavy workflow |
| `radgpt-radiology-reporter` | Reject | Mixed licensing signals and patient-facing interpretation risk |
| `multimodal-radpath-fusion-agent` | Reject | Predictive phenotyping can drift into unsupported diagnosis |
| `radiomics-pathomics-fusion-agent` | Reject | Predictive modeling risk too high for first release |
| `regulatory-drafter` | Reject pending legal review | Proprietary header conflicts with repo-level MIT messaging |
| `regulatory-drafting` | Reject pending legal review | Proprietary header conflicts with repo-level MIT messaging |

## Integration architecture

1. DeepSynaps keeps the upstream repository **out of the runtime trust boundary**.
   Only reviewed skill names are mapped into a local allowlist.
2. Every selected skill output must be wrapped by
   `deepsynaps_safety_engine.wrap_openclaw_skill_output(...)`.
3. The wrapper stamps every output with:
   - source skill name
   - evidence level
   - clinical claim type
   - off-label risk flag
   - `requires_clinician_review: true`
   - patient-facing safe copy allowed: true/false
4. Protocol and neuromodulation claims are blocked unless citations are present.
5. Off-label neuromodulation text is auto-flagged before storage or export.
6. Patient-facing safe copy is permitted only for pre-approved explanation
   skills and is rejected if it implies diagnosis or a treatment guarantee.
7. FHIR stays DeepSynaps-native for now through existing local services rather
   than external OpenClaw skills.
8. The curated review state is exposed read-only at
   `/api/v1/agent-skills/openclaw-curated` for clinician/admin product surfaces
   without enabling runtime execution by itself.

## Safety risks

- **Clinical autonomy risk:** Several upstream skills explicitly produce
  treatment recommendations, prior-auth decisions, or patient-level predictions.
- **Licensing ambiguity:** The repo README advertises MIT, but multiple
  clinically relevant skills contain proprietary "all rights reserved" headers.
- **Patient-facing hallucination risk:** Imaging and report-explanation skills
  can overstate findings if allowed to operate without a local wrapper.
- **Evidence drift:** Protocol text without citations can become stronger than
  the underlying evidence package.
- **Bypass risk:** External skills must not write directly to exports, final
  reports, or approval state without the DeepSynaps safety engine.

## Tests added

- Patient-facing copy rejects diagnosis / treatment-guarantee phrasing
- Off-label neuromodulation suggestions are auto-flagged
- Protocol claims without citations are rejected
- Clinician review cannot be disabled
- Raw external output cannot bypass the safety-engine wrapper

## Next steps

1. Run legal review on any upstream skill with conflicting license signals
   before vendoring or copying its `SKILL.md`.
2. Keep FHIR integration on the existing DeepSynaps native path unless a
   clearly licensed external skill adds real value.
3. Add adapter code only for allowlisted skills with explicit network and audit
   controls.
4. Shadow-test the curated layer on internal evidence/report workflows before
   exposing any part of it to clinicians.
