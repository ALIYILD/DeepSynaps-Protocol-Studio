import { create } from "zustand";

/** WinEEG-style background row taxonomy (icon-only in this module). */
export type ChannelBackgroundState =
  | "bar"
  | "channel"
  | "contour"
  | "closed"
  | "photo"
  | "hipVen"
  | "art"
  | "spike";

export interface ViewerMarker {
  id: string;
  kind: "label" | "artifact" | "fragment" | "spike";
  fromSec: number;
  toSec?: number;
  text?: string;
  color?: string;
  channelScope?: "all" | "selection";
  channels?: string[];
}

export interface FragmentSlice {
  id: string;
  label: string;
  startSec: number;
  endSec: number;
  color: string;
}

export interface TrialSlice {
  id: string;
  index: number;
  startSec: number;
  endSec: number;
  /** ERP bar color bucket (mapped from stimulus class). */
  kind: string;
  included: boolean;
  stimulusClass?: string;
  responseMs?: number | null;
}

export interface EegViewerState {
  leftCursorSec: number | null;
  rightCursorSec: number | null;
  dragSelect: { startSec: number; endSec: number } | null;
  highlightChannelId: string | null;
  defaultGainUvPerCm: number;
  gainUvPerCmByChannel: Record<string, number>;
  backgroundByChannel: Record<string, ChannelBackgroundState>;
  markers: ViewerMarker[];
  fragments: FragmentSlice[];
  trials: TrialSlice[];
  photicHz: number | null;
  recordingDurationSec: number;
  hasVideo: boolean;
  lastViewport: { fromSec: number; toSec: number; channels: string[] } | null;

  setLeftCursorSec: (v: number | null) => void;
  setRightCursorSec: (v: number | null) => void;
  setDragSelect: (v: { startSec: number; endSec: number } | null) => void;
  setHighlightChannelId: (v: string | null) => void;
  setDefaultGainUvPerCm: (v: number) => void;
  setGainUvPerCmForChannel: (ch: string, v: number) => void;
  setBackground: (ch: string, s: ChannelBackgroundState) => void;
  setMarkers: (m: ViewerMarker[]) => void;
  addMarker: (m: Omit<ViewerMarker, "id"> & { id?: string }) => void;
  removeMarker: (id: string) => void;
  setFragments: (f: FragmentSlice[]) => void;
  setTrials: (t: TrialSlice[]) => void;
  toggleTrialIncluded: (id: string) => void;
  setPhoticHz: (v: number | null) => void;
  setRecordingMeta: (durationSec: number, hasVideo: boolean) => void;
  setLastViewport: (
    v: { fromSec: number; toSec: number; channels: string[] } | null,
  ) => void;
}

export const useEegViewerStore = create<EegViewerState>((set) => ({
  leftCursorSec: null,
  rightCursorSec: null,
  dragSelect: null,
  highlightChannelId: null,
  defaultGainUvPerCm: 7,
  gainUvPerCmByChannel: {},
  backgroundByChannel: {},
  markers: [],
  fragments: [],
  trials: [],
  photicHz: null,
  recordingDurationSec: 3600,
  hasVideo: false,
  lastViewport: null,

  setLeftCursorSec: (v) => set({ leftCursorSec: v }),
  setRightCursorSec: (v) => set({ rightCursorSec: v }),
  setDragSelect: (v) => set({ dragSelect: v }),
  setHighlightChannelId: (v) => set({ highlightChannelId: v }),
  setDefaultGainUvPerCm: (v) => set({ defaultGainUvPerCm: v }),
  setGainUvPerCmForChannel: (ch, v) =>
    set((s) => ({
      gainUvPerCmByChannel: { ...s.gainUvPerCmByChannel, [ch]: v },
    })),
  setBackground: (ch, st) =>
    set((s) => ({
      backgroundByChannel: { ...s.backgroundByChannel, [ch]: st },
    })),
  setMarkers: (m) => set({ markers: m }),
  addMarker: (m) =>
    set((s) => ({
      markers: [
        ...s.markers,
        {
          id: m.id ?? crypto.randomUUID(),
          kind: m.kind,
          fromSec: m.fromSec,
          toSec: m.toSec,
          text: m.text,
          color: m.color,
          channelScope: m.channelScope,
          channels: m.channels,
        },
      ],
    })),
  removeMarker: (id) =>
    set((s) => ({ markers: s.markers.filter((x) => x.id !== id) })),
  setFragments: (f) => set({ fragments: f }),
  setTrials: (t) => set({ trials: t }),
  toggleTrialIncluded: (id) =>
    set((s) => ({
      trials: s.trials.map((tr) =>
        tr.id === id ? { ...tr, included: !tr.included } : tr,
      ),
    })),
  setPhoticHz: (v) => set({ photicHz: v }),
  setRecordingMeta: (durationSec, hasVideo) =>
    set({ recordingDurationSec: durationSec, hasVideo }),
  setLastViewport: (v) => set({ lastViewport: v }),
}));

export const selectArtifactIntervals = (s: EegViewerState) =>
  s.markers.filter((m) => m.kind === "artifact" && m.toSec != null);

/** Trials included in ERP / averaging (M9 reads this). */
export const selectIncludedTrials = (s: EegViewerState) =>
  s.trials.filter((t) => t.included);
