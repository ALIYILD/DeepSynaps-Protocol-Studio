import { NavLink } from "react-router-dom";

import { roleProfiles } from "../../data/mockData";
import { useAppState } from "../../app/useAppStore";

const navItems = [
  {
    group: null,
    items: [
      { to: "/", end: true, icon: "🏠", label: "Dashboard" },
      { to: "/patients", icon: "👥", label: "Patients" },
    ],
  },
  {
    group: "Clinical Tools",
    items: [
      { to: "/protocols", icon: "⚡", label: "Protocol Generator" },
      { to: "/assessment-builder", icon: "📋", label: "Assessment Generator" },
      { to: "/how-to-use", icon: "📖", label: "How to Use" },
      { to: "/sessions", icon: "📅", label: "Sessions & Calendar" },
      { to: "/documents", icon: "📁", label: "Documents" },
    ],
  },
  {
    group: "Reference",
    items: [
      { to: "/evidence-library", icon: "📚", label: "Evidence Library" },
      { to: "/device-registry", icon: "🖥️", label: "Device Registry" },
      { to: "/brain-regions", icon: "🧠", label: "Brain Regions" },
      { to: "/qeeg-maps", icon: "📊", label: "qEEG Maps" },
    ],
  },
  {
    group: "Account",
    items: [
      { to: "/settings", icon: "⚙️", label: "Settings" },
      { to: "/governance-safety", icon: "🔒", label: "Governance & Safety" },
      { to: "/pricing-access", icon: "💳", label: "Pricing & Access" },
    ],
  },
];

const roleConfig: Record<string, { icon: string; color: string }> = {
  guest:     { icon: "👤", color: "bg-slate-700/60 text-slate-300 border border-slate-600/40" },
  clinician: { icon: "🩺", color: "bg-teal-900/60 text-teal-300 border border-teal-700/40" },
  admin:     { icon: "👑", color: "bg-amber-900/60 text-amber-300 border border-amber-700/40" },
};

function SidebarLink({ to, icon, label, end }: { to: string; icon: string; label: string; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      style={({ isActive }) =>
        isActive
          ? {
              background: "var(--sidebar-active-bg)",
              color: "var(--sidebar-active-text)",
              borderLeft: "2px solid var(--sidebar-active-border)",
              paddingLeft: "10px",
            }
          : { color: "var(--sidebar-text)" }
      }
    >
      {({ isActive }) => (
        <>
          <span
            className="text-base leading-none flex-shrink-0"
            aria-hidden="true"
            style={isActive ? {} : { filter: "grayscale(0.4) opacity(0.65)" }}
          >
            {icon}
          </span>
          <span className="truncate">{label}</span>
        </>
      )}
    </NavLink>
  );
}

export function Sidebar() {
  const { role } = useAppState();
  const activeRole = roleProfiles.find((p) => p.role === role) ?? roleProfiles[0];
  const rc = roleConfig[role] ?? roleConfig.guest;

  return (
    <aside
      className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto flex flex-col rounded-2xl"
      style={{ background: "var(--sidebar-bg)", border: "1px solid var(--sidebar-border)" }}
    >
      {/* Brand */}
      <div className="px-5 pt-5 pb-4" style={{ borderBottom: "1px solid var(--sidebar-border)" }}>
        <div className="flex items-center gap-3">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0"
            style={{ background: "var(--accent)" }}
            aria-hidden="true"
          >
            <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="2.5" fill="white" />
              <path d="M7 1.5V4M7 10V12.5M1.5 7H4M10 7H12.5M3.17 3.17L5 5M9 9L10.83 10.83M3.17 10.83L5 9M9 5L10.83 3.17" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </span>
          <div>
            <p className="text-sm font-semibold text-white leading-tight" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
              DeepSynaps
            </p>
            <p className="text-xs leading-tight mt-0.5" style={{ color: "var(--accent)" }}>Protocol Studio</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-3 overflow-y-auto" aria-label="Primary navigation">
        {navItems.map((section, i) => (
          <div key={i} className={section.group ? "mt-5" : ""}>
            {section.group && (
              <p
                className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest"
                style={{ color: "var(--sidebar-group-label)" }}
              >
                {section.group}
              </p>
            )}
            <ul className="grid gap-0.5">
              {section.items.map((item) => (
                <li key={item.to}>
                  <SidebarLink
                    to={item.to}
                    icon={item.icon}
                    label={item.label}
                    end={"end" in item ? item.end : undefined}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Role pill */}
      <div className="px-4 py-4" style={{ borderTop: "1px solid var(--sidebar-border)" }}>
        <div className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm ${rc.color}`}>
          <span className="text-base leading-none flex-shrink-0" aria-hidden="true">{rc.icon}</span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold leading-tight truncate">{activeRole.label}</p>
            <p className="text-xs opacity-60 truncate mt-0.5">
              {role === "guest" ? "Demo mode" : role === "clinician" ? "Clinical access" : "Full admin access"}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
