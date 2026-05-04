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

/** Live IIR filter bar — M13 consumer for clinical warnings. */
export type FiltersChangedPayload = {
  lowCutS: number;
  highCutHz: number;
  notch: string;
  baselineUv: number;
  /** Serialized per-channel overrides (channel → partial fields). */
  overridesJson: string;
  at: string;
};

/** Labels / fragments / trials timeline changed — M13 consumer. */
export type EventsChangedPayload = {
  analysisId: string;
  labelCount: number;
  fragmentCount: number;
  trialCount: number;
  fragmentLabels: string[];
  at: string;
};

/** EEG database patient card opened — M13 pulls labs / guidelines for diagnosis. */
export type PatientOpenedPayload = {
  patientId: string;
  diagnosis?: string;
  fullName?: string;
  at: string;
};

export interface AiState {
  messages: AiMessage[];
  pendingSuggestions: string[];
  citations: AiCitation[];
  lastViewport: ViewportPayload | null;
  lastMontage: MontageChangedPayload | null;
  lastFilters: FiltersChangedPayload | null;
  lastEvents: EventsChangedPayload | null;
  lastPatient: PatientOpenedPayload | null;
  addMessage: (m: Omit<AiMessage, "id" | "createdAt">) => void;
  setPendingSuggestions: (s: string[]) => void;
  setCitations: (c: AiCitation[]) => void;
  clearThread: () => void;
  viewportChanged: (p: Omit<ViewportPayload, "at">) => void;
  montageChanged: (p: Omit<MontageChangedPayload, "at">) => void;
  filtersChanged: (p: Omit<FiltersChangedPayload, "at">) => void;
  eventsChanged: (p: Omit<EventsChangedPayload, "at">) => void;
  patientOpened: (p: Omit<PatientOpenedPayload, "at">) => void;
}

export const useAiStore = create<AiState>((set) => ({
  messages: [],
  pendingSuggestions: [],
  citations: [],
  lastViewport: null,
  lastMontage: null,
  lastFilters: null,
  lastEvents: null,
  lastPatient: null,
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
  filtersChanged: (p) =>
    set({
      lastFilters: {
        ...p,
        at: new Date().toISOString(),
      },
    }),
  eventsChanged: (p) =>
    set({
      lastEvents: {
        ...p,
        at: new Date().toISOString(),
      },
    }),
  patientOpened: (p) =>
    set({
      lastPatient: {
        ...p,
        at: new Date().toISOString(),
      },
    }),
}));
