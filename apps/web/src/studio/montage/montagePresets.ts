/** Built-in montage ids — must stay aligned with ``app/eeg/montage.py`` ``PRESET_SPECS``. */

export const DEFAULT_MONTAGE_ID = "builtin:raw";

export const BUILTIN_MONTAGE_OPTIONS: {
  id: string;
  label: string;
  hint?: string;
}[] = [
  { id: "builtin:raw", label: "Raw (reference as stored)" },
  { id: "builtin:mono-linked", label: "Monopolar — linked mastoids (A1+A2)/2" },
  { id: "builtin:banana", label: "Bipolar longitudinal (double banana)" },
  { id: "builtin:transverse", label: "Bipolar transverse" },
  { id: "builtin:circle", label: "Bipolar circle" },
  { id: "builtin:car", label: "Common average reference (CAR)" },
  { id: "builtin:laplacian-small", label: "Laplacian (small)" },
  { id: "builtin:laplacian-large", label: "Laplacian (large)" },
  { id: "builtin:rest", label: "REST (MNE)" },
  { id: "builtin:source", label: "Source montage (placeholder — M10)" },
];
