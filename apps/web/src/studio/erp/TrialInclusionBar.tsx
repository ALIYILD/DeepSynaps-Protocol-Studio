import { useCallback, useEffect, useRef, useState } from "react";

import { useErpStore } from "./ErpStore";

export function TrialInclusionBar() {
  const trials = useErpStore((s) => s.trials);
  const included = useErpStore((s) => s.includedIndexes);
  const toggle = useErpStore((s) => s.toggleTrial);
  const setIncluded = useErpStore((s) => s.setIncluded);
  const [focusIdx, setFocusIdx] = useState(0);

  const wrapRef = useRef<HTMLDivElement>(null);

  const ordered = [...trials].sort((a, b) => a.index - b.index);
  const current = ordered[focusIdx]?.index ?? ordered[0]?.index ?? 0;

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setIncluded(ordered.map((t) => t.index));
        return;
      }
      if (e.key === "[") {
        e.preventDefault();
        const set = new Set(included);
        set.delete(current);
        useErpStore.setState({ includedIndexes: set });
        useErpStore.getState().recomputeDebounced();
        return;
      }
      if (e.key === "]") {
        e.preventDefault();
        const set = new Set(included);
        set.add(current);
        useErpStore.setState({ includedIndexes: set });
        useErpStore.getState().recomputeDebounced();
        return;
      }
    },
    [ordered, included, current, setIncluded],
  );

  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onKey]);

  if (!ordered.length) {
    return <div style={{ fontSize: 11, opacity: 0.7, padding: 8 }}>No per-trial ERP rows — run compute first.</div>;
  }

  return (
    <div ref={wrapRef} style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10, opacity: 0.75, marginBottom: 4 }}>
        Trials (scroll) · [ exclude · ] include · Ctrl+A all
      </div>
      <div
        style={{
          display: "flex",
          gap: 6,
          overflowX: "auto",
          paddingBottom: 6,
          maxWidth: "100%",
        }}
      >
        {ordered.map((t, i) => {
          const on = included.has(t.index);
          return (
            <label
              key={`${t.index}-${t.class}`}
              style={{
                flex: "0 0 auto",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 10,
                padding: "4px 6px",
                borderRadius: 6,
                border: focusIdx === i ? "2px solid var(--ds-accent, #0a0)" : "1px solid var(--ds-line, #ccc)",
                cursor: "pointer",
                background: on ? "rgba(0,200,120,0.08)" : "transparent",
              }}
              onMouseDown={() => setFocusIdx(i)}
            >
              <input type="checkbox" checked={on} onChange={() => toggle(t.index)} />
              <span>#{t.index}</span>
              <span style={{ opacity: 0.8 }}>{t.class}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
