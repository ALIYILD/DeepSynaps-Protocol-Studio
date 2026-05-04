import type { FragmentSlice, TrialSlice, ViewerMarker } from "../stores/eegViewer";

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

export type ApiTimelineEvent = {
  id: string;
  type: string;
  fromSec: number;
  toSec?: number;
  text?: string;
  color?: string;
  channelScope?: string;
  channels?: string[];
};

export type ApiTrialRow = {
  id: string;
  index: number;
  startSec: number;
  endSec: number;
  kind: string;
  included: boolean;
  stimulusClass?: string;
  responseMs?: number | null;
};

export async function getRecordingEvents(analysisId: string): Promise<{
  events: ApiTimelineEvent[];
  fragments: FragmentSlice[];
}> {
  const url = `${prefix()}/api/v1/recordings/eeg/${encodeURIComponent(analysisId)}/events`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error(`events ${res.status}`);
  const json = (await res.json()) as {
    events?: ApiTimelineEvent[];
    fragments?: FragmentSlice[];
  };
  return {
    events: json.events ?? [],
    fragments: json.fragments ?? [],
  };
}

export async function getRecordingTrials(analysisId: string): Promise<ApiTrialRow[]> {
  const url = `${prefix()}/api/v1/recordings/eeg/${encodeURIComponent(analysisId)}/trials`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error(`trials ${res.status}`);
  const json = (await res.json()) as { trials?: ApiTrialRow[] };
  return json.trials ?? [];
}

export function mapEventsToMarkers(events: ApiTimelineEvent[]): ViewerMarker[] {
  const out: ViewerMarker[] = [];
  for (const e of events) {
    if (e.type === "label" || e.type === "artifact") {
      out.push({
        id: e.id,
        kind: e.type,
        fromSec: e.fromSec,
        toSec: e.toSec,
        text: e.text,
        color: e.color,
        channelScope: (e.channelScope as ViewerMarker["channelScope"]) ?? "all",
        channels: e.channels,
      });
    }
    if (e.type === "spike") {
      let label = e.text ?? "spike";
      try {
        const j = JSON.parse(e.text || "{}") as {
          channel?: string;
          peakSec?: number;
          aiClass?: string;
        };
        if (j.peakSec != null && j.channel) {
          label = `${j.aiClass ?? "IED"} ${j.channel} @ ${Number(j.peakSec).toFixed(3)}s`;
        }
      } catch {
        /* keep label */
      }
      out.push({
        id: e.id,
        kind: "spike",
        fromSec: e.fromSec,
        toSec: e.toSec,
        text: label,
        color: e.color ?? "#a855f7",
        channelScope: (e.channelScope as ViewerMarker["channelScope"]) ?? "selection",
        channels: e.channels,
      });
    }
  }
  return out;
}

export function mapTrialsToSlices(rows: ApiTrialRow[]): TrialSlice[] {
  return rows.map((t) => ({
    id: t.id,
    index: t.index,
    startSec: t.startSec,
    endSec: t.endSec,
    kind: t.kind,
    included: t.included,
    stimulusClass: t.stimulusClass,
    responseMs: t.responseMs ?? null,
  }));
}

export async function postEvent(
  analysisId: string,
  body: {
    type: "label" | "fragment" | "artifact" | "spike";
    fromSec: number;
    toSec?: number;
    text?: string;
    color?: string;
    channelScope?: "all" | "selection";
    channels?: string[];
  },
): Promise<ApiTimelineEvent> {
  const url = `${prefix()}/api/v1/recordings/eeg/${encodeURIComponent(analysisId)}/events`;
  const res = await fetch(url, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`post event ${res.status}`);
  const json = (await res.json()) as { event?: ApiTimelineEvent };
  if (!json.event) throw new Error("no event");
  return json.event;
}

export async function patchTrial(
  analysisId: string,
  trialId: string,
  patch: { included?: boolean; class?: string; responseMs?: number | null },
): Promise<void> {
  const url = `${prefix()}/api/v1/recordings/eeg/${encodeURIComponent(analysisId)}/trials/${encodeURIComponent(trialId)}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`patch trial ${res.status}`);
}

export async function postTrialSync(
  analysisId: string,
  deltaMs: number,
  classes?: string[],
): Promise<ApiTrialRow[]> {
  const url = `${prefix()}/api/v1/recordings/eeg/${encodeURIComponent(analysisId)}/trials/sync`;
  const res = await fetch(url, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ deltaMs, classes }),
  });
  if (!res.ok) throw new Error(`sync ${res.status}`);
  const json = (await res.json()) as { trials?: ApiTrialRow[] };
  return json.trials ?? [];
}

export async function postTrialImport(analysisId: string, raw: string): Promise<ApiTrialRow[]> {
  const url = `${prefix()}/api/v1/recordings/eeg/${encodeURIComponent(analysisId)}/trials/import`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...authHeaders(),
      "Content-Type": "text/csv; charset=utf-8",
    },
    body: raw,
  });
  if (!res.ok) throw new Error(`import ${res.status}`);
  const json = (await res.json()) as { trials?: ApiTrialRow[] };
  return json.trials ?? [];
}

export async function patchEvent(
  analysisId: string,
  eventId: string,
  patch: Partial<{
    fromSec: number;
    toSec: number | null;
    text: string;
    color: string;
    channelScope: string;
    channels: string[];
  }>,
): Promise<void> {
  const url = `${prefix()}/api/v1/recordings/eeg/${encodeURIComponent(analysisId)}/events/${encodeURIComponent(eventId)}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`patch event ${res.status}`);
}

export async function deleteEvent(analysisId: string, eventId: string): Promise<void> {
  const url = `${prefix()}/api/v1/recordings/eeg/${encodeURIComponent(analysisId)}/events/${encodeURIComponent(eventId)}`;
  const res = await fetch(url, { method: "DELETE", headers: authHeaders() });
  if (!res.ok && res.status !== 204) throw new Error(`delete ${res.status}`);
}
