import { create } from "zustand";

/** Seconds for Butterworth HPF (WinEEG low-cut); 0 = off */
export const DEFAULT_LOW_CUT_S = 1.0;
/** Hz for Butterworth LPF; 0 = off */
export const DEFAULT_HIGH_CUT_HZ = 70;
export const DEFAULT_NOTCH = "50";

export type ChannelFilterValues = {
  lowCutS: number;
  highCutHz: number;
  notch: string;
};

export type ChannelFilterPatch = Partial<ChannelFilterValues>;

export interface FiltersState {
  baselineUv: number;
  globalLowCutS: number;
  globalHighCutHz: number;
  globalNotch: string;
  /** Full effective filter triple when user used Ctrl+change on this channel */
  overrides: Record<string, ChannelFilterValues>;
  setBaselineUv: (v: number) => void;
  setGlobalLowCutS: (v: number) => void;
  setGlobalHighCutHz: (v: number) => void;
  setGlobalNotch: (v: string) => void;
  /** Apply one control delta with optional per-highlight channel override */
  patchGlobalOrChannel: (
    field: keyof ChannelFilterValues,
    value: number | string,
    opts: { ctrl: boolean; channelId: string | null },
  ) => void;
  resetAll: () => void;
  effectiveForChannel: (name: string) => ChannelFilterValues;
  /** Non-empty JSON-able overrides for API (partial keys only where !== global) */
  serializeOverridesForApi: () => Record<string, Record<string, number | string>>;
  channelHasOverrideBadge: (name: string) => boolean;
}

function tripleEquals(a: ChannelFilterValues, b: ChannelFilterValues): boolean {
  return (
    a.lowCutS === b.lowCutS &&
    a.highCutHz === b.highCutHz &&
    a.notch === b.notch
  );
}

export const useFiltersStore = create<FiltersState>((set, get) => ({
  baselineUv: 0,
  globalLowCutS: DEFAULT_LOW_CUT_S,
  globalHighCutHz: DEFAULT_HIGH_CUT_HZ,
  globalNotch: DEFAULT_NOTCH,
  overrides: {},

  setBaselineUv: (v) => set({ baselineUv: v }),
  setGlobalLowCutS: (v) => set({ globalLowCutS: v }),
  setGlobalHighCutHz: (v) => set({ globalHighCutHz: v }),
  setGlobalNotch: (v) => set({ globalNotch: v }),

  resetAll: () =>
    set({
      baselineUv: 0,
      globalLowCutS: DEFAULT_LOW_CUT_S,
      globalHighCutHz: DEFAULT_HIGH_CUT_HZ,
      globalNotch: DEFAULT_NOTCH,
      overrides: {},
    }),

  effectiveForChannel: (name) => {
    const g = get();
    return g.overrides[name] ?? {
      lowCutS: g.globalLowCutS,
      highCutHz: g.globalHighCutHz,
      notch: g.globalNotch,
    };
  },

  patchGlobalOrChannel: (field, value, { ctrl, channelId }) => {
    const g = get();
    const num =
      typeof value === "number" ? value : Number(value);
    const str = typeof value === "string" ? value : String(value);

    if (!ctrl || !channelId) {
      if (field === "lowCutS") {
        const v = Number.isFinite(num) ? num : g.globalLowCutS;
        set({ globalLowCutS: v });
      } else if (field === "highCutHz") {
        const v = Number.isFinite(num) ? num : g.globalHighCutHz;
        set({ globalHighCutHz: v });
      } else {
        set({ globalNotch: str });
      }
      return;
    }

    const base = g.effectiveForChannel(channelId);
    const next: ChannelFilterValues = { ...base };
    if (field === "lowCutS" && Number.isFinite(num)) next.lowCutS = num;
    else if (field === "highCutHz" && Number.isFinite(num)) next.highCutHz = num;
    else if (field === "notch") next.notch = str;

    const glob: ChannelFilterValues = {
      lowCutS: g.globalLowCutS,
      highCutHz: g.globalHighCutHz,
      notch: g.globalNotch,
    };
    const overrides = { ...g.overrides };
    if (tripleEquals(next, glob)) delete overrides[channelId];
    else overrides[channelId] = next;
    set({ overrides });
  },

  serializeOverridesForApi: () => {
    const g = get();
    const glob = {
      lowCutS: g.globalLowCutS,
      highCutHz: g.globalHighCutHz,
      notch: g.globalNotch,
    };
    const out: Record<string, Record<string, number | string>> = {};
    for (const [ch, trip] of Object.entries(g.overrides)) {
      const row: Record<string, number | string> = {};
      if (trip.lowCutS !== glob.lowCutS) row.lowCutS = trip.lowCutS;
      if (trip.highCutHz !== glob.highCutHz) row.highCutHz = trip.highCutHz;
      if (trip.notch !== glob.notch) row.notch = trip.notch;
      if (Object.keys(row).length) out[ch] = row;
    }
    return out;
  },

  channelHasOverrideBadge: (name) => name in get().overrides,
}));
