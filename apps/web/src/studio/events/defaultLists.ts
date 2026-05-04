/** Setup → Label List / Fragment Names — persisted in localStorage (M5). */

export const LABEL_LIST_KEY = "ds_studio_label_list_v1";
export const FRAGMENT_NAMES_KEY = "ds_studio_fragment_names_v1";

export const DEFAULT_LABEL_NAMES = [
  "EO",
  "EC",
  "Eyes open",
  "Eyes closed",
  "Photic",
  "HV",
  "Artifact",
  "Custom",
];

export const DEFAULT_FRAGMENT_NAMES = [
  "Eyes Open",
  "Eyes Closed",
  "Hyperventilation",
  "Photic 6 Hz",
  "Background",
  "Rest",
];

export function loadLabelNames(): string[] {
  try {
    const raw = localStorage.getItem(LABEL_LIST_KEY);
    if (!raw) return [...DEFAULT_LABEL_NAMES];
    const j = JSON.parse(raw) as unknown;
    if (!Array.isArray(j)) return [...DEFAULT_LABEL_NAMES];
    return j.filter((x): x is string => typeof x === "string");
  } catch {
    return [...DEFAULT_LABEL_NAMES];
  }
}

export function saveLabelNames(names: string[]): void {
  try {
    localStorage.setItem(LABEL_LIST_KEY, JSON.stringify(names));
  } catch {
    /* ignore */
  }
}

export function loadFragmentNames(): string[] {
  try {
    const raw = localStorage.getItem(FRAGMENT_NAMES_KEY);
    if (!raw) return [...DEFAULT_FRAGMENT_NAMES];
    const j = JSON.parse(raw) as unknown;
    if (!Array.isArray(j)) return [...DEFAULT_FRAGMENT_NAMES];
    return j.filter((x): x is string => typeof x === "string");
  } catch {
    return [...DEFAULT_FRAGMENT_NAMES];
  }
}

export function saveFragmentNames(names: string[]): void {
  try {
    localStorage.setItem(FRAGMENT_NAMES_KEY, JSON.stringify(names));
  } catch {
    /* ignore */
  }
}
