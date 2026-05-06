"""Gated demo clinic seeding — DB writes only when explicitly enabled.

Environment (both required):

- ``DEEPSYNAPS_APP_ENV`` ∈ ``development`` | ``test``
- ``DEEPSYNAPS_DEMO_CLINIC_SEED=1``

Production/staging defaults must **not** seed synthetic patients without these flags.
See ``docs/patients-hub-live-readiness.md``.
"""
from __future__ import annotations

import os


def demo_seed_env_ok() -> bool:
    env = (os.getenv("DEEPSYNAPS_APP_ENV") or "").strip().lower()
    if env not in ("development", "test"):
        return False
    return os.getenv("DEEPSYNAPS_DEMO_CLINIC_SEED") == "1"
