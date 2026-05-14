import React, { useState, useCallback } from "react";

interface OffLabelWarningProps {
  warningText?: string;
  acknowledged: boolean;
  onAcknowledge: (acknowledged: boolean) => void;
}

/**
 * OffLabelWarning — Prominent warning banner for off-label protocol use.
 * Requires explicit checkbox acknowledgement and double-confirmation modal on approval.
 */
export const OffLabelWarning: React.FC<OffLabelWarningProps> = ({
  warningText = "OFF-LABEL USE: This protocol is not approved by regulatory authorities for the specified condition. Clinician assumes full responsibility.",
  acknowledged,
  onAcknowledge,
}) => {
  const [showModal, setShowModal] = useState(false);
  const [modalConfirmed, setModalConfirmed] = useState(false);
  const [firstCheckbox, setFirstCheckbox] = useState(acknowledged);

  const handleFirstCheckbox = useCallback(
    (checked: boolean) => {
      setFirstCheckbox(checked);
      if (checked) {
        setShowModal(true);
      } else {
        onAcknowledge(false);
        setModalConfirmed(false);
      }
    },
    [onAcknowledge],
  );

  const handleModalConfirm = useCallback(() => {
    setModalConfirmed(true);
    setShowModal(false);
    onAcknowledge(true);
  }, [onAcknowledge]);

  const handleModalCancel = useCallback(() => {
    setModalConfirmed(false);
    setFirstCheckbox(false);
    setShowModal(false);
    onAcknowledge(false);
  }, [onAcknowledge]);

  return (
    <>
      <div
        data-testid="off-label-warning"
        className="relative overflow-hidden rounded-lg border-2 border-red-400 bg-gradient-to-r from-red-50 to-amber-50 p-5 shadow-md"
      >
        {/* Warning icon row */}
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
            <svg
              className="h-6 w-6 text-red-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div>
            <h4 className="text-base font-bold uppercase tracking-wide text-red-700">
              Off-Label Use Warning
            </h4>
            <p className="text-xs font-medium text-red-500">
              Requires explicit acknowledgement
            </p>
          </div>
          <div className="ml-auto">
            <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-700">
              CRITICAL
            </span>
          </div>
        </div>

        {/* Warning text */}
        <div className="mb-4 rounded-md border border-red-200 bg-white/70 p-3">
          <p className="text-sm font-semibold leading-relaxed text-red-800">
            {warningText}
          </p>
        </div>

        {/* Consequences */}
        <div className="mb-4 space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">
            By approving, you acknowledge:
          </p>
          <ul className="space-y-1">
            {[
              "This use is not approved by the FDA or relevant regulatory body",
              "You are prescribing based on clinical judgment and available evidence",
              "You assume full medico-legal responsibility for this decision",
              "You have documented the clinical rationale in the patient record",
            ].map((item, idx) => (
              <li
                key={idx}
                className="flex items-start gap-2 text-xs text-amber-800"
              >
                <svg
                  className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-500"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Acknowledgement checkbox */}
        <label className="flex cursor-pointer items-center gap-3 rounded-md border border-red-200 bg-white p-3 transition-all hover:border-red-300">
          <div
            className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 transition-all ${
              firstCheckbox && modalConfirmed
                ? "border-red-500 bg-red-500"
                : "border-red-300 bg-white"
            }`}
            onClick={() => handleFirstCheckbox(!firstCheckbox)}
            data-testid="off-label-checkbox"
          >
            {firstCheckbox && modalConfirmed && (
              <svg
                className="h-3.5 w-3.5 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={3}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            )}
          </div>
          <span className="text-sm font-semibold text-red-800">
            I understand and accept responsibility for off-label use
          </span>
        </label>

        {/* Visual status indicator */}
        {firstCheckbox && modalConfirmed && (
          <div className="mt-3 flex items-center gap-2 rounded-md bg-red-100 p-2.5">
            <svg
              className="h-4 w-4 text-red-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
            <span className="text-xs font-bold text-red-700">
              Off-label responsibility acknowledged and documented
            </span>
          </div>
        )}
      </div>

      {/* Double-confirmation modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          data-testid="off-label-modal"
        >
          <div className="max-w-md w-full rounded-xl border-2 border-red-500 bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                <svg
                  className="h-7 w-7 text-red-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-red-700">
                  Confirm Off-Label Responsibility
                </h3>
                <p className="text-xs text-slate-500">
                  Final confirmation required
                </p>
              </div>
            </div>

            <div className="mb-4 rounded-lg bg-red-50 p-4">
              <p className="mb-3 text-sm font-semibold text-red-800">
                {warningText}
              </p>
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-red-600">
                  You are confirming that:
                </p>
                <ul className="space-y-1.5">
                  {[
                    "You have reviewed the available evidence for this off-label use",
                    "You have assessed the risk-benefit ratio for this patient",
                    "You have obtained any necessary institutional approvals",
                    "You accept full clinical and legal responsibility",
                  ].map((item, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-2 text-xs text-red-700"
                    >
                      <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-red-200 text-red-600">
                        <svg
                          className="h-2.5 w-2.5"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-bold text-amber-800">
                This action will be recorded in the permanent audit trail with
                your identity and timestamp.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleModalCancel}
                className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:bg-slate-50"
                data-testid="off-label-modal-cancel"
              >
                Cancel
              </button>
              <button
                onClick={handleModalConfirm}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-bold text-white shadow-md transition-all hover:bg-red-700"
                data-testid="off-label-modal-confirm"
              >
                I Accept Full Responsibility
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default OffLabelWarning;
