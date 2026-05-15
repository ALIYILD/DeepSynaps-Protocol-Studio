# Research Findings → Code Implementation Plan

## TEXT ANALYZER — Research Items to Apply Now

### 1. Expand Neuromodulation Entity Patterns (heuristic.py)
Research found specific entities missing from our regex patterns. Add:
- **Stimulation types**: tPCS, GVS, TUS, dTMS (deep TMS)
- **Outcome measures**: IDS-SR, QIDS-SR, OCI-R, CY-BOCS, UPDRS-IV, H&Y staging, S&E, Engel class, ILAE, TRS, BFMDRS, TWSTRS, MoCA, MMSE, TMT, DSST, COWA, SF-36, EQ-5D, PDQ-39
- **Adverse events**: erythema, tingling, convulsion, status epilepticus
- **Devices**: LivaNova, MagPro, DuoMAG, Yiruide, STIMULUS
- **Montages**: More comprehensive EEG 10-20 positions

### 2. Enhanced Negation & Uncertainty Detection (heuristic.py)
Research recommends MedSpaCy ConText algorithm. Apply to our `_is_negated()`:
- Add uncertainty cues (possible, probable, suspected, may represent)
- Add family history cues (FHx, family history of)
- Add temporality cues (history of, previous, former)
- Separate negation from uncertainty in entity confidence scoring

### 3. Stimulation Parameter Structured Extraction (NEW endpoint)
Research provides specific regex for: frequency (Hz), intensity (mA, %RMT, %MSO), duration, pulses, montage. Add `extract-parameters` endpoint that returns structured parameters.

### 4. Outcome Measure Interpretation Hints
When outcome scales are detected, show response/remission criteria from the research dictionary.

### 5. Adverse Event Severity Classification
When AEs are detected, classify by severity (mild/moderate/severe/serious/life-threatening) and show reporting requirements.

---

## VOICE ANALYZER — Research Items to Apply Now

### 1. Evidence-Graded Flag System
Show evidence grade (A/B/C/D) alongside each acoustic metric based on the research matrix.

### 2. Condition-Specific Feature Cards
Add cards for Depression, Parkinson's, Alzheimer's, Schizophrenia, Anxiety with their specific acoustic markers and what the research found.

### 3. Sex-Specific Stratification
Account for patient sex when interpreting voice biomarkers (research shows significant sex differences).

### 4. Critical Safety Disclaimers
- Suicide prediction from voice NOT clinically validated (AUC 0.62-0.67)
- No voice biomarker is FDA-approved for diagnosis
- All outputs require clinician oversight

### 5. Overclaim Prevention
- Don't claim F0 reliably discriminates depression (NS in meta-analysis)
- Highlight CPP as strongest depression signal
- Note jitter/shimmer/HNR inconsistency in depression literature
