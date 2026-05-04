import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const API_BASE =
  import.meta.env?.VITE_API_BASE_URL ?? "";

export interface WindowResponse {
  sampleRateHz: number;
  channels: string[];
  fromSec: number;
  toSec: number;
  data: Float32Array[];
  totalDurationSec: number;
  photic?: number[];
  montageId?: string;
  montageWarnings?: string[];
  filterWarnings?: string[];
  fragments?: {
    id: string;
    label: string;
    startSec: number;
    endSec: number;
    color: string;
  }[];
}

/** Live IIR visualization filters (query params on `/window`). */
export type EegLiveFilterParams = {
  lowCutS: number;
  highCutHz: number;
  notch: string;
  baselineUv: number;
  /** JSON string for ``filterOverrides`` query param */
  overridesJson: string;
};

function getToken(): string | null {
  try {
    return localStorage.getItem("ds_access_token");
  } catch {
    return null;
  }
}

export function generateSyntheticWindow(
  channels: string[],
  fromSec: number,
  toSec: number,
  sampleRate: number,
): WindowResponse {
  const n = Math.max(
    2,
    Math.floor((toSec - fromSec) * sampleRate) || Math.floor(sampleRate * 5),
  );
  const data: Float32Array[] = [];
  for (let c = 0; c < channels.length; c++) {
    const row = new Float32Array(n);
    const f = 6 + c * 0.7;
    for (let i = 0; i < n; i++) {
      const t = fromSec + i / sampleRate;
      row[i] =
        40 * Math.sin(2 * Math.PI * f * t) +
        12 * Math.sin(2 * Math.PI * 50 * t) +
        (Math.random() - 0.5) * 5;
    }
    data.push(row);
  }
  const photic: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i += Math.floor(sampleRate / 3)) photic[i] = 1;

  return {
    sampleRateHz: sampleRate,
    channels,
    fromSec,
    toSec,
    data,
    totalDurationSec: Math.max(toSec, 1800),
    photic,
    fragments: [
      {
        id: "fr1",
        label: "Eyes Closed",
        startSec: fromSec,
        endSec: Math.min(fromSec + 30, toSec),
        color: "rgba(80,120,200,0.25)",
      },
    ],
  };
}

async function fetchWindow(
  recordingId: string,
  fromSec: number,
  toSec: number,
  maxPoints: number,
  channels: string[] | null,
  montageId: string,
  badChannels: string[],
  liveFilters: EegLiveFilterParams,
): Promise<WindowResponse | null> {
  const tok = getToken();
  const q = new URLSearchParams({
    fromSec: String(fromSec),
    toSec: String(toSec),
    maxPoints: String(maxPoints),
    montageId,
  });
  if (channels?.length) q.set("channels", channels.join(","));
  if (badChannels.length)
    q.set("badChannels", badChannels.join(","));
  if (liveFilters.lowCutS > 0)
    q.set("lowCutS", String(liveFilters.lowCutS));
  if (liveFilters.highCutHz > 0)
    q.set("highCutHz", String(liveFilters.highCutHz));
  if (liveFilters.notch && liveFilters.notch !== "none")
    q.set("notch", liveFilters.notch);
  if (Math.abs(liveFilters.baselineUv) > 1e-9)
    q.set("baselineUv", String(liveFilters.baselineUv));
  if (
    liveFilters.overridesJson &&
    liveFilters.overridesJson !== "{}" &&
    liveFilters.overridesJson !== "null"
  )
    q.set("filterOverrides", liveFilters.overridesJson);

  const prefix = API_BASE || "";
  const url = `${prefix}/api/v1/studio/eeg/${encodeURIComponent(recordingId)}/window?${q}`;
  const res = await fetch(url, {
    headers: tok ? { Authorization: `Bearer ${tok}` } : {},
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    sampleRateHz: number;
    channels: string[];
    fromSec: number;
    toSec: number;
    data: number[][] | string[];
    totalDurationSec: number;
    photic?: number[];
    montageId?: string;
    montageWarnings?: string[];
    filterWarnings?: string[];
    fragments?: WindowResponse["fragments"];
  };

  const data: Float32Array[] = [];
  for (const row of json.data) {
    if (typeof row === "string") {
      const bin = atob(row);
      const buf = new ArrayBuffer(bin.length);
      const v = new Uint8Array(buf);
      for (let i = 0; i < bin.length; i++) v[i] = bin.charCodeAt(i);
      data.push(new Float32Array(buf));
    } else {
      data.push(Float32Array.from(row));
    }
  }

  return {
    sampleRateHz: json.sampleRateHz,
    channels: json.channels,
    fromSec: json.fromSec,
    toSec: json.toSec,
    data,
    totalDurationSec: json.totalDurationSec,
    photic: json.photic,
    fragments: json.fragments,
    montageId: json.montageId,
    montageWarnings: json.montageWarnings,
    filterWarnings: json.filterWarnings,
  };
}

export function useEegStream(
  recordingId: string,
  fromSec: number,
  toSec: number,
  maxPoints: number,
  channelFilter: string[] | null,
  montageId: string,
  badChannels: string[],
  liveFilters: EegLiveFilterParams,
) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<WindowResponse | null>(null);
  const reqId = useRef(0);

  const stableCh = useMemo(
    () => (channelFilter?.length ? channelFilter.join(",") : ""),
    [channelFilter],
  );

  const stableBad = useMemo(
    () => badChannels.join("\u0001"),
    [badChannels],
  );

  const filterSig = useMemo(
    () =>
      `${liveFilters.lowCutS}|${liveFilters.highCutHz}|${liveFilters.notch}|${liveFilters.baselineUv}|${liveFilters.overridesJson}`,
    [
      liveFilters.lowCutS,
      liveFilters.highCutHz,
      liveFilters.notch,
      liveFilters.baselineUv,
      liveFilters.overridesJson,
    ],
  );

  const load = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      let win: WindowResponse | null = null;
      if (recordingId && recordingId !== "demo") {
        win = await fetchWindow(
          recordingId,
          fromSec,
          toSec,
          maxPoints,
          channelFilter,
          montageId,
          badChannels,
          liveFilters,
        );
      }
      if (id !== reqId.current) return;
      if (!win) {
        const ch =
          channelFilter?.length ?
            channelFilter
          : Array.from({ length: 32 }, (_, i) => `Ch${i + 1}`);
        win = generateSyntheticWindow(ch, fromSec, toSec, 250);
      }
      setPayload(win);
    } catch (e) {
      if (id !== reqId.current) return;
      setError(e instanceof Error ? e.message : "load failed");
      const ch =
        channelFilter?.length ?
          channelFilter
        : Array.from({ length: 32 }, (_, i) => `Ch${i + 1}`);
      setPayload(generateSyntheticWindow(ch, fromSec, toSec, 250));
    } finally {
      if (id === reqId.current) setLoading(false);
    }
    /* filterSig covers liveFilters fields used by fetchWindow */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    recordingId,
    fromSec,
    toSec,
    maxPoints,
    stableCh,
    channelFilter,
    montageId,
    stableBad,
    badChannels,
    filterSig,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  return { loading, error, payload, reload: load };
}
