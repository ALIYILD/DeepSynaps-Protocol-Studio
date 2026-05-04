import type { CSSProperties } from "react";

const box: CSSProperties = {
  border: "1px dashed #ccc",
  padding: 8,
  fontSize: 11,
  color: "#555",
};

export function SpectraGridBlock() {
  return (
    <div style={box}>
      Spectral topomaps grid — placeholder at render (export from Spectra viewer).
    </div>
  );
}
