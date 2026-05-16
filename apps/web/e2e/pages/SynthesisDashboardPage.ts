/**
 * Page Object Model — SynthesisDashboard (DeepSynaps Protocol Studio).
 *
 * Encapsulates selectors and actions for the clinician dashboard.
 * Uses data-testid and accessible selectors only — no brittle CSS.
 */

import { Page, Locator, expect } from "@playwright/test";

export class SynthesisDashboardPage {
  readonly page: Page;
  readonly safetyBanner: Locator;
  readonly tabs: Record<string, Locator>;
  readonly panels: Record<string, Locator>;
  readonly loadingIndicator: Locator;
  readonly errorMessage: Locator;
  readonly runSynthesisButton: Locator;
  readonly evidenceSummary: Locator;
  readonly synthesisDisclaimer: Locator;

  constructor(page: Page) {
    this.page = page;
    this.safetyBanner = page.getByTestId("safety-banner");
    this.tabs = {
      timeline: page.getByTestId("tab-timeline"),
      correlations: page.getByTestId("tab-correlations"),
      confounders: page.getByTestId("tab-confounders"),
      quality: page.getByTestId("tab-quality"),
      synthesis: page.getByTestId("tab-synthesis"),
    };
    this.panels = {
      timeline: page.getByTestId("panel-timeline"),
      correlations: page.getByTestId("panel-correlations"),
      confounders: page.getByTestId("panel-confounders"),
      quality: page.getByTestId("panel-quality"),
      synthesis: page.getByTestId("panel-synthesis"),
    };
    this.loadingIndicator = page.getByTestId("loading-indicator");
    this.errorMessage = page.getByTestId("error-message");
    this.runSynthesisButton = page.getByTestId("run-synthesis-btn");
    this.evidenceSummary = page.getByTestId("evidence-summary");
    this.synthesisDisclaimer = page.getByTestId("synthesis-disclaimer");
  }

  /** Navigate to the SynthesisDashboard page. */
  async goto() {
    await this.page.goto("/pages-deeptwin/synthesis-dashboard");
  }

  /** Wait for the safety banner to be visible. */
  async expectSafetyBanner() {
    await expect(this.safetyBanner).toBeVisible();
  }

  /** Verify safety banner contains required disclaimer text. */
  async expectSafetyDisclaimerText() {
    const text = await this.safetyBanner.textContent();
    expect(text).toContain("decision support only");
    expect(text).toContain("clinician review");
    expect(text).not.toContain("diagnosis");
  }

  /** Click a tab by ID. */
  async clickTab(tabId: string) {
    await this.tabs[tabId].click();
  }

  /** Expect a panel to be visible. */
  async expectPanelVisible(panelId: string) {
    await expect(this.panels[panelId]).toBeVisible();
  }

  /** Expect all 5 tabs to be visible. */
  async expectAllTabsVisible() {
    for (const tab of Object.values(this.tabs)) {
      await expect(tab).toBeVisible();
    }
  }

  /** Wait for loading to complete. */
  async waitForLoadingComplete(timeout = 10000) {
    await this.loadingIndicator.waitFor({ state: "hidden", timeout });
  }

  /** Click Run Synthesis button. */
  async runSynthesis() {
    await this.runSynthesisButton.click();
  }

  /** Expect synthesis disclaimer to contain safety text. */
  async expectSynthesisDisclaimer() {
    const text = await this.synthesisDisclaimer.textContent();
    expect(text).toContain("Decision support only");
  }
}
