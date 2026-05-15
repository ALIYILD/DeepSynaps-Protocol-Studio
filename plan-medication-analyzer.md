# Medication Analyzer Transformation — Execution Plan

## Stage 1: Critical Bug Fixes (Parallel with Research)

### Bug 1: Role Gate Mismatch (HIGH)
- **Location**: `pages-medication-analyzer.js` line 14
- **Issue**: `CLINICAL_MEDICATION_ANALYZER_ROLES` includes `'reviewer', 'technician'`
- **Backend**: `require_minimum_role(actor, "clinician")` on ALL endpoints
- **Fix**: Remove `'reviewer'` and `'technician'` from the Set
- **Impact**: Prevents frontend from showing UI to users who will get 403 from backend

### Bug 2: Sticky Fixture Mode (MEDIUM)
- **Location**: `pages-medication-analyzer.js` — `loadPatient()` function
- **Issue**: `usingFixtures` set to `true` when demo data is used, but never reset to `false` when subsequent live fetches succeed
- **Fix**: Set `usingFixtures = false` at the start of every `loadPatient()` / `loadLog()` call; only set to `true` when fixtures are actually needed
- **Impact**: UI incorrectly shows "demo/sample" banners after transitioning from demo to real data

### Bug 3: Stale Interaction Results (MEDIUM)
- **Location**: `pages-medication-analyzer.js` — add/remove medication handlers
- **Issue**: `lastInteractionResult` persists after medication list changes (add, remove)
- **Fix**: Clear `lastInteractionResult = null` in `_refreshMedListInPlace()` after medication mutations; clear in `_openPatient()`
- **Impact**: Old interaction results shown alongside new medication list — safety risk

## Stage 2: Research Swarm (8 Agents — All Parallel)

1. **Psychiatric Medication Evidence Agent** → PSYCHIATRIC_MEDICATION_EVIDENCE_MATRIX.md
2. **Neuromodulation Interaction Agent** → NEUROMODULATION_MEDICATION_INTERACTION_MATRIX.md
3. **Pharmacology Dataset Agent** → OPEN_MEDICATION_DATASET_STACK_REPORT.md
4. **Side Effect / Adverse Event Agent** → MEDICATION_ADVERSE_EFFECTS_MATRIX.md
5. **qEEG/MRI/Biomarker Medication Agent** → MEDICATION_BIOMARKER_CONFOUNDER_MATRIX.md
6. **Nutrition/Lab Interaction Agent** → MEDICATION_NUTRITION_LAB_MATRIX.md
7. **Open Source Discovery Agent** → OPEN_SOURCE_MEDICATION_ANALYZER_STACK.md
8. **UX Benchmark Agent** → MEDICATION_ANALYZER_UX_BENCHMARK.md

## Stage 3: Apply Research Findings
- Expand interaction rules in `medications_router.py`
- Expand neuromod rules in `medication-neuromod-rules.js`
- Add biomarker confound detection
- Add medication search functionality
- Wire into Evidence DB

## Stage 4: Tests
- Role gate mismatch test
- Fixture reset test
- Stale state test
- Safety wording audit

## Stage 5: Roadmap
- WORLD_CLASS_DEEPSYNAPS_MEDICATION_ANALYZER_ROADMAP.md
- Executive summary
- Button/action matrix
