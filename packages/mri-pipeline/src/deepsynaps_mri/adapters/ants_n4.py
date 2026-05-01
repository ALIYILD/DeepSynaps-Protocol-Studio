"""
ANTs N4 bias field correction via ``antspyx`` (no separate ANTs CLI required).

Isolated from :mod:`registration` so preprocessing can run without pulling
registration transforms into the same module.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class N4Availability:
    available: bool
    reason: str = ""


def n4_available() -> N4Availability:
    try:
        import ants  # noqa: F401

        return N4Availability(available=True)
    except Exception as exc:  # noqa: BLE001
        return N4Availability(available=False, reason=str(exc))


@dataclass
class N4RunResult:
    ok: bool
    output_path: Path | None
    code: str = ""
    message: str = ""
    log_text: str = ""

    def to_dict(self) -> dict:
        return {
            "ok": self.ok,
            "output_path": str(self.output_path) if self.output_path else None,
            "code": self.code,
            "message": self.message,
        }


def run_n4_bias_correction(
    image_path: str | Path,
    output_path: str | Path,
    *,
    mask_path: str | Path | None = None,
    shrink_factor: int = 4,
    convergence_tol: float = 1e-7,
    noise_sigma: float = 0.01,
    log_path: Path | None = None,
) -> N4RunResult:
    """
    Run ``ants.n4_bias_field_correction`` on a scalar 3D/4D NIfTI.

    Writes corrected image to ``output_path`` (``.nii.gz`` recommended).

    Parameters
    ----------
    mask_path
        Optional binary mask (same grid as ``image_path``); improves stability.
    shrink_factor
        ANTs shrink factor for speed (typical 2–4).
    """
    av = n4_available()
    if not av.available:
        return N4RunResult(
            ok=False,
            output_path=None,
            code="antspyx_missing",
            message=f"antspyx not importable: {av.reason}",
        )

    import ants

    inp = Path(image_path).resolve()
    out = Path(output_path).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)

    log_lines: list[str] = []
    try:
        img = ants.image_read(str(inp))
        mask_img = None
        if mask_path is not None:
            mp = Path(mask_path).resolve()
            if mp.exists():
                mask_img = ants.image_read(str(mp))

        corrected = ants.n4_bias_field_correction(
            img,
            mask_img,
            shrink_factor=shrink_factor,
            convergence={"iters": [50, 50, 30, 20], "tol": float(convergence_tol)},
            spline_param=200,
            verbose=False,
        )
        _ = noise_sigma  # reserved for future noise-model tuning

        ants.image_write(corrected, str(out))
        log_lines.append(f"wrote {out}")
        ok_msg = "ok"
        result = N4RunResult(ok=True, output_path=out, message=ok_msg, log_text="\n".join(log_lines))
    except Exception as exc:  # noqa: BLE001
        log.exception("N4 correction failed")
        log_lines.append(str(exc))
        result = N4RunResult(
            ok=False,
            output_path=None,
            code="n4_failed",
            message=str(exc),
            log_text="\n".join(log_lines),
        )

    if log_path:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        log_path.write_text(result.log_text or result.message, encoding="utf-8")

    return result


__all__ = ["N4Availability", "n4_available", "N4RunResult", "run_n4_bias_correction"]
