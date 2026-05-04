import type { ErpComputeParams } from "../erp/types";
import type { DipoleResponse, LoretaErpResponse, LoretaSpectraResponse } from "./types";

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

const p = () => API_BASE || "";

function serializeEpochBase(base: ErpComputeParams) {
  return {
    stimulusClasses: base.stimulusClasses,
    preStimMs: base.preStimMs,
    postStimMs: base.postStimMs,
    baselineFromMs: base.baselineFromMs,
    baselineToMs: base.baselineToMs,
    rejectUv: base.rejectUv,
    flatUv: base.flatUv,
  };
}

export async function getSourceCapabilities(analysisId: string) {
  const url = `${p()}/api/v1/studio/eeg/${encodeURIComponent(analysisId)}/source/capabilities`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error(`capabilities ${res.status}`);
  return res.json() as Promise<Record<string, unknown>>;
}

export async function postLoretaErp(
  analysisId: string,
  base: ErpComputeParams,
  pickTimeMs?: number | null,
  method = "sLORETA",
): Promise<LoretaErpResponse> {
  const url = `${p()}/api/v1/studio/eeg/${encodeURIComponent(analysisId)}/source/loreta-erp`;
  const res = await fetch(url, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({
      ...serializeEpochBase(base),
      pickTimeMs: pickTimeMs ?? null,
      method,
    }),
  });
  if (!res.ok) throw new Error(`loreta-erp ${res.status}`);
  return res.json() as Promise<LoretaErpResponse>;
}

export async function postLoretaSpectra(
  analysisId: string,
  base: ErpComputeParams,
  fromSec: number,
  toSec: number,
  bandHz: [number, number],
): Promise<LoretaSpectraResponse> {
  const url = `${p()}/api/v1/studio/eeg/${encodeURIComponent(analysisId)}/source/loreta-spectra`;
  const res = await fetch(url, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({
      ...serializeEpochBase(base),
      fromSec,
      toSec,
      bandHz,
    }),
  });
  if (!res.ok) throw new Error(`loreta-spectra ${res.status}`);
  return res.json() as Promise<LoretaSpectraResponse>;
}

export async function postDipoleFit(analysisId: string, base: ErpComputeParams, step = 4): Promise<DipoleResponse> {
  const url = `${p()}/api/v1/studio/eeg/${encodeURIComponent(analysisId)}/source/dipole`;
  const res = await fetch(url, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({
      ...serializeEpochBase(base),
      step,
    }),
  });
  if (!res.ok) throw new Error(`dipole ${res.status}`);
  return res.json() as Promise<DipoleResponse>;
}
