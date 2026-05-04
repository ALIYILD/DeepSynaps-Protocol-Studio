import type { CSSProperties } from "react";

const box: CSSProperties = {
  border: "1px dashed #ccc",
  padding: 8,
  fontSize: 11,
  color: "#555",
};

export function IndicesTableBlock() {
  return (
    <div style={box}>
      Indices table — populated from analysis normative Z map at export.
    </div>
  );
}
