/**
 * Copilot Type Definitions — DeepSynaps Protocol Studio
 * ======================================================
 * Types for the AI copilot chat interface.
 */

export type AiMessageRole = "user" | "assistant" | "system";
export type SuggestionType = "protocol" | "analysis" | "condition" | "general";

export interface Citation {
  id: string;
  title: string;
  authors: string;
  year: number;
  source: string;
  url?: string;
  quote?: string;
}

export interface AiMessage {
  id: string;
  role: AiMessageRole;
  content: string;
  timestamp: string;
  citations?: Citation[];
  isStreaming?: boolean;
  suggestions?: string[];
}

export interface SuggestionChip {
  id: string;
  label: string;
  type: SuggestionType;
  icon?: string;
}

export interface CopilotSession {
  id: string;
  title: string;
  messages: AiMessage[];
  createdAt: string;
  updatedAt: string;
  context?: string;
}
