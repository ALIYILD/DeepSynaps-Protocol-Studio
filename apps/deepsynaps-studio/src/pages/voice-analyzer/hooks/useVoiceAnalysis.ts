import { useState } from "react";

type Status = "idle" | "uploading" | "analyzing" | "done" | "error";

type Word = {
  word: string;
  start_sec: number;
  end_sec: number;
  confidence: number;
};

type Transcript = {
  text: string;
  language: string;
  words: Word[];
};

type EmotionFrame = {
  start_sec: number;
  end_sec: number;
  label: string;
  confidence: number;
};

type EmotionTimeline = {
  frames: EmotionFrame[];
  dominant_label: string;
  mean_confidence: number;
};

type Biomarkers = {
  f0_mean_hz: number;
  f0_std_hz: number;
  jitter_local: number;
  shimmer_local: number;
  hnr_db: number;
  mfcc_means: number[];
};

type RiskScores = {
  depression: number;
  anxiety: number;
  stress: number;
  confidence: number;
};

type ClinicalReport = {
  summary_md: string;
  structured: Record<string, unknown>;
};

export type VoiceAnalysisResult = {
  transcript: Transcript;
  emotions: EmotionTimeline;
  biomarkers: Biomarkers;
  risk: RiskScores;
  report: ClinicalReport;
};

export function useVoiceAnalysis() {
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<VoiceAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // TODO: POST multipart audio to /api/voice-engine/analyze; poll job; setResult on done.
  async function analyze(_file: File): Promise<void> {
    setStatus("uploading");
    setError(null);
    setResult(null);
  }

  return { status, result, error, analyze };
}
