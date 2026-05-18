// =============================================================================
// knowledge-explorer-loading.jsx
// DeepSynaps Protocol Studio — Loading / Skeleton Component
// Phase 6/7/8
// =============================================================================

import React, { useMemo } from 'react';

/* ── Design-system tokens (mirror DeepSynaps CSS variables) ───────────────── */
const DS = {
  bgPrimary:   'var(--bg-primary, #0b1120)',
  bgCard:      'var(--bg-card, #0f172a)',
  border:      'var(--border, rgba(255,255,255,0.08))',
  skeleton:    'var(--skeleton, rgba(255,255,255,0.06))',
  skeletonHighlight: 'var(--skeleton-highlight, rgba(255,255,255,0.10))',
  textPrimary: 'var(--text-primary, #e2e8f0)',
  textSecondary:'var(--text-secondary, #94a3b8)',
  textTertiary:'var(--text-tertiary, #64748b)',
  teal:        'var(--teal, #00d4bc)',
  blue:        'var(--blue, #4a9eff)',
  violet:      'var(--violet, #8b5cf6)',
  rose:        'var(--rose, #f87171)',
  amber:       'var(--amber, #f59e0b)',
  radiusLg:    'var(--radius-lg, 12px)',
  radiusMd:    'var(--radius-md, 8px)',
  fontDisplay: 'var(--font-display, system-ui, -apple-system, sans-serif)',
};

/* ── Pulse animation keyframes (injected once) ─────────────────────────────── */
const PULSE_KEYFRAMES = `
@keyframes dsSkeletonPulse {
  0%   { opacity: 1; }
  50%  { opacity: 0.40; }
  100% { opacity: 1; }
}
@keyframes dsShimmer {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}`;

/* ── Base shimmer style (gradient sweep for premium feel) ─────────────────── */
const shimmerBg = {
  backgroundImage: `linear-gradient(
    90deg,
    ${DS.skeleton} 0%,
    ${DS.skeletonHighlight} 50%,
    ${DS.skeleton} 100%
  )`,
  backgroundSize: '200% 100%',
  animation: 'dsShimmer 1.8s ease-in-out infinite',
};

/* ════════════════════════════════════════════════════════════════════════════
   KNOWLEDGE EXPLORER SKELETON
   Full-page placeholder shown while adapters / search results load.
   ════════════════════════════════════════════════════════════════════════════ */
export function KnowledgeExplorerSkeleton() {
  return (
    <div style={styles.page}>
      <style>{PULSE_KEYFRAMES}</style>

      {/* Top stats row */}
      <div style={styles.statsRow}>
        <SkeletonStat color={DS.teal} />
        <SkeletonStat color={DS.blue} />
        <SkeletonStat color={DS.violet} />
        <SkeletonStat color={DS.rose} />
        <SkeletonStat color={DS.amber} />
      </div>

      {/* Search bar */}
      <div style={styles.searchBar}>
        <div style={{ ...styles.shimmer, width: '60%', height: 20, borderRadius: 6 }} />
        <div style={{ ...styles.shimmer, width: 80, height: 32, borderRadius: 6, marginLeft: 'auto' }} />
      </div>

      {/* Adapter grid */}
      <div style={styles.sectionTitle}>
        <div style={{ ...styles.shimmer, width: 140, height: 18, borderRadius: 4 }} />
      </div>
      <div style={styles.adapterGrid}>
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonAdapterCard key={i} delay={i * 0.12} />
        ))}
      </div>

      {/* Results area */}
      <div style={styles.sectionTitle}>
        <div style={{ ...styles.shimmer, width: 100, height: 18, borderRadius: 4 }} />
      </div>
      <SkeletonResultList count={4} />
    </div>
  );
}

/* ── Stat card skeleton ────────────────────────────────────────────────────── */
function SkeletonStat({ color }) {
  return (
    <div style={styles.statCard}>
      <div style={{ ...styles.shimmer, width: '50%', height: 28, borderRadius: 6, margin: '0 auto 8px' }} />
      <div style={{ ...styles.shimmer, width: '70%', height: 12, borderRadius: 4, margin: '0 auto' }} />
      <div style={{ ...styles.shimmer, width: '40%', height: 10, borderRadius: 4, margin: '8px auto 0' }} />
    </div>
  );
}

/* ── Adapter card skeleton ───────────────────────────────────────────────── */
function SkeletonAdapterCard({ delay = 0 }) {
  return (
    <div style={{ ...styles.adapterCard, animationDelay: `${delay}s` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div style={{ ...styles.shimmer, width: 40, height: 40, borderRadius: 10 }} />
        <div style={{ flex: 1 }}>
          <div style={{ ...styles.shimmer, width: '65%', height: 16, borderRadius: 4, marginBottom: 8 }} />
          <div style={{ ...styles.shimmer, width: '40%', height: 12, borderRadius: 4 }} />
        </div>
      </div>
      <div style={{ ...styles.shimmer, width: '100%', height: 10, borderRadius: 4, marginBottom: 6 }} />
      <div style={{ ...styles.shimmer, width: '80%', height: 10, borderRadius: 4 }} />
    </div>
  );
}

/* ── Result list skeleton ────────────────────────────────────────────────── */
function SkeletonResultList({ count = 3 }) {
  return (
    <div style={styles.resultList}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={styles.resultRow}>
          <div style={{ ...styles.shimmer, width: 36, height: 36, borderRadius: 8, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...styles.shimmer, width: '45%', height: 16, borderRadius: 4, marginBottom: 8 }} />
            <div style={{ ...styles.shimmer, width: '75%', height: 12, borderRadius: 4, marginBottom: 6 }} />
            <div style={{ ...styles.shimmer, width: '55%', height: 10, borderRadius: 4 }} />
          </div>
          <div style={{ ...styles.shimmer, width: 60, height: 24, borderRadius: 6, flexShrink: 0 }} />
        </div>
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   COMPACT SKELETONS (for inline / panel use)
   ════════════════════════════════════════════════════════════════════════════ */
export function AdapterCardSkeleton() {
  return (
    <div style={styles.adapterCard}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ ...styles.shimmer, width: 32, height: 32, borderRadius: 8 }} />
        <div style={{ flex: 1 }}>
          <div style={{ ...styles.shimmer, width: '55%', height: 14, borderRadius: 4, marginBottom: 6 }} />
          <div style={{ ...styles.shimmer, width: '35%', height: 10, borderRadius: 4 }} />
        </div>
      </div>
    </div>
  );
}

export function SearchResultSkeleton({ count = 3 }) {
  return (
    <div>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ ...styles.resultRow, padding: '12px 0', borderBottom: `1px solid ${DS.border}` }}>
          <div style={{ flex: 1 }}>
            <div style={{ ...styles.shimmer, width: '40%', height: 14, borderRadius: 4, marginBottom: 6 }} />
            <div style={{ ...styles.shimmer, width: '70%', height: 10, borderRadius: 4 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EvidenceStatsSkeleton() {
  return (
    <div style={styles.statsRow}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} style={styles.statCard}>
          <div style={{ ...styles.shimmer, width: '45%', height: 24, borderRadius: 6, margin: '0 auto 8px' }} />
          <div style={{ ...styles.shimmer, width: '60%', height: 12, borderRadius: 4, margin: '0 auto' }} />
        </div>
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   INLINE LOADING SPINNER (for buttons / small UI elements)
   ════════════════════════════════════════════════════════════════════════════ */
export function InlineSpinner({ size = 20, color = DS.teal }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        border: `2px solid ${color}`,
        borderBottomColor: 'transparent',
        borderRadius: '50%',
        animation: 'dsSpinner 0.75s linear infinite',
      }}
    />
  );
}

export function ButtonSpinner({ children, loading, size = 16 }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      {loading && <InlineSpinner size={size} />}
      {children}
    </span>
  );
}

/* ── Spinner keyframes (injected by InlineSpinner caller or global CSS) ──── */
const SPINNER_CSS = `
@keyframes dsSpinner {
  0%   { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}`;

/* ════════════════════════════════════════════════════════════════════════════
   STYLE OBJECTS
   ════════════════════════════════════════════════════════════════════════════ */
const styles = {
  page: {
    padding: 24,
    background: DS.bgPrimary,
    minHeight: '100vh',
    color: DS.textPrimary,
    fontFamily: DS.fontDisplay,
  },
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    background: DS.bgCard,
    border: `1px solid ${DS.border}`,
    borderRadius: DS.radiusLg,
    padding: '16px 14px',
    textAlign: 'center',
  },
  searchBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    background: DS.bgCard,
    border: `1px solid ${DS.border}`,
    borderRadius: DS.radiusMd,
    padding: '10px 14px',
    marginBottom: 20,
  },
  sectionTitle: {
    marginBottom: 12,
    marginTop: 8,
  },
  adapterGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: 14,
    marginBottom: 24,
  },
  adapterCard: {
    background: DS.bgCard,
    border: `1px solid ${DS.border}`,
    borderRadius: DS.radiusLg,
    padding: 16,
  },
  resultList: {
    background: DS.bgCard,
    border: `1px solid ${DS.border}`,
    borderRadius: DS.radiusLg,
    padding: '8px 16px',
  },
  resultRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '14px 0',
    borderBottom: `1px solid ${DS.border}`,
  },
  shimmer: {
    ...shimmerBg,
    borderRadius: 4,
  },
};

/* ════════════════════════════════════════════════════════════════════════════
   EXPORTS
   ════════════════════════════════════════════════════════════════════════════ */
export default KnowledgeExplorerSkeleton;
