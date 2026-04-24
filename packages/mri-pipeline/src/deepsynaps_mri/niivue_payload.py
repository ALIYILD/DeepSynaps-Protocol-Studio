"""
Helpers for building a NiiVue-friendly viewer payload from a DeepSynaps MRI case.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Literal, Sequence


StimModality = Literal["rtms", "tdcs", "tacs", "tps", "tfus", "personalised"]

MODALITY_RGBA: dict[StimModality, tuple[float, float, float, float]] = {
    "rtms": (1.00, 0.55, 0.00, 1.0),
    "tdcs": (1.00, 0.85, 0.00, 1.0),
    "tacs": (0.60, 0.80, 0.20, 1.0),
    "tps": (1.00, 0.00, 0.80, 1.0),
    "tfus": (0.00, 0.85, 1.00, 1.0),
    "personalised": (1.00, 0.10, 0.10, 1.0),
}


@dataclass
class StimTarget:
    name: str
    mni: tuple[float, float, float]
    modality: StimModality
    radius_mm: float = 4.0


@dataclass
class NiivueVolume:
    url: str
    colormap: str = "gray"
    opacity: float = 1.0
    cal_min: float | None = None
    cal_max: float | None = None


@dataclass
class NiivueMesh:
    url: str
    rgba255: tuple[int, int, int, int] = (120, 200, 255, 200)


@dataclass
class NiivuePayload:
    case_id: str
    base_volume: NiivueVolume
    overlays: list[NiivueVolume] = field(default_factory=list)
    meshes: list[NiivueMesh] = field(default_factory=list)
    points: list[dict] = field(default_factory=list)
    initial_view: Literal["multiplanar", "render"] = "multiplanar"

    def to_dict(self) -> dict:
        return {
            "case_id": self.case_id,
            "base_volume": asdict(self.base_volume),
            "overlays": [asdict(item) for item in self.overlays],
            "meshes": [asdict(item) for item in self.meshes],
            "points": self.points,
            "initial_view": self.initial_view,
        }


def build_payload(
    case_id: str,
    api_prefix: str,
    *,
    base_volume: Literal["t1", "t1_mni", "flair"] = "t1_mni",
    overlays: Sequence[tuple[str, str, float]] = (),
    bundles: Sequence[str] = (),
    targets: Sequence[StimTarget] = (),
) -> NiivuePayload:
    base = NiivueVolume(url=f"{api_prefix}/{case_id}/{base_volume}.nii.gz")

    overlay_volumes: list[NiivueVolume] = []
    for index, (filename, colormap, opacity) in enumerate(overlays):
        volume = NiivueVolume(
            url=f"{api_prefix}/{case_id}/{filename}",
            colormap=colormap,
            opacity=opacity,
        )
        if index == 0 and "stat" in filename.lower():
            volume.cal_min = 2.3
            volume.cal_max = 6.0
        overlay_volumes.append(volume)

    meshes = [NiivueMesh(url=f"{api_prefix}/{case_id}/bundles/{name}.trx") for name in bundles]

    points = []
    for target in targets:
        rgba = MODALITY_RGBA.get(target.modality, (1.0, 1.0, 1.0, 1.0))
        points.append(
            {
                "x": target.mni[0],
                "y": target.mni[1],
                "z": target.mni[2],
                "label": target.name,
                "rgba": list(rgba),
                "radius_mm": target.radius_mm,
                "modality": target.modality,
            }
        )

    return NiivuePayload(
        case_id=case_id,
        base_volume=base,
        overlays=overlay_volumes,
        meshes=meshes,
        points=points,
    )
