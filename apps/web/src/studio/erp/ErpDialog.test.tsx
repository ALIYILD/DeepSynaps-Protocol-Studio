import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ErpResult } from "./types";

const mockResult: ErpResult = {
  analysisId: "a1",
  channelNames: ["Cz"],
  waveforms: [
    {
      class: "TGT",
      meanUv: [[0, 1, 2]],
      timesSec: [-0.2, 0, 0.2],
      nTrials: 1,
    },
  ],
  trials: [],
  peaks: [],
  trialCounts: { TGT: 1 },
};

const erpState = vi.hoisted(() => ({
  setParams: vi.fn(),
  compute: vi.fn(async () => {}),
  loading: false,
  error: null as string | null,
  result: mockResult as ErpResult | null,
}));

vi.mock("./ErpStore", () => ({
  useErpStore: Object.assign(
    (sel: (s: typeof erpState) => unknown) => sel(erpState),
    { getState: () => erpState },
  ),
}));

import { ErpDialog } from "./ErpDialog";

afterEach(() => {
  cleanup();
  erpState.error = null;
  erpState.result = mockResult;
});

describe("ErpDialog", () => {
  it("renders all required form fields", () => {
    render(
      <ErpDialog
        open
        onOpenChange={() => {}}
        analysisId="a1"
        availableClasses={["TGT", "STD"]}
        mode="compute"
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByText(/Paradigm preset/i)).toBeTruthy();
    expect(screen.getByText(/Stimulus classes/i)).toBeTruthy();
    expect(screen.getByText(/Pre-stim/i)).toBeTruthy();
    expect(screen.getByText(/Post-stim/i)).toBeTruthy();
    expect(screen.getByText(/Baseline correction/i)).toBeTruthy();
    expect(screen.getByText(/Artifact threshold/i)).toBeTruthy();
    expect(screen.getByText(/Min trials/i)).toBeTruthy();
  });

  it("disables submit when no stim class selected", () => {
    render(
      <ErpDialog
        open
        onOpenChange={() => {}}
        analysisId="a1"
        availableClasses={["TGT"]}
        mode="compute"
        onConfirm={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /TGT/i }));
    expect((screen.getByRole("button", { name: /Compute ERP/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("applies paradigm preset values when selected", () => {
    render(
      <ErpDialog
        open
        onOpenChange={() => {}}
        analysisId="a1"
        availableClasses={["STD", "TGT"]}
        mode="compute"
        onConfirm={() => {}}
      />,
    );
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "P300" } });
    const post = screen.getByRole("spinbutton", { name: /Post-stim/i }) as HTMLInputElement;
    expect(Number(post.value)).toBe(800);
  });

  it("warns when available classes is empty", () => {
    render(
      <ErpDialog
        open
        onOpenChange={() => {}}
        analysisId="a1"
        availableClasses={[]}
        mode="compute"
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByText(/No stimulus classes found/i)).toBeTruthy();
  });

  it("calls onConfirm with full params on submit", async () => {
    const onConfirm = vi.fn();
    render(
      <ErpDialog
        open
        onOpenChange={() => {}}
        analysisId="a1"
        availableClasses={["TGT"]}
        mode="compute"
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Compute ERP/i }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    const [params, result] = onConfirm.mock.calls[0] as [unknown, ErpResult];
    expect(params).toMatchObject({ stimulusClasses: ["TGT"] });
    expect(result?.waveforms?.length).toBeGreaterThan(0);
  });

  it('still supports "Continue with defaults" path', () => {
    const onConfirm = vi.fn();
    const onOpen = vi.fn();
    render(
      <ErpDialog
        open
        onOpenChange={onOpen}
        analysisId="a1"
        availableClasses={["TGT"]}
        mode="paramsOnly"
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Continue with defaults/i }));
    expect(onConfirm).toHaveBeenCalled();
    expect(onOpen).toHaveBeenCalledWith(false);
  });
});
