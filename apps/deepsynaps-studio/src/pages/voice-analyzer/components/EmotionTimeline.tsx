type EmotionFrame = {
  start_sec: number;
  end_sec: number;
  label: string;
  confidence: number;
};

type EmotionTimelineData = {
  frames: EmotionFrame[];
  dominant_label: string;
  mean_confidence: number;
};

type EmotionTimelineProps = {
  emotions?: EmotionTimelineData;
};

export function EmotionTimeline({ emotions }: EmotionTimelineProps) {
  // TODO: stacked-area or strip chart of per-frame labels; highlight dominant span.
  return (
    <section className="rounded border p-4">
      <h2 className="text-lg font-medium">Emotion timeline</h2>
      <p>{emotions?.dominant_label ?? "Awaiting analysis…"}</p>
    </section>
  );
}
