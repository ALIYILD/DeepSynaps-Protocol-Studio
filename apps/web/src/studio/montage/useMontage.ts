import { create } from "zustand";

import { DEFAULT_MONTAGE_ID } from "./montagePresets";

const API_BASE = import.meta.env?.VITE_API_BASE_URL ?? "";

function getToken(): string | null {
  try {
    return localStorage.getItem("ds_access_token");
  } catch {
    return null;
  }
}

export type MontageListEntry = { id: string; name: string; family: string };

export interface MontageCatalog {
  builtins: MontageListEntry[];
  custom: MontageListEntry[];
}

type MontageState = {
  montageId: string;
  badChannels: string[];
  catalog: MontageCatalog | null;
  setMontageId: (id: string) => void;
  toggleBadChannel: (ch: string) => void;
  setBadChannels: (chs: string[]) => void;
  loadCatalog: () => Promise<void>;
};

export const useMontageStore = create<MontageState>((set) => ({
  montageId: DEFAULT_MONTAGE_ID,
  badChannels: [],
  catalog: null,

  setMontageId: (montageId) => set({ montageId }),

  toggleBadChannel: (ch) =>
    set((s) => {
      const next = new Set(s.badChannels);
      if (next.has(ch)) next.delete(ch);
      else next.add(ch);
      return { badChannels: [...next].sort() };
    }),

  setBadChannels: (badChannels) => set({ badChannels: [...badChannels].sort() }),

  loadCatalog: async () => {
    const tok = getToken();
    const url = `${API_BASE}/api/v1/montages`;
    const res = await fetch(url, {
      headers: tok ? { Authorization: `Bearer ${tok}` } : {},
    });
    if (!res.ok) return;
    const json = (await res.json()) as MontageCatalog;
    set({ catalog: json });
  },
}));

/** Persist preferred montage for the current recording/analysis id (best-effort). */
export async function persistRecordingMontagePref(
  recordingId: string,
  montageId: string,
): Promise<void> {
  if (!recordingId || recordingId === "demo") return;
  const tok = getToken();
  const url = `${API_BASE}/api/v1/recordings/${encodeURIComponent(recordingId)}/montage`;
  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
    },
    body: JSON.stringify({ montageId }),
  });
}

export function useMontageBadSet(): Set<string> {
  const bad = useMontageStore((s) => s.badChannels);
  return new Set(bad);
}
