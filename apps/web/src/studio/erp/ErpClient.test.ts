import { afterEach, describe, expect, it, vi } from "vitest";

import { ErpClient } from "./ErpClient";
import type { ErpComputeParams } from "./types";

const origFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = origFetch;
});

describe("ErpClient", () => {
  it("posts to exact erp compute URL with ErpComputeIn shape", async () => {
    const calls: { url: string; body: unknown }[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null });
      return new Response(
        JSON.stringify({
          analysisId: "aid-1",
          evokedByClass: {
            TGT: { meanUv: [[0, 5]], timesSec: [-0.2, 0.3], nTrials: 2 },
          },
          trials: [{ index: 0, class: "TGT", included: true, erpUv: [[0, 1]] }],
          channelNames: ["Cz"],
          trialCounts: { TGT: 2 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const params: ErpComputeParams = {
      stimulusClasses: ["TGT"],
      preStimMs: -200,
      postStimMs: 800,
      baselineFromMs: -200,
      baselineToMs: 0,
      baselineCorrection: "mean",
      artifactThresholdUv: 100,
      minTrialsWarning: 30,
    };
    const r = await ErpClient.compute("aid-1", params);
    expect(calls.length).toBe(1);
    expect(calls[0].url).toContain("/api/v1/studio/eeg/aid-1/erp/compute");
    expect(calls[0].body).toMatchObject({
      stim_classes: ["TGT"],
      pre_stim_ms: -200,
      post_stim_ms: 800,
      baseline_correction: "mean",
    });
    expect(r.waveforms.length).toBe(1);
  });
});
