import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM(
  `<!doctype html>
   <html>
     <body>
       <div id="login-overlay"></div>
       <div id="public-shell"></div>
       <div id="patient-shell"></div>
       <div id="sidebar"></div>
       <div id="app-shell"></div>
       <div id="user-avatar"></div>
       <div id="user-name"></div>
       <div id="user-role"></div>
       <div id="pt-avatar"></div>
       <div id="pt-name"></div>
       <div id="pt-role"></div>
       <div id="session-expired-notice"></div>
       <div id="content"></div>
     </body>
   </html>`,
  { url: 'https://example.test/?page=dashboard' },
);

const store = {};
const storageShim = {
  getItem(key) {
    return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
  },
  setItem(key, value) {
    store[key] = String(value);
  },
  removeItem(key) {
    delete store[key];
  },
  clear() {
    for (const key of Object.keys(store)) delete store[key];
  },
};

globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.location = dom.window.location;
globalThis.localStorage = storageShim;
globalThis.sessionStorage = storageShim;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Node = dom.window.Node;
globalThis.MutationObserver = dom.window.MutationObserver || class {
  observe() {}
  disconnect() {}
};
globalThis.requestAnimationFrame = globalThis.requestAnimationFrame || ((cb) => setTimeout(cb, 0));
globalThis.cancelAnimationFrame = globalThis.cancelAnimationFrame || clearTimeout;

const apiMod = await import('./api.js');
const authMod = await import('./auth.js');

const originals = {
  login: apiMod.api.login,
  register: apiMod.api.register,
  forgotPassword: apiMod.api.forgotPassword,
  resetPassword: apiMod.api.resetPassword,
  demoLogin: apiMod.api.demoLogin,
  logout: apiMod.api.logout,
  clearToken: apiMod.api.clearToken,
  getToken: apiMod.api.getToken,
  setToken: apiMod.api.setToken,
  setRefreshToken: apiMod.api.setRefreshToken,
};

function resetDom() {
  document.getElementById('login-overlay').className = '';
  document.getElementById('login-overlay').innerHTML = '';
  document.getElementById('public-shell').className = '';
  document.getElementById('patient-shell').className = '';
  document.getElementById('sidebar').className = '';
  document.getElementById('app-shell').className = '';
  document.getElementById('user-avatar').textContent = '';
  document.getElementById('user-name').textContent = '';
  document.getElementById('user-role').textContent = '';
  document.getElementById('pt-avatar').textContent = '';
  document.getElementById('pt-name').textContent = '';
  document.getElementById('pt-role').textContent = '';
  document.getElementById('content').innerHTML = '';
  store.ds_intended_destination = '';
}

test.beforeEach(() => {
  resetDom();
  authMod.setCurrentUser(null);
  apiMod.api.login = originals.login;
  apiMod.api.register = originals.register;
  apiMod.api.forgotPassword = originals.forgotPassword;
  apiMod.api.resetPassword = originals.resetPassword;
  apiMod.api.demoLogin = originals.demoLogin;
  apiMod.api.logout = originals.logout;
  apiMod.api.clearToken = originals.clearToken;
  apiMod.api.getToken = originals.getToken;
  apiMod.api.setToken = originals.setToken;
  apiMod.api.setRefreshToken = originals.setRefreshToken;
});

test.after(() => {
  apiMod.api.login = originals.login;
  apiMod.api.register = originals.register;
  apiMod.api.forgotPassword = originals.forgotPassword;
  apiMod.api.resetPassword = originals.resetPassword;
  apiMod.api.demoLogin = originals.demoLogin;
  apiMod.api.logout = originals.logout;
  apiMod.api.clearToken = originals.clearToken;
  apiMod.api.getToken = originals.getToken;
  apiMod.api.setToken = originals.setToken;
  apiMod.api.setRefreshToken = originals.setRefreshToken;
});

test('showApp/showPublic/showPatient toggle shells', () => {
  authMod.showApp();
  assert.ok(document.getElementById('sidebar').classList.contains('visible'));
  assert.ok(document.getElementById('app-shell').classList.contains('visible'));

  authMod.showPublic();
  assert.ok(document.getElementById('public-shell').classList.contains('visible'));
  assert.ok(!document.getElementById('sidebar').classList.contains('visible'));

  authMod.showPatient();
  assert.ok(document.getElementById('patient-shell').classList.contains('visible'));
});

test('update bars render user details', () => {
  authMod.setCurrentUser({ display_name: 'Dr Ada', email: 'ada@example.com', role: 'clinician', package_id: 'pro' });
  authMod.updateUserBar();
  authMod.updatePatientBar();
  assert.match(document.getElementById('user-avatar').textContent, /DR/i);
  assert.match(document.getElementById('user-name').innerHTML, /Dr Ada/);
  assert.match(document.getElementById('user-role').textContent, /clinician/);
  assert.match(document.getElementById('pt-name').textContent, /Dr Ada/);
});

test('_dv2SsoNotice and switchAuthTab update the login shell', () => {
  authMod.showLogin();
  const patientBtn = document.getElementById('dv2-role-pt');
  window._dv2PickRole('patient', patientBtn);
  assert.ok(patientBtn.classList.contains('active'));
  assert.equal(document.getElementById('login-email').placeholder, 'patient@portal.com');
  window._dv2SsoNotice('Google');
  assert.match(document.getElementById('login-error').textContent, /Google SSO is not enabled/);
  window.switchAuthTab('register');
  assert.equal(document.getElementById('register-form').style.display, '');
  assert.equal(document.getElementById('login-form').style.display, 'none');
});

test('submitLogin validates input and boots current user on success', async () => {
  authMod.showLogin();
  document.getElementById('login-email').value = '';
  document.getElementById('login-password').value = '';
  await window.submitLogin();
  assert.match(document.getElementById('login-error').textContent, /Email and password required/);

  apiMod.api.login = async () => null;
  document.getElementById('login-email').value = 'pat@example.com';
  document.getElementById('login-password').value = 'pw';
  await window.submitLogin();
  assert.match(document.getElementById('login-error').textContent, /Invalid credentials/);

  apiMod.api.login = async () => ({ access_token: 'tok-1', user: { role: 'patient', display_name: 'Pat' } });
  storageShim.setItem('ds_intended_destination', 'brain-map');
  const navCalls = [];
  window._nav = (dest) => { navCalls.push(dest); };
  document.getElementById('login-email').value = 'pat@example.com';
  document.getElementById('login-password').value = 'pw';
  await window.submitLogin();
  await new Promise(r => setTimeout(r, 120));
  assert.equal(authMod.currentUser.role, 'patient');
  assert.ok(document.getElementById('patient-shell').classList.contains('visible'));
  assert.deepStrictEqual(navCalls, ['brain-map']);
  assert.equal(storageShim.getItem('ds_intended_destination'), null);
});

test('submitRegister validates and stores the signed-in user', async () => {
  authMod.showLogin();
  window.switchAuthTab('register');
  document.getElementById('reg-name').value = '';
  document.getElementById('reg-email').value = '';
  document.getElementById('reg-password').value = '';
  await window.submitRegister();
  assert.match(document.getElementById('reg-error').textContent, /All fields required/);

  apiMod.api.register = async () => ({ access_token: 'tok-2', user: { role: 'clinician', display_name: 'Clinician' } });
  document.getElementById('reg-name').value = 'Clinician';
  document.getElementById('reg-email').value = 'clin@example.com';
  document.getElementById('reg-password').value = 'password123';
  await window.submitRegister();
  assert.equal(authMod.currentUser.role, 'clinician');
  assert.ok(document.getElementById('sidebar').classList.contains('visible'));

  authMod.showLogin();
  window.switchAuthTab('register');
  apiMod.api.register = async () => { throw new Error('registration blocked'); };
  document.getElementById('reg-name').value = 'Clinician';
  document.getElementById('reg-email').value = 'clin@example.com';
  document.getElementById('reg-password').value = 'password123';
  await window.submitRegister();
  assert.match(document.getElementById('reg-error').textContent, /registration blocked/);
});

test('forgot and reset password flows handle validation and success', async () => {
  authMod.showLogin();
  window.switchAuthTab('forgot');
  document.getElementById('forgot-email').value = '';
  await window.submitForgotPassword();
  assert.match(document.getElementById('forgot-error').textContent, /Enter your email address/);

  apiMod.api.forgotPassword = async () => ({ ok: true });
  document.getElementById('forgot-email').value = 'clin@example.com';
  await window.submitForgotPassword();
  assert.match(document.getElementById('forgot-ok').textContent, /reset link has been sent/);

  window.switchAuthTab('reset');
  document.getElementById('reset-password').value = 'short';
  document.getElementById('reset-confirm').value = 'short';
  await window.submitResetPassword();
  assert.match(document.getElementById('reset-error').textContent, /at least 8 characters/);

  dom.window.history.replaceState({}, '', '/?reset_token=abc123');
  apiMod.api.resetPassword = async () => ({ ok: true });
  document.getElementById('reset-password').value = 'password123';
  document.getElementById('reset-confirm').value = 'password123';
  await window.submitResetPassword();
  assert.match(document.getElementById('login-error').textContent, /Password reset successful/);
});

test('demoLogin disabled branch and isAuthenticated helper behave honestly', async () => {
  const errNode = document.createElement('div');
  errNode.id = 'login-error';
  document.body.appendChild(errNode);
  await window.demoLogin('clinician-demo-token');
  assert.match(errNode.textContent, /Demo access is disabled/);

  apiMod.api.getToken = () => 'tok';
  assert.equal(window._isAuthenticated(), true);
  apiMod.api.getToken = () => null;
  assert.equal(window._isAuthenticated(), false);
});

test('doLogout and session-expired handler clear state and restore public shell', async () => {
  const calls = [];
  apiMod.api.logout = async () => { calls.push('logout'); };
  apiMod.api.clearToken = () => { calls.push('clear'); };
  window._navPublic = (page) => { calls.push(page); };
  authMod.setCurrentUser({ role: 'clinician' });
  authMod.doLogout();
  assert.deepEqual(calls.slice(0, 2), ['logout', 'clear']);
  assert.ok(document.getElementById('public-shell').classList.contains('visible'));

  window._handleSessionExpired();
  assert.match(document.body.textContent, /Your session has expired/);
  assert.equal(store.ds_intended_destination, 'dashboard');
});
