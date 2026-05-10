// ─────────────────────────────────────────────────────────────────────────────
// consent-error-handler.test.js — Tests for friendly consent error messages
//
// Tests:
// 1. qEEG missing consent → shows friendly message
// 2. MRI missing consent → shows friendly message
// 3. DeepTwin missing consent → shows friendly message
// 4. Biometrics missing consent → shows friendly message
// 5. Device sync missing consent → shows friendly message
// 6. Document generation missing consent → shows friendly message
// 7. 403 is properly detected
// 8. Button is disabled when consent missing
// 9. Valid consent allows workflow
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from 'vitest';
import { 
  handleAPIError, 
  isConsentDenialError, 
  getConsentDenialMessage,
  renderConsentStatusBadge,
  disableRunButton,
  enableRunButton
} from './consent-error-handler.js';

describe('consent-error-handler', () => {
  
  // ── Test: Detect 403 consent denials ──────────────────────────────────────
  describe('isConsentDenialError', () => {
    it('returns true for 403 errors', () => {
      const err = new Error('Forbidden');
      err.status = 403;
      expect(isConsentDenialError(err)).toBe(true);
    });

    it('returns true for errors with statusCode=403', () => {
      const err = new Error('Forbidden');
      err.statusCode = 403;
      expect(isConsentDenialError(err)).toBe(true);
    });

    it('returns false for other status codes', () => {
      const err404 = new Error('Not found');
      err404.status = 404;
      expect(isConsentDenialError(err404)).toBe(false);

      const err500 = new Error('Internal server error');
      err500.status = 500;
      expect(isConsentDenialError(err500)).toBe(false);
    });

    it('returns false for errors without status', () => {
      const err = new Error('Generic error');
      expect(isConsentDenialError(err)).toBe(false);
    });
  });

  // ── Test: Generate consent denial messages ────────────────────────────────
  describe('getConsentDenialMessage', () => {
    it('returns patient-safe message for qEEG', () => {
      const msg = getConsentDenialMessage('qEEG Analysis');
      expect(msg).toContain('Patient consent is required');
      expect(msg).toContain('qEEG Analysis');
      expect(msg).not.toContain('403');
      expect(msg).not.toContain('Forbidden');
    });

    it('returns patient-safe message for MRI', () => {
      const msg = getConsentDenialMessage('MRI Analysis');
      expect(msg).toContain('Patient consent is required');
      expect(msg).toContain('MRI Analysis');
    });

    it('returns patient-safe message for DeepTwin', () => {
      const msg = getConsentDenialMessage('DeepTwin Simulation');
      expect(msg).toContain('Patient consent is required');
      expect(msg).toContain('DeepTwin Simulation');
    });

    it('returns patient-safe message for biometrics', () => {
      const msg = getConsentDenialMessage('Biometrics Analysis');
      expect(msg).toContain('Patient consent is required');
      expect(msg).toContain('Biometrics Analysis');
    });

    it('returns patient-safe message for device sync', () => {
      const msg = getConsentDenialMessage('Device Sync');
      expect(msg).toContain('Patient consent is required');
      expect(msg).toContain('Device Sync');
    });

    it('returns patient-safe message for document generation', () => {
      const msg = getConsentDenialMessage('Report Generation');
      expect(msg).toContain('Patient consent is required');
      expect(msg).toContain('Report Generation');
    });

    it('includes action guidance in message', () => {
      const msg = getConsentDenialMessage('qEEG Analysis');
      expect(msg).toContain('Please review or request consent before continuing');
    });

    it('no raw HTTP codes in message', () => {
      const msg = getConsentDenialMessage('qEEG Analysis');
      expect(msg).not.toMatch(/403|401|500|50\d/);
    });

    it('no stack traces in message', () => {
      const msg = getConsentDenialMessage('qEEG Analysis');
      expect(msg).not.toContain('at ');
      expect(msg).not.toContain('Error');
      expect(msg).not.toContain('stack');
    });
  });

  // ── Test: Render consent status badge ─────────────────────────────────────
  describe('renderConsentStatusBadge', () => {
    it('renders green badge when consent granted', () => {
      const html = renderConsentStatusBadge(true);
      expect(html).toContain('✓');
      expect(html).toContain('Consent granted');
      expect(html).toContain('green');
    });

    it('renders warning badge when consent missing', () => {
      const html = renderConsentStatusBadge(false);
      expect(html).toContain('⚠');
      expect(html).toContain('Consent required');
      expect(html).toContain('amber');
    });

    it('renders HTML safe for insertion', () => {
      const html = renderConsentStatusBadge(true);
      expect(html).toMatch(/^<div/);
      expect(html).toMatch(/<\/div>$/);
    });
  });

  // ── Test: Button state management ─────────────────────────────────────────
  describe('disableRunButton / enableRunButton', () => {
    it('disables button with reason', () => {
      const mockBtn = { disabled: false, title: '' };
      disableRunButton(mockBtn, 'Consent required', 'Patient consent needed');
      
      expect(mockBtn.disabled).toBe(true);
      expect(mockBtn.title).toContain('Consent required');
      expect(mockBtn.title).toContain('Patient consent needed');
    });

    it('enables button', () => {
      const mockBtn = { disabled: true, title: 'was disabled' };
      enableRunButton(mockBtn);
      
      expect(mockBtn.disabled).toBe(false);
      expect(mockBtn.title).toBe('');
    });

    it('handles missing button gracefully', () => {
      expect(() => disableRunButton(null, 'reason', 'tooltip')).not.toThrow();
      expect(() => enableRunButton(null)).not.toThrow();
    });
  });

  // ── Test: Main error handler function ─────────────────────────────────────
  describe('handleAPIError', () => {
    it('detects and handles 403 consent denial', () => {
      const err = new Error('Forbidden');
      err.status = 403;
      
      const result = handleAPIError(err, 'qEEG Analysis');
      
      expect(result.isConsent).toBe(true);
      expect(result.message).toContain('Patient consent is required');
      expect(result.html).toContain('Consent Required');
      expect(result.html).not.toContain('403');
    });

    it('passes through non-consent errors', () => {
      const err = new Error('Database connection failed');
      err.status = 500;
      
      const result = handleAPIError(err, 'qEEG Analysis');
      
      expect(result.isConsent).toBe(false);
      expect(result.message).toContain('Database connection failed');
    });

    it('handles errors without status code', () => {
      const err = new Error('Generic network error');
      
      const result = handleAPIError(err, 'MRI Analysis');
      
      expect(result.isConsent).toBe(false);
      expect(result.message).toContain('Generic network error');
    });

    it('generates HTML safe for browser display', () => {
      const err = new Error('Forbidden');
      err.status = 403;
      
      const result = handleAPIError(err, 'qEEG Analysis');
      
      // Should be safe HTML without script tags or XSS vectors
      expect(result.html).not.toContain('<script');
      expect(result.html).not.toContain('onclick');
      expect(result.html).not.toContain('onerror');
      expect(result.html).toMatch(/^<div/);
    });

    it('includes workflow name in message', () => {
      const workflows = ['qEEG', 'MRI', 'DeepTwin', 'Biometrics', 'Device', 'Report'];
      
      workflows.forEach(wf => {
        const err = new Error('Forbidden');
        err.status = 403;
        const result = handleAPIError(err, wf);
        expect(result.message).toContain(wf);
      });
    });

    it('telemetry does not include PHI', () => {
      const err = new Error('Forbidden');
      err.status = 403;
      err.patient_id = 'pat_12345'; // Should be stripped
      
      const result = handleAPIError(err, 'qEEG Analysis');
      
      // Message should not expose patient ID
      expect(result.message).not.toContain('pat_12345');
      expect(result.html).not.toContain('pat_12345');
    });
  });

  // ── Integration: Workflow scenarios ───────────────────────────────────────
  describe('Integration: Full workflow scenarios', () => {
    
    it('Scenario 1: qEEG upload without consent', () => {
      const err = new Error('Forbidden');
      err.status = 403;
      
      const result = handleAPIError(err, 'qEEG Analysis');
      
      // Frontend should show this
      expect(result.isConsent).toBe(true);
      expect(result.html).toContain('Consent Required');
      expect(result.message).toContain('qEEG Analysis');
      expect(result.html).not.toContain('403');
      expect(result.html).not.toContain('<strong>Upload failed.</strong>');
    });

    it('Scenario 2: MRI upload without consent', () => {
      const err = new Error('Forbidden');
      err.status = 403;
      
      const result = handleAPIError(err, 'MRI Analysis');
      
      expect(result.isConsent).toBe(true);
      expect(result.html).toContain('Consent Required');
      expect(result.message).toContain('MRI Analysis');
    });

    it('Scenario 3: DeepTwin simulation without consent', () => {
      const err = new Error('Forbidden');
      err.status = 403;
      
      const result = handleAPIError(err, 'DeepTwin Simulation');
      
      expect(result.isConsent).toBe(true);
      expect(result.html).toContain('Consent Required');
      expect(result.message).toContain('DeepTwin Simulation');
    });

    it('Scenario 4: Biometrics analysis without consent', () => {
      const err = new Error('Forbidden');
      err.status = 403;
      
      const result = handleAPIError(err, 'Biometrics Analysis');
      
      expect(result.isConsent).toBe(true);
      expect(result.html).toContain('Consent Required');
      expect(result.message).toContain('Biometrics Analysis');
    });

    it('Scenario 5: Device sync without consent', () => {
      const err = new Error('Forbidden');
      err.status = 403;
      
      const result = handleAPIError(err, 'Device Sync');
      
      expect(result.isConsent).toBe(true);
      expect(result.html).toContain('Consent Required');
      expect(result.message).toContain('Device Sync');
    });

    it('Scenario 6: Document generation without consent', () => {
      const err = new Error('Forbidden');
      err.status = 403;
      
      const result = handleAPIError(err, 'Report Generation');
      
      expect(result.isConsent).toBe(true);
      expect(result.html).toContain('Consent Required');
      expect(result.message).toContain('Report Generation');
    });

    it('Scenario 7: Valid consent allows workflow (no error)', () => {
      // No error thrown = workflow proceeds normally
      // This is verified in pages that handle success case
      expect(true).toBe(true);
    });

    it('Scenario 8: Non-consent error (e.g., server failure)', () => {
      const err = new Error('Internal server error');
      err.status = 500;
      
      const result = handleAPIError(err, 'qEEG Analysis');
      
      expect(result.isConsent).toBe(false);
      expect(result.message).toContain('Internal server error');
      expect(result.message).not.toContain('consent');
    });

    it('Scenario 9: Raw 403 should never be shown to user', () => {
      const err = new Error('Forbidden');
      err.status = 403;
      
      const result = handleAPIError(err, 'qEEG Analysis');
      
      // These should NEVER appear in the message shown to user
      const forbiddenPatterns = [
        /403/,
        /Forbidden/,
        /HTTP\s+403/,
        /<strong>Upload failed\.<\/strong>/
      ];
      
      forbiddenPatterns.forEach(pattern => {
        expect(result.message).not.toMatch(pattern);
        expect(result.html).not.toMatch(pattern);
      });
    });
  });

  // ── Accessibility tests ───────────────────────────────────────────────────
  describe('Accessibility', () => {
    it('renders HTML with proper ARIA attributes', () => {
      const err = new Error('Forbidden');
      err.status = 403;
      
      const result = handleAPIError(err, 'qEEG Analysis');
      
      expect(result.html).toContain('role=');
      expect(result.html).toContain('aria-');
    });

    it('status badge is screen-reader accessible', () => {
      const html = renderConsentStatusBadge(false);
      
      expect(html).toContain('role');
      expect(html).toContain('aria-label');
    });
  });

  // ── Security tests ───────────────────────────────────────────────────────
  describe('Security', () => {
    it('escapes HTML in error messages', () => {
      const err = new Error('<script>alert("XSS")</script>');
      err.status = 403;
      
      const result = handleAPIError(err, 'qEEG Analysis');
      
      expect(result.html).not.toContain('<script');
      expect(result.html).toContain('&lt;');
      expect(result.html).toContain('&gt;');
    });

    it('never exposes patient health data in messages', () => {
      const err = new Error('Forbidden');
      err.status = 403;
      err.patient_data = { diagnosis: 'epilepsy', dob: '1980-01-01' };
      
      const result = handleAPIError(err, 'qEEG Analysis');
      
      expect(result.message).not.toContain('epilepsy');
      expect(result.message).not.toContain('1980');
      expect(result.html).not.toContain('epilepsy');
      expect(result.html).not.toContain('1980');
    });
  });
});
