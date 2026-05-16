/**
 * DemoModeBanner — Global synthetic/non-PHI demo banner.
 *
 * Visible on every authenticated app page when demo mode is enabled.
 * Does NOT block workflow. Fixed top bar, dismissible for the session.
 *
 * Copy: "DEMO BUILD — Synthetic/non-PHI data only.
 *        Clinical decision support preview; not for real patient care."
 *
 * Props: none — reads from isDemoMode() and getDemoModeLabel().
 */

import React, { useState, useEffect, useCallback } from "react";
import { isDemoMode, getDemoModeLabel, shouldShowNonPhiBanner } from "../contracts";

// ── Styles (inline for zero-dependency portability) ───────────────────────────

const bannerStyle = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  zIndex: 9999,
  backgroundColor: "#DC2626", // red-600 — high contrast, urgent
  color: "#FFFFFF",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontSize: "14px",
  fontWeight: 600,
  lineHeight: "1.4",
  padding: "10px 16px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "12px",
  boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
  minHeight: "44px",
  boxSizing: "border-box",
};

const bannerMobileStyle = {
  ...bannerStyle,
  flexWrap: "wrap",
  fontSize: "12px",
  padding: "8px 12px",
  gap: "8px",
};

const textStyle = {
  textAlign: "center",
  flex: "1 1 auto",
  overflowWrap: "break-word",
  wordBreak: "break-word",
};

const dismissButtonStyle = {
  background: "rgba(255,255,255,0.15)",
  border: "1px solid rgba(255,255,255,0.4)",
  borderRadius: "4px",
  color: "#FFFFFF",
  cursor: "pointer",
  fontSize: "12px",
  fontWeight: 500,
  padding: "4px 10px",
  whiteSpace: "nowrap",
  lineHeight: "1.4",
};

// ── Component ────────────────────────────────────────────────────────────────

export default function DemoModeBanner() {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Check demo mode on mount
    const demo = isDemoMode();
    const showBanner = shouldShowNonPhiBanner();
    setVisible(demo && showBanner);

    // Check if previously dismissed this session
    try {
      if (sessionStorage.getItem("demo-banner-dismissed") === "1") {
        setDismissed(true);
      }
    } catch {
      // sessionStorage may be unavailable
    }

    // Responsive check
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    try {
      sessionStorage.setItem("demo-banner-dismissed", "1");
    } catch {
      // sessionStorage may be unavailable
    }
  }, []);

  if (!visible || dismissed) return null;

  const label = getDemoModeLabel();
  const currentStyle = isMobile ? bannerMobileStyle : bannerStyle;

  return (
    <div
      role="banner"
      aria-label="Demo mode warning"
      style={currentStyle}
      data-testid="demo-mode-banner"
    >
      <span style={textStyle} data-testid="demo-banner-text">
        {label} — Synthetic/non-PHI data only. Clinical decision support
        preview; not for real patient care.
      </span>
      <button
        type="button"
        onClick={handleDismiss}
        style={dismissButtonStyle}
        aria-label="Dismiss demo mode banner"
        data-testid="demo-banner-dismiss"
      >
        Dismiss
      </button>
    </div>
  );
}

// ── CSS-in-JS for body padding (banner is fixed) ─────────────────────────────
// Injects a small style tag so page content is not hidden behind the banner.
// Only active when banner is visible.

export function DemoModeBannerStylesheet() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const demo = isDemoMode();
    const showBanner = shouldShowNonPhiBanner();
    setActive(demo && showBanner);
  }, []);

  if (!active) return null;

  return (
    <style>{`
      @media (min-width: 640px) {
        body.demo-mode-banner-active { padding-top: 44px; }
      }
      @media (max-width: 639px) {
        body.demo-mode-banner-active { padding-top: 56px; }
      }
    `}</style>
  );
}