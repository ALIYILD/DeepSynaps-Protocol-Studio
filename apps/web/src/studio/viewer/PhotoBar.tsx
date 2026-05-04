/** Photic / stim ticks — intensity → color by nominal Hz bucket. */

export function PhotoBar({
  width,
  height,
  fromSec,
  toSec,
  photic,
  sampleRate,
}: {
  width: number;
  height: number;
  fromSec: number;
  toSec: number;
  photic: number[] | undefined;
  sampleRate: number;
}) {
  const span = toSec - fromSec || 1;
  const xAtSample = (i: number) => {
    const t = fromSec + i / sampleRate;
    return ((t - fromSec) / span) * width;
  };

  return (
    <div
      style={{
        position: "relative",
        width,
        height,
        background: "linear-gradient(180deg, var(--ds-elev), var(--ds-toolbar-bg))",
        borderTop: "1px solid var(--ds-line)",
      }}
    >
      {photic?.map((v, i) => {
        if (!v) return null;
        const h = 40 + (i % 7) * 35;
        const left = xAtSample(i);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left,
              bottom: 0,
              width: 2,
              height: "70%",
              background: `hsl(${h} 70% 45%)`,
            }}
          />
        );
      })}
    </div>
  );
}
