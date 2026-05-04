import type { ErpComputeParams } from "../erp/types";

export type LoretaErpResponse = {
  ok: boolean;
  analysisId?: string;
  error?: string;
  method?: string;
  peak?: {
    vertex?: number;
    mniMmHeadApprox?: number[];
    latencyMs?: number | null;
    value?: number;
    labelGuess?: string;
  };
  roiTable?: RoiRow[];
  previewSeries?: { timesSec: number[]; peakEnvelope: number[] };
  forwardMeta?: Record<string, unknown>;
};

export type RoiRow = {
  rank: number;
  peakMm: number[];
  labelGuess?: string;
  laterality?: string;
  brodmannGuess?: string;
  value?: number;
  zVsNorm?: number | null;
};

export type LoretaSpectraResponse = {
  ok: boolean;
  analysisId?: string;
  error?: string;
  bandHz?: number[];
  peak?: { mniMmHeadApprox?: number[]; value?: number; labelGuess?: string };
  roiTable?: RoiRow[];
  note?: string;
};

export type DipoleResponse = {
  ok: boolean;
  analysisId?: string;
  error?: string;
  timesSec?: number[];
  positionsM?: number[][];
  goodnessOfFit?: number[];
  eccentricityProxy?: number[];
  note?: string;
};

export type SourceSpectraParams = ErpComputeParams & {
  fromSec: number;
  toSec: number;
  bandHz: [number, number];
};
