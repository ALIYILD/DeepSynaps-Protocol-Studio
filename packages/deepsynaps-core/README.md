# DeepSynaps Core

The integration layer that makes the seven DeepSynaps subsystems compound
into one product instead of seven silos.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full design. Quick map:

```
src/deepsynaps_core/
  timeline.py     PatientEvent schema + from_* constructors  (the source of truth)
  features.py     FeatureStore contract                      (z-scored queries)
  risk_engine.py  v0 transparent logistic regression          (crisis scoring)
  agent_bus.py    OpenClawBus orchestrator + safety gate     (Dr. OpenClaw)

migrations/
  01_patient_events.sql   runs after existing qEEG/MRI/MedRAG migrations
```

## Build order

1. Apply `migrations/01_patient_events.sql` against the existing DeepSynaps Postgres.
2. Wire the existing qEEG + MRI analyzer save paths to also emit
   `timeline.from_qeeg_report(...)` / `from_mri_report(...)`. ~10 lines each.
3. Stand up a Celery consumer that listens for new events and writes
   derived features to `patient_features`.
4. Point the dashboard "Patient 360" view at the Core API only.

Each step ships value alone.
