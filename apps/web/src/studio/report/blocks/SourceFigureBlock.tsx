import type { CSSProperties } from "react";

export function SourceFigureBlock({
  caption,
  onCaption,
}: {
  caption?: string;
  onCaption: (t: string) => void;
}) {
  return (
    <div style={box}>
      <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Source localization</div>
      <input
        value={caption ?? ""}
        onChange={(e) => onCaption(e.target.value)}
        placeholder="Caption"
        style={{ width: "100%", fontSize: 11 }}
      />
      <div style={{ marginTop: 6, fontSize: 10, opacity: 0.7 }}>
        Placeholder in exports (M10 assets wire-up).
      </div>
    </div>
  );
}

const box: CSSProperties = {
  border: "1px dashed #ccc",
  padding: 8,
};
