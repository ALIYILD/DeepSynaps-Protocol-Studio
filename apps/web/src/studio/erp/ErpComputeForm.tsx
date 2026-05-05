import { useMemo, useState, type CSSProperties } from "react";

import { PARADIGMS } from "./paradigms/index";
import type { ErpComputeParams } from "./types";

const lb: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 12,
  marginBottom: 8,
};
const inp: CSSProperties = { padding: "4px 8px", fontSize: 12 };

function applyParadigm(code: string, availableClasses: string[], prev: ErpComputeParams): ErpComputeParams {
  if (code === "Custom") return { ...prev, paradigmCode: "Custom" };
  const def = PARADIGMS.find((p) => p.code === code);
  if (!def) return prev;
  const fromParadigm = def.stimClasses.map((s) => s.code);
  const stim =
    availableClasses.length ?
      fromParadigm.filter((c) => availableClasses.includes(c))
    : fromParadigm;
  return {
    ...prev,
    paradigmCode: def.code,
    stimulusClasses: stim.length ? stim : fromParadigm,
    preStimMs: def.preStimMs,
    postStimMs: def.postStimMs,
    baselineCorrection: def.baselineCorrection,
    artifactThresholdUv: def.artifactThresholdUv,
    minTrialsWarning: def.minTrials,
    baselineFromMs: def.preStimMs,
    baselineToMs: 0,
  };
}

export function ErpComputeForm({
  availableClasses,
  value,
  onChange,
}: {
  availableClasses: string[];
  value: ErpComputeParams;
  onChange: (p: ErpComputeParams) => void;
}) {
  const [paradigmCode, setParadigmCode] = useState(value.paradigmCode ?? "Custom");
  const paradigms = useMemo(
    () => [{ name: "Custom", code: "Custom" }, ...PARADIGMS.map((p) => ({ name: p.name, code: p.code }))],
    [],
  );

  const warnNoClasses = availableClasses.length === 0;

  const toggleClass = (c: string) => {
    const set = new Set(value.stimulusClasses);
    if (set.has(c)) set.delete(c);
    else set.add(c);
    onChange({ ...value, stimulusClasses: [...set], paradigmCode: "Custom" });
    setParadigmCode("Custom");
  };

  return (
    <>
      {warnNoClasses ?
        <div
          style={{
            fontSize: 11,
            padding: 8,
            marginBottom: 8,
            background: "rgba(245, 158, 11, 0.12)",
            borderRadius: 6,
            border: "1px solid rgba(245, 158, 11, 0.35)",
          }}
        >
          No stimulus classes found for this recording. Import or label trials before ERP averaging.
        </div>
      : null}

      <label style={lb}>
        Paradigm preset
        <select
          style={inp}
          value={paradigmCode}
          onChange={(e) => {
            const code = e.target.value;
            setParadigmCode(code);
            onChange(applyParadigm(code, availableClasses, value));
          }}
        >
          {paradigms.map((p) => (
            <option key={p.code} value={p.code}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      <div style={{ ...lb, marginBottom: 8 }}>
        <span>Stimulus classes</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
          {availableClasses.map((c) => (
            <label
              key={c}
              style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11 }}
            >
              <input
                type="checkbox"
                checked={value.stimulusClasses.includes(c)}
                onChange={() => toggleClass(c)}
              />
              {c}
            </label>
          ))}
        </div>
      </div>

      <label style={lb}>
        Pre-stim (ms)
        <input
          id="erp-pre-stim"
          type="number"
          style={inp}
          min={-500}
          max={0}
          value={value.preStimMs}
          onChange={(e) => onChange({ ...value, preStimMs: Number(e.target.value), paradigmCode: "Custom" })}
        />
      </label>
      <label style={lb} htmlFor="erp-post-stim">
        Post-stim (ms)
        <input
          id="erp-post-stim"
          type="number"
          style={inp}
          min={100}
          max={2000}
          value={value.postStimMs}
          onChange={(e) => onChange({ ...value, postStimMs: Number(e.target.value), paradigmCode: "Custom" })}
        />
      </label>

      <div style={{ ...lb, marginBottom: 8 }}>
        <span>Baseline correction</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
          {(["none", "mean", "linear"] as const).map((m) => (
            <label key={m} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              <input
                type="radio"
                name="erp-bl"
                checked={value.baselineCorrection === m}
                onChange={() => onChange({ ...value, baselineCorrection: m, paradigmCode: "Custom" })}
              />
              {m}
            </label>
          ))}
        </div>
      </div>

      <label style={lb}>
        Artifact threshold (µV)
        <input
          type="number"
          style={inp}
          min={50}
          max={500}
          value={value.artifactThresholdUv}
          onChange={(e) =>
            onChange({ ...value, artifactThresholdUv: Number(e.target.value), paradigmCode: "Custom" })
          }
        />
      </label>

      <label style={lb}>
        Min trials (warning threshold)
        <input
          type="number"
          style={inp}
          min={1}
          max={500}
          value={value.minTrialsWarning}
          onChange={(e) =>
            onChange({ ...value, minTrialsWarning: Number(e.target.value), paradigmCode: "Custom" })
          }
        />
      </label>
      <p style={{ fontSize: 10, opacity: 0.75, margin: "0 0 8px" }}>
        Fewer than {value.minTrialsWarning} trials per selected class may reduce ERP reliability — informational only.
      </p>
    </>
  );
}
