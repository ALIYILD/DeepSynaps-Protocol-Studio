from __future__ import annotations

import hashlib
import json
from typing import Any


class ProvenanceTracker:
    """Hashes non-PHI audit envelopes for dry-run and future live inference."""

    def build_audit_hash(self, payload: dict[str, Any]) -> str:
        canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
