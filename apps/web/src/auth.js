import { api } from './api.js';
import { mountSalesChatWidget, mountAppAgentWidget } from './ui_chat_widget.js';

export let currentUser = null;

export function setCurrentUser(u) { currentUser = u; }

export function updateUserBar() {
  if (!currentUser) return;
  const av = document.getElementById('user-avatar');
  const nm = document.getElementById('user-name');
  const rl = document.getElementById('user-role');
  if (av) av.textContent = (currentUser.display_name || currentUser.email || '?').slice(0, 2).toUpperCase();
  if (nm) nm.innerHTML = `${currentUser.display_name || currentUser.email}&nbsp;<span style="font-size:9px;text-transform:uppercase;letter-spacing:.8px;padding:2px 6px;border-radius:3px;background:rgba(0,212,188,0.1);color:var(--teal);font-weight:600;vertical-align:middle">${currentUser.role || 'guest'}</span>`;
  if (rl) rl.textContent = `${currentUser.role || 'guest'} · ${currentUser.package_id || 'explorer'}`;
}

export function showApp() {
  document.getElementById('login-overlay').classList.remove('visible');
  document.getElementById('public-shell')?.classList.remove('visible');
  document.getElementById('patient-shell')?.classList.remove('visible');
  document.getElementById('sidebar').classList.add('visible');
  document.getElementById('app-shell').classList.add('visible');
  // Agent widget removed — use sidebar AI Agents page instead
}

export function showPublic() {
  document.getElementById('login-overlay').classList.remove('visible');
  document.getElementById('sidebar').classList.remove('visible');
  document.getElementById('app-shell').classList.remove('visible');
  document.getElementById('patient-shell')?.classList.remove('visible');
  document.getElementById('public-shell')?.classList.add('visible');
  try { mountSalesChatWidget(); } catch {}
}

export function showPatient() {
  document.getElementById('login-overlay').classList.remove('visible');
  document.getElementById('public-shell')?.classList.remove('visible');
  document.getElementById('sidebar').classList.remove('visible');
  document.getElementById('app-shell').classList.remove('visible');
  document.getElementById('patient-shell')?.classList.add('visible');
  try { mountAppAgentWidget('patient'); } catch {}
}

export function updatePatientBar() {
  if (!currentUser) return;
  const av = document.getElementById('pt-avatar');
  const nm = document.getElementById('pt-name');
  const rl = document.getElementById('pt-role');
  if (av) av.textContent = (currentUser.display_name || currentUser.email || '?').slice(0, 2).toUpperCase();
  if (nm) nm.textContent = currentUser.display_name || currentUser.email;
  if (rl) rl.textContent = 'Patient Portal';
}

export function showLogin() {
  document.getElementById('sidebar').classList.remove('visible');
  document.getElementById('app-shell').classList.remove('visible');
  document.getElementById('patient-shell')?.classList.remove('visible');
  // Leave public-shell as-is — the overlay (z-index 1000) covers it
  const overlay = document.getElementById('login-overlay');
  overlay.classList.add('visible');
  overlay.innerHTML = renderLoginPage();
  // Auto-show reset form if URL has reset_token param
  const resetToken = new URLSearchParams(window.location.search).get('reset_token');
  if (resetToken) {
    setTimeout(() => window.switchAuthTab('reset'), 0);
  }
}

export function doLogout() {
  api.logout().catch(() => {});
  api.clearToken();
  window._sseSource?.close();
  window._clearPaletteCache?.();
  sessionStorage.removeItem('ds_pat_selected_id');
  sessionStorage.removeItem('ds_patient_roster');
  currentUser = null;
  document.getElementById('sidebar').classList.remove('visible');
  document.getElementById('app-shell').classList.remove('visible');
  document.getElementById('patient-shell')?.classList.remove('visible');
  document.getElementById('login-overlay').classList.remove('visible');
  const pub = document.getElementById('public-shell');
  if (pub) { pub.classList.add('visible'); window._navPublic?.('home'); }
  else { showLogin(); }
}
window.doLogout = doLogout;

// ── Session-expired handler ───────────────────────────────────────────────────
function _showSessionExpiredNotice() {
  document.getElementById('session-expired-notice')?.remove();
  const el = document.createElement('div');
  el.id = 'session-expired-notice';
  el.className = 'session-expired-notice';
  el.innerHTML = `
    <span class="session-expired-icon">🔒</span>
    <span class="session-expired-text">Your session has expired. Redirecting to login…</span>
  `;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

window._handleSessionExpired = function() {
  const intended = location.hash.replace('#', '') || 'dashboard';
  if (intended !== 'login' && intended !== 'home') {
    sessionStorage.setItem('ds_intended_destination', intended);
  }
  api.clearToken();
  currentUser = null;
  _showSessionExpiredNotice();
  setTimeout(() => {
    window._401InFlight = false;
    // Close any open shells and return to public landing
    document.getElementById('sidebar')?.classList.remove('visible');
    document.getElementById('app-shell')?.classList.remove('visible');
    document.getElementById('patient-shell')?.classList.remove('visible');
    document.getElementById('login-overlay')?.classList.remove('visible');
    window._navPublic?.('home');
  }, 1500);
};

// ── isAuthenticated (synchronous) ─────────────────────────────────────────────
window._isAuthenticated = function() {
  // Allow demo sessions that set currentUser directly (dev mode or VITE_ENABLE_DEMO)
  const _demoOk = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO === '1';
  if (_demoOk && currentUser) return true;
  return !!api.getToken();
};

function renderLoginPage() {
  _injectAuthDv2Styles();
  return `<div class="dv2-auth-wrap">
    <aside class="dv2-auth-aside">
      <div class="dv2-auth-brand">
        <div class="dv2-auth-mark">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M8 3a4 4 0 0 0-4 4v10a4 4 0 0 0 4 4h8a4 4 0 0 0 4-4V7a4 4 0 0 0-4-4H8Z" stroke="#04121c" stroke-width="1.8"/>
            <path d="M12 3v18M7 8h2M15 8h2M7 12h2M15 12h2M7 16h2M15 16h2" stroke="#04121c" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </div>
        <div>
          <div class="dv2-auth-brand-name">DeepSynaps</div>
          <div class="dv2-auth-brand-sub">Studio · Clinical OS</div>
        </div>
      </div>

      <div class="dv2-auth-hero">
        <div class="dv2-auth-kicker">Built for clinicians</div>
        <div class="dv2-auth-headline">Clinical OS for <em>neuromodulation</em> practices.</div>
        <div class="dv2-auth-quote">
          <p>"We replaced three tools with Studio in a weekend. Protocols, assessments, and the patient portal now live in one schema — <em>our evidence trail writes itself.</em>"</p>
          <div class="dv2-auth-quote-attrib">— Dr. M. Patel · Clinical Director, Clearmind Clinic</div>
        </div>
      </div>

      <svg class="dv2-auth-bg-svg" viewBox="0 0 400 400" fill="none" aria-hidden="true">
        <circle cx="200" cy="200" r="160" stroke="rgba(0,212,188,0.18)" stroke-width="1"/>
        <circle cx="200" cy="200" r="120" stroke="rgba(0,212,188,0.10)" stroke-width="1" stroke-dasharray="4,4"/>
        <circle cx="200" cy="200" r="80" stroke="rgba(0,212,188,0.08)" stroke-width="1"/>
        <g fill="rgba(0,212,188,0.55)">
          <circle cx="152" cy="117" r="3"/><circle cx="248" cy="117" r="3"/>
          <circle cx="80" cy="117" r="3"/><circle cx="200" cy="112" r="3"/>
          <circle cx="320" cy="117" r="3"/><circle cx="272" cy="117" r="3"/>
          <circle cx="128" cy="200" r="3"/><circle cx="200" cy="200" r="3"/>
          <circle cx="272" cy="200" r="3"/><circle cx="56"  cy="200" r="3"/>
          <circle cx="344" cy="200" r="3"/><circle cx="152" cy="283" r="3"/>
          <circle cx="248" cy="283" r="3"/><circle cx="200" cy="288" r="3"/>
          <circle cx="320" cy="283" r="3"/><circle cx="80"  cy="283" r="3"/>
        </g>
      </svg>
    </aside>

    <main class="dv2-auth-main">
      <div class="dv2-auth-card">
        <div id="auth-tabs" class="dv2-auth-tabs" role="tablist">
          <button id="tab-login"    class="dv2-auth-tab active" onclick="switchAuthTab('login')">Sign In</button>
          <button id="tab-register" class="dv2-auth-tab"        onclick="switchAuthTab('register')">Create Account</button>
          <button id="tab-demo"     class="dv2-auth-tab"        onclick="switchAuthTab('demo')">Demo Access</button>
        </div>

        <!-- ───────── SIGN IN ───────── -->
        <div id="login-form">
          <div class="dv2-auth-title">Welcome back.</div>
          <div class="dv2-auth-sub">Sign in to access your clinic workspace, patient portal, or admin console.</div>

          <div class="dv2-auth-role-picker">
            <button class="dv2-auth-role active" id="dv2-role-clin" onclick="window._dv2PickRole('clinician', this)">
              <div class="dv2-auth-role-ico clin">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h6M9 11h6M9 15h4"/></svg>
              </div>
              <div class="dv2-auth-role-title">Clinician</div>
              <div class="dv2-auth-role-sub">Protocol Studio, assessments, and patient management.</div>
            </button>
            <button class="dv2-auth-role" id="dv2-role-pt" onclick="window._dv2PickRole('patient', this)">
              <div class="dv2-auth-role-ico pt">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/></svg>
              </div>
              <div class="dv2-auth-role-title">Patient</div>
              <div class="dv2-auth-role-sub">Activate your invite from your care team.</div>
            </button>
          </div>

          <div class="dv2-auth-sso">
            <button class="dv2-sso-btn" type="button" onclick="window._dv2SsoNotice('Google')">
              <svg width="14" height="14" viewBox="0 0 24 24"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4c-.2 1.3-.9 2.3-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z"/><path fill="#34A853" d="M12 22c2.7 0 5-1 6.6-2.5l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.7-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z"/><path fill="#FBBC05" d="M6.4 13.9a6 6 0 0 1 0-3.8V7.5H3.1a10 10 0 0 0 0 9z"/><path fill="#EA4335" d="M12 6.4c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0 0 3.1 7.5l3.3 2.6C7.2 8 9.4 6.4 12 6.4z"/></svg>
              Continue with Google
            </button>
            <button class="dv2-sso-btn" type="button" onclick="window._dv2SsoNotice('Apple')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M16.4 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.7-1.8-3.3-1.8-1.4-.1-2.7.8-3.4.8-.7 0-1.8-.8-2.9-.8-1.5 0-2.9.9-3.7 2.2-1.6 2.7-.4 6.7 1.1 8.9.8 1.1 1.6 2.3 2.8 2.2 1.1 0 1.6-.7 2.9-.7 1.4 0 1.7.7 2.9.7 1.2 0 2-1.1 2.7-2.1.9-1.2 1.2-2.4 1.3-2.5-.1 0-2.5-.9-2.4-3.4zM14.2 5.4c.6-.7 1-1.7.9-2.7-.9 0-1.9.6-2.5 1.3-.5.6-1 1.6-.9 2.6 1 .1 2-.5 2.5-1.2z"/></svg>
              Continue with Apple
            </button>
          </div>

          <div class="dv2-auth-divider">or sign in with email</div>

          <div class="dv2-field">
            <label class="dv2-field-lbl" for="login-email">Email address</label>
            <div class="dv2-input-group">
              <span class="dv2-input-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg></span>
              <input id="login-email" class="dv2-input" type="email" placeholder="you@clinic.com" autocomplete="username"
                     onkeydown="if(event.key==='Enter')document.getElementById('login-password').focus()">
            </div>
          </div>

          <div class="dv2-field">
            <label class="dv2-field-lbl" for="login-password" style="display:flex;justify-content:space-between;align-items:center">
              <span>Password</span>
              <button type="button" class="dv2-link" onclick="switchAuthTab('forgot')">Forgot?</button>
            </label>
            <div class="dv2-input-group">
              <span class="dv2-input-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg></span>
              <input id="login-password" class="dv2-input" type="password" placeholder="••••••••" autocomplete="current-password"
                     onkeydown="if(event.key==='Enter')submitLogin()">
            </div>
          </div>

          <div id="login-error" class="dv2-auth-err" style="display:none"></div>

          <button class="dv2-auth-submit" onclick="submitLogin()">Sign In
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          </button>

          <div class="dv2-auth-patient-row">
            <span>Patient? Use your portal email &amp; password here.</span>
            <button type="button" class="dv2-link" onclick="window._navPublic?.('signup-patient')">First time? Activate &rarr;</button>
          </div>

          ${import.meta.env.DEV ? `<div class="dv2-auth-devhint">Demo: <code>clinician@demo.com</code> / <code>demo1234</code></div>` : ''}
        </div>

        <!-- ───────── REGISTER ───────── -->
        <div id="register-form" style="display:none">
          <div class="dv2-auth-title">Create your account.</div>
          <div class="dv2-auth-sub">Choose how you'll use DeepSynaps. Clinic trials run for 14 days with production-parity data.</div>

          <div class="dv2-field">
            <label class="dv2-field-lbl" for="reg-name">Display name</label>
            <input id="reg-name" class="dv2-input" placeholder="Dr. Jane Smith"
                   onkeydown="if(event.key==='Enter')document.getElementById('reg-email').focus()">
          </div>

          <div class="dv2-field">
            <label class="dv2-field-lbl" for="reg-email">Work email</label>
            <div class="dv2-input-group">
              <span class="dv2-input-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg></span>
              <input id="reg-email" class="dv2-input" type="email" placeholder="clinician@clinic.com"
                     onkeydown="if(event.key==='Enter')document.getElementById('reg-password').focus()">
            </div>
          </div>

          <div class="dv2-field">
            <label class="dv2-field-lbl" for="reg-password">Password</label>
            <div class="dv2-input-group">
              <span class="dv2-input-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg></span>
              <input id="reg-password" class="dv2-input" type="password" placeholder="Min 8 characters"
                     onkeydown="if(event.key==='Enter')submitRegister()">
            </div>
          </div>

          <div id="reg-error" class="dv2-auth-err" style="display:none"></div>

          <button class="dv2-auth-submit" onclick="submitRegister()">Create Account
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          </button>
        </div>

        <!-- ───────── FORGOT ───────── -->
        <div id="forgot-form" style="display:none">
          <div class="dv2-auth-title">Reset your password.</div>
          <div class="dv2-auth-sub">Enter your registered email. If an account exists, we'll send a reset link.</div>

          <div class="dv2-field">
            <label class="dv2-field-lbl" for="forgot-email">Email</label>
            <div class="dv2-input-group">
              <span class="dv2-input-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg></span>
              <input id="forgot-email" class="dv2-input" type="email" placeholder="clinician@clinic.com"
                     onkeydown="if(event.key==='Enter')submitForgotPassword()">
            </div>
          </div>

          <div id="forgot-error" class="dv2-auth-err" style="display:none"></div>
          <div id="forgot-ok" class="dv2-auth-ok" style="display:none"></div>

          <button class="dv2-auth-submit" onclick="submitForgotPassword()">Send Reset Link
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          </button>
          <div style="text-align:center;margin-top:14px">
            <button type="button" class="dv2-link" onclick="switchAuthTab('login')">&larr; Back to Sign In</button>
          </div>
        </div>

        <!-- ───────── RESET ───────── -->
        <div id="reset-form" style="display:none">
          <div class="dv2-auth-title">Set a new password.</div>
          <div class="dv2-auth-sub">Choose a strong password — 8+ characters.</div>

          <div class="dv2-field">
            <label class="dv2-field-lbl" for="reset-password">New password</label>
            <div class="dv2-input-group">
              <span class="dv2-input-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg></span>
              <input id="reset-password" class="dv2-input" type="password" placeholder="Min 8 characters"
                     onkeydown="if(event.key==='Enter')submitResetPassword()">
            </div>
          </div>
          <div class="dv2-field">
            <label class="dv2-field-lbl" for="reset-confirm">Confirm password</label>
            <div class="dv2-input-group">
              <span class="dv2-input-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg></span>
              <input id="reset-confirm" class="dv2-input" type="password" placeholder="Repeat password"
                     onkeydown="if(event.key==='Enter')submitResetPassword()">
            </div>
          </div>
          <div id="reset-error" class="dv2-auth-err" style="display:none"></div>
          <button class="dv2-auth-submit" onclick="submitResetPassword()">Reset Password
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          </button>
        </div>

        <!-- ───────── DEMO ACCESS ───────── -->
        <div id="demo-form" style="display:none">
          <div class="dv2-auth-title">Try a live demo.</div>
          <div class="dv2-auth-sub">Pick a workspace below and we'll log you in with seeded patients, protocols, and assessments. No signup required.</div>

          <div class="dv2-demo-grid">
            <button class="dv2-demo-big clin" onclick="window.demoLogin('clinician-demo-token')">
              <div class="dv2-demo-big-ico">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h6M9 11h6M9 15h4"/></svg>
              </div>
              <div class="dv2-demo-big-title">Clinician Demo</div>
              <div class="dv2-demo-big-sub">Patient queue, Protocol Studio, assessments, outcomes.</div>
              <div class="dv2-demo-big-cta">Enter as clinician &rarr;</div>
            </button>
            <button class="dv2-demo-big pt" onclick="window.demoLogin('patient-demo-token')">
              <div class="dv2-demo-big-ico">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/></svg>
              </div>
              <div class="dv2-demo-big-title">Patient Portal Demo</div>
              <div class="dv2-demo-big-sub">Home program, sessions, mood log, progress charts.</div>
              <div class="dv2-demo-big-cta">Enter as patient &rarr;</div>
            </button>
          </div>

          <div class="dv2-demo-other">
            <div class="dv2-demo-other-lbl">Other roles</div>
            <div class="dv2-demo-other-grid">
              ${[
                { token: 'admin-demo-token',        label: 'Admin',            color: 'var(--teal)' },
                { token: 'resident-demo-token',     label: 'Resident',         color: 'var(--violet)' },
                { token: 'explorer-demo-token',     label: 'Guest / Explorer', color: 'var(--amber)' },
                { token: 'clinic-admin-demo-token', label: 'Clinic Admin',     color: 'var(--rose)' },
              ].map(d => `<button class="dv2-demo-mini" onclick="window.demoLogin('${d.token}')">
                <span class="dv2-demo-mini-dot" style="background:${d.color};box-shadow:0 0 8px ${d.color}66"></span>
                <span>${d.label}</span>
                <span class="dv2-demo-mini-arrow">&rarr;</span>
              </button>`).join('')}
            </div>
          </div>

          <div id="demo-error" class="dv2-auth-err" style="display:none;margin-top:12px"></div>
        </div>

        <div class="dv2-auth-footer">
          Clinical platform for qualified neuromodulation practitioners. All protocols are for professional use only.
        </div>
      </div>
    </main>
  </div>`;
}

function _injectAuthDv2Styles() {
  if (document.getElementById('dv2-auth-styles')) return;
  const s = document.createElement('style');
  s.id = 'dv2-auth-styles';
  s.textContent = `
    #login-overlay.visible { background: var(--bg-base, #080d1a); padding: 0; display: block; }
    .dv2-auth-wrap { min-height: 100vh; width: 100%; display: grid; grid-template-columns: 1.1fr 1fr;
      font-family: var(--font-body, 'DM Sans', system-ui, sans-serif); }
    @media (max-width: 960px) { .dv2-auth-wrap { grid-template-columns: 1fr; } .dv2-auth-aside { display: none; } }
    .dv2-auth-aside { position: relative; padding: 48px; display: flex; flex-direction: column;
      justify-content: space-between; gap: 32px; overflow: hidden;
      background:
        radial-gradient(ellipse 80% 50% at 20% 30%, rgba(0,212,188,0.16), transparent 55%),
        radial-gradient(ellipse 60% 50% at 80% 70%, rgba(155,127,255,0.10), transparent 55%),
        linear-gradient(180deg, var(--navy-900, #080d1a), var(--navy-950, #050810)); }
    .dv2-auth-aside::before {
      content: ''; position: absolute; inset: 0;
      background-image:
        linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
      background-size: 60px 60px; opacity: 0.55;
      mask-image: radial-gradient(ellipse at 50% 50%, black 30%, transparent 85%); }
    .dv2-auth-aside > * { position: relative; z-index: 2; }
    .dv2-auth-bg-svg { position: absolute; right: -60px; bottom: -80px; width: 520px; height: 520px;
      opacity: 0.35; z-index: 1; }
    .dv2-auth-brand { display: flex; align-items: center; gap: 12px; }
    .dv2-auth-mark { width: 38px; height: 38px; border-radius: 11px;
      background: linear-gradient(135deg, var(--teal, #00d4bc), var(--blue, #4a9eff));
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 0 24px rgba(0,212,188,0.18), inset 0 1px 0 rgba(255,255,255,0.25); }
    .dv2-auth-mark svg { width: 20px; height: 20px; }
    .dv2-auth-brand-name { font-family: var(--font-display, 'Outfit', system-ui, sans-serif);
      font-weight: 700; font-size: 16px; letter-spacing: -0.3px; color: var(--text-primary, #e8edf5); }
    .dv2-auth-brand-sub { font-size: 9.5px; color: var(--text-tertiary, #7c8699);
      letter-spacing: 1.2px; text-transform: uppercase; margin-top: 2px; }

    .dv2-auth-hero { max-width: 480px; }
    .dv2-auth-kicker { font-family: var(--font-mono, 'JetBrains Mono', monospace); font-size: 11px;
      letter-spacing: 1.6px; text-transform: uppercase; color: var(--teal, #00d4bc); margin-bottom: 18px; }
    .dv2-auth-headline { font-family: var(--font-display, 'Outfit', system-ui, sans-serif);
      font-size: 36px; font-weight: 500; line-height: 1.15; letter-spacing: -1px;
      color: var(--text-primary, #e8edf5); margin-bottom: 28px; }
    .dv2-auth-headline em { font-style: normal;
      background: linear-gradient(135deg, var(--teal, #00d4bc), var(--blue, #4a9eff));
      -webkit-background-clip: text; background-clip: text; color: transparent; }
    .dv2-auth-quote { padding: 22px 24px; border-radius: 16px;
      background: rgba(255,255,255,0.04); border: 1px solid var(--border, rgba(255,255,255,0.06));
      backdrop-filter: blur(8px); }
    .dv2-auth-quote p { font-family: var(--font-display, 'Outfit', system-ui, sans-serif);
      font-size: 17px; font-weight: 400; line-height: 1.45; letter-spacing: -0.3px;
      color: var(--text-primary, #e8edf5); margin: 0; }
    .dv2-auth-quote em { font-style: normal; color: var(--teal, #00d4bc); }
    .dv2-auth-quote-attrib { font-size: 12px; color: var(--text-tertiary, #7c8699);
      margin-top: 14px; letter-spacing: 0.3px; }

    .dv2-auth-main { display: flex; align-items: center; justify-content: center;
      padding: 48px 32px; background: var(--bg-base, #080d1a); position: relative; overflow-y: auto; }
    @media (max-width: 600px) { .dv2-auth-main { padding: 28px 18px; } }
    .dv2-auth-card { width: 100%; max-width: 460px; }
    .dv2-auth-tabs { display: flex; gap: 4px; padding: 4px; border-radius: 12px;
      background: var(--bg-surface, rgba(255,255,255,0.04));
      border: 1px solid var(--border, rgba(255,255,255,0.06)); margin-bottom: 28px; }
    .dv2-auth-tab { flex: 1; padding: 9px 12px; border-radius: 9px; font-size: 12.5px;
      font-weight: 600; color: var(--text-secondary, #a8b3c1);
      transition: all 0.15s ease; border: 1px solid transparent; }
    .dv2-auth-tab.active { background: linear-gradient(135deg, rgba(0,212,188,0.14), rgba(74,158,255,0.08));
      color: var(--text-primary, #e8edf5); border-color: var(--border-teal, rgba(0,212,188,0.3)); }
    .dv2-auth-tab:not(.active):hover { color: var(--text-primary, #e8edf5);
      background: rgba(255,255,255,0.04); }

    .dv2-auth-title { font-family: var(--font-display, 'Outfit', system-ui, sans-serif);
      font-size: 28px; font-weight: 600; letter-spacing: -0.6px;
      color: var(--text-primary, #e8edf5); margin-bottom: 8px; }
    .dv2-auth-sub { color: var(--text-secondary, #a8b3c1); font-size: 13px;
      line-height: 1.55; margin-bottom: 24px; }

    .dv2-auth-role-picker { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 18px; }
    .dv2-auth-role { padding: 14px 14px; border-radius: 12px;
      background: var(--bg-surface, rgba(255,255,255,0.04));
      border: 1px solid var(--border, rgba(255,255,255,0.06));
      cursor: pointer; text-align: left; transition: all 0.15s ease;
      font-family: var(--font-body, 'DM Sans', system-ui, sans-serif); color: var(--text-primary); }
    .dv2-auth-role.active { border-color: var(--border-teal, rgba(0,212,188,0.3));
      background: linear-gradient(135deg, rgba(0,212,188,0.10), rgba(74,158,255,0.04)); }
    .dv2-auth-role:hover:not(.active) { border-color: var(--border-hover, rgba(255,255,255,0.12)); }
    .dv2-auth-role-ico { width: 30px; height: 30px; border-radius: 8px;
      background: rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: center;
      margin-bottom: 10px; }
    .dv2-auth-role-ico.clin { color: var(--teal, #00d4bc); }
    .dv2-auth-role-ico.pt   { color: var(--blue, #4a9eff); }
    .dv2-auth-role-title { font-family: var(--font-display, 'Outfit', system-ui, sans-serif);
      font-size: 14px; font-weight: 600; margin-bottom: 3px; }
    .dv2-auth-role-sub { font-size: 11.5px; color: var(--text-tertiary, #7c8699); line-height: 1.4; }

    .dv2-auth-sso { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 4px; }
    @media (max-width: 480px) { .dv2-auth-sso { grid-template-columns: 1fr; } }
    .dv2-sso-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px;
      padding: 11px 12px; border-radius: 10px; font-size: 12.5px; font-weight: 500;
      background: var(--bg-surface, rgba(255,255,255,0.04));
      border: 1px solid var(--border, rgba(255,255,255,0.06));
      color: var(--text-primary, #e8edf5); cursor: pointer;
      font-family: var(--font-body, 'DM Sans', system-ui, sans-serif); transition: all 0.15s ease; }
    .dv2-sso-btn:hover { border-color: var(--border-hover, rgba(255,255,255,0.12));
      background: rgba(255,255,255,0.06); }

    .dv2-auth-divider { display: flex; align-items: center; gap: 12px; margin: 18px 0;
      color: var(--text-tertiary, #7c8699); font-size: 11px; text-transform: uppercase; letter-spacing: 1.2px; }
    .dv2-auth-divider::before, .dv2-auth-divider::after { content: ''; flex: 1; height: 1px;
      background: var(--border, rgba(255,255,255,0.06)); }

    .dv2-field { margin-bottom: 14px; }
    .dv2-field-lbl { display: block; font-size: 11.5px; font-weight: 600;
      color: var(--text-secondary, #a8b3c1); margin-bottom: 7px; letter-spacing: 0.2px; }
    .dv2-input { width: 100%; padding: 11px 14px; font-size: 13.5px;
      background: var(--bg-surface, rgba(255,255,255,0.04));
      border: 1px solid var(--border, rgba(255,255,255,0.06)); border-radius: 10px;
      transition: all 0.15s ease; color: var(--text-primary, #e8edf5);
      font-family: var(--font-body, 'DM Sans', system-ui, sans-serif); }
    .dv2-input:focus { outline: none; border-color: var(--border-teal, rgba(0,212,188,0.3));
      background: rgba(0,212,188,0.04); }
    .dv2-input::placeholder { color: var(--text-tertiary, #7c8699); }
    .dv2-input-group { position: relative; }
    .dv2-input-group .dv2-input { padding-left: 40px; }
    .dv2-input-icon { position: absolute; left: 13px; top: 50%; transform: translateY(-50%);
      color: var(--text-tertiary, #7c8699); pointer-events: none; }

    .dv2-auth-err { color: var(--red, #ff6b6b); font-size: 12px; margin-bottom: 10px; }
    .dv2-auth-ok  { color: var(--teal, #00d4bc); font-size: 12px; margin-bottom: 10px; }

    .dv2-auth-submit { width: 100%; padding: 13px; border-radius: 11px; font-size: 13.5px;
      font-weight: 600; cursor: pointer; border: none;
      background: linear-gradient(135deg, var(--teal, #00d4bc), var(--teal-dim, #00a896));
      color: #04121c;
      box-shadow: 0 6px 22px rgba(0,212,188,0.18), inset 0 1px 0 rgba(255,255,255,0.3);
      display: flex; align-items: center; justify-content: center; gap: 8px;
      margin-top: 6px; transition: transform 0.12s ease, box-shadow 0.15s ease;
      font-family: var(--font-body, 'DM Sans', system-ui, sans-serif); }
    .dv2-auth-submit:hover { transform: translateY(-1px);
      box-shadow: 0 10px 28px rgba(0,212,188,0.25), inset 0 1px 0 rgba(255,255,255,0.3); }

    .dv2-link { background: none; border: none; padding: 0; font-size: 12px; font-weight: 600;
      color: var(--teal, #00d4bc); cursor: pointer;
      font-family: var(--font-body, 'DM Sans', system-ui, sans-serif); }
    .dv2-link:hover { text-decoration: underline; }

    .dv2-auth-patient-row { margin-top: 14px; padding: 10px 12px;
      background: rgba(74,158,255,0.06);
      border: 1px solid rgba(74,158,255,0.25); border-radius: 10px;
      font-size: 11.5px; color: var(--text-secondary, #a8b3c1);
      display: flex; align-items: center; justify-content: space-between; gap: 8px; }

    .dv2-auth-devhint { margin-top: 10px; padding: 8px 12px; border-radius: 8px;
      background: rgba(255,255,255,0.03); border: 1px dashed var(--border, rgba(255,255,255,0.06));
      font-size: 11px; color: var(--text-tertiary, #7c8699); }
    .dv2-auth-devhint code { font-family: var(--font-mono, 'JetBrains Mono', monospace);
      color: var(--teal, #00d4bc); }

    .dv2-demo-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 18px; }
    @media (max-width: 520px) { .dv2-demo-grid { grid-template-columns: 1fr; } }
    .dv2-demo-big { padding: 18px; border-radius: 14px; cursor: pointer; text-align: left;
      background: var(--bg-surface, rgba(255,255,255,0.04));
      border: 1px solid var(--border, rgba(255,255,255,0.06));
      transition: all 0.15s ease; color: var(--text-primary);
      font-family: var(--font-body, 'DM Sans', system-ui, sans-serif); }
    .dv2-demo-big.clin:hover { border-color: var(--border-teal, rgba(0,212,188,0.3));
      background: linear-gradient(135deg, rgba(0,212,188,0.08), rgba(74,158,255,0.04)); }
    .dv2-demo-big.pt:hover { border-color: rgba(74,158,255,0.35);
      background: linear-gradient(135deg, rgba(74,158,255,0.08), rgba(155,127,255,0.04)); }
    .dv2-demo-big-ico { width: 36px; height: 36px; border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      background: rgba(255,255,255,0.05); margin-bottom: 12px; }
    .dv2-demo-big.clin .dv2-demo-big-ico { color: var(--teal, #00d4bc); }
    .dv2-demo-big.pt   .dv2-demo-big-ico { color: var(--blue, #4a9eff); }
    .dv2-demo-big-title { font-family: var(--font-display, 'Outfit', system-ui, sans-serif);
      font-size: 15px; font-weight: 600; margin-bottom: 4px; }
    .dv2-demo-big-sub { font-size: 11.5px; color: var(--text-secondary, #a8b3c1); line-height: 1.45; }
    .dv2-demo-big-cta { margin-top: 12px; font-size: 11.5px; font-weight: 600;
      color: var(--teal, #00d4bc); }
    .dv2-demo-big.pt .dv2-demo-big-cta { color: var(--blue, #4a9eff); }

    .dv2-demo-other-lbl { font-family: var(--font-mono, monospace); font-size: 10px;
      color: var(--text-tertiary, #7c8699); letter-spacing: 1.2px; text-transform: uppercase;
      margin-bottom: 8px; }
    .dv2-demo-other-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    @media (max-width: 480px) { .dv2-demo-other-grid { grid-template-columns: 1fr; } }
    .dv2-demo-mini { display: flex; align-items: center; gap: 10px; padding: 10px 12px;
      border-radius: 10px; background: var(--bg-surface, rgba(255,255,255,0.04));
      border: 1px solid var(--border, rgba(255,255,255,0.06));
      font-size: 12px; font-weight: 500; color: var(--text-primary, #e8edf5);
      cursor: pointer; transition: all 0.15s ease;
      font-family: var(--font-body, 'DM Sans', system-ui, sans-serif); }
    .dv2-demo-mini:hover { border-color: var(--border-hover, rgba(255,255,255,0.12)); }
    .dv2-demo-mini-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .dv2-demo-mini-arrow { margin-left: auto; color: var(--text-tertiary, #7c8699); }

    .dv2-auth-footer { margin-top: 24px; padding: 14px 16px; border-radius: 10px;
      background: rgba(0,212,188,0.04);
      border: 1px solid var(--border-teal, rgba(0,212,188,0.3));
      font-size: 11.5px; color: var(--text-secondary, #a8b3c1); line-height: 1.55;
      text-align: center; }
  `;
  document.head.appendChild(s);
}

window._dv2PickRole = function(role, btn) {
  document.querySelectorAll('.dv2-auth-role').forEach(b => b.classList.toggle('active', b === btn));
  if (role === 'patient') {
    const emailEl = document.getElementById('login-email');
    if (emailEl && !emailEl.value) emailEl.placeholder = 'patient@portal.com';
  }
};

window._dv2SsoNotice = function(provider) {
  const errEl = document.getElementById('login-error');
  if (!errEl) return;
  errEl.style.color = 'var(--text-secondary, #a8b3c1)';
  errEl.textContent = provider + ' SSO is not enabled for this workspace yet — please use email + password.';
  errEl.style.display = '';
};

window.switchAuthTab = function(tab) {
  ['login','register','demo','forgot','reset'].forEach(t => {
    const el = document.getElementById(`${t}-form`);
    if (el) el.style.display = tab === t ? '' : 'none';
  });
  ['login','register','demo'].forEach(t => {
    const btn = document.getElementById(`tab-${t}`);
    if (btn) btn.classList.toggle('active', tab === t);
  });
};

window.submitForgotPassword = async function() {
  const errEl = document.getElementById('forgot-error');
  const okEl  = document.getElementById('forgot-ok');
  if (errEl) errEl.style.display = 'none';
  if (okEl)  okEl.style.display  = 'none';
  const email = document.getElementById('forgot-email')?.value?.trim();
  if (!email) { if (errEl) { errEl.textContent = 'Enter your email address.'; errEl.style.display = ''; } return; }
  try {
    await api.forgotPassword(email);
    if (okEl) {
      okEl.textContent = 'If an account with that email exists, a reset link has been sent. Check your inbox.';
      okEl.style.display = '';
    }
    if (errEl) errEl.style.display = 'none';
  } catch (e) {
    if (errEl) { errEl.textContent = e.message || 'Could not send reset link.'; errEl.style.display = ''; }
  }
};

window.submitResetPassword = async function() {
  const errEl = document.getElementById('reset-error');
  if (errEl) errEl.style.display = 'none';
  const pw  = document.getElementById('reset-password')?.value;
  const cpw = document.getElementById('reset-confirm')?.value;
  if (!pw || pw.length < 8) { if (errEl) { errEl.textContent = 'Password must be at least 8 characters.'; errEl.style.display = ''; } return; }
  if (pw !== cpw) { if (errEl) { errEl.textContent = 'Passwords do not match.'; errEl.style.display = ''; } return; }
  const token = new URLSearchParams(window.location.search).get('reset_token');
  if (!token) { if (errEl) { errEl.textContent = 'Invalid or expired reset link.'; errEl.style.display = ''; } return; }
  try {
    await api.resetPassword(token, pw);
    // Clear URL param and switch to login
    window.history.replaceState({}, '', window.location.pathname);
    window.switchAuthTab('login');
    const errLogin = document.getElementById('login-error');
    if (errLogin) { errLogin.style.color = 'var(--teal)'; errLogin.textContent = 'Password reset successful. Sign in with your new password.'; errLogin.style.display = ''; }
  } catch (e) {
    if (errEl) { errEl.textContent = e.message || 'Reset failed — link may have expired.'; errEl.style.display = ''; }
  }
};

const DEMO_USERS = {
  'admin-demo-token':        { id: 1, email: 'admin@demo.com',        display_name: 'Admin User',       role: 'admin',     package_id: 'enterprise' },
  'clinician-demo-token':    { id: 2, email: 'clinician@demo.com',    display_name: 'Dr. Jane Smith',   role: 'clinician', package_id: 'clinician_pro' },
  'resident-demo-token':     { id: 3, email: 'resident@demo.com',     display_name: 'Dr. Alex Chen',    role: 'clinician', package_id: 'resident' },
  'explorer-demo-token':     { id: 4, email: 'explorer@demo.com',     display_name: 'Guest User',       role: 'guest',     package_id: 'explorer' },
  'clinic-admin-demo-token': { id: 5, email: 'clinicadmin@demo.com',  display_name: 'Clinic Manager',   role: 'admin',     package_id: 'clinic_team' },
  'patient-demo-token':      { id: 6, email: 'patient@demo.com',      display_name: 'Jane Patient',     role: 'patient',   package_id: 'patient' },
};

function bootUser(user) {
  if (user.role === 'patient') {
    showPatient();
    updatePatientBar();
    window._bootPatient?.();
  } else {
    showApp();
    updateUserBar();
    window._bootApp?.();
  }
}

window.demoLogin = async function(token) {
  const errEl = document.getElementById('demo-error');
  if (errEl) errEl.style.display = 'none';

  // Try real demo-login endpoint first (works in all environments)
  try {
    const res = await api.demoLogin(token);
    if (res?.access_token) {
      api.setToken(res.access_token);
      if (res.refresh_token) api.setRefreshToken(res.refresh_token);
      currentUser = res.user;
      const dest = sessionStorage.getItem('ds_intended_destination');
      sessionStorage.removeItem('ds_intended_destination');
      bootUser(currentUser);
      if (dest) setTimeout(() => window._nav?.(dest), 100);
      return;
    }
  } catch (_) {}

  // Offline demo fallback — active in local dev OR when the build was
  // produced with VITE_ENABLE_DEMO=1 (used for preview / Netlify demo deploys).
  const _demoEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO === '1';
  if (_demoEnabled) {
    const demoUser = DEMO_USERS[token];
    if (demoUser) {
      api.setToken(token);
      currentUser = demoUser;
      const dest = sessionStorage.getItem('ds_intended_destination');
      sessionStorage.removeItem('ds_intended_destination');
      bootUser(demoUser);
      if (dest) setTimeout(() => window._nav?.(dest), 100);
    } else {
      if (errEl) { errEl.textContent = 'Unknown demo token.'; errEl.style.display = ''; }
    }
  } else {
    if (errEl) { errEl.textContent = 'Demo access temporarily unavailable. Please try again.'; errEl.style.display = ''; }
  }
};

const DEMO_CREDENTIALS = import.meta.env.DEV ? {
  'clinician@demo.com': { password: 'demo1234', token: 'clinician-demo-token' },
  'admin@demo.com':     { password: 'demo1234', token: 'admin-demo-token' },
} : {};

window.submitLogin = async function() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  const btn = document.querySelector('#login-form .btn-primary');
  errEl.style.display = 'none';
  errEl.style.color = 'var(--red)';
  if (!email || !password) { errEl.textContent = 'Email and password required.'; errEl.style.display = ''; return; }
  // Loading state
  const origLabel = btn?.textContent;
  if (btn) { btn.textContent = 'Signing in...'; btn.disabled = true; }
  try {
    const res = await api.login(email, password);
    if (!res || !res.access_token) { errEl.textContent = 'Invalid credentials.'; errEl.style.display = ''; if (btn) { btn.textContent = origLabel; btn.disabled = false; } return; }
    api.setToken(res.access_token);
    if (res.refresh_token) api.setRefreshToken(res.refresh_token);
    currentUser = res.user;
    const _intendedAfterLogin = sessionStorage.getItem('ds_intended_destination');
    sessionStorage.removeItem('ds_intended_destination');
    bootUser(currentUser);
    if (_intendedAfterLogin) setTimeout(() => window._nav?.(_intendedAfterLogin), 100);
    return;
  } catch (_) { /* fall through to offline demo */ }
  if (btn) { btn.textContent = origLabel; btn.disabled = false; }
  // Offline demo credentials fallback — dev only
  if (import.meta.env.DEV) {
    const cred = DEMO_CREDENTIALS[email];
    if (cred && cred.password === password) {
      const demoUser = DEMO_USERS[cred.token];
      api.setToken(cred.token);
      currentUser = demoUser;
      bootUser(demoUser);
    } else {
      errEl.textContent = 'Invalid credentials. Try clinician@demo.com / demo1234';
      errEl.style.display = '';
    }
  } else {
    errEl.textContent = 'Invalid credentials.';
    errEl.style.display = '';
  }
};

window.submitRegister = async function() {
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const errEl = document.getElementById('reg-error');
  const btn = document.querySelector('#register-form .btn-primary');
  errEl.style.display = 'none';
  if (!name || !email || !password) { errEl.textContent = 'All fields required.'; errEl.style.display = ''; return; }
  if (password.length < 8) { errEl.textContent = 'Password must be at least 8 characters.'; errEl.style.display = ''; return; }
  const origLabel = btn?.textContent;
  if (btn) { btn.textContent = 'Creating account...'; btn.disabled = true; }
  try {
    const res = await api.register(email, name, password);
    if (!res || !res.access_token) { errEl.textContent = 'Registration failed.'; errEl.style.display = ''; if (btn) { btn.textContent = origLabel; btn.disabled = false; } return; }
    api.setToken(res.access_token);
    if (res.refresh_token) api.setRefreshToken(res.refresh_token);
    currentUser = res.user;
    bootUser(currentUser);
  } catch (e) {
    errEl.textContent = e.message || 'Registration failed.';
    errEl.style.display = '';
    if (btn) { btn.textContent = origLabel; btn.disabled = false; }
  }
};
