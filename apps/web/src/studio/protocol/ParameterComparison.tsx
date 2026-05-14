import React, { useState, useCallback } from "react";
import type { ProtocolParameter } from "./protocolTypes";

interface ParameterComparisonProps {
  parameters: ProtocolParameter[];
  onUpdateParameter: (id: string, updates: Partial<ProtocolParameter>) => void;
  onAddParameter: () => void;
  onRemoveParameter: (id: string) => void;
}

/**
 * ParameterComparison — Side-by-side parameter table comparing AI suggestions
 * with clinician edits. Highlights differences, supports notes and validation.
 */
export const ParameterComparison: React.FC<ParameterComparisonProps> = ({
  parameters,
  onUpdateParameter,
  onAddParameter,
  onRemoveParameter,
}) => {
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({});

  const getRange = useCallback(
    (param: ProtocolParameter): { min?: number; max?: number } => {
      if (param.min !== undefined || param.max !== undefined) {
        return { min: param.min, max: param.max };
      }
      if (param.range && Array.isArray(param.range)) {
        return { min: param.range[0], max: param.range[1] };
      }
      return {};
    },
    [],
  );

  const validateValue = useCallback(
    (param: ProtocolParameter, value: string): string | undefined => {
      if (param.required && (!value || value === "")) {
        return "Required field";
      }
      const { min, max } = getRange(param);
      if (typeof min === "number" && Number(value) < min) {
        return `Minimum ${min}${param.unit}`;
      }
      if (typeof max === "number" && Number(value) > max) {
        return `Maximum ${max}${param.unit}`;
      }
      return undefined;
    },
    [getRange],
  );

  const handleValueChange = useCallback(
    (param: ProtocolParameter, value: string) => {
      const error = validateValue(param, value);
      setValidationErrors((prev) => ({
        ...prev,
        [param.id]: error || "",
      }));
      onUpdateParameter(param.id, { clinicianEdit: value });
    },
    [validateValue, onUpdateParameter],
  );

  const hasChanged = useCallback(
    (param: ProtocolParameter): boolean => {
      return (
        param.clinicianEdit !== undefined &&
        String(param.clinicianEdit) !== String(param.aiSuggested)
      );
    },
    [],
  );

  const formatValue = useCallback(
    (val: string | number | undefined, unit: string): string => {
      if (val === undefined || val === "") return "—";
      return `${val} ${unit}`;
    },
    [],
  );

  return (
    <div
      data-testid="parameter-comparison"
      className="rounded-lg border border-slate-200 bg-white shadow-sm"
    >
      <div className="flex items-center justify-between border-b border-slate-200 p-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-800">
            Parameter Comparison
          </h3>
          <p className="text-xs text-slate-500">
            AI suggestions vs. clinician edits. Changes highlighted.
          </p>
        </div>
        <button
          onClick={onAddParameter}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-all hover:bg-blue-700"
          data-testid="add-parameter-btn"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          Add Parameter
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500"
              >
                Parameter
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500"
              >
                AI Suggested
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500"
              >
                Clinician Edit
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500"
              >
                Notes
              </th>
              <th scope="col" className="w-12 px-2 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {parameters.map((param) => {
              const changed = hasChanged(param);
              const hasError = !!validationErrors[param.id];

              return (
                <tr
                  key={param.id}
                  data-testid={`param-row-${param.id}`}
                  className={`transition-colors ${
                    changed ? "bg-amber-50/60" : "hover:bg-slate-50"
                  }`}
                >
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-900">
                        {param.name}
                      </span>
                      {param.required && (
                        <span className="text-xs text-red-400">*</span>
                      )}
                    </div>
                    {(() => {
                      const { min, max } = getRange(param);
                      return min !== undefined && max !== undefined ? (
                        <span className="text-xs text-slate-400">
                          Range: {min}-{max} {param.unit}
                        </span>
                      ) : null;
                    })()}
                  </td>

                  {/* AI Suggested */}
                  <td className="whitespace-nowrap px-4 py-3">
                    <span
                      className="inline-flex rounded-md bg-slate-100 px-2.5 py-1 text-sm font-medium text-slate-600"
                      data-testid={`ai-value-${param.id}`}
                    >
                      {formatValue(param.aiSuggested, param.unit)}
                    </span>
                  </td>

                  {/* Clinician Edit */}
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <input
                        type="text"
                        defaultValue={
                          param.clinicianEdit !== undefined
                            ? String(param.clinicianEdit)
                            : String(param.aiSuggested)
                        }
                        onChange={(e) => handleValueChange(param, e.target.value)}
                        className={`w-32 rounded-md border px-2.5 py-1.5 text-sm font-medium transition-all ${
                          hasError
                            ? "border-red-400 bg-red-50 text-red-700 focus:border-red-500 focus:ring-2 focus:ring-red-200"
                            : changed
                              ? "border-amber-400 bg-amber-50 text-amber-800 focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
                              : "border-slate-300 bg-white text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                        }`}
                        data-testid={`clinician-input-${param.id}`}
                      />
                      {changed && (
                        <span className="text-xs font-semibold text-amber-600">
                          Modified
                        </span>
                      )}
                      {hasError && (
                        <span
                          className="text-xs font-medium text-red-500"
                          data-testid={`error-${param.id}`}
                        >
                          {validationErrors[param.id]}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Notes */}
                  <td className="px-4 py-3">
                    {editingNotes === param.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          autoFocus
                          defaultValue={param.notes || ""}
                          onBlur={(e) => {
                            onUpdateParameter(param.id, {
                              notes: e.target.value,
                            });
                            setEditingNotes(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              onUpdateParameter(param.id, {
                                notes: e.currentTarget.value,
                              });
                              setEditingNotes(null);
                            }
                          }}
                          placeholder="Add clinical rationale..."
                          className="w-40 rounded-md border border-blue-300 bg-white px-2.5 py-1.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                        />
                      </div>
                    ) : (
                      <button
                        onClick={() => setEditingNotes(param.id)}
                        className={`text-left text-sm ${
                          param.notes
                            ? "font-medium text-blue-700"
                            : "italic text-slate-400"
                        }`}
                        data-testid={`notes-btn-${param.id}`}
                      >
                        {param.notes || "+ Add note"}
                      </button>
                    )}
                  </td>

                  {/* Remove */}
                  <td className="px-2 py-3">
                    <button
                      onClick={() => onRemoveParameter(param.id)}
                      className="rounded p-1.5 text-slate-400 transition-all hover:bg-red-50 hover:text-red-500"
                      data-testid={`remove-param-${param.id}`}
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {parameters.length === 0 && (
          <div className="py-8 text-center text-sm text-slate-400">
            No parameters defined. Click "Add Parameter" to begin.
          </div>
        )}
      </div>

      {/* Summary footer */}
      {parameters.length > 0 && (
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3">
          <span className="text-xs text-slate-500">
            {parameters.length} parameter{parameters.length !== 1 ? "s" : ""}
          </span>
          <span className="text-xs text-slate-500">
            {parameters.filter((p) => hasChanged(p)).length} modified from AI
            suggestion
          </span>
        </div>
      )}
    </div>
  );
};

export default ParameterComparison;
