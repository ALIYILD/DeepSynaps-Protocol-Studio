import React, { useState, useMemo } from 'react';

/**
 * DeepSynaps design-system tokens
 */
const DS = {
  navy950: '#050810',
  navy900: '#080d1a',
  navy800: '#0e1628',
  navy700: '#152040',
  navy600: '#1e2d52',
  teal: '#00d4bc',
  tealGhost: 'rgba(0,212,188,0.06)',
  blue: '#4a9eff',
  blueGlow: 'rgba(74,158,255,0.15)',
  amber: '#ffb547',
  amberGhost: 'rgba(255,181,71,0.08)',
  green: '#4ade80',
  red: '#ff6b6b',
  violet: '#9b7fff',
  textPrimary: '#e8edf5',
  textSecondary: '#a8b3c1',
  textTertiary: '#9ba6b8',
  border: 'rgba(255,255,255,0.06)',
  borderHover: 'rgba(255,255,255,0.12)',
  radiusMd: '10px',
  radiusLg: '14px',
  fontBody: "'DM Sans', system-ui, sans-serif",
  fontMono: "'DM Mono', monospace",
};

function toneColor(tone) {
  switch (tone) {
    case 'teal': return DS.teal;
    case 'blue': return DS.blue;
    case 'amber': return DS.amber;
    case 'red': return DS.red;
    case 'green': return DS.green;
    case 'violet': return DS.violet;
    default: return DS.blue;
  }
}

function toneBg(tone) {
  const c = toneColor(tone);
  return c + '18';
}

function confidenceLabel(c) {
  if (!c) return 'low';
  if (typeof c === 'number') {
    if (c >= 0.8) return 'high';
    if (c >= 0.5) return 'moderate';
    return 'low';
  }
  const s = String(c).toLowerCase();
  if (['high', 'strong', 'definite'].includes(s)) return 'high';
  if (['moderate', 'medium', 'possible'].includes(s)) return 'moderate';
  return 'low';
}

function _fmtDate(value) {
  if (!value) return 'Unknown';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Unknown';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function _toArray(value) {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.items)) return value.items;
  return [];
}

/**
 * FindingCard — single finding/finding row
 */
function FindingCard({ title, summary, supporting, confidence, tone, provenance }) {
  const cLabel = confidenceLabel(confidence);
  const cColor = cLabel === 'high' ? DS.teal : cLabel === 'moderate' ? DS.amber : DS.blue;
  const bgTone = toneBg(tone || 'blue');
  const borderTone = toneColor(tone || 'blue') + '33';

  return (
    <div
      style={{
        padding: '12px 14px',
        borderRadius: DS.radiusMd,
        border: `1px solid ${borderTone}`,
        background: bgTone,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: DS.textPrimary }}>{title}</div>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: 4,
            background: `${cColor}22`,
            color: cColor,
            fontFamily: DS.fontMono,
            letterSpacing: '0.5px',
            flexShrink: 0,
          }}
        >
          {cLabel.toUpperCase()}
        </span>
      </div>
      <div style={{ fontSize: 12.5, color: DS.textSecondary, lineHeight: 1.6 }}>{summary}</div>
      {supporting && (
        <div style={{ fontSize: 11.5, color: DS.textTertiary, lineHeight: 1.6 }}>{supporting}</div>
      )}
      {provenance && (
        <div style={{ fontSize: 11, color: DS.textTertiary, fontFamily: DS.fontMono, marginTop: 2 }}>
          Source: {provenance}
        </div>
      )}
    </div>
  );
}

/**
 * PredictionCard — renders a key prediction
 */
function PredictionCard({ prediction }) {
  const { title, summary, expected_direction, why, caveat, confidence } = prediction;
  const cLabel = confidenceLabel(confidence);
  const cColor = cLabel === 'high' ? DS.teal : cLabel === 'moderate' ? DS.amber : DS.blue;

  return (
    <div
      style={{
        padding: '12px 14px',
        borderRadius: DS.radiusMd,
        border: `1px solid ${DS.border}`,
        background: DS.navy800,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: DS.textPrimary }}>
          {title || 'Predicted response'}
        </div>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: 4,
            background: `${cColor}22`,
            color: cColor,
            fontFamily: DS.fontMono,
            letterSpacing: '0.5px',
            flexShrink: 0,
          }}
        >
          {cLabel.toUpperCase()}
        </span>
      </div>
      <div style={{ fontSize: 12.5, color: DS.textSecondary, lineHeight: 1.6 }}>
        {summary || expected_direction || 'Prediction available'}
      </div>
      {why && (
        <div style={{ fontSize: 11.5, color: DS.textTertiary, lineHeight: 1.6 }}>{why}</div>
      )}
      {caveat && (
        <div style={{ fontSize: 11, color: DS.amber, lineHeight: 1.6 }}>Caveat: {caveat}</div>
      )}
    </div>
  );
}

/**
 * CorrelationPair — single correlation row
 */
function CorrelationPair({ pair }) {
  const { left, right, score, interpretation } = pair;
  const absScore = Math.abs(score || 0);
  const barColor = (score || 0) >= 0 ? DS.teal : DS.amber;
  const barWidth = Math.min(100, absScore * 100);

  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: DS.radiusMd,
        border: `1px solid ${DS.border}`,
        background: DS.navy800,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 12.5, color: DS.textPrimary }}>
          <strong>{left}</strong>
          {' ↔ '}
          <strong>{right}</strong>
        </div>
        <div style={{ fontSize: 11, fontFamily: DS.fontMono, color: DS.textTertiary }}>
          {(absScore * 100).toFixed(0)}%
        </div>
      </div>
      <div style={{ width: '100%', height: 4, borderRadius: 2, background: DS.navy700, overflow: 'hidden' }}>
        <div
          style={{
            width: `${barWidth}%`,
            height: '100%',
            borderRadius: 2,
            background: barColor,
            transition: 'width .6s ease',
          }}
        />
      </div>
      {interpretation && (
        <div style={{ fontSize: 11.5, color: DS.textTertiary }}>{interpretation}</div>
      )}
    </div>
  );
}

/**
 * CausationHypothesis — single causation entry
 */
function CausationHypothesis({ hypothesis }) {
  const { claim, strength, confidence, evidence_direction } = hypothesis;
  const confLabel = confidenceLabel(confidence || strength);
  const confColor = confLabel === 'high' ? DS.teal : confLabel === 'moderate' ? DS.amber : DS.blue;

  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: DS.radiusMd,
        border: `1px solid ${DS.border}`,
        background: DS.navy800,
        display: 'flex',
        flexDirection: 'column',
        gap: 5,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: DS.textPrimary }}>
          {claim || 'Hypothesis'}
        </div>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: 4,
            background: `${confColor}22`,
            color: confColor,
            fontFamily: DS.fontMono,
            flexShrink: 0,
          }}
        >
          {String(strength || confLabel).toUpperCase()}
        </span>
      </div>
      {evidence_direction && (
        <div style={{ fontSize: 11.5, color: DS.textTertiary }}>Evidence: {evidence_direction}</div>
      )}
    </div>
  );
}

/**
 * SectionHeader — collapsible section title
 */
function SectionHeader({ title, count, open, onToggle, accentColor }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: '10px 0',
        border: 'none',
        background: 'transparent',
        color: DS.textPrimary,
        fontSize: 13.5,
        fontWeight: 700,
        fontFamily: DS.fontBody,
        cursor: 'pointer',
        borderBottom: `1px solid ${DS.border}`,
        textAlign: 'left',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: accentColor || DS.teal,
            display: 'inline-block',
          }}
        />
        {title}
        {count != null && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: '1px 7px',
              borderRadius: 4,
              background: DS.navy700,
              color: DS.textTertiary,
            }}
          >
            {count}
          </span>
        )}
      </div>
      <span style={{ fontSize: 11, color: DS.textTertiary }}>{open ? '−' : '+'}</span>
    </button>
  );
}

/**
 * BrainTwinResultsPanel — renders DeepTwin output with proper formatting.
 * Props:
 *   - data: { findings: [], prediction: {}, correlation: {}, causation: {}, synthesis: {} }
 *   - loading: boolean
 *   - error: string | null
 *   - onRetry: () => void
 */
export function BrainTwinResultsPanel({ data, loading, error, onRetry }) {
  const [sections, setSections] = useState({
    findings: true,
    predictions: true,
    correlations: true,
    causations: true,
    synthesis: true,
  });

  const toggle = (key) => setSections((s) => ({ ...s, [key]: !s[key] }));

  const findings = useMemo(() => _toArray(data?.findings), [data?.findings]);
  const predictions = useMemo(() => _toArray(data?.prediction?.key_predictions || data?.predictions), [data?.prediction, data?.predictions]);
  const correlations = useMemo(() => _toArray(data?.correlation?.priority_pairs || data?.correlations), [data?.correlation, data?.correlations]);
  const causations = useMemo(() => _toArray(data?.causation?.hypotheses || data?.causations), [data?.causation, data?.causations]);
  const synthesis = useMemo(() => {
    if (!data?.synthesis) return null;
    return data.synthesis;
  }, [data?.synthesis]);

  if (loading) {
    return (
      <div
        style={{
          padding: 32,
          textAlign: 'center',
          color: DS.textTertiary,
          fontSize: 13,
          fontFamily: DS.fontBody,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            border: `2px solid ${DS.navy600}`,
            borderTopColor: DS.teal,
            borderRadius: '50%',
            animation: 'spin .8s linear infinite',
          }}
        />
        <div>Analyzing multimodal data...</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        style={{
          padding: '14px 16px',
          borderRadius: DS.radiusLg,
          border: `1px solid ${DS.red}33`,
          background: `${DS.red}0d`,
          color: DS.red,
          fontSize: 13,
          fontFamily: DS.fontBody,
          lineHeight: 1.6,
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Analysis Error</div>
        <div>{error}</div>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            style={{
              marginTop: 10,
              padding: '6px 14px',
              borderRadius: DS.radiusMd,
              border: 'none',
              background: DS.red + '22',
              color: DS.red,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: DS.fontBody,
            }}
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  if (!data || (!findings.length && !predictions.length && !correlations.length && !causations.length && !synthesis)) {
    return (
      <div
        style={{
          padding: '28px 20px',
          borderRadius: DS.radiusLg,
          border: `1px dashed ${DS.borderHover}`,
          background: 'transparent',
          color: DS.textTertiary,
          fontSize: 12.5,
          fontFamily: DS.fontBody,
          textAlign: 'center',
          lineHeight: 1.7,
        }}
      >
        <div style={{ fontWeight: 600, color: DS.textSecondary, marginBottom: 6 }}>No analysis results yet</div>
        <div>Select a patient and run synthesis to generate findings, predictions, and correlations.</div>
      </div>
    );
  }

  return (
    <div
      style={{
        fontFamily: DS.fontBody,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        color: DS.textPrimary,
      }}
    >
      {/* Synthesis summary */}
      {synthesis && (
        <div style={{ marginBottom: 8 }}>
          <SectionHeader
            title="Synthesis Summary"
            open={sections.synthesis}
            onToggle={() => toggle('synthesis')}
            accentColor={DS.violet}
          />
          {sections.synthesis && (
            <div style={{ padding: '12px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {synthesis.executive_summary && (
                <div style={{ fontSize: 13, color: DS.textSecondary, lineHeight: 1.7 }}>
                  {synthesis.executive_summary}
                </div>
              )}
              {synthesis.domains && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {synthesis.domains.map((d) => (
                    <span
                      key={d}
                      style={{
                        fontSize: 10.5,
                        fontWeight: 600,
                        padding: '3px 10px',
                        borderRadius: 5,
                        background: DS.navy700,
                        color: DS.teal,
                      }}
                    >
                      {d}
                    </span>
                  ))}
                </div>
              )}
              {synthesis.generated_at && (
                <div style={{ fontSize: 11, color: DS.textTertiary, fontFamily: DS.fontMono }}>
                  Generated: {_fmtDate(synthesis.generated_at)}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Findings */}
      {findings.length > 0 && (
        <div>
          <SectionHeader
            title="Findings"
            count={findings.length}
            open={sections.findings}
            onToggle={() => toggle('findings')}
            accentColor={DS.teal}
          />
          {sections.findings && (
            <div style={{ padding: '10px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {findings.map((f, i) => (
                <FindingCard
                  key={`finding-${i}`}
                  title={f.title}
                  summary={f.summary}
                  supporting={f.supporting}
                  confidence={f.confidence}
                  tone={f.tone}
                  provenance={f.provenance}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Predictions */}
      {predictions.length > 0 && (
        <div>
          <SectionHeader
            title="Predictions"
            count={predictions.length}
            open={sections.predictions}
            onToggle={() => toggle('predictions')}
            accentColor={DS.blue}
          />
          {sections.predictions && (
            <div style={{ padding: '10px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {predictions.map((p, i) => (
                <PredictionCard key={`pred-${i}`} prediction={p} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Correlations */}
      {correlations.length > 0 && (
        <div>
          <SectionHeader
            title="Correlations"
            count={correlations.length}
            open={sections.correlations}
            onToggle={() => toggle('correlations')}
            accentColor={DS.amber}
          />
          {sections.correlations && (
            <div style={{ padding: '10px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {correlations.map((c, i) => (
                <CorrelationPair key={`corr-${i}`} pair={c} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Causations */}
      {causations.length > 0 && (
        <div>
          <SectionHeader
            title="Causal Hypotheses"
            count={causations.length}
            open={sections.causations}
            onToggle={() => toggle('causations')}
            accentColor={DS.violet}
          />
          {sections.causations && (
            <div style={{ padding: '10px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {causations.map((h, i) => (
                <CausationHypothesis key={`cause-${i}`} hypothesis={h} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Timestamp */}
      {data?.generated_at && (
        <div
          style={{
            marginTop: 8,
            paddingTop: 10,
            borderTop: `1px solid ${DS.border}`,
            fontSize: 11,
            color: DS.textTertiary,
            fontFamily: DS.fontMono,
          }}
        >
          Last updated: {_fmtDate(data.generated_at)}
        </div>
      )}
    </div>
  );
}

export default BrainTwinResultsPanel;
