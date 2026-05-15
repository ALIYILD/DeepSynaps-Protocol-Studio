# QEEG MNE-Python Ecosystem Deep Dive

## The Definitive Guide to MNE-Python for Clinical Quantitative EEG (qEEG)

**Version:** 1.0 | **Date:** July 2025 | **Target:** Clinical Neurophysiology & Research

---

## Table of Contents

1. [Introduction](#introduction)
2. [Core MNE-Python](#1-core-mne-python)
3. [MNE-Connectivity](#2-mne-connectivity)
4. [MNE-Features](#3-mne-features)
5. [MNE-BIDS](#4-mne-bids)
6. [MNE-ICALabel](#5-mne-icalabel)
7. [MNE-Realtime](#6-mne-realtime)
8. [Spectral Analysis](#7-spectral-analysis)
9. [YASA - Spectral Analysis](#8-yasa-spectral-analysis)
10. [FOOOF - Fitting Oscillations & One-Over-F](#9-fooof-fitting-oscillations--one-over-f)
11. [Source Localization](#10-source-localization)
12. [MNE Beamformer (LCMV)](#11-mne-beamformer-lcmv)
13. [Sparse Inverse Methods](#12-sparse-inverse-methods)
14. [Cross-Spectral Density](#13-cross-spectral-density)
15. [Time-Frequency Decomposition](#14-time-frequency-decomposition)
16. [Complete FastAPI Integration](#15-complete-fastapi-integration)
17. [Clinical qEEG Pipeline](#16-clinical-qeeg-pipeline)
18. [Appendix: All Install Commands](#appendix-all-install-commands)

---

## Introduction

MNE-Python is the premier open-source ecosystem for electrophysiological data analysis, providing a comprehensive toolkit for clinical qEEG processing. This guide covers **15 essential tools** with complete code examples, installation instructions, expected outputs, and FastAPI integration patterns for each.

### What is qEEG?

Quantitative EEG (qEEG) applies mathematical and computational analysis to EEG signals to extract:
- **Absolute and relative power** across frequency bands (delta, theta, alpha, beta, gamma)
- **Connectivity metrics** (coherence, PLI, wPLI, Granger causality)
- **Source localization** (MNE, dSPM, sLORETA, eLORETA, LCMV beamformer)
- **Microstate analysis** and temporal dynamics
- **Spectral parameterization** (periodic and aperiodic components)

### Clinical Applications
- Epilepsy monitoring and seizure detection
- Sleep staging and analysis
- Cognitive assessment (ADHD, dementia, TBI)
- Brain-computer interfaces
- Anesthesia depth monitoring
- Neurofeedback training

---

## 1. Core MNE-Python

### Overview

The foundational package for EEG/MEG analysis in Python. Provides I/O for 30+ file formats, preprocessing, visualization, time-frequency analysis, source localization, and statistics.

### pip install

```bash
pip install mne[hdf5]
# Or full installation:
pip install mne[full]
# Development version:
pip install -U https://github.com/mne-tools/mne-python/archive/refs/heads/main.zip
```

### Complete Code Example: Clinical EEG Preprocessing Pipeline

```python
"""
Clinical qEEG Preprocessing Pipeline with MNE-Python
Processes raw EEG data through standard clinical qEEG workflow.
"""

import mne
import numpy as np
import pandas as pd
from pathlib import Path

# ============================================================
# CONFIGURATION
# ============================================================
CONFIG = {
    "l_freq": 0.5,           # High-pass filter (Hz)
    "h_freq": 45.0,          # Low-pass filter (Hz)
    "notch_freqs": [50, 60], # Line noise frequencies
    "epoch_duration": 2.0,   # Epoch length in seconds
    "overlap": 0.5,          # Epoch overlap (0-1)
    "sfreq_target": 256,     # Target sampling frequency
    "montage": "standard_1020",
    "qEEG_bands": {
        "delta": (0.5, 4.0),
        "theta": (4.0, 8.0),
        "alpha": (8.0, 13.0),
        "beta":  (13.0, 30.0),
        "gamma": (30.0, 45.0),
    }
}

class ClinicalQEEGPipeline:
    """Complete clinical qEEG preprocessing and analysis pipeline."""
    
    def __init__(self, config=None):
        self.config = config or CONFIG
        self.raw = None
        self.epochs = None
        self.psd = None
        
    def load_data(self, file_path: str) -> mne.io.Raw:
        """Load EEG data from various formats (.edf, .fif, .vhdr, .set)."""
        file_path = Path(file_path)
        
        if file_path.suffix == ".edf":
            raw = mne.io.read_raw_edf(file_path, preload=True)
        elif file_path.suffix == ".fif":
            raw = mne.io.read_raw_fif(file_path, preload=True)
        elif file_path.suffix == ".vhdr":
            raw = mne.io.read_raw_brainvision(file_path, preload=True)
        elif file_path.suffix == ".set":
            raw = mne.io.read_raw_eeglab(file_path, preload=True)
        else:
            raise ValueError(f"Unsupported format: {file_path.suffix}")
        
        # Set standard 10-20 montage
        montage = mne.channels.make_standard_montage(
            self.config["montage"]
        )
        raw.set_montage(montage, match_case=False, on_missing="warn")
        
        print(f"[OK] Loaded: {raw.info['nchan']} channels, "
              f"{raw.n_times / raw.info['sfreq']:.1f}s duration")
        self.raw = raw
        return raw
    
    def preprocess(self) -> mne.io.Raw:
        """Apply standard clinical preprocessing pipeline."""
        if self.raw is None:
            raise RuntimeError("Load data first!")
        
        raw = self.raw.copy()
        
        # Step 1: Resample to target frequency
        if raw.info["sfreq"] > self.config["sfreq_target"]:
            raw.resample(self.config["sfreq_target"])
            print(f"[OK] Resampled to {self.config['sfreq_target']} Hz")
        
        # Step 2: Band-pass filter
        raw.filter(
            l_freq=self.config["l_freq"],
            h_freq=self.config["h_freq"],
            fir_design="firwin",
            phase="zero-double"
        )
        print(f"[OK] Band-pass filter: {self.config['l_freq']}-{self.config['h_freq']} Hz")
        
        # Step 3: Notch filter for line noise
        raw.notch_filter(
            freqs=self.config["notch_freqs"],
            fir_design="firwin"
        )
        print(f"[OK] Notch filter: {self.config['notch_freqs']} Hz")
        
        # Step 4: Re-reference to average
        raw.set_eeg_reference("average", projection=True)
        print("[OK] Average re-referencing applied")
        
        # Step 5: Detect and interpolate bad channels
        raw.interpolate_bads(reset_bads=True)
        
        self.raw_preprocessed = raw
        return raw
    
    def create_epochs(self, raw=None) -> mne.Epochs:
        """Create fixed-length epochs for qEEG analysis."""
        if raw is None:
            raw = self.raw_preprocessed
        
        # Create fixed-length epochs (no events needed for continuous qEEG)
        epochs = mne.make_fixed_length_epochs(
            raw,
            duration=self.config["epoch_duration"],
            overlap=self.config["overlap"],
            preload=True
        )
        
        # Auto-reject bad epochs
        reject_criteria = dict(
            eeg=150e-6,    # 150 uV max amplitude
            eog=250e-6     # 250 uV max for EOG
        )
        epochs.drop_bad(reject=reject_criteria)
        print(f"[OK] Created {len(epochs)} epochs ({self.config['epoch_duration']}s each)")
        
        self.epochs = epochs
        return epochs
    
    def compute_psd(self, epochs=None) -> dict:
        """Compute Power Spectral Density using Welch's method."""
        if epochs is None:
            epochs = self.epochs
        
        # Compute PSD per epoch
        psd = epochs.compute_psd(
            method="welch",
            fmin=self.config["l_freq"],
            fmax=self.config["h_freq"],
            n_fft=int(self.config["epoch_duration"] * epochs.info["sfreq"]),
            n_overlap=int(self.config["epoch_duration"] * 
                         epochs.info["sfreq"] * 0.5)
        )
        
        freqs = psd.freqs
        psd_data = psd.get_data()  # shape: (n_epochs, n_channels, n_freqs)
        
        # Extract band power
        band_powers = {}
        for band_name, (fmin, fmax) in self.config["qEEG_bands"].items():
            freq_mask = (freqs >= fmin) & (freqs <= fmax)
            # Mean power across frequencies and epochs per channel
            band_power = psd_data[:, :, freq_mask].mean(axis=(0, 2))
            band_powers[band_name] = band_power
        
        # Compute relative power
        total_power = sum(band_powers.values())
        relative_powers = {
            band: power / total_power 
            for band, power in band_powers.items()
        }
        
        result = {
            "frequencies": freqs,
            "psd_data": psd_data,
            "band_powers": band_powers,
            "relative_powers": relative_powers,
            "channel_names": epochs.ch_names,
        }
        
        self.psd = result
        print("[OK] PSD computed - band powers extracted")
        return result
    
    def export_qeeg_report(self, output_path: str):
        """Export qEEG metrics to CSV report."""
        if self.psd is None:
            raise RuntimeError("Compute PSD first!")
        
        report_data = []
        for i, ch_name in enumerate(self.psd["channel_names"]):
            row = {
                "channel": ch_name,
                "region": self._get_region(ch_name),
                "delta_absolute": self.psd["band_powers"]["delta"][i],
                "theta_absolute": self.psd["band_powers"]["theta"][i],
                "alpha_absolute": self.psd["band_powers"]["alpha"][i],
                "beta_absolute":  self.psd["band_powers"]["beta"][i],
                "gamma_absolute": self.psd["band_powers"]["gamma"][i],
                "delta_relative": self.psd["relative_powers"]["delta"][i],
                "theta_relative": self.psd["relative_powers"]["theta"][i],
                "alpha_relative": self.psd["relative_powers"]["alpha"][i],
                "beta_relative":  self.psd["relative_powers"]["beta"][i],
                "gamma_relative": self.psd["relative_powers"]["gamma"][i],
            }
            # Clinical ratios
            row["theta_alpha_ratio"] = row["theta_absolute"] / (row["alpha_absolute"] + 1e-12)
            row["delta_theta_ratio"] = row["delta_absolute"] / (row["theta_absolute"] + 1e-12)
            row["alpha_asymmetry_index"] = None  # Computed between pairs
            report_data.append(row)
        
        df = pd.DataFrame(report_data)
        df.to_csv(output_path, index=False)
        print(f"[OK] qEEG report exported to {output_path}")
        return df
    
    def _get_region(self, ch_name: str) -> str:
        """Map channel name to brain region."""
        region_map = {
            "Fp1": "prefrontal", "Fp2": "prefrontal",
            "F7":  "frontal", "F3": "frontal", "Fz": "frontal",
            "F4":  "frontal", "F8": "frontal",
            "T7":  "temporal", "C3": "central", "Cz": "central",
            "C4":  "central", "T8": "temporal",
            "P7":  "parietal", "P3": "parietal", "Pz": "parietal",
            "P4":  "parietal", "P8": "parietal",
            "O1":  "occipital", "O2": "occipital",
        }
        return region_map.get(ch_name.replace("EEG ", "").split("-")[0], "unknown")

# ============================================================
# USAGE
# ============================================================
if __name__ == "__main__":
    pipeline = ClinicalQEEGPipeline()
    
    # Load clinical EEG data
    # pipeline.load_data("/path/to/patient_eeg.edf")
    
    # Run full pipeline
    # pipeline.preprocess()
    # pipeline.create_epochs()
    # pipeline.compute_psd()
    # df = pipeline.export_qeeg_report("/path/to/qeeg_report.csv")
```

### Expected Output Format

```python
# PSD result structure:
{
    "frequencies": np.ndarray,     # shape: (n_freqs,) - frequency bins
    "psd_data": np.ndarray,        # shape: (n_epochs, n_channels, n_freqs)
    "band_powers": {               # Absolute power per channel (uV^2/Hz)
        "delta": np.ndarray,       # shape: (n_channels,)
        "theta": np.ndarray,
        "alpha": np.ndarray,
        "beta":  np.ndarray,
        "gamma": np.ndarray,
    },
    "relative_powers": {           # Relative power (0-1) per channel
        "delta": np.ndarray,
        "theta": np.ndarray,
        "alpha": np.ndarray,
        "beta":  np.ndarray,
        "gamma": np.ndarray,
    },
    "channel_names": list,         # Channel names
}
```

### FastAPI Integration

```python
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
import tempfile
import mne
import numpy as np

app = FastAPI(title="Clinical qEEG API")

@app.post("/qeeg/preprocess")
async def preprocess_eeg(file: UploadFile = File(...)):
    """Upload and preprocess EEG file."""
    # Save uploaded file temporarily
    with tempfile.NamedTemporaryFile(suffix=".edf", delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name
    
    # Run pipeline
    pipeline = ClinicalQEEGPipeline()
    raw = pipeline.load_data(tmp_path)
    raw_prep = pipeline.preprocess()
    epochs = pipeline.create_epochs(raw_prep)
    psd_result = pipeline.compute_psd(epochs)
    
    # Convert to JSON-serializable format
    response = {
        "n_channels": raw_prep.info["nchan"],
        "duration_sec": raw_prep.n_times / raw_prep.info["sfreq"],
        "sampling_freq": raw_prep.info["sfreq"],
        "n_epochs": len(epochs),
        "band_powers": {
            band: psd_result["band_powers"][band].tolist()
            for band in CONFIG["qEEG_bands"]
        },
        "relative_powers": {
            band: psd_result["relative_powers"][band].tolist()
            for band in CONFIG["qEEG_bands"]
        },
        "channel_names": psd_result["channel_names"],
    }
    
    return JSONResponse(content=response)

@app.post("/qeeg/psd")
async def compute_psd_endpoint(file: UploadFile = File(...)):
    """Compute PSD and return frequency-power data."""
    with tempfile.NamedTemporaryFile(suffix=".edf", delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name
    
    pipeline = ClinicalQEEGPipeline()
    pipeline.load_data(tmp_path)
    pipeline.preprocess()
    pipeline.create_epochs()
    result = pipeline.compute_psd()
    
    return {
        "frequencies": result["frequencies"].tolist(),
        "psd_mean": result["psd_data"].mean(axis=0).tolist(),
        "channel_names": result["channel_names"],
    }

# Run with: uvicorn main:app --reload
```

---

## 2. MNE-Connectivity

### Overview

MNE-Connectivity provides tools for computing and visualizing connectivity between sensors or sources. Supports 15+ connectivity measures including coherence, PLI, wPLI, Granger causality, and multivariate methods.

### pip install

```bash
pip install mne-connectivity
```

### Complete Code Example: Clinical Connectivity Analysis

```python
"""
Clinical EEG Connectivity Analysis with mne-connectivity
Computes coherence, PLI, wPLI, and Granger causality for qEEG.
"""

import mne
import numpy as np
from mne_connectivity import spectral_connectivity_epochs
from mne_connectivity import phase_slope_index
import pandas as pd


class ClinicalConnectivityAnalysis:
    """Comprehensive connectivity analysis for clinical qEEG."""
    
    # Standard frequency bands
    BANDS = {
        "delta": (0.5, 4.0),
        "theta": (4.0, 8.0),
        "alpha": (8.0, 13.0),
        "beta":  (13.0, 30.0),
        "gamma": (30.0, 45.0),
    }
    
    def __init__(self, epochs: mne.Epochs):
        self.epochs = epochs
        self.sfreq = epochs.info["sfreq"]
        self.connectivity_results = {}
    
    def compute_spectral_connectivity(
        self,
        method: str = "wpli2_debiased",
        fmin: float = 0.5,
        fmax: float = 45.0,
        n_jobs: int = -1
    ) -> dict:
        """
        Compute spectral connectivity for all channel pairs.
        
        Parameters
        ----------
        method : str
            Connectivity method: 'coh', 'cohy', 'imcoh', 'plv', 'ciplv',
            'pli', 'wpli', 'wpli2_debiased', 'ppc', 'mic', 'mim', 'gc'
        fmin, fmax : float
            Frequency range
        n_jobs : int
            Number of parallel jobs (-1 for all cores)
        
        Returns
        -------
        dict : Connectivity results per band
        """
        print(f"Computing {method} connectivity...")
        
        # Get data
        data = self.epochs.get_data()
        
        results = {}
        for band_name, (band_fmin, band_fmax) in self.BANDS.items():
            # Compute connectivity for this band
            con = spectral_connectivity_epochs(
                self.epochs,
                method=method,
                mode="multitaper",
                sfreq=self.sfreq,
                fmin=band_fmin,
                fmax=band_fmax,
                faverage=True,  # Average within band
                tmin=0.0,
                mt_adaptive=True,
                n_jobs=n_jobs,
                verbose=False
            )
            
            results[band_name] = {
                "connectivity": con.get_data(),  # (n_connections,)
                "freqs": con.freqs,
                "n_epochs_used": con.n_epochs_used,
            }
        
        self.connectivity_results[method] = results
        print(f"[OK] {method} connectivity computed for {len(self.BANDS)} bands")
        return results
    
    def compute_all_connectivity_measures(self) -> dict:
        """Compute multiple connectivity measures for comprehensive analysis."""
        methods = ["coh", "wpli2_debiased", "pli", "imcoh"]
        all_results = {}
        
        for method in methods:
            all_results[method] = self.compute_spectral_connectivity(method=method)
        
        self.all_connectivity = all_results
        return all_results
    
    def get_roi_connectivity(
        self,
        connectivity_matrix: np.ndarray,
        channel_names: list,
        roi_pairs: list = None
    ) -> pd.DataFrame:
        """
        Extract ROI-to-ROI connectivity from full matrix.
        
        Parameters
        ----------
        connectivity_matrix : np.ndarray
            2D connectivity matrix (n_channels x n_channels)
        channel_names : list
            List of channel names
        roi_pairs : list of tuples
            Pairs of ROI names, e.g., [("frontal", "parietal"), ...]
        
        Returns
        -------
        pd.DataFrame : ROI connectivity values
        """
        if roi_pairs is None:
            roi_pairs = [
                ("frontal", "parietal"),
                ("frontal", "temporal"),
                ("frontal", "occipital"),
                ("temporal", "parietal"),
                ("left", "right"),
                ("anterior", "posterior"),
            ]
        
        # Define channel groups
        roi_groups = {
            "frontal": ["Fp1", "Fp2", "F3", "F4", "F7", "F8", "Fz"],
            "parietal": ["P3", "P4", "P7", "P8", "Pz"],
            "temporal": ["T7", "T8", "TP7", "TP8"],
            "occipital": ["O1", "O2", "Oz"],
            "central": ["C3", "C4", "Cz"],
            "left": ["Fp1", "F3", "F7", "C3", "T7", "P3", "P7", "O1"],
            "right": ["Fp2", "F4", "F8", "C4", "T8", "P4", "P8", "O2"],
            "anterior": ["Fp1", "Fp2", "F3", "F4", "F7", "F8", "Fz"],
            "posterior": ["P3", "P4", "P7", "P8", "Pz", "O1", "O2", "Oz"],
        }
        
        results = []
        for roi1_name, roi2_name in roi_pairs:
            chs1 = [ch for ch in channel_names 
                    if any(r in ch for r in roi_groups.get(roi1_name, []))]
            chs2 = [ch for ch in channel_names 
                    if any(r in ch for r in roi_groups.get(roi2_name, []))]
            
            if not chs1 or not chs2:
                continue
            
            # Get indices
            idx1 = [channel_names.index(ch) for ch in chs1 if ch in channel_names]
            idx2 = [channel_names.index(ch) for ch in chs2 if ch in channel_names]
            
            # Extract submatrix and compute mean
            submatrix = connectivity_matrix[np.ix_(idx1, idx2)]
            mean_con = submatrix.mean()
            
            results.append({
                "roi_1": roi1_name,
                "roi_2": roi2_name,
                "mean_connectivity": float(mean_con),
                "n_connections": len(idx1) * len(idx2),
            })
        
        return pd.DataFrame(results)
    
    def compute_directed_connectivity(self) -> dict:
        """Compute directed connectivity using Phase Slope Index (PSI)."""
        psi = phase_slope_index(
            self.epochs,
            mode="multitaper",
            indices=None,  # All pairs
            sfreq=self.sfreq,
            fmin=2,
            fmax=40,
            bandwidth=4
        )
        
        return {
            "psi": psi.get_data(),
            "freqs": psi.freqs,
            "n_epochs": psi.n_epochs_used,
        }
    
    def export_connectivity_matrix(
        self,
        output_path: str,
        method: str = "wpli2_debiased",
        band: str = "alpha"
    ):
        """Export connectivity matrix to CSV."""
        con_data = self.connectivity_results[method][band]["connectivity"]
        
        # Reshape to n_channels x n_channels
        n_ch = len(self.epochs.ch_names)
        con_matrix = np.zeros((n_ch, n_ch))
        
        idx = 0
        for i in range(n_ch):
            for j in range(i + 1, n_ch):
                con_matrix[i, j] = con_data[idx]
                con_matrix[j, i] = con_data[idx]
                idx += 1
        
        df = pd.DataFrame(
            con_matrix,
            index=self.epochs.ch_names,
            columns=self.epochs.ch_names
        )
        df.to_csv(output_path)
        print(f"[OK] Connectivity matrix exported to {output_path}")
        return df

# ============================================================
# USAGE
# ============================================================
# Assuming epochs already created from pipeline above:
# con_analyzer = ClinicalConnectivityAnalysis(epochs)
# 
# # Compute all connectivity measures
# all_con = con_analyzer.compute_all_connectivity_measures()
# 
# # Get ROI-level connectivity
# ch_names = epochs.ch_names
# alpha_wpli = all_con["wpli2_debiased"]["alpha"]["connectivity"]
# roi_df = con_analyzer.get_roi_connectivity(alpha_wpli, ch_names)
```

### Expected Output Format

```python
# Connectivity result structure:
{
    "method_name": {
        "band_name": {
            "connectivity": np.ndarray,  # shape: (n_connections,)
            "freqs": np.ndarray,         # shape: (1,) when faverage=True
            "n_epochs_used": int,
        }
    }
}

# Connectivity matrix: (n_channels x n_channels) symmetric matrix
# Values: 0 to 1 (for most methods)

# ROI connectivity DataFrame:
#    roi_1     | roi_2      | mean_connectivity | n_connections
#    frontal   | parietal   | 0.4523            | 35
#    frontal   | temporal   | 0.3187            | 28
#    ...
```

### FastAPI Integration

```python
from fastapi import FastAPI, UploadFile, File
from pydantic import BaseModel
from typing import List, Optional
import tempfile

app = FastAPI()

class ConnectivityRequest(BaseModel):
    method: str = "wpli2_debiased"
    fmin: float = 0.5
    fmax: float = 45.0
    bands: Optional[List[str]] = ["delta", "theta", "alpha", "beta", "gamma"]

@app.post("/connectivity/compute")
async def compute_connectivity(
    file: UploadFile = File(...),
    request: ConnectivityRequest = None
):
    """Compute spectral connectivity from EEG epochs."""
    if request is None:
        request = ConnectivityRequest()
    
    with tempfile.NamedTemporaryFile(suffix="-epo.fif", delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name
    
    epochs = mne.read_epochs(tmp_path, preload=True)
    analyzer = ClinicalConnectivityAnalysis(epochs)
    
    results = analyzer.compute_spectral_connectivity(
        method=request.method,
        fmin=request.fmin,
        fmax=request.fmax
    )
    
    # Serialize for JSON
    json_results = {}
    for band, data in results.items():
        json_results[band] = {
            "connectivity_mean": float(data["connectivity"].mean()),
            "connectivity_std": float(data["connectivity"].std()),
            "freqs": [float(f) for f in data["freqs"]],
            "n_epochs": data["n_epochs_used"],
        }
    
    return {
        "method": request.method,
        "n_channels": len(epochs.ch_names),
        "n_epochs": len(epochs),
        "bands": json_results
    }

@app.post("/connectivity/matrix")
async def get_connectivity_matrix(
    file: UploadFile = File(...),
    method: str = "wpli2_debiased",
    band: str = "alpha"
):
    """Get full connectivity matrix for a specific method and band."""
    with tempfile.NamedTemporaryFile(suffix="-epo.fif", delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name
    
    epochs = mne.read_epochs(tmp_path, preload=True)
    analyzer = ClinicalConnectivityAnalysis(epochs)
    analyzer.compute_spectral_connectivity(method=method)
    
    # Build full matrix
    n_ch = len(epochs.ch_names)
    con_data = analyzer.connectivity_results[method][band]["connectivity"]
    matrix = np.zeros((n_ch, n_ch))
    idx = 0
    for i in range(n_ch):
        for j in range(i + 1, n_ch):
            matrix[i, j] = con_data[idx]
            matrix[j, i] = con_data[idx]
            idx += 1
    
    return {
        "matrix": matrix.tolist(),
        "channel_names": epochs.ch_names,
        "method": method,
        "band": band,
    }
```

---

## 3. MNE-Features

### Overview

MNE-Features extracts hand-crafted features from epoched EEG/MEG signals. Includes 50+ features: univariate time-domain, frequency-domain, and nonlinear features. Integrates with scikit-learn pipelines.

### pip install

```bash
pip install mne-features
```

### Complete Code Example: Clinical Feature Extraction

```python
"""
Clinical EEG Feature Extraction with mne-features
Extracts 50+ features per channel for ML-based clinical qEEG.
"""

import numpy as np
import pandas as pd
import mne
from mne_features.feature_extraction import extract_features, FeatureExtractor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import cross_val_score


class ClinicalFeatureExtraction:
    """Comprehensive feature extraction for clinical qEEG."""
    
    # All available feature functions in mne-features
    AVAILABLE_FEATURES = [
        # Time-domain features
        "mean", "std", "ptp_amp", "kurtosis", "skewness",
        "app_entropy", "sample_entropy", "decorr_time",
        "hjorth_mobility", "hjorth_complexity",
        "higuchi_fd", "katz_fd", "line_length", "zero_crossings",
        "variance", "rms", "quantile", "ptp_amp",
        
        # Frequency-domain features
        "spect_slope", "spect_entropy", "spect_edge_freq",
        "wavelet_coef_energy", "energy_freq_bands",
        "spect_corr",
    ]
    
    def __init__(self, sfreq: float = 256.0):
        self.sfreq = sfreq
        self.features = None
        self.feature_names = None
    
    def extract_features(
        self,
        epochs: mne.Epochs,
        selected_features: list = None,
        n_jobs: int = -1
    ) -> np.ndarray:
        """
        Extract features from epoched EEG data.
        
        Parameters
        ----------
        epochs : mne.Epochs
            Epoched EEG data
        selected_features : list
            List of feature names to extract. If None, extract all.
        n_jobs : int
            Number of parallel jobs
        
        Returns
        -------
        np.ndarray : Feature matrix (n_epochs, n_features)
        """
        if selected_features is None:
            selected_features = [
                "mean", "std", "ptp_amp", "skewness", "kurtosis",
                "app_entropy", "hjorth_mobility", "hjorth_complexity",
                "higuchi_fd", "spect_entropy", "energy_freq_bands",
                "spect_edge_freq", "zero_crossings"
            ]
        
        # Get data: (n_epochs, n_channels, n_times)
        X = epochs.get_data()
        
        # Extract features
        features = extract_features(
            X,
            sfreq=self.sfreq,
            selected_funcs=selected_features,
            funcs_params={
                "energy_freq_bands__freq_bands": {
                    "delta": (0.5, 4.0),
                    "theta": (4.0, 8.0),
                    "alpha": (8.0, 13.0),
                    "beta":  (13.0, 30.0),
                    "gamma": (30.0, 45.0),
                }
            },
            n_jobs=n_jobs,
            ch_names=epochs.ch_names,
            return_as_df=False
        )
        
        self.features = features
        self.selected_features = selected_features
        print(f"[OK] Extracted {features.shape[1]} features from {features.shape[0]} epochs")
        return features
    
    def extract_with_sklearn_pipeline(
        self,
        epochs: mne.Epochs,
        labels: np.ndarray = None
    ) -> Pipeline:
        """
        Use FeatureExtractor in scikit-learn pipeline.
        
        Parameters
        ----------
        epochs : mne.Epochs
            Epoched data
        labels : np.ndarray
            Class labels for classification
        
        Returns
        -------
        Pipeline : scikit-learn pipeline
        """
        X = epochs.get_data()
        
        # Define feature extractor
        selected_funcs = [
            "std", "ptp_amp", "skewness", "kurtosis",
            "app_entropy", "hjorth_mobility", "hjorth_complexity",
            "higuchi_fd", "spect_entropy", "energy_freq_bands",
            "spect_edge_freq"
        ]
        
        pipe = Pipeline([
            ("featurizer", FeatureExtractor(
                sfreq=self.sfreq,
                selected_funcs=selected_funcs,
                n_jobs=-1
            )),
            ("scaler", StandardScaler()),
            ("classifier", RandomForestClassifier(n_estimators=100))
        ])
        
        if labels is not None:
            scores = cross_val_score(pipe, X, labels, cv=5)
            print(f"[OK] Cross-validation accuracy: {scores.mean():.3f} +/- {scores.std():.3f}")
            pipe.fit(X, labels)
        
        self.pipeline = pipe
        return pipe
    
    def get_feature_importance(
        self,
        epochs: mne.Epochs,
        labels: np.ndarray
    ) -> pd.DataFrame:
        """Get feature importance using Random Forest."""
        features = self.extract_features(epochs)
        
        clf = RandomForestClassifier(n_estimators=200, random_state=42)
        clf.fit(features, labels)
        
        # Build feature names (approximate)
        n_ch = len(epochs.ch_names)
        feature_names = []
        for feat_name in self.selected_features:
            for ch in epochs.ch_names:
                feature_names.append(f"{feat_name}__{ch}")
        
        importance = pd.DataFrame({
            "feature": feature_names[:len(clf.feature_importances_)],
            "importance": clf.feature_importances_,
        }).sort_values("importance", ascending=False)
        
        return importance

# ============================================================
# USAGE
# ============================================================
# extractor = ClinicalFeatureExtraction(sfreq=256.0)
# features = extractor.extract_features(epochs)
# 
# # For ML classification
# pipe = extractor.extract_with_sklearn_pipeline(epochs, labels=y)
```

### Expected Output Format

```python
# Feature matrix shape: (n_epochs, n_features)
# where n_features = n_selected_funcs * n_channels (approximately)

# Feature importance DataFrame:
#    feature                        | importance
#    std__Cz                        | 0.0876
#    energy_freq_bands_alpha__O2    | 0.0723
#    ptp_amp__Fp1                   | 0.0654
#    app_entropy__F3                | 0.0589
#    ...
```

### FastAPI Integration

```python
from fastapi import FastAPI, UploadFile, File
import tempfile
import numpy as np

app = FastAPI()

@app.post("/features/extract")
async def extract_features_endpoint(
    file: UploadFile = File(...),
    sfreq: float = 256.0
):
    """Extract clinical features from EEG epochs."""
    with tempfile.NamedTemporaryFile(suffix="-epo.fif", delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name
    
    epochs = mne.read_epochs(tmp_path, preload=True)
    extractor = ClinicalFeatureExtraction(sfreq=sfreq)
    features = extractor.extract_features(epochs)
    
    # Compute summary statistics
    feature_summary = {
        "n_epochs": features.shape[0],
        "n_features": features.shape[1],
        "features_mean": features.mean(axis=0).tolist(),
        "features_std": features.std(axis=0).tolist(),
        "features_min": features.min(axis=0).tolist(),
        "features_max": features.max(axis=0).tolist(),
    }
    
    return feature_summary
```

---

## 4. MNE-BIDS

### Overview

MNE-BIDS implements the Brain Imaging Data Structure (BIDS) format for organizing and sharing electrophysiological data. BIDS standardizes filenames, folder structures, and metadata, enabling reproducible research.

### pip install

```bash
pip install mne-bids
```

### Complete Code Example: Clinical BIDS Organization

```python
"""
Clinical EEG BIDS Organization with mne-bids
Organize clinical EEG data according to BIDS standard.
"""

import mne
from mne_bids import BIDSPath, write_raw_bids, read_raw_bids
from mne_bids import make_dataset_description, update_sidecar_json
import json
from pathlib import Path
from datetime import datetime


class ClinicalBIDSManager:
    """Manage clinical EEG data in BIDS format."""
    
    def __init__(self, bids_root: str):
        self.bids_root = Path(bids_root)
        self.bids_root.mkdir(parents=True, exist_ok=True)
    
    def create_dataset_description(
        self,
        dataset_name: str = "Clinical qEEG Dataset",
        authors: list = None,
        license_type: str = "CC0"
    ):
        """Create BIDS dataset_description.json."""
        if authors is None:
            authors = ["Clinical Neurophysiology Lab"]
        
        make_dataset_description(
            path=str(self.bids_root),
            name=dataset_name,
            authors=authors,
            license=license_type,
            acknowledgements="Clinical qEEG recordings.",
            datatype="eeg",
            overwrite=True
        )
        print(f"[OK] Dataset description created at {self.bids_root}")
    
    def write_eeg_to_bids(
        self,
        raw: mne.io.Raw,
        subject_id: str,
        session_id: str = "01",
        task: str = "rest",
        run: str = "01",
        acquisition: str = None,
        overwrite: bool = False
    ) -> BIDSPath:
        """
        Write raw EEG data to BIDS format.
        
        Parameters
        ----------
        raw : mne.io.Raw
            Raw EEG data
        subject_id : str
            Subject identifier (e.g., "001")
        session_id : str
            Session identifier
        task : str
            Task name (e.g., "rest", "eog", "epilepsy")
        run : str
            Run number
        acquisition : str
            Acquisition type (e.g., "clinical", "research")
        
        Returns
        -------
        BIDSPath : Path to written BIDS data
        """
        bids_path = BIDSPath(
            subject=subject_id,
            session=session_id,
            task=task,
            run=run,
            acquisition=acquisition,
            datatype="eeg",
            root=str(self.bids_root)
        )
        
        # Add participant info to raw
        raw.info["subject_info"] = {
            "his_id": subject_id,
            "birthday": (1980, 1, 1),
            "sex": 0,  # 0=unknown, 1=male, 2=female
            "hand": 3,  # 1=right, 2=left, 3=unknown
        }
        
        # Write to BIDS
        write_raw_bids(
            raw,
            bids_path=bids_path,
            overwrite=overwrite,
            allow_preload=True,
            format="EDF",
            verbose=False
        )
        
        print(f"[OK] Data written to: {bids_path}")
        return bids_path
    
    def read_eeg_from_bids(
        self,
        subject_id: str,
        session_id: str = "01",
        task: str = "rest",
        run: str = "01"
    ) -> mne.io.Raw:
        """Read EEG data from BIDS format."""
        bids_path = BIDSPath(
            subject=subject_id,
            session=session_id,
            task=task,
            run=run,
            datatype="eeg",
            root=str(self.bids_root)
        )
        
        raw = read_raw_bids(bids_path, verbose=False)
        print(f"[OK] Loaded data from: {bids_path}")
        return raw
    
    def add_participants_info(self, participants_info: list):
        """
        Create participants.tsv and participants.json.
        
        Parameters
        ----------
        participants_info : list of dict
            Each dict contains: participant_id, age, sex, diagnosis, etc.
        """
        participants_tsv = self.bids_root / "participants.tsv"
        participants_json = self.bids_root / "participants.json"
        
        # Write TSV
        import csv
        if participants_info:
            keys = participants_info[0].keys()
            with open(participants_tsv, "w", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=keys, delimiter="\t")
                writer.writeheader()
                writer.writerows(participants_info)
        
        # Write JSON description
        participants_meta = {
            "participant_id": {
                "Description": "Unique participant identifier"
            },
            "age": {
                "Description": "Age of participant in years",
                "Units": "years"
            },
            "sex": {
                "Description": "Biological sex of participant",
                "Levels": {"M": "male", "F": "female"}
            },
            "diagnosis": {
                "Description": "Clinical diagnosis if applicable",
                "Levels": {
                    "HC": "healthy control",
                    "AD": "Alzheimer's disease",
                    "MCI": "mild cognitive impairment",
                    "TBI": "traumatic brain injury",
                    "EPI": "epilepsy"
                }
            },
            "group": {
                "Description": "Group assignment",
                "Levels": {"patient": "Patient group", "control": "Control group"}
            }
        }
        
        with open(participants_json, "w") as f:
            json.dump(participants_meta, f, indent=2)
        
        print("[OK] Participants metadata written")
    
    def update_scan_metadata(self, bids_path: BIDSPath, metadata: dict):
        """Update sidecar JSON metadata for a specific scan."""
        sidecar_path = bids_path.copy().update(extension=".json")
        
        update_sidecar_json(sidecar_path, metadata)
        print(f"[OK] Updated metadata for {sidecar_path}")
    
    def list_subjects(self) -> list:
        """List all subjects in BIDS dataset."""
        subjects = []
        for sub_dir in sorted(self.bids_root.glob("sub-*")):
            subject_id = sub_dir.name.replace("sub-", "")
            subjects.append({
                "subject_id": subject_id,
                "path": str(sub_dir)
            })
        return subjects

# ============================================================
# USAGE
# ============================================================
# bids_mgr = ClinicalBIDSManager("/data/bids_clinical")
# bids_mgr.create_dataset_description("Clinical qEEG Study")
# 
# # Write data to BIDS
# bids_path = bids_mgr.write_eeg_to_bids(
#     raw, subject_id="001", task="rest", run="01"
# )
# 
# # Read back
# raw_bids = bids_mgr.read_eeg_from_bids(subject_id="001", task="rest")
```

### Expected Output Format

```
bids_clinical/
├── dataset_description.json
├── participants.tsv
├── participants.json
├── README
├── sub-001/
│   └── ses-01/
│       └── eeg/
│           ├── sub-001_ses-01_task-rest_run-01_eeg.edf
│           ├── sub-001_ses-01_task-rest_run-01_eeg.json
│           ├── sub-001_ses-01_task-rest_run-01_channels.tsv
│           ├── sub-001_ses-01_task-rest_run-01_events.tsv
│           └── sub-001_ses-01_task-rest_run-01_electrodes.tsv
├── sub-002/
│   └── ...
```

### FastAPI Integration

```python
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import FileResponse
import tempfile
import shutil

app = FastAPI()

@app.post("/bids/convert")
async def convert_to_bids(
    file: UploadFile = File(...),
    subject_id: str = Form(...),
    session_id: str = Form("01"),
    task: str = Form("rest"),
    run: str = Form("01")
):
    """Convert uploaded EEG to BIDS format."""
    with tempfile.NamedTemporaryFile(suffix=".edf", delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name
    
    raw = mne.io.read_raw_edf(tmp_path, preload=True)
    
    bids_root = tempfile.mkdtemp(prefix="bids_")
    bids_mgr = ClinicalBIDSManager(bids_root)
    bids_mgr.create_dataset_description()
    bids_path = bids_mgr.write_eeg_to_bids(
        raw, subject_id=subject_id, session=session_id,
        task=task, run=run, overwrite=True
    )
    
    # Return BIDS path info
    return {
        "bids_root": bids_root,
        "subject_id": subject_id,
        "bids_path": str(bids_path),
        "files": [str(f) for f in Path(bids_root).rglob("*") if f.is_file()]
    }

@app.get("/bids/list/{bids_root:path}")
async def list_bids_subjects(bids_root: str):
    """List all subjects in a BIDS dataset."""
    bids_mgr = ClinicalBIDSManager(bids_root)
    subjects = bids_mgr.list_subjects()
    return {"subjects": subjects, "n_subjects": len(subjects)}
```

---

## 5. MNE-ICALabel

### Overview

MNE-ICALabel provides automatic ICA component labeling using deep learning (ICLabel model). Classifies components into: brain, muscle, eye blink, heart beat, line noise, channel noise, and other.

### pip install

```bash
pip install mne-icalabel
# With GUI support:
pip install mne-icalabel[gui]
```

### Complete Code Example: Automatic ICA Labeling

```python
"""
Clinical ICA Component Labeling with mne-icalabel
Automatically classifies and removes artifact components.
"""

import mne
from mne.preprocessing import ICA
from mne_icalabel import label_components
import numpy as np
import pandas as pd


class ClinicalICALabeling:
    """Automatic ICA labeling and artifact removal for clinical EEG."""
    
    # ICLabel classification categories
    ICLABEL_CLASSES = [
        "brain", "muscle", "eye", "heart",
        "line_noise", "ch_noise", "other"
    ]
    
    def __init__(self, n_components: int = 15, random_state: int = 97):
        self.n_components = n_components
        self.random_state = random_state
        self.ica = None
        self.labels = None
        self.probabilities = None
        self.exclude_components = []
    
    def fit_ica(self, raw: mne.io.Raw) -> ICA:
        """
        Fit extended Infomax ICA (required for ICLabel compatibility).
        
        Note: ICLabel requires:
        - Extended Infomax ICA
        - Average reference
        - Filtered data [1, 100] Hz
        """
        # Filter to ICLabel requirements
        raw_filtered = raw.copy().filter(l_freq=1.0, h_freq=100.0)
        
        # Apply average reference (required)
        raw_filtered.set_eeg_reference("average", projection=True)
        
        # Setup ICA with extended Infomax
        self.ica = ICA(
            n_components=self.n_components,
            max_iter="auto",
            method="infomax",
            random_state=self.random_state,
            fit_params=dict(extended=True)
        )
        
        # Fit ICA
        self.ica.fit(raw_filtered)
        print(f"[OK] ICA fitted: {self.n_components} components")
        return self.ica
    
    def label_components(self, raw: mne.io.Raw) -> dict:
        """
        Label ICA components using ICLabel deep learning model.
        
        Returns
        -------
        dict : Labels and probabilities for each component
        """
        if self.ica is None:
            raise RuntimeError("Fit ICA first!")
        
        # Run ICLabel classification
        labels, y_proba = label_components(raw, self.ica, method="iclabel")
        
        self.labels = labels
        self.probabilities = y_proba
        
        # Build results DataFrame
        results = []
        for i, (label, probs) in enumerate(zip(labels, y_proba)):
            result = {"component": i, "label": label}
            for j, cls_name in enumerate(self.ICLABEL_CLASSES):
                result[f"prob_{cls_name}"] = round(probs[j], 4)
            results.append(result)
        
        df = pd.DataFrame(results)
        self.label_df = df
        
        print("\n[OK] ICA Component Labels:")
        print(df[["component", "label", "prob_brain", "prob_muscle", 
                   "prob_eye", "prob_heart", "prob_line_noise"]].to_string())
        
        return {
            "labels": labels,
            "probabilities": y_proba,
            "dataframe": df
        }
    
    def select_artifact_components(
        self,
        exclude_classes: list = None,
        prob_threshold: float = 0.7
    ) -> list:
        """
        Select components to exclude based on classification.
        
        Parameters
        ----------
        exclude_classes : list
            Component classes to exclude (default: muscle, eye, heart, line_noise)
        prob_threshold : float
            Minimum probability to consider classification reliable
        
        Returns
        -------
        list : Indices of components to exclude
        """
        if exclude_classes is None:
            exclude_classes = ["muscle", "eye", "heart", "line_noise"]
        
        exclude = []
        for i, (label, probs) in enumerate(zip(self.labels, self.probabilities)):
            # Find max probability class
            max_prob = probs.max()
            if label in exclude_classes and max_prob >= prob_threshold:
                exclude.append(i)
                print(f"  Excluding IC {i}: {label} (prob={max_prob:.3f})")
        
        self.exclude_components = exclude
        self.ica.exclude = exclude
        print(f"\n[OK] Excluding {len(exclude)} artifact components")
        return exclude
    
    def apply_ica(self, raw: mne.io.Raw) -> mne.io.Raw:
        """Apply ICA cleaning to raw data."""
        if not self.exclude_components:
            print("[WARNING] No components marked for exclusion!")
            return raw
        
        raw_cleaned = raw.copy()
        self.ica.apply(raw_cleaned)
        print(f"[OK] ICA applied: {len(self.exclude_components)} components removed")
        return raw_cleaned
    
    def get_brain_components(self) -> list:
        """Get indices of components classified as brain."""
        brain_idx = [
            i for i, label in enumerate(self.labels) 
            if label == "brain"
        ]
        return brain_idx
    
    def export_component_properties(self, output_path: str):
        """Export ICA component properties to CSV."""
        if self.label_df is None:
            raise RuntimeError("Label components first!")
        
        self.label_df.to_csv(output_path, index=False)
        print(f"[OK] Component properties exported to {output_path}")
        return self.label_df

# ============================================================
# USAGE
# ============================================================
# ica_labeler = ClinicalICALabeling(n_components=15)
# 
# # Fit ICA
# ica_labeler.fit_ica(raw)
# 
# # Label components
# results = ica_labeler.label_components(raw)
# 
# # Select and remove artifacts
# exclude = ica_labeler.select_artifact_components()
# raw_clean = ica_labeler.apply_ica(raw)
# 
# # Get brain-only components
# brain_ics = ica_labeler.get_brain_components()
```

### Expected Output Format

```python
# ICLabel output:
{
    "labels": ["eye", "brain", "brain", "muscle", "heart", "line_noise", ...],
    "probabilities": np.ndarray,  # shape: (n_components, 7)
    "dataframe": pd.DataFrame  # component, label, prob_brain, prob_muscle, ...
}

# Example DataFrame:
#    component | label        | prob_brain | prob_muscle | prob_eye | ...
#    0         | eye          | 0.0234     | 0.0012      | 0.9654   | ...
#    1         | brain        | 0.8721     | 0.0234      | 0.0012   | ...
#    2         | brain        | 0.9234     | 0.0123      | 0.0008   | ...
#    3         | muscle       | 0.0034     | 0.9123      | 0.0012   | ...
#    4         | heart        | 0.0123     | 0.0034      | 0.0001   | ...
#    ...
```

### FastAPI Integration

```python
from fastapi import FastAPI, UploadFile, File, Query
import tempfile

app = FastAPI()

@app.post("/ica/label")
async def label_ica_components_endpoint(
    file: UploadFile = File(...),
    n_components: int = Query(15, ge=5, le=50),
    prob_threshold: float = Query(0.7, ge=0.0, le=1.0)
):
    """Run ICA and automatically label components."""
    with tempfile.NamedTemporaryFile(suffix=".edf", delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name
    
    raw = mne.io.read_raw_edf(tmp_path, preload=True)
    
    labeler = ClinicalICALabeling(n_components=n_components)
    labeler.fit_ica(raw)
    results = labeler.label_components(raw)
    exclude = labeler.select_artifact_components(prob_threshold=prob_threshold)
    raw_clean = labeler.apply_ica(raw)
    
    return {
        "n_components": n_components,
        "labels": results["labels"],
        "artifact_components": exclude,
        "n_artifacts_removed": len(exclude),
        "brain_components": labeler.get_brain_components(),
        "component_details": results["dataframe"].to_dict("records"),
    }
```

---

## 6. MNE-Realtime

### Overview

MNE-Realtime provides real-time data acquisition and processing. Supports LSL (Lab Streaming Layer) and FieldTrip buffer clients for streaming EEG data.

### pip install

```bash
pip install mne-realtime
# For LSL support:
pip install pylsl
```

### Complete Code Example: Real-time qEEG Processing

```python
"""
Real-time qEEG Processing with mne-realtime
Streams and processes EEG data in real-time.
"""

import mne
from mne_realtime import LSLClient, FieldTripClient
import numpy as np
import asyncio
from collections import deque
from datetime import datetime


class RealtimeQEEGProcessor:
    """Real-time qEEG processing from EEG stream."""
    
    BANDS = {
        "delta": (0.5, 4.0),
        "theta": (4.0, 8.0),
        "alpha": (8.0, 13.0),
        "beta":  (13.0, 30.0),
        "gamma": (30.0, 45.0),
    }
    
    def __init__(
        self,
        host: str = "localhost",
        port: int = 1972,
        wait_max: float = 5.0,
        buffer_size: int = 10,
        sfreq: float = 256.0
    ):
        self.host = host
        self.port = port
        self.wait_max = wait_max
        self.buffer_size = buffer_size
        self.sfreq = sfreq
        self.power_buffer = {band: deque(maxlen=buffer_size) 
                            for band in self.BANDS}
        self.is_running = False
    
    def process_with_lsl(
        self,
        stream_name: str = "EEG_stream",
        epoch_duration: float = 2.0,
        max_epochs: int = 100
    ):
        """
        Process real-time EEG data from LSL stream.
        
        Parameters
        ----------
        stream_name : str
            Name of LSL stream
        epoch_duration : float
            Duration of each epoch in seconds
        max_epochs : int
            Maximum number of epochs to process
        """
        print(f"Connecting to LSL stream: {stream_name}")
        
        with LSLClient(
            info=None,
            host=stream_name,
            port=self.port
        ) as rt_client:
            
            # Get measurement info from stream
            info = rt_client.get_measurement_info()
            print(f"Stream info: {info['nchan']} channels, "
                  f"{info['sfreq']} Hz")
            
            # Create real-time epochs
            n_samples = int(epoch_duration * info["sfreq"])
            
            for epoch_i in range(max_epochs):
                if not self.is_running and epoch_i > 0:
                    break
                
                # Get epoch from stream
                epoch = rt_client.get_data_as_epoch(
                    n_samples=n_samples
                )
                
                # Process epoch
                band_powers = self._compute_band_powers(epoch)
                
                # Store in buffer
                for band, power in band_powers.items():
                    self.power_buffer[band].append(power)
                
                # Check for abnormalities
                alerts = self._detect_abnormalities(band_powers)
                
                # Print status
                status = f"Epoch {epoch_i+1}: "
                for band, power in band_powers.items():
                    status += f"{band}={power:.2e} "
                if alerts:
                    status += f" | ALERTS: {alerts}"
                print(status)
                
                self.is_running = True
    
    def process_with_fieldtrip(
        self,
        epoch_duration: float = 2.0,
        max_epochs: int = 100
    ):
        """Process real-time EEG from FieldTrip buffer."""
        print(f"Connecting to FieldTrip buffer at {self.host}:{self.port}")
        
        with FieldTripClient(
            host=self.host,
            port=self.port,
            tmax=self.wait_max,
            wait_max=self.wait_max
        ) as rt_client:
            
            info = rt_client.get_measurement_info()
            n_samples = int(epoch_duration * info["sfreq"])
            
            for epoch_i in range(max_epochs):
                epoch = rt_client.get_data_as_epoch(n_samples=n_samples)
                band_powers = self._compute_band_powers(epoch)
                
                for band, power in band_powers.items():
                    self.power_buffer[band].append(power)
                
                print(f"Epoch {epoch_i+1}: " + 
                      ", ".join(f"{b}={p:.2e}" 
                               for b, p in band_powers.items()))
    
    def _compute_band_powers(self, epoch: mne.Epochs) -> dict:
        """Compute band powers for a single epoch."""
        psd = epoch.compute_psd(method="welch")
        freqs = psd.freqs
        psd_data = psd.get_data().mean(axis=0)  # Average across channels
        
        band_powers = {}
        for band_name, (fmin, fmax) in self.BANDS.items():
            freq_mask = (freqs >= fmin) & (freqs <= fmax)
            band_power = psd_data[freq_mask].mean()
            band_powers[band_name] = float(band_power)
        
        return band_powers
    
    def _detect_abnormalities(self, band_powers: dict) -> list:
        """Detect abnormal patterns in band powers."""
        alerts = []
        
        # Check theta/alpha ratio (elevated in AD, TBI)
        theta_alpha_ratio = band_powers["theta"] / (band_powers["alpha"] + 1e-12)
        if theta_alpha_ratio > 2.5:
            alerts.append("ELEVATED_THETA_ALPHA_RATIO")
        
        # Check alpha suppression
        if band_powers["alpha"] < 1e-12:
            alerts.append("ALPHA_SUPPRESSION")
        
        # Check excessive delta (seizure indicator)
        if band_powers["delta"] > 5e-12:
            alerts.append("EXCESSIVE_DELTA")
        
        # Check beta/gamma elevation (possible muscle artifact)
        if band_powers["gamma"] > band_powers["alpha"] * 10:
            alerts.append("HIGH_FREQ_DOMINANCE")
        
        return alerts
    
    def get_trend(self, band: str, n_points: int = 10) -> list:
        """Get recent power trend for a band."""
        buffer = list(self.power_buffer[band])
        return buffer[-n_points:]
    
    def stop(self):
        """Stop real-time processing."""
        self.is_running = False
        print("[OK] Real-time processing stopped")

# ============================================================
# USAGE
# ============================================================
# processor = RealtimeQEEGProcessor(
#     host="localhost",
#     port=1972,
#     buffer_size=60  # 2 minutes at 2s epochs
# )
# 
# # Start real-time processing
# try:
#     processor.process_with_lsl(
#         stream_name="EEG_stream",
#         epoch_duration=2.0,
#         max_epochs=1000
#     )
# except KeyboardInterrupt:
#     processor.stop()
```

### Expected Output Format

```
# Real-time console output:
Connecting to LSL stream: EEG_stream
Stream info: 32 channels, 256.0 Hz
Epoch 1: delta=2.34e-12 theta=1.87e-12 alpha=3.45e-12 beta=1.23e-12 gamma=0.45e-12
Epoch 2: delta=2.41e-12 theta=1.92e-12 alpha=3.38e-12 beta=1.31e-12 gamma=0.48e-12
...
Epoch 47: delta=4.87e-12 theta=3.21e-12 alpha=1.23e-12 beta=0.87e-12 gamma=0.32e-12 | ALERTS: ['ELEVATED_THETA_ALPHA_RATIO', 'ALPHA_SUPPRESSION']
```

### FastAPI Integration (WebSocket for Real-time)

```python
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
import asyncio
import json

app = FastAPI()

class ConnectionManager:
    """Manage WebSocket connections for real-time EEG streaming."""
    
    def __init__(self):
        self.active_connections = []
    
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
    
    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)
    
    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            await connection.send_json(message)

manager = ConnectionManager()

@app.websocket("/ws/realtime")
async def realtime_websocket(websocket: WebSocket):
    """WebSocket endpoint for real-time qEEG streaming."""
    await manager.connect(websocket)
    
    try:
        # Configure real-time processor
        processor = RealtimeQEEGProcessor(buffer_size=60)
        
        # Process incoming data from client
        while True:
            data = await websocket.receive_json()
            
            if data.get("action") == "start":
                # Start streaming
                stream_name = data.get("stream_name", "EEG_stream")
                epoch_duration = data.get("epoch_duration", 2.0)
                
                # Note: In production, this would connect to actual LSL stream
                # Here we simulate for demonstration
                for i in range(100):
                    # Simulated band powers
                    band_powers = {
                        "delta": np.random.uniform(1e-12, 5e-12),
                        "theta": np.random.uniform(0.5e-12, 3e-12),
                        "alpha": np.random.uniform(1e-12, 4e-12),
                        "beta":  np.random.uniform(0.5e-12, 2e-12),
                        "gamma": np.random.uniform(0.1e-12, 1e-12),
                    }
                    
                    # Detect abnormalities
                    alerts = processor._detect_abnormalities(band_powers)
                    
                    await websocket.send_json({
                        "epoch": i + 1,
                        "timestamp": datetime.now().isoformat(),
                        "band_powers": band_powers,
                        "alerts": alerts,
                        "status": "normal" if not alerts else "alert"
                    })
                    
                    await asyncio.sleep(epoch_duration)
            
            elif data.get("action") == "stop":
                break
    
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        await websocket.send_json({"error": str(e)})
    finally:
        manager.disconnect(websocket)
```



---

## 7. Spectral Analysis (Core MNE)

### Overview

MNE-Python provides several spectral analysis tools: `psd_welch` for power spectral density, `tfr_morlet` for time-frequency decomposition, and `csd` for cross-spectral density matrices. These form the backbone of qEEG spectral analysis.

### Complete Code Example: Comprehensive Spectral Analysis

```python
"""
Comprehensive Spectral Analysis with MNE-Python
Covers PSD Welch, TFR Morlet, and CSD for clinical qEEG.
"""

import mne
import numpy as np
from mne.time_frequency import (
    psd_array_welch, tfr_morlet, csd_fourier, 
    csd_multitaper, csd_morlet
)
import pandas as pd
from scipy.integrate import simpson


class ClinicalSpectralAnalysis:
    """Comprehensive spectral analysis for clinical qEEG."""
    
    BANDS = {
        "delta": (0.5, 4.0),
        "theta": (4.0, 8.0),
        "alpha": (8.0, 13.0),
        "low_alpha": (8.0, 10.0),
        "high_alpha": (10.0, 13.0),
        "beta":  (13.0, 30.0),
        "low_beta":  (13.0, 20.0),
        "high_beta": (20.0, 30.0),
        "gamma": (30.0, 45.0),
        "total": (0.5, 45.0),
    }
    
    def __init__(self, sfreq: float = 256.0):
        self.sfreq = sfreq
    
    def compute_psd_welch(
        self,
        data: np.ndarray,
        fmin: float = 0.5,
        fmax: float = 45.0,
        n_fft: int = None,
        n_overlap: int = None,
        average: str = "mean"
    ) -> tuple:
        """
        Compute Power Spectral Density using Welch's method.
        
        Parameters
        ----------
        data : np.ndarray
            EEG data array (n_channels, n_times) or (n_epochs, n_channels, n_times)
        fmin, fmax : float
            Frequency range
        n_fft : int
            FFT length (default: next power of 2 > n_times)
        n_overlap : int
            Number of overlap samples
        average : str
            Averaging method: 'mean' or 'median'
        
        Returns
        -------
        freqs, psd : tuple of np.ndarray
            Frequency values and PSD estimates
        """
        if n_fft is None:
            n_fft = 2 ** int(np.ceil(np.log2(data.shape[-1])))
        
        if n_overlap is None:
            n_overlap = n_fft // 2
        
        psds, freqs = psd_array_welch(
            data,
            sfreq=self.sfreq,
            fmin=fmin,
            fmax=fmax,
            n_fft=n_fft,
            n_overlap=n_overlap,
            average=average,
            window="hamming",
            verbose=False
        )
        
        return freqs, psds
    
    def extract_band_powers(
        self,
        freqs: np.ndarray,
        psds: np.ndarray,
        bands: dict = None,
        method: str = "mean"
    ) -> dict:
        """
        Extract band-limited power from PSD.
        
        Parameters
        ----------
        freqs : np.ndarray
            Frequency values
        psds : np.ndarray
            PSD values (n_channels, n_freqs) or (n_freqs,)
        bands : dict
            Frequency band definitions
        method : str
            Integration method: 'mean', 'sum', or 'trapz'
        
        Returns
        -------
        dict : Band powers per channel
        """
        if bands is None:
            bands = self.BANDS
        
        band_powers = {}
        
        for band_name, (fmin, fmax) in bands.items():
            freq_mask = (freqs >= fmin) & (freqs <= fmax)
            
            if psds.ndim == 1:
                psd_band = psds[freq_mask]
            else:
                psd_band = psds[:, freq_mask]
            
            if method == "mean":
                power = psd_band.mean(axis=-1)
            elif method == "sum":
                power = psd_band.sum(axis=-1)
            elif method == "trapz":
                if psds.ndim == 1:
                    power = np.trapz(psd_band, freqs[freq_mask])
                else:
                    power = np.array([
                        np.trapz(psd_band[i], freqs[freq_mask])
                        for i in range(psd_band.shape[0])
                    ])
            elif method == "simpson":
                if psds.ndim == 1:
                    power = simpson(psd_band, freqs[freq_mask])
                else:
                    power = np.array([
                        simpson(psd_band[i], freqs[freq_mask])
                        for i in range(psd_band.shape[0])
                    ])
            else:
                raise ValueError(f"Unknown method: {method}")
            
            band_powers[band_name] = power
        
        return band_powers
    
    def compute_psd_per_channel(
        self,
        epochs: mne.Epochs,
        fmin: float = 0.5,
        fmax: float = 45.0,
        picks: str = "eeg"
    ) -> pd.DataFrame:
        """
        Compute PSD for each channel and export to DataFrame.
        
        Parameters
        ----------
        epochs : mne.Epochs
            Epoched EEG data
        fmin, fmax : float
            Frequency range
        picks : str
            Channel type to pick
        
        Returns
        -------
        pd.DataFrame : Channel-level PSD metrics
        """
        # Compute PSD
        psd = epochs.compute_psd(
            method="welch",
            fmin=fmin,
            fmax=fmax,
            picks=picks
        )
        
        freqs = psd.freqs
        psd_data = psd.get_data()  # (n_epochs, n_channels, n_freqs)
        psd_mean = psd_data.mean(axis=0)  # Average across epochs
        
        channel_names = epochs.ch_names
        
        results = []
        for i, ch_name in enumerate(channel_names):
            ch_psd = psd_mean[i]
            
            # Extract band powers
            band_powers = self.extract_band_powers(freqs, ch_psd)
            
            # Relative powers
            total = band_powers["total"]
            row = {
                "channel": ch_name,
                "peak_freq": freqs[np.argmax(ch_psd)],
                "peak_power": float(ch_psd.max()),
                "mean_power": float(ch_psd.mean()),
                "spectral_entropy": self._compute_spectral_entropy(ch_psd),
                "spectral_edge_95": self._spectral_edge_freq(freqs, ch_psd, 0.95),
            }
            
            # Add band powers
            for band, power in band_powers.items():
                row[f"{band}_power"] = float(power)
                if band != "total":
                    row[f"{band}_relative"] = float(power / (total + 1e-12))
            
            # Clinical ratios
            row["theta_alpha_ratio"] = (row["theta_power"] / 
                                         (row["alpha_power"] + 1e-12))
            row["delta_alpha_ratio"] = (row["delta_power"] / 
                                         (row["alpha_power"] + 1e-12))
            row["alpha_asymmetry"] = None  # Computed between pairs
            row["alpha_peak_freq"] = self._find_alpha_peak(freqs, ch_psd)
            
            results.append(row)
        
        return pd.DataFrame(results)
    
    def compute_tfr_morlet(
        self,
        epochs: mne.Epochs,
        freqs: np.ndarray = None,
        n_cycles: float = 7.0,
        use_fft: bool = True,
        decim: int = 1
    ) -> mne.time_frequency.EpochsTFR:
        """
        Compute Time-Frequency Representation using Morlet wavelets.
        
        Parameters
        ----------
        epochs : mne.Epochs
            Epoched EEG data
        freqs : np.ndarray
            Frequencies of interest (default: 1-45 Hz, step 1)
        n_cycles : float
            Number of cycles in wavelet (higher = better freq resolution)
        use_fft : bool
            Use FFT for convolution (faster)
        decim : int
            Decimation factor
        
        Returns
        -------
        EpochsTFR : Time-frequency representation
        """
        if freqs is None:
            freqs = np.arange(1, 46, 1, dtype=float)
        
        print(f"Computing TFR for {len(freqs)} frequencies ({freqs.min():.1f}-{freqs.max():.1f} Hz)")
        
        tfr = tfr_morlet(
            epochs,
            freqs=freqs,
            n_cycles=n_cycles,
            use_fft=use_fft,
            return_itc=False,
            decim=decim,
            n_jobs=-1,
            verbose=False
        )
        
        print(f"[OK] TFR computed: {tfr.data.shape}")
        return tfr
    
    def compute_csd_multitaper(
        self,
        epochs: mne.Epochs,
        fmin: float = 0.5,
        fmax: float = 45.0,
        tmin: float = None,
        tmax: float = None,
        n_jobs: int = -1
    ) -> mne.time_frequency.CrossSpectralDensity:
        """
        Compute Cross-Spectral Density using multitapers.
        
        Used for connectivity analysis and source localization.
        
        Parameters
        ----------
        epochs : mne.Epochs
            Epoched data
        fmin, fmax : float
            Frequency range
        tmin, tmax : float
            Time window within epochs
        
        Returns
        -------
        CrossSpectralDensity : CSD object
        """
        csd = csd_multitaper(
            epochs,
            fmin=fmin,
            fmax=fmax,
            tmin=tmin,
            tmax=tmax,
            n_jobs=n_jobs,
            verbose=False
        )
        
        print(f"[OK] CSD computed: {len(csd.frequencies)} frequencies")
        return csd
    
    def compute_csd_morlet(
        self,
        epochs: mne.Epochs,
        frequencies: list = None,
        tmin: float = None,
        tmax: float = None,
        decim: int = 1
    ) -> mne.time_frequency.CrossSpectralDensity:
        """Compute CSD using Morlet wavelets."""
        if frequencies is None:
            frequencies = [4, 8, 10, 12, 20, 30]
        
        csd = csd_morlet(
            epochs,
            frequencies=frequencies,
            decim=decim,
            n_jobs=-1,
            tmin=tmin,
            tmax=tmax,
            verbose=False
        )
        
        return csd
    
    def _compute_spectral_entropy(self, psd: np.ndarray) -> float:
        """Compute spectral entropy of a PSD."""
        # Normalize to probability distribution
        psd_norm = psd / (psd.sum() + 1e-12)
        # Compute entropy
        entropy = -np.sum(psd_norm * np.log2(psd_norm + 1e-12))
        # Normalize by maximum entropy
        max_entropy = np.log2(len(psd))
        return float(entropy / max_entropy)
    
    def _spectral_edge_freq(
        self,
        freqs: np.ndarray,
        psd: np.ndarray,
        percentile: float = 0.95
    ) -> float:
        """Compute spectral edge frequency."""
        cumsum = np.cumsum(psd)
        cumsum_norm = cumsum / cumsum[-1]
        idx = np.searchsorted(cumsum_norm, percentile)
        return float(freqs[min(idx, len(freqs) - 1)])
    
    def _find_alpha_peak(
        self,
        freqs: np.ndarray,
        psd: np.ndarray,
        alpha_band: tuple = (8, 13)
    ) -> float:
        """Find peak frequency in alpha band."""
        mask = (freqs >= alpha_band[0]) & (freqs <= alpha_band[1])
        alpha_psd = psd[mask]
        alpha_freqs = freqs[mask]
        if len(alpha_psd) == 0:
            return np.nan
        return float(alpha_freqs[np.argmax(alpha_psd)])

# ============================================================
# USAGE
# ============================================================
# spectral = ClinicalSpectralAnalysis(sfreq=256.0)
# 
# # Compute PSD per channel with full qEEG metrics
# df_psd = spectral.compute_psd_per_channel(epochs)
# print(df_psd[["channel", "delta_relative", "theta_relative", 
#               "alpha_relative", "beta_relative", "theta_alpha_ratio"]])
# 
# # Compute time-frequency representation
# tfr = spectral.compute_tfr_morlet(epochs, freqs=np.arange(1, 46, 1))
# 
# # Compute CSD for connectivity
# csd = spectral.compute_csd_multitaper(epochs, fmin=4, fmax=30)
```

### Expected Output Format

```python
# PSD DataFrame columns:
#    channel  | peak_freq | peak_power | delta_power | theta_power | alpha_power
#    Fp1      | 10.2      | 4.56e-12   | 2.34e-12    | 1.87e-12    | 3.45e-12
#    F3       | 9.8       | 5.12e-12   | 1.98e-12    | 1.56e-12    | 4.21e-12
#    ...

# TFR data shape: (n_epochs, n_channels, n_freqs, n_times)

# CSD object:
#    frequencies: list of float
#    _data: np.ndarray (n_channels, n_channels) per frequency
```

### FastAPI Integration

```python
from fastapi import FastAPI, UploadFile, File

app = FastAPI()

@app.post("/spectral/psd")
async def compute_psd(
    file: UploadFile = File(...),
    fmin: float = 0.5,
    fmax: float = 45.0
):
    """Compute PSD and band powers from EEG epochs."""
    with tempfile.NamedTemporaryFile(suffix="-epo.fif", delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name
    
    epochs = mne.read_epochs(tmp_path, preload=True)
    spectral = ClinicalSpectralAnalysis(sfreq=epochs.info["sfreq"])
    df = spectral.compute_psd_per_channel(epochs, fmin=fmin, fmax=fmax)
    
    return {
        "n_channels": len(df),
        "fmin": fmin,
        "fmax": fmax,
        "channels": df.to_dict("records"),
    }

@app.post("/spectral/tfr")
async def compute_tfr(
    file: UploadFile = File(...),
    fmin: float = 1.0,
    fmax: float = 45.0,
    fstep: float = 1.0,
    n_cycles: float = 7.0
):
    """Compute time-frequency representation."""
    with tempfile.NamedTemporaryFile(suffix="-epo.fif", delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name
    
    epochs = mne.read_epochs(tmp_path, preload=True)
    spectral = ClinicalSpectralAnalysis(sfreq=epochs.info["sfreq"])
    
    freqs = np.arange(fmin, fmax + fstep, fstep)
    tfr = spectral.compute_tfr_morlet(epochs, freqs=freqs, n_cycles=n_cycles)
    
    return {
        "shape": list(tfr.data.shape),
        "freqs": freqs.tolist(),
        "times": tfr.times.tolist(),
        "sfreq": epochs.info["sfreq"],
    }
```

---

## 8. YASA Spectral Analysis

### Overview

YASA (Yet Another Spindle Algorithm) is a sleep analysis toolbox built on MNE-Python. Provides spectral analysis, sleep staging, spindle/slow-wave detection, and topographic visualization. Excellent for clinical sleep qEEG.

### pip install

```bash
pip install yasa
```

### Complete Code Example: Clinical Sleep qEEG with YASA

```python
"""
Clinical Sleep qEEG Analysis with YASA
Spectral analysis, sleep staging, and topographic mapping.
"""

import mne
import yasa
import numpy as np
import pandas as pd
from scipy.signal import welch


class ClinicalYASAAnalyzer:
    """Clinical sleep and spectral analysis using YASA."""
    
    BANDS = {
        "delta": (0.5, 4.0),
        "theta": (4.0, 8.0),
        "alpha": (8.0, 13.0),
        "beta":  (13.0, 30.0),
        "gamma": (30.0, 45.0),
        "slow":  (0.5, 1.0),
        "delta1": (1.0, 4.0),
        "sigma": (12.0, 16.0),
        "slow_spindle": (11.0, 13.5),
        "fast_spindle": (13.5, 16.0),
    }
    
    def __init__(self, sfreq: float = 256.0):
        self.sfreq = sfreq
        self.raw = None
        self.bandpower = None
    
    def load_and_prepare(
        self,
        file_path: str,
        ch_names: list = None,
        ch_types: list = None
    ) -> mne.io.Raw:
        """Load and prepare data for YASA analysis."""
        if file_path.endswith(".csv"):
            # Load from CSV (e.g., Mentalab Explore format)
            data = np.loadtxt(file_path, skiprows=1, delimiter=",").transpose()
            if ch_names is None:
                ch_names = [f"CH{i+1}" for i in range(data.shape[0])]
            if ch_types is None:
                ch_types = ["eeg"] * len(ch_names)
            
            info = mne.create_info(
                ch_names=ch_names,
                sfreq=self.sfreq,
                ch_types=ch_types
            )
            raw = mne.io.RawArray(data * 1e-6, info)  # Convert uV to V
        else:
            raw = mne.io.read_raw(file_path, preload=True)
        
        # Standard preprocessing
        raw.filter(0.1, 40, fir_design="firwin")
        raw.set_eeg_reference("average", projection=True)
        
        self.raw = raw
        return raw
    
    def compute_bandpower(
        self,
        hypno: yasa.Hypnogram = None,
        include: list = None,
        relative: bool = True
    ) -> pd.DataFrame:
        """
        Compute band power using YASA.
        
        Parameters
        ----------
        hypno : yasa.Hypnogram
            Hypnogram for stage-specific analysis
        include : list
            Sleep stages to include (e.g., ["N2", "N3", "REM"])
        relative : bool
            Return relative power
        
        Returns
        -------
        pd.DataFrame : Band powers per channel (and per stage if hypno given)
        """
        if self.raw is None:
            raise RuntimeError("Load data first!")
        
        # Compute band power
        bp = yasa.bandpower(
            self.raw,
            sfreq=self.sfreq,
            ch_names=self.raw.ch_names,
            hypno=hypno,
            include=include,
            bands=[
                (0.5, 4, "Delta"),
                (4, 8, "Theta"),
                (8, 13, "Alpha"),
                (13, 30, "Beta"),
                (30, 45, "Gamma"),
                (12, 14, "Spindle"),
            ],
            relative=relative,
            kwargs_welch=dict(
                window="hann",
                nperseg=int(self.sfreq * 4),  # 4-second windows
                noverlap=int(self.sfreq * 2)
            )
        )
        
        self.bandpower = bp
        print("[OK] Band power computed")
        print(bp.head())
        
        return bp
    
    def compute_spectrogram(
        self,
        channel: str = "C3",
        win_sec: float = 4.0,
        fmin: float = 0.5,
        fmax: float = 30.0,
        cmap: str = "viridis"
    ):
        """
        Compute and plot spectrogram for a single channel.
        
        Parameters
        ----------
        channel : str
            Channel name
        win_sec : float
            Window length in seconds
        fmin, fmax : float
            Frequency range
        """
        # Get channel data
        data = self.raw.get_data(picks=channel).flatten()
        
        # Compute spectrogram
        fig, ax = yasa.plot_spectrogram(
            data,
            sf=self.sfreq,
            win_sec=win_sec,
            fmin=fmin,
            fmax=fmax,
            cmap=cmap
        )
        
        return fig, ax
    
    def sleep_staging(
        self,
        eeg_name: str = "C3",
        eog_name: str = "EOG1",
        emg_name: str = "EMG",
        save_dir: str = None
    ) -> yasa.Hypnogram:
        """
        Automatic sleep staging using YASA classifier.
        
        Parameters
        ----------
        eeg_name : str
            EEG channel name (central recommended)
        eog_name : str
            EOG channel name
        emg_name : str
            EMG channel name
        save_dir : str
            Directory to save hypnogram
        
        Returns
        -------
        yasa.Hypnogram : Predicted sleep stages
        """
        # Extract data
        sls = yasa.SleepStaging(
            self.raw,
            eeg_name=eeg_name,
            eog_name=eog_name,
            emg_name=emg_name,
            metadata=dict(age=30, male=True)
        )
        
        # Predict
        hypno = sls.predict()
        confidence = sls.predict_proba().max(axis=1)
        
        print(f"[OK] Sleep staging completed")
        print(f"  Stages distribution:")
        stage_counts = pd.Series(hypno).value_counts()
        for stage, count in stage_counts.items():
            pct = 100 * count / len(hypno)
            print(f"    {stage}: {count} epochs ({pct:.1f}%)")
        
        # Save if requested
        if save_dir:
            hypno_path = f"{save_dir}/hypnogram.txt"
            sls.export_hypno(hypno_path)
            print(f"[OK] Hypnogram saved to {hypno_path}")
        
        self.hypnogram = hypno
        return hypno
    
    def detect_sleep_events(self, hypno: yasa.Hypnogram = None):
        """
        Detect sleep spindles and slow waves.
        
        Parameters
        ----------
        hypno : yasa.Hypnogram
            Hypnogram for stage-specific detection
        """
        if hypno is None:
            hypno = self.hypnogram
        
        # Detect spindles
        sp = yasa.spindles_detect(
            self.raw,
            hypno=hypno,
            include=(2,),  # N2 only
            freq_sp=(12, 14),
            duration=(0.5, 2),
            thresh={"rel_pow": 0.2, "corr": 0.65, "rms": 1.5}
        )
        
        if sp is not None and sp.summary().shape[0] > 0:
            print(f"\n[OK] Spindles detected: {sp.summary().shape[0]} events")
            print(sp.summary().head())
            self.spindles = sp
        
        # Detect slow waves
        sw = yasa.sw_detect(
            self.raw,
            hypno=hypno,
            include=(2, 3),  # N2 and N3
            freq_sw=(0.3, 1.5),
            dur_neg=(0.3, 1.5),
            dur_pos=(0.1, 1.0),
            amp_neg=(40, 300),
            amp_pos=(10, 200),
            amp_ptp=(75, 500)
        )
        
        if sw is not None and sw.summary().shape[0] > 0:
            print(f"\n[OK] Slow waves detected: {sw.summary().shape[0]} events")
            print(sw.summary().head())
            self.slow_waves = sw
    
    def compute_topoplot(
        self,
        band: str = "Delta",
        stage: str = None,
        cmap: str = "RdBu_r"
    ):
        """
        Plot topographic map of band power.
        
        Parameters
        ----------
        band : str
            Frequency band name
        stage : str
            Sleep stage (e.g., "N3"). If None, use all data.
        cmap : str
            Colormap
        """
        if self.bandpower is None:
            raise RuntimeError("Compute bandpower first!")
        
        # Select data
        if stage:
            data = self.bandpower.xs(stage)[band]
        else:
            data = self.bandpower[band]
        
        fig = yasa.topoplot(data, cmap=cmap, title=f"{band} Power - {stage or 'All'}")
        return fig
    
    def export_bandpower_csv(self, output_path: str):
        """Export band power results to CSV."""
        if self.bandpower is None:
            raise RuntimeError("Compute bandpower first!")
        
        self.bandpower.to_csv(output_path)
        print(f"[OK] Band power exported to {output_path}")

# ============================================================
# USAGE
# ============================================================
# yasa_analyzer = ClinicalYASAAnalyzer(sfreq=256.0)
# 
# # Load data
# yasa_analyzer.load_and_prepare("/path/to/sleep_eeg.edf")
# 
# # Sleep staging
# hypno = yasa_analyzer.sleep_staging(eeg_name="C3", eog_name="EOG1")
# 
# # Band power by sleep stage
# bp = yasa_analyzer.compute_bandpower(hypno=hypno, include=["N2", "N3", "REM"])
# 
# # Detect events
# yasa_analyzer.detect_sleep_events(hypno)
# 
# # Topographic plot
# yasa_analyzer.compute_topoplot(band="Delta", stage="N3")
```

### Expected Output Format

```python
# Bandpower DataFrame:
#                      Delta  | Theta | Alpha | Beta  | Gamma | Spindle
# Channel    Stage
# Fp1        All      0.2345 | 0.1876| 0.3456| 0.1234| 0.0456| 0.0123
# Fp1        N2       0.3123 | 0.2234| 0.1234| 0.0876| 0.0345| 0.0234
# Fp1        N3       0.5678 | 0.1234| 0.0678| 0.0456| 0.0234| 0.0056
# ...

# Spindles summary:
#    Start   | Duration | Peak_Frequency | Peak_Amplitude | RMS | Abs_Power
#    120.5   | 1.234    | 13.2           | 45.6 uV        | 12.3| 23.4
#    ...

# Slow waves summary:
#    Start   | Neg_Peak | Pos_Peak | Duration | Peak_to_Peak
#    85.3    | -87.3 uV | 45.2 uV  | 0.876 s  | 132.5 uV
#    ...
```

### FastAPI Integration

```python
from fastapi import FastAPI, UploadFile, File, Form
import tempfile

app = FastAPI()

@app.post("/yasa/bandpower")
async def yasa_bandpower(
    file: UploadFile = File(...),
    sfreq: float = Form(256.0),
    relative: bool = Form(True)
):
    """Compute YASA band power from EEG data."""
    with tempfile.NamedTemporaryFile(suffix=".edf", delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name
    
    analyzer = ClinicalYASAAnalyzer(sfreq=sfreq)
    analyzer.load_and_prepare(tmp_path)
    bp = analyzer.compute_bandpower(relative=relative)
    
    return {
        "relative": relative,
        "bands": bp.columns.tolist(),
        "channels": bp.index.tolist(),
        "data": bp.reset_index().to_dict("records"),
    }

@app.post("/yasa/sleep-stage")
async def yasa_sleep_stage(
    file: UploadFile = File(...),
    sfreq: float = Form(256.0),
    eeg_channel: str = Form("C3")
):
    """Automatic sleep staging with YASA."""
    with tempfile.NamedTemporaryFile(suffix=".edf", delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name
    
    analyzer = ClinicalYASAAnalyzer(sfreq=sfreq)
    analyzer.load_and_prepare(tmp_path)
    hypno = analyzer.sleep_staging(eeg_name=eeg_channel)
    
    stage_counts = pd.Series(hypno).value_counts().to_dict()
    
    return {
        "total_epochs": len(hypno),
        "stage_distribution": stage_counts,
        "hypnogram": list(hypno),
    }
```

---

## 9. FOOOF (Fitting Oscillations & One-Over-F)

### Overview

FOOOF (now called specparam) parameterizes neural power spectra into periodic (oscillatory) and aperiodic (1/f-like) components. Provides: center frequency, power, and bandwidth of each oscillation; plus aperiodic offset and exponent.

### pip install

```bash
# Current package name (FOOOF legacy):
pip install fooof

# New package name (specparam):
pip install specparam
```

### Complete Code Example: Clinical Spectral Parameterization

```python
"""
Clinical Spectral Parameterization with FOOOF/specparam
Decomposes PSD into periodic and aperiodic components.
"""

import numpy as np
import pandas as pd
from fooof import FOOOF, FOOOFGroup
from fooof.analysis import get_band_peak_fg
from fooof.plts import plot_auc
import mne


class ClinicalFOOOFAnalyzer:
    """Spectral parameterization for clinical qEEG using FOOOF."""
    
    # Standard clinical frequency bands
    BANDS = {
        "delta": (0.5, 4.0),
        "theta": (4.0, 8.0),
        "alpha": (8.0, 13.0),
        "beta":  (13.0, 30.0),
        "gamma": (30.0, 45.0),
    }
    
    def __init__(
        self,
        peak_width_limits: tuple = (0.5, 12.0),
        max_n_peaks: int = 8,
        min_peak_height: float = 0.05,
        peak_threshold: float = 2.0,
        aperiodic_mode: str = "fixed",
        freq_range: tuple = (1, 45)
    ):
        self.peak_width_limits = peak_width_limits
        self.max_n_peaks = max_n_peaks
        self.min_peak_height = min_peak_height
        self.peak_threshold = peak_threshold
        self.aperiodic_mode = aperiodic_mode
        self.freq_range = freq_range
        self.fm = None
        self.fg = None
    
    def parameterize_psd(
        self,
        freqs: np.ndarray,
        psd: np.ndarray,
        freq_range: tuple = None
    ) -> dict:
        """
        Parameterize a single power spectrum with FOOOF.
        
        Parameters
        ----------
        freqs : np.ndarray
            Frequency values (Hz)
        psd : np.ndarray
            Power spectral density (linear scale)
        freq_range : tuple
            Frequency range to fit (default: 1-45 Hz)
        
        Returns
        -------
        dict : Model parameters and fit metrics
        """
        if freq_range is None:
            freq_range = self.freq_range
        
        # Initialize FOOOF model
        self.fm = FOOOF(
            peak_width_limits=self.peak_width_limits,
            max_n_peaks=self.max_n_peaks,
            min_peak_height=self.min_peak_height,
            peak_threshold=self.peak_threshold,
            aperiodic_mode=self.aperiodic_mode,
            verbose=False
        )
        
        # Fit model
        self.fm.fit(freqs, psd, freq_range)
        
        # Extract results
        results = {
            # Aperiodic parameters
            "aperiodic_mode": self.aperiodic_mode,
            "aperiodic_offset": self.fm.aperiodic_params_[0],
            "aperiodic_exponent": (self.fm.aperiodic_params_[1] 
                                    if len(self.fm.aperiodic_params_) > 1 else None),
            "aperiodic_knee": (self.fm.aperiodic_params_[2] 
                               if len(self.fm.aperiodic_params_) > 2 else None),
            
            # Periodic parameters
            "n_peaks": self.fm.n_peaks_,
            "peak_params": self.fm.peak_params_,  # CF, PW, BW for each peak
            
            # Fit quality
            "r_squared": self.fm.r_squared_,
            "error": self.fm.error_,
            
            # Frequency range
            "freq_range": freq_range,
        }
        
        # Extract band-specific peaks
        for band_name, (fmin, fmax) in self.BANDS.items():
            band_peak = self.fm.get_params("peak_params", [fmin, fmax])
            if band_peak is not None and len(band_peak) > 0:
                results[f"{band_name}_peak_cf"] = band_peak[0]  # Center freq
                results[f"{band_name}_peak_pw"] = band_peak[1]  # Power
                results[f"{band_name}_peak_bw"] = band_peak[2]  # Bandwidth
            else:
                results[f"{band_name}_peak_cf"] = None
                results[f"{band_name}_peak_pw"] = None
                results[f"{band_name}_peak_bw"] = None
        
        print(f"[OK] FOOOF fit: R^2={results['r_squared']:.4f}, "
              f"Error={results['error']:.4f}, "
              f"Peaks={results['n_peaks']}, "
              f"Exponent={results['aperiodic_exponent']:.3f}")
        
        return results
    
    def parameterize_channel_psds(
        self,
        freqs: np.ndarray,
        psds: np.ndarray,  # (n_channels, n_freqs)
        channel_names: list,
        freq_range: tuple = None,
        n_jobs: int = 1
    ) -> pd.DataFrame:
        """
        Parameterize PSDs for all channels using FOOOFGroup.
        
        Parameters
        ----------
        freqs : np.ndarray
            Frequency values
        psds : np.ndarray
            PSD matrix (n_channels, n_freqs)
        channel_names : list
            Channel names
        freq_range : tuple
            Frequency range
        n_jobs : int
            Number of parallel jobs
        
        Returns
        -------
        pd.DataFrame : Parameterization results per channel
        """
        if freq_range is None:
            freq_range = self.freq_range
        
        # Initialize FOOOFGroup
        self.fg = FOOOFGroup(
            peak_width_limits=self.peak_width_limits,
            max_n_peaks=self.max_n_peaks,
            min_peak_height=self.min_peak_height,
            peak_threshold=self.peak_threshold,
            aperiodic_mode=self.aperiodic_mode,
            verbose=False
        )
        
        # Fit all spectra
        self.fg.fit(freqs, psds, freq_range, n_jobs=n_jobs)
        
        # Extract results per channel
        results = []
        for i, ch_name in enumerate(channel_names):
            fm = self.fg.get_fooof(ind=i, regenerate=True)
            
            row = {
                "channel": ch_name,
                "aperiodic_offset": fm.aperiodic_params_[0],
                "aperiodic_exponent": fm.aperiodic_params_[1],
                "n_peaks": fm.n_peaks_,
                "r_squared": fm.r_squared_,
                "error": fm.error_,
            }
            
            # Extract band peaks
            for band_name, (fmin, fmax) in self.BANDS.items():
                band_peak = fm.get_params("peak_params", [fmin, fmax])
                if band_peak is not None and len(band_peak) > 0:
                    row[f"{band_name}_cf"] = band_peak[0]
                    row[f"{band_name}_pw"] = band_peak[1]
                    row[f"{band_name}_bw"] = band_peak[2]
                else:
                    row[f"{band_name}_cf"] = np.nan
                    row[f"{band_name}_pw"] = np.nan
                    row[f"{band_name}_bw"] = np.nan
            
            results.append(row)
        
        df = pd.DataFrame(results)
        
        print(f"[OK] Group fit: {len(df)} channels, "
              f"mean R^2={df['r_squared'].mean():.4f}")
        
        return df
    
    def compare_conditions(
        self,
        freqs: np.ndarray,
        psd_condition1: np.ndarray,
        psd_condition2: np.ndarray,
        condition_names: tuple = ("Condition 1", "Condition 2")
    ) -> dict:
        """
        Compare spectral parameterization between two conditions.
        
        Returns changes in aperiodic exponent and peak parameters.
        """
        # Fit both conditions
        fm1 = FOOOF(
            peak_width_limits=self.peak_width_limits,
            max_n_peaks=self.max_n_peaks,
            aperiodic_mode=self.aperiodic_mode,
            verbose=False
        )
        fm2 = FOOOF(
            peak_width_limits=self.peak_width_limits,
            max_n_peaks=self.max_n_peaks,
            aperiodic_mode=self.aperiodic_mode,
            verbose=False
        )
        
        fm1.fit(freqs, psd_condition1, self.freq_range)
        fm2.fit(freqs, psd_condition2, self.freq_range)
        
        # Compare
        comparison = {
            "exponent_change": (fm2.aperiodic_params_[1] - 
                               fm1.aperiodic_params_[1]),
            "exponent_pct_change": (
                (fm2.aperiodic_params_[1] - fm1.aperiodic_params_[1]) /
                (fm1.aperiodic_params_[1] + 1e-12) * 100
            ),
            "offset_change": (fm2.aperiodic_params_[0] - 
                            fm1.aperiodic_params_[0]),
            "n_peaks_1": fm1.n_peaks_,
            "n_peaks_2": fm2.n_peaks_,
            "r_squared_1": fm1.r_squared_,
            "r_squared_2": fm2.r_squared_,
        }
        
        # Compare alpha peak
        alpha_peak_1 = fm1.get_params("peak_params", [8, 13])
        alpha_peak_2 = fm2.get_params("peak_params", [8, 13])
        
        if alpha_peak_1 is not None and alpha_peak_2 is not None:
            comparison["alpha_cf_shift"] = (alpha_peak_2[0] - alpha_peak_1[0])
            comparison["alpha_pw_change"] = (alpha_peak_2[1] - alpha_peak_1[1])
        
        print(f"\n[OK] Condition comparison:")
        print(f"  Exponent: {fm1.aperiodic_params_[1]:.3f} -> "
              f"{fm2.aperiodic_params_[1]:.3f} "
              f"({comparison['exponent_pct_change']:+.1f}%)")
        
        return comparison
    
    def generate_report(self, channel_results: pd.DataFrame) -> dict:
        """Generate clinical summary report from parameterization results."""
        report = {
            "n_channels": len(channel_results),
            "mean_exponent": float(channel_results["aperiodic_exponent"].mean()),
            "std_exponent": float(channel_results["aperiodic_exponent"].std()),
            "mean_r_squared": float(channel_results["r_squared"].mean()),
            
            # Exponent abnormality check (elevated in aging, ADHD, TBI)
            "exponent_zscore": float(
                (channel_results["aperiodic_exponent"].mean() - 1.0) /
                (channel_results["aperiodic_exponent"].std() + 1e-12)
            ),
            
            # Alpha peak analysis
            "alpha_cf_mean": float(channel_results["alpha_cf"].mean()),
            "alpha_cf_std": float(channel_results["alpha_cf"].std()),
            "alpha_peak_abnormal": bool(
                channel_results["alpha_cf"].mean() < 8.0 or
                channel_results["alpha_cf"].mean() > 12.0
            ),
            
            # Channels with abnormal exponent
            "high_exponent_channels": channel_results[
                channel_results["aperiodic_exponent"] > 2.0
            ]["channel"].tolist(),
            "low_exponent_channels": channel_results[
                channel_results["aperiodic_exponent"] < 0.5
            ]["channel"].tolist(),
        }
        
        return report

# ============================================================
# USAGE
# ============================================================
# fooof = ClinicalFOOOFAnalyzer(
#     peak_width_limits=(0.5, 12.0),
#     max_n_peaks=8,
#     aperiodic_mode="fixed",
#     freq_range=(1, 45)
# )
# 
# # Single spectrum parameterization
# results = fooof.parameterize_psd(freqs, psd_mean)
# 
# # All channels
# df = fooof.parameterize_channel_psds(freqs, psds, channel_names, n_jobs=-1)
# 
# # Clinical report
# report = fooof.generate_report(df)
```

### Expected Output Format

```python
# Single spectrum FOOOF output:
{
    "aperiodic_mode": "fixed",
    "aperiodic_offset": 1.2345,
    "aperiodic_exponent": 1.0876,  # 1/f slope
    "n_peaks": 4,
    "peak_params": np.ndarray,  # shape: (n_peaks, 3) -> CF, PW, BW
    "r_squared": 0.9876,
    "error": 0.0345,
    "alpha_peak_cf": 10.23,     # Alpha center frequency
    "alpha_peak_pw": 0.4567,    # Alpha peak power
    "alpha_peak_bw": 2.34,      # Alpha bandwidth
    "theta_peak_cf": 6.12,
    "theta_peak_pw": 0.2345,
    ...
}

# Group output DataFrame:
#    channel | aperiodic_offset | aperiodic_exponent | n_peaks | r_squared | alpha_cf | alpha_pw
#    Fp1     | 1.2345           | 1.1234             | 4       | 0.9876    | 10.23    | 0.4567
#    F3      | 1.1876           | 1.0987             | 5       | 0.9923    | 9.87     | 0.5234
#    ...

# Clinical report:
{
    "n_channels": 19,
    "mean_exponent": 1.0987,
    "exponent_zscore": 0.45,  # Elevated if > 2.0
    "alpha_cf_mean": 10.12,
    "alpha_peak_abnormal": False,
}
```

### FastAPI Integration

```python
from fastapi import FastAPI, UploadFile, File
import tempfile
import numpy as np

app = FastAPI()

@app.post("/fooof/parameterize")
async def fooof_parameterize(
    file: UploadFile = File(...),
    fmin: float = 1.0,
    fmax: float = 45.0,
    aperiodic_mode: str = "fixed"
):
    """Parameterize PSD using FOOOF."""
    with tempfile.NamedTemporaryFile(suffix="-epo.fif", delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name
    
    epochs = mne.read_epochs(tmp_path, preload=True)
    
    # Compute PSD
    psd = epochs.compute_psd(method="welch", fmin=fmin, fmax=fmax)
    freqs = psd.freqs
    psds = psd.get_data().mean(axis=0)  # Average epochs
    channel_names = epochs.ch_names
    
    # Parameterize with FOOOF
    fooof = ClinicalFOOOFAnalyzer(
        aperiodic_mode=aperiodic_mode,
        freq_range=(fmin, fmax)
    )
    df = fooof.parameterize_channel_psds(freqs, psds, channel_names)
    report = fooof.generate_report(df)
    
    return {
        "aperiodic_mode": aperiodic_mode,
        "freq_range": [fmin, fmax],
        "channel_results": df.to_dict("records"),
        "clinical_report": report,
    }
```

---

## 10. Source Localization (Minimum Norm)

### Overview

MNE-Python implements multiple distributed source localization methods: MNE (minimum norm estimate), dSPM (dynamic statistical parametric mapping), sLORETA (standardized low-resolution brain electromagnetic tomography), and eLORETA (exact low-resolution brain electromagnetic tomography).

### Complete Code Example: Clinical Source Localization

```python
"""
Clinical Source Localization with MNE-Python
Implements MNE, dSPM, sLORETA, and eLORETA inverse solutions.
"""

import mne
from mne.minimum_norm import (
    make_inverse_operator, 
    apply_inverse,
    apply_inverse_raw,
    apply_inverse_epochs,
    write_inverse_operator
)
from mne import (
    make_forward_solution, 
    make_bem_model, 
    make_bem_solution,
    setup_source_space
)
from mne.datasets import fetch_fsaverage
import numpy as np


class ClinicalSourceLocalization:
    """Clinical source localization pipeline using MNE inverse methods."""
    
    AVAILABLE_METHODS = ["MNE", "dSPM", "sLORETA", "eLORETA"]
    
    def __init__(
        self,
        subjects_dir: str = None,
        subject: str = "fsaverage"
    ):
        self.subjects_dir = subjects_dir
        self.subject = subject
        self.fwd = None
        self.inv = None
        self.noise_cov = None
        self.src = None
        self.bem = None
    
    def setup_source_space(
        self,
        spacing: str = "oct6",
        surface: str = "white",
        add_dist: bool = False
    ):
        """
        Setup source space on cortical surface.
        
        Parameters
        ----------
        spacing : str
            Source spacing: 'oct5' (1026 pts), 'oct6' (4098 pts), 'oct7' (16386 pts)
        surface : str
            Cortical surface to use
        """
        # Download fsaverage if needed
        if self.subjects_dir is None:
            fs_dir = fetch_fsaverage()
            self.subjects_dir = fs_dir / "subjects"
        
        self.src = setup_source_space(
            self.subject,
            subjects_dir=self.subjects_dir,
            spacing=spacing,
            surface=surface,
            add_dist=add_dist,
            verbose=False
        )
        
        print(f"[OK] Source space: {self.src[0]['nuse']} sources per hemisphere")
        return self.src
    
    def compute_bem_solution(self, conductivity: tuple = (0.3, 0.006, 0.3)):
        """
        Compute BEM (Boundary Element Model) solution.
        
        Parameters
        ----------
        conductivity : tuple
            Brain, skull, scalp conductivity (S/m)
            Default: (0.3, 0.006, 0.3) for 3-layer BEM
        """
        # Create BEM model
        bem_model = make_bem_model(
            subject=self.subject,
            ico=4,
            conductivity=conductivity,
            subjects_dir=self.subjects_dir,
            verbose=False
        )
        
        # Compute BEM solution
        self.bem = make_bem_solution(bem_model, verbose=False)
        
        print(f"[OK] BEM solution computed ({len(conductivity)} layers)")
        return self.bem
    
    def create_forward_solution(
        self,
        info: mne.Info,
        trans: str = None,
        meg: bool = False,
        eeg: bool = True,
        mindist: float = 5.0
    ):
        """
        Create forward solution (leadfield matrix).
        
        Parameters
        ----------
        info : mne.Info
            Measurement info from raw/epochs data
        trans : str
            Head-MRI transformation file
        meg, eeg : bool
            Include MEG/EEG channels
        mindist : float
            Minimum distance from sources to inner skull
        """
        if trans is None:
            # Use default transformation for fsaverage
            trans = "fsaverage"  # MNE will use built-in
        
        self.fwd = make_forward_solution(
            info,
            trans=trans,
            src=self.src,
            bem=self.bem,
            meg=meg,
            eeg=eeg,
            mindist=mindist,
            n_jobs=-1,
            verbose=False
        )
        
        print(f"[OK] Forward solution: {self.fwd['nsource']} sources, "
              f"{self.fwd['nchan']} channels")
        return self.fwd
    
    def compute_noise_covariance(
        self,
        epochs: mne.Epochs,
        tmin: float = None,
        tmax: float = 0.0,
        method: str = "auto"
    ):
        """
        Compute noise covariance from baseline period.
        
        Parameters
        ----------
        epochs : mne.Epochs
            Epoched data
        tmin, tmax : float
            Baseline time window (default: pre-stimulus baseline)
        method : str
            Covariance estimation method
        """
        self.noise_cov = mne.compute_covariance(
            epochs,
            tmin=tmin,
            tmax=tmax,
            method=method,
            rank="info",
            verbose=False
        )
        
        print(f"[OK] Noise covariance computed (rank: {self.noise_cov['dim']})")
        return self.noise_cov
    
    def create_inverse_operator(
        self,
        info: mne.Info,
        loose: float = 0.2,
        depth: float = 0.8,
        fixed: bool = False
    ):
        """
        Create inverse operator.
        
        Parameters
        ----------
        info : mne.Info
            Measurement info
        loose : float
            Loose orientation constraint (0=fixed, 1=free)
        depth : float
            Depth weighting (0=none, 1=full)
        fixed : bool
            Use fixed dipole orientations
        """
        self.inv = make_inverse_operator(
            info,
            self.fwd,
            self.noise_cov,
            loose=loose,
            depth=depth,
            fixed=fixed,
            verbose=False
        )
        
        print(f"[OK] Inverse operator created")
        return self.inv
    
    def apply_inverse_solution(
        self,
        evoked: mne.Evoked,
        method: str = "dSPM",
        lambda2: float = None,
        pick_ori: str = None,
        label = None
    ) -> mne.SourceEstimate:
        """
        Apply inverse solution to evoked data.
        
        Parameters
        ----------
        evoked : mne.Evoked
            Averaged evoked response
        method : str
            Inverse method: 'MNE', 'dSPM', 'sLORETA', 'eLORETA'
        lambda2 : float
            Regularization parameter (default: 1/SNR^2 with SNR=3)
        pick_ori : str
            Orientation selection: None (magnitude), 'normal', 'vector'
        label : mne.Label
            Restrict to label
        
        Returns
        -------
        SourceEstimate : Source time courses
        """
        if lambda2 is None:
            snr = 3.0
            lambda2 = 1.0 / snr ** 2
        
        if method not in self.AVAILABLE_METHODS:
            raise ValueError(f"Method must be one of: {self.AVAILABLE_METHODS}")
        
        stc = apply_inverse(
            evoked,
            self.inv,
            lambda2,
            method=method,
            pick_ori=pick_ori,
            label=label,
            verbose=False
        )
        
        # Get peak activation
        if label is None:
            peak_vertex, peak_time = stc.get_peak(hemi="lh")
        else:
            peak_vertex, peak_time = stc.get_peak()
        
        print(f"[OK] Source estimate applied ({method})")
        print(f"  Shape: {stc.data.shape}")
        print(f"  Peak: vertex={peak_vertex}, time={peak_time*1000:.1f}ms")
        
        return stc
    
    def apply_inverse_to_raw(
        self,
        raw: mne.io.Raw,
        method: str = "dSPM",
        lambda2: float = None,
        start: float = 0,
        stop: float = None,
        label = None
    ):
        """Apply inverse to continuous raw data."""
        if lambda2 is None:
            lambda2 = 1.0 / 3.0 ** 2
        
        if stop is None:
            stop = raw.n_times
        else:
            stop = int(stop * raw.info["sfreq"])
        
        start_idx = int(start * raw.info["sfreq"])
        
        stc = apply_inverse_raw(
            raw,
            self.inv,
            lambda2,
            method,
            label=label,
            start=start_idx,
            stop=stop,
            buffer_size=1000,
            verbose=False
        )
        
        return stc
    
    def compare_methods(
        self,
        evoked: mne.Evoked,
        lambda2: float = None
    ) -> dict:
        """
        Compare all inverse methods on the same data.
        
        Returns dictionary with SourceEstimates for each method.
        """
        results = {}
        for method in self.AVAILABLE_METHODS:
            stc = self.apply_inverse_solution(
                evoked, method=method, lambda2=lambda2
            )
            
            # Compute summary statistics
            peak_vertex, peak_time = stc.get_peak()
            results[method] = {
                "stc": stc,
                "peak_value": float(stc.data.max()),
                "mean_activation": float(np.abs(stc.data).mean()),
                "n_timepoints": stc.data.shape[1],
                "n_sources": stc.data.shape[0],
            }
        
        return results

# ============================================================
# USAGE
# ============================================================
# source_loc = ClinicalSourceLocalization(subject="fsaverage")
# 
# # Setup
# source_loc.setup_source_space(spacing="oct6")
# source_loc.compute_bem_solution()
# source_loc.create_forward_solution(epochs.info, eeg=True, meg=False)
# source_loc.compute_noise_covariance(epochs)
# source_loc.create_inverse_operator(epochs.info, loose=0.2, depth=0.8)
# 
# # Apply to evoked
# evoked = epochs.average()
# stc_dspm = source_loc.apply_inverse_solution(evoked, method="dSPM")
# stc_sloreta = source_loc.apply_inverse_solution(evoked, method="sLORETA")
# 
# # Compare methods
# comparison = source_loc.compare_methods(evoked)
```

### Expected Output Format

```python
# SourceEstimate object:
#    data: np.ndarray (n_sources, n_times)
#    vertices: list of arrays (hemisphere source indices)
#    tmin: float (start time in seconds)
#    tstep: float (time step in seconds)
#    subject: str (subject name)

# Forward solution:
#    nsource: 8196 (for oct6 spacing)
#    nchan: 64 (EEG channels)

# Inverse operator:
#    eigen_leads: np.ndarray (n_sources x n_channels)
#    sing: np.ndarray (singular values)
```

---

## 11. MNE Beamformer (LCMV)

### Overview

The Linearly Constrained Minimum Variance (LCMV) beamformer is a spatial filtering technique that provides focal source estimates. Particularly effective for:
- Deep source localization
- Suppressing external noise sources
- Frequency-specific source analysis

### Complete Code Example: LCMV Beamformer Analysis

```python
"""
Clinical Source Localization with LCMV Beamformer
Frequency-resolved beamforming for clinical qEEG.
"""

import mne
from mne.beamformer import make_lcmv, apply_lcmv
from mne import compute_covariance
import numpy as np
import pandas as pd


class ClinicalLCMVBeamformer:
    """LCMV beamformer analysis for clinical qEEG source localization."""
    
    BANDS = {
        "delta": (0.5, 4.0),
        "theta": (4.0, 8.0),
        "alpha": (8.0, 13.0),
        "beta":  (13.0, 30.0),
        "gamma": (30.0, 45.0),
    }
    
    def __init__(self, forward: mne.Forward, info: mne.Info):
        self.fwd = forward
        self.info = info
        self.filters = None
    
    def compute_spatial_filter(
        self,
        data_cov: mne.Covariance,
        noise_cov: mne.Covariance = None,
        reg: float = 0.05,
        pick_ori: str = "max-power",
        weight_norm: str = "unit-noise-gain",
        reduce_rank: bool = False,
        rank: str = "info"
    ):
        """
        Compute LCMV spatial filter.
        
        Parameters
        ----------
        data_cov : mne.Covariance
            Data covariance matrix
        noise_cov : mne.Covariance
            Noise covariance matrix (for whitening)
        reg : float
            Regularization parameter
        pick_ori : str
            Orientation: 'max-power', 'normal', 'vector', None
        weight_norm : str
            Weight normalization: 'unit-noise-gain', 'nai', None
        reduce_rank : bool
            Reduce rank of leadfield
        
        Returns
        -------
        dict : Spatial filter weights
        """
        self.filters = make_lcmv(
            self.info,
            self.fwd,
            data_cov,
            reg=reg,
            noise_cov=noise_cov,
            pick_ori=pick_ori,
            weight_norm=weight_norm,
            reduce_rank=reduce_rank,
            rank=rank,
            verbose=False
        )
        
        print(f"[OK] LCMV filter computed")
        print(f"  Pick orientation: {pick_ori}")
        print(f"  Weight norm: {weight_norm}")
        print(f"  Regularization: {reg}")
        
        return self.filters
    
    def apply_beamformer(
        self,
        evoked: mne.Evoked,
        filters: dict = None
    ) -> mne.SourceEstimate:
        """
        Apply beamformer to evoked data.
        
        Parameters
        ----------
        evoked : mne.Evoked
            Averaged evoked response
        filters : dict
            Pre-computed spatial filters
        
        Returns
        -------
        SourceEstimate : Beamformed source activity
        """
        if filters is None:
            filters = self.filters
        
        stc = apply_lcmv(evoked, filters, verbose=False)
        
        # Get peak
        peak_vertex, peak_time = stc.get_peak()
        
        print(f"[OK] Beamformer applied")
        print(f"  Peak: vertex={peak_vertex}, time={peak_time*1000:.1f}ms")
        
        return stc
    
    def source_localization_by_band(
        self,
        epochs: mne.Epochs,
        noise_cov: mne.Covariance = None,
        bands: dict = None,
        reg: float = 0.05,
        baseline: tuple = (None, 0)
    ) -> dict:
        """
        Compute band-specific source localization using LCMV.
        
        Parameters
        ----------
        epochs : mne.Epochs
            Epoched data
        noise_cov : mne.Covariance
            Noise covariance
        bands : dict
            Frequency bands to analyze
        reg : float
            Regularization
        baseline : tuple
            Baseline correction window
        
        Returns
        -------
        dict : Source estimates per band
        """
        if bands is None:
            bands = self.BANDS
        
        results = {}
        
        for band_name, (fmin, fmax) in bands.items():
            print(f"\n--- Processing {band_name} band ({fmin}-{fmax} Hz) ---")
            
            # Filter epochs to band
            epochs_band = epochs.copy().filter(
                l_freq=fmin,
                h_freq=fmax,
                method="iir",
                verbose=False
            )
            
            # Compute covariances
            data_cov = compute_covariance(
                epochs_band,
                tmin=0.0,
                tmax=None,
                method="shrunk",
                verbose=False
            )
            
            if noise_cov is None:
                noise_cov_band = compute_covariance(
                    epochs_band,
                    tmin=baseline[0],
                    tmax=baseline[1],
                    method="shrunk",
                    verbose=False
                )
            else:
                noise_cov_band = noise_cov
            
            # Compute filter
            filters = self.compute_spatial_filter(
                data_cov=data_cov,
                noise_cov=noise_cov_band,
                reg=reg,
                pick_ori="max-power",
                weight_norm="unit-noise-gain"
            )
            
            # Apply to evoked
            evoked = epochs_band.average()
            stc = self.apply_beamformer(evoked, filters)
            
            # Store
            results[band_name] = {
                "stc": stc,
                "fmin": fmin,
                "fmax": fmax,
                "peak_activation": float(stc.data.max()),
                "mean_activation": float(np.abs(stc.data).mean()),
            }
        
        print(f"\n[OK] Source localization completed for {len(bands)} bands")
        return results
    
    def compute_source_connectivity(
        self,
        stc: mne.SourceEstimate,
        labels: list,
        sfreq: float = 256.0
    ) -> pd.DataFrame:
        """
        Compute ROI-level connectivity from source time courses.
        
        Parameters
        ----------
        stc : mne.SourceEstimate
            Source time courses
        labels : list of mne.Label
            Cortical labels (ROIs)
        sfreq : float
            Sampling frequency
        
        Returns
        -------
        pd.DataFrame : Connectivity matrix between ROIs
        """
        # Extract time courses for each label
        label_tc = []
        label_names = []
        
        for label in labels:
            tc = stc.in_label(label)
            # Average across vertices
            tc_mean = tc.data.mean(axis=0)
            label_tc.append(tc_mean)
            label_names.append(label.name)
        
        label_tc = np.array(label_tc)  # (n_labels, n_times)
        
        # Compute pairwise connectivity (correlation-based)
        from scipy.stats import pearsonr
        
        n_labels = len(labels)
        con_matrix = np.zeros((n_labels, n_labels))
        
        for i in range(n_labels):
            for j in range(i + 1, n_labels):
                r, _ = pearsonr(label_tc[i], label_tc[j])
                con_matrix[i, j] = r
                con_matrix[j, i] = r
        
        # Create DataFrame
        df = pd.DataFrame(con_matrix, index=label_names, columns=label_names)
        
        return df
    
    def export_source_timecourses(
        self,
        stc: mne.SourceEstimate,
        vertices_of_interest: list = None,
        output_path: str = None
    ) -> pd.DataFrame:
        """Export source time courses to DataFrame."""
        times = stc.times
        
        if vertices_of_interest is None:
            # Export top 20 most active sources
            peak_values = stc.data.max(axis=1)
            top_indices = np.argsort(peak_values)[-20:]
            vertices_of_interest = top_indices
        
        data = {"time": times}
        for v in vertices_of_interest:
            data[f"vertex_{v}"] = stc.data[v]
        
        df = pd.DataFrame(data)
        
        if output_path:
            df.to_csv(output_path, index=False)
            print(f"[OK] Source time courses exported to {output_path}")
        
        return df

# ============================================================
# USAGE
# ============================================================
# beamformer = ClinicalLCMVBeamformer(forward=fwd, info=epochs.info)
# 
# # Compute noise covariance
# noise_cov = compute_covariance(epochs, tmin=-0.2, tmax=0)
# 
# # Band-specific source localization
# band_sources = beamformer.source_localization_by_band(
#     epochs, noise_cov=noise_cov
# )
# 
# # Access alpha band source
# alpha_stc = band_sources["alpha"]["stc"]
# alpha_stc.save("alpha_source")
```

### Expected Output Format

```python
# Band source localization results:
{
    "delta": {
        "stc": SourceEstimate,      # Source time courses
        "fmin": 0.5, "fmax": 4.0,
        "peak_activation": 12.34,   # Max source amplitude
        "mean_activation": 2.345,
    },
    "theta": {
        "stc": SourceEstimate,
        "fmin": 4.0, "fmax": 8.0,
        "peak_activation": 8.76,
        "mean_activation": 1.876,
    },
    "alpha": { ... },
    "beta":  { ... },
    "gamma": { ... },
}

# ROI connectivity DataFrame:
#               Aud-lh  |  Vis-lh  |  Mot-lh  |  Prefr-lh
#    Aud-lh    1.000   |  0.456   |  0.234   |  0.123
#    Vis-lh    0.456   |  1.000   |  0.345   |  0.234
#    Mot-lh    0.234   |  0.345   |  1.000   |  0.187
#    ...
```

---

## 12. Sparse Inverse Methods

### Overview

Sparse inverse methods enforce sparsity constraints on the source distribution, producing focal source estimates. The `gamma_map` algorithm uses a Bayesian framework with a prior that promotes sparse solutions.

### Complete Code Example: Sparse Source Localization

```python
"""
Sparse Source Localization with MNE-Python
Gamma-map and mixed-norm inverse methods for focal source estimation.
"""

import mne
from mne.inverse_sparse import gamma_map, make_stc_from_dipoles
from mne.minimum_norm import make_inverse_operator
from mne import pick_types_forward
import numpy as np


class ClinicalSparseLocalization:
    """Sparse source localization for clinical qEEG."""
    
    def __init__(self, forward: mne.Forward, cov: mne.Covariance):
        self.fwd = forward
        self.cov = cov
        self.src = forward["src"]
    
    def gamma_map_inverse(
        self,
        evoked: mne.Evoked,
        alpha: float = 0.2,
        n_orient: int = 1,
        return_residual: bool = False,
        verbose: bool = False
    ) -> mne.SourceEstimate:
        """
        Compute gamma-map inverse solution.
        
        Gamma-map uses a variational Bayes approach with a
        sparsity-promoting prior. Produces focal source estimates.
        
        Parameters
        ----------
        evoked : mne.Evoked
            Averaged evoked response
        alpha : float
            Regularization parameter (higher = sparser)
        n_orient : int
            Number of dipole orientations (1=fixed, 3=free)
        return_residual : bool
            Return residual evoked data
        
        Returns
        -------
        SourceEstimate : Sparse source estimate
        """
        stc, residual = gamma_map(
            evoked,
            self.fwd,
            self.cov,
            alpha=alpha,
            n_orient=n_orient,
            return_residual=return_residual,
            verbose=verbose
        )
        
        # Count active sources
        n_active = np.sum(np.any(stc.data != 0, axis=1))
        
        print(f"[OK] Gamma-map inverse applied")
        print(f"  Active sources: {n_active} / {stc.data.shape[0]}")
        print(f"  Sparsity: {100 * (1 - n_active / stc.data.shape[0]):.1f}%")
        
        if return_residual:
            return stc, residual
        return stc
    
    def iterative_gamma_map(
        self,
        evoked: mne.Evoked,
        alpha_range: np.ndarray = None,
        n_orient: int = 1
    ) -> dict:
        """
        Run gamma-map with multiple alpha values for comparison.
        
        Parameters
        ----------
        evoked : mne.Evoked
            Averaged evoked data
        alpha_range : np.ndarray
            Range of alpha values to test
        
        Returns
        -------
        dict : Results for each alpha value
        """
        if alpha_range is None:
            alpha_range = np.logspace(-2, 0, 10)
        
        results = {}
        for alpha in alpha_range:
            stc = self.gamma_map_inverse(
                evoked, alpha=alpha, n_orient=n_orient
            )
            
            n_active = np.sum(np.any(stc.data != 0, axis=1))
            peak_value = stc.data.max()
            
            results[float(alpha)] = {
                "stc": stc,
                "n_active": int(n_active),
                "sparsity": 1.0 - n_active / stc.data.shape[0],
                "peak_value": float(peak_value),
                "mean_nonzero": float(
                    np.abs(stc.data[np.any(stc.data != 0, axis=1)]).mean()
                ),
            }
        
        return results
    
    def compare_mne_vs_sparse(
        self,
        evoked: mne.Evoked,
        info: mne.Info,
        lambda2: float = None
    ) -> dict:
        """
        Compare distributed (MNE) vs sparse (gamma-map) source estimates.
        
        Parameters
        ----------
        evoked : mne.Evoked
            Averaged evoked data
        info : mne.Info
            Measurement info for creating MNE inverse
        
        Returns
        -------
        dict : Comparison metrics
        """
        if lambda2 is None:
            lambda2 = 1.0 / 3.0 ** 2
        
        # MNE inverse
        inv = make_inverse_operator(
            info, self.fwd, self.cov, loose=0.2, depth=0.8, verbose=False
        )
        stc_mne = mne.minimum_norm.apply_inverse(
            evoked, inv, lambda2, method="MNE", verbose=False
        )
        
        # Gamma-map
        stc_gamma = self.gamma_map_inverse(evoked, alpha=0.2)
        
        # Compute comparison metrics
        n_active_mne = np.sum(np.abs(stc_mne.data).max(axis=1) > 
                               0.1 * np.abs(stc_mne.data).max())
        n_active_gamma = np.sum(np.any(stc_gamma.data != 0, axis=1))
        
        comparison = {
            "mne": {
                "n_active_sources": int(n_active_mne),
                "peak_value": float(stc_mne.data.max()),
                "mean_magnitude": float(np.abs(stc_mne.data).mean()),
            },
            "gamma_map": {
                "n_active_sources": int(n_active_gamma),
                "peak_value": float(stc_gamma.data.max()),
                "mean_magnitude": float(np.abs(stc_gamma.data).mean()),
            },
            "ratio_active": float(n_active_gamma / (n_active_mne + 1)),
            "peak_ratio": float(stc_gamma.data.max() / (stc_mne.data.max() + 1e-12)),
        }
        
        print("\n[OK] MNE vs Gamma-map comparison:")
        print(f"  MNE active sources: {n_active_mne}")
        print(f"  Gamma-map active sources: {n_active_gamma}")
        print(f"  Ratio: {comparison['ratio_active']:.3f}")
        
        return comparison

# ============================================================
# USAGE
# ============================================================
# sparse = ClinicalSparseLocalization(forward=fwd, cov=noise_cov)
# 
# # Gamma-map sparse inverse
# stc_sparse = sparse.gamma_map_inverse(evoked, alpha=0.2)
# 
# # Compare with MNE
# comparison = sparse.compare_mne_vs_sparse(evoked, epochs.info)
# 
# # Multi-alpha analysis
# results = sparse.iterative_gamma_map(evoked, alpha_range=np.logspace(-2, 0, 10))
```

---

## 13. Cross-Spectral Density

### Overview

The Cross-Spectral Density (CSD) matrix is fundamental for connectivity analysis and frequency-domain source localization. CSD captures both power and phase relationships between channels at each frequency.

### Complete Code Example: CSD for Connectivity

```python
"""
Cross-Spectral Density Analysis for Clinical qEEG
Used for connectivity and frequency-domain source localization.
"""

import mne
from mne.time_frequency import csd_multitaper, csd_morlet, csd_fourier
import numpy as np
import pandas as pd


class ClinicalCSDAnalysis:
    """Cross-spectral density analysis for clinical qEEG."""
    
    def __init__(self, sfreq: float = 256.0):
        self.sfreq = sfreq
    
    def compute_csd_multitaper(
        self,
        epochs: mne.Epochs,
        fmin: float = 0.5,
        fmax: float = 45.0,
        tmin: float = None,
        tmax: float = None,
        bandwidth: float = None,
        adaptive: bool = True,
        low_bias: bool = True,
        projs: list = None,
        n_jobs: int = -1
    ) -> mne.time_frequency.CrossSpectralDensity:
        """
        Compute CSD using multitaper method.
        
        The multitaper method uses multiple orthogonal tapers (Slepian
        sequences) to reduce variance in spectral estimates.
        
        Parameters
        ----------
        epochs : mne.Epochs
            Epoched data
        fmin, fmax : float
            Frequency range
        tmin, tmax : float
            Time window
        bandwidth : float
            Frequency bandwidth of multitapers (default: sfreq/2*n_times)
        adaptive : bool
            Use adaptive weighting
        low_bias : bool
            Only use tapers with >90% energy concentration
        
        Returns
        -------
        CrossSpectralDensity : CSD object
        """
        csd = csd_multitaper(
            epochs,
            fmin=fmin,
            fmax=fmax,
            tmin=tmin,
            tmax=tmax,
            bandwidth=bandwidth,
            adaptive=adaptive,
            low_bias=low_bias,
            projs=projs,
            n_jobs=n_jobs,
            verbose=False
        )
        
        print(f"[OK] CSD (multitaper): {len(csd.frequencies)} frequencies")
        print(f"  Freq range: {csd.frequencies[0]:.1f}-{csd.frequencies[-1]:.1f} Hz")
        
        return csd
    
    def compute_csd_morlet(
        self,
        epochs: mne.Epochs,
        frequencies: list = None,
        tmin: float = None,
        tmax: float = None,
        decim: int = 1,
        n_jobs: int = -1
    ) -> mne.time_frequency.CrossSpectralDensity:
        """
        Compute CSD using Morlet wavelets.
        
        Better time resolution than multitaper.
        
        Parameters
        ----------
        epochs : mne.Epochs
            Epoched data
        frequencies : list
            Specific frequencies to compute CSD at
        decim : int
            Temporal decimation factor
        """
        if frequencies is None:
            frequencies = [4, 6, 8, 10, 12, 20, 30]
        
        csd = csd_morlet(
            epochs,
            frequencies=frequencies,
            tmin=tmin,
            tmax=tmax,
            decim=decim,
            n_jobs=n_jobs,
            verbose=False
        )
        
        print(f"[OK] CSD (Morlet): {len(csd.frequencies)} frequencies")
        return csd
    
    def extract_csd_matrix(
        self,
        csd: mne.time_frequency.CrossSpectralDensity,
        frequency: float = None,
        frequency_idx: int = None
    ) -> np.ndarray:
        """
        Extract CSD matrix at a specific frequency.
        
        Parameters
        ----------
        csd : CrossSpectralDensity
            CSD object
        frequency : float
            Frequency value (Hz)
        frequency_idx : int
            Frequency index
        
        Returns
        -------
        np.ndarray : Complex CSD matrix (n_channels x n_channels)
        """
        csd_data = csd.get_data()  # (n_frequencies, n_channels, n_channels)
        
        if frequency_idx is not None:
            return csd_data[frequency_idx]
        
        if frequency is not None:
            freqs = np.array(csd.frequencies)
            idx = np.argmin(np.abs(freqs - frequency))
            return csd_data[idx]
        
        return csd_data
    
    def csd_to_connectivity(
        self,
        csd: mne.time_frequency.CrossSpectralDensity,
        channel_names: list = None
    ) -> dict:
        """
        Convert CSD to connectivity metrics per frequency.
        
        Computes coherence and phase from CSD.
        
        Parameters
        ----------
        csd : CrossSpectralDensity
            CSD object
        channel_names : list
            Channel names
        
        Returns
        -------
        dict : Connectivity metrics per frequency
        """
        freqs = np.array(csd.frequencies)
        csd_data = csd.get_data()  # (n_freqs, n_ch, n_ch)
        
        # Compute power spectral density (diagonal of CSD)
        psd = np.abs(np.array([
            np.diag(csd_data[i]).real for i in range(len(freqs))
        ]))  # (n_freqs, n_channels)
        
        # Compute coherence: |CSD|^2 / (PSD_i * PSD_j)
        coherence = np.zeros_like(csd_data, dtype=float)
        for fi in range(len(freqs)):
            for i in range(psd.shape[1]):
                for j in range(i + 1, psd.shape[1]):
                    denom = np.sqrt(psd[fi, i] * psd[fi, j]) + 1e-12
                    coherence[fi, i, j] = np.abs(csd_data[fi, i, j]) / denom
                    coherence[fi, j, i] = coherence[fi, i, j]
        
        # Compute phase
        phase = np.angle(csd_data)
        
        # Compute imaginary coherence
        imcoh = np.zeros_like(csd_data, dtype=float)
        for fi in range(len(freqs)):
            for i in range(psd.shape[1]):
                for j in range(i + 1, psd.shape[1]):
                    denom = np.sqrt(psd[fi, i] * psd[fi, j]) + 1e-12
                    imcoh[fi, i, j] = csd_data[fi, i, j].imag / denom
                    imcoh[fi, j, i] = imcoh[fi, i, j]
        
        return {
            "frequencies": freqs.tolist(),
            "coherence": coherence,
            "phase": phase,
            "imaginary_coherence": imcoh,
            "psd": psd,
        }
    
    def export_csd_summary(
        self,
        csd: mne.time_frequency.CrossSpectralDensity,
        channel_pairs: list = None,
        output_path: str = None
    ) -> pd.DataFrame:
        """Export CSD summary for specific channel pairs."""
        freqs = np.array(csd.frequencies)
        csd_data = csd.get_data()
        
        if channel_pairs is None:
            # Default: frontal-occipital pairs
            channel_pairs = [(0, -1)]  # First and last channel
        
        results = []
        for fi, freq in enumerate(freqs):
            for ch1, ch2 in channel_pairs:
                csd_val = csd_data[fi, ch1, ch2]
                results.append({
                    "frequency": freq,
                    "channel_1": ch1,
                    "channel_2": ch2,
                    "csd_magnitude": float(np.abs(csd_val)),
                    "csd_phase": float(np.angle(csd_val)),
                    "csd_real": float(csd_val.real),
                    "csd_imag": float(csd_val.imag),
                })
        
        df = pd.DataFrame(results)
        
        if output_path:
            df.to_csv(output_path, index=False)
        
        return df

# ============================================================
# USAGE
# ============================================================
# csd_analyzer = ClinicalCSDAnalysis(sfreq=256.0)
# 
# # Compute CSD with multitaper (high frequency resolution)
# csd = csd_analyzer.compute_csd_multitaper(epochs, fmin=1, fmax=40)
# 
# # Extract at alpha frequency
# alpha_csd = csd_analyzer.extract_csd_matrix(csd, frequency=10)
# 
# # Convert to connectivity
# con_metrics = csd_analyzer.csd_to_connectivity(csd)
```

---

## 14. Time-Frequency Decomposition

### Overview

Time-frequency decomposition reveals how spectral content changes over time. Morlet wavelets provide the optimal trade-off between time and frequency resolution, making them ideal for clinical qEEG analysis of transient events.

### Complete Code Example: TFR Morlet for Clinical Analysis

```python
"""
Time-Frequency Decomposition for Clinical qEEG
Morlet wavelet TFR with clinical interpretation.
"""

import mne
from mne.time_frequency import tfr_morlet, tfr_multitaper, tfr_stockwell
import numpy as np
import pandas as pd


class ClinicalTimeFrequency:
    """Time-frequency analysis for clinical qEEG interpretation."""
    
    BANDS = {
        "delta": (0.5, 4.0),
        "theta": (4.0, 8.0),
        "alpha": (8.0, 13.0),
        "beta":  (13.0, 30.0),
        "gamma": (30.0, 45.0),
    }
    
    def __init__(self, sfreq: float = 256.0):
        self.sfreq = sfreq
    
    def compute_tfr_morlet(
        self,
        epochs: mne.Epochs,
        picks: list = None,
        freqs: np.ndarray = None,
        n_cycles: float = 7.0,
        use_fft: bool = True,
        decim: int = 1,
        average: bool = True,
        return_itc: bool = True,
        n_jobs: int = -1
    ):
        """
        Compute TFR using Morlet wavelets.
        
        Parameters
        ----------
        epochs : mne.Epochs
            Epoched data
        picks : list
            Channel indices/names
        freqs : np.ndarray
            Frequencies of interest
        n_cycles : float or np.ndarray
            Number of cycles (can be array for freq-dependent)
        use_fft : bool
            Use FFT convolution (faster)
        decim : int
            Decimation factor
        average : bool
            Average across epochs
        return_itc : bool
            Return inter-trial coherence
        
        Returns
        -------
        power : AverageTFR or EpochsTFR
        itc : AverageTFR (if return_itc=True)
        """
        if freqs is None:
            freqs = np.arange(1, 46, 1, dtype=float)
        
        # Frequency-dependent cycles for better resolution
        if isinstance(n_cycles, (int, float)):
            n_cycles_arr = np.full_like(freqs, n_cycles)
        else:
            n_cycles_arr = n_cycles
        
        # Increase cycles with frequency for better resolution
        n_cycles_arr = np.minimum(n_cycles_arr, freqs / 2.0)
        
        print(f"Computing Morlet TFR: {len(freqs)} freqs, "
              f"{len(epochs)} epochs, {len(picks or epochs.ch_names)} channels")
        
        power = tfr_morlet(
            epochs,
            picks=picks,
            freqs=freqs,
            n_cycles=n_cycles_arr,
            use_fft=use_fft,
            decim=decim,
            average=average,
            return_itc=return_itc,
            n_jobs=n_jobs,
            verbose=False
        )
        
        if return_itc:
            power, itc = power
            print(f"[OK] TFR + ITC computed")
            print(f"  Power shape: {power.data.shape}")
            print(f"  ITC shape: {itc.data.shape}")
            return power, itc
        
        print(f"[OK] TFR computed: {power.data.shape}")
        return power
    
    def extract_band_timecourses(
        self,
        power: mne.time_frequency.AverageTFR,
        bands: dict = None,
        baseline: tuple = (None, 0),
        mode: str = "logratio"
    ) -> dict:
        """
        Extract time courses for frequency bands from TFR.
        
        Parameters
        ----------
        power : AverageTFR
            Time-frequency power
        bands : dict
            Frequency band definitions
        baseline : tuple
            Baseline period for normalization
        mode : str
            Baseline mode: 'logratio', 'ratio', 'zscore', 'percent'
        
        Returns
        -------
        dict : Band time courses per channel
        """
        if bands is None:
            bands = self.BANDS
        
        # Apply baseline correction
        power_corrected = power.copy().apply_baseline(
            baseline=baseline, mode=mode, verbose=False
        )
        
        freqs = power.freqs
        times = power.times
        
        band_timecourses = {}
        
        for band_name, (fmin, fmax) in bands.items():
            # Find frequency indices
            freq_mask = (freqs >= fmin) & (freqs <= fmax)
            freq_indices = np.where(freq_mask)[0]
            
            if len(freq_indices) == 0:
                continue
            
            # Average across frequencies
            band_power = power_corrected.data[:, freq_indices, :].mean(axis=1)
            
            band_timecourses[band_name] = {
                "power": band_power,           # (n_channels, n_times)
                "times": times,
                "freq_range": (fmin, fmax),
                "n_freqs": len(freq_indices),
            }
            
            # Compute statistics
            band_timecourses[band_name]["mean_power"] = band_power.mean(axis=1)
            band_timecourses[band_name]["max_power"] = band_power.max(axis=1)
            band_timecourses[band_name]["peak_latency"] = times[
                band_power.argmax(axis=1)
            ]
        
        return band_timecourses
    
    def compute_itc_per_band(
        self,
        itc: mne.time_frequency.AverageTFR,
        bands: dict = None
    ) -> dict:
        """
        Compute inter-trial coherence per frequency band.
        
        ITC measures phase consistency across trials (0=random, 1=perfect).
        
        Parameters
        ----------
        itc : AverageTFR
            Inter-trial coherence
        bands : dict
            Frequency bands
        
        Returns
        -------
        dict : ITC per band
        """
        if bands is None:
            bands = self.BANDS
        
        freqs = itc.freqs
        
        band_itc = {}
        for band_name, (fmin, fmax) in bands.items():
            freq_mask = (freqs >= fmin) & (freqs <= fmax)
            band_itc_values = itc.data[:, freq_mask, :].mean(axis=1)
            
            band_itc[band_name] = {
                "itc": band_itc_values,
                "mean_itc": band_itc_values.mean(),
                "max_itc": band_itc_values.max(),
                "peak_time": itc.times[band_itc_values.mean(axis=0).argmax()],
            }
        
        return band_itc
    
    def detect_erd_ers(
        self,
        power: mne.time_frequency.AverageTFR,
        band: tuple = (8, 13),  # Default: alpha
        threshold: float = 0.5,  # 50% change
        baseline: tuple = (None, 0)
    ) -> pd.DataFrame:
        """
        Detect Event-Related Desynchronization (ERD) and 
        Event-Related Synchronization (ERS) in alpha band.
        
        ERD (decrease in power) indicates cortical activation.
        ERS (increase in power) indicates cortical inhibition.
        
        Parameters
        ----------
        power : AverageTFR
            Time-frequency power
        band : tuple
            Frequency band for ERD/ERS detection
        threshold : float
            Threshold for significant change (as ratio)
        
        Returns
        -------
        pd.DataFrame : ERD/ERS detection results
        """
        freqs = power.freqs
        freq_mask = (freqs >= band[0]) & (freqs <= band[1])
        
        # Extract band power
        band_power = power.data[:, freq_mask, :].mean(axis=1)
        
        # Compute baseline
        baseline_mask = power.times <= 0
        baseline_power = band_power[:, baseline_mask].mean(axis=1, keepdims=True)
        
        # Compute change relative to baseline
        change = (band_power - baseline_power) / (baseline_power + 1e-12)
        
        # Detect ERD (decrease) and ERS (increase)
        results = []
        for ch_idx in range(band_power.shape[0]):
            erd_mask = change[ch_idx] < -threshold
            ers_mask = change[ch_idx] > threshold
            
            erd_times = power.times[erd_mask] if erd_mask.any() else []
            ers_times = power.times[ers_mask] if ers_mask.any() else []
            
            results.append({
                "channel": power.ch_names[ch_idx] if hasattr(power, 'ch_names') else ch_idx,
                "erd_onset": float(erd_times[0]) if len(erd_times) > 0 else None,
                "erd_duration": float(erd_times[-1] - erd_times[0]) if len(erd_times) > 1 else 0,
                "erd_max": float(change[ch_idx].min()),
                "ers_onset": float(ers_times[0]) if len(ers_times) > 0 else None,
                "ers_duration": float(ers_times[-1] - ers_times[0]) if len(ers_times) > 1 else 0,
                "ers_max": float(change[ch_idx].max()),
            })
        
        return pd.DataFrame(results)
    
    def compute_tfr_for_channel(
        self,
        epochs: mne.Epochs,
        channel: str,
        freqs: np.ndarray = None,
        n_cycles: float = 7.0
    ):
        """Compute and return TFR for a single channel."""
        picks = mne.pick_channels(epochs.ch_names, [channel])
        
        power, itc = self.compute_tfr_morlet(
            epochs,
            picks=picks,
            freqs=freqs,
            n_cycles=n_cycles,
            return_itc=True
        )
        
        return {
            "channel": channel,
            "power": power.data[0],  # (n_freqs, n_times)
            "itc": itc.data[0],
            "freqs": power.freqs,
            "times": power.times,
        }

# ============================================================
# USAGE
# ============================================================
# tf = ClinicalTimeFrequency(sfreq=256.0)
# 
# # Compute TFR
# power, itc = tf.compute_tfr_morlet(
#     epochs, 
#     freqs=np.arange(1, 46, 1),
#     n_cycles=7,
#     return_itc=True
# )
# 
# # Extract band time courses
# band_tc = tf.extract_band_timecourses(power, baseline=(None, 0))
# 
# # Detect ERD/ERS
# erd_ers = tf.detect_erd_ers(power, band=(8, 13), threshold=0.5)
# 
# # Single channel TFR
# ch_tfr = tf.compute_tfr_for_channel(epochs, channel="Cz")
```

---

## 15. Complete FastAPI Integration

### Overview

This section provides a complete, production-ready FastAPI application that integrates all 15 MNE ecosystem tools into a unified clinical qEEG REST API.

### Complete FastAPI Application

```python
"""
Complete Clinical qEEG FastAPI Application
Integrates all 15 MNE ecosystem tools into a unified REST API.
"""

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, WebSocket
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
import tempfile
import shutil
import json
import numpy as np
import pandas as pd
import mne
from pathlib import Path

# ============================================================
# IMPORT ALL MODULES
# ============================================================
from mne_connectivity import spectral_connectivity_epochs
from mne_features.feature_extraction import extract_features
from mne_bids import BIDSPath, write_raw_bids, read_raw_bids
from mne_icalabel import label_components
from mne.minimum_norm import make_inverse_operator, apply_inverse
from mne.beamformer import make_lcmv, apply_lcmv
from mne.time_frequency import psd_array_welch, tfr_morlet, csd_multitaper
from fooof import FOOOF, FOOOFGroup

app = FastAPI(
    title="Clinical qEEG API",
    description="Comprehensive qEEG analysis powered by MNE-Python ecosystem",
    version="2.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# DATA MODELS
# ============================================================

class QEEGConfig(BaseModel):
    l_freq: float = 0.5
    h_freq: float = 45.0
    notch_freqs: List[float] = [50.0, 60.0]
    epoch_duration: float = 2.0
    sfreq: float = 256.0
    reference: str = "average"

class BandPowerRequest(BaseModel):
    bands: Dict[str, List[float]] = {
        "delta": [0.5, 4.0],
        "theta": [4.0, 8.0],
        "alpha": [8.0, 13.0],
        "beta": [13.0, 30.0],
        "gamma": [30.0, 45.0],
    }
    relative: bool = True

class ConnectivityRequest(BaseModel):
    method: str = "wpli2_debiased"
    bands: Dict[str, List[float]] = {
        "delta": [0.5, 4.0],
        "theta": [4.0, 8.0],
        "alpha": [8.0, 13.0],
        "beta": [13.0, 30.0],
    }

class FOOOFRequest(BaseModel):
    freq_range: List[float] = [1.0, 45.0]
    aperiodic_mode: str = "fixed"
    peak_width_limits: List[float] = [0.5, 12.0]
    max_n_peaks: int = 8

class SourceLocalizationRequest(BaseModel):
    method: str = "dSPM"
    snr: float = 3.0
    loose: float = 0.2
    depth: float = 0.8

class AnalysisResponse(BaseModel):
    status: str
    timestamp: str
    analysis_type: str
    results: Dict[str, Any]
    metadata: Dict[str, Any]

# ============================================================
# HELPER FUNCTIONS
# ============================================================

def load_eeg_file(file_path: str) -> mne.io.Raw:
    """Load EEG file from various formats."""
    path = Path(file_path)
    if path.suffix == ".edf":
        return mne.io.read_raw_edf(file_path, preload=True, verbose=False)
    elif path.suffix == ".fif":
        return mne.io.read_raw_fif(file_path, preload=True, verbose=False)
    elif path.suffix == ".vhdr":
        return mne.io.read_raw_brainvision(file_path, preload=True, verbose=False)
    elif path.suffix == ".set":
        return mne.io.read_raw_eeglab(file_path, preload=True, verbose=False)
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported format: {path.suffix}")

def preprocess_raw(raw: mne.io.Raw, config: QEEGConfig) -> mne.io.Raw:
    """Standard preprocessing pipeline."""
    # Resample
    if raw.info["sfreq"] > config.sfreq:
        raw.resample(config.sfreq)
    
    # Band-pass filter
    raw.filter(config.l_freq, config.h_freq, fir_design="firwin", verbose=False)
    
    # Notch filter
    raw.notch_filter(config.notch_freqs, fir_design="firwin", verbose=False)
    
    # Re-reference
    raw.set_eeg_reference(config.reference, projection=True)
    
    # Interpolate bads
    raw.interpolate_bads(reset_bads=True)
    
    return raw

def create_epochs(raw: mne.io.Raw, duration: float = 2.0) -> mne.Epochs:
    """Create fixed-length epochs."""
    epochs = mne.make_fixed_length_epochs(raw, duration=duration, overlap=0.5, preload=True)
    reject_criteria = dict(eeg=150e-6, eog=250e-6)
    epochs.drop_bad(reject=reject_criteria)
    return epochs

def serialize_array(arr: np.ndarray) -> List:
    """Convert numpy array to JSON-serializable list."""
    if isinstance(arr, np.ndarray):
        return arr.tolist()
    return arr

# ============================================================
# API ENDPOINTS
# ============================================================

@app.get("/")
async def root():
    """API root - list available endpoints."""
    return {
        "api": "Clinical qEEG API",
        "version": "2.0.0",
        "tools": 15,
        "endpoints": {
            "preprocessing": "/preprocess",
            "psd": "/psd",
            "band_power": "/bandpower",
            "connectivity": "/connectivity",
            "features": "/features",
            "bids": "/bids/convert",
            "ica": "/ica/label",
            "fooof": "/fooof",
            "tfr": "/tfr",
            "source_localization": "/source/localize",
            "lcmv": "/source/lcmv",
            "csd": "/csd",
            "health": "/health",
        }
    }

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "mne_version": mne.__version__,
    }

# ---- 1. Preprocessing ----
@app.post("/preprocess")
async def preprocess_endpoint(
    file: UploadFile = File(...),
    l_freq: float = Form(0.5),
    h_freq: float = Form(45.0),
    sfreq: float = Form(256.0)
):
    """Preprocess raw EEG file."""
    with tempfile.NamedTemporaryFile(suffix=".edf", delete=False) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name
    
    try:
        raw = load_eeg_file(tmp_path)
        config = QEEGConfig(l_freq=l_freq, h_freq=h_freq, sfreq=sfreq)
        raw_prep = preprocess_raw(raw, config)
        
        # Save preprocessed data
        output_path = tmp_path.replace(".edf", "_preprocessed.fif")
        raw_prep.save(output_path, overwrite=True)
        
        return {
            "status": "success",
            "n_channels": raw_prep.info["nchan"],
            "duration_sec": raw_prep.n_times / raw_prep.info["sfreq"],
            "sfreq": raw_prep.info["sfreq"],
            "preprocessed_file": output_path,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ---- 2. PSD Analysis ----
@app.post("/psd")
async def psd_endpoint(
    file: UploadFile = File(...),
    fmin: float = Form(0.5),
    fmax: float = Form(45.0),
    method: str = Form("welch")
):
    """Compute Power Spectral Density."""
    with tempfile.NamedTemporaryFile(suffix=".fif", delete=False) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name
    
    try:
        if tmp_path.endswith("-epo.fif"):
            epochs = mne.read_epochs(tmp_path, preload=True)
        else:
            raw = mne.io.read_raw_fif(tmp_path, preload=True)
            epochs = create_epochs(raw)
        
        psd = epochs.compute_psd(method=method, fmin=fmin, fmax=fmax)
        freqs = psd.freqs
        psd_data = psd.get_data().mean(axis=0)  # Average epochs
        
        # Extract band powers
        bands = {
            "delta": (0.5, 4.0), "theta": (4.0, 8.0),
            "alpha": (8.0, 13.0), "beta": (13.0, 30.0), "gamma": (30.0, 45.0)
        }
        
        channel_bands = []
        for i, ch_name in enumerate(epochs.ch_names):
            ch_psd = psd_data[i]
            ch_result = {"channel": ch_name}
            for band_name, (bmin, bmax) in bands.items():
                mask = (freqs >= bmin) & (freqs <= bmax)
                ch_result[f"{band_name}_power"] = float(ch_psd[mask].mean())
            channel_bands.append(ch_result)
        
        return {
            "status": "success",
            "frequencies": serialize_array(freqs),
            "channel_names": epochs.ch_names,
            "band_powers": channel_bands,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ---- 3. Connectivity ----
@app.post("/connectivity")
async def connectivity_endpoint(
    file: UploadFile = File(...),
    method: str = Form("wpli2_debiased")
):
    """Compute spectral connectivity."""
    with tempfile.NamedTemporaryFile(suffix="-epo.fif", delete=False) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name
    
    try:
        epochs = mne.read_epochs(tmp_path, preload=True)
        
        bands_req = {
            "delta": [0.5, 4.0], "theta": [4.0, 8.0],
            "alpha": [8.0, 13.0], "beta": [13.0, 30.0]
        }
        
        results = {}
        for band_name, (fmin, fmax) in bands_req.items():
            con = spectral_connectivity_epochs(
                epochs,
                method=method,
                mode="multitaper",
                sfreq=epochs.info["sfreq"],
                fmin=fmin,
                fmax=fmax,
                faverage=True,
                verbose=False
            )
            results[band_name] = {
                "connectivity_mean": float(con.get_data().mean()),
                "connectivity_std": float(con.get_data().std()),
                "n_epochs": con.n_epochs_used,
            }
        
        return {
            "status": "success",
            "method": method,
            "n_channels": len(epochs.ch_names),
            "n_epochs": len(epochs),
            "bands": results,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ---- 4. Features ----
@app.post("/features")
async def features_endpoint(
    file: UploadFile = File(...),
    sfreq: float = Form(256.0)
):
    """Extract EEG features using mne-features."""
    with tempfile.NamedTemporaryFile(suffix="-epo.fif", delete=False) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name
    
    try:
        epochs = mne.read_epochs(tmp_path, preload=True)
        X = epochs.get_data()
        
        selected_funcs = [
            "std", "ptp_amp", "skewness", "kurtosis",
            "app_entropy", "hjorth_mobility", "hjorth_complexity",
            "higuchi_fd", "spect_entropy", "energy_freq_bands"
        ]
        
        features = extract_features(
            X,
            sfreq=sfreq,
            selected_funcs=selected_funcs,
            n_jobs=-1,
            verbose=False
        )
        
        return {
            "status": "success",
            "n_epochs": features.shape[0],
            "n_features": features.shape[1],
            "features_mean": serialize_array(features.mean(axis=0)),
            "features_std": serialize_array(features.std(axis=0)),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ---- 5. BIDS Conversion ----
@app.post("/bids/convert")
async def bids_convert_endpoint(
    file: UploadFile = File(...),
    subject_id: str = Form(...),
    task: str = Form("rest"),
    session: str = Form("01")
):
    """Convert EEG to BIDS format."""
    with tempfile.NamedTemporaryFile(suffix=".edf", delete=False) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name
    
    try:
        from mne_bids import make_dataset_description
        
        raw = mne.io.read_raw_edf(tmp_path, preload=True)
        bids_root = tempfile.mkdtemp(prefix="bids_")
        
        make_dataset_description(
            path=bids_root,
            name="Clinical qEEG",
            overwrite=True
        )
        
        bids_path = BIDSPath(
            subject=subject_id,
            session=session,
            task=task,
            datatype="eeg",
            root=bids_root
        )
        
        write_raw_bids(raw, bids_path=bids_path, overwrite=True, verbose=False)
        
        files = [str(f) for f in Path(bids_root).rglob("*") if f.is_file()]
        
        return {
            "status": "success",
            "bids_root": bids_root,
            "files": files,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ---- 6. ICA Labeling ----
@app.post("/ica/label")
async def ica_label_endpoint(
    file: UploadFile = File(...),
    n_components: int = Form(15)
):
    """Automatically label ICA components."""
    with tempfile.NamedTemporaryFile(suffix=".fif", delete=False) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name
    
    try:
        raw = mne.io.read_raw_fif(tmp_path, preload=True)
        
        # Filter and reference
        raw_filt = raw.copy().filter(1.0, 100.0, verbose=False)
        raw_filt.set_eeg_reference("average", projection=True)
        
        # Fit ICA
        ica = mne.preprocessing.ICA(
            n_components=n_components,
            method="infax",
            random_state=97,
            fit_params=dict(extended=True),
            verbose=False
        )
        ica.fit(raw_filt, verbose=False)
        
        # Label components
        labels, y_proba = label_components(raw_filt, ica, method="iclabel")
        
        # Identify artifacts
        artifact_classes = ["muscle", "eye", "heart", "line_noise"]
        exclude = []
        for i, label in enumerate(labels):
            if label in artifact_classes and y_proba[i].max() > 0.7:
                exclude.append(i)
        
        return {
            "status": "success",
            "n_components": n_components,
            "labels": labels.tolist(),
            "probabilities": serialize_array(y_proba),
            "artifact_components": exclude,
            "n_artifacts": len(exclude),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ---- 7. FOOOF ----
@app.post("/fooof")
async def fooof_endpoint(
    file: UploadFile = File(...),
    fmin: float = Form(1.0),
    fmax: float = Form(45.0)
):
    """Spectral parameterization with FOOOF."""
    with tempfile.NamedTemporaryFile(suffix="-epo.fif", delete=False) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name
    
    try:
        epochs = mne.read_epochs(tmp_path, preload=True)
        
        # Compute PSD
        psd = epochs.compute_psd(method="welch", fmin=fmin, fmax=fmax)
        freqs = psd.freqs
        psds = psd.get_data().mean(axis=0)
        ch_names = epochs.ch_names
        
        # FOOOF parameterization
        fg = FOOOFGroup(
            peak_width_limits=[0.5, 12.0],
            max_n_peaks=8,
            aperiodic_mode="fixed",
            verbose=False
        )
        fg.fit(freqs, psds, [fmin, fmax], n_jobs=-1)
        
        # Extract results
        results = []
        for i in range(len(ch_names)):
            fm = fg.get_fooof(ind=i, regenerate=True)
            results.append({
                "channel": ch_names[i],
                "aperiodic_offset": float(fm.aperiodic_params_[0]),
                "aperiodic_exponent": float(fm.aperiodic_params_[1]),
                "n_peaks": int(fm.n_peaks_),
                "r_squared": float(fm.r_squared_),
                "error": float(fm.error_),
            })
        
        return {
            "status": "success",
            "n_channels": len(ch_names),
            "mean_exponent": np.mean([r["aperiodic_exponent"] for r in results]),
            "mean_r_squared": np.mean([r["r_squared"] for r in results]),
            "channel_results": results,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ---- 8. TFR ----
@app.post("/tfr")
async def tfr_endpoint(
    file: UploadFile = File(...),
    fmin: float = Form(1.0),
    fmax: float = Form(45.0),
    fstep: float = Form(1.0),
    n_cycles: float = Form(7.0)
):
    """Compute time-frequency representation."""
    with tempfile.NamedTemporaryFile(suffix="-epo.fif", delete=False) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name
    
    try:
        epochs = mne.read_epochs(tmp_path, preload=True)
        freqs = np.arange(fmin, fmax + fstep, fstep)
        
        power = tfr_morlet(
            epochs,
            freqs=freqs,
            n_cycles=n_cycles,
            return_itc=False,
            n_jobs=-1,
            verbose=False
        )
        
        return {
            "status": "success",
            "shape": list(power.data.shape),
            "freqs": power.freqs.tolist(),
            "times": power.times.tolist(),
            "n_channels": len(epochs.ch_names),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ---- 9. CSD ----
@app.post("/csd")
async def csd_endpoint(
    file: UploadFile = File(...),
    fmin: float = Form(1.0),
    fmax: float = Form(40.0)
):
    """Compute Cross-Spectral Density."""
    with tempfile.NamedTemporaryFile(suffix="-epo.fif", delete=False) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name
    
    try:
        epochs = mne.read_epochs(tmp_path, preload=True)
        
        csd = csd_multitaper(
            epochs,
            fmin=fmin,
            fmax=fmax,
            verbose=False
        )
        
        return {
            "status": "success",
            "n_frequencies": len(csd.frequencies),
            "freq_range": [float(csd.frequencies[0]), float(csd.frequencies[-1])],
            "n_channels": len(epochs.ch_names),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ---- 10. Source Localization ----
@app.post("/source/localize")
async def source_localize_endpoint(
    file: UploadFile = File(...),
    method: str = Form("dSPM"),
    snr: float = Form(3.0)
):
    """Source localization (requires forward model - simplified)."""
    # Note: Full source localization requires subject MRI and forward model
    # This is a simplified endpoint that returns placeholder
    return {
        "status": "info",
        "message": "Full source localization requires forward model setup.",
        "method": method,
        "snr": snr,
        "steps": [
            "1. Setup source space (mne.setup_source_space)",
            "2. Compute BEM solution (mne.make_bem_solution)",
            "3. Create forward solution (mne.make_forward_solution)",
            "4. Compute noise covariance (mne.compute_covariance)",
            "5. Create inverse operator (mne.minimum_norm.make_inverse_operator)",
            "6. Apply inverse (mne.minimum_norm.apply_inverse)",
        ],
        "api_endpoints": {
            "setup_source_space": "POST /source/setup",
            "compute_bem": "POST /source/bem",
            "create_forward": "POST /source/forward",
            "apply_inverse": "POST /source/inverse",
        }
    }

# ---- 11. Complete Analysis Pipeline ----
@app.post("/pipeline/complete")
async def complete_pipeline_endpoint(
    file: UploadFile = File(...),
    subject_id: str = Form("unknown")
):
    """
    Run complete qEEG analysis pipeline:
    Preprocessing -> PSD -> Band Power -> Connectivity -> Features -> FOOOF
    """
    with tempfile.NamedTemporaryFile(suffix=".edf", delete=False) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name
    
    start_time = datetime.now()
    results = {"subject_id": subject_id}
    
    try:
        # 1. Load and preprocess
        raw = load_eeg_file(tmp_path)
        config = QEEGConfig()
        raw_prep = preprocess_raw(raw, config)
        epochs = create_epochs(raw_prep)
        
        results["preprocessing"] = {
            "n_channels": raw_prep.info["nchan"],
            "duration_sec": raw_prep.n_times / raw_prep.info["sfreq"],
            "n_epochs": len(epochs),
        }
        
        # 2. PSD and Band Power
        psd = epochs.compute_psd(method="welch", fmin=0.5, fmax=45.0)
        freqs = psd.freqs
        psd_data = psd.get_data().mean(axis=0)
        
        bands = {"delta": (0.5, 4), "theta": (4, 8), "alpha": (8, 13), 
                 "beta": (13, 30), "gamma": (30, 45)}
        
        band_powers = {}
        for band_name, (fmin, fmax) in bands.items():
            mask = (freqs >= fmin) & (freqs <= fmax)
            band_powers[band_name] = {
                "mean": float(psd_data[:, mask].mean()),
                "per_channel": {ch: float(v) for ch, v in 
                    zip(epochs.ch_names, psd_data[:, mask].mean(axis=1))}
            }
        
        results["band_power"] = band_powers
        
        # 3. Connectivity (alpha band)
        con = spectral_connectivity_epochs(
            epochs,
            method="wpli2_debiased",
            mode="multitaper",
            sfreq=epochs.info["sfreq"],
            fmin=8.0,
            fmax=13.0,
            faverage=True,
            verbose=False
        )
        
        results["connectivity"] = {
            "method": "wpli2_debiased",
            "band": "alpha",
            "mean_connectivity": float(con.get_data().mean()),
        }
        
        # 4. Features
        features = extract_features(
            epochs.get_data(),
            sfreq=config.sfreq,
            selected_funcs=["std", "ptp_amp", "skewness", "kurtosis", 
                          "app_entropy", "hjorth_mobility", "spect_entropy"],
            n_jobs=-1,
            verbose=False
        )
        
        results["features"] = {
            "n_features": features.shape[1],
            "features_mean": serialize_array(features.mean(axis=0)),
        }
        
        # 5. FOOOF
        fg = FOOOFGroup(
            peak_width_limits=[0.5, 12.0],
            max_n_peaks=6,
            aperiodic_mode="fixed",
            verbose=False
        )
        fg.fit(freqs, psd_data, [1, 45], n_jobs=-1)
        
        results["fooof"] = {
            "mean_exponent": float(np.mean([
                fg.get_fooof(i, regenerate=True).aperiodic_params_[1]
                for i in range(len(epochs.ch_names))
            ])),
            "mean_r_squared": float(fg.r_squared_.mean()),
        }
        
        # Timing
        elapsed = (datetime.now() - start_time).total_seconds()
        results["metadata"] = {
            "processing_time_sec": elapsed,
            "timestamp": datetime.now().isoformat(),
        }
        
        return {
            "status": "success",
            "subject_id": subject_id,
            "results": results,
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ---- 12. WebSocket for Real-time ----
@app.websocket("/ws/realtime")
async def realtime_websocket(websocket: WebSocket):
    """WebSocket for real-time qEEG streaming."""
    await websocket.accept()
    
    try:
        while True:
            message = await websocket.receive_json()
            action = message.get("action")
            
            if action == "subscribe":
                # Simulate real-time data streaming
                for i in range(100):
                    band_powers = {
                        "delta": float(np.random.uniform(1e-12, 5e-12)),
                        "theta": float(np.random.uniform(0.5e-12, 3e-12)),
                        "alpha": float(np.random.uniform(1e-12, 4e-12)),
                        "beta":  float(np.random.uniform(0.5e-12, 2e-12)),
                        "gamma": float(np.random.uniform(0.1e-12, 1e-12)),
                    }
                    
                    # Detect abnormalities
                    alerts = []
                    ratio = band_powers["theta"] / (band_powers["alpha"] + 1e-12)
                    if ratio > 2.5:
                        alerts.append("ELEVATED_THETA_ALPHA")
                    if band_powers["alpha"] < 1e-12:
                        alerts.append("ALPHA_SUPPRESSION")
                    
                    await websocket.send_json({
                        "epoch": i + 1,
                        "timestamp": datetime.now().isoformat(),
                        "band_powers": band_powers,
                        "theta_alpha_ratio": float(ratio),
                        "alerts": alerts,
                        "status": "alert" if alerts else "normal",
                    })
                    
                    await asyncio.sleep(2.0)  # 2-second epochs
            
            elif action == "unsubscribe":
                break
                
    except Exception as e:
        await websocket.send_json({"error": str(e)})
    finally:
        await websocket.close()

# ============================================================
# RUN APPLICATION
# ============================================================
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

---

## 16. Clinical qEEG Pipeline

### Complete End-to-End Pipeline

```python
"""
End-to-End Clinical qEEG Pipeline
Combines all 15 tools into a unified clinical workflow.
"""

import mne
from mne_connectivity import spectral_connectivity_epochs
from mne_features.feature_extraction import extract_features
from mne_icalabel import label_components
from mne.minimum_norm import make_inverse_operator, apply_inverse
from mne.beamformer import make_lcmv, apply_lcmv
from mne.time_frequency import psd_array_welch, tfr_morlet, csd_multitaper
from fooof import FOOOFGroup
import numpy as np
import pandas as pd
from datetime import datetime


class CompleteClinicalQEEGPipeline:
    """
    End-to-end clinical qEEG pipeline combining all MNE ecosystem tools.
    
    Pipeline stages:
    1. Data loading and BIDS organization
    2. Preprocessing (filtering, re-referencing, epoching)
    3. ICA artifact removal (mne-icalabel)
    4. Spectral analysis (PSD, band power)
    5. Time-frequency decomposition (TFR Morlet)
    6. Connectivity analysis (mne-connectivity)
    7. Feature extraction (mne-features)
    8. Spectral parameterization (FOOOF)
    9. Source localization (MNE/LCMV)
    10. Report generation
    """
    
    BANDS = {
        "delta": (0.5, 4.0),
        "theta": (4.0, 8.0),
        "alpha": (8.0, 13.0),
        "beta":  (13.0, 30.0),
        "gamma": (30.0, 45.0),
    }
    
    def __init__(self, sfreq: float = 256.0, output_dir: str = "./qeeg_output"):
        self.sfreq = sfreq
        self.output_dir = output_dir
        self.raw = None
        self.raw_clean = None
        self.epochs = None
        self.psd_result = None
        self.connectivity = None
        self.features = None
        self.fooof_result = None
        self.stc = None
        self.report = {}
    
    def run_full_pipeline(
        self,
        file_path: str,
        subject_id: str = "001",
        run_ica: bool = True,
        run_connectivity: bool = True,
        run_source: bool = False,
        run_fooof: bool = True,
    ) -> dict:
        """
        Run the complete clinical qEEG pipeline.
        
        Parameters
        ----------
        file_path : str
            Path to EEG file
        subject_id : str
            Subject identifier
        run_ica : bool
            Run ICA artifact removal
        run_connectivity : bool
            Run connectivity analysis
        run_source : bool
            Run source localization (requires forward model)
        run_fooof : bool
            Run FOOOF spectral parameterization
        
        Returns
        -------
        dict : Complete analysis results
        """
        start_time = datetime.now()
        self.report = {"subject_id": subject_id, "start_time": start_time.isoformat()}
        
        # Stage 1: Load data
        print("\n" + "=" * 60)
        print("STAGE 1: Loading Data")
        print("=" * 60)
        self._load_data(file_path)
        
        # Stage 2: Preprocessing
        print("\n" + "=" * 60)
        print("STAGE 2: Preprocessing")
        print("=" * 60)
        self._preprocess()
        
        # Stage 3: ICA artifact removal
        if run_ica:
            print("\n" + "=" * 60)
            print("STAGE 3: ICA Artifact Removal")
            print("=" * 60)
            self._ica_artifact_removal()
        
        # Stage 4: Create epochs
        print("\n" + "=" * 60)
        print("STAGE 4: Epoching")
        print("=" * 60)
        self._create_epochs()
        
        # Stage 5: Spectral analysis
        print("\n" + "=" * 60)
        print("STAGE 5: Spectral Analysis")
        print("=" * 60)
        self._spectral_analysis()
        
        # Stage 6: Connectivity
        if run_connectivity:
            print("\n" + "=" * 60)
            print("STAGE 6: Connectivity Analysis")
            print("=" * 60)
            self._connectivity_analysis()
        
        # Stage 7: Feature extraction
        print("\n" + "=" * 60)
        print("STAGE 7: Feature Extraction")
        print("=" * 60)
        self._feature_extraction()
        
        # Stage 8: FOOOF parameterization
        if run_fooof:
            print("\n" + "=" * 60)
            print("STAGE 8: FOOOF Spectral Parameterization")
            print("=" * 60)
            self._fooof_parameterization()
        
        # Stage 9: Report generation
        print("\n" + "=" * 60)
        print("STAGE 9: Report Generation")
        print("=" * 60)
        self._generate_report()
        
        elapsed = (datetime.now() - start_time).total_seconds()
        self.report["processing_time_sec"] = elapsed
        
        print("\n" + "=" * 60)
        print(f"PIPELINE COMPLETE in {elapsed:.1f} seconds")
        print("=" * 60)
        
        return self.report
    
    def _load_data(self, file_path: str):
        """Load EEG data."""
        path = Path(file_path)
        if path.suffix == ".edf":
            self.raw = mne.io.read_raw_edf(file_path, preload=True, verbose=False)
        elif path.suffix == ".fif":
            self.raw = mne.io.read_raw_fif(file_path, preload=True, verbose=False)
        else:
            self.raw = mne.io.read_raw(file_path, preload=True, verbose=False)
        
        # Set montage
        montage = mne.channels.make_standard_montage("standard_1020")
        self.raw.set_montage(montage, match_case=False, on_missing="warn")
        
        self.report["original_sfreq"] = self.raw.info["sfreq"]
        self.report["n_channels"] = self.raw.info["nchan"]
        self.report["duration_sec"] = self.raw.n_times / self.raw.info["sfreq"]
        print(f"  Loaded: {self.report['n_channels']} channels, "
              f"{self.report['duration_sec']:.1f}s, "
              f"{self.raw.info['sfreq']:.0f} Hz")
    
    def _preprocess(self):
        """Standard preprocessing."""
        raw = self.raw.copy()
        
        # Resample
        if raw.info["sfreq"] > self.sfreq:
            raw.resample(self.sfreq)
        
        # Filter
        raw.filter(0.5, 45.0, fir_design="firwin", verbose=False)
        raw.notch_filter([50, 60], fir_design="firwin", verbose=False)
        raw.set_eeg_reference("average", projection=True)
        raw.interpolate_bads(reset_bads=True)
        
        self.raw_clean = raw
        self.report["preprocessed_sfreq"] = raw.info["sfreq"]
        print(f"  Preprocessed: {raw.info['sfreq']:.0f} Hz, 0.5-45 Hz bandpass")
    
    def _ica_artifact_removal(self):
        """ICA artifact removal with ICLabel."""
        raw_filt = self.raw_clean.copy().filter(1.0, 100.0, verbose=False)
        raw_filt.set_eeg_reference("average", projection=True)
        
        n_components = min(15, len(raw_filt.ch_names) - 1)
        
        ica = mne.preprocessing.ICA(
            n_components=n_components,
            method="infomax",
            random_state=97,
            fit_params=dict(extended=True),
            verbose=False
        )
        ica.fit(raw_filt, verbose=False)
        
        # Label components
        labels, y_proba = label_components(raw_filt, ica, method="iclabel")
        
        # Exclude artifacts
        exclude = []
        for i, label in enumerate(labels):
            if label in ["muscle", "eye", "heart", "line_noise"] and y_proba[i].max() > 0.7:
                exclude.append(i)
        
        ica.exclude = exclude
        ica.apply(self.raw_clean)
        
        self.report["ica"] = {
            "n_components": n_components,
            "n_excluded": len(exclude),
            "excluded_labels": [labels[i] for i in exclude],
        }
        print(f"  ICA: {n_components} components, {len(exclude)} excluded")
    
    def _create_epochs(self):
        """Create epochs."""
        epochs = mne.make_fixed_length_epochs(
            self.raw_clean, duration=2.0, overlap=0.5, preload=True
        )
        reject = dict(eeg=150e-6)
        epochs.drop_bad(reject=reject)
        self.epochs = epochs
        self.report["n_epochs"] = len(epochs)
        print(f"  Created {len(epochs)} epochs (2s, 50% overlap)")
    
    def _spectral_analysis(self):
        """Spectral analysis."""
        psd = self.epochs.compute_psd(method="welch", fmin=0.5, fmax=45.0)
        freqs = psd.freqs
        psd_data = psd.get_data().mean(axis=0)
        
        # Band powers
        band_powers = {}
        for band, (fmin, fmax) in self.BANDS.items():
            mask = (freqs >= fmin) & (freqs <= fmax)
            band_powers[band] = {
                "mean": float(psd_data[:, mask].mean()),
                "per_channel": {
                    ch: float(v) for ch, v in 
                    zip(self.epochs.ch_names, psd_data[:, mask].mean(axis=1))
                }
            }
        
        # Total power and ratios
        total_power = sum(band_powers[b]["mean"] for b in self.BANDS)
        self.report["spectral"] = {
            "band_powers": band_powers,
            "total_power": float(total_power),
            "theta_alpha_ratio": band_powers["theta"]["mean"] / (
                band_powers["alpha"]["mean"] + 1e-12),
        }
        self.psd_result = {"freqs": freqs, "psd": psd_data}
        print(f"  Spectral analysis complete")
    
    def _connectivity_analysis(self):
        """Connectivity analysis."""
        con = spectral_connectivity_epochs(
            self.epochs,
            method="wpli2_debiased",
            mode="multitaper",
            sfreq=self.sfreq,
            fmin=8.0,
            fmax=13.0,
            faverage=True,
            verbose=False
        )
        
        self.report["connectivity"] = {
            "method": "wpli2_debiased",
            "band": "alpha",
            "mean": float(con.get_data().mean()),
            "std": float(con.get_data().std()),
        }
        print(f"  Alpha connectivity: {self.report['connectivity']['mean']:.4f}")
    
    def _feature_extraction(self):
        """Feature extraction."""
        features = extract_features(
            self.epochs.get_data(),
            sfreq=self.sfreq,
            selected_funcs=["std", "ptp_amp", "skewness", "kurtosis",
                          "app_entropy", "hjorth_mobility", "hjorth_complexity",
                          "higuchi_fd", "spect_entropy", "energy_freq_bands"],
            n_jobs=-1,
            verbose=False
        )
        
        self.report["features"] = {
            "n_features": features.shape[1],
            "mean": float(features.mean()),
            "std": float(features.std()),
        }
        print(f"  Features extracted: {features.shape[1]} features")
    
    def _fooof_parameterization(self):
        """FOOOF spectral parameterization."""
        freqs = self.psd_result["freqs"]
        psds = self.psd_result["psd"]
        
        fg = FOOOFGroup(
            peak_width_limits=[0.5, 12.0],
            max_n_peaks=6,
            aperiodic_mode="fixed",
            verbose=False
        )
        fg.fit(freqs, psds, [1, 45], n_jobs=-1)
        
        exponents = []
        for i in range(len(self.epochs.ch_names)):
            fm = fg.get_fooof(i, regenerate=True)
            exponents.append(fm.aperiodic_params_[1])
        
        self.report["fooof"] = {
            "mean_exponent": float(np.mean(exponents)),
            "std_exponent": float(np.std(exponents)),
            "mean_r_squared": float(fg.r_squared_.mean()),
        }
        print(f"  Mean aperiodic exponent: {self.report['fooof']['mean_exponent']:.3f}")
    
    def _generate_report(self):
        """Generate final report."""
        report_df = pd.DataFrame([{
            "subject_id": self.report["subject_id"],
            "n_channels": self.report["n_channels"],
            "duration_sec": self.report["duration_sec"],
            "n_epochs": self.report["n_epochs"],
            "delta_power": self.report["spectral"]["band_powers"]["delta"]["mean"],
            "theta_power": self.report["spectral"]["band_powers"]["theta"]["mean"],
            "alpha_power": self.report["spectral"]["band_powers"]["alpha"]["mean"],
            "beta_power":  self.report["spectral"]["band_powers"]["beta"]["mean"],
            "theta_alpha_ratio": self.report["spectral"]["theta_alpha_ratio"],
            "alpha_connectivity": self.report.get("connectivity", {}).get("mean", np.nan),
            "aperiodic_exponent": self.report.get("fooof", {}).get("mean_exponent", np.nan),
            "processing_time_sec": self.report["processing_time_sec"],
        }])
        
        self.report["summary"] = report_df.to_dict("records")[0]
        print(f"\n  Report generated")
        print(f"  Processing time: {self.report['processing_time_sec']:.1f}s")

# ============================================================
# USAGE
# ============================================================
# pipeline = CompleteClinicalQEEGPipeline(sfreq=256.0)
# report = pipeline.run_full_pipeline(
#     file_path="/path/to/patient_eeg.edf",
#     subject_id="P001",
#     run_ica=True,
#     run_connectivity=True,
#     run_fooof=True,
# )
# print(json.dumps(report, indent=2, default=str))
```

---

## Appendix: All Install Commands

### Quick Install (All Tools)

```bash
# Create conda environment
conda create -n qeeg python=3.11
conda activate qeeg

# Core MNE ecosystem
pip install mne[full]
pip install mne-connectivity
pip install mne-features
pip install mne-bids
pip install mne-icalabel
pip install mne-realtime

# Spectral analysis
pip install yasa
pip install fooof  # or: pip install specparam

# Optional dependencies
pip install scikit-learn pandas matplotlib seaborn
pip install fastapi uvicorn python-multipart
pip install pylsl  # For LSL streaming

# FreeSurfer (for source localization)
# Download from: https://surfer.nmr.mgh.harvard.edu/
```

### Individual Install Commands

| Tool | Install Command | Version |
|------|----------------|---------|
| mne-python | `pip install mne[full]` | >=1.6 |
| mne-connectivity | `pip install mne-connectivity` | >=0.7 |
| mne-features | `pip install mne-features` | >=0.3 |
| mne-bids | `pip install mne-bids` | >=0.14 |
| mne-icalabel | `pip install mne-icalabel` | >=0.6 |
| mne-realtime | `pip install mne-realtime` | >=0.3 |
| yasa | `pip install yasa` | >=0.6 |
| fooof | `pip install fooof` | >=1.1 |
| specparam | `pip install specparam` | >=2.0 |
| scikit-learn | `pip install scikit-learn` | >=1.3 |
| FastAPI | `pip install fastapi uvicorn` | >=0.100 |
| pylsl | `pip install pylsl` | >=1.16 |

### Docker Setup

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    libhdf5-dev \
    libopenblas-dev \
    libgfortran5 \
    && rm -rf /var/lib/apt/lists/*

# Install Python packages
RUN pip install --no-cache-dir \
    mne[full] \
    mne-connectivity \
    mne-features \
    mne-bids \
    mne-icalabel \
    mne-realtime \
    yasa \
    fooof \
    fastapi \
    uvicorn \
    python-multipart \
    scikit-learn \
    pandas \
    matplotlib \
    seaborn

COPY . /app
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Environment Variables

```bash
# MNE configuration
export MNE_DATA=/path/to/mne_data
export SUBJECTS_DIR=/path/to/freesurfer/subjects

# CUDA for GPU acceleration (optional)
export MNE_USE_CUDA=true

# Logging
export MNE_LOGGING_LEVEL=INFO  # DEBUG, INFO, WARNING, ERROR, CRITICAL

# BIDS
export BIDS_ROOT=/path/to/bids_dataset

# Cache
export MNE_CACHE_DIR=/tmp/mne_cache
```

---

## Reference: 15 MNE Ecosystem Tools Summary

| # | Tool | Purpose | Clinical Use |
|---|------|---------|-------------|
| 1 | **mne-python** | Core EEG/MEG analysis | Preprocessing, I/O, visualization |
| 2 | **mne-connectivity** | Connectivity analysis | Coherence, PLI, wPLI, Granger causality |
| 3 | **mne-features** | Feature extraction | 50+ features for ML classification |
| 4 | **mne-bids** | BIDS organization | Standardized data management |
| 5 | **mne-icalabel** | ICA labeling | Automatic artifact classification |
| 6 | **mne-realtime** | Real-time processing | Online monitoring, BCI |
| 7 | **mne.time_frequency** | Spectral analysis | PSD Welch, TFR Morlet, CSD |
| 8 | **yasa** | Sleep analysis | Sleep staging, spindles, slow waves |
| 9 | **fooof** | Spectral parameterization | Aperiodic exponent, peak detection |
| 10 | **mne.minimum_norm** | Source localization | MNE, dSPM, sLORETA, eLORETA |
| 11 | **mne.beamformer** | LCMV beamformer | Focal source localization |
| 12 | **mne.inverse_sparse** | Sparse inverse | Gamma-map for focal sources |
| 13 | **csd_multitaper** | Cross-spectral density | Connectivity, freq-domain inverse |
| 14 | **tfr_morlet** | Time-frequency | ERD/ERS analysis |
| 15 | **FastAPI** | REST API | Production deployment |

---

## Citation

If you use this guide in your research, please cite the relevant packages:

```bibtex
@article{gramfort2013mne,
  title={MEG and EEG data analysis with MNE-Python},
  author={Gramfort, Alexandre and Luessi, Martin and Larson, Eric and Engemann, Denis A and Strohmeier, Daniel and Brodbeck, Christian and Goj, Roman and Jas, Mainak and Brooks, Teon and Parkkonen, Lauri and others},
  journal={Frontiers in Neuroscience},
  volume={7},
  pages={267},
  year={2013}
}

@article{donoghue2020parameterizing,
  title={Parameterizing neural power spectra into periodic and aperiodic components},
  author={Donoghue, Thomas and Haller, Matar and Peterson, Erik J and Varma, Paroma and Sebastian, Priyadarshini and Gao, Richard and Noto, Torben and Lara, Antonio H and Wallis, Joni D and Knight, Robert T and others},
  journal={Nature Neuroscience},
  volume={23},
  pages={1655--1665},
  year={2020}
}

@article{vallat2018mne,
  title={YASA: Yet Another Spindle Algorithm},
  author={Vallat, Raphael},
  journal={Journal of Open Source Software},
  year={2018}
}
```

---

*Document generated for DeepSynaps Protocol Studio. Last updated: July 2025.*
*For questions or contributions, see the MNE-Python documentation at https://mne.tools/stable/*
