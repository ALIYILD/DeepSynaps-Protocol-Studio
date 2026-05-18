// =============================================================================
// App-router-patch.js
// DeepSynaps Protocol Studio — React Router patch for Knowledge Explorer + Brain Twin
// Phase 6/7/8
// =============================================================================
//
// INSTRUCTIONS:
// 1. Open your existing App.js (or App.jsx)
// 2. Add the two import lines below near the top of the file
// 3. Insert the Route declarations inside your <Routes> block
// 4. Ensure you already have react-router-dom installed
//
// =============================================================================

// ── STEP 1: Add these imports ───────────────────────────────────────────────

import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

// Lazy-load the heavy pages so the initial bundle stays small.
const KnowledgeExplorer = lazy(() => import('./pages-knowledge-explorer'));
const BrainTwin         = lazy(() => import('./pages-brain-twin'));

// ── STEP 2: Insert these routes inside your <Routes> component ──────────────
//             (place them alongside your existing <Route> elements)

<Routes>
  {/* ── existing routes stay untouched ── */}
  {/* <Route path="/" element={<Dashboard />} /> */}
  {/* <Route path="/patients" element={<Patients />} /> */}
  {/* …etc… */}

  {/* ═══════════════════════════════════════════════════════════════════════ */}
  {/* KNOWLEDGE EXPLORER  (DeepSynaps Intelligence Layer)                  */}
  {/* ═══════════════════════════════════════════════════════════════════════ */}
  <Route
    path="/knowledge-explorer"
    element={
      <Suspense fallback={<KnowledgeExplorerSkeleton />}>
        <KnowledgeExplorer />
      </Suspense>
    }
  />

  {/* ═══════════════════════════════════════════════════════════════════════ */}
  {/* BRAIN TWIN  (Patient-specific multimodal digital twin)               */}
  {/* ═══════════════════════════════════════════════════════════════════════ */}
  <Route
    path="/brain-twin/:patientId?"
    element={
      <Suspense fallback={<BrainTwinSkeleton />}>
        <BrainTwin />
      </Suspense>
    }
  />

  {/* ═══════════════════════════════════════════════════════════════════════ */}
  {/* EVIDENCE STORE  (Curated corpus search + live PubMed ingest)           */}
  {/* ═══════════════════════════════════════════════════════════════════════ */}
  <Route
    path="/evidence-store"
    element={
      <Suspense fallback={<KnowledgeExplorerSkeleton />}>
        <EvidenceStore />
      </Suspense>
    }
  />

  {/* ═══════════════════════════════════════════════════════════════════════ */}
  {/* KNOWLEDGE SUB-ROUTES  (deep-link into specific adapters)               */}
  {/* ═══════════════════════════════════════════════════════════════════════ */}
  <Route
    path="/knowledge-explorer/:adapterKey"
    element={
      <Suspense fallback={<KnowledgeExplorerSkeleton />}>
        <KnowledgeExplorer />
      </Suspense>
    }
  />

  {/* ── catch-all / redirect ── */}
  <Route path="*" element={<Navigate to="/" replace />} />
</Routes>


// =============================================================================
// STEP 3: Skeleton loaders (drop these into the same file or a helpers module)
// =============================================================================

function KnowledgeExplorerSkeleton() {
  return (
    <div style={skeletonWrapStyle}>
      <div style={skeletonHeaderStyle} />
      <div style={skeletonGridStyle}>
        <div style={skeletonCardStyle} />
        <div style={skeletonCardStyle} />
        <div style={skeletonCardStyle} />
      </div>
      <div style={skeletonBarStyle} />
    </div>
  );
}

function BrainTwinSkeleton() {
  return (
    <div style={skeletonWrapStyle}>
      <div style={skeletonHeaderStyle} />
      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ ...skeletonCardStyle, flex: 1 }} />
        <div style={{ ...skeletonCardStyle, flex: 2 }} />
      </div>
    </div>
  );
}

// ── DeepSynaps dark-theme skeleton styles (inline for zero deps) ────────────
const skeletonWrapStyle = {
  padding: 24,
  background: 'var(--bg-primary, #0b1120)',
  minHeight: '100vh',
};
const skeletonHeaderStyle = {
  height: 32,
  width: '40%',
  borderRadius: 6,
  background: 'var(--skeleton, rgba(255,255,255,0.06))',
  marginBottom: 24,
  animation: 'dsPulse 1.6s ease-in-out infinite',
};
const skeletonGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
  gap: 16,
  marginBottom: 24,
};
const skeletonCardStyle = {
  height: 140,
  borderRadius: 12,
  background: 'var(--skeleton, rgba(255,255,255,0.06))',
  border: '1px solid var(--border, rgba(255,255,255,0.08))',
  animation: 'dsPulse 1.6s ease-in-out infinite',
};
const skeletonBarStyle = {
  height: 200,
  borderRadius: 12,
  background: 'var(--skeleton, rgba(255,255,255,0.06))',
  border: '1px solid var(--border, rgba(255,255,255,0.08))',
  animation: 'dsPulse 1.6s ease-in-out infinite',
};

/* ── Add this keyframes block to your global CSS ────────────────────────────
@keyframes dsPulse {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.45; }
}
*/


// =============================================================================
// STEP 4 (optional):  Wrap the entire <Routes> in an ErrorBoundary
// =============================================================================
//
//   import { KnowledgeExplorerErrorBoundary } from './knowledge-explorer-error';
//
//   <KnowledgeExplorerErrorBoundary>
//     <Routes>…</Routes>
//   </KnowledgeExplorerErrorBoundary>
//
// =============================================================================
