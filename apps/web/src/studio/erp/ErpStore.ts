import { create } from "zustand";

import { ErpClient } from "./ErpClient";
import type { ErpComputeParams, ErpResult, ErpTrial } from "./types";
import { DEFAULT_ERP_PARAMS } from "./types";
import { useAiStore } from "../stores/ai";

export type ErpStoreState = {
  analysisId: string | null;
  params: ErpComputeParams;
  result: ErpResult | null;
  trials: ErpTrial[];
  includedIndexes: Set<number>;
  loading: boolean;
  error: string | null;
  recomputeTimer: ReturnType<typeof setTimeout> | null;
  setParams: (p: Partial<ErpComputeParams>) => void;
  compute: (analysisId: string) => Promise<void>;
  toggleTrial: (index: number) => void;
  setIncluded: (indexes: number[]) => void;
  recomputeDebounced: () => void;
  resetRecomputeTimer: () => void;
};

const DEBOUNCE_MS = 300;

function fireAiSnapshot(
  analysisId: string,
  params: ErpComputeParams,
  result: ErpResult,
  included: Set<number>,
) {
  useAiStore.getState().erpComputed({
    analysisId,
    params,
    peakSummary: result.peaks,
    nIncludedTrials: included.size,
    paradigmCode: params.paradigmCode ?? "Custom",
  });
}

export const useErpStore = create<ErpStoreState>((set, get) => ({
  analysisId: null,
  params: { ...DEFAULT_ERP_PARAMS },
  result: null,
  trials: [],
  includedIndexes: new Set(),
  loading: false,
  error: null,
  recomputeTimer: null,

  resetRecomputeTimer: () => {
    const t = get().recomputeTimer;
    if (t) clearTimeout(t);
    set({ recomputeTimer: null });
  },

  setParams: (p) => set((s) => ({ params: { ...s.params, ...p } })),

  compute: async (analysisId) => {
    const { params } = get();
    set({ loading: true, error: null, analysisId });
    try {
      const result = await ErpClient.compute(analysisId, params);
      const inc = new Set<number>();
      for (const t of result.trials) {
        if (t.included !== false) inc.add(t.index);
      }
      set({ result, trials: result.trials, includedIndexes: inc, loading: false });
      fireAiSnapshot(analysisId, params, result, inc);
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "compute failed",
        loading: false,
      });
    }
  },

  toggleTrial: (index) => {
    set((s) => {
      const next = new Set(s.includedIndexes);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return { includedIndexes: next };
    });
    get().recomputeDebounced();
  },

  setIncluded: (indexes) => {
    set({ includedIndexes: new Set(indexes) });
    get().recomputeDebounced();
  },

  recomputeDebounced: () => {
    const st = get();
    if (st.recomputeTimer) clearTimeout(st.recomputeTimer);
    const tid = setTimeout(() => {
      void (async () => {
        const { analysisId, params, includedIndexes, trials } = get();
        if (!analysisId || !trials.length) return;
        set({ loading: true, error: null });
        try {
          const idx = [...includedIndexes];
          const result = await ErpClient.recompute(analysisId, params, trials, idx, get().result);
          set({ result, trials: result.trials, loading: false });
          fireAiSnapshot(analysisId, params, result, includedIndexes);
        } catch (e) {
          set({
            error: e instanceof Error ? e.message : "recompute failed",
            loading: false,
          });
        }
      })();
    }, DEBOUNCE_MS);
    set({ recomputeTimer: tid });
  },
}));
