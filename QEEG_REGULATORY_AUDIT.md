# QEEG Brain Map — Regulatory Copy Audit
**Date:** 2026-04-30  
**Auditor:** Safety Layer Agent (claude-sonnet-4-6)  
**Scope:** PRs #276, #279, #281, #283, #298, #301, #303, #304, #306  
**Branches:** feat/qeeg-brain-map-contract-phase0 through feat/qeeg-demo-seed-and-launcher-wiring-phase5d  
**Reference rules:** packages/qeeg-pipeline/CLAUDE.md §Regulatory posture

---

## VERDICT: CONDITIONAL FAIL

Three FAIL items must be resolved before any of these PRs land on main. They are all confined to the demo data object inside `apps/web/src/pages-qeeg-analysis.js`. Everything else is PASS or requires a documentation fix only (normalisation of disclaimer wording).

---

## Section 1 — Per-file Grep Results

### BANNED TERMS: `diagnosis`, `diagnostic`, `treatment recommendation`, `cure`, `FDA-approved`

| File:Line | Hit | Classification |
|---|---|---|
| `apps/api/app/data/dk_atlas_narrative.json:9` | `"Not for diagnosis, diagnostic decisions, or treatment recommendations."` | OK — inside the `_meta.regulatory_note` field; this is the disclaimer phrase itself |
| `apps/api/app/services/qeeg_report_template.py:33` | `DEFAULT_DISCLAIMER = "…is not a medical diagnosis or treatment recommendation…"` | OK — canonical disclaimer definition |
| `apps/api/app/services/qeeg_pdf_export.py:107` | `"Not a medical diagnosis or treatment recommendation."` | OK — fallback disclaimer for PDF renderer |
| `apps/api/app/services/qeeg_protocol_fit.py:148` | `"…not a treatment recommendation."` | OK — inside `_build_match_rationale()`, correctly qualified |
| `apps/api/app/services/qeeg_safety_engine.py:126` | `"Not a diagnosis."` | WARN — see Section 3 (disclaimer wording variant) |
| `apps/api/app/services/qeeg_safety_engine.py:310` | `"Not a diagnosis."` | WARN — same variant |
| `apps/api/app/routers/qeeg_analysis_router.py:2188` | `"It does not constitute a clinical diagnosis."` | OK — inside HTML disclaimer block in the legacy patient-facing report renderer |
| `apps/api/app/routers/qeeg_analysis_router.py:3268` | `"Not a diagnosis or treatment recommendation."` | WARN — see Section 3 (wording variant) |
| `apps/api/app/routers/qeeg_analysis_router.py:3538` | `"Z-scores are descriptive, not diagnostic."` | OK — inside `limitations[]` list, factual qualifier |
| `apps/api/app/routers/treatment_courses_router.py:1149–1152` | `"…not a medical diagnosis or treatment recommendation."` | OK — inside the `qeeg-comparison` endpoint disclaimer field |
| `apps/web/src/pages-qeeg-launcher.js:123–124` | `"…is not a medical diagnosis or treatment recommendation."` | OK — disclaimer footer |
| `apps/web/src/pages-qeeg-analysis.js:735` | `confidence_disclaimer: '…not evidence-graded clinical validation…'` | OK — inside confidence note field |
| `apps/web/src/pages-qeeg-analysis.js:2720` | `"They are not diagnostic conclusions."` | OK — biomarker section disclaimer |
| `apps/web/src/pages-qeeg-analysis.js:3419` | `disclaimer: 'These are neurophysiological similarity indices; they do not establish any medical condition.'` | OK — similar-cases disclaimer |
| `apps/web/src/pages-brainmap.js:972` | `"it is not a diagnosis or treatment recommendation."` | OK — qEEG overlay footer |
| `apps/web/src/qeeg-brain-map-template.js` (renderDisclaimer) | full disclaimer string rendered in footer | OK — present, visible, not collapsed |
| `apps/api/scripts/seed_demo.py:322` | `"…is not a medical diagnosis or treatment recommendation."` | OK — canonical phrasing in seeded payload |

**No instance of the bare banned words ("diagnosis", "diagnostic", "treatment recommendation") appears outside a qualifying disclaimer phrase, a sanitiser/banned-pattern list, or a "not a …" formulation, EXCEPT in the three FAIL items below.**

---

## Section 2 — FAIL Items

### FAIL-1: Demo data contains "epileptiform" language presented as clinical findings

**File:** `apps/web/src/pages-qeeg-analysis.js`  
**Present in:** feat/qeeg-brain-map-renderers-phase1 (PR #279), feat/qeeg-brain-map-planner-overlay-phase5a (PR #301), feat/qeeg-demo-seed-and-launcher-wiring-phase5d (PR #306) — confirmed identical strings across all three.

**Specific hits:**

| Line (Phase 5d) | String | Problem |
|---|---|---|
| 3655 | `epileptiform: {findings: 'Occasional focal spikes in temporal region, burst durations under 3 seconds'…}` | States "focal spikes" as a finding — this is diagnostic language. Epileptiform activity is a clinical finding that triggers neurologist referral. It must not appear as a plain narrative string, even in demo mode. |
| 3658 | `'Intermittent low-amplitude epileptiform discharges in temporal regions.'` | Same: "epileptiform discharges" without any framing as research/wellness observation. This string is rendered verbatim in a UI section titled "Mental Health and Brain Function". |
| 3654 | `firda_oirda: {firda: 'Detected sporadically in frontal channels (Fp1, F7)', oirda: 'Observed in occipital/temporal channels (T3)'…}` | FIRDA/OIRDA are clinical EEG abnormality patterns associated with encephalopathy. "Detected" framing implies detection of a pathological condition. |
| 3632 | `'No focal delta abnormalities suggestive of structural lesions.'` | The phrase "structural lesions" is excluded-diagnosis language. Even negation is diagnostic framing. |

**Aggravating factor:** `VITE_ENABLE_DEMO=1` is set permanently in `netlify.toml:22`, meaning demo mode is always active on the Netlify preview (`deepsynaps-studio-preview.netlify.app`). The `_isDemoMode()` check resolves to `true` for all preview visitors. These strings therefore render to any clinician or patient who is directed to the preview URL — they are not gated behind a "dev only" environment.

**Proposed fix (file:line:before:after):**

*Line 3655 — `apps/web/src/pages-qeeg-analysis.js` (all three affected branches):*

Before:
```
epileptiform: {findings: 'Occasional focal spikes in temporal region, burst durations under 3 seconds', tbr: 3.2, normal_tbr: '2.5-3.0', impact: 'Difficulty sustaining attention'},
```
After:
```
epileptiform: {findings: 'DEMO PLACEHOLDER — epileptiform field intentionally left empty. Do not populate with clinical-sounding example text.', tbr: null, normal_tbr: '2.5-3.0', impact: ''},
```

*Line 3658:*

Before:
```
{title: 'Mental Health and Brain Function', content: 'Subtle frontal asymmetries correlate with emotional regulation. Significant inattention index (6.3 at Fz vs norm of 2). Intermittent low-amplitude epileptiform discharges in temporal regions. Overall pattern of increased delta with reduced beta2/gamma consistent with hyperarousal.'},
```
After:
```
{title: 'Mental Health and Brain Function', content: 'Subtle frontal asymmetries correlate with emotional regulation. Theta/beta ratio patterns may be associated with attentional processing styles. Overall spectral profile is illustrative; interpret with reference to presenting symptoms.'},
```

*Line 3654:*

Before:
```
firda_oirda: {firda: 'Detected sporadically in frontal channels (Fp1, F7)', oirda: 'Observed in occipital/temporal channels (T3)', impact: 'Transient lapses in alertness'},
```
After:
```
firda_oirda: null,
```

*Line 3632:*

Before:
```
+ 'No focal delta abnormalities suggestive of structural lesions.\n\n'
```
After:
```
+ 'Delta band distribution within expected limits for this age band.\n\n'
```

---

### FAIL-2: Demo data section titled "CLINICAL IMPRESSION" uses causal diagnostic framing

**File:** `apps/web/src/pages-qeeg-analysis.js`  
**Line (Phase 5d):** 3644–3646

**String:**
```
'CLINICAL IMPRESSION:\n'
+ 'The combination of mild frontal theta excess, borderline TBR, and left frontal alpha asymmetry suggests a profile consistent with '
+ 'mild attentional and mood-related dysregulation. These findings warrant clinical correlation with presenting symptoms.',
```

**Problem:** The section heading "CLINICAL IMPRESSION" is a clinical documentation term implying a physician's clinical assessment. The phrase "suggests a profile consistent with mild attentional and mood-related dysregulation" is a near-diagnosis — it names a clinical condition ("dysregulation") as the implication of the EEG pattern without the qualifier "research/wellness use only." The trailing clause "warrant clinical correlation" partially mitigates but does not eliminate the problem.

**Proposed fix (line 3644–3646):**

Before:
```
+ 'CLINICAL IMPRESSION:\n'
+ 'The combination of mild frontal theta excess, borderline TBR, and left frontal alpha asymmetry suggests a profile consistent with '
+ 'mild attentional and mood-related dysregulation. These findings warrant clinical correlation with presenting symptoms.',
```
After:
```
+ 'RESEARCH/WELLNESS SUMMARY (illustrative demo only):\n'
+ 'The combination of mild frontal theta excess, borderline TBR, and left frontal alpha asymmetry is consistent with patterns reported in attentional and mood-related research literature. '
+ 'This is a demo illustration only. Real qEEG findings must be discussed with a qualified clinician before any clinical interpretation is made.',
```

---

### FAIL-3: Demo data "Treatment and Assistive Strategies" section implies the system is making treatment decisions

**File:** `apps/web/src/pages-qeeg-analysis.js`  
**Line (Phase 5d):** ~3668 (within the `sections` array)

**String:**
```
{title: 'Treatment and Assistive Strategies', content: 'Neurofeedback sessions for brainwave control. Mindfulness and meditation for hyperarousal reduction. CBT for anxiety and attention difficulties. Assistive technologies for executive dysfunction.'},
```

**Problem:** The section title "Treatment and Assistive Strategies" directly frames the output as treatment recommendations. The content lists specific interventions (CBT, neurofeedback) without any qualification that these are illustrative examples. This violates the core rule against treatment recommendations appearing without explicit "decision-support / clinician review required" framing.

**Proposed fix (same section block):**

Before:
```
{title: 'Treatment and Assistive Strategies', content: 'Neurofeedback sessions for brainwave control. Mindfulness and meditation for hyperarousal reduction. CBT for anxiety and attention difficulties. Assistive technologies for executive dysfunction.'},
```
After:
```
{title: 'Illustrative Next Steps (Demo Only)', content: 'The types of support that may be explored — in consultation with a qualified clinician — include neurofeedback, mindfulness practices, psychotherapy, and assistive technologies. These are illustrative examples only and are not treatment recommendations derived from this demo recording.'},
```

---

## Section 3 — Disclaimer Inventory and Normalisation

The following disclaimer phrase variants are in use across the 9 PRs. All are legally defensible, but inconsistency creates risk if a regulator compares surfaces.

| Variant | Location | Notes |
|---|---|---|
| **Variant A (canonical):** "Research and wellness use only. This brain map summary is informational and is not a medical diagnosis or treatment recommendation. Discuss any findings with a qualified clinician." | `qeeg_report_template.py:33` (DEFAULT_DISCLAIMER), `seed_demo.py:321`, `qeeg-brain-map-template.js` (renderDisclaimer fallback), `pages-qeeg-launcher.js:123` | Fullest form. Should be canonical. |
| **Variant B:** "Research and wellness use only. Not a medical diagnosis or treatment recommendation." | `qeeg_pdf_export.py:107` | Missing the "Discuss findings with a qualified clinician" clause. |
| **Variant C:** "Decision-support only. Requires clinician review. Not a diagnosis." | `qeeg_safety_engine.py:126`, `qeeg_safety_engine.py:310` | Missing "treatment recommendation" and missing the patient-facing call-to-action. Clinician-only context, but still should be normalised. |
| **Variant D:** "Decision support only. Not a diagnosis or treatment recommendation. Clinician supervision required." | `qeeg_analysis_router.py:3268` | Close but "clinician supervision required" is less clear than "discuss findings with a qualified clinician." |
| **Variant E:** "Decision-support only. Pre/post change does not establish treatment efficacy and is not a medical diagnosis or treatment recommendation. Clinical interpretation by a qualified clinician is required." | `treatment_courses_router.py:1149` | Longest and most specific; context-appropriate for the comparison endpoint. |
| **Variant F:** "It does not constitute a clinical diagnosis. All findings should be reviewed and validated by a licensed healthcare professional in the context of the patient's full clinical history." | `qeeg_analysis_router.py:2188` (legacy HTML renderer) | Missing "research/wellness use only." |

**Recommendation:** Adopt Variant A as canonical for all patient-facing surfaces. For clinician-only API response fields (Variant C, D), the minimum is: "Decision-support only. Not a medical diagnosis or treatment recommendation. Review with the patient's clinical context."

**Required normalisation changes to close WARN items:**

- `apps/api/app/services/qeeg_pdf_export.py:107`: Add "Discuss any findings with a qualified clinician." to the fallback disclaimer string.
- `apps/api/app/services/qeeg_safety_engine.py:126` and `:310`: Replace "Not a diagnosis." with "Not a medical diagnosis or treatment recommendation."
- `apps/api/app/routers/qeeg_analysis_router.py:2188`: Add "Research and wellness use only." before the existing sentence.
- `apps/api/app/routers/qeeg_analysis_router.py:3268`: Replace with Variant A phrasing adapted for API context.

---

## Section 4 — Renderer Disclaimer Presence Check

| Renderer / Surface | Disclaimer Present | Visible (not collapsed) | Correct Phrasing |
|---|---|---|---|
| Patient report (`qeeg-patient-report.js`) | YES — `renderDisclaimer()` called last in `renderPatientReport()` | YES — rendered as `<footer>` | YES (Variant A) |
| Clinician report (`qeeg-clinician-report.js`) | YES — `renderDisclaimer(payload, 'clinician')` called last | YES — rendered as `<footer>` | YES (Variant A + provenance sub-line) |
| PDF export (`qeeg_brain_map_report.html`) | YES — `<footer class="disclaimer">` in Jinja template | YES — always rendered at page bottom | PARTIAL — inherits whatever `disclaimer` field says (Variant A if from Phase 0 contract, Variant B if from pdf_export.py fallback) |
| qEEG Analyzer page (`pages-qeeg-analysis.js`) | YES — `_qeegClinicalSafetyFooter()` always rendered, plus per-section notes | YES — static, not gated on demo mode | OK but not normalised to Variant A |
| Brain Map Planner qEEG overlay (`pages-brainmap.js:972`) | YES — inline footer in overlay section | YES | PARTIAL — "not a diagnosis or treatment recommendation" (missing "research/wellness use only") |
| qEEG Launcher (`pages-qeeg-launcher.js`) | YES — `_renderDisclaimer()` renders as last element | YES — `<footer>` | YES (Variant A) |
| Patient portal My Brain Map tab (`pages-patient.js`) | DELEGATED — rendered by `mountPatientReport()` which calls `renderDisclaimer()` | YES — if report payload has disclaimer field | YES — but the tab itself has no standalone disclaimer if the report fails to load. The error state `"Unable to load your brain map right now"` has no disclaimer. |
| Course pre/post comparison (`treatment_courses_router.py`) | YES — `disclaimer` field in JSON response | API only — frontend must surface it | Variant E; acceptable for this context |

**Additional gap:** The My Brain Map tab error state in `pages-patient.js` (approximately line 6750) returns a bare error message without the research/wellness disclaimer. If a patient sees the error state, they see no disclaimer.

**Proposed fix for the error state:**

File: `apps/web/src/pages-patient.js`

Before (approximately line 6750):
```javascript
el.innerHTML = '<div class="ds-alert ds-alert--error">Unable to load your brain map right now. Please try again later.</div>';
```
After:
```javascript
el.innerHTML = '<div class="ds-alert ds-alert--error">Unable to load your brain map right now. Please try again later.</div>'
  + '<p style="margin:12px 0 0;font-size:12px;color:var(--text-secondary)">Research and wellness use only. Not a medical diagnosis or treatment recommendation. Discuss findings with your clinician.</p>';
```

---

## Section 5 — "May Indicate" / "Is Associated With" Framing Audit

The following strings in `qeeg-brain-map-template.js` and `qeeg_protocol_fit.py` were verified to use correct hedged framing:

- `qeeg-brain-map-template.js:renderIndicatorGrid`: "May indicate frontal-lobe maturation status when measured eyes-open." — PASS
- `qeeg-brain-map-template.js:renderBrainFunctionScoreCard`: "May indicate atypical pattern — discuss with clinician." — PASS
- `qeeg_protocol_fit.py:147`: "This pattern has been associated with … in research literature." — PASS
- `qeeg_protocol_fit.py:231–247`: All `rationale` strings use "is associated with" — PASS
- `pages-qeeg-analysis.js:3691`: "consistent with hypoaroused vigilance state" — PASS (contextualised)
- `pages-qeeg-analysis.js:3688`: "Findings labelled for research/wellness use only." — PASS

**Failing framing (covered under FAIL-1 and FAIL-2 above):**
- `pages-qeeg-analysis.js:3632`: "suggestive of structural lesions" — FAIL (excluded-diagnosis language)
- `pages-qeeg-analysis.js:3655`: "Occasional focal spikes in temporal region" — FAIL (positive finding assertion)
- `pages-qeeg-analysis.js:3658`: "Intermittent low-amplitude epileptiform discharges" — FAIL

---

## Section 6 — DK Atlas Narrative Bank Check (`dk_atlas_narrative.json`)

**Grep result:** No banned terms ("diagnosis", "diagnostic", "treatment recommendation", "cure", "FDA-approved") appear in any `functions[]` or `decline_symptoms[]` entry. The only occurrence of "diagnosis" is in `_meta.regulatory_note:9`, which is the disclaimer note.

**Framing check on `decline_symptoms[]`:** These strings use noun-phrase or gerund framing ("Difficulties in planning", "Poor working memory", "Functional decline in the left side leads to difficulties") rather than causal assertions about the patient. This is acceptable as long as the UI headings them as "Symptoms associated with functional decline" (which `qeeg-brain-map-template.js:renderDKRegionCard` does). PASS.

**One note:** The `narrative_source` field for the last entry reads `null` (line 472). This means one ROI (`pericalcarine`) has no sourcing. This is not a banned-term issue but should be tracked for Phase 1 completion.

---

## Section 7 — Off-Label Tagging Check

`qeeg_protocol_fit.py` sets `off_label_flag: bool` on `QEEGProtocolFit` records and `caution_rationale` explicitly states "Use as off-label / investigational." The API response schema includes `off_label_flag`. However, the frontend surfaces for protocol-fit suggestions (in `qeeg_analysis_router.py`) do not appear to propagate the off-label flag visually to the clinician. This is not a FAIL for this audit (the data is in the response), but the UI team should verify the clinician-facing protocol card renders the off-label tag visibly. Not audited in these 9 PRs' frontend files — flag for Phase 6 audit.

---

## Summary of Required Changes

### Must-Fix Before Merge (FAIL)

| ID | File | Line(s) | Change required |
|---|---|---|---|
| FAIL-1a | `apps/web/src/pages-qeeg-analysis.js` | 3655 | Remove/replace epileptiform focal spikes demo string |
| FAIL-1b | `apps/web/src/pages-qeeg-analysis.js` | 3658 | Remove "Intermittent low-amplitude epileptiform discharges" |
| FAIL-1c | `apps/web/src/pages-qeeg-analysis.js` | 3654 | Null out the firda_oirda demo object |
| FAIL-1d | `apps/web/src/pages-qeeg-analysis.js` | 3632 | Replace "suggestive of structural lesions" |
| FAIL-2 | `apps/web/src/pages-qeeg-analysis.js` | 3644–3646 | Replace "CLINICAL IMPRESSION" heading and near-diagnosis framing |
| FAIL-3 | `apps/web/src/pages-qeeg-analysis.js` | ~3668 | Replace "Treatment and Assistive Strategies" section title and content |

### Should-Fix Before Merge (WARN — Disclaimer Normalisation)

| ID | File | Line | Change required |
|---|---|---|---|
| WARN-1 | `apps/api/app/services/qeeg_pdf_export.py` | 107 | Add "Discuss any findings with a qualified clinician." |
| WARN-2 | `apps/api/app/services/qeeg_safety_engine.py` | 126, 310 | Expand "Not a diagnosis." to full Variant A phrase |
| WARN-3 | `apps/api/app/routers/qeeg_analysis_router.py` | 2188 | Prepend "Research and wellness use only." |
| WARN-4 | `apps/api/app/routers/qeeg_analysis_router.py` | 3268 | Normalise to Variant A phrasing |
| WARN-5 | `apps/web/src/pages-brainmap.js` | 972 | Add "research/wellness use only" to the overlay footer |
| WARN-6 | `apps/web/src/pages-patient.js` | ~6750 | Add disclaimer to error state in My Brain Map tab |

### No Change Required (PASS)

- `apps/api/app/data/dk_atlas_narrative.json` — clean, no banned terms outside the meta regulatory note
- `apps/api/app/services/qeeg_report_template.py` — correct, canonical disclaimer defined
- `apps/api/app/services/qeeg_protocol_fit.py` — all rationale strings use "is associated with" framing
- `apps/api/app/templates/qeeg_brain_map_report.html` — disclaimer present in footer, always rendered
- `apps/web/src/qeeg-brain-map-template.js` — renderDisclaimer() correct
- `apps/web/src/qeeg-patient-report.js` — calls renderDisclaimer() last, correct
- `apps/web/src/qeeg-clinician-report.js` — calls renderDisclaimer() last, correct
- `apps/web/src/pages-qeeg-launcher.js` — disclaimer present, Variant A
- `apps/api/scripts/seed_demo.py` — seed payload uses Variant A; the seeded `QEEGAIReport.report_payload` is clean
- `apps/api/app/routers/treatment_courses_router.py` — qeeg-comparison endpoint disclaimer is adequate

---

*This audit covers only regulatory copy. It does not cover security, performance, or clinical validity of the normative model.*
