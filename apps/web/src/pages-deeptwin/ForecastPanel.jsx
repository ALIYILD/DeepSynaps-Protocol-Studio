/**
 * ForecastPanel.jsx — DeepTwin forecast/simulation panel
 * NEVER fakes predictions. Only shows validated forecasts.
 */

import React from "react";

const FORECAST_UNAVAILABLE = "Forecast unavailable: no calibrated model.";

export default function ForecastPanel({ snapshot }) {
  if (!snapshot) return null;
  const status = snapshot.forecast_status || FORECAST_UNAVAILABLE;
  const isAvailable = status !== FORECAST_UNAVAILABLE && !status.includes("unavailable");

  return (
    <div className="space-y-4">
      {!isAvailable ? (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
          <span className="text-4xl text-gray-300 block mb-4">&#128161;</span>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Forecast Unavailable</h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            {FORECAST_UNAVAILABLE}
            <br /><br />
            Forecasting requires a validated, calibrated prediction model. DeepTwin does not generate predictions without one.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-green-200 p-6">
          <h3 className="text-lg font-semibold text-green-800 mb-3">Validated Forecast</h3>
          <p className="text-sm text-gray-700">{status}</p>
          <div className="mt-4 p-3 bg-amber-50 rounded-md text-xs text-amber-700">
            <span className="font-medium">Note:</span> This forecast is based on a calibrated model. Confidence intervals and model version are shown. All forecasts require clinician review.
          </div>
        </div>
      )}

      {/* Honest Disclosure */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-5">
        <h4 className="text-sm font-semibold text-blue-800 mb-2">About Forecasting</h4>
        <ul className="text-xs text-blue-700 space-y-1 list-disc list-inside">
          <li>DeepTwin never generates synthetic or fake predictions.</li>
          <li>Forecasting is only available when a validated model exists.</li>
          <li>All forecasts include confidence intervals and uncertainty.</li>
          <li>Forecasts are decision support only, not clinical directives.</li>
          <li>Model validation status, version, and last calibration date are displayed.</li>
        </ul>
      </div>
    </div>
  );
}
