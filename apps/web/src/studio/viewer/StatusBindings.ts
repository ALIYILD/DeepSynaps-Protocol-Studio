import { useEffect, useMemo } from "react";
import { useViewStore } from "../stores/view";
import { useEegViewerStore } from "../stores/eegViewer";
import type { WindowResponse } from "./useEegStream";

function dominantFrequencyHz(
  samples: Float32Array,
  sampleRate: number,
): number | null {
  if (samples.length < 16) return null;
  let bestPow = 0;
  let bestF = 0;
  const n = samples.length;
  for (let f = 1; f <= 45; f++) {
    let re = 0;
    let im = 0;
    const w = (2 * Math.PI * f) / sampleRate;
    for (let i = 0; i < n; i++) {
      const a = w * i;
      re += samples[i]! * Math.cos(a);
      im -= samples[i]! * Math.sin(a);
    }
    const p = re * re + im * im;
    if (p > bestPow) {
      bestPow = p;
      bestF = f;
    }
  }
  return bestF > 0 ? bestF : null;
}

function peakToPeak(samples: Float32Array): number | null {
  if (samples.length === 0) return null;
  let mn = samples[0]!;
  let mx = samples[0]!;
  for (let i = 1; i < samples.length; i++) {
    const v = samples[i]!;
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  return mx - mn;
}

function sampleAtTime(
  samples: Float32Array,
  tSec: number,
  fromSec: number,
  sampleRate: number,
): number | null {
  if (!Number.isFinite(tSec)) return null;
  const idx = Math.round((tSec - fromSec) * sampleRate);
  if (idx < 0 || idx >= samples.length) return null;
  return samples[idx]!;
}

/** Syncs L/R/T/R-L/A/F and FS= into the shell status store from viewer + data. */
export function useEegStatusMetrics(
  win: WindowResponse | null,
  activeChannelIndex: number,
  photicEstimateHz: number | null,
) {
  const leftCursorSec = useEegViewerStore((s) => s.leftCursorSec);
  const rightCursorSec = useEegViewerStore((s) => s.rightCursorSec);
  const dragSelect = useEegViewerStore((s) => s.dragSelect);
  const setMetrics = useViewStore((s) => s.setStatusMetrics);

  const derived = useMemo(() => {
    if (!win || win.data.length === 0) {
      return {
        l: null as number | null,
        r: null as number | null,
        tRl: null as number | null,
        rMinusL: null as number | null,
        a: null as number | null,
        f: null as number | null,
      };
    }
    const ch = Math.min(activeChannelIndex, win.data.length - 1);
    const row = win.data[ch]!;
    const sr = win.sampleRateHz;

    const lu =
      leftCursorSec != null ?
        sampleAtTime(row, leftCursorSec, win.fromSec, sr)
      : null;
    const ru =
      rightCursorSec != null ?
        sampleAtTime(row, rightCursorSec, win.fromSec, sr)
      : null;

    let tRl: number | null = null;
    if (leftCursorSec != null && rightCursorSec != null) {
      tRl = (rightCursorSec - leftCursorSec) * 1000;
    }

    let rMinusL: number | null = null;
    if (lu != null && ru != null) rMinusL = ru - lu;

    let a: number | null = null;
    let f: number | null = null;
    if (dragSelect) {
      const i0 = Math.max(
        0,
        Math.floor((dragSelect.startSec - win.fromSec) * sr),
      );
      const i1 = Math.min(
        row.length - 1,
        Math.ceil((dragSelect.endSec - win.fromSec) * sr),
      );
      if (i1 > i0) {
        const slice = row.subarray(i0, i1);
        a = peakToPeak(slice);
        f = dominantFrequencyHz(slice, sr);
      }
    }

    return { l: lu, r: ru, tRl, rMinusL, a, f };
  }, [
    win,
    activeChannelIndex,
    leftCursorSec,
    rightCursorSec,
    dragSelect,
  ]);

  useEffect(() => {
    setMetrics({
      l: derived.l,
      r: derived.r,
      tRl: derived.tRl,
      rMinusL: derived.rMinusL,
      a: derived.a,
      f: derived.f,
      fs: photicEstimateHz,
    });
  }, [derived, photicEstimateHz, setMetrics]);
}
