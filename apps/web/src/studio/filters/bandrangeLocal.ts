const KEY = "ds_studio_eeg_bandranges_v1";

export type BandrangeMap = Record<string, readonly [number, number]>;

/** Clinician-edited bounds (Hz); merged with server defaults in Bandrange menus. */
export function loadBandrangeOverrides(): BandrangeMap {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const j = JSON.parse(raw) as unknown;
    if (!j || typeof j !== "object") return {};
    const out: BandrangeMap = {};
    for (const [k, v] of Object.entries(j as Record<string, unknown>)) {
      if (
        Array.isArray(v) &&
        v.length === 2 &&
        typeof v[0] === "number" &&
        typeof v[1] === "number"
      ) {
        out[k] = [v[0], v[1]];
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function saveBandrangeOverrides(map: BandrangeMap): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}
