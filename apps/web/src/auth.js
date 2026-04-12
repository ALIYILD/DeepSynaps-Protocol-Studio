import { api } from './api.js';

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
}

export function showPublic() {
  document.getElementById('login-overlay').classList.remove('visible');
  document.getElementById('sidebar').classList.remove('visible');
  document.getElementById('app-shell').classList.remove('visible');
  document.getElementById('patient-shell')?.classList.remove('visible');
  document.getElementById('public-shell')?.classList.add('visible');
}

export function showPatient() {
  document.getElementById('login-overlay').classList.remove('visible');
  document.getElementById('public-shell')?.classList.remove('visible');
  document.getElementById('sidebar').classList.remove('visible');
  document.getElementById('app-shell').classList.remove('visible');
  document.getElementById('patient-shell')?.classList.add('visible');
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
  // In dev mode with no token, allow demo sessions that set currentUser directly
  if (import.meta.env.DEV && currentUser) return true;
  return !!api.getToken();
};

function renderLoginPage() {
  return `<div style="width:380px">
    <div style="text-align:center;margin-bottom:36px">
      <div style="width:52px;height:52px;background:linear-gradient(135deg,var(--teal),var(--blue));border-radius:14px;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:24px;box-shadow:0 0 30px var(--teal-glow)">🧠</div>
      <div style="font-family:var(--font-display);font-size:22px;font-weight:700;color:var(--text-primary);letter-spacing:-0.3px">DeepSynaps Studio</div>
      <div style="font-size:12px;color:var(--text-tertiary);margin-top:4px;letter-spacing:1px;text-transform:uppercase">Clinical OS · Neuromodulation Platform</div>
    </div>

    <div id="auth-tabs" style="display:flex;border-bottom:1px solid var(--border);margin-bottom:24px">
      <button id="tab-login" class="tab-btn active" onclick="switchAuthTab('login')">Sign In</button>
      <button id="tab-register" class="tab-btn" onclick="switchAuthTab('register')">Create Account</button>
      <button id="tab-demo" class="tab-btn" onclick="switchAuthTab('demo')">Demo Access</button>
    </div>

    <div id="login-form">
      <div class="form-group">
        <label class="form-label">Email</label>
        <input id="login-email" class="form-control" type="email" placeholder="your@email.com" autocomplete="username"
               onkeydown="if(event.key==='Enter')document.getElementById('login-password').focus()">
      </div>
      <div class="form-group">
        <label class="form-label">Password</label>
        <input id="login-password" class="form-control" type="password" placeholder="••••••••" autocomplete="current-password"
               onkeydown="if(event.key==='Enter')submitLogin()">
      </div>
      <div id="login-error" style="color:var(--red);font-size:12px;margin-bottom:12px;display:none"></div>
      <button class="btn btn-primary" style="width:100%;padding:10px;font-size:13.5px" onclick="submitLogin()">Sign In →</button>
      <div style="margin-top:10px;padding:8px 10px;background:rgba(74,158,255,0.06);border:1px solid var(--border-blue);border-radius:var(--radius-md);font-size:11.5px;color:var(--text-secondary);display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>◉ Patient? Use your portal email &amp; password here.</span>
        <span onclick="window._navPublic?.('signup-patient')" style="color:var(--blue);cursor:pointer;white-space:nowrap;font-weight:600">First time? Activate →</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px">
        <span style="font-size:11.5px;color:var(--text-tertiary)">${import.meta.env.DEV ? 'Demo: clinician@demo.com / demo1234' : ''}</span>
        <button class="btn btn-ghost btn-sm" style="font-size:11px;padding:3px 6px" onclick="switchAuthTab('forgot')">Forgot password?</button>
      </div>
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);display:flex;gap:8px">
        <button onclick="window.demoLogin('clinician-demo-token')" style="flex:1;padding:8px;border-radius:var(--radius-md);border:1px solid var(--border-teal);background:rgba(0,212,188,0.05);color:var(--teal);font-size:11.5px;font-weight:600;cursor:pointer;font-family:var(--font-body)">
          ◈ Clinician Demo
        </button>
        <button onclick="window.demoLogin('patient-demo-token')" style="flex:1;padding:8px;border-radius:var(--radius-md);border:1px solid var(--border-blue);background:rgba(74,158,255,0.05);color:var(--blue);font-size:11.5px;font-weight:600;cursor:pointer;font-family:var(--font-body)">
          ◉ Patient Portal Demo
        </button>
      </div>
    </div>

    <div id="register-form" style="display:none">
      <div class="form-group">
        <label class="form-label">Display Name</label>
        <input id="reg-name" class="form-control" placeholder="Dr. Jane Smith"
               onkeydown="if(event.key==='Enter')document.getElementById('reg-email').focus()">
      </div>
      <div class="form-group">
        <label class="form-label">Email</label>
        <input id="reg-email" class="form-control" type="email" placeholder="clinician@clinic.com"
               onkeydown="if(event.key==='Enter')document.getElementById('reg-password').focus()">
      </div>
      <div class="form-group">
        <label class="form-label">Password</label>
        <input id="reg-password" class="form-control" type="password" placeholder="Min 8 characters"
               onkeydown="if(event.key==='Enter')submitRegister()">
      </div>
      <div id="reg-error" style="color:var(--red);font-size:12px;margin-bottom:12px;display:none"></div>
      <button class="btn btn-primary" style="width:100%;padding:10px;font-size:13.5px" onclick="submitRegister()">Create Account →</button>
    </div>

    <div id="forgot-form" style="display:none">
      <div style="font-size:12px;color:var(--text-secondary);margin-bottom:16px;line-height:1.65">
        Enter your registered email address. If an account exists, we'll send a password reset link.
      </div>
      <div class="form-group">
        <label class="form-label">Email</label>
        <input id="forgot-email" class="form-control" type="email" placeholder="clinician@clinic.com"
               onkeydown="if(event.key==='Enter')submitForgotPassword()">
      </div>
      <div id="forgot-error" style="color:var(--red);font-size:12px;margin-bottom:12px;display:none"></div>
      <div id="forgot-ok" style="color:var(--teal);font-size:12px;margin-bottom:12px;display:none"></div>
      <button class="btn btn-primary" style="width:100%;padding:10px;font-size:13.5px" onclick="submitForgotPassword()">Send Reset Link →</button>
      <div style="text-align:center;margin-top:12px">
        <button class="btn btn-ghost btn-sm" onclick="switchAuthTab('login')">← Back to Sign In</button>
      </div>
    </div>

    <div id="reset-form" style="display:none">
      <div style="font-size:12px;color:var(--text-secondary);margin-bottom:16px;line-height:1.65">
        Enter your new password below.
      </div>
      <div class="form-group">
        <label class="form-label">New Password</label>
        <input id="reset-password" class="form-control" type="password" placeholder="Min 8 characters"
               onkeydown="if(event.key==='Enter')submitResetPassword()">
      </div>
      <div class="form-group">
        <label class="form-label">Confirm Password</label>
        <input id="reset-confirm" class="form-control" type="password" placeholder="Repeat password"
               onkeydown="if(event.key==='Enter')submitResetPassword()">
      </div>
      <div id="reset-error" style="color:var(--red);font-size:12px;margin-bottom:12px;display:none"></div>
      <button class="btn btn-primary" style="width:100%;padding:10px;font-size:13.5px" onclick="submitResetPassword()">Reset Password →</button>
    </div>

    <div id="demo-form" style="display:none">
      <div style="font-size:12px;color:var(--text-secondary);margin-bottom:16px;line-height:1.65">
        Click a role below to enter with a demo token. No registration required.
      </div>
      <div style="display:grid;gap:8px">
        ${[
          { token: 'admin-demo-token',        label: 'Admin',            sub: 'Full access · All features',              color: 'var(--teal)' },
          { token: 'clinician-demo-token',    label: 'Clinician Pro',    sub: 'Patient management · Protocol generation', color: 'var(--blue)' },
          { token: 'resident-demo-token',     label: 'Resident / Fellow',sub: 'Evidence library · Limited protocols',     color: 'var(--violet)' },
          { token: 'explorer-demo-token',     label: 'Guest / Explorer', sub: 'Read-only · Evidence & devices',           color: 'var(--amber)' },
          { token: 'clinic-admin-demo-token', label: 'Clinic Admin',     sub: 'Team management · All clinical tools',    color: 'var(--rose)' },
          { token: 'patient-demo-token',      label: 'Patient Portal',   sub: 'Patient view · Sessions & progress',      color: 'var(--blue)' },
        ].map(d => `<button onclick="window.demoLogin('${d.token}')" style="
          display:flex;align-items:center;gap:12px;padding:11px 14px;
          border-radius:var(--radius-md);border:1px solid var(--border);
          background:var(--bg-surface);cursor:pointer;transition:all var(--transition);
          text-align:left;width:100%;font-family:var(--font-body);"
          onmouseover="this.style.borderColor='var(--border-teal)';this.style.background='var(--teal-ghost)'"
          onmouseout="this.style.borderColor='var(--border)';this.style.background='var(--bg-surface)'">
          <div style="width:8px;height:8px;border-radius:50%;background:${d.color};flex-shrink:0;box-shadow:0 0 8px ${d.color}40"></div>
          <div>
            <div style="font-size:12.5px;font-weight:600;color:var(--text-primary)">${d.label}</div>
            <div style="font-size:11px;color:var(--text-secondary);margin-top:1px">${d.sub}</div>
          </div>
          <div style="margin-left:auto;font-size:11px;color:var(--text-tertiary)">→</div>
        </button>`).join('')}
      </div>
      <div id="demo-error" style="color:var(--red);font-size:12px;margin-top:12px;display:none"></div>
    </div>

    <div style="margin-top:24px;padding:14px;background:rgba(0,212,188,0.04);border:1px solid var(--border-teal);border-radius:var(--radius-md);font-size:11.5px;color:var(--text-secondary);line-height:1.6">
      ⚕ Clinical platform for qualified neuromodulation practitioners. All protocols are for professional use only.
    </div>
  </div>`;
}

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
  api.setToken(token);
  try {
    const user = await api.me();
    if (user) {
      currentUser = user;
      const _intendedDemo = sessionStorage.getItem('ds_intended_destination');
      sessionStorage.removeItem('ds_intended_destination');
      bootUser(user);
      if (_intendedDemo) setTimeout(() => window._nav?.(_intendedDemo), 100);
      return;
    }
  } catch (_) {}
  // Offline fallback only in dev — never leak hardcoded users to production
  if (import.meta.env.DEV) {
    const demoUser = DEMO_USERS[token];
    if (demoUser) {
      currentUser = demoUser;
      const _intendedDemo = sessionStorage.getItem('ds_intended_destination');
      sessionStorage.removeItem('ds_intended_destination');
      bootUser(demoUser);
      if (_intendedDemo) setTimeout(() => window._nav?.(_intendedDemo), 100);
    }
    else { api.clearToken(); if (errEl) { errEl.textContent = 'Unknown demo token.'; errEl.style.display = ''; } }
  } else {
    api.clearToken();
    if (errEl) { errEl.textContent = 'Demo login unavailable — backend not reachable.'; errEl.style.display = ''; }
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
  errEl.style.display = 'none';
  if (!email || !password) { errEl.textContent = 'Email and password required.'; errEl.style.display = ''; return; }
  try {
    const res = await api.login(email, password);
    if (!res || !res.access_token) { errEl.textContent = 'Invalid credentials.'; errEl.style.display = ''; return; }
    api.setToken(res.access_token);
    if (res.refresh_token) api.setRefreshToken(res.refresh_token);
    currentUser = res.user;
    const _intendedAfterLogin = sessionStorage.getItem('ds_intended_destination');
    sessionStorage.removeItem('ds_intended_destination');
    bootUser(currentUser);
    if (_intendedAfterLogin) setTimeout(() => window._nav?.(_intendedAfterLogin), 100);
    return;
  } catch (_) { /* fall through to offline demo */ }
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
  errEl.style.display = 'none';
  if (!name || !email || !password) { errEl.textContent = 'All fields required.'; errEl.style.display = ''; return; }
  try {
    const res = await api.register(email, name, password);
    if (!res || !res.access_token) { errEl.textContent = 'Registration failed.'; errEl.style.display = ''; return; }
    api.setToken(res.access_token);
    currentUser = res.user;
    showApp();
    updateUserBar();
    window._bootApp?.();
  } catch (e) {
    errEl.textContent = e.message || 'Registration failed.';
    errEl.style.display = '';
  }
};
