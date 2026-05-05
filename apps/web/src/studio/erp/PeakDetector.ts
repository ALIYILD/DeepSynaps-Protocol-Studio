import type { ErpPeak } from "./types";

export interface PeakDetectionConfig {
  windowMs: Record<"N100" | "P200" | "N200" | "P300", [number, number]>;
  minAmplitudeUv: number;
}

const DEFAULT_WINDOWS: PeakDetectionConfig["windowMs"] = {
  N100: [60, 150],
  P200: [150, 250],
  N200: [200, 300],
  P300: [250, 500],
};

/** postStimMs kept for API compatibility; use timesSec when available (epoch time axis). */
export function detectPeaks(
  waveform: Float32Array | ArrayLike<number>,
  samplingRateHz: number,
  postStimMs: number,
  config: Partial<PeakDetectionConfig> & { timesSec?: number[] } = {},
): ErpPeak[] {
  void postStimMs;
  const windows = { ...DEFAULT_WINDOWS, ...config.windowMs };
  const minAmp = config.minAmplitudeUv ?? 1.5;
  const n = waveform.length;
  if (n < 2 || samplingRateHz <= 0) return [];

  const arr = Float32Array.from(waveform);
  const timesSec = config.timesSec;
  const latencyMsAt = (i: number) =>
    timesSec && timesSec.length === n ? timesSec[i] * 1000 : -200 + (i / samplingRateHz) * 1000;

  const windowIndices = (w0: number, w1: number): [number, number] | null => {
    if (timesSec && timesSec.length === n) {
      let lo = n;
      let hi = -1;
      for (let i = 0; i < n; i++) {
        const ms = timesSec[i] * 1000;
        if (ms >= w0 && ms <= w1) {
          lo = Math.min(lo, i);
          hi = Math.max(hi, i);
        }
      }
      if (lo > hi) return null;
      return [lo, hi];
    }
    const tMinMs = -200;
    const i0 = Math.max(0, Math.floor(((w0 - tMinMs) / 1000) * samplingRateHz));
    const i1 = Math.min(n - 1, Math.ceil(((w1 - tMinMs) / 1000) * samplingRateHz));
    if (i1 < i0) return null;
    return [i0, i1];
  };

  const peaks: ErpPeak[] = [];
  const names: Array<keyof typeof windows> = ["N100", "P200", "N200", "P300"];

  for (const name of names) {
    const [w0, w1] = windows[name];
    const win = windowIndices(w0, w1);
    if (!win) continue;
    const [i0, i1] = win;
    if (i1 < i0) continue;

    let bestI = i0;
    let bestV = arr[i0];
    for (let i = i0; i <= i1; i++) {
      const v = arr[i];
      if (name.startsWith("N")) {
        if (v < bestV) {
          bestV = v;
          bestI = i;
        }
      } else if (v > bestV) {
        bestV = v;
        bestI = i;
      }
    }
    if (Math.abs(bestV) < minAmp) continue;
    peaks.push({
      name,
      latencyMs: latencyMsAt(bestI),
      amplitudeUv: bestV,
      channelIndex: 0,
    });
  }

  return peaks;
}
