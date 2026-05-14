import React, { useState, useCallback, useMemo } from "react";
import type {
  ProtocolDraft,
  ProtocolParameter,
  ChecklistItem,
  ChecklistState,
  WorkflowState,
  WorkflowComment,
  ProtocolVersion,
  AuditEntry,
  ClinicalRole,
  AuditAction,
} from "./protocolTypes";
import { SafetyChecklist } from "./SafetyChecklist";
import { OffLabelWarning } from "./OffLabelWarning";
import { ParameterComparison } from "./ParameterComparison";
import { ApprovalWorkflow } from "./ApprovalWorkflow";
import { AuditTrail } from "./AuditTrail";

interface ProtocolReviewPageProps {
  draft: ProtocolDraft;
  currentUser: { name: string; role: ClinicalRole };
  onApprove: (draft: ProtocolDraft, reason: string) => void;
  onReject: (draftId: string, reason: string) => void;
  onUpdateParameter: (draftId: string, paramId: string, updates: Partial<ProtocolParameter>) => void;
}

/**
 * ProtocolReviewPage — Main review page with split layout.
 * Left panel (50%): Read-only AI Draft display
 * Right panel (50%): Clinician editing tools, safety checklist, approval actions
 */
export const ProtocolReviewPage: React.FC<ProtocolReviewPageProps> = ({
  draft,
  currentUser,
  onApprove,
  onReject,
  onUpdateParameter,
}) => {
  const [clinicalNotes, setClinicalNotes] = useState("");
  const [checklistState, setChecklistState] = useState<ChecklistState>({});
  const [offLabelAcknowledged, setOffLabelAcknowledged] = useState(false);
  const [localParameters, setLocalParameters] = useState<ProtocolParameter[]>(
    draft.parameters,
  );
  const [workflowState, setWorkflowState] = useState<WorkflowState>(
    draft.status === "under_review"
      ? "under_review"
      : draft.status === "approved"
        ? "approved"
        : draft.status === "prescribed"
          ? "prescribed"
          : draft.status === "completed"
            ? "completed"
            : "draft",
  );
  const [comments, setComments] = useState<WorkflowComment[]>([
    {
      id: "c1",
      timestamp: draft.createdAt,
      author: "AI System",
      authorRole: "system_ai",
      state: "draft",
      message: `Protocol draft generated. Status: ${draft.status}. Evidence grade: ${draft.evidenceGrade || "N/A"}`,
    },
  ]);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([
    {
      id: "a1",
      timestamp: draft.createdAt,
      actor: "AI System",
      actorRole: "system_ai",
      action: "created" as AuditAction,
      reason: `Protocol draft created with status: ${draft.status}`,
      metadata: { mode: draft.mode, evidenceGrade: draft.evidenceGrade },
    },
  ]);
  const [approvalReason, setApprovalReason] = useState("");

  /* ── Safety checklist items (dynamic based on protocol) ── */
  const checklistItems: ChecklistItem[] = useMemo(() => {
    const items: ChecklistItem[] = [
      {
        id: "reviewed_evidence",
        label: "I have reviewed the supporting evidence",
        required: true,
      },
      {
        id: "checked_contraindications",
        label: "I have checked for contraindications",
        required: true,
      },
      {
        id: "verified_patient",
        label: "I have verified patient identity and diagnosis",
        required: true,
      },
      {
        id: "documented_rationale",
        label: "I have documented my clinical rationale",
        required: true,
      },
      {
        id: "confirmed_safe_ranges",
        label: "I have confirmed parameters are within safe ranges",
        required: true,
      },
    ];

    if (draft.offLabel) {
      items.push({
        id: "understand_offlabel",
        label: "I understand this is off-label use",
        required: true,
        conditional: (d) => d.offLabel,
      });
    }

    return items;
  }, [draft.offLabel]);

  /* ── Derived state ── */
  const checklistComplete = checklistItems.every(
    (item) => checklistState[item.id],
  );

  const canApprove =
    checklistComplete &&
    (!draft.offLabel || offLabelAcknowledged) &&
    approvalReason.trim().length > 0;

  /* ── Handlers ── */
  const handleChecklistChange = useCallback((itemId: string, checked: boolean) => {
    setChecklistState((prev) => ({ ...prev, [itemId]: checked }));
  }, []);

  const handleUpdateParameter = useCallback(
    (paramId: string, updates: Partial<ProtocolParameter>) => {
      setLocalParameters((prev) =>
        prev.map((p) => (p.id === paramId ? { ...p, ...updates } : p)),
      );
      onUpdateParameter(draft.draftId, paramId, updates);
    },
    [draft.draftId, onUpdateParameter],
  );

  const handleAddParameter = useCallback(() => {
    const newParam: ProtocolParameter = {
      id: `param_${Date.now()}`,
      name: "New Parameter",
      value: "",
      unit: "",
      required: false,
      aiSuggested: "",
      clinicianEdit: "",
      notes: "",
    };
    setLocalParameters((prev) => [...prev, newParam]);
  }, []);

  const handleRemoveParameter = useCallback((id: string) => {
    setLocalParameters((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const handleStateTransition = useCallback(
    (toState: WorkflowState, reason: string) => {
      setWorkflowState(toState);
      const newAudit: AuditEntry = {
        id: `a_${Date.now()}`,
        timestamp: new Date().toISOString(),
        actor: currentUser.name,
        actorRole: currentUser.role,
        action: (toState === "approved"
          ? "approved"
          : toState === "rejected"
            ? "rejected"
            : toState === "prescribed"
              ? "prescribed"
              : toState === "completed"
                ? "completed"
                : "reviewed") as AuditAction,
        reason,
        metadata: { previousState: workflowState },
      };
      setAuditEntries((prev) => [...prev, newAudit]);

      if (toState === "approved") {
        setShowApproveConfirm(false);
        const updatedDraft = {
          ...draft,
          status: "approved" as const,
          parameters: localParameters,
          reviewedBy: currentUser.name,
          approvedBy: currentUser.name,
        };
        onApprove(updatedDraft, reason);
      }
      if (toState === "rejected") {
        onReject(draft.draftId, reason);
      }
    },
    [
      workflowState,
      currentUser,
      draft,
      localParameters,
      onApprove,
      onReject,
    ],
  );

  const handleAddComment = useCallback(
    (message: string) => {
      const newComment: WorkflowComment = {
        id: `c_${Date.now()}`,
        timestamp: new Date().toISOString(),
        author: currentUser.name,
        authorRole: currentUser.role,
        state: workflowState,
        message,
      };
      setComments((prev) => [...prev, newComment]);
    },
    [currentUser, workflowState],
  );

  const handleApprove = useCallback(() => {
    if (!canApprove) return;
    if (workflowState === "under_review") {
      handleStateTransition("approved", approvalReason);
    } else {
      setShowApproveConfirm(true);
    }
  }, [canApprove, workflowState, approvalReason, handleStateTransition]);

  const versions: ProtocolVersion[] = useMemo(
    () => [
      {
        version: 1,
        createdAt: draft.createdAt,
        createdBy: "AI System",
        changes: "Initial AI-generated draft",
        draft,
      },
    ],
    [draft],
  );

  const evidenceGradeColor = (grade: string | null): string => {
    if (!grade) return "bg-slate-100 text-slate-600";
    if (grade.startsWith("A")) return "bg-emerald-100 text-emerald-700";
    if (grade.startsWith("B")) return "bg-blue-100 text-blue-700";
    if (grade.startsWith("C")) return "bg-amber-100 text-amber-700";
    if (grade.startsWith("D")) return "bg-orange-100 text-orange-700";
    return "bg-red-100 text-red-700";
  };

  const getEvidenceUrl = (link: typeof draft.evidenceLinks[0]): string =>
    link.url || link.link || "#";
  const getEvidenceYear = (link: typeof draft.evidenceLinks[0]): number | undefined =>
    link.year;

  return (
    <div
      data-testid="protocol-review-page"
      className="flex h-screen flex-col bg-slate-100"
    >
      {/* Header */}
      <header className="border-b border-slate-200 bg-white px-6 py-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600">
              <svg
                className="h-6 w-6 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800">
                Protocol Review
              </h1>
              <p className="text-xs text-slate-500">
                Draft ID: {draft.draftId} · Created:{" "}
                {new Date(draft.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Status badge */}
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                workflowState === "draft"
                  ? "bg-slate-100 text-slate-600"
                  : workflowState === "under_review"
                    ? "bg-purple-100 text-purple-700"
                    : workflowState === "approved"
                      ? "bg-emerald-100 text-emerald-700"
                      : workflowState === "rejected"
                        ? "bg-red-100 text-red-700"
                        : "bg-blue-100 text-blue-700"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  workflowState === "approved"
                    ? "bg-emerald-500"
                    : workflowState === "rejected"
                      ? "bg-red-500"
                      : "bg-amber-400 animate-pulse"
                }`}
              />
              {workflowState === "draft"
                ? "Draft"
                : workflowState === "under_review"
                  ? "Under Review"
                  : workflowState === "approved"
                    ? "Approved"
                    : workflowState === "prescribed"
                      ? "Prescribed"
                      : workflowState === "completed"
                        ? "Completed"
                        : "Rejected"}
            </span>

            {/* Current user */}
            <div className="flex items-center gap-2 rounded-md bg-slate-100 px-3 py-1.5">
              <div className="h-6 w-6 rounded-full bg-blue-500 text-center text-xs font-bold leading-6 text-white">
                {currentUser.name.charAt(0).toUpperCase()}
              </div>
              <span className="text-xs font-semibold text-slate-600">
                {currentUser.name}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main split content */}
      <main className="flex flex-1 overflow-hidden">
        {/* LEFT PANEL: AI Draft (read-only) */}
        <section className="flex h-full w-1/2 flex-col overflow-y-auto border-r border-slate-300 bg-white">
          <div className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 px-5 py-3">
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-500">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              AI-Generated Draft
              <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-500">
                READ-ONLY
              </span>
            </h2>
          </div>

          <div className="space-y-5 p-5">
            {/* Protocol Summary Card */}
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-slate-400">
                Protocol Summary
              </h3>
              <p className="text-sm leading-relaxed text-slate-700">
                {draft.protocolSummary}
              </p>
            </div>

            {/* Parameters Table (read-only) */}
            <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-4 py-2.5">
                <h3 className="text-sm font-semibold text-slate-700">
                  Parameters
                </h3>
              </div>
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Name
                    </th>
                    <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Value
                    </th>
                    <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Unit
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {draft.parameters.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-2 text-sm font-medium text-slate-700">
                        {p.name}
                      </td>
                      <td className="px-4 py-2 text-sm text-slate-600">
                        {p.aiSuggested}
                      </td>
                      <td className="px-4 py-2 text-sm text-slate-500">
                        {p.unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Rationale */}
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-slate-400">
                Clinical Rationale
              </h3>
              <ul className="space-y-2">
                {draft.rationale.map((r, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm text-slate-700"
                  >
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-400" />
                    {r}
                  </li>
                ))}
              </ul>
            </div>

            {/* Evidence Links */}
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-slate-400">
                Supporting Evidence
              </h3>
              <div className="mb-3">
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${evidenceGradeColor(draft.evidenceGrade)}`}
                >
                  Grade: {draft.evidenceGrade || "Ungraded"}
                </span>
              </div>
              <div className="space-y-2">
                {draft.evidenceLinks.map((link) => (
                  <a
                    key={link.id}
                    href={getEvidenceUrl(link)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-md border border-slate-100 p-2.5 text-sm text-blue-600 transition-all hover:bg-blue-50"
                  >
                    <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    <span className="flex-1 truncate">{link.title}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${evidenceGradeColor(link.grade)}`}
                    >
                      {link.grade}
                    </span>
                    {getEvidenceYear(link) && (
                      <span className="text-xs text-slate-400">({getEvidenceYear(link)})</span>
                    )}
                  </a>
                ))}
              </div>
            </div>

            {/* Contraindications */}
            {draft.contraindications.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-red-600">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  Contraindications
                </h3>
                <ul className="space-y-1.5">
                  {draft.contraindications.map((c, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-sm font-semibold text-red-700"
                    >
                      <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-red-500" />
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Missing Data */}
            {draft.missingData.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-amber-600">
                  Missing Data
                </h3>
                <ul className="space-y-1">
                  {draft.missingData.map((m, i) => (
                    <li key={i} className="text-sm text-amber-700">
                      • {m}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Uncertainty Disclaimer */}
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <h3 className="mb-1 text-sm font-bold uppercase tracking-wider text-blue-600">
                Uncertainty & Limitations
              </h3>
              <p className="text-sm leading-relaxed text-blue-800">
                {draft.uncertainty}
              </p>
            </div>

            {/* Regulatory Status */}
            {draft.regulatoryStatus && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <h3 className="mb-1 text-sm font-bold uppercase tracking-wider text-slate-400">
                  Regulatory Status
                </h3>
                <p className="text-sm text-slate-600">
                  {draft.regulatoryStatus}
                </p>
              </div>
            )}

            {/* Off-label warning in left panel too */}
            {draft.offLabel && (
              <div className="opacity-60">
                <div className="rounded-lg border-2 border-red-300 bg-red-50 p-3">
                  <p className="text-xs font-bold text-red-600">
                    OFF-LABEL · {draft.offLabelWarning}
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* RIGHT PANEL: Clinician Edit */}
        <section className="flex h-full w-1/2 flex-col overflow-y-auto bg-slate-50">
          <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-5 py-3 shadow-sm">
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-500">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Clinician Review & Edit
            </h2>
          </div>

          <div className="space-y-5 p-5">
            {/* Off-label warning (if applicable) */}
            {draft.offLabel && (
              <OffLabelWarning
                warningText={draft.offLabelWarning}
                acknowledged={offLabelAcknowledged}
                onAcknowledge={setOffLabelAcknowledged}
              />
            )}

            {/* Parameter Comparison */}
            <ParameterComparison
              parameters={localParameters}
              onUpdateParameter={handleUpdateParameter}
              onAddParameter={handleAddParameter}
              onRemoveParameter={handleRemoveParameter}
            />

            {/* Clinical Notes */}
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-semibold text-slate-700">
                Clinical Notes
              </h3>
              <p className="mb-2 text-xs text-slate-400">
                Document your clinical rationale and any modifications made to
                the AI-suggested protocol.
              </p>
              <textarea
                value={clinicalNotes}
                onChange={(e) => setClinicalNotes(e.target.value)}
                placeholder="Enter your clinical notes and rationale here..."
                className="min-h-[100px] w-full rounded-md border border-slate-300 bg-white p-3 text-sm text-slate-700 placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                data-testid="clinical-notes"
              />
              <div className="mt-1 text-right text-xs text-slate-400">
                {clinicalNotes.length} characters
              </div>
            </div>

            {/* Safety Checklist */}
            <SafetyChecklist
              items={checklistItems}
              state={checklistState}
              onChange={handleChecklistChange}
            />

            {/* Approval Reason */}
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <label className="mb-1 block text-sm font-semibold text-slate-700">
                Approval Reason{" "}
                <span className="text-red-400">*</span>
              </label>
              <p className="mb-2 text-xs text-slate-400">
                Required. Briefly state your clinical justification for approving
                this protocol.
              </p>
              <textarea
                value={approvalReason}
                onChange={(e) => setApprovalReason(e.target.value)}
                placeholder="e.g., 'Patient has exhausted approved options; evidence grade B supports off-label use...'"
                className="min-h-[60px] w-full rounded-md border border-slate-300 bg-white p-2.5 text-sm text-slate-700 placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                data-testid="approval-reason"
              />
            </div>

            {/* Approval Actions */}
            <div className="sticky bottom-0 rounded-lg border border-slate-200 bg-white p-4 shadow-lg">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {/* Readiness indicators */}
                <div className="flex flex-wrap gap-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                      checklistComplete
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {checklistComplete ? "✓" : "○"} Safety Checks
                  </span>
                  {draft.offLabel && (
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                        offLabelAcknowledged
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {offLabelAcknowledged ? "✓" : "○"} Off-Label Ack
                    </span>
                  )}
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                      approvalReason.trim()
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {approvalReason.trim() ? "✓" : "○"} Reason
                  </span>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => onReject(draft.draftId, "Review abandoned")}
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:bg-slate-50"
                >
                  Cancel Review
                </button>
                <button
                  onClick={handleApprove}
                  disabled={!canApprove}
                  className={`flex-[2] rounded-lg px-4 py-2.5 text-sm font-bold transition-all ${
                    canApprove
                      ? "bg-emerald-600 text-white shadow-md hover:bg-emerald-700"
                      : "cursor-not-allowed bg-slate-200 text-slate-400"
                  }`}
                  data-testid="approve-btn"
                >
                  {!checklistComplete
                    ? `Complete Safety Checks (${Object.values(checklistState).filter(Boolean).length}/${checklistItems.length})`
                    : !approvalReason.trim()
                      ? "Enter Approval Reason"
                      : draft.offLabel && !offLabelAcknowledged
                        ? "Acknowledge Off-Label Warning"
                        : "Approve Protocol"}
                </button>
              </div>
            </div>

            {/* Approval Workflow Timeline */}
            <ApprovalWorkflow
              currentState={workflowState}
              comments={comments}
              versions={versions}
              onStateTransition={handleStateTransition}
              onAddComment={handleAddComment}
              currentUser={currentUser}
            />

            {/* Audit Trail */}
            <AuditTrail entries={auditEntries} protocolId={draft.draftId} />
          </div>
        </section>
      </main>
    </div>
  );
};

export default ProtocolReviewPage;
