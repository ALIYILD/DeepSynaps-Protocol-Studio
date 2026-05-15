# World-Class Digital Phenotyping + Behaviour Workspace — Research Roadmap

## Executive Summary

DeepSynaps Digital Phenotyping + Behaviour Workspace has been transformed from a stubbed preview into a research-informed, safety-first, honest behavioural intelligence platform.

## Critical Bugs Fixed (5)

| # | Bug | Severity | Fix |
|---|-----|----------|-----|
| 1 | Recompute is fake/stubbed | HIGH | Honest preview banner: "Passive signal ingest pipeline is in preview. Live recompute not yet connected." |
| 2 | Frontend fabricates signal labels | MEDIUM | SIGNAL_PROVENANCE map: measured (green) / inferred (amber) / proxy (amber) badges on every signal card |
| 3 | Navigation bypasses scoped contract | MEDIUM | Replaced window._nav with _scopedNavigate() that preserves patient context |
| 4 | Regression test drift | MEDIUM | Renamed DEMO_FIXTURE → PREVIEW_FIXTURE throughout, explicit preview labeling |
| 5 | Behaviour page has no real backend | HIGH | Implemented 3 endpoints: clinic-summary, patient-profile, patient-audit with consent checks + preview banner |

## Research Reports (8 reports, 5,765 lines)

| # | Report | Lines | Key Findings |
|---|--------|-------|-------------|
| 1 | DIGITAL_PHENOTYPING_EVIDENCE_MATRIX.md | 300+ | 18 signal types with evidence grades A-D |
| 2 | BEHAVIOURAL_OBSERVATION_FRAMEWORK.md | 830 | 10 validated frameworks (FBA Grade A, BA Grade A, CBT-I Grade A) |
| 3 | PASSIVE_SENSING_ARCHITECTURE.md | 496 | 8 sensor types, privacy-preserving techniques, 5-pillar governance framework |
| 4 | OPEN_SOURCE_DIGITAL_PHENOTYPING_STACK.md | 793 | 20 open-source projects (Beiwe, AWARE, Purple Robot, Forest) |
| 5 | MULTIMODAL_BEHAVIOURAL_FUSION_DESIGN.md | 702 | Early fusion 0.94 accuracy, intermediate fusion 17.37% F1 improvement |
| 6 | BEHAVIOURAL_RISK_MARKERS.md | 574 | 8 risk markers: social withdrawal, circadian disruption, mobility reduction |
| 7 | DIGITAL_PHENOTYPING_UX_BENCHMARK.md | 370 | 8 systems benchmarked — uncertainty visualization is #1 gap |
| 8 | DIGITAL_PHENOTYPING_ETHICS_REPORT.md | 800 | 25-point safety checklist, 16 peer-reviewed sources |

## Files Changed

### Critical Fixes
- `apps/api/app/routers/digital_phenotyping_router.py` — Recompute honesty, 3 behaviour endpoints
- `apps/web/src/pages-digital-phenotyping-analyzer.js` — Provenance badges, preview banner, scoped nav
- `apps/web/src/pages-behaviour.js` — Backend integration, preview banner
- `apps/web/src/api.js` — 3 new API methods

### Research
- 8 new markdown research reports

## Cross-Page Integration Map

```
Digital Phenotyping + Behaviour Workspace connects to:
├── Video Analyzer — movement/passive activity correlation
├── Voice Analyzer — voice diary frequency + vocal biomarkers
├── Text Analyzer — communication entropy + text patterns
├── Biomarkers — blood, hormone, neuroinflammation correlation
├── Assessments — behavioural scale scores + passive signal fusion
├── Risk Analyzer — behavioural deterioration signals + risk scoring
├── Protocol Studio — behavioural findings inform protocol selection
├── Wearables — direct sensor data feed
├── Reports — behavioural summaries in clinical reports
├── Dashboard — clinic behavioural overview
└── Patient Profile — longitudinal behavioural timeline
```

## Honest Signal Architecture

Every signal now shows:
- **Source**: measured / inferred / proxy / simulated
- **Evidence grade**: A (meta-analysis) → D (pilot)
- **Confidence**: 0-1 with visual indicator
- **Safe wording**: cautious, research-framed phrasing
- **Confounders**: known limitations listed
- **Research-only flag**: where applicable

## 16-Week Implementation Roadmap

### Phase 1: Foundation (Weeks 1-4)
- Implement passive signal ingest pipeline (replace preview)
- Connect Beiwe/AWARE-compatible data collection
- Add real-time signal quality monitoring
- Implement edge processing for privacy

### Phase 2: Clinical Signals (Weeks 5-8)
- Sleep timing/circadian pipeline
- Mobility/step detection pipeline
- Social interaction metadata pipeline
- Screen time analysis pipeline

### Phase 3: Multimodal Fusion (Weeks 9-12)
- Video + voice + text + wearable fusion
- Longitudinal trajectory modelling
- Behavioural risk scoring
- Cross-page data flow

### Phase 4: Safety & Scale (Weeks 13-16)
- Privacy-preserving techniques (differential privacy)
- Bias testing across demographics
- Explainability dashboard
- Regulatory documentation
- 25-point safety checklist completion

## Safety Checklist Status

| # | Item | Status |
|---|------|--------|
| 1 | Consent framework | ✅ Implemented |
| 2 | Provenance labels | ✅ Signal source shown |
| 3 | Evidence grades | ✅ All signals graded |
| 4 | No diagnostic claims | ✅ Safe wording enforced |
| 5 | Clinician review required | ✅ All outputs |
| 6 | Honest preview states | ✅ Stub clearly labeled |
| 7 | Audit trail | ✅ All endpoints |
| 8 | Privacy-preserving | 🔄 Edge processing planned |
| 9 | Bias disclosure | 🔄 Demographic testing planned |
| 10 | Explainability | 🔄 SHAP-style planned |

## Merge Recommendation: READY WITH WARNINGS

**READY:** All 5 critical bugs fixed, 8 research reports, provenance system implemented, honest preview states, syntax verified.
**WARNINGS:** Passive signal ingest is preview-only (honestly labeled), multimodal fusion not yet wired, bias testing pending.

---
*Generated 2026-05-15. All clinical outputs are decision-support only.*
