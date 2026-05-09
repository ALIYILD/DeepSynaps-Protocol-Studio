/**
 * clinical-disclaimer.js
 * 
 * Shared clinical disclaimer banner for all AI/analyzer pages.
 * 
 * Required disclaimer text (overnight sprint 2026-05-08):
 * "This is a controlled preview using synthetic or clinician-provided data where applicable.
 *  This page supports clinical review and decision support only. It does not diagnose,
 *  prescribe, triage emergencies, approve treatment, or act autonomously. All outputs
 *  require clinician review."
 * 
 * Usage:
 *   import { renderClinicalDisclaimer } from './clinical-disclaimer.js';
 *   el.insertAdjacentHTML('beforebegin', renderClinicalDisclaimer());
 */

/**
 * Returns the required clinical disclaimer banner HTML.
 * Styled to match existing analyzer page palettes.
 * @returns {string} HTML banner div
 */
export function renderClinicalDisclaimer() {
  // Inject styles once on first render (idempotent).
  injectClinicalDisclaimerStyles();
  
  return `
    <div class="ds-clinical-disclaimer-banner" role="banner" aria-label="Clinical disclaimer">
      <div class="ds-clinical-disclaimer-banner__content">
        <div class="ds-clinical-disclaimer-banner__icon">⚕️</div>
        <div class="ds-clinical-disclaimer-banner__text">
          <strong>Clinical Disclaimer:</strong>
          This is a controlled preview using synthetic or clinician-provided data where applicable.
          This page supports clinical review and decision support only. It does not diagnose,
          prescribe, triage emergencies, approve treatment, or act autonomously. All outputs
          require clinician review.
        </div>
      </div>
    </div>
  `;
}

/**
 * CSS styles for the disclaimer banner.
 * Inject this once per page or include in the main stylesheet.
 * @returns {string} CSS rule text
 */
export function clinicalDisclaimerStyles() {
  return `
    .ds-clinical-disclaimer-banner {
      background-color: var(--color-banner-info, #eff6ff);
      border-left: 4px solid var(--color-info, #0284c7);
      padding: 12px 16px;
      margin-bottom: 16px;
      border-radius: 2px;
      font-size: 13px;
      line-height: 1.5;
    }
    
    .ds-clinical-disclaimer-banner__content {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      max-width: 100%;
    }
    
    .ds-clinical-disclaimer-banner__icon {
      flex-shrink: 0;
      font-size: 18px;
      line-height: 1;
      margin-top: 2px;
    }
    
    .ds-clinical-disclaimer-banner__text {
      flex-grow: 1;
      color: var(--text-primary, #1f2937);
    }
    
    .ds-clinical-disclaimer-banner__text strong {
      font-weight: 600;
      display: block;
      margin-bottom: 4px;
    }
  `;
}

/**
 * Injects the disclaimer CSS into the page once (idempotent).
 * Call this once at module load time. Safe in Node.js test environment (no-op).
 */
export function injectClinicalDisclaimerStyles() {
  if (typeof document === 'undefined' || !document.head) return;
  
  var id = 'ds-clinical-disclaimer-styles';
  if (document.getElementById(id)) return; // Already injected
  
  var style = document.createElement('style');
  style.id = id;
  style.textContent = clinicalDisclaimerStyles();
  document.head.appendChild(style);
}
