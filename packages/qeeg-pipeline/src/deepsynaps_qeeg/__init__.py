"""DeepSynaps qEEG Analyzer package."""

__version__ = "0.1.0"

FREQ_BANDS = {
    "delta": (1.0, 4.0),
    "theta": (4.0, 8.0),
    "alpha": (8.0, 13.0),
    "beta":  (13.0, 30.0),
    "gamma": (30.0, 45.0),
}

EPOCH_LENGTH_SEC = 2.0
EPOCH_OVERLAP = 0.5
RESAMPLE_SFREQ = 250.0
BANDPASS = (1.0, 45.0)
NOTCH_HZ = 50.0  # UK default; override to 60 in regions where needed
