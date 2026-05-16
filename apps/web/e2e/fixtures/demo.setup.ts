/**
 * Demo Mode Setup — Enables demo mode for E2E tests.
 *
 * Sets session flags so the demo banner and demo data are active.
 * Does NOT interfere with production — this is test-only state.
 */

import { test as setup, expect } from "@playwright/test";

const DEMO_AUTH_FILE = "e2e/.auth/demo-session.json";

setup("enable demo mode session", async ({ page }) => {
  // Seed localStorage with demo credentials + demo mode
  await page.evaluate(() => {
    localStorage.setItem("x-clinic-id", "demo-clinic-001");
    localStorage.setItem("x-patient-access-token", "demo-token-12345");
    localStorage.setItem("clinician-id", "demo-clinician-001");
    localStorage.setItem("clinician-role", "clinician");
    // Enable demo mode via localStorage flag
    localStorage.setItem("deepsynaps-demo-mode", "true");
  });

  // Verify demo mode is active
  const demoMode = await page.evaluate(() =>
    localStorage.getItem("deepsynaps-demo-mode")
  );
  expect(demoMode).toBe("true");

  await page.context().storageState({ path: DEMO_AUTH_FILE });
});
