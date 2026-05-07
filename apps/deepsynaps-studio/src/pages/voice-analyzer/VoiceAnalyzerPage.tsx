import { useState } from "react";

import { AudioUploader } from "./components/AudioUploader";
import { BiomarkerPanel } from "./components/BiomarkerPanel";
import { ClinicalReportPanel } from "./components/ClinicalReportPanel";
import { EmotionTimeline } from "./components/EmotionTimeline";
import { RiskScoreCard } from "./components/RiskScoreCard";
import { TranscriptViewer } from "./components/TranscriptViewer";
import { useVoiceAnalysis } from "./hooks/useVoiceAnalysis";

export function VoiceAnalyzerPage() {
  const [, setFile] = useState<File | null>(null);
  const { result } = useVoiceAnalysis();

  // TODO: wire AudioUploader -> analyze(file); render result panels when status === "done".
  return (
    <main className="flex flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Voice Analyzer</h1>
      <AudioUploader onSelect={setFile} />
      <TranscriptViewer transcript={result?.transcript} />
      <EmotionTimeline emotions={result?.emotions} />
      <BiomarkerPanel biomarkers={result?.biomarkers} />
      <RiskScoreCard risk={result?.risk} />
      <ClinicalReportPanel report={result?.report} />
    </main>
  );
}
