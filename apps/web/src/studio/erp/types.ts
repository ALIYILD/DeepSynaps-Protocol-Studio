/** Aligns with apps/api ErpComputeIn (studio_erp_router) for LORETA / dipole epoch bases. */

export type ErpComputeParams = {
  stimulusClasses: string[];
  preStimMs: number;
  postStimMs: number;
  baselineFromMs: number;
  baselineToMs: number;
  rejectUv?: Record<string, number> | null;
  flatUv?: Record<string, number> | null;
};

/** Starting point — matches P300.PAR-style defaults in app/erp/paradigms.py */
export const DEFAULT_ERP_PARAMS: ErpComputeParams = {
  stimulusClasses: ["Target", "NonTarget", "Standard"],
  preStimMs: -200,
  postStimMs: 1000,
  baselineFromMs: -200,
  baselineToMs: 0,
};
