## DeepSynaps Feature Store (Layer 2)

This package scaffolds the DeepSynaps Layer 2 Feature Store, sitting between the Kafka event bus and encoders/models.

Included:

- `src/deepsynaps_features/definitions/`: Feast entities + FeatureViews/StreamFeatureViews (stubs)
- `src/deepsynaps_features/transforms/`: batch + online feature computation contracts
- `src/deepsynaps_features/streaming/workers.py`: Faust wiring + Redis write stubs
- `src/deepsynaps_features/serve.py`: Redis-backed feature retrieval function
- `feature_repo/`: Feast repository skeleton
- `tests/`: test outlines (no infra required)

