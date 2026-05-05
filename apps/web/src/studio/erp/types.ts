/** M9 ERP compute / viewer types (Studio). */

export type BaselineCorrectionMode = "none" | "mean" | "linear";

export type ErpComputeParams = {
  stimulusClasses: string[];
  preStimMs: number;
  postStimMs: number;
  baselineFromMs: number;
  baselineToMs: number;
  baselineCorrection: BaselineCorrectionMode;
  artifactThresholdUv: number;
  minTrialsWarning: number;
  paradigmCode?: string;
  rejectUv?: Record<string, number> | null;
  flatUv?: Record<string, number> | null;
};

export const DEFAULT_ERP_PARAMS: ErpComputeParams = {
  stimulusClasses: [],
  preStimMs: -200,
  postStimMs: 800,
  baselineFromMs: -200,
  baselineToMs: 0,
  baselineCorrection: "mean",
  artifactThresholdUv: 100,
  minTrialsWarning: 30,
  paradigmCode: "Custom",
  rejectUv: null,
  flatUv: null,
};

export type ErpPeak = {
  name: string;
  latencyMs: number;
  amplitudeUv: number;
  channelIndex: number;
};

export type ErpWaveformPack = {
  class: string;
  meanUv: number[][];
  timesSec: number[];
  nTrials: number;
};

export type ErpTrial = {
  index: number;
  class: string;
  trialId?: string;
  included: boolean;
  /** Present after compute; omitted in GET /trials. */
  erpUv?: number[][];
};

export type ErpResult = {
  analysisId: string;
  channelNames: string[];
  waveforms: ErpWaveformPack[];
  trials: ErpTrial[];
  peaks: ErpPeak[];
  trialCounts: Record<string, number>;
  warnLowTrialCount?: boolean;
};

export type ErpComputeApiBody = {
  stim_classes: string[];
  pre_stim_ms: number;
  post_stim_ms: number;
  baseline_from_ms: number;
  baseline_to_ms: number;
  baseline_correction: BaselineCorrectionMode;
  rejectUv?: { eeg: number } | null;
  returnTrialErps?: boolean;
};

export type ParadigmDef = {
  name: string;
  code: string;
  description: string;
  stimClasses: { code: string; label: string; expectedProbability?: number }[];
  preStimMs: number;
  postStimMs: number;
  baselineCorrection: BaselineCorrectionMode;
  artifactThresholdUv: number;
  minTrials: number;
  expectedPeaks: string[];
  citations: string[];
};
