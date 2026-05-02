# DeepSynaps Video Analyzer

Healthcare video analysis package for DeepSynaps patient movement assessment and
continuous patient monitoring.

The current implementation provides the ingestion layer:

- register patient videos from disk paths or uploaded bytes
- extract JSON-friendly video metadata
- normalize analysis-ready video proxies through an injectable backend
- sample representative frames for downstream pose/QC workflows

Heavy CV dependencies are optional. Default tests use fake backends and do not
require FFmpeg, OpenCV, GPU libraries, webcams, or model downloads.

See:

- `AGENTS.md` for coding and safety rules for future agents.
- `docs/VIDEO_ANALYZER.md` for the architecture.
- `docs/IMPLEMENTATION_TICKETS.md` for the implementation backlog.
