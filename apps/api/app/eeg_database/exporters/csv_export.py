"""CSV export — channels × samples via MNE (loads full recording)."""

from __future__ import annotations

import csv
import io
import os
import tempfile


def edf_to_csv_bytes(raw_storage_key: str, read_fn) -> bytes:
    """*read_fn* maps storage key → raw bytes (injected for testing)."""
    try:
        import mne
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError("MNE required") from exc

    data = read_fn(raw_storage_key)
    fd, path = tempfile.mkstemp(suffix=".edf")
    os.close(fd)
    try:
        with open(path, "wb") as fh:
            fh.write(data)
        raw = mne.io.read_raw_edf(path, preload=True, verbose=False)
        arr = raw.get_data()
        times = raw.times
        ch_names = raw.ch_names
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["time_s"] + list(ch_names))
        for i in range(arr.shape[1]):
            w.writerow([f"{times[i]:.6f}"] + [f"{arr[j, i]:.8f}" for j in range(arr.shape[0])])
        return buf.getvalue().encode("utf-8")
    finally:
        try:
            os.remove(path)
        except OSError:
            pass
