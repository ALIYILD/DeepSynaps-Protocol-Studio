import { api } from './api.js';

export let currentUser = null;

export function setCurrentUser(u) { currentUser = u; }

export function updateUserBar() {
  if (!currentUser) return;
  const av = document.getElementById('user-avatar');
  const nm = document.getElementById('user-name');
  const rl = document.getElementById('user-role');
  if (av) av.textContent = (currentUser.display_name || currentUser.email || '?').slice(0, 2).toUpperCase();
  if (nm) nm.textContent = currentUser.display_name || currentUser.email;
  if (rl) rl.textContent = `${currentUser.role || 'guest'} · ${currentUser.package_id || 'explorer'}`;
}

export function showApp() {
  document.getElementById('login-overlay').classList.remove('visible');
  document.getElementById('sidebar').classList.add('visible');
  document.getElementById('app-shell').classList.add('visible');
}

export function showLogin() {
  document.getElementById('sidebar').classList.remove('visible');
  document.getElementById('app-shell').classList.remove('visible');
  const overlay = document.getElementById('login-overlay');
  overlay.classList.add('visible');
  overlay.innerHTML = renderLoginPage();
}

export function doLogout() {
  api.clearToken();
  currentUser = null;
  showLogin();
}
window.doLogout = doLogout;

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
        <input id="login-email" class="form-control" type="email" placeholder="clinician@clinic.com" autocomplete="username">
      </div>
      <div class="form-group">
        <label class="form-label">Password</label>
        <input id="login-password" class="form-control" type="password" placeholder="••••••••" autocomplete="current-password">
      </div>
      <div id="login-error" style="color:var(--red);font-size:12px;margin-bottom:12px;display:none"></div>
      <button class="btn btn-primary" style="width:100%;padding:10px;font-size:13.5px" onclick="submitLogin()">Sign In →</button>
      <div style="text-align:center;margin-top:16px;font-size:11.5px;color:var(--text-tertiary)">
        Demo: <code style="color:var(--teal)">clinician@demo.com</code> / <code style="color:var(--teal)">demo1234</code>
      </div>
    </div>

    <div id="register-form" style="display:none">
      <div class="form-group">
        <label class="form-label">Display Name</label>
        <input id="reg-name" class="form-control" placeholder="Dr. Jane Smith">
      </div>
      <div class="form-group">
        <label class="form-label">Email</label>
        <input id="reg-email" class="form-control" type="email" placeholder="clinician@clinic.com">
      </div>
      <div class="form-group">
        <label class="form-label">Password</label>
        <input id="reg-password" class="form-control" type="password" placeholder="Min 8 characters">
      </div>
      <div id="reg-error" style="color:var(--red);font-size:12px;margin-bottom:12px;display:none"></div>
      <button class="btn btn-primary" style="width:100%;padding:10px;font-size:13.5px" onclick="submitRegister()">Create Account →</button>
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
  document.getElementById('login-form').style.display = tab === 'login' ? '' : 'none';
  document.getElementById('register-form').style.display = tab === 'register' ? '' : 'none';
  document.getElementById('demo-form').style.display = tab === 'demo' ? '' : 'none';
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
  document.getElementById('tab-demo').classList.toggle('active', tab === 'demo');
};

window.demoLogin = async function(token) {
  const errEl = document.getElementById('demo-error');
  if (errEl) errEl.style.display = 'none';
  api.setToken(token);
  try {
    const user = await api.me();
    if (!user) throw new Error('Backend not reachable. Start the backend first.');
    currentUser = user;
    showApp();
    updateUserBar();
    window._bootApp();
  } catch (e) {
    api.clearToken();
    if (errEl) { errEl.textContent = e.message; errEl.style.display = ''; }
  }
};

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
    currentUser = res.user;
    showApp();
    updateUserBar();
    window._bootApp();
  } catch (e) {
    errEl.textContent = e.message || 'Login failed.';
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
    window._bootApp();
  } catch (e) {
    errEl.textContent = e.message || 'Registration failed.';
    errEl.style.display = '';
  }
};
