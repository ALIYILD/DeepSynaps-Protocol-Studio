import type { CSSProperties } from "react";

const box: CSSProperties = {
  border: "1px dashed #ccc",
  borderRadius: 6,
  padding: 8,
  fontSize: 11,
  background: "#fafafa",
};

export function PatientCardBlock() {
  return (
    <div style={box}>
      <strong>Patient card</strong>
      <div style={{ opacity: 0.75, marginTop: 4 }}>
        Renders from server variables at export (name, DOB, …).
      </div>
    </div>
  );
}
