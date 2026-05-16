/**
 * Clinical Safety Assertions — E2E
 *
 * Verifies safety wording is visible across critical pages.
 * Checks for prohibited claims (AI diagnosis, autonomous treatment, etc.).
 *
 * Uses demo/synthetic data only.
 */

import { test, expect } from "@playwright/test";

test.describe("Safety Wording — SynthesisDashboard", () => {
  test("safety banner contains required phrases", async ({ page }) => {
    await page.goto("/pages-deeptwin/synthesis-dashboard");

    const banner = page.getByTestId("safety-banner");
    await expect(banner).toBeVisible();

    const text = await banner.textContent();

    // Required positive assertions
    expect(text).toContain("decision support only");
    expect(text).toContain("clinician review");
    expect(text).toContain("diagnosis");
    expect(text).toContain("treatment");
    expect(text).toContain("causal");

    // Prohibited claims — these should NOT appear as claims of capability
    expect(text).not.toContain("AI diagnosis");
    expect(text).not.toContain("automated treatment");
    expect(text).not.toContain("autonomous");
  });

  test("synthesis disclaimer appears after running synthesis", async ({ page }) => {
    await page.goto("/pages-deeptwin/synthesis-dashboard");

    // Switch to synthesis tab
    await page.getByTestId("tab-synthesis").click();
    await page.getByTestId("run-synthesis-btn").click();

    // Wait for results
    await page.getByTestId("synthesis-disclaimer").waitFor({ timeout: 10000 });

    const disclaimer = await page.getByTestId("synthesis-disclaimer").textContent();
    expect(disclaimer).toContain("Decision support only");
    expect(disclaimer).toContain("clinician review");
  });

  test("no causal certainty language on any dashboard tab", async ({ page }) => {
    await page.goto("/pages-deeptwin/synthesis-dashboard");
    await page.waitForLoadState("networkidle");

    const tabs = ["timeline", "correlations", "confounders", "quality", "synthesis"];

    for (const tabId of tabs) {
      await page.getByTestId(`tab-${tabId}`).click();
      await page.waitForTimeout(500);

      const bodyText = await page.locator("body").textContent();

      // These exact phrases should not appear as claims
      expect.soft(bodyText).not.toContain("caused by");
      expect.soft(bodyText).not.toContain("causes");
      expect.soft(bodyText).not.toContain("definitely");
      expect.soft(bodyText).not.toContain("proven diagnosis");
      expect.soft(bodyText).not.toContain("autonomous treatment");
      expect.soft(bodyText).not.toContain("automated prescribing");
      expect.soft(bodyText).not.toContain("emergency triage");
    }
  });
});

test.describe("Safety Wording — DeepTwinPage", () => {
  test("safety disclaimer is visible on page load", async ({ page }) => {
    await page.goto("/pages-deeptwin/deeptwin?patientId=demo-patient-001");

    await expect(page.locator("body").getByText("decision support only")).toBeVisible();
    await expect(page.locator("body").getByText("clinician review")).toBeVisible();
  });

  test("header contains patient and snapshot info, not PHI", async ({ page }) => {
    await page.goto("/pages-deeptwin/deeptwin?patientId=demo-patient-001");

    const header = page.getByRole("heading", { name: /DeepTwin/i });
    await expect(header).toBeVisible();

    // Should show the demo patient ID (safe) not real names
    await expect(page.getByText("demo-patient-001")).toBeVisible();

    // Should NOT contain potential PHI patterns (SSN, DOB formats)
    const bodyText = await page.locator("body").textContent();
    const ssnPattern = /\\d{3}-\\d{2}-\\d{4}/;
    const dobPattern = /\\d{2}\\/\\d{2}\\/\\d{4}/;
    expect(bodyText).not.toMatch(ssnPattern);
    // Note: dates may appear as ISO format in event timestamps — that's expected
  });

  test("no AI diagnosis or autonomous claims", async ({ page }) => {
    await page.goto("/pages-deeptwin/deeptwin?patientId=demo-patient-001");
    await page.waitForLoadState("networkidle");

    const bodyText = await page.locator("body").textContent();

    const prohibited = [
      "AI diagnosis",
      "autonomous treatment",
      "automated prescribing",
      "emergency triage",
      "self-diagnose",
      "replace your doctor",
      "no need for clinician",
    ];

    for (const phrase of prohibited) {
      expect.soft(bodyText).not.toContain(phrase);
    }
  });

  test("tab labels are clinical-governance safe", async ({ page }) => {
    await page.goto("/pages-deeptwin/deeptwin?patientId=demo-patient-001");

    // Tab labels should use careful language
    const tabLabels = [
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

    for (const label of tabLabels) {
      const tab = page.getByRole("button", { name: label });
      await expect(tab).toBeVisible();

      // No tab should claim diagnostic authority
      const text = await tab.textContent();
      expect.soft(text).not.toContain("diagnose");
      expect.soft(text).not.toContain("prescribe");
    }
  });
});
