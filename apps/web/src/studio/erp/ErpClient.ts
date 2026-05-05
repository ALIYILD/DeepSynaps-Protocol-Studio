import { detectPeaks } from "./PeakDetector";
import type { ErpComputeApiBody, ErpComputeParams, ErpPeak, ErpResult, ErpTrial } from "./types";

const API_BASE = import.meta.env?.VITE_API_BASE_URL ?? "";

function authHeaders(): HeadersInit {
  try {
    const t = localStorage.getItem("ds_access_token");
    return t ? { Authorization: `Bearer ${t}` } : {};
  } catch {
    return {};
  }
}

function jsonHeaders(): HeadersInit {
  return { ...authHeaders(), "Content-Type": "application/json" };
}

const base = () => API_BASE || "";

function toApiBody(p: ErpComputeParams): ErpComputeApiBody {
  return {
    stim_classes: p.stimulusClasses,
    pre_stim_ms: p.preStimMs,
    post_stim_ms: p.postStimMs,
    baseline_from_ms: p.baselineFromMs,
    baseline_to_ms: p.baselineToMs,
    baseline_correction: p.baselineCorrection,
    rejectUv: { eeg: p.artifactThresholdUv },
    returnTrialErps: true,
  };
}

function normalizeCompute(json: Record<string, unknown>, params: ErpComputeParams): ErpResult {
  const channelNames = (json.channelNames as string[]) ?? [];
  const evoked = (json.evokedByClass ?? {}) as Record<
    string,
    { meanUv: number[][]; timesSec: number[]; nTrials: number }
  >;
  const waveforms = Object.entries(evoked).map(([cls, pack]) => ({
    class: cls,
    meanUv: pack.meanUv,
    timesSec: pack.timesSec,
    nTrials: pack.nTrials,
  }));
  const trialsRaw = (json.trials as ErpTrial[] | undefined) ?? [];
  const trials: ErpTrial[] = trialsRaw.map((t) => ({
    index: Number(t.index),
    class: String(t.class),
    trialId: t.trialId,
    included: t.included !== false,
    erpUv: t.erpUv,
  }));

  const first = waveforms[0];
  let peaks: ErpPeak[] = [];
  if (first?.meanUv?.length && first.timesSec?.length) {
    const sr =
      first.timesSec.length > 1 ?
        1 / (first.timesSec[1] - first.timesSec[0])
      : 256;
    const ch0 = first.meanUv[0] ?? [];
    peaks = detectPeaks(Float32Array.from(ch0), sr, params.postStimMs, {
      timesSec: first.timesSec,
    });
  }

  return {
    analysisId: String(json.analysisId ?? ""),
    channelNames,
    waveforms,
    trials,
    peaks,
    trialCounts: (json.trialCounts as Record<string, number>) ?? {},
    warnLowTrialCount: Boolean(json.warnLowTrialCount),
  };
}

export class ErpClient {
  static async compute(analysisId: string, params: ErpComputeParams): Promise<ErpResult> {
    const url = `${base()}/api/v1/studio/eeg/${encodeURIComponent(analysisId)}/erp/compute`;
    const res = await fetch(url, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(toApiBody(params)),
    });
    if (!res.ok) throw new Error(`erp compute ${res.status}`);
    const json = (await res.json()) as Record<string, unknown>;
    return normalizeCompute(json, params);
  }

  static async recompute(
    analysisId: string,
    params: ErpComputeParams,
    trials: ErpTrial[],
    includedTrialIndexes: number[],
    prev: ErpResult | null = null,
  ): Promise<ErpResult> {
    const includeSet = new Set(includedTrialIndexes);
    const baseTrials =
      trials.some((t) => Array.isArray(t.erpUv) && t.erpUv.length) ?
        trials
      : (prev?.trials ?? []);
    if (!baseTrials.some((t) => Array.isArray(t.erpUv) && t.erpUv.length)) {
      return ErpClient.compute(analysisId, params);
    }
    const timesSecFromPrev = prev?.waveforms?.[0]?.timesSec;
    const firstWf = baseTrials.find((t) => t.erpUv?.[0]?.length)?.erpUv?.[0]?.length ?? 0;
    const timesLen = timesSecFromPrev?.length ?? firstWf;
    const timesSec =
      timesSecFromPrev?.length ?
        timesSecFromPrev
      : params.preStimMs <= 0 && timesLen > 1 ?
        Array.from(
          { length: timesLen },
          (_, i) =>
            params.preStimMs / 1000 +
            (i / (timesLen - 1)) * (params.postStimMs / 1000 - params.preStimMs / 1000),
        )
      : [];
    const eventKeys = [...new Set(baseTrials.map((t) => t.class))];
    const payloadTrials = baseTrials.map((t) => ({
      class: t.class,
      erpUv: t.erpUv,
      included: includeSet.has(Number(t.index)),
    }));

    const urlRe = `${base()}/api/v1/studio/eeg/${encodeURIComponent(analysisId)}/erp/reaverage`;
    const resRe = await fetch(urlRe, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        timesSec,
        eventKeys,
        trials: payloadTrials,
      }),
    });
    if (!resRe.ok) throw new Error(`erp reaverage ${resRe.status}`);
    const reJson = (await resRe.json()) as Record<string, unknown>;
    const meanBy = (reJson.meanByClassUv ?? {}) as Record<string, number[][]>;
    const counts = (reJson.counts ?? {}) as Record<string, number>;

    const waveforms = eventKeys.map((cls) => ({
      class: cls,
      meanUv: meanBy[cls] ?? [],
      timesSec,
      nTrials: counts[cls] ?? 0,
    }));

    const mergedTrials: ErpTrial[] = baseTrials.map((t) => ({
      index: Number(t.index),
      class: String(t.class),
      trialId: t.trialId,
      included: includeSet.has(Number(t.index)),
      erpUv: t.erpUv,
    }));

    let peaks: ErpPeak[] = [];
    const wf0 = waveforms[0];
    if (wf0?.meanUv?.length && wf0.timesSec?.length) {
      const sr =
        wf0.timesSec.length > 1 ? 1 / (wf0.timesSec[1] - wf0.timesSec[0]) : 256;
      const ch0 = wf0.meanUv[0] ?? [];
      peaks = detectPeaks(Float32Array.from(ch0), sr, params.postStimMs, {
        timesSec: wf0.timesSec,
      });
    }

    const chNames =
      prev?.channelNames?.length ?
        prev.channelNames
      : baseTrials[0]?.erpUv?.length ?
        baseTrials[0]!.erpUv!.map((_, i) => `Ch${i}`)
      : [];

    return {
      analysisId,
      channelNames: chNames,
      waveforms,
      trials: mergedTrials,
      peaks,
      trialCounts: counts,
      warnLowTrialCount: Object.values(counts).some((n) => n < 30),
    };
  }

  static async getTrials(analysisId: string): Promise<ErpTrial[]> {
    const url = `${base()}/api/v1/studio/eeg/${encodeURIComponent(analysisId)}/erp/trials`;
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) throw new Error(`erp trials ${res.status}`);
    const json = (await res.json()) as { trials?: ErpTrial[] };
    return (json.trials ?? []).map((t) => ({
      index: Number(t.index),
      class: String(t.class),
      trialId: t.trialId,
      included: true,
    }));
  }
}
