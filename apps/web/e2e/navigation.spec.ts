import { test, expect } from '@playwright/test';

const ROUTES = [
  'dashboard',
  'patients',
  'courses',
  'protocol-builder',
  'messaging',
  'calendar',
  'billing',
  'clinical-notes',
  'decision-support',
  'session-monitor',
  'outcome-prediction',
  'rules-engine',
  'ai-note-assistant',
  'forms-builder',
  'med-interactions',
  'consent-automation',
  'evidence-builder',
  'literature',
  'irb-manager',
  'data-export',
  'trial-enrollment',
  'clinic-analytics',
  'protocol-marketplace',
  'benchmark-library',
  'report-builder',
  'device-management',
  'quality-assurance',
  'staff-scheduling',
  'clinic-settings',
  'reminders',
  'wearables',
  'insurance-verification',
  'permissions',
  'multi-site',
  'guardian-portal',
  'pt-outcomes',
];

test.describe('Navigation — all routes load', () => {
  for (const route of ROUTES) {
    test(`route: ${route}`, async ({ page }) => {
      await page.goto(`/#${route}`);
      // Wait for app-content to have children (page rendered)
      await page.waitForSelector('#app-content > *', { timeout: 8000 });
      // No uncaught errors
      const errors: string[] = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.waitForTimeout(500);
      expect(errors.filter(e => !e.includes('ResizeObserver'))).toHaveLength(0);
    });
  }
});
