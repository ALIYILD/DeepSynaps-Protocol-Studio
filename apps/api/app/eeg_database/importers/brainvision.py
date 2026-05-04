"""BrainVision (.vhdr/.vmrk/.eeg) — stub until wired to MNE read_raw_brainvision."""

from __future__ import annotations


def supported() -> bool:
    return False


def inspect_brainvision_folder(_dir_path: str) -> dict:
    raise NotImplementedError("BrainVision import — use MNE read_raw_brainvision (planned)")
