import type { ErpComputeParams } from "./types";
import { DEFAULT_ERP_PARAMS } from "./types";

export function buildInitialParams(availableClasses: string[]): ErpComputeParams {
  const base = { ...DEFAULT_ERP_PARAMS };
  if (availableClasses.length) {
    base.stimulusClasses = [availableClasses[0]];
  }
  return base;
}
