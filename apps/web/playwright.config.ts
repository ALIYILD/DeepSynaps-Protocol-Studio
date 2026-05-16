/**
 * Playwright E2E configuration for DeepSynaps Protocol Studio.
 *
 * Tests run against the Vite dev server or preview build.
 * Uses demo/synthetic data only — never real PHI.
 */

import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.PLAYWRIGHT_PORT || "4173";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e-results",

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 1 : 0,

  /* Opt out of parallel tests on CI for stability */
  workers: process.env.CI ? 1 : undefined,

  /* Reporter */
  reporter: process.env.CI
    ? [["dot"], ["html", { outputFolder: "e2e-report" }]]
    : [["list"], ["html", { outputFolder: "e2e-report" }]],

  /* Shared settings for all projects */
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    /* Default viewport */
    viewport: { width: 1280, height: 720 },
  },

  /* Configure projects for major browsers */
  projects: [
    // Setup: authenticate and store session state
    { name: "setup", testMatch: "**/*.setup.ts", teardown: undefined },

    // Desktop Chromium
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },

    // Desktop Firefox
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
      dependencies: ["setup"],
    },

    // Mobile Safari (iPhone)
    {
      name: "mobile-safari",
      use: { ...devices["iPhone 14"] },
      dependencies: ["setup"],
    },

    // Mobile Chrome (Pixel)
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 7"] },
      dependencies: ["setup"],
    },
  ],

  /* Run local dev server before starting the tests */
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined // External server
    : {
        command: "npm run preview",
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
        stdout: "pipe",
        stderr: "pipe",
      },
});
