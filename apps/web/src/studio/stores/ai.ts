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

/** ICA/ICLabel proposals — M13 natural-language “reject component N?”. */
export type ArtifactComponentProposal = {
  index: number;
  label: string;
  confidence: number;
};

export type ArtifactProposalPayload = {
  analysisId: string;
  components: ArtifactComponentProposal[];
  at: string;
};

/** Spectral / indices computation finished — M13 assistant interprets summaries (M8). */
export type SpectraComputationPayload = {
  analysisId: string;
  kind: "welch" | "indices" | "coherence" | "density";
  summary: Record<string, unknown>;
  at: string;
};

/** ERP / ERD / TFR / ICA / PFA finished — M13 clinical interpretation (M9 → M13). */
export type ErpComputationPayload = {
  analysisId: string;
  kind:
    | "erp"
    | "erd"
    | "wavelet"
    | "wavelet_coherence"
    | "ercoh"
    | "ica_erp"
    | "pfa";
  summary: Record<string, unknown>;
  at: string;
};

/** LORETA / dipole source localization — M13 narrates peak ROIs (M10). */
export type SourceLocalizationPayload = {
  analysisId: string;
  kind: "loreta_erp" | "loreta_spectra" | "dipole";
  summary: Record<string, unknown>;
  at: string;
};

/** Spike detection / classification summary — M13 regional narrative (M11). */
export type SpikeDetectionPayload = {
  analysisId: string;
  summary: Record<string, unknown>;
  at: string;
};

/** Final report draft lines — M13 populates; clinician edits in Report window (M12). */
export type ReportDraftPayload = {
  analysisId: string;
  findings?: string;
  conclusion?: string;
  recommendation?: string;
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
  lastArtifactProposal: ArtifactProposalPayload | null;
  lastSpectraComputation: SpectraComputationPayload | null;
  lastErpComputation: ErpComputationPayload | null;
  lastSourceLocalization: SourceLocalizationPayload | null;
  lastSpikeDetection: SpikeDetectionPayload | null;
  lastReportDraft: ReportDraftPayload | null;
  addMessage: (m: Omit<AiMessage, "id" | "createdAt">) => void;
  setPendingSuggestions: (s: string[]) => void;
  setCitations: (c: AiCitation[]) => void;
  clearThread: () => void;
  viewportChanged: (p: Omit<ViewportPayload, "at">) => void;
  montageChanged: (p: Omit<MontageChangedPayload, "at">) => void;
  filtersChanged: (p: Omit<FiltersChangedPayload, "at">) => void;
  eventsChanged: (p: Omit<EventsChangedPayload, "at">) => void;
  patientOpened: (p: Omit<PatientOpenedPayload, "at">) => void;
  artifactProposalChanged: (p: Omit<ArtifactProposalPayload, "at">) => void;
  spectraComputationChanged: (p: Omit<SpectraComputationPayload, "at">) => void;
  erpComputationChanged: (p: Omit<ErpComputationPayload, "at">) => void;
  sourceLocalizationChanged: (p: Omit<SourceLocalizationPayload, "at">) => void;
  spikeDetectionChanged: (p: Omit<SpikeDetectionPayload, "at">) => void;
  reportDraftChanged: (p: Omit<ReportDraftPayload, "at">) => void;
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
  lastArtifactProposal: null,
  lastSpectraComputation: null,
  lastErpComputation: null,
  lastSourceLocalization: null,
  lastSpikeDetection: null,
  lastReportDraft: null,
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
  artifactProposalChanged: (p) =>
    set({
      lastArtifactProposal: {
        ...p,
        at: new Date().toISOString(),
      },
    }),
  spectraComputationChanged: (p) =>
    set({
      lastSpectraComputation: {
        ...p,
        at: new Date().toISOString(),
      },
    }),
  erpComputationChanged: (p) =>
    set({
      lastErpComputation: {
        ...p,
        at: new Date().toISOString(),
      },
    }),
  sourceLocalizationChanged: (p) =>
    set({
      lastSourceLocalization: {
        ...p,
        at: new Date().toISOString(),
      },
    }),
  spikeDetectionChanged: (p) =>
    set({
      lastSpikeDetection: {
        ...p,
        at: new Date().toISOString(),
      },
    }),
  reportDraftChanged: (p) =>
    set({
      lastReportDraft: {
        ...p,
        at: new Date().toISOString(),
      },
    }),
}));
