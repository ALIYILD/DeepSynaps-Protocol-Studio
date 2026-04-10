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

    <div style="margin-top:24px;padding:14px;background:rgba(0,212,188,0.04);border:1px solid var(--border-teal);border-radius:var(--radius-md);font-size:11.5px;color:var(--text-secondary);line-height:1.6">
      ⚕ Clinical platform for qualified neuromodulation practitioners. All protocols are for professional use only.
    </div>
  </div>`;
}

window.switchAuthTab = function(tab) {
  document.getElementById('login-form').style.display = tab === 'login' ? '' : 'none';
  document.getElementById('register-form').style.display = tab === 'register' ? '' : 'none';
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
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
