"""ICA fit on epoched EEG — IC topographies and time courses."""

from __future__ import annotations

from typing import Any

import numpy as np


def fit_ica_on_epochs(epochs: Any, *, n_components: int = 15, random_state: int = 42) -> dict[str, Any]:
    import mne
    from mne.preprocessing import ICA

    n_comp = min(n_components, len(epochs.ch_names))
    ica = ICA(n_components=n_comp, random_state=random_state, max_iter=400, verbose=False)
    ica.fit(epochs)
    mixing = ica.mixing_matrix_
    maps = ica.get_components()  # (n_ch, n_comp)

    src_epochs = ica.get_sources(epochs)
    src_ev = src_epochs.average()
    sources = src_ev.data * 1e6

    return {
        "nComponents": n_comp,
        "mixingShape": list(np.asarray(mixing).shape),
        "topoMaps": np.asarray(maps).T.tolist(),
        "chNames": epochs.ch_names,
        "meanIcTimeseriesUv": sources.astype(np.float32).tolist(),
        "timesSec": epochs.times.tolist(),
    }


def ic_labels_placeholder(n_components: int) -> list[dict[str, Any]]:
    return [{"index": i, "label": "brain", "confidence": 0.5} for i in range(n_components)]
