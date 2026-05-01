from __future__ import annotations

import sys
from pathlib import Path


_PKG_ROOT = Path(__file__).resolve().parents[1]
_SRC = _PKG_ROOT / "src"
sys.path.insert(0, str(_SRC))
