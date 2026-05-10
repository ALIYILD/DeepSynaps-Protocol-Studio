// ─────────────────────────────────────────────────────────────────────────────
// consent-error-handler.js — User-friendly consent denial messages
//
// When backend returns 403 due to missing/denied consent, show clear guidance
// instead of raw HTTP error codes.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detects if an error is a consent denial (403 from consent enforcement).
 * @param {Error|Object} err - Error object from API call
 * @returns {boolean} true if likely consent denial
 */
export function isConsentDenialError(err) {
  if (!err) return false;
  
  // Check error message patterns
  const msg = String(err.message || err || '').toLowerCase();
  return msg.includes('403') || msg.includes('consent') || msg.includes('forbidden');
}

/**
 * Formats user-friendly message for consent denial.
 * @param {string} workflowName - Name of the workflow (e.g., 'qEEG', 'MRI', 'device sync')
 * @returns {string} HTML message for user
 */
export function getConsentDenialMessage(workflowName) {
  return `
    <div class="consent-denial-notice" style="
      padding: 16px 14px;
      background: rgba(255, 107, 107, 0.12);
      border: 1px solid rgba(255, 107, 107, 0.28);
      border-radius: 12px;
      margin-bottom: 16px;
    ">
      <div style="display: flex; gap: 12px; align-items: flex-start;">
        <div style="font-size: 20px; margin-top: 2px;">🔒</div>
        <div style="flex: 1;">
          <div style="
            font-size: 13px;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: var(--red);
          ">Consent Required</div>
          <div style="
            font-size: 14px;
            font-weight: 600;
            color: var(--text-primary);
            margin-top: 6px;
          ">Patient consent is required before this workflow can run.</div>
          <div style="
            font-size: 13px;
            color: var(--text-secondary);
            line-height: 1.6;
            margin-top: 8px;
          ">
            Please review or request consent before continuing with ${workflowName || 'this analysis'}.
          </div>
          <div style="
            font-size: 11px;
            color: var(--text-tertiary);
            margin-top: 10px;
            padding-top: 10px;
            border-top: 1px solid rgba(255, 107, 107, 0.2);
          ">
            <strong>Next steps:</strong> Contact the clinical team to verify patient consent status
            or request consent form completion.
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Handles API errors intelligently, showing consent message if applicable.
 * @param {Error} err - Error from API call
 * @param {string} workflowName - Name of workflow (e.g., 'qEEG Analysis')
 * @returns {Object} { isConsent: boolean, message: string, html: string }
 */
export function handleAPIError(err, workflowName = 'Analysis') {
  if (isConsentDenialError(err)) {
    return {
      isConsent: true,
      message: `${workflowName}: Patient consent is required. Please review or request consent before continuing.`,
      html: getConsentDenialMessage(workflowName),
    };
  }
  
  // Generic error
  const msg = err?.message || String(err) || 'Unknown error';
  return {
    isConsent: false,
    message: `${workflowName} failed: ${msg}`,
    html: `<div style="
      padding: 12px 14px;
      background: rgba(255, 107, 107, 0.12);
      border: 1px solid rgba(255, 107, 107, 0.28);
      border-radius: 8px;
      color: var(--red);
      font-size: 13px;
    "><strong>Error:</strong> ${escapeHtml(msg)}</div>`,
  };
}

/**
 * Simple XSS escape
 */
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Renders a consent status badge for workflow pages.
 * @param {boolean} consentGranted - Whether patient has given consent
 * @returns {string} HTML badge
 */
export function renderConsentStatusBadge(consentGranted) {
  if (consentGranted) {
    return `<span class="consent-badge" style="
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      background: rgba(0, 200, 83, 0.12);
      border: 1px solid rgba(0, 200, 83, 0.28);
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      color: var(--green);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    ">✓ Consent Granted</span>`;
  }
  
  return `<span class="consent-badge" style="
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    background: rgba(255, 107, 107, 0.12);
    border: 1px solid rgba(255, 107, 107, 0.28);
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    color: var(--red);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  ">⚠ Consent Required</span>`;
}

/**
 * Disables a run button and shows why (consent or other reason).
 * @param {HTMLElement} btn - Button element
 * @param {string} reason - Why button is disabled (e.g., 'consent', 'no-patient')
 * @param {string} tooltip - Hover text
 */
export function disableRunButton(btn, reason = 'consent', tooltip = 'Consent required') {
  if (!btn) return;
  btn.disabled = true;
  btn.title = tooltip;
  btn.setAttribute('aria-disabled', 'true');
  btn.style.opacity = '0.6';
  btn.style.cursor = 'not-allowed';
  btn.dataset.disabledReason = reason;
}

/**
 * Enables a run button.
 * @param {HTMLElement} btn - Button element
 */
export function enableRunButton(btn) {
  if (!btn) return;
  btn.disabled = false;
  btn.title = '';
  btn.removeAttribute('aria-disabled');
  btn.style.opacity = '1';
  btn.style.cursor = 'pointer';
  delete btn.dataset.disabledReason;
}
