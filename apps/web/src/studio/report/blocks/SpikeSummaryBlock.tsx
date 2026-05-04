import type { CSSProperties } from "react";

const box: CSSProperties = {
  border: "1px dashed #ccc",
  padding: 8,
  fontSize: 11,
  color: "#555",
};

export function SpikeSummaryBlock() {
  return (
    <div style={box}>
      Spike summary table — populated from M11 detection at export.
    </div>
  );
}
