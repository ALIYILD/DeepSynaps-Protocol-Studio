import { create } from "zustand";

export type ToolbarId =
  | "main"
  | "input"
  | "filters"
  | "analysis"
  | "maps"
  | "dipole"
  | "spectra"
  | "indices"
  | "erp"
  | "calculator"
  | "averagingGroup"
  | "channelNames"
  | "phonostim"
  | "biofeedback";

export type WindowKind =
  | "EEG"
  | "Spectra"
  | "Maps"
  | "MRI"
  | "ERP"
  | "Indices";

export interface TimeInterval {
  startSec: number;
  endSec: number;
}

export interface StatusMetrics {
  l: number | null;
  r: number | null;
  tRl: number | null;
  rMinusL: number | null;
  a: number | null;
  f: number | null;
  fs: number | null;
}

const defaultStatus: StatusMetrics = {
  l: null,
  r: null,
  tRl: null,
  rMinusL: null,
  a: null,
  f: null,
  fs: null,
};

const defaultToolbars: ToolbarId[] = [
  "main",
  "input",
  "filters",
  "analysis",
  "maps",
  "dipole",
  "spectra",
  "indices",
  "erp",
  "calculator",
  "averagingGroup",
  "channelNames",
  "phonostim",
  "biofeedback",
];

export interface ViewState {
  pageStartSec: number;
  secondsPerPage: number;
  gainPerChannel: Record<string, number>;
  selectedInterval: TimeInterval | null;
  activeWindow: WindowKind;
  visibleToolbars: ToolbarId[];
  statusMetrics: StatusMetrics;
  showStatusBar: boolean;
  setPageStartSec: (v: number) => void;
  setSecondsPerPage: (v: number) => void;
  setGainForChannel: (channelId: string, gain: number) => void;
  setSelectedInterval: (v: TimeInterval | null) => void;
  setActiveWindow: (w: WindowKind) => void;
  setVisibleToolbars: (ids: ToolbarId[]) => void;
  toggleToolbar: (id: ToolbarId) => void;
  setStatusMetrics: (p: Partial<StatusMetrics>) => void;
  setShowStatusBar: (v: boolean) => void;
}

export const useViewStore = create<ViewState>((set) => ({
  pageStartSec: 0,
  secondsPerPage: 10,
  gainPerChannel: {},
  selectedInterval: null,
  activeWindow: "EEG",
  visibleToolbars: defaultToolbars,
  statusMetrics: { ...defaultStatus },
  showStatusBar: true,
  setPageStartSec: (v) => set({ pageStartSec: v }),
  setSecondsPerPage: (v) => set({ secondsPerPage: v }),
  setGainForChannel: (channelId, gain) =>
    set((s) => ({
      gainPerChannel: { ...s.gainPerChannel, [channelId]: gain },
    })),
  setSelectedInterval: (v) => set({ selectedInterval: v }),
  setActiveWindow: (w) => set({ activeWindow: w }),
  setVisibleToolbars: (ids) => set({ visibleToolbars: ids }),
  toggleToolbar: (id) =>
    set((s) => {
      const on = s.visibleToolbars.includes(id);
      return {
        visibleToolbars: on
          ? s.visibleToolbars.filter((x) => x !== id)
          : [...s.visibleToolbars, id],
      };
    }),
  setStatusMetrics: (p) =>
    set((s) => ({ statusMetrics: { ...s.statusMetrics, ...p } })),
  setShowStatusBar: (v) => set({ showStatusBar: v }),
}));
