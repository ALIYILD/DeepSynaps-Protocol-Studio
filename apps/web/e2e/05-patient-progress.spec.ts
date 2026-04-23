import { test, expect } from '@playwright/test';

test.describe('Patient Progress Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('ds_access_token', 'mock-patient-token');
      localStorage.setItem('ds_onboarding_done', '1');
    });

    await page.route('**/api/v1/auth/me', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'p1', email: 'patient@test.com', display_name: 'Alice Smith', role: 'patient', patient_id: 'pat-1' }),
      });
    });

    // Catch-all first so specific overrides below take precedence
    await page.route('**/api/v1/patient-portal/**', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    await page.route('**/api/v1/patient-portal/outcomes', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'o1', course_id: 'c1', template_id: 'phq9', template_title: 'PHQ-9', score_numeric: 18, measurement_point: 'Baseline', administered_at: '2026-01-20T10:00:00Z' },
          { id: 'o2', course_id: 'c1', template_id: 'phq9', template_title: 'PHQ-9', score_numeric: 14, measurement_point: 'Week 2', administered_at: '2026-02-03T10:00:00Z' },
          { id: 'o3', course_id: 'c1', template_id: 'phq9', template_title: 'PHQ-9', score_numeric: 10, measurement_point: 'Week 4', administered_at: '2026-02-17T10:00:00Z' },
        ]),
      });
    });
  });

  test('progress page renders with live data, form and actions', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(800);

    // Force patient mode and boot patient shell directly
    await page.evaluate(() => {
      const win = window as any;
      if (win._previewPatientPortal) win._previewPatientPortal();
      else if (win._bootPatient) win._bootPatient();
    });
    await page.waitForTimeout(800);

    // Navigate to progress page
    await page.evaluate(() => (window as any)._navPatient?.('pt-outcomes'));
    await page.waitForTimeout(1500);

    const content = page.locator('#patient-content');
    // patient-content may be opacity:0 during transitions; check it exists and has content
    await expect(content).toBeAttached({ timeout: 10000 });

    const text = await content.textContent() || '';

    // Should show PHQ-9 score from API (demo data fallback when API returns [])
    expect(text).toContain('PHQ-9');

    // Should not show hardcoded demo session names when real data exists
    expect(text).not.toContain('Alex P.');

    // Self-assessment survey cards should be visible
    expect(text).toContain('Daily Mood Check-in');
    expect(text).toContain('Weekly Wellness Check-in');
    expect(text).toContain('Monthly Reflection');
    expect(text).toContain('Daily Symptom Tracker');

    // Survey card grid should exist
    const saGrid = page.locator('#pgp-sa-grid');
    await expect(saGrid).toBeAttached();
    const saCards = saGrid.locator('.pgp-sa-card');
    await expect(saCards).toHaveCount(4);

    // Quick log form inputs should still exist
    const phq9Input = page.locator('#pto-phq9-input');
    await expect(phq9Input).toHaveCount(1);
    const gad7Input = page.locator('#pto-gad7-input');
    await expect(gad7Input).toHaveCount(1);

    // Action buttons
    expect(text).toContain('Copy Progress Summary');
    expect(text).toContain('Download Chart');
    expect(text).toContain('Download Report');
  });
});
