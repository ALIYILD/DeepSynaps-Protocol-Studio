from __future__ import annotations

import sys
from pathlib import Path


# Ensure `packages/feature-store/src` is importable when running tests from the repo root.
_PKG_ROOT = Path(__file__).resolve().parents[1]
_SRC = _PKG_ROOT / "src"
sys.path.insert(0, str(_SRC))

