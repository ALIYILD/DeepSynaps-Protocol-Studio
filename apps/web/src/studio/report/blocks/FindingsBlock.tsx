import type { CSSProperties } from "react";

export function FindingsBlock({
  text,
  onChange,
}: {
  text: string;
  onChange: (t: string) => void;
}) {
  return (
    <label style={{ display: "block", fontSize: 11 }}>
      <div style={{ marginBottom: 4, fontWeight: 600 }}>EEG findings</div>
      <textarea
        value={text}
        onChange={(e) => onChange(e.target.value)}
        rows={6}
        style={ta}
        placeholder="Draft text — supports {{placeholders}}"
      />
    </label>
  );
}

const ta: CSSProperties = {
  width: "100%",
  fontFamily: "inherit",
  fontSize: 11,
  boxSizing: "border-box",
};
