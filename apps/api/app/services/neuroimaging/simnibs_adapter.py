"""Phase 3 SimNIBS shell-out adapter.

SimNIBS is GPL-3.0 and is intentionally NOT a Python dependency of this
package (which is MIT-licensed). Adding it as a `pip` dep would create a
combined work and force the API to be GPL too. Instead, we probe for the
`simnibs_python` CLI binary on PATH and shell out to it for a version
check. The actual e-field simulation is out of scope for this Phase 3
service surface (CLI invocation is a future tracked item) — this module
only exposes the probe + minimal head-model summary.

All public callers receive `ImportError` when the binary is missing, in
keeping with the project-wide HAS_<LIB> pattern.
"""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from .schemas import SimnibsHealth

# Name of the SimNIBS Python launcher binary. Installed by SimNIBS into
# either /usr/local/bin or the user's SimNIBS install directory.
_SIMNIBS_BIN = "simnibs_python"

# Timeout for any CLI probe. Kept short — the probe MUST be cheap because
# the /simnibs/health endpoint calls it inline on every hit.
_PROBE_TIMEOUT_SEC = 5.0


def _probe_simnibs_binary() -> str | None:
    """Return the resolved path of the SimNIBS CLI binary, or None."""
    return shutil.which(_SIMNIBS_BIN)


HAS_SIMNIBS: bool = _probe_simnibs_binary() is not None


def check_simnibs_version() -> SimnibsHealth:
    """Probe for the SimNIBS CLI binary and capture its version string.

    Cheap and side-effect-free — safe to call on every /simnibs/health hit.
    Never executes a long-running simulation; the worst case is a 5s
    subprocess timeout on a misbehaving binary.
    """
    bin_path = _probe_simnibs_binary()
    if bin_path is None:
        return SimnibsHealth(available=False, version=None)

    try:
        result = subprocess.run(
            [bin_path, "--version"],
            capture_output=True,
            text=True,
            timeout=_PROBE_TIMEOUT_SEC,
            check=False,
        )
    except (subprocess.TimeoutExpired, OSError):
        # Binary is on PATH but uncooperative — report available=True so
        # operators know the install exists; leave version blank.
        return SimnibsHealth(available=True, version=None)

    raw = (result.stdout or result.stderr or "").strip()
    version = raw.splitlines()[0].strip() if raw else None
    return SimnibsHealth(available=True, version=version or None)


def head_model_summary(t1_mri_path: str | Path) -> dict:
    """Stub: would return a head-model summary by shelling out to SimNIBS.

    Phase 3 explicitly scopes out long-running e-field simulations. This
    function exists so callers can be wired up; when the binary is absent
    it raises ImportError just like the other HAS_<LIB> guarded modules.
    """
    if not HAS_SIMNIBS:
        raise ImportError(
            "SimNIBS CLI (simnibs_python) is not installed on PATH"
        )
    # Real implementation will shell out to `simnibs_python charm ...` and
    # parse the output; out of scope for Phase 3 (tracked as a future item
    # in docs/DeepSynaps_OpenSource_Neurotech_Architecture.md).
    return {
        "t1_path": str(t1_mri_path),
        "note": (
            "head_model_summary is a stub in Phase 3; real e-field sim is "
            "tracked as a follow-up."
        ),
    }
