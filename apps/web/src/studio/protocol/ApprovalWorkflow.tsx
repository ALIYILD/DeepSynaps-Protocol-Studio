import React, { useState, useCallback } from "react";
import type {
  WorkflowState,
  WorkflowComment,
  ProtocolVersion,
  ClinicalRole,
} from "./protocolTypes";

interface ApprovalWorkflowProps {
  currentState: WorkflowState;
  comments: WorkflowComment[];
  versions: ProtocolVersion[];
  onStateTransition: (toState: WorkflowState, reason: string) => void;
  onAddComment: (message: string) => void;
  currentUser: { name: string; role: ClinicalRole };
}

interface WorkflowStep {
  state: WorkflowState;
  label: string;
  description: string;
  allowedRoles: ClinicalRole[];
  badgeColor: string;
}

const WORKFLOW_STEPS: WorkflowStep[] = [
  {
    state: "draft",
    label: "Draft",
    description: "AI-generated, awaiting review",
    allowedRoles: ["system_ai"],
    badgeColor: "bg-slate-100 text-slate-600",
  },
  {
    state: "under_review",
    label: "Under Review",
    description: "Clinician reviewing protocol",
    allowedRoles: ["reviewing_clinician", "senior_clinician"],
    badgeColor: "bg-purple-100 text-purple-700",
  },
  {
    state: "approved",
    label: "Approved",
    description: "Clinician approved",
    allowedRoles: ["senior_clinician", "prescribing_physician"],
    badgeColor: "bg-emerald-100 text-emerald-700",
  },
  {
    state: "prescribed",
    label: "Prescribed",
    description: "Prescribed to patient",
    allowedRoles: ["prescribing_physician"],
    badgeColor: "bg-cyan-100 text-cyan-700",
  },
  {
    state: "completed",
    label: "Completed",
    description: "Treatment completed",
    allowedRoles: ["prescribing_physician", "administrator"],
    badgeColor: "bg-green-100 text-green-700",
  },
];

const ROLE_LABELS: Record<ClinicalRole, string> = {
  system_ai: "AI System",
  reviewing_clinician: "Reviewing Clinician",
  senior_clinician: "Senior Clinician",
  prescribing_physician: "Prescribing Physician",
  pharmacist: "Pharmacist",
  administrator: "Administrator",
};

/**
 * ApprovalWorkflow — State machine UI with horizontal timeline showing
 * protocol progression through clinical approval states.
 */
export const ApprovalWorkflow: React.FC<ApprovalWorkflowProps> = ({
  currentState,
  comments,
  versions,
  onStateTransition,
  onAddComment,
  currentUser,
}) => {
  const [showRejection, setShowRejection] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [showVersionDropdown, setShowVersionDropdown] = useState(false);
  const [commentText, setCommentText] = useState("");

  const currentIndex = WORKFLOW_STEPS.findIndex(
    (s) => s.state === currentState,
  );

  const canAdvance = useCallback(
    (step: WorkflowStep): boolean => {
      if (currentState === "rejected") return false;
      const idx = WORKFLOW_STEPS.findIndex((s) => s.state === currentState);
      const stepIdx = WORKFLOW_STEPS.findIndex((s) => s.state === step.state);
      return (
        stepIdx === idx + 1 && step.allowedRoles.includes(currentUser.role)
      );
    },
    [currentState, currentUser.role],
  );

  const handleAdvance = useCallback(
    (step: WorkflowStep) => {
      if (!canAdvance(step)) return;
      onStateTransition(step.state, `Advanced to ${step.label}`);
    },
    [canAdvance, onStateTransition],
  );

  const handleReject = useCallback(() => {
    if (!rejectionReason.trim()) return;
    onStateTransition("rejected", rejectionReason);
    setShowRejection(false);
    setRejectionReason("");
  }, [rejectionReason, onStateTransition]);

  const handleComment = useCallback(() => {
    if (!commentText.trim()) return;
    onAddComment(commentText);
    setCommentText("");
  }, [commentText, onAddComment]);

  const stateComments = (state: WorkflowState) =>
    comments.filter((c) => c.state === state);

  return (
    <div
      data-testid="approval-workflow"
      className="rounded-lg border border-slate-200 bg-white shadow-sm"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-800">
            Approval Workflow
          </h3>
          <p className="text-xs text-slate-500">
            Protocol must progress through each stage before prescription
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Version dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowVersionDropdown(!showVersionDropdown)}
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-all hover:bg-slate-50"
              data-testid="version-dropdown-btn"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Version History
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showVersionDropdown && (
              <div
                className="absolute right-0 z-20 mt-1 max-h-60 w-72 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg"
                data-testid="version-dropdown"
              >
                <div className="border-b border-slate-100 px-3 py-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Protocol Versions
                  </span>
                </div>
                {versions.map((v) => (
                  <div
                    key={v.version}
                    className="border-b border-slate-50 px-3 py-2.5 last:border-0 hover:bg-slate-50"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-700">
                        v{v.version}
                      </span>
                      <span className="text-xs text-slate-400">
                        {new Date(v.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {v.changes}
                    </p>
                    <span className="mt-1 inline-block text-xs text-slate-400">
                      by {v.createdBy}
                    </span>
                  </div>
                ))}
                {versions.length === 0 && (
                  <div className="px-3 py-4 text-center text-xs text-slate-400">
                    No previous versions
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Reject button - always available */}
          <button
            onClick={() => setShowRejection(true)}
            className="inline-flex items-center gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-600 transition-all hover:bg-red-100"
            data-testid="reject-btn"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Reject
          </button>
        </div>
      </div>

      {/* Horizontal timeline */}
      <div className="overflow-x-auto p-6">
        <div className="flex min-w-[700px] items-start justify-between">
          {WORKFLOW_STEPS.map((step, index) => {
            const isActive = index <= currentIndex;
            const isCurrent = index === currentIndex;
            const canAdv = canAdvance(step);
            const stepComments = stateComments(step.state);

            return (
              <React.Fragment key={step.state}>
                {/* Step node */}
                <div className="flex flex-col items-center">
                  {/* Circle */}
                  <button
                    onClick={() => handleAdvance(step)}
                    disabled={!canAdv}
                    className={`relative flex h-14 w-14 items-center justify-center rounded-full border-3 text-sm font-bold transition-all ${
                      isCurrent
                        ? "border-blue-500 bg-blue-500 text-white shadow-lg shadow-blue-200"
                        : isActive
                          ? "border-emerald-400 bg-emerald-100 text-emerald-700"
                          : canAdv
                            ? "cursor-pointer border-slate-300 bg-white text-slate-600 hover:border-blue-400 hover:bg-blue-50"
                            : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                    }`}
                    data-testid={`workflow-step-${step.state}`}
                  >
                    {isActive ? (
                      index + 1
                    ) : (
                      <span className="text-xs opacity-50">{index + 1}</span>
                    )}
                    {isCurrent && (
                      <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
                      </span>
                    )}
                  </button>

                  {/* Label */}
                  <span
                    className={`mt-2 text-center text-xs font-semibold ${
                      isCurrent
                        ? "text-blue-700"
                        : isActive
                          ? "text-emerald-700"
                          : "text-slate-400"
                    }`}
                  >
                    {step.label}
                  </span>

                  {/* Description */}
                  <span className="mt-0.5 max-w-[100px] text-center text-[10px] leading-tight text-slate-400">
                    {step.description}
                  </span>

                  {/* Role badges */}
                  <div className="mt-1.5 flex flex-wrap justify-center gap-1">
                    {step.allowedRoles.map((role) => (
                      <span
                        key={role}
                        className={`inline-block rounded-full px-1.5 py-0.5 text-[9px] font-medium ${step.badgeColor}`}
                      >
                        {ROLE_LABELS[role]}
                      </span>
                    ))}
                  </div>

                  {/* Comments indicator */}
                  {stepComments.length > 0 && (
                    <div
                      className="mt-1.5 flex cursor-pointer items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] text-blue-600"
                      data-testid={`step-comments-${step.state}`}
                    >
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                      </svg>
                      {stepComments.length}
                    </div>
                  )}
                </div>

                {/* Connecting line */}
                {index < WORKFLOW_STEPS.length - 1 && (
                  <div className="mx-2 mt-7 flex-1">
                    <div
                      className={`h-1 rounded-full transition-all ${
                        index < currentIndex
                          ? "bg-emerald-400"
                          : "bg-slate-200"
                      }`}
                      style={{ minWidth: "60px" }}
                    />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Rejection panel */}
      {showRejection && (
        <div className="border-t border-red-200 bg-red-50 p-4" data-testid="rejection-panel">
          <div className="mb-3 flex items-center gap-2">
            <svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="text-sm font-bold text-red-700">
              Rejection Reason Required
            </span>
          </div>
          <p className="mb-2 text-xs text-red-600">
            You must provide a reason for rejection. This will be recorded in the
            permanent audit trail.
          </p>
          <textarea
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            placeholder="Enter detailed rejection reason..."
            className="mb-3 w-full rounded-md border border-red-300 bg-white p-2.5 text-sm text-slate-700 placeholder-slate-400 focus:border-red-500 focus:ring-2 focus:ring-red-200"
            rows={3}
            data-testid="rejection-reason"
          />
          <div className="flex gap-2">
            <button
              onClick={() => {
                setShowRejection(false);
                setRejectionReason("");
              }}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={handleReject}
              disabled={!rejectionReason.trim()}
              className={`rounded-md px-4 py-2 text-sm font-bold text-white ${
                rejectionReason.trim()
                  ? "bg-red-600 hover:bg-red-700"
                  : "cursor-not-allowed bg-red-300"
              }`}
              data-testid="confirm-rejection-btn"
            >
              Confirm Rejection
            </button>
          </div>
        </div>
      )}

      {/* Comments thread */}
      <div className="border-t border-slate-200 bg-slate-50/50 p-4">
        <h4 className="mb-3 text-sm font-semibold text-slate-700">
          Comments & Notes
        </h4>

        <div className="mb-4 max-h-48 space-y-3 overflow-y-auto">
          {comments.length === 0 ? (
            <p className="py-2 text-center text-xs text-slate-400">
              No comments yet. Add a note below.
            </p>
          ) : (
            comments.map((comment) => (
              <div
                key={comment.id}
                className="rounded-lg border border-slate-200 bg-white p-3"
                data-testid={`comment-${comment.id}`}
              >
                <div className="mb-1 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-700">
                      {comment.author}
                    </span>
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
                        WORKFLOW_STEPS.find((s) => s.state === comment.state)
                          ?.badgeColor || "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {WORKFLOW_STEPS.find((s) => s.state === comment.state)
                        ?.label || comment.state}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400">
                    {new Date(comment.timestamp).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm text-slate-600">{comment.message}</p>
              </div>
            ))
          )}
        </div>

        {/* Add comment */}
        <div className="flex gap-2">
          <input
            type="text"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleComment()}
            placeholder="Add a comment..."
            className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          />
          <button
            onClick={handleComment}
            disabled={!commentText.trim()}
            className={`rounded-md px-4 py-2 text-sm font-medium ${
              commentText.trim()
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : "cursor-not-allowed bg-slate-200 text-slate-400"
            }`}
          >
            Post
          </button>
        </div>
      </div>
    </div>
  );
};

export default ApprovalWorkflow;
