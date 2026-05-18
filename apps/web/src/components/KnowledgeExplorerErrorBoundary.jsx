// =============================================================================
// knowledge-explorer-error.jsx
// DeepSynaps Protocol Studio — Error Boundary + Error UI for Knowledge Explorer
// Phase 6/7/8
// =============================================================================

import React, { Component, useState, useCallback } from 'react';

/* ── Design-system tokens ─────────────────────────────────────────────────── */
const DS = {
  bgPrimary:    'var(--bg-primary, #0b1120)',
  bgCard:       'var(--bg-card, #0f172a)',
  border:       'var(--border, rgba(255,255,255,0.08))',
  textPrimary:  'var(--text-primary, #e2e8f0)',
  textSecondary:'var(--text-secondary, #94a3b8)',
  textTertiary: 'var(--text-tertiary, #64748b)',
  teal:         'var(--teal, #00d4bc)',
  rose:         'var(--rose, #f87171)',
  amber:        'var(--amber, #f59e0b)',
  blue:         'var(--blue, #4a9eff)',
  radiusLg:     'var(--radius-lg, 12px)',
  fontDisplay:  'var(--font-display, system-ui, -apple-system, sans-serif)',
};

/* ════════════════════════════════════════════════════════════════════════════
   CLASS-BASED ERROR BOUNDARY
   Catches render-phase errors anywhere inside the Knowledge Explorer tree.
   ════════════════════════════════════════════════════════════════════════════ */

export class KnowledgeExplorerErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    // Log to your error-tracking service (Sentry, LogRocket, etc.)
    console.error('[KnowledgeExplorerErrorBoundary]', error, errorInfo);

    // Optional: report to DeepSynaps backend telemetry
    if (window._reportError) {
      window._reportError({
        source: 'KnowledgeExplorerErrorBoundary',
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
      });
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) this.props.onReset();
  };

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          onReset={this.handleReset}
          title={this.props.title || 'Knowledge Explorer'}
        />
      );
    }
    return this.props.children;
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   FUNCTIONAL ERROR FALLBACK UI
   DeepSynaps-styled error card with retry / home / report actions.
   ════════════════════════════════════════════════════════════════════════════ */

export function ErrorFallback({ error, errorInfo, onReset, title = 'Knowledge Explorer' }) {
  const [copied, setCopied] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const isAuthError = error?.status === 401 || error?.status === 403;
  const isNetworkError = error?.status === 0 || error?.name === 'TypeError';
  const isServerError = error?.status >= 500;

  const errorMessage = isAuthError
    ? 'Your session has expired or you do not have permission to access this knowledge resource.'
    : isNetworkError
    ? 'Unable to reach the knowledge backend. Please check your connection and try again.'
    : isServerError
    ? 'The knowledge service is experiencing issues. Our team has been notified.'
    : error?.message || 'An unexpected error occurred while loading the Knowledge Explorer.';

  const errorIcon = isAuthError ? '🔐' : isNetworkError ? '🌐' : isServerError ? '⚙️' : '⚡';
  const accentColor = isAuthError ? DS.amber : isNetworkError ? DS.blue : isServerError ? DS.rose : DS.rose;

  const copyDetails = useCallback(() => {
    const details = [
      `DeepSynaps Error Report`,
      `Page: ${title}`,
      `Time: ${new Date().toISOString()}`,
      `Message: ${error?.message || 'Unknown'}`,
      `Status: ${error?.status || 'N/A'}`,
      `Endpoint: ${error?.endpoint || 'N/A'}`,
      `Stack: ${error?.stack || 'N/A'}`,
      `Component Stack: ${errorInfo?.componentStack || 'N/A'}`,
    ].join('\n');

    navigator.clipboard?.writeText(details).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [error, errorInfo, title]);

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {/* Icon */}
        <div style={{ ...styles.iconRing, borderColor: accentColor }}>
          <span style={{ fontSize: 32, lineHeight: 1 }}>{errorIcon}</span>
        </div>

        {/* Title */}
        <h2 style={styles.title}>{title}</h2>
        <p style={styles.message}>{errorMessage}</p>

        {/* Actions */}
        <div style={styles.actions}>
          <button
            onClick={onReset}
            style={{ ...styles.btnPrimary, background: accentColor }}
            onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(1.15)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.filter = 'brightness(1)'; }}
          >
            ↺ Retry
          </button>
          <a href="/" style={styles.btnSecondary}>🏠 Go Home</a>
          <button
            onClick={copyDetails}
            style={styles.btnSecondary}
          >
            {copied ? '✓ Copied' : '📋 Copy Details'}
          </button>
        </div>

        {/* Debug toggle */}
        <button
          onClick={() => setShowDetails((s) => !s)}
          style={styles.detailsToggle}
        >
          {showDetails ? '▾ Hide technical details' : '▸ Show technical details'}
        </button>

        {/* Technical details panel */}
        {showDetails && (
          <div style={styles.detailsPanel}>
            <pre style={styles.pre}>
{`Status:    ${error?.status || 'N/A'}
Message:   ${error?.message || 'N/A'}
Name:      ${error?.name || 'N/A'}
Endpoint:  ${error?.endpoint || 'N/A'}
Timestamp: ${error?.timestamp || new Date().toISOString()}

Stack:
${error?.stack || 'No stack trace available'}

Component Stack:
${errorInfo?.componentStack || 'N/A'}`}
            </pre>
          </div>
        )}

        {/* Subtle footer */}
        <p style={styles.footer}>
          If this keeps happening, contact support with the copied details above.
        </p>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   API ERROR TOAST / BANNER (functional, non-blocking)
   Use this for recoverable errors (search failed, single adapter down, etc.)
   ════════════════════════════════════════════════════════════════════════════ */

export function ApiErrorBanner({ error, onDismiss, onRetry }) {
  if (!error) return null;

  const isAuth = error.status === 401 || error.status === 403;
  const isNetwork = error.status === 0;
  const isServer = error.status >= 500;

  const bg = isAuth ? 'rgba(245,158,11,0.10)' : isNetwork ? 'rgba(74,158,255,0.10)' : 'rgba(248,113,113,0.10)';
  const border = isAuth ? 'rgba(245,158,11,0.25)' : isNetwork ? 'rgba(74,158,255,0.25)' : 'rgba(248,113,113,0.25)';
  const icon = isAuth ? '🔐' : isNetwork ? '🌐' : '⚡';

  return (
    <div style={{ ...styles.banner, background: bg, borderColor: border }} role="alert">
      <span style={{ fontSize: 16 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: DS.textPrimary, marginBottom: 2 }}>
          {isAuth ? 'Authentication Required' : isNetwork ? 'Connection Issue' : 'Service Error'}
        </div>
        <div style={{ fontSize: 12, color: DS.textSecondary, lineHeight: 1.4 }}>
          {error.message || 'Something went wrong.'}
        </div>
      </div>
      {onRetry && (
        <button onClick={onRetry} style={styles.bannerRetryBtn}>
          Retry
        </button>
      )}
      {onDismiss && (
        <button onClick={onDismiss} style={styles.bannerDismissBtn} aria-label="Dismiss error">
          ×
        </button>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   SECTION-LEVEL ERROR CARD (for partial failures inside a larger page)
   ════════════════════════════════════════════════════════════════════════════ */

export function SectionError({ title, message, onRetry, compact = false }) {
  return (
    <div style={compact ? styles.sectionCompact : styles.section}>
      <div style={{ fontSize: compact ? 20 : 28, marginBottom: compact ? 6 : 10 }}>⚡</div>
      <div style={{ fontWeight: 600, fontSize: compact ? 13 : 15, color: DS.textPrimary, marginBottom: 4 }}>
        {title || 'Failed to load'}
      </div>
      <div style={{ fontSize: compact ? 12 : 13, color: DS.textSecondary, marginBottom: compact ? 8 : 14 }}>
        {message || 'The data could not be retrieved.'}
      </div>
      {onRetry && (
        <button onClick={onRetry} style={styles.sectionRetryBtn}>
          ↺ Retry
        </button>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   HOOK: useErrorHandler
   Wraps an async function and exposes { error, clearError, handleError }.
   ════════════════════════════════════════════════════════════════════════════ */

export function useErrorHandler() {
  const [error, setError] = useState(null);

  const clearError = useCallback(() => setError(null), []);

  const handleError = useCallback((err) => {
    console.error('[useErrorHandler]', err);
    setError(err);
  }, []);

  const wrapAsync = useCallback((fn) => async (...args) => {
    clearError();
    try {
      return await fn(...args);
    } catch (err) {
      handleError(err);
      throw err;
    }
  }, [clearError, handleError]);

  return { error, clearError, handleError, wrapAsync };
}

/* ════════════════════════════════════════════════════════════════════════════
   STYLES
   ════════════════════════════════════════════════════════════════════════════ */

const styles = {
  page: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    padding: 24,
    background: DS.bgPrimary,
    fontFamily: DS.fontDisplay,
    color: DS.textPrimary,
  },
  card: {
    maxWidth: 560,
    width: '100%',
    background: DS.bgCard,
    border: `1px solid ${DS.border}`,
    borderRadius: DS.radiusLg,
    padding: '36px 32px',
    textAlign: 'center',
    boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
  },
  iconRing: {
    width: 72,
    height: 72,
    borderRadius: '50%',
    border: `2px solid ${DS.rose}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 20px',
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    color: DS.textPrimary,
    margin: '0 0 10px',
    fontFamily: DS.fontDisplay,
  },
  message: {
    fontSize: 14,
    lineHeight: 1.6,
    color: DS.textSecondary,
    margin: '0 0 24px',
  },
  actions: {
    display: 'flex',
    gap: 10,
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginBottom: 20,
  },
  btnPrimary: {
    padding: '8px 18px',
    borderRadius: 8,
    border: 'none',
    fontSize: 13,
    fontWeight: 600,
    color: '#000',
    cursor: 'pointer',
    transition: 'filter 0.15s ease',
  },
  btnSecondary: {
    padding: '8px 18px',
    borderRadius: 8,
    border: `1px solid ${DS.border}`,
    background: 'transparent',
    fontSize: 13,
    fontWeight: 600,
    color: DS.textSecondary,
    cursor: 'pointer',
    textDecoration: 'none',
    transition: 'background 0.15s ease, color 0.15s ease',
  },
  detailsToggle: {
    background: 'none',
    border: 'none',
    color: DS.textTertiary,
    fontSize: 12,
    cursor: 'pointer',
    marginBottom: 12,
    textDecoration: 'underline',
    textUnderlineOffset: 3,
  },
  detailsPanel: {
    textAlign: 'left',
    background: 'rgba(0,0,0,0.25)',
    border: `1px solid ${DS.border}`,
    borderRadius: 8,
    padding: 14,
    marginBottom: 16,
    maxHeight: 240,
    overflowY: 'auto',
  },
  pre: {
    margin: 0,
    fontSize: 11,
    lineHeight: 1.5,
    color: DS.textTertiary,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  footer: {
    fontSize: 11,
    color: DS.textTertiary,
    margin: '16px 0 0',
  },
  /* ── Banner ─────────────────────────────────────────────────────────────── */
  banner: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 14px',
    borderRadius: 10,
    border: `1px solid ${DS.border}`,
    marginBottom: 16,
  },
  bannerRetryBtn: {
    padding: '5px 12px',
    borderRadius: 6,
    border: 'none',
    background: DS.teal,
    color: '#000',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    flexShrink: 0,
  },
  bannerDismissBtn: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    border: 'none',
    background: 'transparent',
    color: DS.textTertiary,
    fontSize: 18,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  /* ── Section error ──────────────────────────────────────────────────────── */
  section: {
    padding: 24,
    textAlign: 'center',
    border: `1px solid ${DS.border}`,
    borderRadius: DS.radiusLg,
    background: DS.bgCard,
    color: DS.textSecondary,
  },
  sectionCompact: {
    padding: 14,
    textAlign: 'center',
    border: `1px solid ${DS.border}`,
    borderRadius: 8,
    background: DS.bgCard,
    color: DS.textSecondary,
  },
  sectionRetryBtn: {
    padding: '6px 14px',
    borderRadius: 6,
    border: 'none',
    background: DS.teal,
    color: '#000',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: 4,
  },
};

/* ════════════════════════════════════════════════════════════════════════════
   EXPORTS
   ════════════════════════════════════════════════════════════════════════════ */
export default KnowledgeExplorerErrorBoundary;
