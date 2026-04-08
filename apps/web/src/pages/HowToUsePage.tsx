import { useState } from "react";

import { PageHeader } from "../components/ui/PageHeader";

type TabKey = "clinician" | "patient";

type GuideStep = {
  title: string;
  bullets: string[];
};

const clinicianGuide: GuideStep[] = [
  {
    title: "Getting Started",
    bullets: [
      "Register or sign in using your clinician credentials.",
      "Set your role to Clinician from the role switcher in the sidebar.",
      "Complete your profile with your name, specialty, and workplace.",
    ],
  },
  {
    title: "Managing Patients",
    bullets: [
      "Navigate to the Patients page from the left sidebar.",
      "Click Add Patient to create a new patient profile.",
      "Fill in condition, date of birth, and demographic information.",
      "Assign an initial modality and protocol to each patient.",
    ],
  },
  {
    title: "Generating Protocols",
    bullets: [
      "Open the Protocol Generator from the dashboard or sidebar.",
      "Select the target condition, modality, and target device.",
      "Review the evidence grade and clinical rationale displayed.",
      "Generate a protocol draft — review and adjust as needed before prescribing.",
    ],
  },
  {
    title: "Booking Sessions",
    bullets: [
      "Go to the Sessions page using the left navigation.",
      "Click Book New Session to open the booking workflow.",
      "Assign the session to a patient, set date, time, and linked protocol.",
      "Confirm the session — the patient will see it in their upcoming sessions.",
    ],
  },
  {
    title: "Tracking Progress",
    bullets: [
      "The Dashboard shows session counts and completion rates per patient.",
      "Patient cards display a progress bar of completed vs. planned sessions.",
      "Use the Sessions page to review recent outcomes and notes.",
    ],
  },
  {
    title: "Exporting Documents",
    bullets: [
      "Navigate to Handbooks from the sidebar.",
      "Select a condition and document type: Clinician Handbook, Patient Guide, or Technician SOP.",
      "Generate the document and download it as a DOCX file.",
      "Clinical Documents are accessible from the Documents page.",
    ],
  },
];

const patientGuide: GuideStep[] = [
  {
    title: "Your Account",
    bullets: [
      "Sign in using the credentials provided by your clinician or care team.",
      "Your role will be set automatically — you do not need to change it.",
      "Contact your clinician if you have trouble accessing your account.",
    ],
  },
  {
    title: "Your Sessions",
    bullets: [
      "Open the Sessions page to see your upcoming appointments.",
      "Each session card shows the date, time, location, and session number.",
      "Confirmed sessions are shown in green; pending sessions in amber.",
    ],
  },
  {
    title: "Your Protocol",
    bullets: [
      "Your prescribed protocol is visible on your patient profile.",
      "It details the condition being treated, the modality, and the session plan.",
      "Speak to your clinician if you have questions about your protocol.",
    ],
  },
  {
    title: "Your Documents",
    bullets: [
      "Open the Documents page to access your clinical records.",
      "You can download session reports and completed assessment results.",
      "Documents are organised by type: reports, assessments, and letters.",
    ],
  },
  {
    title: "Communicating with your Clinician",
    bullets: [
      "Use the Documents section to view any correspondence from your care team.",
      "Referral letters and clinical correspondence appear under the Letters filter.",
      "For urgent questions, contact your clinician directly outside this platform.",
    ],
  },
];

const CARD_STYLE = {
  background: "var(--bg-elevated)",
  border: "1px solid var(--border)",
  boxShadow: "var(--shadow-sm)",
};

function GuideSection({ step, index }: { step: GuideStep; index: number }) {
  return (
    <div className="rounded-xl p-5 flex gap-4" style={CARD_STYLE}>
      {/* Number badge */}
      <div
        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold mt-0.5"
        style={{ background: "var(--accent-soft)", color: "var(--accent)", border: "1px solid var(--accent-soft-border)" }}
        aria-hidden="true"
      >
        {index + 1}
      </div>

      <div className="flex-1 min-w-0">
        <h3 className="font-display font-semibold text-sm" style={{ color: "var(--text)" }}>
          {step.title}
        </h3>
        <ul className="mt-2.5 flex flex-col gap-1.5">
          {step.bullets.map((bullet, i) => (
            <li key={i} className="flex items-start gap-2 text-xs leading-5">
              <span
                className="mt-1.5 h-1 w-1 rounded-full flex-shrink-0"
                style={{ background: "var(--accent)" }}
                aria-hidden="true"
              />
              <span style={{ color: "var(--text-muted)" }}>{bullet}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function HowToUsePage() {
  const [activeTab, setActiveTab] = useState<TabKey>("clinician");

  const guide = activeTab === "clinician" ? clinicianGuide : patientGuide;

  return (
    <div className="grid gap-7">
      <PageHeader
        icon="📖"
        eyebrow="Guide"
        title="How to Use"
        description="Step-by-step instructions for clinicians and patients using DeepSynaps Protocol Studio."
      />

      {/* Tab switcher */}
      <div
        className="inline-flex gap-1 p-1 rounded-xl self-start"
        style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
        role="tablist"
      >
        {(["clinician", "patient"] as TabKey[]).map((tab) => {
          const isActive = activeTab === tab;
          const label = tab === "clinician" ? "👩‍⚕️ Clinician Guide" : "🙋 Patient Guide";
          return (
            <button
              key={tab}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={
                isActive
                  ? { background: "var(--accent)", color: "white" }
                  : { color: "var(--text-muted)" }
              }
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Intro banner */}
      <div
        className="rounded-xl px-5 py-4"
        style={{ background: "var(--accent-soft)", border: "1px solid var(--accent-soft-border)" }}
      >
        <p className="text-sm font-medium" style={{ color: "var(--accent)" }}>
          {activeTab === "clinician"
            ? "These steps walk you through the core workflows available to clinicians and admins."
            : "This guide explains how to use DeepSynaps Protocol Studio as a patient."}
        </p>
      </div>

      {/* Steps */}
      <div className="grid gap-3 sm:grid-cols-2">
        {guide.map((step, i) => (
          <GuideSection key={step.title} step={step} index={i} />
        ))}
      </div>

      {/* Footer note */}
      <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
        This guide is for informational use within the DeepSynaps Protocol Studio platform. For
        clinical decisions, always consult your clinician or care team.
      </p>
    </div>
  );
}
