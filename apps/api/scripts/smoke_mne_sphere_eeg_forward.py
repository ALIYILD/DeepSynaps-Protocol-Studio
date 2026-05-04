"""
Smoke test: MNE sphere BEM + volume source space + EEG forward (no large download
if MNE-sample-data is already in ~/mne_data).

The one-off failure was a wrong FIF path: raw lives under MEG/sample/, not MEG/.
Run:  python scripts/smoke_mne_sphere_eeg_forward.py
"""
from __future__ import annotations

import sys

import mne
from mne.datasets import sample


def main() -> int:
    p = sample.data_path()
    # Correct layout: .../MNE-sample-data/MEG/sample/sample_audvis_raw.fif
    raw_path = p / "MEG" / "sample" / "sample_audvis_raw.fif"
    if not raw_path.is_file():
        print(f"Missing: {raw_path}", file=sys.stderr)
        return 1

    raw = mne.io.read_raw_fif(raw_path, preload=False, verbose=False)
    raw.pick_types(eeg=True)
    if raw.info["nchan"] < 1:
        print("No EEG channels in sample raw.", file=sys.stderr)
        return 1
    raw.load_data()
    info = raw.info
    sphere = mne.make_sphere_model(info=info)
    src = mne.setup_volume_source_space(
        subject=None,
        pos=25.0,
        sphere=(0.0, 0.0, 0.0, 90.0),
        sphere_units="mm",
        verbose=False,
    )
    fwd = mne.make_forward_solution(
        info, trans=None, src=src, bem=sphere, meg=False, eeg=True, verbose=False
    )
    print("ok", fwd)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
