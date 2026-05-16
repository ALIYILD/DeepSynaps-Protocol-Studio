/**
 * Page Object Model — DeepTwinPage (Phase 4 patient intelligence).
 */

import { Page, Locator, expect } from "@playwright/test";

export class DeepTwinPage {
  readonly page: Page;
  readonly header: Locator;
  readonly safetyDisclaimer: Locator;
  readonly reviewBadge: Locator;
  readonly modalityBadge: Locator;

  constructor(page: Page) {
    this.page = page;
    this.header = page.getByRole("heading", { name: /DeepTwin/i });
    // Safety disclaimer uses text selector — the component renders it as plain text
    this.safetyDisclaimer = page.locator("text=decision support only").first();
    this.reviewBadge = page.locator("text=Awaiting Review");
    this.modalityBadge = page.locator("text=/\\d+/18 Modalities/");
  }

  async goto(patientId = "demo-patient-001") {
    await this.page.goto(`/pages-deeptwin/deeptwin?patientId=${patientId}`);
  }

  /** Expect the safety disclaimer is visible somewhere on the page. */
  async expectSafetyDisclaimer() {
    await expect(this.safetyDisclaimer).toBeVisible();
  }

  /** Expect header is visible. */
  async expectHeaderVisible() {
    await expect(this.header).toBeVisible();
  }

  /** Expect no causal certainty language on the page. */
  async expectNoCausalCertainty() {
    const body = await this.page.locator("body").textContent();
    expect(body).not.toContain("caused by");
    expect(body).not.toContain("causes");
    expect(body).not.toContain("definitely");
    expect(body).not.toContain("proven diagnosis");
  }

  /** Expect no autonomous treatment language. */
  async expectNoAutonomousClaims() {
    const body = await this.page.locator("body").textContent();
    expect(body).not.toContain("AI diagnosis");
    expect(body).not.toContain("autonomous treatment");
    expect(body).not.toContain("automated prescribing");
    expect(body).not.toContain("emergency triage");
  }
}
