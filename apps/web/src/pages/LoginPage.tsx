import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAppDispatch } from "../app/useAppStore";
import { loginUser, registerUser } from "../lib/api/services";
import { UserRole } from "../types/domain";

type PortalRole = "clinician" | "admin" | "guest";

interface PortalOption {
  role: PortalRole;
  label: string;
  description: string;
  features: string[];
  icon: React.ReactNode;
  accent: string;
  accentDim: string;
  accentBg: string;
  accentBorder: string;
  glow: string;
}

function IconStethoscope() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6 6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.3.3 0 1 0 .2.3" />
      <path d="M8 15v1a6 6 0 0 0 6 6 6 6 0 0 0 6-6v-4" />
      <circle cx="20" cy="10" r="2" />
    </svg>
  );
}

function IconShield() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function IconUser() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function IconEye({ off }: { off?: boolean }) {
  return off ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconArrowRight() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M3 7.5h9M9 4l3.5 3.5L9 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconArrowLeft() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M12 7.5H3M6 4L2.5 7.5 6 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const PORTALS: PortalOption[] = [
  {
    role: "clinician",
    label: "Doctor / Clinician",
    description: "Full clinical workspace",
    features: ["Protocol builder & evidence library", "Patient assessment tools", "QEEG maps & device registry"],
    icon: <IconStethoscope />,
    accent: "#2dd4bf",
    accentDim: "#0d9488",
    accentBg: "rgba(45,212,191,0.08)",
    accentBorder: "rgba(45,212,191,0.22)",
    glow: "rgba(45,212,191,0.15)",
  },
  {
    role: "admin",
    label: "Administrator",
    description: "Platform management",
    features: ["User & role management", "Content governance & review", "Compliance & safety oversight"],
    icon: <IconShield />,
    accent: "#a78bfa",
    accentDim: "#7c3aed",
    accentBg: "rgba(167,139,250,0.08)",
    accentBorder: "rgba(167,139,250,0.22)",
    glow: "rgba(167,139,250,0.15)",
  },
  {
    role: "guest",
    label: "Client / Patient",
    description: "Personal health portal",
    features: ["View shared protocols", "Personal health resources", "Clinician-shared documents"],
    icon: <IconUser />,
    accent: "#60a5fa",
    accentDim: "#2563eb",
    accentBg: "rgba(96,165,250,0.08)",
    accentBorder: "rgba(96,165,250,0.22)",
    glow: "rgba(96,165,250,0.15)",
  },
];

function PasswordInput({
  id,
  value,
  onChange,
  placeholder,
  autoComplete,
  minLength,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  minLength?: number;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? "text" : "password"}
        required
        autoComplete={autoComplete}
        minLength={minLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "••••••••"}
        className="w-full rounded-xl px-4 py-3 pr-11 text-sm outline-none transition"
        style={{
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.1)",
          color: "#f1f5f9",
        }}
        onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)")}
        onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)")}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow((s) => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
        style={{ color: "#475569" }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#94a3b8")}
        onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#475569")}
      >
        <IconEye off={show} />
      </button>
    </div>
  );
}

function TextInput({
  id,
  type = "text",
  value,
  onChange,
  placeholder,
  autoComplete,
  required = true,
}: {
  id: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
}) {
  return (
    <input
      id={id}
      type={type}
      required={required}
      autoComplete={autoComplete}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-xl px-4 py-3 text-sm outline-none transition"
      style={{
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.1)",
        color: "#f1f5f9",
      }}
      onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)")}
      onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)")}
    />
  );
}

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
    setEmail(""); setPassword(""); setDisplayName(""); setError(null);
  }

  function goBack() {
    setSelectedPortal(null); setError(null);
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
    e.preventDefault(); setError(null); setLoading(true);
    try { applyAuthResult(await loginUser({ email, password })); }
    catch (err) { setError(err instanceof Error ? err.message : "Sign in failed."); }
    finally { setLoading(false); }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault(); setError(null); setLoading(true);
    try { applyAuthResult(await registerUser({ email, display_name: displayName, password })); }
    catch (err) { setError(err instanceof Error ? err.message : "Registration failed."); }
    finally { setLoading(false); }
  }

  const p = selectedPortal;

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-14 relative overflow-hidden"
      style={{ background: "#080f1a" }}
    >
      {/* Background glow orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full opacity-20"
          style={{ background: "radial-gradient(circle, #0d9488 0%, transparent 70%)", filter: "blur(60px)" }} />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full opacity-15"
          style={{ background: "radial-gradient(circle, #7c3aed 0%, transparent 70%)", filter: "blur(60px)" }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-5"
          style={{ background: "radial-gradient(circle, #2563eb 0%, transparent 60%)", filter: "blur(80px)" }} />
        {/* Grid lines */}
        <svg className="absolute inset-0 w-full h-full opacity-[0.03]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
              <path d="M 48 0 L 0 0 0 48" fill="none" stroke="white" strokeWidth="0.5"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      {/* Logo + title */}
      <div className="relative mb-10 text-center">
        <div className="inline-flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-lg"
            style={{ background: "linear-gradient(135deg, #0d9488, #2dd4bf)", color: "#fff", boxShadow: "0 0 20px rgba(45,212,191,0.35)" }}>
            DS
          </div>
          <div className="text-left">
            <div className="text-xs font-semibold uppercase tracking-[0.25em]" style={{ color: "#2dd4bf" }}>DeepSynaps</div>
            <div className="text-[10px] uppercase tracking-widest" style={{ color: "#334155" }}>Protocol Studio</div>
          </div>
        </div>
        <h1 className="text-3xl font-bold text-white leading-tight mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          Clinical Neuromodulation<br />
          <span style={{ color: "#2dd4bf" }}>Intelligence Platform</span>
        </h1>
        <p className="text-sm" style={{ color: "#475569" }}>
          {p ? `${p.label} portal` : "Choose your access portal to continue"}
        </p>
      </div>

      {!p ? (
        /* ── Portal selection ── */
        <div className="relative w-full max-w-3xl">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {PORTALS.map((portal) => (
              <button
                key={portal.role}
                type="button"
                onClick={() => selectPortal(portal)}
                className="group text-left rounded-2xl p-6 transition-all duration-300 focus-visible:outline-none"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLButtonElement;
                  el.style.background = portal.accentBg;
                  el.style.borderColor = portal.accentBorder;
                  el.style.boxShadow = `0 8px 32px ${portal.glow}, 0 2px 8px rgba(0,0,0,0.4)`;
                  el.style.transform = "translateY(-4px)";
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLButtonElement;
                  el.style.background = "rgba(255,255,255,0.03)";
                  el.style.borderColor = "rgba(255,255,255,0.07)";
                  el.style.boxShadow = "0 1px 3px rgba(0,0,0,0.4)";
                  el.style.transform = "translateY(0)";
                }}
              >
                {/* Icon */}
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-5 transition-all duration-300"
                  style={{ background: portal.accentBg, border: `1px solid ${portal.accentBorder}`, color: portal.accent }}>
                  {portal.icon}
                </div>

                {/* Title */}
                <h3 className="text-sm font-semibold text-white mb-0.5">{portal.label}</h3>
                <p className="text-xs mb-4" style={{ color: portal.accent }}>{portal.description}</p>

                {/* Features */}
                <ul className="grid gap-2 mb-5">
                  {portal.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs" style={{ color: "#64748b" }}>
                      <span className="mt-0.5 flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center"
                        style={{ background: portal.accentBg, color: portal.accent }}>
                        <IconCheck />
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <div className="flex items-center gap-1.5 text-xs font-medium transition-all duration-200 group-hover:gap-2.5"
                  style={{ color: portal.accent }}>
                  Sign in to portal
                  <IconArrowRight />
                </div>
              </button>
            ))}
          </div>

          {/* Trust strip */}
          <div className="mt-10 flex items-center justify-center gap-6 flex-wrap">
            {["HIPAA Aligned", "256-bit Encryption", "Clinical Grade"].map((label) => (
              <span key={label} className="flex items-center gap-1.5 text-xs" style={{ color: "#334155" }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#1e3a4c" }} />
                {label}
              </span>
            ))}
          </div>
        </div>
      ) : (
        /* ── Login / Register form ── */
        <div className="relative w-full max-w-sm">
          {/* Back nav */}
          <button
            type="button"
            onClick={goBack}
            className="flex items-center gap-2 text-xs mb-6 transition-all duration-200 focus-visible:outline-none"
            style={{ color: "#475569" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#94a3b8")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#475569")}
          >
            <IconArrowLeft />
            Back to portals
          </button>

          {/* Card */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: `1px solid ${p.accentBorder}`,
              boxShadow: `0 0 40px ${p.glow}, 0 8px 32px rgba(0,0,0,0.5)`,
            }}
          >
            {/* Card header */}
            <div className="px-6 pt-6 pb-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: p.accentBg, border: `1px solid ${p.accentBorder}`, color: p.accent }}>
                  {p.icon}
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">{p.label}</div>
                  <div className="text-xs" style={{ color: p.accent }}>{p.description}</div>
                </div>
              </div>
            </div>

            <div className="p-6">
              {/* Tab switcher (not for admin) */}
              {p.role !== "admin" && (
                <div className="flex rounded-xl p-1 mb-5"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  {(["login", "register"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => { setTab(t); setError(null); }}
                      className="flex-1 rounded-lg py-2 text-xs font-semibold transition-all duration-200 focus-visible:outline-none"
                      style={
                        tab === t
                          ? { background: p.accentBg, color: p.accent, border: `1px solid ${p.accentBorder}` }
                          : { color: "#475569", border: "1px solid transparent" }
                      }
                    >
                      {t === "login" ? "Sign In" : "Create Account"}
                    </button>
                  ))}
                </div>
              )}

              {tab === "login" || p.role === "admin" ? (
                <form onSubmit={handleLogin} className="grid gap-4">
                  <div className="grid gap-1.5">
                    <label htmlFor="l-email" className="text-xs font-medium" style={{ color: "#94a3b8" }}>
                      Email address
                    </label>
                    <TextInput id="l-email" type="email" value={email} onChange={setEmail}
                      placeholder="you@clinic.com" autoComplete="email" />
                  </div>

                  <div className="grid gap-1.5">
                    <label htmlFor="l-pass" className="text-xs font-medium" style={{ color: "#94a3b8" }}>
                      Password
                    </label>
                    <PasswordInput id="l-pass" value={password} onChange={setPassword}
                      autoComplete="current-password" />
                  </div>

                  {error && (
                    <div className="flex items-start gap-2.5 rounded-xl px-4 py-3 text-xs"
                      style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", color: "#fca5a5" }}>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="flex-shrink-0 mt-0.5">
                        <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.4"/>
                        <path d="M7 4v3M7 9.5v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                      </svg>
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 rounded-xl text-sm font-semibold transition-all duration-200 disabled:opacity-50 mt-1"
                    style={{
                      background: `linear-gradient(135deg, ${p.accentDim}, ${p.accent})`,
                      color: "#fff",
                      boxShadow: `0 4px 16px ${p.glow}`,
                    }}
                    onMouseEnter={(e) => !loading && ((e.currentTarget as HTMLButtonElement).style.opacity = "0.9")}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.opacity = "1")}
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin" width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <circle cx="7" cy="7" r="5" stroke="rgba(255,255,255,0.3)" strokeWidth="2"/>
                          <path d="M7 2a5 5 0 0 1 5 5" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                        </svg>
                        Signing in…
                      </span>
                    ) : "Sign In"}
                  </button>

                  {p.role !== "admin" && (
                    <p className="text-center text-xs" style={{ color: "#334155" }}>
                      No account?{" "}
                      <button type="button"
                        onClick={() => { setTab("register"); setError(null); }}
                        className="font-semibold hover:underline focus-visible:outline-none"
                        style={{ color: p.accent }}>
                        Create one
                      </button>
                    </p>
                  )}
                </form>
              ) : (
                <form onSubmit={handleRegister} className="grid gap-4">
                  <div className="grid gap-1.5">
                    <label htmlFor="r-email" className="text-xs font-medium" style={{ color: "#94a3b8" }}>Email address</label>
                    <TextInput id="r-email" type="email" value={email} onChange={setEmail}
                      placeholder="you@example.com" autoComplete="email" />
                  </div>

                  <div className="grid gap-1.5">
                    <label htmlFor="r-name" className="text-xs font-medium" style={{ color: "#94a3b8" }}>Display name</label>
                    <TextInput id="r-name" value={displayName} onChange={setDisplayName}
                      placeholder={p.role === "clinician" ? "Dr. Jane Smith" : "Full name"} autoComplete="name" />
                  </div>

                  <div className="grid gap-1.5">
                    <label htmlFor="r-pass" className="text-xs font-medium" style={{ color: "#94a3b8" }}>Password</label>
                    <PasswordInput id="r-pass" value={password} onChange={setPassword}
                      autoComplete="new-password" minLength={8} placeholder="Min. 8 characters" />
                  </div>

                  {error && (
                    <div className="flex items-start gap-2.5 rounded-xl px-4 py-3 text-xs"
                      style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", color: "#fca5a5" }}>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="flex-shrink-0 mt-0.5">
                        <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.4"/>
                        <path d="M7 4v3M7 9.5v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                      </svg>
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 rounded-xl text-sm font-semibold transition-all duration-200 disabled:opacity-50 mt-1"
                    style={{
                      background: `linear-gradient(135deg, ${p.accentDim}, ${p.accent})`,
                      color: "#fff",
                      boxShadow: `0 4px 16px ${p.glow}`,
                    }}
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin" width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <circle cx="7" cy="7" r="5" stroke="rgba(255,255,255,0.3)" strokeWidth="2"/>
                          <path d="M7 2a5 5 0 0 1 5 5" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                        </svg>
                        Creating account…
                      </span>
                    ) : "Create Account"}
                  </button>

                  <p className="text-center text-xs" style={{ color: "#334155" }}>
                    Already have an account?{" "}
                    <button type="button"
                      onClick={() => { setTab("login"); setError(null); }}
                      className="font-semibold hover:underline focus-visible:outline-none"
                      style={{ color: p.accent }}>
                      Sign in
                    </button>
                  </p>
                </form>
              )}
            </div>
          </div>

          <p className="mt-5 text-center text-xs" style={{ color: "#1e293b" }}>
            Secure · Encrypted · Clinical grade
          </p>
        </div>
      )}
    </div>
  );
}
