"""
ANTs KellyKapowski (DiReCT) cortical thickness — ``antspyx`` wrapper.

Subprocess-free; runs in-process when ``antspyx`` is installed. Logs duration
and parameters for audit trails.
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from pathlib import Path

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class KellyKapowskiRunResult:
    ok: bool
    output_path: Path | None
    its: int
    gm_label: int
    wm_label: int
    runtime_sec: float
    log_text: str
    code: str = ""
    message: str = ""

    def to_dict(self) -> dict:
        return {
            "ok": self.ok,
            "output_path": str(self.output_path) if self.output_path else None,
            "its": self.its,
            "gm_label": self.gm_label,
            "wm_label": self.wm_label,
            "runtime_sec": self.runtime_sec,
            "code": self.code,
            "message": self.message,
        }


def kelly_kapowski_available() -> bool:
    try:
        import ants  # noqa: F401

        return hasattr(ants, "kelly_kapowski")
    except Exception:  # noqa: BLE001
        return False


def run_kelly_kapowski_thickness(
    seg_path: str | Path,
    gm_prob_path: str | Path,
    wm_prob_path: str | Path,
    output_path: str | Path,
    *,
    its: int = 45,
    gm_label: int = 2,
    wm_label: int = 3,
    log_path: Path | None = None,
) -> KellyKapowskiRunResult:
    """
    Run ``ants.kelly_kapowski`` (DiReCT) and write thickness map to NIfTI.

    Parameters
    ----------
    seg_path
        Multi-label segmentation (same grid as PVE maps). GM/WM labels must
        match ``gm_label`` / ``wm_label`` (DeepSynaps FAST convention: 2=GM, 3=WM).
    gm_prob_path, wm_prob_path
        GM and WM probability maps (e.g. FAST PVEs).
    """
    t0 = time.perf_counter()
    lines: list[str] = []

    try:
        import ants
    except ImportError as exc:
        msg = str(exc)
        if log_path:
            log_path.parent.mkdir(parents=True, exist_ok=True)
            log_path.write_text(msg, encoding="utf-8")
        return KellyKapowskiRunResult(
            ok=False,
            output_path=None,
            its=its,
            gm_label=gm_label,
            wm_label=wm_label,
            runtime_sec=0.0,
            log_text=msg,
            code="antspyx_missing",
            message=msg,
        )

    sp = Path(seg_path).resolve()
    gp = Path(gm_prob_path).resolve()
    wp = Path(wm_prob_path).resolve()
    out = Path(output_path).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)

    for p, label in ((sp, "seg"), (gp, "gm"), (wp, "wm")):
        if not p.is_file():
            msg = f"Missing {label}: {p}"
            lines.append(msg)
            if log_path:
                log_path.write_text("\n".join(lines), encoding="utf-8")
            return KellyKapowskiRunResult(
                ok=False,
                output_path=None,
                its=its,
                gm_label=gm_label,
                wm_label=wm_label,
                runtime_sec=time.perf_counter() - t0,
                log_text="\n".join(lines),
                code="input_missing",
                message=msg,
            )

    try:
        s = ants.image_read(str(sp))
        g = ants.image_read(str(gp))
        w = ants.image_read(str(wp))
        lines.append(
            f"kelly_kapowski its={its} gm_label={gm_label} wm_label={wm_label} "
            f"seg={sp} gm={gp} wm={wp}"
        )
        log.info("ANTs KellyKapowski starting: %s", lines[-1])
        thick = ants.kelly_kapowski(
            s=s,
            g=g,
            w=w,
            its=its,
            gm_label=gm_label,
            wm_label=wm_label,
        )
        ants.image_write(thick, str(out))
        lines.append(f"wrote {out}")
        elapsed = time.perf_counter() - t0
        result = KellyKapowskiRunResult(
            ok=True,
            output_path=out,
            its=its,
            gm_label=gm_label,
            wm_label=wm_label,
            runtime_sec=elapsed,
            log_text="\n".join(lines),
            message="ok",
        )
    except Exception as exc:  # noqa: BLE001
        log.exception("KellyKapowski failed")
        lines.append(str(exc))
        elapsed = time.perf_counter() - t0
        result = KellyKapowskiRunResult(
            ok=False,
            output_path=None,
            its=its,
            gm_label=gm_label,
            wm_label=wm_label,
            runtime_sec=elapsed,
            log_text="\n".join(lines),
            code="kelly_kapowski_failed",
            message=str(exc),
        )

    if log_path:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        log_path.write_text(result.log_text, encoding="utf-8")

    return result


__all__ = [
    "KellyKapowskiRunResult",
    "kelly_kapowski_available",
    "run_kelly_kapowski_thickness",
]
