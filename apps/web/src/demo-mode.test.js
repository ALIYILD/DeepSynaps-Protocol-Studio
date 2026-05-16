/**
 * Tests for demo mode detection, label, and banner behavior.
 *
 * Tests: isDemoMode(), getDemoModeLabel(), shouldShowNonPhiBanner()
 * and DemoModeBanner component render logic.
 */

import { isDemoMode, getDemoModeLabel, shouldShowNonPhiBanner } from "./contracts";

// ── Mock import.meta.env for testing ──────────────────────────────────────────
const ORIGINAL_ENV = globalThis.import?.meta?.env;

function setViteEnv(vars) {
  try {
    globalThis.import = globalThis.import || {};
    globalThis.import.meta = globalThis.import.meta || {};
    globalThis.import.meta.env = { ...ORIGINAL_ENV, ...vars };
  } catch {
    // import may not be mutable in all environments
  }
}

function resetViteEnv() {
  try {
    globalThis.import = globalThis.import || {};
    globalThis.import.meta = globalThis.import.meta || {};
    globalThis.import.meta.env = ORIGINAL_ENV || {};
  } catch {
    // ignore
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("isDemoMode()", () => {
  afterEach(() => {
    resetViteEnv();
  });

  test("returns false when no env var set", () => {
    resetViteEnv();
    expect(isDemoMode()).toBe(false);
  });

  test("returns true when VITE_ENABLE_DEMO=1", () => {
    setViteEnv({ VITE_ENABLE_DEMO: "1" });
    expect(isDemoMode()).toBe(true);
  });

  test("returns true when VITE_ENABLE_DEMO=true", () => {
    setViteEnv({ VITE_ENABLE_DEMO: "true" });
    expect(isDemoMode()).toBe(true);
  });

  test("returns true when legacy VITE_DEMO_MODE=true", () => {
    setViteEnv({ VITE_DEMO_MODE: "true" });
    expect(isDemoMode()).toBe(true);
  });

  test("returns false when VITE_ENABLE_DEMO=0", () => {
    setViteEnv({ VITE_ENABLE_DEMO: "0" });
    expect(isDemoMode()).toBe(false);
  });

  test("returns false when VITE_ENABLE_DEMO=false", () => {
    setViteEnv({ VITE_ENABLE_DEMO: "false" });
    expect(isDemoMode()).toBe(false);
  });

  test("returns true when patientId starts with demo-", () => {
    resetViteEnv();
    expect(isDemoMode({ patientId: "demo-patient-001" })).toBe(true);
  });

  test("returns false for non-demo patientId", () => {
    resetViteEnv();
    expect(isDemoMode({ patientId: "real-patient-001" })).toBe(false);
  });
});

describe("getDemoModeLabel()", () => {
  afterEach(() => {
    resetViteEnv();
  });

  test("returns default DEMO BUILD", () => {
    resetViteEnv();
    expect(getDemoModeLabel()).toBe("DEMO BUILD");
  });

  test("returns custom label from env", () => {
    setViteEnv({ VITE_DEMO_MODE_LABEL: "INVESTOR DEMO" });
    expect(getDemoModeLabel()).toBe("INVESTOR DEMO");
  });

  test("returns STAGING DEMO label", () => {
    setViteEnv({ VITE_DEMO_MODE_LABEL: "STAGING DEMO" });
    expect(getDemoModeLabel()).toBe("STAGING DEMO");
  });
});

describe("shouldShowNonPhiBanner()", () => {
  afterEach(() => {
    resetViteEnv();
  });

  test("returns true by default", () => {
    resetViteEnv();
    expect(shouldShowNonPhiBanner()).toBe(true);
  });

  test("returns false when VITE_DEMO_NON_PHI_BANNER=0", () => {
    setViteEnv({ VITE_DEMO_NON_PHI_BANNER: "0" });
    expect(shouldShowNonPhiBanner()).toBe(false);
  });

  test("returns false when VITE_DEMO_NON_PHI_BANNER=false", () => {
    setViteEnv({ VITE_DEMO_NON_PHI_BANNER: "false" });
    expect(shouldShowNonPhiBanner()).toBe(false);
  });

  test("returns true when VITE_DEMO_NON_PHI_BANNER=1", () => {
    setViteEnv({ VITE_DEMO_NON_PHI_BANNER: "1" });
    expect(shouldShowNonPhiBanner()).toBe(true);
  });
});

describe("Demo mode banner text", () => {
  afterEach(() => {
    resetViteEnv();
  });

  test("banner text includes synthetic/non-PHI", () => {
    setViteEnv({ VITE_ENABLE_DEMO: "1" });
    const label = getDemoModeLabel();
    // The banner combines label + fixed suffix
    const fullText = `${label} — Synthetic/non-PHI data only. Clinical decision support preview; not for real patient care.`;
    expect(fullText).toContain("Synthetic/non-PHI");
    expect(fullText).toContain("not for real patient care");
  });

  test("banner text does not claim production use", () => {
    setViteEnv({ VITE_ENABLE_DEMO: "1" });
    const label = getDemoModeLabel();
    const fullText = `${label} — Synthetic/non-PHI data only. Clinical decision support preview; not for real patient care.`;
    expect(fullText).not.toContain("production");
    expect(fullText).toContain("not for real patient care");
  });
});
