export type SpikeRow = {
  peakSec: number;
  channel: string;
  peakToPeakUv?: number;
  durationMs?: number;
  derivZ?: number;
  aiClass?: string;
  aiConfidence?: number;
  aiBackend?: string;
  accepted?: boolean;
};

export type SpikeDetectParams = {
  fromSec: number;
  toSec: number;
  channels?: string[];
  ampUvMin: number;
  durMsMin: number;
  durMsMax: number;
  derivZMin: number;
  useAi: boolean;
  aiConfidenceMin: number;
};

export type SpikeDetectResponse = {
  ok?: boolean;
  spikes?: SpikeRow[];
  count?: number;
  error?: string;
};

export type SpikeAverageResponse = {
  ok?: boolean;
  grandAverage?: {
    timesSec: number[];
    meanUvPerChannel: number[][];
    channelNames: string[];
    nEpochs: number;
  };
  byChannel?: Record<
    string,
    {
      timesSec: number[];
      meanUvPerChannel: number[][];
      channelNames: string[];
      nEpochs: number;
    }
  >;
  preMs?: number;
  postMs?: number;
  error?: string;
};

export type SpikeDipoleResponse = {
  ok?: boolean;
  timesSec?: number[];
  goodnessOfFit?: number[];
  eccentricityProxy?: number[];
  positionsM?: number[][];
  peakSec?: number;
  error?: string;
};
