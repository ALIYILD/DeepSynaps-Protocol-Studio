# 16-Week Roadmap Implementation Plan

## Wave 1 — Foundation + Signal Pipelines (Phases 1-2)
- Signal ingest pipeline (replace preview/stub)
- Sleep/circadian pipeline
- Mobility/step pipeline
- Social interaction pipeline
- Screen time pipeline

## Wave 2 — Multimodal Fusion (Phase 3) ← KEY FOCUS
- Fusion engine: video + voice + text + wearable + biomarker + assessment
- Longitudinal trajectory modelling
- Cross-page data wiring
- Unified patient behavioural timeline

## Wave 3 — Frontend + Safety (Phases 3-4)
- Realized dashboard (replace preview banners)
- Bias testing framework
- Explainability dashboard
- Final integration tests

## Multimodal Fusion Contract (shared)
```json
{
  "patient_id": "...",
  "fusion_id": "...",
  "timestamp": "2026-05-15T10:00:00Z",
  "modalities": {
    "video": {"gait_speed": 1.1, "tremor_freq": 5.2, "confidence": 0.85},
    "voice": {"cpp": 12.5, "speech_rate": 120, "confidence": 0.78},
    "text": {"sentiment": -0.3, "clinical_entities": [...], "confidence": 0.82},
    "wearable": {"steps": 4500, "sleep_hours": 6.2, "confidence": 0.90},
    "biomarker": {"ferritin": 8.5, "vitamin_d": 18, "confidence": 0.75},
    "assessment": {"phq9": 14, "gad7": 12, "confidence": 0.95},
    "digital_phenotyping": {"circadian_regularity": 0.65, "mobility_radius": 2.1, "confidence": 0.70}
  },
  "fusion_score": 0.82,
  "trajectory": "stable_with_concern",
  "risk_flags": ["low_mood_multimodal", "reduced_activity"],
  "evidence_summary": "...",
  "safe_clinical_summary": "..."
}
```
