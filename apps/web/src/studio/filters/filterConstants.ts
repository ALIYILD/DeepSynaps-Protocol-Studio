/** WinEEG-style low cut (τ seconds, Butterworth HPF 1st order) */
export const LOW_CUT_SECONDS: { value: number; label: string }[] = [
  { value: 0, label: "Off" },
  { value: 0.05, label: "0.05 s" },
  { value: 0.1, label: "0.1 s" },
  { value: 0.16, label: "0.16 s" },
  { value: 0.3, label: "0.3 s" },
  { value: 0.53, label: "0.53 s" },
  { value: 1.0, label: "1.0 s" },
];

/** Butterworth LPF 2nd order — Hz */
export const HIGH_CUT_HZ: { value: number; label: string }[] = [
  { value: 0, label: "Off" },
  { value: 15, label: "15 Hz" },
  { value: 30, label: "30 Hz" },
  { value: 35, label: "35 Hz" },
  { value: 50, label: "50 Hz" },
  { value: 70, label: "70 Hz" },
  { value: 100, label: "100 Hz" },
];

/** Keys must match ``NOTCH_PRESETS`` in ``apps/api/app/eeg/filters_iir.py``. */
export const NOTCH_OPTIONS: { value: string; label: string; group: string }[] = [
  { value: "none", label: "Off", group: "None" },
  { value: "50", label: "50 Hz · narrow + harmonics", group: "50 Hz line" },
  { value: "50-bw45-55", label: "BW ~45–55 Hz", group: "50 Hz line" },
  { value: "50-bw40-50", label: "BW ~40–50 Hz", group: "50 Hz line" },
  { value: "50-bw35-65", label: "BW ~35–65 Hz", group: "50 Hz line" },
  { value: "50-bw55-65", label: "BW ~55–65 Hz", group: "50 Hz line" },
  { value: "50-bw50-60", label: "BW ~50–60 Hz", group: "50 Hz line" },
  { value: "50-bw45-75", label: "BW ~45–75 Hz", group: "50 Hz line" },
  { value: "60", label: "60 Hz · narrow + harmonics", group: "60 Hz line" },
  { value: "60-bw55-65", label: "BW ~55–65 Hz", group: "60 Hz line" },
];

export const GAIN_UV_CM_PRESETS = [3, 5, 7, 10, 15, 20] as const;
