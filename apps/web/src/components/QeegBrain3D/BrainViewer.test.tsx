import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

import { BrainViewer } from "./BrainViewer";

describe("BrainViewer", () => {
  it("mounts, fetches payload, shows view buttons", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          version: 1,
          subject: "fsaverage",
          mesh: {
            surf: "pial",
            positions: new Array(3 * 12002).fill(0),
            indices: new Array(3 * 30000).fill(0),
            n_lh: 6001,
            n_rh: 6001,
          },
          bands: {
            alpha: {
              power: new Array(12002).fill(0),
              z: new Array(12002).fill(0),
              power_scale: { min: 0, max: 1 },
              z_scale: { min: -4, max: 4 },
            },
          },
          luts: {},
        }),
      } as any;
    }) as any);

    render(<BrainViewer analysisId="abc" apiBaseUrl="http://example.test" />);

    expect(await screen.findByRole("button", { name: /view lateral/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /view medial/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /view dorsal/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /view ventral/i })).toBeTruthy();
  });
});

