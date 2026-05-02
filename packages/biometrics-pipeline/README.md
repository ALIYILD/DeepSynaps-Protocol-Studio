# deepsynaps-biometrics-pipeline

Normalized biometric schemas, ingestion helpers, and MVP analytics (correlation, baseline, rule-based alerts) for DeepSynaps Studio.

- **Not a medical device** — decision support and remote monitoring only; clinician review required.
- **MVP scope** — complements existing `apps/api` wearable routes (`/api/v1/wearables`, `/api/v1/device-sync`, patient portal) and the **`/api/biometrics`** analytics façade (summary, features, correlations, z-score **PredictiveAlert** — separate from triage `WearableAlertFlag`).
- **DR / AI analytics** — safe to pipe correlation matrices and feature payloads into RAG or dashboards; keep disclaimers on correlation vs causation; causal endpoint remains experimental (P1).

```bash
pip install -e ./packages/biometrics-pipeline
pytest packages/biometrics-pipeline/tests
```
