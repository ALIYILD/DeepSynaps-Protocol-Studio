import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAppDispatch } from "../app/useAppStore";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { loginUser, registerUser } from "../lib/api/services";
import { UserRole } from "../types/domain";

type PortalRole = "clinician" | "admin" | "guest";

interface PortalOption {
  role: PortalRole;
  label: string;
  subtitle: string;
  icon: string;
  accent: string;
  accentBg: string;
  accentBorder: string;
}

const PORTALS: PortalOption[] = [
  {
    role: "clinician",
    label: "Doctor / Clinician",
    subtitle: "Access protocols, assessments & evidence library",
    icon: "🩺",
    accent: "#0d9488",
    accentBg: "rgba(13,148,136,0.08)",
    accentBorder: "rgba(13,148,136,0.25)",
  },
  {
    role: "admin",
    label: "Administrator",
    subtitle: "Manage users, content & platform governance",
    icon: "🛡️",
    accent: "#7c3aed",
    accentBg: "rgba(124,58,237,0.08)",
    accentBorder: "rgba(124,58,237,0.25)",
  },
  {
    role: "guest",
    label: "Client / Patient",
    subtitle: "View shared protocols & personal health resources",
    icon: "👤",
    accent: "#0284c7",
    accentBg: "rgba(2,132,199,0.08)",
    accentBorder: "rgba(2,132,199,0.25)",
  },
];

const INPUT_CLASS =
  "w-full rounded-xl border border-[var(--border)] bg-[var(--bg-strong)] px-4 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] transition";

export default function LoginPage() {
  const [selectedPortal, setSelectedPortal] = useState<PortalOption | null>(null);
  const [tab, setTab] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  function selectPortal(portal: PortalOption) {
    setSelectedPortal(portal);
    setTab("login");
    setEmail("");
    setPassword("");
    setDisplayName("");
    setError(null);
  }

  function goBack() {
    setSelectedPortal(null);
    setError(null);
  }

  function applyAuthResult(result: {
    access_token: string;
    refresh_token: string;
    user: { role: string; display_name: string };
  }) {
    localStorage.setItem("access_token", result.access_token);
    localStorage.setItem("refresh_token", result.refresh_token);
    localStorage.setItem("jwt_display_name", result.user.display_name);

    const role = result.user.role as UserRole;
    if (role === "guest" || role === "clinician" || role === "admin") {
      dispatch({ type: "set_role", role });
    }

    navigate("/");
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await loginUser({ email, password });
      applyAuthResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await registerUser({ email, display_name: displayName, password });
      applyAuthResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setLoading(false);
    }
  }

  const portal = selectedPortal;

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={{ background: "linear-gradient(135deg, #0f1928 0%, #0f2235 50%, #0d1f2d 100%)" }}
    >
      {/* Header */}
      <div className="mb-10 text-center">
        <div className="inline-flex items-center gap-2 mb-4">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-lg font-bold"
            style={{ background: "rgba(13,148,136,0.2)", border: "1px solid rgba(13,148,136,0.4)", color: "#2dd4bf" }}
          >
            D
          </div>
          <span className="text-xs uppercase tracking-[0.3em] font-semibold" style={{ color: "#2dd4bf" }}>
            DeepSynaps Studio
          </span>
        </div>
        <h1 className="text-3xl font-bold text-white mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          Clinical Neuromodulation Platform
        </h1>
        <p className="text-sm" style={{ color: "#64748b" }}>
          Select your portal to continue
        </p>
      </div>

      {!portal ? (
        /* Role selection */
        <div className="w-full max-w-3xl">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {PORTALS.map((p) => (
              <button
                key={p.role}
                type="button"
                onClick={() => selectPortal(p)}
                className="group text-left rounded-2xl p-6 transition-all duration-200 hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: `1px solid rgba(255,255,255,0.08)`,
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = p.accentBg;
                  (e.currentTarget as HTMLButtonElement).style.borderColor = p.accentBorder;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)";
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.08)";
                }}
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl mb-4"
                  style={{ background: p.accentBg, border: `1px solid ${p.accentBorder}` }}
                >
                  {p.icon}
                </div>
                <h3 className="text-base font-semibold text-white mb-1">{p.label}</h3>
                <p className="text-xs leading-relaxed" style={{ color: "#64748b" }}>
                  {p.subtitle}
                </p>
                <div
                  className="mt-5 flex items-center gap-1 text-xs font-medium"
                  style={{ color: p.accent }}
                >
                  Sign in
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="transition-transform group-hover:translate-x-0.5">
                    <path d="M3 7h8M8 4l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </button>
            ))}
          </div>

          <p className="mt-8 text-center text-xs" style={{ color: "#334155" }}>
            Secure clinical platform · All data encrypted in transit
          </p>
        </div>
      ) : (
        /* Login / Register form */
        <div className="w-full max-w-md">
          {/* Back + portal badge */}
          <div className="flex items-center gap-3 mb-6">
            <button
              type="button"
              onClick={goBack}
              className="flex items-center gap-1.5 text-sm transition-colors focus-visible:outline-none"
              style={{ color: "#64748b" }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#94a3b8")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#64748b")}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              All portals
            </button>
            <span style={{ color: "#1e293b" }}>·</span>
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium"
              style={{ background: portal.accentBg, border: `1px solid ${portal.accentBorder}`, color: portal.accent }}
            >
              <span>{portal.icon}</span>
              {portal.label}
            </span>
          </div>

          <div
            className="rounded-2xl p-6"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}
          >
            {/* Tab switcher — hide register for admin */}
            {portal.role !== "admin" && (
              <div
                className="flex rounded-xl p-1 mb-6"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)" }}
              >
                {(["login", "register"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => { setTab(t); setError(null); }}
                    className="flex-1 rounded-lg py-2 text-sm font-medium transition focus-visible:outline-none"
                    style={
                      tab === t
                        ? { background: portal.accentBg, color: portal.accent, border: `1px solid ${portal.accentBorder}` }
                        : { color: "#64748b" }
                    }
                  >
                    {t === "login" ? "Sign In" : "Create Account"}
                  </button>
                ))}
              </div>
            )}

            {tab === "login" || portal.role === "admin" ? (
              <form onSubmit={handleLogin} className="grid gap-4">
                <div className="grid gap-1.5">
                  <label htmlFor="login-email" className="text-sm font-medium" style={{ color: "#cbd5e1" }}>
                    Email
                  </label>
                  <input
                    id="login-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={INPUT_CLASS}
                    style={{ background: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.1)", color: "#f1f5f9" }}
                    placeholder="you@example.com"
                  />
                </div>

                <div className="grid gap-1.5">
                  <label htmlFor="login-password" className="text-sm font-medium" style={{ color: "#cbd5e1" }}>
                    Password
                  </label>
                  <input
                    id="login-password"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={INPUT_CLASS}
                    style={{ background: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.1)", color: "#f1f5f9" }}
                    placeholder="••••••••"
                  />
                </div>

                {error && (
                  <p className="rounded-xl px-4 py-2.5 text-sm" style={{ background: "#450a0a", border: "1px solid #7f1d1d", color: "#fca5a5" }}>
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-1 py-2.5 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-60"
                  style={{ background: portal.accent, color: "#fff" }}
                >
                  {loading ? "Signing in..." : "Sign In"}
                </button>

                {portal.role !== "admin" && (
                  <p className="text-center text-sm" style={{ color: "#475569" }}>
                    No account?{" "}
                    <button
                      type="button"
                      onClick={() => { setTab("register"); setError(null); }}
                      className="font-medium hover:underline focus-visible:outline-none"
                      style={{ color: portal.accent }}
                    >
                      Create Account
                    </button>
                  </p>
                )}
              </form>
            ) : (
              <form onSubmit={handleRegister} className="grid gap-4">
                <div className="grid gap-1.5">
                  <label htmlFor="reg-email" className="text-sm font-medium" style={{ color: "#cbd5e1" }}>
                    Email
                  </label>
                  <input
                    id="reg-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={INPUT_CLASS}
                    style={{ background: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.1)", color: "#f1f5f9" }}
                    placeholder="you@example.com"
                  />
                </div>

                <div className="grid gap-1.5">
                  <label htmlFor="reg-display-name" className="text-sm font-medium" style={{ color: "#cbd5e1" }}>
                    Display name
                  </label>
                  <input
                    id="reg-display-name"
                    type="text"
                    required
                    autoComplete="name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className={INPUT_CLASS}
                    style={{ background: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.1)", color: "#f1f5f9" }}
                    placeholder={portal.role === "clinician" ? "Dr. Jane Smith" : "Full name"}
                  />
                </div>

                <div className="grid gap-1.5">
                  <label htmlFor="reg-password" className="text-sm font-medium" style={{ color: "#cbd5e1" }}>
                    Password
                  </label>
                  <input
                    id="reg-password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={INPUT_CLASS}
                    style={{ background: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.1)", color: "#f1f5f9" }}
                    placeholder="Min. 8 characters"
                  />
                  <p className="text-xs" style={{ color: "#475569" }}>Minimum 8 characters</p>
                </div>

                {error && (
                  <p className="rounded-xl px-4 py-2.5 text-sm" style={{ background: "#450a0a", border: "1px solid #7f1d1d", color: "#fca5a5" }}>
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-1 py-2.5 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-60"
                  style={{ background: portal.accent, color: "#fff" }}
                >
                  {loading ? "Creating account..." : "Create Account"}
                </button>
              </form>
            )}
          </div>

          <p className="mt-4 text-center text-xs" style={{ color: "#334155" }}>
            Secure clinical platform · All data encrypted in transit
          </p>
        </div>
      )}
    </div>
  );
}
