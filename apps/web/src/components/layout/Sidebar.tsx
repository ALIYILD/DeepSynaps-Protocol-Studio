import { NavLink } from "react-router-dom";

import { roleProfiles } from "../../data/mockData";
import { useAppState } from "../../app/useAppStore";

const navGroups = [
  {
    label: "Reference",
    items: [
      { to: "/evidence-library", icon: "📚", label: "Evidence Library" },
      { to: "/device-registry", icon: "🖥️", label: "Device Registry" },
      { to: "/brain-regions", icon: "🧠", label: "Brain Regions" },
      { to: "/qeeg-maps", icon: "📊", label: "qEEG Maps" },
    ],
  },
  {
    label: "Clinical Tools",
    items: [
      { to: "/protocols", icon: "⚡", label: "Protocol Generator" },
      { to: "/assessment-builder", icon: "📋", label: "Assessment Builder" },
      { to: "/handbooks", icon: "📄", label: "Handbooks" },
      { to: "/upload-review", icon: "📁", label: "Upload Review" },
    ],
  },
  {
    label: "Account",
    items: [
      { to: "/governance-safety", icon: "🔒", label: "Governance & Safety" },
      { to: "/pricing-access", icon: "💳", label: "Pricing & Access" },
    ],
  },
];

const roleBadgeStyles: Record<string, string> = {
  guest: "bg-[var(--bg-strong)] border border-[var(--border)] text-[var(--text-muted)]",
  clinician: "bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] border border-[var(--sidebar-active-text)]/20",
  admin: "bg-[var(--warning-bg)] text-[var(--warning-text)] border border-[var(--warning-border)]",
};

export function Sidebar() {
  const { role } = useAppState();
  const activeRole = roleProfiles.find((profile) => profile.role === role) ?? roleProfiles[0];

  return (
    <aside
      className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto flex flex-col rounded-[1.5rem] border border-[var(--sidebar-border)]"
      style={{ background: "var(--sidebar-bg)" }}
    >
      {/* Brand area */}
      <div className="px-5 pt-5 pb-4 border-b border-[var(--sidebar-border)]">
        <div className="flex items-center gap-2">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-lg text-white text-xs font-bold flex-shrink-0"
            style={{ background: "var(--accent)" }}
            aria-hidden="true"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="7" cy="7" r="2.5" fill="white" />
              <path d="M7 1.5V4M7 10V12.5M1.5 7H4M10 7H12.5M3.17 3.17L5 5M9 9L10.83 10.83M3.17 10.83L5 9M9 5L10.83 3.17" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </span>
          <div>
            <p className="text-sm font-bold text-[var(--text)] leading-none">DeepSynaps</p>
            <p className="text-xs mt-0.5 leading-none" style={{ color: "var(--accent)" }}>Protocol Studio</p>
          </div>
        </div>
      </div>

      {/* Dashboard link */}
      <div className="px-3 pt-3">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
              isActive
                ? "border-l-2 border-[var(--sidebar-active-text)] pl-[10px] font-medium"
                : "text-[var(--nav-text)] hover:text-[var(--text)]"
            }`
          }
          style={({ isActive }) =>
            isActive
              ? { background: "var(--sidebar-active-bg)", color: "var(--sidebar-active-text)" }
              : {}
          }
        >
          {({ isActive }) => (
            <>
              <span className="text-base leading-none" aria-hidden="true">🏠</span>
              <span className={isActive ? "" : ""}>Dashboard</span>
            </>
          )}
        </NavLink>
      </div>

      {/* Grouped navigation */}
      <nav className="flex-1 px-3 pt-2 pb-3" aria-label="Primary navigation">
        {navGroups.map((group) => (
          <div key={group.label} className="mt-4">
            <p className="px-3 mb-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)] opacity-70">
              {group.label}
            </p>
            <ul className="grid gap-0.5">
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                        isActive
                          ? "border-l-2 border-[var(--sidebar-active-text)] pl-[10px] font-medium"
                          : "text-[var(--nav-text)] hover:text-[var(--text)]"
                      }`
                    }
                    style={({ isActive }) =>
                      isActive
                        ? { background: "var(--sidebar-active-bg)", color: "var(--sidebar-active-text)" }
                        : {}
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span
                          className="text-base leading-none flex-shrink-0"
                          aria-hidden="true"
                          style={isActive ? {} : { filter: "grayscale(0.3) opacity(0.8)" }}
                        >
                          {item.icon}
                        </span>
                        <span>{item.label}</span>
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Role badge */}
      <div className="px-4 py-4 border-t border-[var(--sidebar-border)]">
        <div className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm ${roleBadgeStyles[role] ?? roleBadgeStyles.guest}`}>
          <span className="text-base leading-none" aria-hidden="true">
            {role === "admin" ? "👑" : role === "clinician" ? "🩺" : "👤"}
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{activeRole.label}</p>
            <p className="text-xs opacity-70 truncate">
              {role === "guest" ? "Demo mode" : role === "clinician" ? "Clinical access" : "Full admin access"}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
