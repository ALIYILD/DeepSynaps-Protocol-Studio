import React, { useMemo, useState, useEffect } from 'react';

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
  tealGlow: 'rgba(0,212,188,0.18)',
  blue: '#4a9eff',
  blueGlow: 'rgba(74,158,255,0.15)',
  amber: '#ffb547',
  green: '#4ade80',
  red: '#ff6b6b',
  violet: '#9b7fff',
  rose: '#ff6b9d',
  textPrimary: '#e8edf5',
  textSecondary: '#a8b3c1',
  textTertiary: '#9ba6b8',
  border: 'rgba(255,255,255,0.06)',
  radiusMd: '10px',
  radiusLg: '14px',
  fontBody: "'DM Sans', system-ui, sans-serif",
  fontMono: "'DM Mono', monospace",
};

/**
 * Default 7 dimensions for DeepTwin confidence assessment.
 */
const DEFAULT_DIMENSIONS = [
  { id: 'qeeg', label: 'qEEG', short: 'qEEG' },
  { id: 'mri', label: 'MRI', short: 'MRI' },
  { id: 'wearables', label: 'Wearables', short: 'Wear' },
  { id: 'assessments', label: 'Assessments', short: 'Asmt' },
  { id: 'ehr', label: 'Medical Records', short: 'EHR' },
  { id: 'behavioral', label: 'Behavioral', short: 'Beh' },
  { id: 'treatment', label: 'Treatment History', short: 'Tx' },
];

/**
 * Polar-to-cartesian conversion.
 */
function polar(cx, cy, radius, angleRad) {
  return {
    x: cx + radius * Math.cos(angleRad - Math.PI / 2),
    y: cy + radius * Math.sin(angleRad - Math.PI / 2),
  };
}

/**
 * RadarChart — SVG 7-dimensional confidence visualization.
 * Props:
 *   - values: Record<string, number>  (0..1)
 *   - dimensions: Array<{id, label, short}> — optional override
 *   - size: number — pixel diameter (default 320)
 *   - title: string
 *   - subtitle: string
 *   - loading: boolean
 *   - onDimensionClick: (dimId) => void
 */
export function BrainTwinConfidenceChart({
  values = {},
  dimensions: dimsProp,
  size = 320,
  title = 'DeepTwin Confidence',
  subtitle = 'Per-modality data quality and coverage',
  loading = false,
  onDimensionClick,
}) {
  const [hoveredDim, setHoveredDim] = useState(null);
  const [animatedValues, setAnimatedValues] = useState({});

  const dimensions = dimsProp || DEFAULT_DIMENSIONS;
  const n = dimensions.length;
  const cx = size / 2;
  const cy = size / 2 + 4; // slight offset for label space
  const radius = size * 0.34;
  const levels = 5;

  // Animate values on mount / change
  useEffect(() => {
    if (loading) return;
    let frame;
    const start = performance.now();
    const duration = 700;

    const tick = (now) => {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - (1 - progress) ** 3; // easeOutCubic

      const next = {};
      dimensions.forEach((d) => {
        const target = values[d.id] ?? 0;
        next[d.id] = target * eased;
      });
      setAnimatedValues(next);

      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [values, dimensions, loading]);

  // Grid polygon points for each level
  const gridPolygons = useMemo(() => {
    return Array.from({ length: levels }, (_, level) => {
      const r = (radius * (level + 1)) / levels;
      const pts = dimensions.map((_, i) => {
        const angle = (2 * Math.PI * i) / n;
        const p = polar(cx, cy, r, angle);
        return `${p.x},${p.y}`;
      }).join(' ');
      return { r, points: pts, opacity: (level + 1) / levels };
    });
  }, [dimensions, n, cx, cy, radius]);

  // Axis lines
  const axes = useMemo(() => {
    return dimensions.map((dim, i) => {
      const angle = (2 * Math.PI * i) / n;
      const end = polar(cx, cy, radius, angle);
      return { dim, angle, x1: cx, y1: cy, x2: end.x, y2: end.y };
    });
  }, [dimensions, n, cx, cy, radius]);

  // Data polygon from animated values
  const dataPoints = useMemo(() => {
    return dimensions.map((dim, i) => {
      const angle = (2 * Math.PI * i) / n;
      const val = animatedValues[dim.id] ?? 0;
      const r = radius * Math.max(0, Math.min(1, val));
      return polar(cx, cy, r, angle);
    });
  }, [dimensions, n, animatedValues, cx, cy, radius]);

  const dataPolygon = dataPoints.map((p) => `${p.x},${p.y}`).join(' ');

  // Overall score (average of available values)
  const overall = useMemo(() => {
    const vals = Object.values(values).filter((v) => typeof v === 'number');
    if (!vals.length) return 0;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }, [values]);

  if (loading) {
    return (
      <div
        style={{
          width: size,
          height: size + 48,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          fontFamily: DS.fontBody,
        }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            border: `2px solid ${DS.navy600}`,
            borderTopColor: DS.teal,
            borderRadius: '50%',
            animation: 'spin .8s linear infinite',
          }}
        />
        <div style={{ fontSize: 11, color: DS.textTertiary }}>Loading confidence...</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div
      style={{
        fontFamily: DS.fontBody,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
      }}
    >
      {/* Header */}
      {(title || subtitle) && (
        <div style={{ textAlign: 'center', marginBottom: 4 }}>
          {title && (
            <div style={{ fontSize: 13.5, fontWeight: 700, color: DS.textPrimary }}>{title}</div>
          )}
          {subtitle && (
            <div style={{ fontSize: 11.5, color: DS.textTertiary, marginTop: 2 }}>{subtitle}</div>
          )}
        </div>
      )}

      {/* SVG Chart */}
      <svg
        width={size}
        height={size + 16}
        viewBox={`0 0 ${size} ${size + 16}`}
        style={{ overflow: 'visible' }}
      >
        <defs>
          {/* Glow filter for data polygon */}
          <filter id="bt-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Gradient fill for data area */}
          <radialGradient id="bt-fill" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={DS.teal} stopOpacity="0.25" />
            <stop offset="100%" stopColor={DS.teal} stopOpacity="0.05" />
          </radialGradient>
        </defs>

        {/* Grid rings */}
        {gridPolygons.map((g, i) => (
          <polygon
            key={`grid-${i}`}
            points={g.points}
            fill="none"
            stroke={DS.navy600}
            strokeWidth={0.8}
            strokeDasharray={i < levels - 1 ? '2,3' : 'none'}
            opacity={0.5 + g.opacity * 0.3}
          />
        ))}

        {/* Axis lines */}
        {axes.map((a, i) => (
          <line
            key={`axis-${i}`}
            x1={a.x1}
            y1={a.y1}
            x2={a.x2}
            y2={a.y2}
            stroke={DS.navy600}
            strokeWidth={0.8}
          />
        ))}

        {/* Data area */}
        {dataPolygon && (
          <g>
            <polygon
              points={dataPolygon}
              fill="url(#bt-fill)"
              stroke={DS.teal}
              strokeWidth={1.8}
              filter="url(#bt-glow)"
              style={{ transition: 'all .15s ease' }}
            />
          </g>
        )}

        {/* Data point dots and labels */}
        {dimensions.map((dim, i) => {
          const pt = dataPoints[i];
          const val = animatedValues[dim.id] ?? 0;
          const isHovered = hoveredDim === dim.id;
          const angle = (2 * Math.PI * i) / n;

          // Label position — offset outward from the max radius
          const labelRadius = radius + 22;
          const labelPos = polar(cx, cy, labelRadius, angle);

          // Anchor based on angle quadrant
          const dx = labelPos.x - cx;
          const textAnchor = dx > 8 ? 'start' : dx < -8 ? 'end' : 'middle';
          const labelOffsetY = labelPos.y < cy ? -4 : 12;

          return (
            <g
              key={`dim-${dim.id}`}
              style={{ cursor: onDimensionClick ? 'pointer' : 'default' }}
              onMouseEnter={() => setHoveredDim(dim.id)}
              onMouseLeave={() => setHoveredDim(null)}
              onClick={() => onDimensionClick?.(dim.id)}
            >
              {/* Hover ring */}
              {isHovered && (
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={10}
                  fill={`${DS.teal}15`}
                  stroke={DS.teal}
                  strokeWidth={0.8}
                  opacity={0.6}
                />
              )}

              {/* Data dot */}
              <circle
                cx={pt.x}
                cy={pt.y}
                r={isHovered ? 4.5 : 3.5}
                fill={DS.teal}
                stroke={DS.navy800}
                strokeWidth={1.5}
                style={{ transition: 'r .15s ease' }}
              />

              {/* Label */}
              <text
                x={labelPos.x}
                y={labelPos.y + labelOffsetY}
                textAnchor={textAnchor}
                fill={isHovered ? DS.textPrimary : DS.textSecondary}
                fontSize={isHovered ? 12 : 10.5}
                fontFamily={DS.fontBody}
                fontWeight={isHovered ? 700 : 500}
                style={{ transition: 'all .12s ease', userSelect: 'none', pointerEvents: 'none' }}
              >
                {dim.short || dim.label}
              </text>

              {/* Value tooltip on hover */}
              {isHovered && val > 0 && (
                <g>
                  <rect
                    x={pt.x - 22}
                    y={pt.y - 22}
                    width={44}
                    height={16}
                    rx={4}
                    fill={DS.navy700}
                    stroke={DS.border}
                    strokeWidth={0.5}
                  />
                  <text
                    x={pt.x}
                    y={pt.y - 10}
                    textAnchor="middle"
                    fill={DS.textPrimary}
                    fontSize={9}
                    fontFamily={DS.fontMono}
                    fontWeight={700}
                    pointerEvents="none"
                  >
                    {(val * 100).toFixed(0)}%
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>

      {/* Overall score badge */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '8px 16px',
          borderRadius: DS.radiusMd,
          border: `1px solid ${DS.border}`,
          background: DS.navy800,
        }}
      >
        <div style={{ fontSize: 11, color: DS.textTertiary }}>Overall</div>
        <div
          style={{
            fontSize: 16,
            fontWeight: 800,
            fontFamily: DS.fontMono,
            color: overall >= 0.7 ? DS.teal : overall >= 0.4 ? DS.amber : DS.red,
            letterSpacing: '-0.5px',
          }}
        >
          {(overall * 100).toFixed(0)}%
        </div>
        <div
          style={{
            width: 60,
            height: 4,
            borderRadius: 2,
            background: DS.navy700,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${overall * 100}%`,
              height: '100%',
              borderRadius: 2,
              background: overall >= 0.7 ? DS.teal : overall >= 0.4 ? DS.amber : DS.red,
              transition: 'width .8s ease',
            }}
          />
        </div>
      </div>

      {/* Dimension legend */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))',
          gap: '6px 10px',
          width: '100%',
          maxWidth: size,
          marginTop: 4,
        }}
      >
        {dimensions.map((dim) => {
          const val = values[dim.id];
          const hasValue = typeof val === 'number' && val > 0;
          const color = hasValue
            ? val >= 0.7 ? DS.teal : val >= 0.4 ? DS.amber : DS.red
            : DS.textTertiary;

          return (
            <div
              key={`legend-${dim.id}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 10.5,
                color: DS.textSecondary,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: color,
                  flexShrink: 0,
                }}
              />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {dim.label}
              </span>
              {hasValue && (
                <span style={{ color, fontFamily: DS.fontMono, fontSize: 10, fontWeight: 700, marginLeft: 'auto' }}>
                  {(val * 100).toFixed(0)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * ConfidenceMini — compact inline version showing a single dimension score.
 */
export function ConfidencePill({ value, label }) {
  const pct = Math.max(0, Math.min(1, typeof value === 'number' ? value : 0));
  const color = pct >= 0.7 ? DS.teal : pct >= 0.4 ? DS.amber : DS.red;

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 10px',
        borderRadius: DS.radiusMd,
        border: `1px solid ${DS.border}`,
        background: DS.navy800,
        fontSize: 11,
        fontFamily: DS.fontBody,
      }}
    >
      <span style={{ color: DS.textSecondary }}>{label}</span>
      <span style={{ color, fontWeight: 700, fontFamily: DS.fontMono }}>
        {(pct * 100).toFixed(0)}%
      </span>
    </div>
  );
}

export default BrainTwinConfidenceChart;
