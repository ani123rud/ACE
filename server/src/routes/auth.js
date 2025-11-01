import { Router } from 'express';
import axios from 'axios';
import { verifyFirebaseToken } from '../middleware/auth.js';

const r = Router();

// Email/password signup
r.post('/signup', async (req, res) => {
  try {
    const { email, password, name } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });
    const apiKey = process.env.FIREBASE_WEB_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'FIREBASE_WEB_API_KEY not configured' });
    // Create user via REST signUp
    const { data: signup } = await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
      { email, password, returnSecureToken: true }
    );

    let idToken = signup.idToken;
    const localId = signup.localId;
    let updatedName = name || null;

    // If name provided, update profile displayName
    if (name) {
      try {
        const { data: upd } = await axios.post(
          `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${apiKey}`,
          { idToken, displayName: name, returnSecureToken: true }
        );
        idToken = upd.idToken || idToken;
        updatedName = upd.displayName || name;
      } catch {}
    }

    return res.json({
      uid: localId,
      email,
      name: updatedName,
      idToken,
      refreshToken: signup.refreshToken,
      expiresIn: signup.expiresIn,
      localId,
    });
  } catch (e) {
    const msg = e?.response?.data?.error?.message || e?.message || 'signup failed';
    return res.status(400).json({ error: msg });
  }
});

// Email/password login
r.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });

    const apiKey = process.env.FIREBASE_WEB_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'FIREBASE_WEB_API_KEY not configured' });
    const { data } = await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
      { email, password, returnSecureToken: true }
    );

    return res.json({
      idToken: data.idToken,
      refreshToken: data.refreshToken,
      expiresIn: data.expiresIn,
      localId: data.localId,
      email: data.email,
    });
  } catch (e) {
    const msg = e?.response?.data?.error?.message || e?.message || 'login failed';
    return res.status(400).json({ error: msg });
  }
});

// Verify token and return current user profile
r.get('/me', verifyFirebaseToken, async (req, res) => {
  // req.user is set by middleware
  return res.json({ user: req.user });
});

// Simple in-browser test UI for email/password auth
r.get('/test', (_req, res) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Auth Test</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 20px; }
    form { border: 1px solid #ddd; padding: 16px; border-radius: 8px; margin-bottom: 20px; max-width: 420px; }
    label { display: block; margin: 8px 0 4px; }
    input { width: 100%; padding: 8px; }
    button { margin-top: 12px; padding: 8px 12px; }
    pre { background: #f6f8fa; padding: 12px; border-radius: 6px; max-width: 800px; overflow: auto; }
    .row { display: flex; gap: 24px; flex-wrap: wrap; }
    .token { word-break: break-all; }
  </style>
</head>
<body>
  <h1>Auth Test (Email / Password)</h1>
  <div class="row">
    <form id="signup">
      <h3>Signup</h3>
      <label>Email</label>
      <input type="email" name="email" required />
      <label>Password</label>
      <input type="password" name="password" required />
      <label>Name (optional)</label>
      <input type="text" name="name" />
      <button type="submit">Create account</button>
      <div id="signup-status"></div>
      <pre id="signup-out"></pre>
    </form>

    <form id="login">
      <h3>Login</h3>
      <label>Email</label>
      <input type="email" name="email" required />
      <label>Password</label>
      <input type="password" name="password" required />
      <button type="submit">Login</button>
      <div id="login-status"></div>
      <pre id="login-out"></pre>
    </form>
  </div>

  <section>
    <h3>Me (using ID token)</h3>
    <p>After signup/login, the ID token will appear below. Click "Fetch Me" to verify.</p>
    <div class="token" id="token"></div>
    <button id="btn-me">Fetch Me</button>
    <pre id="me-out"></pre>
  </section>

  <script>
    const $ = (s) => document.querySelector(s);
    let idToken = null;

    function setStatus(el, msg, ok) {
      el.textContent = msg;
      el.style.color = ok ? 'green' : 'crimson';
    }

    async function api(path, body) {
      const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { data = { raw: text }; }
      if (!res.ok) throw Object.assign(new Error(data?.error || 'request failed'), { data, status: res.status });
      return data;
    }

    $('#signup').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.currentTarget;
      const email = f.email.value.trim();
      const password = f.password.value;
      const name = f.name.value.trim();
      const statusEl = $('#signup-status');
      const outEl = $('#signup-out');
      setStatus(statusEl, 'Submitting...', true);
      outEl.textContent = '';
      try {
        const data = await api('/api/auth/signup', { email, password, name });
        idToken = data.idToken;
        $('#token').textContent = idToken || '';
        setStatus(statusEl, 'Signup success', true);
        outEl.textContent = JSON.stringify(data, null, 2);
      } catch (e) {
        setStatus(statusEl, 'Signup failed: ' + (e.data?.error || e.message), false);
        outEl.textContent = JSON.stringify(e.data || { message: e.message }, null, 2);
      }
    });

    $('#login').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.currentTarget;
      const email = f.email.value.trim();
      const password = f.password.value;
      const statusEl = $('#login-status');
      const outEl = $('#login-out');
      setStatus(statusEl, 'Submitting...', true);
      outEl.textContent = '';
      try {
        const data = await api('/api/auth/login', { email, password });
        idToken = data.idToken;
        $('#token').textContent = idToken || '';
        setStatus(statusEl, 'Login success', true);
        outEl.textContent = JSON.stringify(data, null, 2);
      } catch (e) {
        setStatus(statusEl, 'Login failed: ' + (e.data?.error || e.message), false);
        outEl.textContent = JSON.stringify(e.data || { message: e.message }, null, 2);
      }
    });

    $('#btn-me').addEventListener('click', async () => {
      const outEl = $('#me-out');
      outEl.textContent = '';
      if (!idToken) { outEl.textContent = 'No token yet. Signup/Login first.'; return; }
      try {
        const res = await fetch('/api/auth/me', { headers: { 'Authorization': 'Bearer ' + idToken } });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'request failed');
        outEl.textContent = JSON.stringify(data, null, 2);
      } catch (e) {
        outEl.textContent = 'Me failed: ' + (e?.message || e);
      }
    });
  </script>
</body>
</html>`;
  res.type('html').send(html);
});

export default r;
