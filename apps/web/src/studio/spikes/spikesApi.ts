import type {
  SpikeAverageResponse,
  SpikeDetectParams,
  SpikeDetectResponse,
  SpikeDipoleResponse,
  SpikeRow,
} from "./types";

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

const prefix = () => API_BASE || "";

export async function postSpikeDetect(
  analysisId: string,
  p: SpikeDetectParams,
): Promise<SpikeDetectResponse> {
  const url = `${prefix()}/api/v1/studio/eeg/${encodeURIComponent(analysisId)}/spikes/detect`;
  const res = await fetch(url, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({
      fromSec: p.fromSec,
      toSec: p.toSec,
      channels: p.channels?.length ? p.channels : undefined,
      ampUvMin: p.ampUvMin,
      durMsMin: p.durMsMin,
      durMsMax: p.durMsMax,
      derivZMin: p.derivZMin,
      useAi: p.useAi,
      aiConfidenceMin: p.aiConfidenceMin,
    }),
  });
  if (!res.ok) throw new Error(`spike detect ${res.status}`);
  return (await res.json()) as SpikeDetectResponse;
}

export async function postSpikeAverage(
  analysisId: string,
  peaks: SpikeRow[],
  preMs = 300,
  postMs = 300,
): Promise<SpikeAverageResponse> {
  const url = `${prefix()}/api/v1/studio/eeg/${encodeURIComponent(analysisId)}/spikes/average`;
  const res = await fetch(url, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ peaks, preMs, postMs }),
  });
  if (!res.ok) throw new Error(`spike average ${res.status}`);
  return (await res.json()) as SpikeAverageResponse;
}

export async function postSpikeDipoleAtPeak(
  analysisId: string,
  peakSec: number,
  preMs = 50,
  postMs = 50,
): Promise<SpikeDipoleResponse> {
  const url = `${prefix()}/api/v1/studio/eeg/${encodeURIComponent(analysisId)}/spikes/dipole-at-peak`;
  const res = await fetch(url, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ peakSec, preMs, postMs }),
  });
  if (!res.ok) throw new Error(`spike dipole ${res.status}`);
  return (await res.json()) as SpikeDipoleResponse;
}
