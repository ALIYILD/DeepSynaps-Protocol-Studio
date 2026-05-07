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

type TranscriptViewerProps = {
  transcript?: Transcript;
};

export function TranscriptViewer({ transcript }: TranscriptViewerProps) {
  // TODO: render word-level timeline with confidence shading; click-to-seek.
  return (
    <section className="rounded border p-4">
      <h2 className="text-lg font-medium">Transcript</h2>
      <p>{transcript?.text ?? "Awaiting analysis…"}</p>
    </section>
  );
}
