# Intervention Analyzer Transformation — Execution Plan

## Stage 1: File Reading + Analysis (me)
- Read all primary files to understand current state
- Identify exact lines for each bug fix
- Map rename scope ( Treatment Sessions → Intervention )

## Stage 2: Bug Fixes + Rename (Parallel)
### A. Frontend Agent
- Fix role gate: remove reviewer, technician, resident
- Rename all UI labels Treatment Sessions → Intervention
- Fix predictive language (response prediction → association review)
- Fix placeholder response labels (_response_label heuristic)
- Rename file: pages-treatment-sessions-analyzer.js → pages-intervention-analyzer.js

### B. Backend Agent
- Rename service: treatment_sessions_analyzer.py → intervention_analyzer.py
- Rename router functions and payload builders
- Add intervention type enum (TMS, tDCS, tACS, tRNS, taVNS, TPS, PBM, neurofeedback, medication, psychotherapy, OT, SLT, physiotherapy, digital_therapeutics, sleep, nutrition, exercise, lifestyle, accommodations, multimodal)
- Fix honest analytics states (no_calibrated_model, descriptive only)
- Add batch clinic summary endpoint to reduce N+1 fan-out

### C. Test Agent
- Rename test files
- Add role gate alignment tests
- Add no-causal-overclaim tests
- Add clinic summary performance tests
- Add intervention type coverage tests

## Stage 3: Research Swarm (6 agents, parallel)
1. Intervention Evidence Agent → INTERVENTION_EVIDENCE_MATRIX.md
2. Causality & Correlation Agent → INTERVENTION_CAUSALITY_ANALYSIS_DESIGN.md
3. Multimodal Outcome Agent → MULTIMODAL_INTERVENTION_OUTCOME_MAP.md
4. Open Source Discovery Agent → OPEN_SOURCE_INTERVENTION_ANALYZER_STACK.md
5. UX Benchmark Agent → INTERVENTION_ANALYZER_UX_BENCHMARK.md
6. AI Safety Agent → INTERVENTION_ANALYZER_SAFETY_COPY.md

## Stage 4: Apply Research Findings
- Expand contributor cards based on research
- Add causality-safe language patterns
- Add evidence-linked recommendations
- Add multimodal correlation panels

## Stage 5: Roadmap + Final Report
- WORLD_CLASS_DEEPSYNAPS_INTERVENTION_ANALYZER_ROADMAP.md
- Button/action matrix
- Executive summary
- Commit + push
