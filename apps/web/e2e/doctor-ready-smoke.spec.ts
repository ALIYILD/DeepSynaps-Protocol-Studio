/**
 * Doctor-Ready Smoke Tests — Critical clinician workflow validation.
 *
 * Tests: app load, safety banner, navigation tabs, demo banner,
 * loading states, error handling.
 *
 * Uses demo/synthetic data only.
 */

import { test, expect } from "@playwright/test";
import { SynthesisDashboardPage } from "./pages/SynthesisDashboardPage";

// Use clinician auth session
// test.use({ storageState: "e2e/.auth/clinician-session.json" });

// ── SynthesisDashboard ────────────────────────────────────────────────────────

test.describe("SynthesisDashboard Smoke", () => {
  test("page loads and renders safety banner", async ({ page }) => {
    const dashboard = new SynthesisDashboardPage(page);
    await dashboard.goto();

    await dashboard.expectSafetyBanner();
    await dashboard.expectSafetyDisclaimerText();
  });

  test("all 5 tabs are visible and clickable", async ({ page }) => {
    const dashboard = new SynthesisDashboardPage(page);
    await dashboard.goto();

    await dashboard.expectAllTabsVisible();

    // Click through each tab
    for (const tabId of ["timeline", "correlations", "confounders", "quality", "synthesis"]) {
      await dashboard.clickTab(tabId);
      await dashboard.expectPanelVisible(tabId);
    }
  });

  test("timeline tab loads by default", async ({ page }) => {
    const dashboard = new SynthesisDashboardPage(page);
    await dashboard.goto();

    await dashboard.expectPanelVisible("timeline");
  });

  test("page does not crash or show console errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    const consoleWarnings: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
      if (msg.type() === "warning") consoleWarnings.push(msg.text());
    });

    page.on("pageerror", (error) => {
      consoleErrors.push(error.message);
    });

    const dashboard = new SynthesisDashboardPage(page);
    await dashboard.goto();

    // Wait a moment for any async errors
    await page.waitForTimeout(2000);

    expect(consoleErrors).toHaveLength(0);
    // Warnings are acceptable (e.g., React strict mode)
  });

  test("header shows app title and patient info", async ({ page }) => {
    const dashboard = new SynthesisDashboardPage(page);
    await dashboard.goto();

    await expect(page.getByText("DeepSynaps Protocol Studio")).toBeVisible();
    await expect(page.getByText("demo-patient-001")).toBeVisible();
  });
});

// ── DeepTwin Page ─────────────────────────────────────────────────────────────

test.describe("DeepTwinPage Smoke", () => {
  test("page loads with safety disclaimer", async ({ page }) => {
    await page.goto("/pages-deeptwin/deeptwin?patientId=demo-patient-001");

    await expect(
      page.locator("body").getByText("decision support only")
    ).toBeVisible();
  });

  test("page loads with DeepTwin header", async ({ page }) => {
    await page.goto("/pages-deeptwin/deeptwin?patientId=demo-patient-001");

    await expect(page.getByRole("heading", { name: /DeepTwin/i })).toBeVisible();
  });

  test("tab navigation sections are visible", async ({ page }) => {
    await page.goto("/pages-deeptwin/deeptwin?patientId=demo-patient-001");

    const sections = [
      "Overview",
      "Modalities",
      "Correlations",
      "Confounders",
      "Hypotheses",
      "Evidence",
      "Clinician Review",
      "Export / Handoff",
      "Forecast",
    ];

    for (const section of sections) {
      await expect(page.getByRole("button", { name: section })).toBeVisible();
    }
  });

  test("page shows review status and modality count", async ({ page }) => {
    await page.goto("/pages-deeptwin/deeptwin?patientId=demo-patient-001");

    await expect(page.locator("body").getByText(/Awaiting Review|Reviewed/)).toBeVisible();
    await expect(page.locator("body").getByText(/\\d+\\/18 Modalities/)).toBeVisible();
  });
});

// ── Mobile Responsiveness ─────────────────────────────────────────────────────

test.describe("Mobile Responsiveness", () => {
  test.use({ viewport: { width: 375, height: 812 } }); // iPhone

  test("synthesis dashboard renders on mobile", async ({ page }) => {
    const dashboard = new SynthesisDashboardPage(page);
    await dashboard.goto();

    await dashboard.expectSafetyBanner();
    await dashboard.expectAllTabsVisible();
  });

  test("DeepTwin renders on mobile", async ({ page }) => {
    await page.goto("/pages-deeptwin/deeptwin?patientId=demo-patient-001");

    await expect(page.getByRole("heading", { name: /DeepTwin/i })).toBeVisible();
  });
});
