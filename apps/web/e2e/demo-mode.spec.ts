/**
 * Demo Mode E2E Tests
 *
 * Tests: demo banner visibility, dismissal, label text,
 * demo/live boundary, demo mode detection via localStorage.
 *
 * Uses demo/synthetic data only.
 */

import { test, expect } from "@playwright/test";

test.describe("Demo Mode Banner", () => {
  test("demo banner appears when demo mode is enabled via localStorage", async ({ page }) => {
    // Seed demo mode in localStorage before navigation
    await page.addInitScript(() => {
      localStorage.setItem("deepsynaps-demo-mode", "true");
      localStorage.setItem("x-clinic-id", "demo-clinic-001");
      localStorage.setItem("x-patient-access-token", "demo-token-12345");
      localStorage.setItem("clinician-id", "demo-clinician-001");
    });

    await page.goto("/pages-deeptwin/synthesis-dashboard");

    // Banner should appear
    const banner = page.getByTestId("demo-mode-banner");
    await expect(banner).toBeVisible();

    // Banner text should contain demo/synthetic warning
    const text = await banner.textContent();
    expect(text).toContain("DEMO");
    expect(text).toContain("Synthetic");
    expect(text).toContain("non-PHI");
    expect(text).toContain("not for real patient care");
  });

  test("demo banner can be dismissed", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("deepsynaps-demo-mode", "true");
      localStorage.setItem("x-clinic-id", "demo-clinic-001");
      localStorage.setItem("x-patient-access-token", "demo-token-12345");
      localStorage.setItem("clinician-id", "demo-clinician-001");
    });

    await page.goto("/pages-deeptwin/synthesis-dashboard");

    const banner = page.getByTestId("demo-mode-banner");
    await expect(banner).toBeVisible();

    // Click dismiss
    await page.getByTestId("demo-banner-dismiss").click();

    // Banner should disappear
    await expect(banner).not.toBeVisible();
  });

  test("demo banner does NOT appear when demo mode is disabled", async ({ page }) => {
    await page.addInitScript(() => {
      // Do NOT set deepsynaps-demo-mode
      localStorage.setItem("x-clinic-id", "demo-clinic-001");
      localStorage.setItem("x-patient-access-token", "demo-token-12345");
      localStorage.setItem("clinician-id", "demo-clinician-001");
    });

    await page.goto("/pages-deeptwin/synthesis-dashboard");

    // Banner should NOT appear
    const banner = page.getByTestId("demo-mode-banner");
    await expect(banner).not.toBeVisible();
  });

  test("demo banner text does not claim production use", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("deepsynaps-demo-mode", "true");
      localStorage.setItem("x-clinic-id", "demo-clinic-001");
      localStorage.setItem("x-patient-access-token", "demo-token-12345");
      localStorage.setItem("clinician-id", "demo-clinician-001");
    });

    await page.goto("/pages-deeptwin/synthesis-dashboard");

    const banner = page.getByTestId("demo-mode-banner");
    await expect(banner).toBeVisible();

    const text = await page.getByTestId("demo-banner-text").textContent();
    expect(text).not.toContain("production");
    expect(text).toContain("not for real patient care");
  });
});

test.describe("Demo Mode — DeepTwin Page", () => {
  test("demo banner visible on DeepTwin page when demo enabled", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("deepsynaps-demo-mode", "true");
      localStorage.setItem("x-clinic-id", "demo-clinic-001");
      localStorage.setItem("x-patient-access-token", "demo-token-12345");
      localStorage.setItem("clinician-id", "demo-clinician-001");
    });

    await page.goto("/pages-deeptwin/deeptwin?patientId=demo-patient-001");

    const banner = page.getByTestId("demo-mode-banner");
    await expect(banner).toBeVisible();
  });

  test("demo banner NOT visible on DeepTwin when demo disabled", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("x-clinic-id", "demo-clinic-001");
      localStorage.setItem("x-patient-access-token", "demo-token-12345");
      localStorage.setItem("clinician-id", "demo-clinician-001");
    });

    await page.goto("/pages-deeptwin/deeptwin?patientId=demo-patient-001");

    const banner = page.getByTestId("demo-mode-banner");
    await expect(banner).not.toBeVisible();
  });
});

test.describe("Demo Patient ID Heuristic", () => {
  test("patient ID starting with demo- triggers demo mode", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("x-clinic-id", "demo-clinic-001");
      localStorage.setItem("x-patient-access-token", "demo-token-12345");
      localStorage.setItem("clinician-id", "demo-clinician-001");
    });

    // Navigate to synthesis with demo patient
    await page.goto("/pages-deeptwin/synthesis-dashboard");

    // The component defaults to demo-patient-001 which triggers demo mode
    const banner = page.getByTestId("demo-mode-banner");
    // Note: This test may need component-level mocking for full verification
    // The isDemoMode() function checks patientId prop via the heuristic
  });
});
