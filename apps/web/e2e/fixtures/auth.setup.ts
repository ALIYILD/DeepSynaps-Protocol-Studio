/**
 * Auth Setup — Seeds localStorage with demo credentials for E2E tests.
 *
 * Creates an authenticated session state file that other tests can reuse.
 * Uses synthetic/demo credentials only — never real PHI.
 */

import { test as setup, expect } from "@playwright/test";

const AUTH_FILE = "e2e/.auth/clinician-session.json";

setup("authenticate clinician demo session", async ({ page }) => {
  // Seed localStorage with demo credentials
  await page.evaluate(() => {
    localStorage.setItem("x-clinic-id", "demo-clinic-001");
    localStorage.setItem("x-patient-access-token", "demo-token-12345");
    localStorage.setItem("clinician-id", "demo-clinician-001");
    localStorage.setItem("clinician-role", "clinician");
  });

  // Verify storage was set
  const clinicId = await page.evaluate(() => localStorage.getItem("x-clinic-id"));
  expect(clinicId).toBe("demo-clinic-001");

  // Save storage state for reuse
  await page.context().storageState({ path: AUTH_FILE });
});

setup("authenticate admin demo session", async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem("x-clinic-id", "demo-clinic-001");
    localStorage.setItem("x-patient-access-token", "demo-token-admin");
    localStorage.setItem("clinician-id", "demo-admin-001");
    localStorage.setItem("clinician-role", "clinic_admin");
  });

  await page.context().storageState({ path: "e2e/.auth/admin-session.json" });
});
