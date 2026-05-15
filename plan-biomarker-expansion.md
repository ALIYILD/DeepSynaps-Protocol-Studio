# Biomarker Expansion Plan

## Stage 1: Research (4 agents, parallel)
- Research blood/lab biomarkers with evidence grades and reference ranges
- Research neuroinflammation markers (NfL, GFAP, S100B, tau)
- Research hormone/endocrine markers (thyroid, cortisol, sex hormones)
- Research immune/inflammation + nutritional/metabolic markers

## Stage 2: Data + Frontend (4 agents, parallel with Stage 1)
- Create BLOOD_NEUROINFLAMMATION_HORMONE_BIOMARKER_MATRIX.md
- Create lab-biomarker-data.js with all biomarker definitions
- Add 6 new tabs to pages-biomarkers.js
- Create biomarker backend router

## Stage 3: Tests + Integration
- Add tests for new tabs
- Wire into evidence DB
- Final validation

## Tab Structure (9 total)
1. QEEG Neuromarkers (existing)
2. MRI Neuromarkers (existing)
3. Blood & Labs (NEW)
4. Neuroinflammation (NEW)
5. Hormones / Endocrine (NEW)
6. Immune / Inflammation (NEW)
7. Nutritional / Metabolic (NEW)
8. Research-only Markers (NEW)
9. Patient Workspace (existing)
