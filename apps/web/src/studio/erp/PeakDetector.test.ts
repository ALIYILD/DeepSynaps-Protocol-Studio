import { describe, expect, it } from "vitest";

import { detectPeaks } from "./PeakDetector";

describe("detectPeaks", () => {
  it("finds P300 within ±10ms on synthetic waveform", () => {
    const sr = 500;
    const pre = 200;
    const nPre = Math.round((pre / 1000) * sr);
    const nPost = Math.round((800 / 1000) * sr);
    const n = nPre + nPost;
    const timesSec: number[] = [];
    const wav = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const tMs = -pre + (i / sr) * 1000;
      timesSec.push(tMs / 1000);
      let v = 0;
      if (tMs >= 250 && tMs <= 500) {
        const u = (tMs - 300) / 40;
        v = 8 * Math.exp(-u * u);
      }
      wav[i] = v;
    }
    const peaks = detectPeaks(wav, sr, 800, { timesSec, minAmplitudeUv: 1.5 });
    const p3 = peaks.find((p) => p.name === "P300");
    expect(p3).toBeTruthy();
    expect(Math.abs((p3?.latencyMs ?? 0) - 300)).toBeLessThanOrEqual(10);
  });
});
