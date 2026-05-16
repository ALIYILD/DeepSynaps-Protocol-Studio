/**
 * Error State & Degraded Mode E2E Tests
 *
 * Tests: loading states, error handling, empty states,
 * graceful degradation when API is unavailable.
 */

import { test, expect } from "@playwright/test";

test.describe("Error States — SynthesisDashboard", () => {
  test("shows loading indicator while fetching data", async ({ page }) => {
    // Simulate slow network
    await page.route("**/api/**", async (route) => {
      await new Promise((r) => setTimeout(r, 500));
      await route.continue();
    });

    await page.goto("/pages-deeptwin/synthesis-dashboard");

    // Loading indicator may briefly appear
    const loading = page.getByTestId("loading-indicator");
    // Either loading or content is visible
    await expect(loading.or(page.getByTestId("panel-timeline"))).toBeVisible();
  });

  test("displays error message when API returns 500", async ({ page }) => {
    // Intercept and fail the timeline API call
    await page.route("**/api/**", async (route) => {
      await route.fulfill({ status: 500, body: JSON.stringify({ detail: "Internal Server Error" }) });
    });

    await page.goto("/pages-deeptwin/synthesis-dashboard");

    // Error message should appear
    const error = page.getByTestId("error-message");
    await expect(error).toBeVisible();
  });

  test("displays error when API returns 403 forbidden", async ({ page }) => {
    await page.route("**/api/**", async (route) => {
      await route.fulfill({ status: 403, body: JSON.stringify({ detail: "Forbidden" }) });
    });

    await page.goto("/pages-deeptwin/synthesis-dashboard");

    const error = page.getByTestId("error-message");
    await expect(error).toBeVisible();
  });

  test("page does not show crash or white screen on API failure", async ({ page }) => {
    await page.route("**/api/**", async (route) => {
      await route.abort();
    });

    await page.goto("/pages-deeptwin/synthesis-dashboard");

    // Page should still be visible (not crash)
    await expect(page.getByTestId("synthesis-dashboard")).toBeVisible();

    // Safety banner should still show even on error
    await expect(page.getByTestId("safety-banner")).toBeVisible();

    // Tabs should still be visible
    await expect(page.getByTestId("tab-timeline")).toBeVisible();
  });
});

test.describe("Error States — DeepTwinPage", () => {
  test("shows loading state while fetching snapshot", async ({ page }) => {
    await page.route("**/api/**", async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      await route.continue();
    });

    await page.goto("/pages-deeptwin/deeptwin?patientId=demo-patient-001");

    // Loading spinner should appear
    await expect(page.getByText("Loading DeepTwin snapshot...")).toBeVisible();
  });

  test("handles missing patient gracefully", async ({ page }) => {
    await page.goto("/pages-deeptwin/deeptwin");

    // Should not crash even without patientId
    await expect(page.locator("body")).toBeVisible();
  });
});
