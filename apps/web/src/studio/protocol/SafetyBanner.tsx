/**
 * SafetyBanner — Fixed amber warning banner for the Protocol Studio.
 *
 * Displayed at the top of every Protocol Studio view. Reinforces that
 * all AI-generated content is decision-support only and requires clinician
 * review before any clinical use. Not for autonomous prescribing.
 */

import React from "react";

/**
 * Safety banner component with fixed positioning.
 * @returns Fixed amber safety banner element.
 */
const SafetyBanner: React.FC = () => {
  return (
    <div
      data-testid="protocol-safety-banner"
      className="sticky top-0 z-50 border-b border-amber-300 bg-amber-50 px-4 py-3"
      role="banner"
      aria-label="Clinical decision support disclaimer"
    >
      <div className="mx-auto flex max-w-7xl items-start gap-3">
        <svg
          className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600"
          fill="currentColor"
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
            clipRule="evenodd"
          />
        </svg>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-amber-800">
            Decision-Support Only
          </h3>
          <p className="mt-0.5 text-sm text-amber-700">
            This tool provides clinical decision support only. All protocols
            require clinician review and approval before use. Not for autonomous
            prescribing.
          </p>
        </div>
      </div>
    </div>
  );
};

export default SafetyBanner;
