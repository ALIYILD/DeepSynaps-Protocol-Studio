import { create } from "zustand";

export interface AiMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
}

export interface AiCitation {
  id: string;
  label: string;
  href?: string;
}

export type ViewportPayload = {
  fromSec: number;
  toSec: number;
  channels: string[];
  at: string;
};

/** Output trace labels after montage / reference (M13 consumer). */
export type MontageDerivation = {
  label: string;
  plus: string[];
  minus: string[];
};

export type MontageChangedPayload = {
  montageId: string;
  derivations: MontageDerivation[];
  at: string;
};

export interface AiState {
  messages: AiMessage[];
  pendingSuggestions: string[];
  citations: AiCitation[];
  lastViewport: ViewportPayload | null;
  lastMontage: MontageChangedPayload | null;
  addMessage: (m: Omit<AiMessage, "id" | "createdAt">) => void;
  setPendingSuggestions: (s: string[]) => void;
  setCitations: (c: AiCitation[]) => void;
  clearThread: () => void;
  viewportChanged: (p: Omit<ViewportPayload, "at">) => void;
  montageChanged: (p: Omit<MontageChangedPayload, "at">) => void;
}

export const useAiStore = create<AiState>((set) => ({
  messages: [],
  pendingSuggestions: [],
  citations: [],
  lastViewport: null,
  lastMontage: null,
  addMessage: (m) =>
    set((s) => ({
      messages: [
        ...s.messages,
        {
          ...m,
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
        },
      ],
    })),
  setPendingSuggestions: (pendingSuggestions) => set({ pendingSuggestions }),
  setCitations: (citations) => set({ citations }),
  clearThread: () =>
    set({ messages: [], pendingSuggestions: [], citations: [] }),
  viewportChanged: (p) =>
    set({
      lastViewport: {
        ...p,
        at: new Date().toISOString(),
      },
    }),
  montageChanged: (p) =>
    set({
      lastMontage: {
        ...p,
        at: new Date().toISOString(),
      },
    }),
}));
