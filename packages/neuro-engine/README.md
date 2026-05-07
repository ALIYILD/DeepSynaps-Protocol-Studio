# DeepSynaps Neuro Engine

DeepSynaps Neuro Engine is a Python 3.11 neuroimaging scaffold for structural and functional MRI workflows inside the DeepSynaps platform. The package exposes a programmatic facade, utility wrappers for common neuroimaging tools, and a FastAPI service layer.

## Layout

```text
packages/neuro-engine/
├── Dockerfile
├── README.md
├── pyproject.toml
├── requirements.txt
├── src/
│   └── deepsynaps/
│       └── neuro_engine/
│           ├── __init__.py
│           ├── api/
│           ├── config.py
│           ├── functional/
│           ├── models/
│           ├── preprocessing/
│           ├── structural/
│           └── utils/
└── tests/
    └── test_pipeline.py
```

## Installation

```bash
cd packages/neuro-engine
python3.11 -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

For a lightweight editable install that keeps the heavy neuro stack optional:

```bash
python -m pip install -e ".[dev]"
python -m pip install -e ".[api]"
python -m pip install -e ".[neuro]"
```

## Environment Variables

The package loads settings from environment variables via `NeuroEngineSettings`.

```bash
export DEEPSYNAPS_BIDS_ROOT=/data/bids
export DEEPSYNAPS_OUTPUT_ROOT=/data/output
export DEEPSYNAPS_WORK_ROOT=/data/work
export DEEPSYNAPS_MODELS_ROOT=/models
export DEEPSYNAPS_FMRIPREP_BINARY=fmriprep
export DEEPSYNAPS_FASTSURFER_BINARY=run_fastsurfer.sh
export DEEPSYNAPS_MODEL_DEVICE=cuda
export DEEPSYNAPS_API_HOST=0.0.0.0
export DEEPSYNAPS_API_PORT=8000
```

## Python Usage

```python
from pathlib import Path

from deepsynaps.neuro_engine import NeuroEngine

engine = NeuroEngine()
summary = engine.run_pipeline(
    subject_id="sub-01",
    bids_root=Path("/data/bids"),
    output_root=Path("/data/output"),
    execute=False,
)
print(summary.model_dump())
```

## API Startup

```bash
cd packages/neuro-engine
uvicorn deepsynaps.neuro_engine.api.routes:create_app --factory --host 0.0.0.0 --port 8000
```

Exposed endpoints:

- `GET /health`
- `POST /validate-bids`
- `POST /convert-dicom`
- `POST /preprocess`
- `POST /structural`
- `POST /functional/connectivity`
- `POST /segmentation/model`

## Running Tests

```bash
cd packages/neuro-engine
python -m pytest
```

## Notes

- The package keeps execution wrappers explicit and safe: dry-runs return the exact fMRIPrep and FastSurfer commands without assuming those tools are installed.
- Functional connectivity uses Nilearn, and model loading uses MONAI plus TorchIO when the scientific stack is installed.
- The DICOM converter implements a straightforward slice-stack conversion for standard axial series using `pydicom`, `numpy`, and `nibabel`.
- `pyproject.toml` keeps the base install intentionally dependency-light for monorepo integration; API deps live under the `api` extra, and the full scientific stack is pinned in `requirements.txt` and the `neuro` extra.
